/**
 * GULLYSCORE v2 §13 — ANALYTICS & INTELLIGENCE TEST SUITE
 * ---------------------------------------------------------------------------
 * Acceptance criteria from the v2 spec:
 *   §13.1 win probability   — exact spec formula, clamps, 1st-innings heuristic
 *   §13.2 wagon wheel       — 8-sector compass angles + left-hander mirroring
 *   §13.3 pitch map         — length×line heatmap counting
 *   §13.4 matchup matrix    — runs/balls/dots/dismissals, wide/NB semantics
 *   §13.5 MVP index         — the EXACT spec formula incl. economy guard
 *   §13.6 career aggregates — HS/avg/SR/best, milestones
 *   §13.7 form guides       — last-5 chips, W/L/T/Q team strip
 *   §13.8 partnerships      — per-wicket graph, biggest/fastest, averages
 *   §13.9 turning points    — >15% WP-swing overs, spec label format
 *   §13.10 report prompt    — structured facts builder
 *
 * Run:  bun test src/lib/intelligence.test.ts
 */

import { describe, test, expect } from 'bun:test';
import {
  STAT_WEIGHTS,
  winProbability,
  wpTimeline,
  detectTurningPoints,
  matchupMatrix,
  mvpIndex,
  mvpTable,
  formatFormChip,
  lastFiveBatting,
  formSummary,
  teamFormStrip,
  partnershipAnalytics,
  careerBatting,
  careerBowling,
  careerMilestones,
  WAGON_DIRECTIONS,
  wagonAngle,
  compassToXY,
  wagonRadiusForRuns,
  pitchHeatmap,
  PITCH_LENGTHS,
  PITCH_LINES,
  buildMatchReportPrompt,
} from './intelligence';
import { fold, type BallEvent, type MatchRules } from './engine';

// ---------------------------------------------------------------------------
// Helpers — event factory consistent with the engine-v2 suite
// ---------------------------------------------------------------------------

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
  };
}

function chaseRules(partial: Partial<MatchRules> = {}): MatchRules {
  return {
    ballsPerOver: 6,
    maxWickets: 10,
    totalOvers: 10,
    inningsNumber: 2,
    target: 81,
    freeHitOnNoBall: true,
    powerplayOvers: 3,
    lastManStands: false,
    wideLimitAdditional: 4,
    wagonCapture: 'boundaries',
    pitchMapCapture: false,
    guestPlayersAllowed: 2,
    retiredHurtNotOut: true,
    strikeRotationV2: true,
    battingPlayers: 11,
    ...partial,
  } as MatchRules;
}

// ---------------------------------------------------------------------------
// §13.1 — WIN PROBABILITY
// ---------------------------------------------------------------------------

describe('§13.1 win probability — chase formula (exact)', () => {
  test('spec formula: sigmoid(1.8·margin + 2.2·(WH−0.5))', () => {
    // runs 40/2 after exactly 5.0 overs, chasing 81 in a 10-over match:
    //   currRR 8, reqRR 8.2 → margin −0.024390;  WH 0.8
    //   x = 1.8·(−0.0243902) + 2.2·0.3 = 0.6160976 → sigmoid ≈ 0.64938
    const wp = winProbability(
      { runs: 40, wickets: 2, completedOvers: 5, currentBalls: 0 },
      { inningsNumber: 2, totalOvers: 10, maxWickets: 10, target: 81, ballsPerOver: 6 },
    );
    expect(wp).toBeCloseTo(0.64938, 3);
  });

  test('margin is clamped to ±2 (reqRR ≈ 0 case divides by max(reqRR,1))', () => {
    // Need 1 run off 24 balls with 2 wickets per over left: reqRR 0.25,
    // currRR 6 → margin 23 → clamped to 2 → x = 3.6+0.66 → ~0.98
    const wp = winProbability(
      { runs: 60, wickets: 2, completedOvers: 6, currentBalls: 0 },
      { inningsNumber: 2, totalOvers: 10, maxWickets: 10, target: 61, ballsPerOver: 6 },
    );
    expect(wp).toBeCloseTo(0.9794, 2);
  });

  test('target reached pins at the max clamp', () => {
    const wp = winProbability(
      { runs: 81, wickets: 5, completedOvers: 8, currentBalls: 0 },
      { inningsNumber: 2, totalOvers: 10, maxWickets: 10, target: 81, ballsPerOver: 6 },
    );
    expect(wp).toBe(STAT_WEIGHTS.wp.max);
  });

  test('all out pins at the min clamp', () => {
    const wp = winProbability(
      { runs: 40, wickets: 10, completedOvers: 8, currentBalls: 0 },
      { inningsNumber: 2, totalOvers: 10, maxWickets: 10, target: 81, ballsPerOver: 6 },
    );
    expect(wp).toBe(STAT_WEIGHTS.wp.min);
  });

  test('overs exhausted pins at the min clamp', () => {
    const wp = winProbability(
      { runs: 70, wickets: 3, completedOvers: 10, currentBalls: 0 },
      { inningsNumber: 2, totalOvers: 10, maxWickets: 10, target: 81, ballsPerOver: 6 },
    );
    expect(wp).toBe(STAT_WEIGHTS.wp.min);
  });

  test('WP is bounded [0.02, 0.98] across a grid of states', () => {
    for (let runs = 0; runs <= 120; runs += 17) {
      for (let wkts = 0; wkts <= 10; wkts += 2) {
        for (let ov = 0; ov <= 10; ov += 2) {
          const wp = winProbability(
            { runs, wickets: wkts, completedOvers: ov, currentBalls: 3 },
            { inningsNumber: 2, totalOvers: 10, maxWickets: 10, target: 90, ballsPerOver: 6 },
          );
          expect(wp).toBeGreaterThanOrEqual(0.02);
          expect(wp).toBeLessThanOrEqual(0.98);
        }
      }
    }
  });
});

describe('§13.1 win probability — 1st innings heuristic', () => {
  const ctx1 = { inningsNumber: 1, totalOvers: 10, maxWickets: 10, target: null, ballsPerOver: 6 };

  test('zero balls bowled = exactly 50% (no information)', () => {
    expect(winProbability({ runs: 0, wickets: 0, completedOvers: 0, currentBalls: 0 }, ctx1)).toBe(0.5);
  });

  test('wickets in hand push WP away from 50% both directions', () => {
    const strong = winProbability({ runs: 60, wickets: 1, completedOvers: 6, currentBalls: 0 }, ctx1);
    const weak = winProbability({ runs: 30, wickets: 6, completedOvers: 6, currentBalls: 0 }, ctx1);
    expect(strong).toBeGreaterThan(0.5);
    expect(weak).toBeLessThan(0.5);
  });

  test('60/1 in 6 overs (above par, wickets in hand) is confident but not pinned', () => {
    const wp = winProbability({ runs: 60, wickets: 1, completedOvers: 6, currentBalls: 0 }, ctx1);
    expect(wp).toBeGreaterThan(0.7);
    expect(wp).toBeLessThan(0.98);
  });
});

// ---------------------------------------------------------------------------
// §13.9 — TIMELINE + TURNING POINTS
// ---------------------------------------------------------------------------

/** 3-over chase script: 12 + 12 runs, then over 3 = 4 runs + 2 wickets. */
function chaseScript(): BallEvent[] {
  const events: BallEvent[] = [];
  const push = (p: Partial<BallEvent>) => events.push(ev(p));
  // Over 1 — S1 on strike, even runs only (no rotation bookkeeping needed)
  push({ strikerIdBefore: 'S1', nonStrikerIdBefore: 'S2', runs: 4 });
  push({ runs: 0 });
  push({ runs: 2 });
  push({ runs: 4 });
  push({ runs: 0 });
  push({ runs: 2 }); // over 1: 12
  // Over 2 — strike rotated at the over change
  push({ strikerIdBefore: 'S2', nonStrikerIdBefore: 'S1', runs: 4 });
  push({ runs: 0 });
  push({ runs: 2 });
  push({ runs: 4 });
  push({ runs: 0 });
  push({ runs: 2 }); // over 2: 12
  // Over 3 — boundary, two wickets, new batters
  push({ strikerIdBefore: 'S1', nonStrikerIdBefore: 'S2', runs: 4 });
  push({
    strikerIdBefore: 'S1',
    nonStrikerIdBefore: 'S2',
    isWicket: true,
    wicketType: 'CAUGHT',
    dismissedPlayerId: 'S1',
    fielderPlayerId: 'F1',
  });
  push({ strikerIdBefore: 'S3', nonStrikerIdBefore: 'S2', runs: 0 });
  push({
    strikerIdBefore: 'S3',
    nonStrikerIdBefore: 'S2',
    isWicket: true,
    wicketType: 'BOWLED',
    dismissedPlayerId: 'S3',
  });
  push({ strikerIdBefore: 'S4', nonStrikerIdBefore: 'S2', runs: 0 });
  push({ strikerIdBefore: 'S4', nonStrikerIdBefore: 'S2', runs: 0 }); // over 3: 4 runs, 2 wickets
  return events;
}

describe('§13.9 WP timeline', () => {
  test('one snapshot per completed over + the opening state', () => {
    const rules = chaseRules();
    const timeline = wpTimeline(chaseScript(), rules);
    expect(timeline.map((s) => s.overNumber)).toEqual([0, 1, 2, 3]);
    expect(timeline.map((s) => s.runs)).toEqual([0, 12, 24, 28]);
    expect(timeline.map((s) => s.wickets)).toEqual([0, 0, 0, 2]);
  });

  test('timeline WP equals winProbability(fold(prefix)) at every boundary', () => {
    const rules = chaseRules();
    const events = chaseScript();
    for (const snap of wpTimeline(events, rules)) {
      const state = fold(events.slice(0, snap.deliveryNumber), rules);
      expect(snap.wp).toBe(
        winProbability(state, {
          inningsNumber: rules.inningsNumber,
          totalOvers: rules.totalOvers,
          maxWickets: rules.maxWickets,
          target: rules.target,
          ballsPerOver: rules.ballsPerOver,
        }),
      );
    }
  });

  test('tombstoned (undone) events are skipped by the timeline', () => {
    const rules = chaseRules();
    const events = chaseScript();
    events[17].deletedAt = new Date().toISOString(); // last ball of over 3
    const timeline = wpTimeline(events, rules);
    // No boundary snapshot for over 3 (5 legal balls), but a partial "now"
    // snapshot appears inside over 2→3's over number (completedOvers 2).
    const boundaries = timeline.filter(
      (s, i, arr) => i === 0 || arr[i - 1].overNumber !== s.overNumber || s.wp !== arr[i - 1].wp,
    );
    expect(boundaries.map((s) => s.overNumber)).toEqual([0, 1, 2, 2]);
    expect(timeline.every((s) => s.overNumber <= 2)).toBe(true);
    const state = fold(events, rules);
    expect(state.legalBalls).toBe(17); // 18 − 1 tombstoned
  });

  test('determinism — same events fold to the same timeline', () => {
    const rules = chaseRules();
    expect(wpTimeline(chaseScript(), rules)).toEqual(wpTimeline(chaseScript(), rules));
  });
});

describe('§13.9 turning points', () => {
  test('the 2-wicket over 3 swings WP > 15% and is detected', () => {
    const rules = chaseRules();
    const tps = detectTurningPoints(chaseScript(), rules);
    const over3 = tps.find((t) => t.overNumber === 3);
    expect(over3).toBeDefined();
    expect(over3!.wicketsInOver).toBe(2);
    expect(over3!.runsInOver).toBe(4);
    expect(over3!.swing).toBeLessThan(-STAT_WEIGHTS.turningPoint.swingThreshold);
  });

  test('quiet overs are not flagged', () => {
    const rules = chaseRules();
    const tps = detectTurningPoints(chaseScript(), rules);
    expect(tps.find((t) => t.overNumber === 2)).toBeUndefined();
  });

  test('label uses the spec format — "3rd over: 2 wickets, 4 runs, WP 91%→75%"', () => {
    const rules = chaseRules();
    const tps = detectTurningPoints(chaseScript(), rules);
    const label = tps.find((t) => t.overNumber === 3)!.label;
    expect(label).toMatch(/^3rd over: 2 wickets, 4 runs, WP \d+%→\d+%/);
  });
});

// ---------------------------------------------------------------------------
// §13.4 — MATCHUP MATRIX
// ---------------------------------------------------------------------------

describe('§13.4 matchup matrix', () => {
  test('runs/balls/dots/dismissals with wide + no-ball semantics', () => {
    const cells = matchupMatrix([
      { batsmanId: 'A', bowlerId: 'B', runs: 4 },
      { batsmanId: 'A', bowlerId: 'B', runs: 0 },
      { batsmanId: 'A', bowlerId: 'B', runs: 0, extraType: 'WIDE', extraRuns: 1 },
      { batsmanId: 'A', bowlerId: 'B', runs: 2, extraType: 'NO_BALL', extraRuns: 1 },
      {
        batsmanId: 'A', bowlerId: 'B', runs: 0, isWicket: true,
        wicketType: 'CAUGHT', dismissedPlayerId: 'A', fielderPlayerId: 'F1',
      },
      { batsmanId: 'C', bowlerId: 'D', runs: 1 },
      { batsmanId: 'A', bowlerId: 'E', runs: 6 },
      { batsmanId: 'A', bowlerId: 'B', runs: 1, extraType: 'PENALTY', extraRuns: 5 },
    ]);
    expect(cells).toHaveLength(3);
    const ab = cells.find((c) => c.batsmanId === 'A' && c.bowlerId === 'B')!;
    // wide not a ball faced; no-ball IS (§12.11); caught-dot counts as a dot.
    expect(ab.balls).toBe(4);
    expect(ab.runs).toBe(6);
    expect(ab.dots).toBe(2);
    expect(ab.fours).toBe(1);
    expect(ab.sixes).toBe(0);
    expect(ab.dismissals).toBe(1);
  });

  test('tombstoned balls are excluded', () => {
    const cells = matchupMatrix([
      { batsmanId: 'A', bowlerId: 'B', runs: 4 },
      { batsmanId: 'A', bowlerId: 'B', runs: 4, deletedAt: new Date().toISOString() },
    ]);
    expect(cells).toHaveLength(1);
    expect(cells[0].runs).toBe(4);
    expect(cells[0].balls).toBe(1);
  });

  test('run-out of the NON-striker is not a dismissal for the striker matchup', () => {
    const cells = matchupMatrix([
      {
        batsmanId: 'A', bowlerId: 'B', runs: 1, isWicket: true,
        wicketType: 'RUN_OUT', dismissedPlayerId: 'S2',
      },
    ]);
    expect(cells[0].dismissals).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §13.5 — MVP INDEX (exact formula)
// ---------------------------------------------------------------------------

describe('§13.5 MVP index', () => {
  test('exact spec arithmetic: 134 points before the economy penalty', () => {
    // 45 + 4·2 + 2·3 + 2·20 + 0 + 8 + 12 + 15 + 0 = 134
    const mvp = mvpIndex({
      playerId: 'P1', runs: 45, fours: 4, sixes: 2, wickets: 2, maidens: 0,
      dots: 8, catches: 1, runouts: 1, stumpings: 0, economy: 5.0, oversBowled: 3,
    });
    expect(mvp).toBe(134);
  });

  test('economy penalty −max(0, econ−7)·4 applies at ≥ 2 overs (econ 9 → −8)', () => {
    const mvp = mvpIndex({
      playerId: 'P1', runs: 45, fours: 4, sixes: 2, wickets: 2, maidens: 0,
      dots: 8, catches: 1, runouts: 1, stumpings: 0, economy: 9.0, oversBowled: 3,
    });
    expect(mvp).toBe(126);
  });

  test('economy penalty is SKIPPED below 2 overs bowled', () => {
    const mvp = mvpIndex({
      playerId: 'P1', runs: 45, fours: 4, sixes: 2, wickets: 2, maidens: 0,
      dots: 8, catches: 1, runouts: 1, stumpings: 0, economy: 9.0, oversBowled: 1.5,
    });
    expect(mvp).toBe(134);
  });

  test('economy below par never adds points', () => {
    const mvp = mvpIndex({
      playerId: 'P1', runs: 0, fours: 0, sixes: 0, wickets: 0, maidens: 0,
      dots: 0, catches: 0, runouts: 0, stumpings: 0, economy: 4.0, oversBowled: 4,
    });
    expect(mvp).toBe(0);
  });

  test('wicket-heavy bowling dominates run-scoring (20 per wicket)', () => {
    const bowler = mvpIndex({
      playerId: 'B', runs: 0, fours: 0, sixes: 0, wickets: 3, maidens: 1,
      dots: 10, catches: 0, runouts: 0, stumpings: 0, economy: 6.0, oversBowled: 4,
    });
    const batter = mvpIndex({
      playerId: 'A', runs: 50, fours: 5, sixes: 0, wickets: 0, maidens: 0,
      dots: 0, catches: 1, runouts: 0, stumpings: 0, economy: null, oversBowled: 0,
    });
    expect(bowler).toBe(3 * 20 + 10 + 10); // 60 wickets + 10 maiden + 10 dots
    expect(bowler).toBeGreaterThan(batter);
  });

  test('mvpTable sorts desc and carries a display breakdown', () => {
    const table = mvpTable([
      { playerId: 'A', runs: 20, fours: 0, sixes: 0, wickets: 0, maidens: 0, dots: 0, catches: 0, runouts: 0, stumpings: 0, economy: null, oversBowled: 0 },
      { playerId: 'B', runs: 45, fours: 4, sixes: 2, wickets: 2, maidens: 0, dots: 8, catches: 1, runouts: 1, stumpings: 0, economy: 9, oversBowled: 3 },
    ]);
    expect(table[0].playerId).toBe('B');
    expect(table[0].mvp).toBe(126);
    expect(table[0].breakdown.find((b) => b.key === 'wickets')!.points).toBe(40);
    expect(table[0].breakdown.find((b) => b.key === 'economy')!.points).toBe(-8);
  });
});

// ---------------------------------------------------------------------------
// §13.7 — FORM GUIDES
// ---------------------------------------------------------------------------

describe('§13.7 form guides', () => {
  test('last-5 chips render not-out with an asterisk ("34, 12*, 0, 78, 9" shape)', () => {
    const rows = [
      { runs: 34, isOut: true, balls: 20, date: '2026-01-01' },
      { runs: 12, isOut: false, balls: 8, date: '2026-01-08' },
      { runs: 0, isOut: true, balls: 3, date: '2026-01-15' },
      { runs: 78, isOut: true, balls: 41, date: '2026-01-22' },
      { runs: 9, isOut: true, balls: 7, date: '2026-01-29' },
    ];
    expect(lastFiveBatting(rows).map(formatFormChip)).toEqual(['34', '12*', '0', '78', '9']);
  });

  test('older innings beyond 5 are dropped (keeps the most recent)', () => {
    const rows = [
      { runs: 34, isOut: true, balls: 20, date: '2025-12-01' },
      { runs: 12, isOut: false, balls: 8, date: '2026-01-08' },
      { runs: 0, isOut: true, balls: 3, date: '2026-01-15' },
      { runs: 78, isOut: true, balls: 41, date: '2026-01-22' },
      { runs: 9, isOut: true, balls: 7, date: '2026-01-29' },
      { runs: 55, isOut: true, balls: 30, date: '2026-02-05' },
    ];
    expect(lastFiveBatting(rows).map(formatFormChip)).toEqual(['12*', '0', '78', '9', '55']);
  });

  test('form summary: total, average over dismissals, best, not-outs', () => {
    const rows = [
      { runs: 34, isOut: true, balls: 20, date: '2026-01-01' },
      { runs: 12, isOut: false, balls: 8, date: '2026-01-08' },
      { runs: 0, isOut: true, balls: 3, date: '2026-01-15' },
      { runs: 78, isOut: true, balls: 41, date: '2026-01-22' },
      { runs: 9, isOut: true, balls: 7, date: '2026-01-29' },
    ];
    const s = formSummary(rows);
    expect(s.total).toBe(133);
    expect(s.average).toBeCloseTo(33.25, 1); // 133/4, rounded to 1 dp
    expect(s.best).toBe(78);
    expect(s.notOuts).toBe(1);
  });

  test('W/Q team strip: W L T Q from the last 5 finished matches', () => {
    const matches = [
      { winnerId: 'T2', status: 'COMPLETED' }, // oldest — dropped by slice(-5)
      { winnerId: 'T1', status: 'COMPLETED' },
      { winnerId: 'T2', status: 'COMPLETED' },
      { winnerId: null, status: 'COMPLETED' }, // tie
      { winnerId: null, status: 'ABANDONED' }, // no result → Q
      { winnerId: 'T1', status: 'COMPLETED' },
      { winnerId: 'T1', status: 'LIVE' }, // unfinished — ignored
    ];
    expect(teamFormStrip(matches, 'T1')).toEqual(['W', 'L', 'T', 'Q', 'W']);
  });
});

// ---------------------------------------------------------------------------
// §13.8 — PARTNERSHIP ANALYTICS
// ---------------------------------------------------------------------------

describe('§13.8 partnership analytics', () => {
  const stands = [
    { batsman1Id: 'A', batsman2Id: 'B', runs: 52, balls: 30, wicketNumber: 1, isOpen: false },
    { batsman1Id: 'A', batsman2Id: 'C', runs: 30, balls: 12, wicketNumber: 2, isOpen: false },
    { batsman1Id: 'C', batsman2Id: 'D', runs: 10, balls: 18, wicketNumber: 3, isOpen: false },
    { batsman1Id: 'D', batsman2Id: 'E', runs: 45, balls: 40, wicketNumber: 1, isOpen: false },
    { batsman1Id: 'E', batsman2Id: 'F', runs: 8, balls: 4, wicketNumber: 0, isOpen: true },
  ];

  test('per-wicket graph averages multiple stands at the same wicket number', () => {
    const a = partnershipAnalytics(stands);
    const w1 = a.perWicket.find((p) => p.wicketNumber === 1)!;
    expect(w1.count).toBe(2);
    expect(w1.avgRuns).toBe(48.5);
    expect(w1.avgBalls).toBe(35);
  });

  test('biggest stand by runs', () => {
    expect(partnershipAnalytics(stands).biggest!.runs).toBe(52);
  });

  test('fastest stand = highest run rate among ≥30-run stands (30 off 12 → 15/ov)', () => {
    const a = partnershipAnalytics(stands);
    expect(a.fastest!.runs).toBe(30);
    expect(a.fastest!.balls).toBe(12);
    expect(a.fastestRunRate).toBe(15);
  });

  test('sub-30-run stands are not eligible for "fastest"', () => {
    const a = partnershipAnalytics([stands[4]]);
    expect(a.fastest).toBeNull();
  });

  test('overall average stand counts closed stands only (137/4 = 34.3)', () => {
    expect(partnershipAnalytics(stands).avgStand).toBe(34.3);
  });

  test('every stand carries a per-over run rate', () => {
    const a = partnershipAnalytics(stands);
    expect(a.stands.find((s) => s.runs === 52)!.runRate).toBeCloseTo(10.4, 2);
  });
});

// ---------------------------------------------------------------------------
// §13.6 — CAREER AGGREGATES
// ---------------------------------------------------------------------------

describe('§13.6 career aggregates', () => {
  const bat = [
    { runs: 34, balls: 20, fours: 4, sixes: 0, isOut: true, date: '2026-01-01' },
    { runs: 12, balls: 8, fours: 1, sixes: 0, isOut: false, date: '2026-01-08' },
    { runs: 78, balls: 40, fours: 8, sixes: 4, isOut: true, date: '2026-01-22' },
  ];

  test('batting: runs, HS, average over dismissals, SR, fifties, not-outs', () => {
    const c = careerBatting(bat);
    expect(c.innings).toBe(3);
    expect(c.runs).toBe(124);
    expect(c.highest).toBe(78);
    expect(c.highestNotOut).toBe(false);
    expect(c.average).toBe(62);
    expect(c.strikeRate).toBeCloseTo(182.4, 1); // 124/68·100
    expect(c.fifties).toBe(1);
    expect(c.hundreds).toBe(0);
    expect(c.notOuts).toBe(1);
    expect(c.fours).toBe(13);
    expect(c.sixes).toBe(4);
  });

  test('batting: never-dismissed → null average (conventionally ∞)', () => {
    const c = careerBatting([{ runs: 30, balls: 20, fours: 3, sixes: 0, isOut: false }]);
    expect(c.average).toBeNull();
  });

  const bowl = [
    { completedOvers: 3, balls: 0, runs: 24, wickets: 2, date: '2026-01-01' },
    { completedOvers: 2, balls: 0, runs: 12, wickets: 3, date: '2026-01-08' },
    { completedOvers: 1, balls: 0, runs: 15, wickets: 0, date: '2026-01-22' },
  ];

  test('bowling: totals, economy, average, best figures by wickets-then-runs', () => {
    const c = careerBowling(bowl);
    expect(c.innings).toBe(3);
    expect(c.balls).toBe(36);
    expect(c.wickets).toBe(5);
    expect(c.runs).toBe(51);
    expect(c.economy).toBe(8.5);
    expect(c.average).toBeCloseTo(10.2, 2);
    expect(c.best).toEqual({ wickets: 3, runs: 12 });
    expect(c.fiveWicketHauls).toBe(0);
  });

  test('bowling: 5-wicket haul detection', () => {
    const c = careerBowling([{ completedOvers: 4, balls: 0, runs: 18, wickets: 5 }]);
    expect(c.fiveWicketHauls).toBe(1);
    expect(c.best).toEqual({ wickets: 5, runs: 18 });
  });

  test('milestones list: fifties + five-wicket hauls, newest first', () => {
    const ms = careerMilestones(bat, bowl);
    expect(ms.filter((m) => m.type === 'FIFTY')).toHaveLength(1);
    const haul = careerMilestones([], [{ completedOvers: 4, balls: 0, runs: 18, wickets: 5, date: '2026-02-01' }]);
    expect(haul[0].type).toBe('FIVE_WICKETS');
    expect(haul[0].label).toBe('5/18');
  });
});

// ---------------------------------------------------------------------------
// §13.2 — WAGON WHEEL GEOMETRY
// ---------------------------------------------------------------------------

describe('§13.2 wagon wheel', () => {
  test('8 sectors defined', () => {
    expect(WAGON_DIRECTIONS).toHaveLength(8);
  });

  test('V points straight up (0°); off-side sectors sit EAST of north', () => {
    expect(wagonAngle('V')).toBe(0);
    expect(wagonAngle('MID_OFF')).toBe(45);
    expect(wagonAngle('POINT')).toBe(100); // square on the off side
    expect(wagonAngle('SQUARE_LEG')).toBe(268); // square on the leg side (west)
  });

  test('left-handers are mirrored E↔W (V unchanged)', () => {
    expect(wagonAngle('V', true)).toBe(0);
    expect(wagonAngle('MID_OFF', true)).toBe(315);
    expect(wagonAngle('COVER', true)).toBe(290);
    expect(wagonAngle('MID_WICKET', true)).toBe(60);
  });

  test('compass → SVG coordinates (y grows downward)', () => {
    expect(compassToXY(0, 10)).toEqual({ x: 0, y: -10 }); // north = up
    const east = compassToXY(90, 5);
    expect(east.x).toBeCloseTo(5, 6);
    expect(east.y).toBeCloseTo(0, 6); // east = +x
    const south = compassToXY(180, 4);
    expect(south.y).toBeCloseTo(4, 6);
  });

  test('line radius scales with runs (boundaries reach the rope)', () => {
    expect(wagonRadiusForRuns(6)).toBeGreaterThan(wagonRadiusForRuns(4));
    expect(wagonRadiusForRuns(4)).toBeGreaterThan(wagonRadiusForRuns(1));
    expect(wagonRadiusForRuns(6)).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// §13.3 — PITCH MAP
// ---------------------------------------------------------------------------

describe('§13.3 pitch map', () => {
  test('5×5 length×line heatmap with distribution bars', () => {
    const hm = pitchHeatmap([
      { bowlerId: 'B', pitchLength: 'good', pitchLine: 'stumps' },
      { bowlerId: 'B', pitchLength: 'good', pitchLine: 'stumps' },
      { bowlerId: 'B', pitchLength: 'good', pitchLine: 'stumps', isWicket: true },
      { bowlerId: 'B', pitchLength: 'bouncer', pitchLine: 'leg' },
      { bowlerId: 'B', pitchLength: 'yorker' }, // no line — ignored
      { bowlerId: 'B', pitchLength: 'good', pitchLine: 'stumps', deletedAt: '2026-01-01' }, // undone — ignored
    ]);
    expect(hm.total).toBe(4);
    expect(hm.grid[PITCH_LENGTHS.indexOf('good')][PITCH_LINES.indexOf('stumps')]).toBe(3);
    expect(hm.grid[PITCH_LENGTHS.indexOf('bouncer')][PITCH_LINES.indexOf('leg')]).toBe(1);
    expect(hm.lengthTotals[PITCH_LENGTHS.indexOf('good')]).toBe(3);
    expect(hm.lineTotals[PITCH_LINES.indexOf('stumps')]).toBe(3);
    expect(hm.wicketGrid[PITCH_LENGTHS.indexOf('good')][PITCH_LINES.indexOf('stumps')]).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// §13.10 — MATCH REPORT PROMPT
// ---------------------------------------------------------------------------

describe('§13.10 match report prompt', () => {
  test('structured prompt carries the authoritative facts', () => {
    const prompt = buildMatchReportPrompt({
      team1: 'Shers',
      team2: 'Eagles',
      venue: 'Mohali gully',
      result: 'Eagles won by 5 runs',
      innings: [
        {
          battingTeam: 'Shers',
          runs: 112,
          wickets: 7,
          overs: '10.0',
          topScore: { name: 'Ravi', runs: 45, balls: 28 },
          bestBowling: { name: 'Imran', wickets: 3, runs: 21, overs: '2.0' },
        },
        {
          battingTeam: 'Eagles',
          runs: 107,
          wickets: 9,
          overs: '9.4',
          topScore: { name: 'Zaid', runs: 38, balls: 22 },
          bestBowling: null,
        },
      ],
      turningPoints: [{ overNumber: 15, runsInOver: 3, wicketsInOver: 2, swing: -0.37, wpBefore: 0.68, wpAfter: 0.31, label: '15th over: 2 wickets, 3 runs, WP 68%→31%' }],
      mvp: { name: 'Imran', mvp: 96 },
      biggestPartnership: { names: 'Ravi & Sam', runs: 64, balls: 38 },
    });
    expect(prompt).toContain('Eagles won by 5 runs');
    expect(prompt).toContain('112/7');
    expect(prompt).toContain('Ravi 45 (28b)');
    expect(prompt).toContain('Imran 3/21');
    expect(prompt).toContain('15th over: 2 wickets, 3 runs, WP 68%→31%');
    expect(prompt).toContain('Ravi & Sam');
    expect(prompt).toContain('Imran (96 points)');
    expect(prompt).toContain('do not invent');
  });
});
