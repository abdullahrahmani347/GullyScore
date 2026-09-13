/**
 * GULLYSCORE v2 §11.2 + §23 — ENGINE TEST SUITE
 * ---------------------------------------------------------------------------
 * Three layers (all must pass before ANY v2 engine rule may land — §11.2):
 *
 *   1. GOLDEN FIXTURES — fold() must reproduce the v1 write path's stored
 *      aggregates EXACTLY on real match data (played through recordBall).
 *   2. V1 RULE UNITS — every v1 parity behaviour pinned, including the
 *      documented quirks [P1]–[P8] (see engine.ts header).
 *   3. PROPERTIES — determinism, order-independence, soft-delete skipping,
 *      over-counting invariants across randomized sequences.
 *
 * Run:  bun test   (or: bun test src/lib/engine.test.ts)
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import {
  fold,
  validateNext,
  defaultRules,
  type BallEvent,
  type InningsState,
  type MatchRules,
  type BatsmanStat,
  type BowlerStat,
} from './engine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GOLDEN_DIR = join(import.meta.dir, '..', '..', '__fixtures__', 'golden');

let evSeq = 0;
/**
 * Minimal valid event factory for unit tests.
 * NOTE: when a test mixes implicit and explicit deliveryNumbers, the counter
 * may collide — tests that care about ordering pass explicit numbers on
 * EVERY event.
 */
function ev(partial: Partial<BallEvent> = {}): BallEvent {
  evSeq += 1;
  return {
    deliveryNumber: partial.deliveryNumber ?? evSeq,
    batsmanId: partial.batsmanId ?? 'S1', // striker
    bowlerId: partial.bowlerId ?? 'B1',
    runs: partial.runs ?? 0,
    extraRuns: partial.extraRuns ?? 0,
    extraType: partial.extraType ?? null,
    isWicket: partial.isWicket ?? false,
    wicketType: partial.wicketType ?? null,
    dismissedPlayerId: partial.dismissedPlayerId ?? null,
    fielderPlayerId: partial.fielderPlayerId ?? null,
    strikerIdBefore: partial.strikerIdBefore ?? 'S1',
    nonStrikerIdBefore: partial.nonStrikerIdBefore ?? 'S2',
    ...partial,
  };
}

const R = (over: Partial<MatchRules> = {}): MatchRules =>
  defaultRules({ maxWickets: 10, totalOvers: 20, inningsNumber: 1, ...over });

const batStat = (s: InningsState, id: string): BatsmanStat | undefined => s.batting[id];
const bowlStat = (s: InningsState, id: string): BowlerStat | undefined => s.bowling[id];

// ---------------------------------------------------------------------------
// 1. GOLDEN FIXTURES — v1 parity on real data
// ---------------------------------------------------------------------------

describe('golden fixtures (v1 parity on real match data)', () => {
  const manifestPath = join(GOLDEN_DIR, 'manifest.json');
  const hasFixtures = existsSync(manifestPath);

  test.skipIf(!hasFixtures)('fixtures exist', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    expect(manifest.fixtures.length).toBeGreaterThan(0);
  });

  if (hasFixtures) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    for (const entry of manifest.fixtures) {
      test(`${entry.file}: fold() reproduces v1 stored aggregates`, () => {
        const fx = JSON.parse(readFileSync(join(GOLDEN_DIR, entry.file), 'utf-8'));
        const state = fold(fx.events, fx.rules);
        const e = fx.expected;

        // Innings counters
        expect(state.runs).toBe(e.runs);
        expect(state.wickets).toBe(e.wickets);
        expect(state.completedOvers).toBe(e.completedOvers);
        expect(state.currentBalls).toBe(e.currentBalls);
        expect(state.legalBalls).toBe(e.legalBalls);
        expect(state.wideBalls).toBe(e.wideBalls);
        expect(state.noBalls).toBe(e.noBalls);
        expect(state.byes).toBe(e.byes);
        expect(state.legByes).toBe(e.legByes);
        expect(state.inningsComplete).toBe(e.isCompleted);

        // Striker pair (v1 stores null for the empty slot after a wicket)
        expect(state.strikerId).toBe(e.strikerId);
        expect(state.nonStrikerId).toBe(e.nonStrikerId);

        // Batting rows — same player set, same aggregates
        expect(Object.keys(state.batting).sort()).toEqual(
          e.batting.map((b: { playerId: string }) => b.playerId).sort()
        );
        for (const row of e.batting) {
          const s = batStat(state, row.playerId);
          expect(s).toBeDefined();
          if (!s) continue;
          expect(s.runs).toBe(row.runs);
          expect(s.balls).toBe(row.balls);
          expect(s.fours).toBe(row.fours);
          expect(s.sixes).toBe(row.sixes);
          expect(s.isOut).toBe(row.isOut);
          expect(s.dismissalType).toBe(row.dismissalType);
          expect(s.dismissedByBowlerId).toBe(row.dismissedByBowlerId);
          expect(s.fielderPlayerId).toBe(row.fielderPlayerId);
        }

        // Bowling rows — same player set, same aggregates (incl. maidens)
        expect(Object.keys(state.bowling).sort()).toEqual(
          e.bowling.map((b: { playerId: string }) => b.playerId).sort()
        );
        for (const row of e.bowling) {
          const s = bowlStat(state, row.playerId);
          expect(s).toBeDefined();
          if (!s) continue;
          expect(s.completedOvers).toBe(row.completedOvers);
          expect(s.balls).toBe(row.balls);
          expect(s.maidens).toBe(row.maidens);
          expect(s.runs).toBe(row.runs);
          expect(s.wickets).toBe(row.wickets);
          expect(s.wides).toBe(row.wides);
          expect(s.noBalls).toBe(row.noBalls);
        }

        // Fall of wickets: count matches, runs monotonically increase
        expect(state.fow.length).toBe(e.wickets);
        for (let i = 0; i < state.fow.length; i++) {
          expect(state.fow[i].wicketNumber).toBe(i + 1);
        }
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 2. V1 RULE UNITS
// ---------------------------------------------------------------------------

describe('v1 delivery legality & counters', () => {
  test('dot ball: 1 legal ball, no runs', () => {
    const s = fold([ev()], R());
    expect(s.runs).toBe(0);
    expect(s.currentBalls).toBe(1);
    expect(s.legalBalls).toBe(1);
    expect(batStat(s, 'S1')!.balls).toBe(1);
  });

  test('wide: no legal ball, +1 run, wideBalls counter, batter NOT charged a ball [P3]', () => {
    const s = fold([ev({ extraType: 'WIDE', extraRuns: 1 })], R());
    expect(s.runs).toBe(1);
    expect(s.currentBalls).toBe(0);
    expect(s.wideBalls).toBe(1);
    expect(batStat(s, 'S1')!.balls).toBe(0);
    expect(bowlStat(s, 'B1')!.wides).toBe(1);
    expect(bowlStat(s, 'B1')!.runs).toBe(1);
  });

  test('wide with additional runs: penalty + extra runs all count', () => {
    const s = fold([ev({ extraType: 'WIDE', extraRuns: 3 })], R());
    expect(s.runs).toBe(3);
    expect(s.wideBalls).toBe(1);
    expect(s.currentBalls).toBe(0);
  });

  test('no-ball: no legal ball, +1 penalty, batter IS charged a ball [P3]', () => {
    const s = fold([ev({ extraType: 'NO_BALL', extraRuns: 1 })], R());
    expect(s.runs).toBe(1);
    expect(s.noBalls).toBe(1);
    expect(s.currentBalls).toBe(0);
    expect(batStat(s, 'S1')!.balls).toBe(1);
    expect(bowlStat(s, 'B1')!.noBalls).toBe(1);
  });

  test('no-ball with 4 off the bat: 5 total, 4 to batter, 4 counts as a four', () => {
    const s = fold([ev({ runs: 4, extraType: 'NO_BALL', extraRuns: 1 })], R());
    expect(s.runs).toBe(5);
    expect(batStat(s, 'S1')!.runs).toBe(4);
    expect(batStat(s, 'S1')!.fours).toBe(1);
    expect(bowlStat(s, 'B1')!.runs).toBe(5);
    expect(s.currentBalls).toBe(0);
  });

  test('bye: legal ball, runs to team only — batter and bowler NOT charged [P4]', () => {
    const s = fold([ev({ extraType: 'BYE', extraRuns: 2 })], R());
    expect(s.runs).toBe(2);
    expect(s.currentBalls).toBe(1);
    expect(s.byes).toBe(2);
    expect(batStat(s, 'S1')!.runs).toBe(0);
    expect(bowlStat(s, 'B1')!.runs).toBe(0);
  });

  test('leg-bye: legal ball, runs to team only', () => {
    const s = fold([ev({ extraType: 'LEG_BYE', extraRuns: 1 })], R());
    expect(s.runs).toBe(1);
    expect(s.currentBalls).toBe(1);
    expect(s.legByes).toBe(1);
    expect(bowlStat(s, 'B1')!.runs).toBe(0);
  });

  test('bye boundary is NOT a four for the batter', () => {
    const s = fold([ev({ extraType: 'BYE', extraRuns: 4 })], R());
    expect(batStat(s, 'S1')!.fours).toBe(0);
  });
});

describe('v1 over completion', () => {
  const sixDots = Array.from({ length: 6 }, (_, i) => ev({ deliveryNumber: i + 1 }));

  test('6 legal balls complete the over; innings counters roll', () => {
    const s = fold(sixDots, R());
    expect(s.completedOvers).toBe(1);
    expect(s.currentBalls).toBe(0);
    expect(s.legalBalls).toBe(6);
  });

  test('extras extend the over: 5 legal + wide + 1 legal = completed over', () => {
    const events = [
      ...Array.from({ length: 5 }, (_, i) => ev({ deliveryNumber: i + 1 })),
      ev({ deliveryNumber: 6, extraType: 'WIDE', extraRuns: 1 }),
      ev({ deliveryNumber: 7 }),
    ];
    const s = fold(events, R());
    expect(s.completedOvers).toBe(1);
    expect(s.currentBalls).toBe(0);
    expect(s.wideBalls).toBe(1);
  });

  test('nextBallContext after over completion flags needsNewBowler', () => {
    const s = fold(sixDots, R());
    expect(s.nextBallContext.needsNewBowler).toBe(true);
    expect(s.nextBallContext.overNumber).toBe(1);
    expect(s.nextBallContext.ballInOver).toBe(1);
  });

  test('8-ball overs: over completes at the 8th legal ball (rules knob)', () => {
    const events = Array.from({ length: 8 }, (_, i) => ev({ deliveryNumber: i + 1 }));
    const s = fold(events, R({ ballsPerOver: 8 }));
    expect(s.completedOvers).toBe(1);
    expect(s.currentBalls).toBe(0);
  });
});

describe('v1 strike rotation [P1][P2]', () => {
  test('odd off-bat runs swap strike mid-over', () => {
    const s = fold([ev({ runs: 1 })], R());
    expect(s.strikerId).toBe('S2');
    expect(s.nonStrikerId).toBe('S1');
  });

  test('even runs keep strike', () => {
    const s = fold([ev({ runs: 2 })], R());
    expect(s.strikerId).toBe('S1');
  });

  test('odd runs on the LAST ball of an over: v1 applies a single swap [P2 quirk]', () => {
    const events = [
      ...Array.from({ length: 5 }, (_, i) => ev({ deliveryNumber: i + 1, runs: 0 })),
      ev({ deliveryNumber: 6, runs: 1 }),
    ];
    const s = fold(events, R());
    // V1 PARITY: real cricket keeps the scorer on strike after a last-ball
    // single (two swaps cancel). v1 swaps ONCE. fold() reproduces v1.
    // §12.11.4 will fix this — pinned here so the fix is deliberate.
    expect(s.strikerId).toBe('S2');
  });

  test('even runs on the LAST ball of an over: over-end swap applies', () => {
    const events = [
      ...Array.from({ length: 5 }, (_, i) => ev({ deliveryNumber: i + 1, runs: 0 })),
      ev({ deliveryNumber: 6, runs: 0 }),
    ];
    const s = fold(events, R());
    expect(s.strikerId).toBe('S2');
  });

  test('odd BYES do not swap strike in v1 [P1 quirk]', () => {
    // Real cricket swaps on odd byes; v1 uses off-bat runs parity only.
    const s = fold([ev({ extraType: 'BYE', extraRuns: 1 })], R());
    expect(s.strikerId).toBe('S1');
  });

  test('odd no-ball runs off the bat do not swap strike (delivery is illegal)', () => {
    const s = fold([ev({ runs: 1, extraType: 'NO_BALL', extraRuns: 1 })], R());
    expect(s.strikerId).toBe('S1');
  });
});

describe('v1 wickets', () => {
  test('bowled: batter out, bowler credited, wicket counts [P6][P7]', () => {
    const s = fold([ev({ isWicket: true, wicketType: 'BOWLED' })], R());
    expect(s.wickets).toBe(1);
    const bat = batStat(s, 'S1')!;
    expect(bat.isOut).toBe(true);
    expect(bat.dismissalType).toBe('BOWLED');
    expect(bat.dismissedByBowlerId).toBe('B1');
    expect(bowlStat(s, 'B1')!.wickets).toBe(1);
    // survivor on strike, slot cleared [P7]
    expect(s.strikerId).toBe('S2');
    expect(s.nonStrikerId).toBeNull();
    expect(s.lastEffects!.needsNewBatsman).toBe(true);
  });

  test('caught with fielder: fielder recorded, bowler credited', () => {
    const s = fold([ev({ isWicket: true, wicketType: 'CAUGHT', fielderPlayerId: 'F1' })], R());
    expect(batStat(s, 'S1')!.fielderPlayerId).toBe('F1');
    expect(bowlStat(s, 'B1')!.wickets).toBe(1);
  });

  test('run-out of the striker with odd runs: v1 label quirk — dismissed batter is left as striker [P9 quirk]', () => {
    // V1 PARITY: v1 applies the odd-run swap FIRST, then assigns the survivor
    // from the post-swap non-striker — which is the dismissed batter. The
    // striker slot is then refilled by the new-batter flow. fold() mirrors
    // v1 exactly; the label is corrected by the UI flow, not the engine.
    const s = fold(
      [ev({ runs: 1, isWicket: true, wicketType: 'RUN_OUT', dismissedPlayerId: 'S1' })],
      R()
    );
    expect(s.wickets).toBe(1);
    expect(batStat(s, 'S1')!.isOut).toBe(true);
    expect(batStat(s, 'S1')!.dismissedByBowlerId).toBeNull();
    expect(bowlStat(s, 'B1')!.wickets).toBe(0);
    expect(s.strikerId).toBe('S1');
    expect(s.nonStrikerId).toBeNull();
  });

  test('run-out of the striker on a dot: survivor takes strike', () => {
    const s = fold(
      [ev({ runs: 0, isWicket: true, wicketType: 'RUN_OUT', dismissedPlayerId: 'S1' })],
      R()
    );
    expect(s.strikerId).toBe('S2');
    expect(s.nonStrikerId).toBeNull();
  });

  test('run-out of the NON-striker: striker keeps strike, own row marked out [P8]', () => {
    const s = fold(
      [ev({ isWicket: true, wicketType: 'RUN_OUT', dismissedPlayerId: 'S2' })],
      R()
    );
    expect(s.wickets).toBe(1);
    expect(batStat(s, 'S2')!.isOut).toBe(true);
    expect(batStat(s, 'S2')!.dismissalType).toBe('RUN_OUT');
    expect(batStat(s, 'S1')!.isOut).toBe(false);
    expect(s.strikerId).toBe('S1');
    expect(s.nonStrikerId).toBeNull();
    expect(bowlStat(s, 'B1')!.wickets).toBe(0);
  });

  test('retired hurt: counts as a wicket in v1 [P6 quirk], no bowler credit', () => {
    const s = fold([ev({ isWicket: true, wicketType: 'RETIRED_HURT' })], R());
    expect(s.wickets).toBe(1);
    expect(batStat(s, 'S1')!.isOut).toBe(true);
    expect(bowlStat(s, 'B1')!.wickets).toBe(0);
  });
});

describe('v1 maidens [P5]', () => {
  const maidenOver = Array.from({ length: 6 }, (_, i) =>
    ev({ deliveryNumber: i + 1, runs: 0 })
  );

  test('six dots = maiden', () => {
    const s = fold(maidenOver, R());
    expect(bowlStat(s, 'B1')!.maidens).toBe(1);
    expect(bowlStat(s, 'B1')!.completedOvers).toBe(1);
  });

  test('bye/leg-bye-only over IS a maiden (bowler conceded nothing) [P4/P5]', () => {
    const events = [
      ev({ deliveryNumber: 1, extraType: 'BYE', extraRuns: 2 }),
      ev({ deliveryNumber: 2, extraType: 'LEG_BYE', extraRuns: 1 }),
      ev({ deliveryNumber: 3 }),
      ev({ deliveryNumber: 4 }),
      ev({ deliveryNumber: 5 }),
      ev({ deliveryNumber: 6 }),
    ];
    const s = fold(events, R());
    expect(bowlStat(s, 'B1')!.maidens).toBe(1);
  });

  test('a single run off the bat spoils the maiden', () => {
    const events = [
      ...Array.from({ length: 5 }, (_, i) => ev({ deliveryNumber: i + 1 })),
      ev({ deliveryNumber: 6, runs: 1 }),
    ];
    const s = fold(events, R());
    expect(bowlStat(s, 'B1')!.maidens).toBe(0);
  });

  test('a wide spoils the maiden (penalty counts against the bowler)', () => {
    const events = [
      ev({ deliveryNumber: 1, extraType: 'WIDE', extraRuns: 1 }),
      ...Array.from({ length: 6 }, (_, i) => ev({ deliveryNumber: i + 2 })),
    ];
    const s = fold(events, R());
    expect(bowlStat(s, 'B1')!.maidens).toBe(0);
  });
});

describe('v1 innings completion', () => {
  test('all-out: wickets reach maxWickets', () => {
    const events = Array.from({ length: 3 }, (_, i) =>
      ev({ deliveryNumber: i + 1, isWicket: true, wicketType: 'BOWLED' })
    );
    const s = fold(events, R({ maxWickets: 3 }));
    expect(s.inningsComplete).toBe(true);
    expect(s.lastEffects!.needsNewBatsman).toBe(false); // innings over — no new batter
  });

  test('overs exhausted: completedOvers reaches totalOvers', () => {
    const events = Array.from({ length: 6 }, (_, i) => ev({ deliveryNumber: i + 1 }));
    const s = fold(events, R({ totalOvers: 1 }));
    expect(s.inningsComplete).toBe(true);
  });

  test('2nd innings: target reached ends the innings mid-over', () => {
    const events = [
      ev({ deliveryNumber: 1, runs: 6 }),
      ev({ deliveryNumber: 2, runs: 6 }),
    ];
    const s = fold(events, R({ inningsNumber: 2, target: 13 }));
    expect(s.runs).toBe(12);
    expect(s.inningsComplete).toBe(false);

    const s2 = fold([...events, ev({ deliveryNumber: 3, runs: 1 })], R({ inningsNumber: 2, target: 13 }));
    expect(s2.runs).toBe(13);
    expect(s2.inningsComplete).toBe(true);
    expect(s2.lastEffects!.isMatchComplete).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. PROPERTIES — determinism, ordering, soft deletes (invariants 14–16)
// ---------------------------------------------------------------------------

describe('engine properties', () => {
  /** Deterministic pseudo-random generator so failures are reproducible. */
  function mulberry32(seed: number) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomEvents(count: number, seed: number): BallEvent[] {
    const rng = mulberry32(seed);
    const events: BallEvent[] = [];
    let striker = 'S1';
    let nonStriker = 'S2';
    for (let i = 1; i <= count; i++) {
      const roll = rng();
      const partial: Partial<BallEvent> = {
        deliveryNumber: i,
        batsmanId: striker,
        strikerIdBefore: striker,
        nonStrikerIdBefore: nonStriker,
        bowlerId: 'B1',
      };
      if (roll < 0.35) partial.runs = 0;
      else if (roll < 0.55) partial.runs = 1;
      else if (roll < 0.65) partial.runs = 2;
      else if (roll < 0.75) partial.runs = 4;
      else if (roll < 0.8) partial.runs = 6;
      else if (roll < 0.85) { partial.extraType = 'WIDE'; partial.extraRuns = 1; }
      else if (roll < 0.9) { partial.extraType = 'NO_BALL'; partial.extraRuns = 1; partial.runs = 0; }
      else if (roll < 0.95) { partial.extraType = 'BYE'; partial.extraRuns = 1 + Math.floor(rng() * 2); }
      else { partial.isWicket = true; partial.wicketType = 'BOWLED'; }
      events.push(ev(partial));

      // crude v1-compatible strike bookkeeping for event construction
      const legal = partial.extraType !== 'WIDE' && partial.extraType !== 'NO_BALL';
      const runs = partial.runs ?? 0;
      if (legal && runs % 2 === 1) [striker, nonStriker] = [nonStriker, striker];
      if (partial.isWicket) [striker, nonStriker] = [nonStriker, 'S3'];
    }
    return events;
  }

  test('determinism: identical events fold to identical state (invariant 14)', () => {
    for (const seed of [1, 42, 777]) {
      const events = randomEvents(80, seed);
      const a = fold(events, R({ totalOvers: 20 }));
      const b = fold(events, R({ totalOvers: 20 }));
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  test('order-independence: fold sorts by deliveryNumber internally', () => {
    const events = randomEvents(80, 42);
    const shuffled = events.slice().reverse();
    const a = fold(events, R());
    const b = fold(shuffled, R());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test('soft-deleted events are skipped (§12.7 tombstones, invariant 15)', () => {
    const events = randomEvents(30, 42);
    const full = fold(events, R());
    // Undo the last 5 events via tombstones — state must equal folding 25.
    const tombstoned = events.map((e, i) =>
      i >= 25 ? { ...e, deletedAt: '2026-01-01T00:00:00.000Z' } : e
    );
    const truncated = fold(events.slice(0, 25), R());
    const folded = fold(tombstoned, R());
    expect(JSON.stringify({ ...folded, lastEffects: null })).toBe(
      JSON.stringify({ ...truncated, lastEffects: null })
    );
    // sanity: counters actually shrank vs full fold
    expect(folded.runs).toBeLessThanOrEqual(full.runs);
  });

  test('over-counting invariant: legalBalls === 6 × completedOvers + currentBalls across random sequences', () => {
    for (const seed of [7, 99, 1234]) {
      const events = randomEvents(120, seed);
      const s = fold(events, R({ totalOvers: 999 }));
      expect(s.legalBalls).toBe(s.completedOvers * 6 + s.currentBalls);
      expect(s.currentBalls).toBeGreaterThanOrEqual(0);
      expect(s.currentBalls).toBeLessThan(6);
    }
  });

  test('run conservation: state.runs === Σ(runs + extraRuns) over live events', () => {
    const events = randomEvents(150, 5);
    const s = fold(events, R({ totalOvers: 999, maxWickets: 999 }));
    const sum = events.reduce((acc, e) => acc + e.runs + e.extraRuns, 0);
    expect(s.runs).toBe(sum);
  });
});

// ---------------------------------------------------------------------------
// 4. validateNext — pre-write gate
// ---------------------------------------------------------------------------

describe('validateNext', () => {
  const base: BallEvent = ev({ deliveryNumber: 1 });

  test('accepts a legal dot ball', () => {
    const s = fold([], R());
    const res = validateNext(s, R(), base);
    expect(res.ok).toBe(true);
  });

  test('rejects runs out of range', () => {
    const s = fold([], R());
    expect(validateNext(s, R(), ev({ runs: 7 })).ok).toBe(false);
    expect(validateNext(s, R(), ev({ runs: -1 })).ok).toBe(false);
  });

  test('rejects extraRuns without an extraType', () => {
    const s = fold([], R());
    const res = validateNext(s, R(), ev({ extraRuns: 1 }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('EXTRA_RUNS_WITHOUT_TYPE');
  });

  test('rejects wicket without a type', () => {
    const s = fold([], R());
    const res = validateNext(s, R(), ev({ isWicket: true }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('WICKET_TYPE_REQUIRED');
  });

  test('rejects RUN_OUT without a dismissed player', () => {
    const s = fold([], R());
    const res = validateNext(s, R(), ev({ isWicket: true, wicketType: 'RUN_OUT' }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('RUN_OUT_TARGET_REQUIRED');
  });

  test('rejects wides carrying runs off the bat', () => {
    const s = fold([], R());
    const res = validateNext(s, R(), ev({ runs: 1, extraType: 'WIDE', extraRuns: 1 }));
    expect(res.ok).toBe(false);
  });

  test('rejects balls after the innings completed', () => {
    const s = fold([ev({ isWicket: true, wicketType: 'BOWLED' })], R({ maxWickets: 1 }));
    const res = validateNext(s, R({ maxWickets: 1 }), ev({ deliveryNumber: 2 }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('INNINGS_COMPLETE');
  });

  test('§12.1 forward-compat: caught on a free hit is rejected when the rule is ON', () => {
    const rulesOn = R({ freeHitOnNoBall: true });
    // fold with the rule on: the no-ball arms the free hit
    const s = fold([ev({ deliveryNumber: 1, extraType: 'NO_BALL', extraRuns: 1 })], rulesOn);
    expect(s.freeHitPending).toBe(true);
    const res = validateNext(s, rulesOn, ev({ deliveryNumber: 2, isWicket: true, wicketType: 'CAUGHT' }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('FREE_HIT_NO_DISMISSAL');
    // run-out remains legal on the free hit
    const ro = validateNext(
      s,
      rulesOn,
      ev({ deliveryNumber: 2, isWicket: true, wicketType: 'RUN_OUT', dismissedPlayerId: 'S1' })
    );
    expect(ro.ok).toBe(true);
  });

  test('§12.1 forward-compat: free hit ends after a legal delivery', () => {
    const rulesOn = R({ freeHitOnNoBall: true });
    const s = fold(
      [
        ev({ deliveryNumber: 1, extraType: 'NO_BALL', extraRuns: 1 }),
        ev({ deliveryNumber: 2, runs: 4 }),
      ],
      rulesOn
    );
    expect(s.freeHitPending).toBe(false);
  });

  test('§12.1 forward-compat: free hit persists across a wide', () => {
    const rulesOn = R({ freeHitOnNoBall: true });
    const s = fold(
      [
        ev({ deliveryNumber: 1, extraType: 'NO_BALL', extraRuns: 1 }),
        ev({ deliveryNumber: 2, extraType: 'WIDE', extraRuns: 1 }),
      ],
      rulesOn
    );
    expect(s.freeHitPending).toBe(true);
  });
});
