/**
 * Partnership Tracking Engine
 *
 * Partnerships are computed from the Ball log. The algorithm:
 *
 * INCREMENTAL MODE (during live scoring):
 * - When a ball is recorded, the current open partnership gets its runs/balls incremented.
 * - When a wicket falls, the partnership is closed and a new one opens when the next batsman walks in.
 * - When the innings ends, any open partnership is closed.
 *
 * REBUILD MODE (for undo, recalculate, or initial migration):
 * - Deletes all partnerships for an innings and recomputes from the Ball log.
 *
 * This is 100% computable from Ball records. Zero scorer input required.
 */

import { db } from '@/lib/db';

// ─── Incremental Update ─────────────────────────────────────────

interface PartnershipBallUpdate {
  ballId: string;
  strikerIdBefore: string;
  nonStrikerIdBefore: string;
  runs: number;
  isLegalDelivery: boolean;
  isWicket: boolean;
  newStrikerId: string;
  newNonStrikerId: string;
  isInningsComplete: boolean;
}

/**
 * Update partnerships after a ball is recorded.
 *
 * - Finds the current open partnership for this innings
 * - If none exists, creates one with the current batsman pair
 * - Increments runs and balls
 * - If wicket falls, closes the partnership
 * - If innings is complete, closes the open partnership
 */
export async function updatePartnershipOnBall(
  inningsId: string,
  update: PartnershipBallUpdate
): Promise<void> {
  const { ballId, strikerIdBefore, nonStrikerIdBefore, runs, isLegalDelivery, isWicket, newStrikerId, newNonStrikerId, isInningsComplete } = update;

  // Normalize the pair: lower ID first for consistency
  const pairKey = (a: string, b: string): [string, string] => a < b ? [a, b] : [b, a];
  const [b1, b2] = pairKey(strikerIdBefore, nonStrikerIdBefore);

  // Find or create the current open partnership
  let openPartnership = await db.partnership.findFirst({
    where: { inningsId, isOpen: true },
  });

  if (!openPartnership) {
    // No open partnership — create one (e.g., first ball of innings)
    const wicketCount = await db.partnership.count({
      where: { inningsId, isOpen: false },
    });

    openPartnership = await db.partnership.create({
      data: {
        inningsId,
        batsman1Id: b1,
        batsman2Id: b2,
        runs: 0,
        balls: 0,
        wicketNumber: 0,
        openingBallId: ballId,
        closingBallId: null,
        isOpen: true,
      },
    });
  }

  // Increment runs and balls for the current partnership
  await db.partnership.update({
    where: { id: openPartnership.id },
    data: {
      runs: { increment: runs },
      balls: { increment: isLegalDelivery ? 1 : 0 },
    },
  });

  // If wicket falls, close this partnership
  if (isWicket) {
    const wicketCount = await db.partnership.count({
      where: { inningsId, isOpen: false },
    });

    await db.partnership.update({
      where: { id: openPartnership.id },
      data: {
        wicketNumber: wicketCount + 1,
        closingBallId: ballId,
        isOpen: false,
      },
    });

    // If innings is not complete, create a placeholder open partnership
    // for the new batsman pair. This prevents the "no current partnership"
    // flicker between wicket and next ball. The pair will be updated
    // when the new batsman is set via setStriker.
    if (!isInningsComplete && newStrikerId && newNonStrikerId) {
      const [nb1, nb2] = pairKey(newStrikerId, newNonStrikerId);
      // Only create if we have both batsman IDs
      if (nb1 && nb2) {
        await db.partnership.create({
          data: {
            inningsId,
            batsman1Id: nb1,
            batsman2Id: nb2,
            runs: 0,
            balls: 0,
            wicketNumber: 0,
            openingBallId: ballId,
            closingBallId: null,
            isOpen: true,
          },
        });
      }
    }

    return;
  }

  // If innings is complete (all out, overs finished, or target chased)
  if (isInningsComplete) {
    const wicketCount = await db.partnership.count({
      where: { inningsId, isOpen: false },
    });

    await db.partnership.update({
      where: { id: openPartnership.id },
      data: {
        wicketNumber: wicketCount + 1,
        closingBallId: ballId,
        isOpen: false,
      },
    });
  }
}

// ─── Full Rebuild ────────────────────────────────────────────────

/**
 * Rebuild all partnerships for an innings from its ball data.
 * Used after undo, recalculate, or for initial migration.
 *
 * Algorithm: walk the Ball log in delivery order, tracking the
 * current pair of batsmen at the crease. When a wicket falls,
 * close the partnership. When the pair changes without a wicket
 * (new batsman walked in), close and open a new one.
 */
export async function rebuildPartnerships(inningsId: string): Promise<void> {
  const innings = await db.innings.findUniqueOrThrow({
    where: { id: inningsId },
    include: {
      balls: { orderBy: { deliveryNumber: 'asc' } },
    },
  });

  // Delete existing partnerships
  await db.partnership.deleteMany({ where: { inningsId } });

  const balls = innings.balls;
  if (balls.length === 0) return;

  const pairKey = (a: string, b: string): [string, string] => a < b ? [a, b] : [b, a];

  // Track current partnership state
  let currentPair: [string, string] | null = null;
  let currentRuns = 0;
  let currentBalls = 0;
  let openBallId = '';
  let wicketNumber = 0;

  for (let i = 0; i < balls.length; i++) {
    const ball = balls[i];
    const striker = ball.strikerIdBefore;
    const nonStriker = ball.nonStrikerIdBefore;
    const totalRuns = ball.runs + ball.extraRuns;
    const actualPair = pairKey(striker, nonStriker);

    // If no current partnership, start one
    if (!currentPair) {
      currentPair = actualPair;
      openBallId = ball.id;
      currentRuns = 0;
      currentBalls = 0;
    } else if (actualPair[0] !== currentPair[0] || actualPair[1] !== currentPair[1]) {
      // The pair changed without a wicket — new batsman walked in
      // Close the current partnership (not ended by wicket, wicketNumber stays 0)
      if (currentRuns > 0 || currentBalls > 0) {
        await db.partnership.create({
          data: {
            inningsId,
            batsman1Id: currentPair[0],
            batsman2Id: currentPair[1],
            runs: currentRuns,
            balls: currentBalls,
            wicketNumber: 0,
            openingBallId: openBallId,
            closingBallId: balls[i - 1]?.id || ball.id,
            isOpen: false,
          },
        });
      }

      // Start new partnership
      currentPair = actualPair;
      openBallId = ball.id;
      currentRuns = 0;
      currentBalls = 0;
    }

    // Accumulate
    currentRuns += totalRuns;
    currentBalls += ball.isLegalDelivery ? 1 : 0;

    // Wicket ends the partnership
    if (ball.isWicket) {
      wicketNumber++;

      await db.partnership.create({
        data: {
          inningsId,
          batsman1Id: currentPair[0],
          batsman2Id: currentPair[1],
          runs: currentRuns,
          balls: currentBalls,
          wicketNumber,
          openingBallId: openBallId,
          closingBallId: ball.id,
          isOpen: false,
        },
      });

      // Reset for next partnership
      currentPair = null;
      currentRuns = 0;
      currentBalls = 0;
    }
  }

  // Handle remaining open partnership
  if (currentPair && (currentRuns > 0 || currentBalls > 0)) {
    const isInningsComplete = innings.isCompleted;

    await db.partnership.create({
      data: {
        inningsId,
        batsman1Id: currentPair[0],
        batsman2Id: currentPair[1],
        runs: currentRuns,
        balls: currentBalls,
        wicketNumber: isInningsComplete ? wicketNumber + 1 : 0,
        openingBallId: openBallId,
        closingBallId: isInningsComplete ? balls[balls.length - 1].id : null,
        isOpen: !isInningsComplete,
      },
    });
  }
}
