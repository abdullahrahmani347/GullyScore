import { db } from '@/lib/db';

export async function recalculate(inningsId: string): Promise<void> {
  const innings = await db.innings.findUniqueOrThrow({
    where: { id: inningsId },
    include: { balls: { orderBy: { deliveryNumber: 'asc' } } },
  });

  // Reset innings counters
  await db.innings.update({
    where: { id: inningsId },
    data: {
      runs: 0, wickets: 0, completedOvers: 0, currentBalls: 0,
      wideBalls: 0, noBalls: 0, byes: 0, legByes: 0,
    },
  });

  // Reset all BatsmanInnings
  const batting = await db.batsmanInnings.findMany({ where: { inningsId } });
  for (const b of batting) {
    await db.batsmanInnings.update({
      where: { id: b.id },
      data: { runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, dismissalType: null, dismissedByBowlerId: null, fielderPlayerId: null },
    });
  }

  // Reset all BowlerInnings
  const bowling = await db.bowlerInnings.findMany({ where: { inningsId } });
  for (const b of bowling) {
    await db.bowlerInnings.update({
      where: { id: b.id },
      data: { completedOvers: 0, balls: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0 },
    });
  }

  // Re-apply each ball
  for (const ball of innings.balls) {
    // Apply scoring logic for each ball sequentially
    const isWide = ball.extraType === 'WIDE';
    const isNoBall = ball.extraType === 'NO_BALL';
    const isBye = ball.extraType === 'BYE';
    const isLegBye = ball.extraType === 'LEG_BYE';
    const isLegalDelivery = ball.isLegalDelivery;
    const totalRuns = ball.runs + ball.extraRuns;
    const runsAgainstBowler = (isBye || isLegBye) ? 0 : totalRuns;

    // Get current innings state
    const currentInnings = await db.innings.findUniqueOrThrow({ where: { id: inningsId } });
    const currentLegalBalls = currentInnings.currentBalls;
    const newBallInOver = isLegalDelivery ? currentLegalBalls + 1 : 0;
    const isOverComplete = isLegalDelivery && newBallInOver === 6;

    // Update BatsmanInnings
    const batsmanDismissed = ball.isWicket && (ball.wicketType !== 'RUN_OUT' ? true : ball.dismissedPlayerId === ball.batsmanId);
    await db.batsmanInnings.upsert({
      where: { inningsId_playerId: { inningsId, playerId: ball.batsmanId } },
      create: {
        inningsId, playerId: ball.batsmanId, battingOrder: 99,
        runs: ball.runs, balls: isWide ? 0 : 1,
        fours: ball.runs === 4 && !isBye && !isLegBye ? 1 : 0,
        sixes: ball.runs === 6 && !isBye && !isLegBye ? 1 : 0,
        isOut: batsmanDismissed,
        dismissalType: batsmanDismissed ? ball.wicketType : null,
        dismissedByBowlerId: batsmanDismissed && !['RUN_OUT','RETIRED_HURT'].includes(ball.wicketType!) ? ball.bowlerId : null,
        fielderPlayerId: batsmanDismissed && ball.fielderPlayerId ? ball.fielderPlayerId : null,
      },
      update: {
        runs: { increment: ball.runs },
        balls: { increment: isWide ? 0 : 1 },
        fours: { increment: ball.runs === 4 && !isBye && !isLegBye ? 1 : 0 },
        sixes: { increment: ball.runs === 6 && !isBye && !isLegBye ? 1 : 0 },
        ...(batsmanDismissed ? { isOut: true, dismissalType: ball.wicketType, dismissedByBowlerId: !['RUN_OUT','RETIRED_HURT'].includes(ball.wicketType!) ? ball.bowlerId : null, fielderPlayerId: ball.fielderPlayerId ?? null } : {}),
      },
    });

    // Non-striker run-out
    if (ball.isWicket && ball.wicketType === 'RUN_OUT' && ball.dismissedPlayerId === ball.nonStrikerIdBefore) {
      await db.batsmanInnings.upsert({
        where: { inningsId_playerId: { inningsId, playerId: ball.nonStrikerIdBefore } },
        create: { inningsId, playerId: ball.nonStrikerIdBefore, battingOrder: 99, isOut: true, dismissalType: 'RUN_OUT' },
        update: { isOut: true, dismissalType: 'RUN_OUT' },
      });
    }

    // Update BowlerInnings
    const currentBowler = await db.bowlerInnings.findUnique({ where: { inningsId_playerId: { inningsId, playerId: ball.bowlerId } } });
    const bowlerCurrentBalls = currentBowler?.balls ?? 0;
    const bowlerNewBalls = isLegalDelivery ? (bowlerCurrentBalls + 1) % 6 : bowlerCurrentBalls;
    const bowlerOverComplete = isLegalDelivery && (bowlerCurrentBalls + 1) === 6;

    await db.bowlerInnings.upsert({
      where: { inningsId_playerId: { inningsId, playerId: ball.bowlerId } },
      create: {
        inningsId, playerId: ball.bowlerId,
        completedOvers: bowlerOverComplete ? 1 : 0, balls: bowlerNewBalls,
        runs: runsAgainstBowler,
        wickets: ball.isWicket && !['RUN_OUT','RETIRED_HURT'].includes(ball.wicketType!) ? 1 : 0,
        wides: isWide ? 1 : 0, noBalls: isNoBall ? 1 : 0,
      },
      update: {
        balls: bowlerNewBalls, runs: { increment: runsAgainstBowler },
        ...(bowlerOverComplete ? { completedOvers: { increment: 1 } } : {}),
        ...(ball.isWicket && !['RUN_OUT','RETIRED_HURT'].includes(ball.wicketType!) ? { wickets: { increment: 1 } } : {}),
        ...(isWide ? { wides: { increment: 1 } } : {}),
        ...(isNoBall ? { noBalls: { increment: 1 } } : {}),
      },
    });

    // Calculate new striker
    let newStrikerId = currentInnings.strikerId!;
    let newNonStrikerId = currentInnings.nonStrikerId!;
    if (isLegalDelivery) {
      if (ball.runs % 2 === 1) { [newStrikerId, newNonStrikerId] = [newNonStrikerId, newStrikerId]; }
      if (isOverComplete && ball.runs % 2 === 0) { [newStrikerId, newNonStrikerId] = [newNonStrikerId, newStrikerId]; }
    }
    if (batsmanDismissed) { newStrikerId = newNonStrikerId; newNonStrikerId = ''; }

    const newCurrentBalls = isOverComplete ? 0 : (isLegalDelivery ? currentLegalBalls + 1 : currentLegalBalls);
    const newCompletedOvers = currentInnings.completedOvers + (isOverComplete ? 1 : 0);

    await db.innings.update({
      where: { id: inningsId },
      data: {
        runs: { increment: totalRuns },
        wickets: { increment: ball.isWicket ? 1 : 0 },
        completedOvers: newCompletedOvers,
        currentBalls: newCurrentBalls,
        wideBalls: { increment: isWide ? 1 : 0 },
        noBalls: { increment: isNoBall ? 1 : 0 },
        byes: { increment: isBye ? ball.extraRuns : 0 },
        legByes: { increment: isLegBye ? ball.extraRuns : 0 },
        strikerId: newStrikerId || null,
        nonStrikerId: newNonStrikerId || null,
      },
    });
  }
}
