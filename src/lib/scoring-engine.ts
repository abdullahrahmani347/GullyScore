import { db } from '@/lib/db';
import type { RecordBallInput, RecordBallResponse } from '@/types';
import { calculateCRR, calculateRRR } from './scoring-utils';
import { updatePartnershipOnBall, rebuildPartnerships } from './partnerships';

export async function recordBall(
  inningsId: string,
  input: RecordBallInput
): Promise<RecordBallResponse> {
  const innings = await db.innings.findUniqueOrThrow({
    where: { id: inningsId },
    include: {
      match: true,
      batting: true,
      bowling: true,
      balls: { orderBy: { deliveryNumber: 'desc' }, take: 1 },
    },
  });

  const {
    batsmanId, bowlerId, runs, isWicket, wicketType,
    dismissedPlayerId, fielderPlayerId, extraType, extraRuns,
  } = input;

  const isWide = extraType === 'WIDE';
  const isNoBall = extraType === 'NO_BALL';
  const isBye = extraType === 'BYE';
  const isLegBye = extraType === 'LEG_BYE';
  const isLegalDelivery = !isWide && !isNoBall;
  const totalRuns = runs + extraRuns;
  const runsAgainstBowler = (isBye || isLegBye) ? 0 : totalRuns;

  const currentLegalBalls = innings.currentBalls;
  const newBallInOver = isLegalDelivery ? currentLegalBalls + 1 : 0;
  const isOverComplete = isLegalDelivery && newBallInOver === 6;

  const lastDelivery = innings.balls[0];
  const nextDeliveryNumber = (lastDelivery?.deliveryNumber ?? 0) + 1;

  // 1. Create Ball record
  const ball = await db.ball.create({
    data: {
      inningsId,
      overNumber: innings.completedOvers,
      ballInOver: isLegalDelivery ? newBallInOver : 0,
      deliveryNumber: nextDeliveryNumber,
      batsmanId,
      bowlerId,
      runs,
      isWicket,
      wicketType: isWicket ? wicketType : null,
      dismissedPlayerId: isWicket ? dismissedPlayerId : null,
      fielderPlayerId: (isWicket && fielderPlayerId) ? fielderPlayerId : null,
      extraType: extraType ?? null,
      extraRuns,
      isLegalDelivery,
      strikerIdBefore: innings.strikerId!,
      nonStrikerIdBefore: innings.nonStrikerId!,
    },
  });

  // 2. Update BatsmanInnings (striker)
  const batsmanDismissed = isWicket && (
    wicketType !== 'RUN_OUT'
      ? true
      : dismissedPlayerId === batsmanId
  );

  const existingBatsman = await db.batsmanInnings.findUnique({
    where: { inningsId_playerId: { inningsId, playerId: batsmanId } }
  });

  if (existingBatsman) {
    await db.batsmanInnings.update({
      where: { inningsId_playerId: { inningsId, playerId: batsmanId } },
      data: {
        runs: { increment: runs },
        balls: { increment: isWide ? 0 : 1 },
        fours: { increment: runs === 4 && !isBye && !isLegBye ? 1 : 0 },
        sixes: { increment: runs === 6 && !isBye && !isLegBye ? 1 : 0 },
        ...(batsmanDismissed ? {
          isOut: true,
          dismissalType: wicketType,
          dismissedByBowlerId: batsmanDismissed && !['RUN_OUT','RETIRED_HURT'].includes(wicketType!) ? bowlerId : null,
          fielderPlayerId: fielderPlayerId ?? null,
        } : {}),
      },
    });
  } else {
    await db.batsmanInnings.create({
      data: {
        inningsId, playerId: batsmanId, battingOrder: 99,
        runs: runs,
        balls: isWide ? 0 : 1,
        fours: runs === 4 && !isBye && !isLegBye ? 1 : 0,
        sixes: runs === 6 && !isBye && !isLegBye ? 1 : 0,
        isOut: batsmanDismissed,
        dismissalType: batsmanDismissed ? wicketType : null,
        dismissedByBowlerId: batsmanDismissed && !['RUN_OUT','RETIRED_HURT'].includes(wicketType!) ? bowlerId : null,
        fielderPlayerId: batsmanDismissed && fielderPlayerId ? fielderPlayerId : null,
      },
    });
  }

  // Handle run-out of non-striker
  if (isWicket && wicketType === 'RUN_OUT' && dismissedPlayerId === innings.nonStrikerId) {
    const existingNonStriker = await db.batsmanInnings.findUnique({
      where: { inningsId_playerId: { inningsId, playerId: innings.nonStrikerId! } }
    });
    if (existingNonStriker) {
      await db.batsmanInnings.update({
        where: { inningsId_playerId: { inningsId, playerId: innings.nonStrikerId! } },
        data: { isOut: true, dismissalType: 'RUN_OUT' },
      });
    } else {
      await db.batsmanInnings.create({
        data: {
          inningsId, playerId: innings.nonStrikerId!, battingOrder: 99,
          isOut: true, dismissalType: 'RUN_OUT',
        },
      });
    }
  }

  // 3. Update BowlerInnings
  const currentBowler = innings.bowling.find(b => b.playerId === bowlerId);
  const bowlerCurrentBalls = currentBowler?.balls ?? 0;
  const bowlerNewBalls = isLegalDelivery ? (bowlerCurrentBalls + 1) % 6 : bowlerCurrentBalls;
  const bowlerOverComplete = isLegalDelivery && (bowlerCurrentBalls + 1) === 6;

  // Track maidens: a maiden over is one where the bowler conceded 0 runs across all 6 legal deliveries
  // We track runs in the current over to determine if it's a maiden when the over completes
  let isMaidenOver = false;
  if (bowlerOverComplete) {
    // Get all balls in the current over for this bowler to check if it's a maiden
    const overBalls = await db.ball.findMany({
      where: {
        inningsId,
        bowlerId,
        overNumber: innings.completedOvers,
      },
    });
    const bowlerRunsInOver = overBalls.reduce((sum, b) => {
      const bIsBye = b.extraType === 'BYE';
      const bIsLegBye = b.extraType === 'LEG_BYE';
      return sum + ((bIsBye || bIsLegBye) ? 0 : (b.runs + b.extraRuns));
    }, 0);
    isMaidenOver = bowlerRunsInOver === 0;
  }

  const existingBowler = await db.bowlerInnings.findUnique({
    where: { inningsId_playerId: { inningsId, playerId: bowlerId } }
  });

  if (existingBowler) {
    await db.bowlerInnings.update({
      where: { inningsId_playerId: { inningsId, playerId: bowlerId } },
      data: {
        balls: bowlerNewBalls,
        runs: { increment: runsAgainstBowler },
        ...(bowlerOverComplete ? { completedOvers: { increment: 1 } } : {}),
        ...(isMaidenOver ? { maidens: { increment: 1 } } : {}),
        ...(isWicket && !['RUN_OUT','RETIRED_HURT'].includes(wicketType!) ? { wickets: { increment: 1 } } : {}),
        ...(isWide ? { wides: { increment: 1 } } : {}),
        ...(isNoBall ? { noBalls: { increment: 1 } } : {}),
      },
    });
  } else {
    await db.bowlerInnings.create({
      data: {
        inningsId, playerId: bowlerId,
        completedOvers: bowlerOverComplete ? 1 : 0,
        balls: bowlerNewBalls,
        maidens: isMaidenOver ? 1 : 0,
        runs: runsAgainstBowler,
        wickets: isWicket && !['RUN_OUT','RETIRED_HURT'].includes(wicketType!) ? 1 : 0,
        wides: isWide ? 1 : 0,
        noBalls: isNoBall ? 1 : 0,
      },
    });
  }

  // 4. Update Innings state
  const newCurrentBalls = isOverComplete ? 0 : (isLegalDelivery ? currentLegalBalls + 1 : currentLegalBalls);
  const newCompletedOvers = innings.completedOvers + (isOverComplete ? 1 : 0);
  const newWickets = innings.wickets + (isWicket ? 1 : 0);
  const newRuns = innings.runs + totalRuns;

  // 5. Calculate new striker
  let newStrikerId = innings.strikerId!;
  let newNonStrikerId = innings.nonStrikerId!;

  if (isLegalDelivery) {
    if (runs % 2 === 1) {
      [newStrikerId, newNonStrikerId] = [newNonStrikerId, newStrikerId];
    }
    if (isOverComplete) {
      if (runs % 2 === 0) {
        [newStrikerId, newNonStrikerId] = [newNonStrikerId, newStrikerId];
      }
    }
  }

  if (batsmanDismissed) {
    // The dismissed batsman was the striker — surviving batsman becomes striker
    newStrikerId = newNonStrikerId;
    newNonStrikerId = '';
  }

  // If run-out dismisses the non-striker, the original striker stays as striker
  if (isWicket && wicketType === 'RUN_OUT' && dismissedPlayerId === innings.nonStrikerId) {
    newStrikerId = innings.strikerId!;
    newNonStrikerId = '';
  }

  // 6. Persist innings state
  await db.innings.update({
    where: { id: inningsId },
    data: {
      runs: newRuns,
      wickets: newWickets,
      completedOvers: newCompletedOvers,
      currentBalls: newCurrentBalls,
      wideBalls: { increment: isWide ? 1 : 0 },
      noBalls: { increment: isNoBall ? 1 : 0 },
      byes: { increment: isBye ? extraRuns : 0 },
      legByes: { increment: isLegBye ? extraRuns : 0 },
      strikerId: newStrikerId || null,
      nonStrikerId: newNonStrikerId || null,
    },
  });

  // 6b. Check innings completion and persist isCompleted on the innings record
  const match = innings.match;
  const isInningsComplete =
    newWickets >= match.maxWickets ||
    (newCompletedOvers >= match.totalOvers && newCurrentBalls === 0) ||
    (innings.inningsNumber === 2 && innings.target != null && newRuns >= innings.target);

  if (isInningsComplete) {
    await db.innings.update({
      where: { id: inningsId },
      data: { isCompleted: true },
    });
  }

  // 6c. Update match.currentInnings if this is the 2nd innings starting
  if (innings.inningsNumber === 2 && match.currentInnings !== 2) {
    await db.match.update({
      where: { id: match.id },
      data: { currentInnings: 2 },
    });
  }

  // 7. Update partnership tracking (using already-computed isInningsComplete from step 6b)
  // match is already available from innings.match

  // 8. Update partnership tracking
  await updatePartnershipOnBall(inningsId, {
    ballId: ball.id,
    strikerIdBefore: innings.strikerId!,
    nonStrikerIdBefore: innings.nonStrikerId!,
    runs: totalRuns,
    isLegalDelivery,
    isWicket,
    newStrikerId,
    newNonStrikerId,
    isInningsComplete,
  });

  const ballsRemaining = innings.inningsNumber === 2 && innings.target != null
    ? (match.totalOvers * 6) - (newCompletedOvers * 6 + newCurrentBalls)
    : null;

  return {
    ball: ball as any,
    inningsState: {
      runs: newRuns,
      wickets: newWickets,
      completedOvers: newCompletedOvers,
      currentBalls: newCurrentBalls,
      currentRunRate: calculateCRR(newRuns, newCompletedOvers, newCurrentBalls),
      requiredRunRate: innings.target
        ? calculateRRR(innings.target - newRuns, match.totalOvers, newCompletedOvers, newCurrentBalls)
        : null,
      runsNeeded: innings.target ? innings.target - newRuns : null,
      ballsRemaining,
      isCompleted: isInningsComplete,
      isOverComplete,
    },
    strikerUpdate: { strikerId: newStrikerId, nonStrikerId: newNonStrikerId },
    needsNewBatsman: isWicket && !isInningsComplete,
    needsNewBowler: isOverComplete && !isInningsComplete,
    needsInningsBreak: isInningsComplete && innings.inningsNumber === 1,
    isMatchComplete: isInningsComplete && innings.inningsNumber === 2,
  };
}

export async function undoLastBall(inningsId: string): Promise<{ success: boolean }> {
  const lastBall = await db.ball.findFirst({
    where: { inningsId },
    orderBy: { deliveryNumber: 'desc' },
  });
  if (!lastBall) return { success: false };

  const innings = await db.innings.findUniqueOrThrow({ where: { id: inningsId }, include: { match: true } });

  const isWide = lastBall.extraType === 'WIDE';
  const isNoBall = lastBall.extraType === 'NO_BALL';
  const isBye = lastBall.extraType === 'BYE';
  const isLegBye = lastBall.extraType === 'LEG_BYE';
  const totalRuns = lastBall.runs + lastBall.extraRuns;
  const runsAgainstBowler = (isBye || isLegBye) ? 0 : totalRuns;

  // Reverse BatsmanInnings
  await db.batsmanInnings.update({
    where: { inningsId_playerId: { inningsId, playerId: lastBall.batsmanId } },
    data: {
      runs: { decrement: lastBall.runs },
      balls: { decrement: isWide ? 0 : 1 },
      fours: { decrement: lastBall.runs === 4 && !isBye && !isLegBye ? 1 : 0 },
      sixes: { decrement: lastBall.runs === 6 && !isBye && !isLegBye ? 1 : 0 },
      ...(lastBall.isWicket ? { isOut: false, dismissalType: null, dismissedByBowlerId: null, fielderPlayerId: null } : {}),
    },
  });

  // Reverse non-striker run-out
  if (lastBall.isWicket && lastBall.wicketType === 'RUN_OUT' && lastBall.dismissedPlayerId === lastBall.nonStrikerIdBefore) {
    await db.batsmanInnings.update({
      where: { inningsId_playerId: { inningsId, playerId: lastBall.nonStrikerIdBefore } },
      data: { isOut: false, dismissalType: null },
    });
  }

  // Reverse BowlerInnings
  const bowlerInnings = await db.bowlerInnings.findUnique({
    where: { inningsId_playerId: { inningsId, playerId: lastBall.bowlerId } },
  });
  if (bowlerInnings) {
    const wasOverBall = lastBall.isLegalDelivery && lastBall.ballInOver === 6;
    await db.bowlerInnings.update({
      where: { inningsId_playerId: { inningsId, playerId: lastBall.bowlerId } },
      data: {
        runs: { decrement: runsAgainstBowler },
        balls: wasOverBall ? 0 : { decrement: lastBall.isLegalDelivery ? 1 : 0 },
        ...(wasOverBall ? { completedOvers: { decrement: 1 }, balls: 5 } : {}),
        ...(lastBall.isWicket && !['RUN_OUT','RETIRED_HURT'].includes(lastBall.wicketType ?? '') ? { wickets: { decrement: 1 } } : {}),
        ...(isWide ? { wides: { decrement: 1 } } : {}),
        ...(isNoBall ? { noBalls: { decrement: 1 } } : {}),
      },
    });
  }

  // Reverse Innings
  const wasOverComplete = lastBall.isLegalDelivery && lastBall.ballInOver === 6;
  const restoredBalls = wasOverComplete ? 5 : (lastBall.isLegalDelivery ? Math.max(0, innings.currentBalls - 1) : innings.currentBalls);
  const restoredCompletedOvers = innings.completedOvers - (wasOverComplete ? 1 : 0);

  await db.innings.update({
    where: { id: inningsId },
    data: {
      runs: { decrement: totalRuns },
      wickets: { decrement: lastBall.isWicket ? 1 : 0 },
      completedOvers: restoredCompletedOvers,
      currentBalls: restoredBalls,
      wideBalls: { decrement: isWide ? 1 : 0 },
      noBalls: { decrement: isNoBall ? 1 : 0 },
      byes: { decrement: isBye ? lastBall.extraRuns : 0 },
      legByes: { decrement: isLegBye ? lastBall.extraRuns : 0 },
      strikerId: lastBall.strikerIdBefore,
      nonStrikerId: lastBall.nonStrikerIdBefore,
    },
  });

  // Delete Ball record
  await db.ball.delete({ where: { id: lastBall.id } });

  // Rebuild partnerships from scratch after undo
  await rebuildPartnerships(inningsId);

  return { success: true };
}
