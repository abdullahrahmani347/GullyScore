/**
 * GULLYSCORE v2 §11.2 — recalculate.ts as a THIN DB WRITER around fold()
 * ---------------------------------------------------------------------------
 * v1 re-applied every ball one-by-one with a DB round-trip per ball (~3
 * queries × N balls) and had two defects: it never reset/recomputed MAIDENS
 * (stale values survived a recalculation) and it re-derived the striker
 * state starting from the CURRENT pair instead of the opening pair.
 *
 * v2 computes the full innings state ONCE in memory with the pure engine
 * (src/lib/engine.ts — the single source of truth) and writes the final
 * aggregates. Behaviour for all counters is identical to v1's recordBall
 * path (proven by the golden-fixture suite); the maiden + striker defects
 * are fixed as a side effect of deriving from the event log.
 *
 * See docs/release-notes.md — "v2 §11.2 milestone" for the documented diff.
 */

import { db } from '@/lib/db';
import { fold, parseMatchRules } from './engine';
import { hydrateEvents } from './scoring-engine';
import { rebuildPartnerships } from './partnerships';

/**
 * Load the effective rules for an innings (v2 §12.10): Match.rules JSON over
 * the v1-parity base. Legacy matches (rules null) fold with v1 semantics.
 */
export async function loadRules(inningsId: string) {
  const innings = await db.innings.findUniqueOrThrow({
    where: { id: inningsId },
    include: { match: true },
  });
  return {
    innings,
    rules: parseMatchRules(innings.match.rules, {
      maxWickets: innings.match.maxWickets,
      totalOvers: innings.match.totalOvers,
      inningsNumber: innings.inningsNumber,
      target: innings.target,
    }),
  };
}

export async function recalculate(inningsId: string): Promise<void> {
  const innings = await db.innings.findUniqueOrThrow({
    where: { id: inningsId },
    include: {
      match: true,
      balls: { orderBy: { deliveryNumber: 'asc' } },
      batting: true,
      bowling: true,
    },
  });

  // --- Derive everything from the event log (pure, no DB round-trips) -----
  // v2 §12.10: rules come from Match.rules (null = v1 parity). Tombstoned
  // events are skipped by fold(); PENALTY events are accounted as extras.
  const rules = parseMatchRules(innings.match.rules, {
    maxWickets: innings.match.maxWickets,
    totalOvers: innings.match.totalOvers,
    inningsNumber: innings.inningsNumber,
    target: innings.target,
  });
  const state = fold(hydrateEvents(innings.balls), rules);

  // --- Write innings counters ----------------------------------------------
  await db.innings.update({
    where: { id: inningsId },
    data: {
      runs: state.runs,
      wickets: state.wickets,
      completedOvers: state.completedOvers,
      currentBalls: state.currentBalls,
      wideBalls: state.wideBalls,
      noBalls: state.noBalls,
      byes: state.byes,
      legByes: state.legByes,
      strikerId: state.strikerId,
      nonStrikerId: state.nonStrikerId,
      isCompleted: state.inningsComplete,
    },
  });

  // --- Write batting rows (preserve existing battingOrder) -----------------
  const orderMap = new Map(innings.batting.map((b) => [b.playerId, b.battingOrder]));
  for (const [playerId, s] of Object.entries(state.batting)) {
    await db.batsmanInnings.upsert({
      where: { inningsId_playerId: { inningsId, playerId } },
      create: {
        inningsId,
        playerId,
        battingOrder: orderMap.get(playerId) ?? 99,
        runs: s.runs,
        balls: s.balls,
        fours: s.fours,
        sixes: s.sixes,
        isOut: s.isOut,
        dismissalType: s.dismissalType,
        dismissedByBowlerId: s.dismissedByBowlerId,
        fielderPlayerId: s.fielderPlayerId,
      },
      update: {
        runs: s.runs,
        balls: s.balls,
        fours: s.fours,
        sixes: s.sixes,
        isOut: s.isOut,
        dismissalType: s.dismissalType,
        dismissedByBowlerId: s.dismissedByBowlerId,
        fielderPlayerId: s.fielderPlayerId,
      },
    });
  }

  // --- Write bowling rows ----------------------------------------------------
  for (const [playerId, s] of Object.entries(state.bowling)) {
    await db.bowlerInnings.upsert({
      where: { inningsId_playerId: { inningsId, playerId } },
      create: {
        inningsId,
        playerId,
        completedOvers: s.completedOvers,
        balls: s.balls,
        maidens: s.maidens,
        runs: s.runs,
        wickets: s.wickets,
        wides: s.wides,
        noBalls: s.noBalls,
      },
      update: {
        completedOvers: s.completedOvers,
        balls: s.balls,
        maidens: s.maidens,
        runs: s.runs,
        wickets: s.wickets,
        wides: s.wides,
        noBalls: s.noBalls,
      },
    });
  }

  // Rows present in the DB but absent from the folded state (should not
  // happen, but mirrors v1's "reset everything" semantics): zero them out.
  for (const row of innings.batting) {
    if (state.batting[row.playerId]) continue;
    await db.batsmanInnings.update({
      where: { id: row.id },
      data: {
        runs: 0, balls: 0, fours: 0, sixes: 0,
        isOut: false, dismissalType: null, dismissedByBowlerId: null, fielderPlayerId: null,
      },
    });
  }
  for (const row of innings.bowling) {
    if (state.bowling[row.playerId]) continue;
    await db.bowlerInnings.update({
      where: { id: row.id },
      data: { completedOvers: 0, balls: 0, maidens: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0 },
    });
  }

  // --- Partnerships remain event-sourced via their own rebuild --------------
  await rebuildPartnerships(inningsId);
}
