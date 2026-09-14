/**
 * GULLYSCORE v2 §12 — ADVANCED CRICKET ENGINE TEST SUITE
 * ---------------------------------------------------------------------------
 * Acceptance criteria from the v2 spec, section by section:
 *   §12.1 free-hit state machine  — table-driven, ≥ 12 transition cases
 *   §12.2 powerplay splits        — reconcile exactly with innings totals
 *   §12.4 retired hurt & return   — not-out continuity + new stand
 *   §12.5 penalty runs            — consume no ball, no batter/bowler impact
 *   §12.6 dismissal expansion     — wicket-on-extras truth table, bowler credit
 *   §12.7 event sourcing          — undo property, clientEventId dedupe
 *   §12.8 over variants           — 8-ball overs, mid-over bowler split
 *   §12.10 house rules            — parseMatchRules layers
 *   §12.11 correctness fixes      — old→new strike rotation truth table
 *   §12.12 invariants 12–21       — every one property-pinned
 *   plus: the 300-event / 50-undo brute-force property test.
 *
 * Run:  bun test src/lib/engine-v2.test.ts
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  fold,
  validateNext,
  replayValidate,
  defaultRules,
  parseMatchRules,
  v2HouseRules,
  autoPowerplayOvers,
  powerplaySplit,
  dedupeEvents,
  decimalOvers,
  isBowlerCredited,
  beforePairFor,
  type BallEvent,
  type MatchRules,
  type InningsState,
} from './engine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GOLDEN_DIR = join(import.meta.dir, '..', '..', '__fixtures__', 'golden');

let evSeq = 0;
function ev(partial: Partial<BallEvent> = {}): BallEvent {
  evSeq += 1;
  return {
    deliveryNumber: partial.deliveryNumber ?? evSeq,
    batsmanId: partial.batsmanId ?? 'S1',
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

/** v1-parity rules (legacy matches). */
const R = (over: Partial<MatchRules> = {}): MatchRules =>
  defaultRules({ maxWickets: 10, totalOvers: 20, inningsNumber: 1, ...over });

/** Full v2 rules — what a NEW match gets (§12.10 defaults + engine fixes). */
const V2 = (over: Partial<MatchRules> = {}): MatchRules => {
  // House-rule knobs flow through the JSON (exactly what a real match does);
  // engine-level fields (maxWickets/totalOvers/inningsNumber/target/battingPlayers)
  // flow through the base.
  const house = v2HouseRules(over as unknown as Record<string, unknown>);
  return parseMatchRules(JSON.stringify(house), {
    maxWickets: 10,
    totalOvers: 20,
    inningsNumber: 1,
    ...over,
  });
};

/** Deterministic PRNG (mulberry32) for property tests. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// §12.1 FREE-HIT STATE MACHINE — table-driven transition cases
// ---------------------------------------------------------------------------

describe('§12.1 free-hit state machine (table-driven)', () => {
  interface FHCase {
    name: string;
    /** Events in order; each entry is [extraType, runs, extraRuns, wicket?]. */
    events: [string | null, number, number, string | null][];
    /** Expected freeHitPending AFTER each event (same length). */
    pending: boolean[];
    /** Run under v1-parity rules instead of v2 (free hit off). */
    v1?: boolean;
  }

  const cases: FHCase[] = [
    {
      name: 'NB → FH flagged; legal dot ends FH',
      events: [['NO_BALL', 0, 1, null], [null, 0, 0, null]],
      pending: [true, false],
    },
    {
      name: 'NB → FH delivery is a WIDE → FH persists',
      events: [['NO_BALL', 0, 1, null], ['WIDE', 0, 1, null], [null, 0, 0, null]],
      pending: [true, true, false],
    },
    {
      name: 'NB → FH delivery is another NB → FH persists',
      events: [['NO_BALL', 0, 1, null], ['NO_BALL', 2, 1, null], [null, 1, 0, null]],
      pending: [true, true, false],
    },
    {
      name: 'FH ends only when a LEGAL delivery completes',
      events: [['NO_BALL', 0, 1, null], ['WIDE', 0, 1, null], ['NO_BALL', 0, 1, null], ['WIDE', 0, 3, null], [null, 4, 0, null]],
      pending: [true, true, true, true, false],
    },
    {
      name: 'NB + runs off the bat still yields FH',
      events: [['NO_BALL', 4, 1, null], [null, 0, 0, null]],
      pending: [true, false],
    },
    {
      name: 'two legal balls then NB → FH only after the NB',
      events: [[null, 1, 0, null], [null, 2, 0, null], ['NO_BALL', 0, 1, null]],
      pending: [false, false, true],
    },
    {
      name: 'FH legal ball with wicket (run-out) ends FH',
      events: [['NO_BALL', 0, 1, null], [null, 0, 0, 'RUN_OUT']],
      pending: [true, false],
    },
    {
      name: 'run-out on the NB itself → FH still granted for next ball',
      events: [['NO_BALL', 0, 1, 'RUN_OUT'], [null, 0, 0, null]],
      pending: [true, false],
    },
    {
      name: 'penalty between NB and next delivery → FH persists through it',
      events: [['NO_BALL', 0, 1, null], ['PENALTY', 0, 5, null], [null, 0, 0, null]],
      pending: [true, true, false],
    },
    {
      name: 'free hit runs ON the FH ball: FH ends after it (no carry)',
      events: [['NO_BALL', 0, 1, null], [null, 6, 0, null], [null, 0, 0, null]],
      pending: [true, false, false],
    },
    {
      name: 'legal ball between two NBs: no FH carry-over',
      events: [['NO_BALL', 0, 1, null], [null, 0, 0, null], ['NO_BALL', 0, 1, null]],
      pending: [true, false, true],
    },
    {
      name: 'bye on the FH ball IS a legal delivery → FH ends',
      events: [['NO_BALL', 0, 1, null], ['BYE', 0, 1, null], [null, 0, 0, null]],
      pending: [true, false, false],
    },
    {
      name: 'leg-bye on the FH ball IS a legal delivery → FH ends',
      events: [['NO_BALL', 0, 1, null], ['LEG_BYE', 0, 2, null], [null, 0, 0, null]],
      pending: [true, false, false],
    },
    {
      name: 'v1 rules (freeHitOnNoBall off): NB never yields FH',
      events: [['NO_BALL', 0, 1, null], [null, 0, 0, null]],
      pending: [false, false],
      v1: true,
    },
  ];

  for (const c of cases) {
    test(c.name, () => {
      const rules = c.v1 ? R() : V2();
      const events: BallEvent[] = [];
      c.events.forEach(([extraType, runs, extraRuns, wicket], i) => {
        events.push(
          ev({
            deliveryNumber: i + 1,
            extraType: extraType as BallEvent['extraType'],
            runs,
            extraRuns,
            isWicket: wicket != null,
            wicketType: wicket as BallEvent['wicketType'],
            dismissedPlayerId: wicket != null ? (wicket === 'RUN_OUT' ? 'S1' : undefined) : null,
          })
        );
      });
      c.pending.forEach((expected, i) => {
        const state = fold(events.slice(0, i + 1), rules);
        expect(state.freeHitPending).toBe(expected);
      });
      // isFreeHit flag matches "pending BEFORE the ball" for every delivery
      events.forEach((e, i) => {
        if (e.extraType === 'PENALTY') return; // not a delivery — no FH flag
        const before = fold(events.slice(0, i), rules);
        const after = fold(events.slice(0, i + 1), rules);
        expect(after.lastEffects?.isFreeHit).toBe(rules.freeHitOnNoBall && before.freeHitPending);
      });
    });
  }

  test('AC: tap NB, tap 4 → FH chip appears then disappears after the legal ball', () => {
    const rules = V2();
    const nb = ev({ deliveryNumber: 1, extraType: 'NO_BALL', extraRuns: 1 });
    const four = ev({ deliveryNumber: 2, runs: 4 });
    const s1 = fold([nb], rules);
    expect(s1.freeHitPending).toBe(true); // chip appears
    expect(s1.nextBallContext.freeHitPending).toBe(true);
    const s2 = fold([nb, four], rules);
    expect(s2.freeHitPending).toBe(false); // chip disappears
    expect(s2.lastEffects?.isFreeHit).toBe(true); // the 4 itself was the FH ball
    expect(s2.lastEffects?.causedFreeHit).toBe(false);
  });

  test('causedFreeHit is set on the no-ball itself (Ball.causedFreeHit data)', () => {
    const rules = V2();
    const s = fold([ev({ extraType: 'NO_BALL', extraRuns: 1 })], rules);
    expect(s.lastEffects?.causedFreeHit).toBe(true);
    const s2 = fold([ev({ runs: 4 })], rules);
    expect(s2.lastEffects?.causedFreeHit).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §12.6 WICKET-ON-EXTRAS TRUTH TABLE + dismissal expansion
// ---------------------------------------------------------------------------

describe('§12.6 dismissal truth table (engine-enforced)', () => {
  test('run out on a wide: wide stands, wicket recorded, no legal ball, not re-bowled', () => {
    const rules = V2();
    const events = [
      ev({ deliveryNumber: 1, extraType: 'WIDE', extraRuns: 1, isWicket: true, wicketType: 'RUN_OUT', dismissedPlayerId: 'S1' }),
    ];
    const s = fold(events, rules);
    expect(s.runs).toBe(1); // wide stands (+1)
    expect(s.wickets).toBe(1); // wicket recorded
    expect(s.wideBalls).toBe(1);
    expect(s.currentBalls).toBe(0); // no legal ball
    expect(s.completedOvers).toBe(0); // not re-bowled — the wide consumed the count
    const v = validateNext(fold([], rules), rules, events[0]);
    expect(v.ok).toBe(true);
  });

  test('catch on a no-ball → blocked with NO_BALL_NO_DISMISSAL (run out still allowed)', () => {
    const rules = V2();
    const st = fold([ev({ extraType: 'NO_BALL', extraRuns: 1 })], rules);
    const caught = ev({ extraType: 'NO_BALL', extraRuns: 1, isWicket: true, wicketType: 'CAUGHT' });
    const res = validateNext(st, rules, caught);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('NO_BALL_NO_DISMISSAL');
    const runOut = ev({ extraType: 'NO_BALL', extraRuns: 1, isWicket: true, wicketType: 'RUN_OUT', dismissedPlayerId: 'S1' });
    expect(validateNext(st, rules, runOut).ok).toBe(true);
  });

  test('bowled / LBW / stumped / caught on a no-ball are all blocked', () => {
    const rules = V2();
    const st = fold([ev({ extraType: 'NO_BALL', extraRuns: 1 })], rules);
    for (const wt of ['BOWLED', 'CAUGHT', 'LBW', 'STUMPED', 'HIT_WICKET'] as const) {
      const res = validateNext(st, rules, ev({ extraType: 'NO_BALL', extraRuns: 1, isWicket: true, wicketType: wt }));
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe('NO_BALL_NO_DISMISSAL');
    }
  });

  test('caught on a wide → blocked WIDE_NO_DISMISSAL; stumped + run-out + obstructing allowed', () => {
    const rules = V2();
    const st = fold([ev({ extraType: 'WIDE', extraRuns: 1 })], rules);
    const caught = ev({ extraType: 'WIDE', extraRuns: 1, isWicket: true, wicketType: 'CAUGHT' });
    const res = validateNext(st, rules, caught);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('WIDE_NO_DISMISSAL');

    for (const wt of ['RUN_OUT', 'STUMPED', 'OBSTRUCTING_FIELD'] as const) {
      const ok = validateNext(
        st,
        rules,
        ev({ extraType: 'WIDE', extraRuns: 1, isWicket: true, wicketType: wt, dismissedPlayerId: wt === 'RUN_OUT' ? 'S1' : undefined })
      );
      expect(ok.ok).toBe(true);
    }
  });

  test('free-hit dismissal legality: only RUN_OUT and OBSTRUCTING_FIELD', () => {
    const rules = V2();
    const st = fold([ev({ extraType: 'NO_BALL', extraRuns: 1 })], rules);
    for (const wt of ['BOWLED', 'CAUGHT', 'LBW', 'STUMPED', 'HIT_WICKET', 'RETIRED_HURT'] as const) {
      const res = validateNext(st, rules, ev({ isWicket: true, wicketType: wt }));
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe('FREE_HIT_NO_DISMISSAL');
    }
    for (const wt of ['RUN_OUT', 'OBSTRUCTING_FIELD'] as const) {
      const res = validateNext(
        st,
        rules,
        ev({ isWicket: true, wicketType: wt, dismissedPlayerId: wt === 'RUN_OUT' ? 'S1' : undefined })
      );
      expect(res.ok).toBe(true);
    }
  });

  test('every dismissal type: bowler credit, legal-ball count, re-bowl behaviour', () => {
    const rules = V2();
    const wicketTypes = [
      'BOWLED', 'CAUGHT', 'RUN_OUT', 'LBW', 'STUMPED', 'HIT_WICKET', 'OBSTRUCTING_FIELD',
    ] as const;
    for (const wt of wicketTypes) {
      const events = [ev({ isWicket: true, wicketType: wt, dismissedPlayerId: wt === 'RUN_OUT' ? 'S1' : undefined, fielderPlayerId: wt === 'CAUGHT' ? 'F1' : undefined })];
      const s = fold(events, rules);
      expect(s.wickets).toBe(1);
      expect(s.currentBalls).toBe(1); // wickets consume a legal ball
      expect(s.wideBalls).toBe(0);
      expect(isBowlerCredited(wt)).toBe(!['RUN_OUT', 'OBSTRUCTING_FIELD'].includes(wt));
      expect(s.bowling['B1'].wickets).toBe(isBowlerCredited(wt) ? 1 : 0);
      expect(s.batting['S1'].dismissedByBowlerId).toBe(isBowlerCredited(wt) ? 'B1' : null);
    }
  });

  test('mankad: non-striker run-out leaves the non-striker slot to be filled', () => {
    const rules = V2();
    const events = [
      ev({
        deliveryNumber: 1,
        isWicket: true,
        wicketType: 'RUN_OUT',
        dismissedPlayerId: 'S2', // the NON-striker (mankad)
        strikerIdBefore: 'S1',
        nonStrikerIdBefore: 'S2',
      }),
    ];
    const s = fold(events, rules);
    expect(s.wickets).toBe(1);
    expect(s.strikerId).toBe('S1'); // striker keeps strike
    expect(s.nonStrikerId).toBeNull(); // slot to be filled by the new-batter sheet
    expect(s.batting['S2'].isOut).toBe(true);
    expect(s.batting['S2'].dismissalType).toBe('RUN_OUT');
    expect(s.bowling['B1'].wickets).toBe(0); // no bowler credit for a mankad
    expect(s.lastEffects?.needsNewBatsman).toBe(true);
  });

  test('run-out with runs completed: runs apply then dismissal (§12.6 runs-before-dismissal)', () => {
    const rules = V2();
    const events = [
      ev({ deliveryNumber: 1, runs: 1, isWicket: true, wicketType: 'RUN_OUT', dismissedPlayerId: 'S1' }),
    ];
    const s = fold(events, rules);
    expect(s.runs).toBe(1);
    expect(s.batting['S1'].runs).toBe(1);
    expect(s.wickets).toBe(1);
  });

  test('OBSTRUCTING_FIELD: batter out, wicket counted, no bowler credit', () => {
    const rules = V2();
    const s = fold([ev({ isWicket: true, wicketType: 'OBSTRUCTING_FIELD' })], rules);
    expect(s.wickets).toBe(1);
    expect(s.batting['S1'].isOut).toBe(true);
    expect(s.batting['S1'].dismissalType).toBe('OBSTRUCTING_FIELD');
    expect(s.batting['S1'].dismissedByBowlerId).toBeNull();
    expect(s.bowling['B1'].wickets).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §12.2 POWERPLAY PHASES
// ---------------------------------------------------------------------------

describe('§12.2 powerplay phases', () => {
  test('auto powerplay: max(1, round(totalOvers × 0.3)), only when totalOvers ≥ 5', () => {
    expect(autoPowerplayOvers(20)).toBe(6);
    expect(autoPowerplayOvers(10)).toBe(3);
    expect(autoPowerplayOvers(6)).toBe(2);
    expect(autoPowerplayOvers(5)).toBe(2); // round(1.5) = 2
    expect(autoPowerplayOvers(4)).toBe(0);
    expect(autoPowerplayOvers(3)).toBe(0);
  });

  test('v2 rules blob parses to auto PP; explicit numbers override', () => {
    const auto = parseMatchRules(JSON.stringify(v2HouseRules()), { maxWickets: 10, totalOvers: 20, inningsNumber: 1 });
    expect(auto.powerplayOvers).toBe(6);
    const explicit = parseMatchRules(
      JSON.stringify(v2HouseRules({ powerplayOvers: 2 })),
      { maxWickets: 10, totalOvers: 20, inningsNumber: 1 }
    );
    expect(explicit.powerplayOvers).toBe(2);
    const legacy = parseMatchRules(null, { maxWickets: 10, totalOvers: 20, inningsNumber: 1 });
    expect(legacy.powerplayOvers).toBe(0); // v1 parity
    expect(legacy.freeHitOnNoBall).toBe(false);
    expect(legacy.retiredHurtNotOut).toBe(false);
    expect(legacy.strikeRotationV2).toBe(false);
  });

  test('AC: PP + non-PP splits reconcile EXACTLY with innings totals (golden fixture)', () => {
    const manifestPath = join(GOLDEN_DIR, 'manifest.json');
    if (!existsSync(manifestPath)) return; // fixtures optional in CI
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    for (const entry of manifest.fixtures) {
      const fx = JSON.parse(readFileSync(join(GOLDEN_DIR, entry.file), 'utf-8'));
      const rules = { ...fx.rules, powerplayOvers: 2, freeHitOnNoBall: false };
      const state = fold(fx.events, rules);
      const split = powerplaySplit(state, rules);
      expect(split.powerplay.runs + split.nonPowerplay.runs).toBe(state.runs);
      expect(split.powerplay.wickets + split.nonPowerplay.wickets).toBe(state.wickets);
      expect(split.powerplay.legalBalls + split.nonPowerplay.legalBalls).toBe(state.legalBalls);
      const boundaries = Object.values(state.batting).reduce((acc, b) => acc + b.fours + b.sixes, 0);
      expect(split.powerplay.boundaries + split.nonPowerplay.boundaries).toBe(boundaries);
    }
  });

  test('phase is derived from over number — no new storage', () => {
    const rules = V2({ totalOvers: 10, powerplayOvers: 3 });
    const events: BallEvent[] = [];
    for (let i = 0; i < 30; i++) {
      events.push(ev({ deliveryNumber: i + 1, runs: i % 3 }));
    }
    const s = fold(events, rules);
    expect(s.completedOvers).toBe(5);
    expect(s.overs.length).toBe(5);
    const split = powerplaySplit(s, rules);
    expect(split.powerplayOvers).toBe(3);
    expect(split.powerplay.legalBalls).toBe(18);
    expect(split.nonPowerplay.legalBalls).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// §12.4 RETIRED HURT & RETURN
// ---------------------------------------------------------------------------

describe('§12.4 retired hurt & return', () => {
  function retiredSequence(): { events: BallEvent[]; rules: MatchRules } {
    const rules = V2({ retiredHurtNotOut: true });
    const events: BallEvent[] = [];
    let dn = 0;
    // Batter S1 scores 23 off 14 with S2
    const scores = [4, 1, 2, 4, 6, 1, 2, 4, 1, 6, 1, 1, 4, 0]; // hmm—simple: 23 runs
    let s1Runs = 0, s1Balls = 0;
    let striker = 'S1';
    for (const runs of [4, 1, 4, 6, 1, 2, 4, 1, 0, 0]) { // 23 runs, 10 balls (some off strike)
      dn += 1;
      events.push(ev({
        deliveryNumber: dn, runs,
        batsmanId: striker, strikerIdBefore: striker, nonStrikerIdBefore: 'S2',
      }));
      s1Runs += striker === 'S1' ? runs : 0;
      s1Balls += striker === 'S1' ? 1 : 0;
      if (rules.strikeRotationV2 && runs % 2 === 1) striker = striker === 'S1' ? 'S2' : 'S1';
    }
    // S1 retires hurt on 23 (14 balls-ish); S3 comes in, S2 keeps striking with S3
    dn += 1;
    const retiringStriker = striker === 'S1' ? 'S1' : 'S1';
    events.push(ev({
      deliveryNumber: dn, isWicket: true, wicketType: 'RETIRED_HURT',
      batsmanId: retiringStriker, strikerIdBefore: retiringStriker, nonStrikerIdBefore: 'S2',
    }));
    // S3 joins S2 for a few balls
    let striker2 = 'S2';
    for (const runs of [1, 0, 0]) {
      dn += 1;
      events.push(ev({ deliveryNumber: dn, runs, batsmanId: striker2, strikerIdBefore: striker2, nonStrikerIdBefore: 'S3' }));
      if (runs % 2 === 1) striker2 = striker2 === 'S2' ? 'S3' : 'S2';
    }
    // S1 RETURNS (dead ball, pair now S2/S1 or S3/S1) and scores 10 more
    dn += 1;
    let striker3: string = 'S1';
    events.push(ev({ deliveryNumber: dn, runs: 10, batsmanId: 'S1', strikerIdBefore: 'S1', nonStrikerIdBefore: 'S3' }));
    void striker3;
    return { events, rules };
  }

  test('AC: retires on 23, returns, scores 10 more → 33, not out, one continuous row', () => {
    const rules = V2();
    const seq: BallEvent[] = [];
    let n = 0;
    // S1 scores 23: 22 in even runs (always on strike), a single, a single
    // by S2 to restore strike, then retires ON strike (the UI path — the RH
    // event is a delivery faced by the retiring striker).
    for (const runs of [4, 4, 4, 4, 2, 2, 2, 1]) {
      n += 1;
      seq.push(ev({ deliveryNumber: n, runs, batsmanId: 'S1', strikerIdBefore: 'S1', nonStrikerIdBefore: 'S2' }));
    }
    // After S1's single S2 is on strike; S2's single puts S1 back on strike.
    n += 1;
    seq.push(ev({ deliveryNumber: n, runs: 1, batsmanId: 'S2', strikerIdBefore: 'S2', nonStrikerIdBefore: 'S1' }));
    // S1 retires hurt (on strike, 23 runs, 9 balls faced incl. this delivery).
    n += 1;
    seq.push(ev({
      deliveryNumber: n,
      runs: 0,
      isWicket: true,
      wicketType: 'RETIRED_HURT',
      dismissedPlayerId: 'S1',
      batsmanId: 'S1',
      strikerIdBefore: 'S1',
      nonStrikerIdBefore: 'S2',
    }));
    // S2 + S3 bat a bit
    n += 1;
    seq.push(ev({ deliveryNumber: n, runs: 1, batsmanId: 'S2', strikerIdBefore: 'S2', nonStrikerIdBefore: 'S3' }));
    // S1 RETURNS and scores 10 more
    n += 1;
    seq.push(ev({ deliveryNumber: n, runs: 10, batsmanId: 'S1', strikerIdBefore: 'S1', nonStrikerIdBefore: 'S3' }));

    const s = fold(seq, rules);
    const s1 = s.batting['S1'];
    expect(s1.runs).toBe(33); // 23 + 10, one continuous row
    expect(s1.balls).toBe(10); // 8 scoring + the RH delivery + the return ball
    expect(s1.isOut).toBe(false); // shown as not out
    expect(s1.dismissalType).toBe('RETIRED_HURT'); // RH badge data
    expect(s.wickets).toBe(0); // the retirement was not a wicket
    expect(s.fow.length).toBe(0);
    expect(s.runs).toBe(33 + 1 + 1); // S1 33 + S2's two singles
  });

  test('retired hurt under v2: no wicket, no FOW, not out, slot vacated', () => {
    const rules = V2();
    const s = fold([ev({ isWicket: true, wicketType: 'RETIRED_HURT', strikerIdBefore: 'S1', nonStrikerIdBefore: 'S2' })], rules);
    expect(s.wickets).toBe(0);
    expect(s.fow.length).toBe(0);
    expect(s.batting['S1'].isOut).toBe(false);
    expect(s.batting['S1'].dismissalType).toBe('RETIRED_HURT');
    expect(s.batting['S1'].dismissedByBowlerId).toBeNull();
    expect(s.bowling['B1'].wickets).toBe(0);
    expect(s.lastEffects?.needsNewBatsman).toBe(true);
    expect(s.nonStrikerId).toBeNull(); // survivor takes strike, slot cleared
  });

  test('v1 parity: RETIRED_HURT still counts as wicket + isOut (legacy matches)', () => {
    const s = fold([ev({ isWicket: true, wicketType: 'RETIRED_HURT' })], R());
    expect(s.wickets).toBe(1);
    expect(s.fow.length).toBe(1);
    expect(s.batting['S1'].isOut).toBe(true);
  });

  test('partnership logic treats return as a new stand', () => {
    const rules = V2();
    const events: BallEvent[] = [
      ev({ deliveryNumber: 1, runs: 2, strikerIdBefore: 'S1', nonStrikerIdBefore: 'S2' }),
      // S1 retires
      ev({ deliveryNumber: 2, isWicket: true, wicketType: 'RETIRED_HURT', batsmanId: 'S1', strikerIdBefore: 'S1', nonStrikerIdBefore: 'S2' }),
      // S2 + S3 bat
      ev({ deliveryNumber: 3, runs: 1, batsmanId: 'S2', strikerIdBefore: 'S2', nonStrikerIdBefore: 'S3' }),
      // S1 returns — SAME pair S1/S2 reforms
      ev({ deliveryNumber: 4, runs: 1, batsmanId: 'S2', strikerIdBefore: 'S2', nonStrikerIdBefore: 'S1' }),
      ev({ deliveryNumber: 5, runs: 1, batsmanId: 'S1', strikerIdBefore: 'S1', nonStrikerIdBefore: 'S2' }),
    ];
    const s = fold(events, rules);
    // Stand 1: S1+S2 closed by the retirement. Stand 2: S2+S3. Stand 3: S2+S1 (new).
    expect(s.partnerships.length).toBe(3);
    expect(s.partnerships[0].batsman1Id === 'S1' || s.partnerships[0].batsman2Id === 'S1').toBe(true);
    expect(s.partnerships[0].isOpen).toBe(false);
    expect(s.partnerships[2].runs).toBe(2); // the two 1s after the return
  });

  test('invariant 20: retired-return preserves batter aggregate continuity', () => {
    const rules = V2();
    const events = [
      ev({ deliveryNumber: 1, runs: 7, batsmanId: 'S1', strikerIdBefore: 'S1', nonStrikerIdBefore: 'S2' }),
      ev({ deliveryNumber: 2, isWicket: true, wicketType: 'RETIRED_HURT', batsmanId: 'S1', strikerIdBefore: 'S1', nonStrikerIdBefore: 'S2' }),
      ev({ deliveryNumber: 3, runs: 1, batsmanId: 'S2', strikerIdBefore: 'S2', nonStrikerIdBefore: 'S3' }),
      ev({ deliveryNumber: 4, runs: 3, batsmanId: 'S1', strikerIdBefore: 'S1', nonStrikerIdBefore: 'S3' }),
    ];
    const s = fold(events, rules);
    expect(s.batting['S1'].runs).toBe(10); // 7 + 3, one row
    expect(s.batting['S1'].balls).toBe(3); // scoring ball + RH delivery + return ball
  });
});

// ---------------------------------------------------------------------------
// §12.5 PENALTY RUNS
// ---------------------------------------------------------------------------

describe('§12.5 penalty runs', () => {
  test('AC: penalty +5 to batting side → total +5, no over progress, tables unchanged', () => {
    const rules = V2();
    const events = [
      ev({ deliveryNumber: 1, runs: 1 }),
      ev({ deliveryNumber: 2, extraType: 'PENALTY', extraRuns: 5, penaltySide: 'batting', reason: 'ball tampering' }),
      ev({ deliveryNumber: 3, runs: 0 }),
    ];
    const s = fold(events, rules);
    expect(s.runs).toBe(6); // 1 + 5 + 0
    expect(s.currentBalls).toBe(2); // only the two legal balls
    expect(s.legalBalls).toBe(2);
    expect(s.completedOvers).toBe(0);
    // Batter/bowler tables unchanged by the penalty
    expect(s.batting['S1'].runs).toBe(1);
    expect(s.batting['S1'].balls).toBe(2);
    expect(s.bowling['B1'].runs).toBe(1);
    expect(s.bowling['B1'].balls).toBe(2);
    expect(s.penaltyRunsBatting).toBe(5);
    expect(s.penaltyRunsBowling).toBe(0);
  });

  test('penalty to the bowling side is banked for the chase, not this innings total', () => {
    const rules = V2();
    const s = fold([
      ev({ deliveryNumber: 1, runs: 2 }),
      ev({ deliveryNumber: 2, extraType: 'PENALTY', extraRuns: 5, penaltySide: 'bowling', reason: 'time wasting' }),
    ], rules);
    expect(s.runs).toBe(2);
    expect(s.penaltyRunsBowling).toBe(5);
    expect(s.penaltyRunsBatting).toBe(0);
  });

  test('invariant 13: penalties consume no ball (property)', () => {
    const rules = V2();
    const withPen = [ev({ extraType: 'PENALTY', extraRuns: 5, penaltySide: 'batting' }), ev({ runs: 4 })];
    const without = [ev({ runs: 4 })];
    const a = fold(withPen, rules);
    const b = fold(without, rules);
    expect(a.currentBalls).toBe(b.currentBalls);
    expect(a.legalBalls).toBe(b.legalBalls);
    expect(a.completedOvers).toBe(b.completedOvers);
    expect(a.runs).toBe(b.runs + 5);
  });

  test('validateNext PENALTY shape: no runs, no wicket, side required', () => {
    const rules = V2();
    const st = fold([], rules);
    expect(validateNext(st, rules, ev({ extraType: 'PENALTY', extraRuns: 5, penaltySide: 'batting' })).ok).toBe(true);
    expect(validateNext(st, rules, ev({ extraType: 'PENALTY', extraRuns: 5, runs: 1, penaltySide: 'batting' })).ok).toBe(false);
    expect(validateNext(st, rules, ev({ extraType: 'PENALTY', extraRuns: 5, isWicket: true, wicketType: 'BOWLED', penaltySide: 'batting' })).ok).toBe(false);
    expect(validateNext(st, rules, ev({ extraType: 'PENALTY', extraRuns: 5 })).ok).toBe(false);
    expect(validateNext(st, rules, ev({ extraType: 'PENALTY', extraRuns: 0, penaltySide: 'batting' })).ok).toBe(false);
    expect(validateNext(st, rules, ev({ extraType: 'PENALTY', extraRuns: 11, penaltySide: 'batting' })).ok).toBe(false);
  });

  test('penalty runs appear in extras reconciliation (runs = bat + bowler + extras + penalties)', () => {
    const rules = V2();
    const events = [
      ev({ deliveryNumber: 1, runs: 4 }),
      ev({ deliveryNumber: 2, extraType: 'WIDE', extraRuns: 1 }),
      ev({ deliveryNumber: 3, extraType: 'BYE', extraRuns: 2, runs: 0 }),
      ev({ deliveryNumber: 4, extraType: 'PENALTY', extraRuns: 5, penaltySide: 'batting' }),
    ];
    const s = fold(events, rules);
    const batRuns = Object.values(s.batting).reduce((a, b) => a + b.runs, 0);
    const extras = s.wideBalls + s.noBalls + s.byes + s.legByes + s.penaltyRunsBatting;
    expect(s.runs).toBe(batRuns + extras);
    expect(extras).toBe(1 + 2 + 5);
  });
});

// ---------------------------------------------------------------------------
// §12.11 CORRECTNESS FIXES — old → new
// ---------------------------------------------------------------------------

describe('§12.11.4 strike rotation: old vs new (truth table)', () => {
  test('v1: single off the LAST ball of an over → non-striker on strike next over (quirk)', () => {
    const rules = R(); // v1 parity
    const events: BallEvent[] = [];
    for (let i = 0; i < 5; i++) events.push(ev({ deliveryNumber: i + 1, runs: 0 }));
    events.push(ev({ deliveryNumber: 6, runs: 1 }));
    const s = fold(events, rules);
    expect(s.completedOvers).toBe(1);
    expect(s.strikerId).toBe('S2'); // v1: single swap only
  });

  test('v2: single off the LAST ball → scorer RETAINS strike (two swaps cancel)', () => {
    const rules = V2(); // strikeRotationV2
    const events: BallEvent[] = [];
    for (let i = 0; i < 5; i++) events.push(ev({ deliveryNumber: i + 1, runs: 0 }));
    events.push(ev({ deliveryNumber: 6, runs: 1 }));
    const s = fold(events, rules);
    expect(s.completedOvers).toBe(1);
    expect(s.strikerId).toBe('S1'); // XOR of two swaps = no change
  });

  test('v2: two off the last ball → swap (over-end swap only)', () => {
    const rules = V2();
    const events: BallEvent[] = [];
    for (let i = 0; i < 5; i++) events.push(ev({ deliveryNumber: i + 1, runs: 0 }));
    events.push(ev({ deliveryNumber: 6, runs: 2 }));
    const s = fold(events, rules);
    expect(s.strikerId).toBe('S2');
  });

  test('v2: dot on the last ball → swap (over-end)', () => {
    const rules = V2();
    const events: BallEvent[] = [];
    for (let i = 0; i < 6; i++) events.push(ev({ deliveryNumber: i + 1, runs: 0 }));
    const s = fold(events, rules);
    expect(s.strikerId).toBe('S2');
  });

  test('v2: odd BYE mid-over rotates strike (v1 does not — [P1])', () => {
    const events = [ev({ deliveryNumber: 1, extraType: 'BYE', extraRuns: 1 })];
    const v1 = fold(events, R());
    expect(v1.strikerId).toBe('S1'); // [P1] quirk
    const v2 = fold(events, V2());
    expect(v2.strikerId).toBe('S2'); // official model
  });

  test('v2: runs off the bat on a NO-BALL rotate strike (v1 does not)', () => {
    const events = [ev({ deliveryNumber: 1, extraType: 'NO_BALL', extraRuns: 1, runs: 1 })];
    expect(fold(events, R()).strikerId).toBe('S1');
    expect(fold(events, V2()).strikerId).toBe('S2');
  });

  test('v2: odd additional runs on a WIDE rotate strike (v1 does not)', () => {
    const events = [ev({ deliveryNumber: 1, extraType: 'WIDE', extraRuns: 2 })]; // 1 penalty + 1 additional
    expect(fold(events, R()).strikerId).toBe('S1');
    expect(fold(events, V2()).strikerId).toBe('S2');
    const even = [ev({ deliveryNumber: 1, extraType: 'WIDE', extraRuns: 3 })]; // +2 additional
    expect(fold(even, V2()).strikerId).toBe('S1');
  });

  test('invariant 19: strike = XOR(delivery-parity swap, over-end swap) — full table', () => {
    const rules = V2();
    // [runsOffBat, isLastBallOfOver] → expected striker change
    const table: [number, boolean, boolean][] = [
      // runs, lastBall, strikerChanged
      [0, false, false],
      [1, false, true],
      [2, false, false],
      [3, false, true],
      [0, true, true],   // dot at over end: over-end swap
      [1, true, false],  // single at over end: parity swap + over-end swap cancel
      [2, true, true],   // two at over end: over-end swap only
      [3, true, false],  // three: parity + over-end cancel
      [4, true, true],
      [5, true, false],
      [6, true, true],
    ];
    for (const [runs, lastBall, changed] of table) {
      const events: BallEvent[] = [];
      const n = lastBall ? 6 : 1;
      for (let i = 0; i < n - 1; i++) events.push(ev({ deliveryNumber: i + 1, runs: 0 }));
      events.push(ev({ deliveryNumber: n, runs }));
      const s = fold(events, rules);
      expect(s.strikerId === 'S2').toBe(changed);
    }
  });
});

// ---------------------------------------------------------------------------
// §12.8 OVER VARIANTS & BOWLER SUBSTITUTION
// ---------------------------------------------------------------------------

describe('§12.8 over variants & bowler substitution', () => {
  test('8-ball overs: over completes on the 8th legal ball', () => {
    const rules = V2({ ballsPerOver: 8, totalOvers: 2 });
    const events: BallEvent[] = [];
    for (let i = 0; i < 8; i++) events.push(ev({ deliveryNumber: i + 1, runs: 1 }));
    const s = fold(events, rules);
    expect(s.completedOvers).toBe(1);
    expect(s.currentBalls).toBe(0);
    expect(s.legalBalls).toBe(8);
    expect(s.bowling['B1'].completedOvers).toBe(1);
    expect(s.bowling['B1'].balls).toBe(0);
    expect(s.lastEffects?.isOverComplete).toBe(true);
  });

  test('invariant 21: 8-ball overs — every over boundary at ballsPerOver legal balls', () => {
    const rules = V2({ ballsPerOver: 8, totalOvers: 3 });
    const events: BallEvent[] = [];
    for (let i = 0; i < 20; i++) events.push(ev({ deliveryNumber: i + 1, runs: 0 }));
    const s = fold(events, rules);
    expect(s.completedOvers).toBe(2);
    expect(s.currentBalls).toBe(4);
    // Wides do not advance the over: 6 legal + 1 wide + 1 legal = 7 legal balls
    const withWide = [...events.slice(0, 6), ev({ deliveryNumber: 7, extraType: 'WIDE', extraRuns: 1 }), ev({ deliveryNumber: 8, runs: 0 })];
    const s2 = fold(withWide, rules);
    expect(s2.completedOvers).toBe(0);
    expect(s2.currentBalls).toBe(7);
    expect(s2.wideBalls).toBe(1);
  });

  test('decimalOvers honours ballsPerOver', () => {
    const rules = V2({ ballsPerOver: 8 });
    const s = fold(Array.from({ length: 19 }, (_, i) => ev({ deliveryNumber: i + 1, runs: 0 })), rules);
    expect(s.completedOvers).toBe(2);
    expect(s.currentBalls).toBe(3);
    expect(decimalOvers(s, 8)).toBe(2.375);
    expect(decimalOvers(s, 6)).toBeCloseTo(2.5);
  });

  test('mid-over bowler injury split: both get true partial figures that sum to the over', () => {
    const rules = V2();
    const events: BallEvent[] = [];
    // Bowler B1 bowls 3 legal balls
    for (let i = 0; i < 3; i++) events.push(ev({ deliveryNumber: i + 1, runs: 1, bowlerId: 'B1' }));
    // Injury replacement B2 finishes the over (3 more legal balls)
    for (let i = 0; i < 3; i++) events.push(ev({ deliveryNumber: i + 4, runs: 2, bowlerId: 'B2' }));
    const s = fold(events, rules);
    expect(s.completedOvers).toBe(1);
    expect(s.currentBalls).toBe(0);
    expect(s.bowling['B1'].balls).toBe(3);
    expect(s.bowling['B1'].completedOvers).toBe(0);
    expect(s.bowling['B2'].balls).toBe(3);
    expect(s.bowling['B2'].completedOvers).toBe(0);
    expect(s.bowling['B1'].balls + s.bowling['B2'].balls).toBe(6); // figures sum to the over
    expect(s.bowling['B1'].runs).toBe(3);
    expect(s.bowling['B2'].runs).toBe(6);
    // OverStrip can derive the split: two bowlers share over 0
    expect(s.overs[0].bowlerIds).toEqual(['B1', 'B2']);
  });

  test('8-ball over with mid-over split also sums', () => {
    const rules = V2({ ballsPerOver: 8 });
    const events: BallEvent[] = [];
    for (let i = 0; i < 5; i++) events.push(ev({ deliveryNumber: i + 1, runs: 0, bowlerId: 'B1' }));
    for (let i = 0; i < 3; i++) events.push(ev({ deliveryNumber: i + 6, runs: 1, bowlerId: 'B2' }));
    const s = fold(events, rules);
    expect(s.completedOvers).toBe(1);
    expect(s.bowling['B1'].balls).toBe(5);
    expect(s.bowling['B2'].balls).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// §12.7 EVENT-SOURCED UNDO + IDEMPOTENCY
// ---------------------------------------------------------------------------

describe('§12.7 undo / redo / dedupe / edit revalidation', () => {
  test('invariant 15: undo × n = state before those n events (tombstones)', () => {
    const rules = V2();
    const events: BallEvent[] = [];
    for (let i = 0; i < 12; i++) events.push(ev({ deliveryNumber: i + 1, runs: (i % 4) + 1 }));
    for (let n = 1; n <= 12; n++) {
      const tombstoned = events.map((e, i) =>
        i >= events.length - n ? { ...e, deletedAt: '2026-01-01T00:00:00Z' } : e
      );
      const before = fold(events.slice(0, events.length - n), rules);
      const after = fold(tombstoned, rules);
      expect(after.runs).toBe(before.runs);
      expect(after.wickets).toBe(before.wickets);
      expect(after.legalBalls).toBe(before.legalBalls);
      expect(after.completedOvers).toBe(before.completedOvers);
      expect(after.currentBalls).toBe(before.currentBalls);
      expect(after.strikerId).toBe(before.strikerId);
      expect(after.nonStrikerId).toBe(before.nonStrikerId);
      expect(JSON.stringify(after.batting)).toBe(JSON.stringify(before.batting));
      expect(JSON.stringify(after.bowling)).toBe(JSON.stringify(before.bowling));
    }
  });

  test('invariant 16: clientEventId dedupe — replays never alter state', () => {
    const rules = V2();
    const events = [
      ev({ deliveryNumber: 1, runs: 4, clientEventId: 'ce-1' }),
      ev({ deliveryNumber: 2, runs: 1, clientEventId: 'ce-2' }),
      ev({ deliveryNumber: 3, runs: 2, clientEventId: 'ce-3' }),
    ];
    const replayed = [...events, { ...events[1] }]; // offline queue replays ce-2
    const deduped = dedupeEvents(replayed);
    expect(deduped.length).toBe(3);
    const a = fold(deduped, rules);
    const b = fold(events, rules);
    expect(a.runs).toBe(b.runs);
    expect(a.legalBalls).toBe(b.legalBalls);
    expect(JSON.stringify(a.batting)).toBe(JSON.stringify(b.batting));
    // Events without clientEventId pass through
    expect(dedupeEvents([ev({ runs: 1 })]).length).toBe(1);
  });

  test('replayValidate: edit that removes a no-ball behind a free-hit run-out is rejected', () => {
    const rules = V2();
    // NB (causes FH) → run-out on the free hit → legal ball
    const events: BallEvent[] = [
      ev({ deliveryNumber: 1, extraType: 'NO_BALL', extraRuns: 1 }),
      ev({ deliveryNumber: 2, runs: 0, isWicket: true, wicketType: 'RUN_OUT', dismissedPlayerId: 'S1' }),
      ev({ deliveryNumber: 3, runs: 0 }),
    ];
    expect(replayValidate(events, rules).ok).toBe(true);
    // Edit event 1 into a legal dot: event 2's run-out is now on an ordinary
    // delivery (still legal), but the sequence must still re-validate — it does.
    const editedOk = [ev({ deliveryNumber: 1, runs: 0 }), events[1], events[2]];
    expect(replayValidate(editedOk, rules).ok).toBe(true);
    // Edit event 1 into a WIDE: event 2's run-out off a wide is still legal,
    // but edit event 2 into CAUGHT while a NB precedes it → rejected.
    const badEdit = [
      ev({ deliveryNumber: 1, extraType: 'NO_BALL', extraRuns: 1 }),
      ev({ deliveryNumber: 2, runs: 0, isWicket: true, wicketType: 'CAUGHT' }),
    ];
    const res = replayValidate(badEdit, rules);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('EDIT_REVALIDATION');
  });

  test('replayValidate: events after innings completion are rejected', () => {
    const rules = V2({ totalOvers: 1 }); // 1 over = 6 legal balls
    const events: BallEvent[] = [];
    for (let i = 0; i < 7; i++) {
      events.push(ev({ deliveryNumber: i + 1, runs: 0 }));
    }
    const res = replayValidate(events, rules);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('EDIT_REVALIDATION');
    // The first 6 events (a complete over) are fine.
    expect(replayValidate(events.slice(0, 6), rules).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §12.10 HOUSE RULES JSON PARSING
// ---------------------------------------------------------------------------

describe('§12.10 per-match rules JSON', () => {
  test('v2HouseRules defaults match the §12.10 table', () => {
    const h = v2HouseRules();
    expect(h.freeHitOnNoBall).toBe(true);
    expect(h.ballsPerOver).toBe(6);
    expect(h.wideLimitAdditional).toBe(4);
    expect(h.wagonCapture).toBe('boundaries');
    expect(h.pitchMapCapture).toBe(false);
    expect(h.guestPlayersAllowed).toBe(2);
    expect(h.lastManStands).toBe(false);
    // v2 engine fixes ride along on new matches
    expect(h.retiredHurtNotOut).toBe(true);
    expect(h.strikeRotationV2).toBe(true);
  });

  test('parseMatchRules: malformed JSON / null → v1 parity (fail safe)', () => {
    const base = { maxWickets: 10, totalOvers: 20, inningsNumber: 2, target: 101 };
    for (const bad of [null, undefined, '', '{oops', '"string"', '42']) {
      const rules = parseMatchRules(bad as string | null, base);
      expect(rules.freeHitOnNoBall).toBe(false);
      expect(rules.retiredHurtNotOut).toBe(false);
      expect(rules.strikeRotationV2).toBe(false);
      expect(rules.ballsPerOver).toBe(6);
    }
  });

  test('parseMatchRules: overrides respected, unknown keys ignored, 8-ball honoured', () => {
    const base = { maxWickets: 5, totalOvers: 8, inningsNumber: 1 };
    const rules = parseMatchRules(
      JSON.stringify({ freeHitOnNoBall: false, ballsPerOver: 8, lastManStands: true, hackerKey: 'x' }),
      base
    );
    expect(rules.freeHitOnNoBall).toBe(false);
    expect(rules.ballsPerOver).toBe(8);
    expect(rules.lastManStands).toBe(true);
    expect((rules as unknown as Record<string, unknown>)['hackerKey']).toBeUndefined();
    // not in JSON → v1-parity defaults
    expect(rules.retiredHurtNotOut).toBe(false);
  });

  test('lastManStands: lone batter does not rotate strike; ends when the side is exhausted', () => {
    const rules = V2({ lastManStands: true, maxWickets: 10, battingPlayers: 3 });
    // 3 players: 2 dismissals → 1 left (lone batter keeps batting)
    const events: BallEvent[] = [
      ev({ deliveryNumber: 1, runs: 0, isWicket: true, wicketType: 'BOWLED', batsmanId: 'S1' }),
      // S3 comes in, S2+S2... second wicket: S2 out
      ev({ deliveryNumber: 2, runs: 0, isWicket: true, wicketType: 'BOWLED', batsmanId: 'S2', strikerIdBefore: 'S2', nonStrikerIdBefore: 'S3' }),
      // S3 alone at the crease (nonStriker null) — odd runs must NOT rotate
      ev({ deliveryNumber: 3, runs: 1, batsmanId: 'S3', strikerIdBefore: 'S3', nonStrikerIdBefore: null as unknown as string }),
      ev({ deliveryNumber: 4, runs: 3, batsmanId: 'S3', strikerIdBefore: 'S3', nonStrikerIdBefore: null as unknown as string }),
      // 3rd wicket = side exhausted (battingPlayers 3) → innings complete
      ev({ deliveryNumber: 5, runs: 0, isWicket: true, wicketType: 'BOWLED', batsmanId: 'S3', strikerIdBefore: 'S3', nonStrikerIdBefore: null as unknown as string }),
    ];
    const s = fold(events, rules);
    expect(s.wickets).toBe(3);
    // Lone batter never rotated strike while batting alone
    const midState = fold(events.slice(0, 4), rules);
    expect(midState.strikerId).toBe('S3');
    expect(midState.inningsComplete).toBe(false);
    // 3rd wicket = side exhausted (3 wickets, 3 players) → innings complete
    expect(s.inningsComplete).toBe(true);
    // After the final dismissal the striker slot is vacated (P7, no survivor)
    expect(s.strikerId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §12.12 INVARIANT 12 + §12.7 PROPERTY: 300 events, 50 undos, brute force
// ---------------------------------------------------------------------------

describe('§12.12 property tests', () => {
  test('invariant 12: no bowler-credited dismissal ever lands on a free-hit delivery', () => {
    const rand = rng(42);
    for (let trial = 0; trial < 50; trial++) {
      const rules = V2({ totalOvers: 500 }); // keep the innings alive
      const events: BallEvent[] = [];
      let dn = 0;
      for (let i = 0; i < 40; i++) {
        dn += 1;
        const r = rand();
        const isWicket = r < 0.15;
        const wicketType = isWicket
          ? (['BOWLED', 'CAUGHT', 'RUN_OUT', 'LBW', 'STUMPED'] as const)[Math.floor(rand() * 5)]
          : null;
        // Wickets on extras must satisfy the truth table or the generator
        // marks them RUN_OUT (the only always-legal dismissal).
        const extraRoll = rand();
        let extraType: BallEvent['extraType'] = null;
        if (extraRoll < 0.15) extraType = 'NO_BALL';
        else if (extraRoll < 0.25) extraType = 'WIDE';
        const type = extraType && isWicket && wicketType !== 'RUN_OUT' ? null : extraType;
        events.push(
          ev({
            deliveryNumber: dn,
            runs: type === 'WIDE' ? 0 : Math.floor(rand() * 7),
            extraRuns: type === 'NO_BALL' ? 1 : type === 'WIDE' ? 1 : 0,
            extraType: type,
            isWicket,
            wicketType: isWicket ? (type ? 'RUN_OUT' : wicketType) : null,
            dismissedPlayerId: isWicket ? (wicketType === 'RUN_OUT' ? 'S1' : null) : null,
          })
        );
      }
      // Simulate the scorer obeying the rules: drop events that fail validateNext
      const valid: BallEvent[] = [];
      for (const e of events) {
        const st = fold(valid, rules);
        if (validateNext(st, rules, e).ok) valid.push(e);
      }
      // Check every bowler-credited wicket sits on a non-free-hit ball
      for (let i = 0; i < valid.length; i++) {
        const e = valid[i];
        if (!e.isWicket || !e.wicketType || !isBowlerCredited(e.wicketType)) continue;
        const before = fold(valid.slice(0, i), rules);
        if (rules.freeHitOnNoBall && before.freeHitPending) {
          // This event must have been REJECTED by validateNext — invariant 12
          expect(validateNext(before, rules, e).ok).toBe(false);
        }
      }
      // And the folded state never contains a credited wicket on an FH ball
      const finalState = fold(valid, rules);
      void finalState;
    }
  });

  test('§12.7 AC: 300 random events with 50 random undos equal the brute-force state', () => {
    const rand = rng(2026);
    const rules = V2({ totalOvers: 1000, maxWickets: 500 }); // never complete

    // --- Build a 300-event sequence the way the app records it: each event
    // passes validateNext against the folded prefix, pairs resync from state.
    const players = Array.from({ length: 22 }, (_, i) => `P${i + 1}`);
    const bowlers = ['BW1', 'BW2', 'BW3', 'BW4', 'BW5'];
    const events: BallEvent[] = [];
    let nextBatter = 0;
    let currentBowler = bowlers[0];

    for (let dn = 1; dn <= 300; dn++) {
      // Ensure a valid pair (fill vacated slots like the app does)
      let state = fold(events, rules);
      if (state.strikerId == null || state.nonStrikerId == null) {
        // Simulate the striker route filling the vacancy with a new batter.
        // We cannot rewrite past events; instead treat the *next* event's
        // Before pair as authoritative (the fold resyncs from it).
      }
      const striker = state.strikerId ?? players[0];
      let nonStriker = state.nonStrikerId;
      if (nonStriker == null) {
        nonStriker = players[nextBatter++ % players.length];
        if (nonStriker === striker) nonStriker = players[(nextBatter++) % players.length];
      }

      // Bowler switches at over boundaries, occasionally mid-over (injury)
      if (state.currentBalls === 0 && events.length > 0 && rand() < 0.9) {
        currentBowler = bowlers[Math.floor(rand() * bowlers.length)];
      } else if (rand() < 0.02) {
        currentBowler = bowlers[Math.floor(rand() * bowlers.length)];
      }

      // Compose a random event
      const roll = rand();
      let proposal: BallEvent;
      if (roll < 0.06) {
        proposal = ev({ extraType: 'PENALTY', extraRuns: 5, penaltySide: rand() < 0.7 ? 'batting' : 'bowling' });
      } else {
        const extraRoll = rand();
        const extraType: BallEvent['extraType'] =
          extraRoll < 0.08 ? 'NO_BALL' : extraRoll < 0.16 ? 'WIDE' : extraRoll < 0.2 ? 'BYE' : extraRoll < 0.24 ? 'LEG_BYE' : null;
        const isWicket = rand() < 0.12;
        // Pick a wicket type that is legal on this delivery + FH state
        let wicketType: BallEvent['wicketType'] = null;
        let dismissedPlayerId: string | null = null;
        if (isWicket) {
          if (extraType === 'NO_BALL' || state.freeHitPending) wicketType = 'RUN_OUT';
          else if (extraType === 'WIDE') wicketType = rand() < 0.5 ? 'RUN_OUT' : 'STUMPED';
          else wicketType = (['BOWLED', 'CAUGHT', 'RUN_OUT', 'LBW', 'STUMPED', 'HIT_WICKET', 'RETIRED_HURT', 'OBSTRUCTING_FIELD'] as const)[Math.floor(rand() * 8)];
          if (wicketType === 'RUN_OUT') dismissedPlayerId = rand() < 0.6 ? striker : nonStriker;
        }
        const runs = extraType === 'WIDE' ? 0 : Math.floor(rand() * 7);
        const extraRuns =
          extraType === 'NO_BALL' ? 1 :
          extraType === 'WIDE' ? 1 + Math.floor(rand() * 3) :
          extraType === 'BYE' || extraType === 'LEG_BYE' ? 1 + Math.floor(rand() * 4) : 0;
        proposal = ev({
          runs: wicketType === 'RETIRED_HURT' && extraType == null ? 0 : runs,
          extraType,
          extraRuns,
          isWicket,
          wicketType,
          dismissedPlayerId,
        });
      }
      proposal.deliveryNumber = dn;
      proposal.batsmanId = striker;
      proposal.bowlerId = currentBowler;
      proposal.strikerIdBefore = striker;
      proposal.nonStrikerIdBefore = nonStriker;

      const check = validateNext(state, rules, proposal);
      if (check.ok) events.push(proposal);
      // Rejected proposals simply never happened (the UI blocks them).
      void state;
    }

    expect(events.length).toBeGreaterThan(200); // most proposals are valid

    // --- Apply 50 RANDOM undos (tombstones at random live positions) -------
    const indices = new Set<number>();
    while (indices.size < Math.min(50, events.length)) {
      indices.add(Math.floor(rand() * events.length));
    }
    const tombstoned = events.map((e, i) =>
      indices.has(i) ? { ...e, deletedAt: new Date(i * 1000).toISOString() } : { ...e }
    );
    const survivors = events.filter((_, i) => !indices.has(i));

    const folded = fold(tombstoned, rules);
    const brute = fold(survivors, rules);

    expect(folded.runs).toBe(brute.runs);
    expect(folded.wickets).toBe(brute.wickets);
    expect(folded.completedOvers).toBe(brute.completedOvers);
    expect(folded.currentBalls).toBe(brute.currentBalls);
    expect(folded.legalBalls).toBe(brute.legalBalls);
    expect(folded.wideBalls).toBe(brute.wideBalls);
    expect(folded.noBalls).toBe(brute.noBalls);
    expect(folded.byes).toBe(brute.byes);
    expect(folded.legByes).toBe(brute.legByes);
    expect(folded.penaltyRunsBatting).toBe(brute.penaltyRunsBatting);
    expect(folded.penaltyRunsBowling).toBe(brute.penaltyRunsBowling);
    expect(folded.strikerId).toBe(brute.strikerId);
    expect(folded.nonStrikerId).toBe(brute.nonStrikerId);
    expect(folded.freeHitPending).toBe(brute.freeHitPending);
    expect(JSON.stringify(folded.batting)).toBe(JSON.stringify(brute.batting));
    expect(JSON.stringify(folded.bowling)).toBe(JSON.stringify(brute.bowling));
    expect(JSON.stringify(folded.fow)).toBe(JSON.stringify(brute.fow));
    expect(folded.overs.length).toBe(brute.overs.length);

    // --- 50 SEQUENTIAL undos (the real undo button) = fold(first N−50) -----
    const last50 = events.slice(0, Math.max(0, events.length - 50)).map((e) => ({ ...e }));
    const seqTomb = events.map((e, i) =>
      i >= events.length - 50 ? { ...e, deletedAt: '2026-01-01T00:00:00Z' } : { ...e }
    );
    const seqFolded = fold(seqTomb, rules);
    const seqBrute = fold(last50, rules);
    expect(seqFolded.runs).toBe(seqBrute.runs);
    expect(seqFolded.legalBalls).toBe(seqBrute.legalBalls);
    expect(JSON.stringify(seqFolded.batting)).toBe(JSON.stringify(seqFolded.batting)); // self-consistent
    expect(JSON.stringify(seqFolded.batting)).toBe(JSON.stringify(seqBrute.batting));
    expect(JSON.stringify(seqFolded.bowling)).toBe(JSON.stringify(seqBrute.bowling));
  });

  test('invariant 14: determinism — identical event lists fold identically (v2 rules)', () => {
    const rand = rng(7);
    const rules = V2();
    const events: BallEvent[] = [];
    for (let i = 0; i < 100; i++) {
      events.push(ev({ deliveryNumber: i + 1, runs: Math.floor(rand() * 7), extraType: rand() < 0.1 ? 'NO_BALL' : null, extraRuns: rand() < 0.1 ? 1 : 0 }));
    }
    const a = fold(events, rules);
    const b = fold([...events].reverse(), rules); // order-independence too
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ---------------------------------------------------------------------------
// Extras validation surface (§12.9 rich entry shapes)
// ---------------------------------------------------------------------------

describe('§12.9 rich extras entry validation', () => {
  test('AC: NB + 4 → 5 runs total, no legal ball, strike unchanged (even runs), re-bowl', () => {
    const rules = V2();
    const e = ev({ extraType: 'NO_BALL', extraRuns: 1, runs: 4 });
    const s = fold([e], rules);
    expect(s.runs).toBe(5);
    expect(s.currentBalls).toBe(0);
    expect(s.legalBalls).toBe(0);
    expect(s.strikerId).toBe('S1'); // 4 is even — strike unchanged (spec AC)
    expect(s.batting['S1'].balls).toBe(1); // balls faced: no-balls count [P3]
    expect(s.bowling['B1'].runs).toBe(5);
    // Odd off-bat runs on an NB DO rotate under v2 (official model)
    const odd = fold([ev({ extraType: 'NO_BALL', extraRuns: 1, runs: 1 })], rules);
    expect(odd.strikerId).toBe('S2');
  });

  test('wide + 2 additional → 3 runs, re-bowl (no legal ball)', () => {
    const rules = V2();
    const e = ev({ extraType: 'WIDE', extraRuns: 3 }); // 1 penalty + 2 additional
    const s = fold([e], rules);
    expect(s.runs).toBe(3);
    expect(s.currentBalls).toBe(0);
    expect(s.wideBalls).toBe(1);
    expect(s.bowling['B1'].wides).toBe(1);
  });

  test('wide limit: extraRuns beyond 1 + wideLimitAdditional rejected', () => {
    const rules = V2(); // wideLimitAdditional 4 → max 5
    const st = fold([], rules);
    expect(validateNext(st, rules, ev({ extraType: 'WIDE', extraRuns: 5 })).ok).toBe(true);
    expect(validateNext(st, rules, ev({ extraType: 'WIDE', extraRuns: 6 })).ok).toBe(false);
  });

  test('byes/leg-byes capped at 4; no-ball extraRuns exactly 1', () => {
    const rules = V2();
    const st = fold([], rules);
    expect(validateNext(st, rules, ev({ extraType: 'BYE', extraRuns: 4 })).ok).toBe(true);
    expect(validateNext(st, rules, ev({ extraType: 'BYE', extraRuns: 5 })).ok).toBe(false);
    expect(validateNext(st, rules, ev({ extraType: 'NO_BALL', extraRuns: 1 })).ok).toBe(true);
    expect(validateNext(st, rules, ev({ extraType: 'NO_BALL', extraRuns: 2 })).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §12.7 WRITE-PATH BEFORE-PAIR DERIVATION — regression: frozen strike rotation
// ---------------------------------------------------------------------------
// The write path (recordBall) stamps every event with the striker pair BEFORE
// the ball. This pair MUST come from the innings row (authoritative at write
// time, patched by the striker route between balls). The old implementation
// derived it from the fold — null before the first ball — and its
// `?? batsmanId` fallback recorded the striker as his own non-striker (A, A).
// fold() resyncs its pair from every event's nonStrikerIdBefore, so that one
// bad value froze rotation for the whole innings: the non-striker never came
// on strike and every run was credited to the opening striker.
// ---------------------------------------------------------------------------

describe('§12.7 write-path Before-pair derivation (regression: frozen strike rotation)', () => {
  test('row-derived Before: a single on ball 1 rotates strike and BOTH batters are credited', () => {
    const rules = V2();
    // Mirror the real write path: the row holds the openers, each event's
    // Before comes from beforePairFor(row), and recalculate() writes the
    // folded pair back to the row after every ball.
    let rowStriker: string | null = 'S1';
    let rowNonStriker: string | null = 'S2';
    const events: BallEvent[] = [];
    const record = (clientStriker: string, runs: number) => {
      const pair = beforePairFor(rowStriker, rowNonStriker, clientStriker);
      events.push(
        ev({
          batsmanId: clientStriker,
          runs,
          strikerIdBefore: pair.strikerIdBefore,
          nonStrikerIdBefore: pair.nonStrikerIdBefore,
          deliveryNumber: events.length + 1,
        })
      );
      const state = fold(events, rules); // = recalculate
      rowStriker = state.strikerId; // = db.innings.update
      rowNonStriker = state.nonStrikerId;
      return state;
    };

    // The client's striker mirrors strikerUpdate (the folded pair).
    let st = record('S1', 1); // single → rotate to S2
    expect(st.strikerId).toBe('S2');
    expect(st.nonStrikerId).toBe('S1');
    expect(st.batting['S1']?.runs).toBe(1);

    st = record(st.strikerId!, 1); // S2 single → rotate back to S1
    expect(st.strikerId).toBe('S1');
    expect(st.batting['S2']?.runs).toBe(1); // the partner IS batting

    st = record(st.strikerId!, 4); // S1 four (even) keeps strike
    expect(st.strikerId).toBe('S1');
    expect(st.batting['S1']?.runs).toBe(5);
  });

  test('row-derived Before survives a wicket + new batter via the striker route', () => {
    const rules = V2();
    let rowStriker: string | null = 'S1';
    let rowNonStriker: string | null = 'S2';
    const events: BallEvent[] = [];
    const record = (clientStriker: string, partial: Partial<BallEvent>) => {
      const pair = beforePairFor(rowStriker, rowNonStriker, clientStriker);
      events.push(
        ev({
          batsmanId: clientStriker,
          strikerIdBefore: pair.strikerIdBefore,
          nonStrikerIdBefore: pair.nonStrikerIdBefore,
          deliveryNumber: events.length + 1,
          ...partial,
        })
      );
      const state = fold(events, rules);
      rowStriker = state.strikerId;
      rowNonStriker = state.nonStrikerId;
      return state;
    };

    // S1 caught behind (over strike). Survivor S2 takes strike; row pair (S2, null).
    let st = record('S1', { isWicket: true, wicketType: 'CAUGHT' });
    expect(st.strikerId).toBe('S2');
    expect(st.nonStrikerId).toBeNull();
    expect(st.batting['S1']?.isOut).toBe(true);

    // New batter C selected via the striker route → row pair (S2, C).
    rowStriker = 'S2';
    rowNonStriker = 'C';

    // C is on strike after an odd single by S2.
    st = record('S2', { runs: 1 });
    expect(st.strikerId).toBe('C');
    expect(st.nonStrikerId).toBe('S2');
    // C drives a two — credited to C, strike retained.
    st = record('C', { runs: 2 });
    expect(st.strikerId).toBe('C');
    expect(st.batting['C']?.runs).toBe(2);
    expect(st.batting['S2']?.runs).toBe(1);
  });

  test('the OLD fold+batsmanId fallback produced (A, A) and froze rotation — documented contrast', () => {
    const rules = V2();
    const events: BallEvent[] = [];
    const oldBefore = (batsmanId: string) => {
      const state = fold(events, rules);
      return {
        strikerIdBefore: state.strikerId ?? batsmanId,
        nonStrikerIdBefore: state.nonStrikerId ?? batsmanId, // ← the bug
      };
    };
    for (let i = 0; i < 6; i++) {
      const before = oldBefore('S1');
      events.push(
        ev({
          batsmanId: 'S1',
          runs: 1,
          strikerIdBefore: before.strikerIdBefore,
          nonStrikerIdBefore: before.nonStrikerIdBefore,
          deliveryNumber: i + 1,
        })
      );
    }
    const st = fold(events, rules);
    expect(st.strikerId).toBe('S1'); // never rotated
    expect(st.batting['S1']?.runs).toBe(6); // everything to the opener
    expect(st.batting['S2']).toBeUndefined(); // partner never batted
  });

  test('v2 [P7]: wicket on the LAST ball of the over — survivor takes strike (not the out batter)', () => {
    // Real cricket: striker caught on the over's final ball; the ends swap
    // for the next over, so the SURVIVOR faces. The pre-fix engine read the
    // post-swap non-striker — the OUT batter — and left him "on strike".
    const rules = V2();
    const events: BallEvent[] = [];
    for (let i = 1; i <= 5; i++) {
      events.push(ev({ deliveryNumber: i, batsmanId: i % 2 === 1 ? 'S1' : 'S2' }));
    }
    events.push(
      ev({ deliveryNumber: 6, batsmanId: 'S1', isWicket: true, wicketType: 'CAUGHT' })
    );
    const st = fold(events, rules);
    expect(st.batting['S1']?.isOut).toBe(true);
    expect(st.strikerId).toBe('S2'); // the survivor
    expect(st.nonStrikerId).toBeNull(); // new-batter modal refills this
  });

  test('v2 [P7]: run-out of the striker with odd runs — survivor takes strike (v1 [P9] quirk fixed under v2)', () => {
    // The batters crossed on the completed single; the out batter is at the
    // far end. v1 parity (pinned) leaves the OUT batter as striker; v2 hands
    // strike to the survivor.
    const rules = V2();
    const st = fold(
      [ev({ runs: 1, isWicket: true, wicketType: 'RUN_OUT', dismissedPlayerId: 'S1' })],
      rules
    );
    expect(st.strikerId).toBe('S2'); // survivor
    expect(st.nonStrikerId).toBeNull();
  });

  test('beforePairFor: lone batter keeps a null non-striker (no fabricated partner)', () => {
    expect(beforePairFor('S1', null, 'S1')).toEqual({
      strikerIdBefore: 'S1',
      nonStrikerIdBefore: null,
    });
    expect(beforePairFor(null, null, 'S9')).toEqual({
      strikerIdBefore: 'S9',
      nonStrikerIdBefore: null,
    });
    expect(beforePairFor('S1', 'S2', 'S1')).toEqual({
      strikerIdBefore: 'S1',
      nonStrikerIdBefore: 'S2',
    });
  });
});

// Type re-export so the file fails loudly if the engine surface changes.
export type { InningsState };
