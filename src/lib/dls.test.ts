/**
 * GULLYSCORE v2 §12.3 — GULLY-DLS TESTS
 * ---------------------------------------------------------------------------
 * AC (spec): "fixture asserts the exact recomputed target for a 20→15-over
 * interruption with 0 wickets down; a second interruption recomputes from
 * the full log, never incrementally."
 *
 * Run:  bun test src/lib/dls.test.ts
 */

import { describe, test, expect } from 'bun:test';
import {
  resourcePercent,
  computeChaseTarget,
  computeFirstInningsResources,
  targetAtBreak,
  parseAdjustments,
  serializeAdjustments,
  dlsTableAvailable,
  type TargetAdjustment,
} from './dls';

describe('resource table', () => {
  test('table available; 50 overs / 0 wickets = 100%', () => {
    expect(dlsTableAvailable()).toBe(true);
    expect(resourcePercent(50, 0, 50)).toBe(100);
    expect(resourcePercent(25, 0, 50)).toBe(70.6);
    expect(resourcePercent(0, 0, 50)).toBe(0);
  });

  test('scaling: a 20-over innings reads the 50-over table at 2.5×', () => {
    // 20 of 20 overs left = 100%
    expect(resourcePercent(20, 0, 20)).toBe(100);
    // 10 of 20 overs left → table row 25 → 70.6
    expect(resourcePercent(10, 0, 20)).toBe(70.6);
    // 5 of 20 overs left → table row 12.5 → between 12 (47.8) and 13 (50.2) = 49.0
    expect(resourcePercent(5, 0, 20)).toBe(49);
  });

  test('fractional overs interpolate linearly', () => {
    // 37.5 overs left in a 50-over innings: rows 37 (86.3) and 38 (87.5) → 86.9
    expect(resourcePercent(37.5, 0, 50)).toBe(86.9);
  });

  test('wickets lost reduce resources monotonically', () => {
    let prev = Infinity;
    for (let w = 0; w <= 9; w++) {
      const r = resourcePercent(30, w, 50);
      expect(r).toBeLessThan(prev);
      prev = r;
    }
  });
});

describe('computeChaseTarget (full-log replay)', () => {
  const base = { runsFirst: 100, originalOvers: 20 };

  test('AC: 20 → 15 over interruption, 0 wickets, 0 overs used → target 87 (DLS)', () => {
    const adjustments: TargetAdjustment[] = [
      {
        at: '2026-09-14T10:00:00Z',
        innings: 2,
        from: 20,
        to: 15,
        oversUsed: 0,
        wickets: 0,
        reason: 'rain',
        method: 'dls',
      },
    ];
    const res = computeChaseTarget({ ...base, adjustments });
    // R2 = 100 + R(15 left, 0 w | scale 20) − R(20 left, 0 w) = 86.9
    expect(res.r2).toBe(86.9);
    // target = floor(100 × 86.9 / 100) + 1 = 87 — the spec's example banner
    expect(res.target).toBe(87);
    expect(res.method).toBe('dls');
  });

  test('mid-innings interruption: 5 overs used, 20 → 15', () => {
    const adjustments: TargetAdjustment[] = [
      {
        at: '2026-09-14T10:00:00Z',
        innings: 2,
        from: 20,
        to: 15,
        oversUsed: 5,
        wickets: 0,
        reason: 'rain',
        method: 'dls',
      },
    ];
    const res = computeChaseTarget({ ...base, adjustments });
    // R2 = 100 + R(10, 0) − R(15, 0) = 100 + 70.6 − 86.9 = 83.7
    expect(res.r2).toBe(83.7);
    expect(res.target).toBe(84); // floor(83.7) + 1
  });

  test('AC: a second interruption recomputes from the FULL log, never incrementally', () => {
    // Interruption 1: at 5 overs used (0 wickets), 20 → 17.
    // Interruption 2: at 10 overs used (1 wicket), 17 → 15.
    const adjustments: TargetAdjustment[] = [
      { at: '2026-09-14T10:00:00Z', innings: 2, from: 20, to: 17, oversUsed: 5, wickets: 0, reason: 'rain 1', method: 'dls' },
      { at: '2026-09-14T11:00:00Z', innings: 2, from: 17, to: 15, oversUsed: 10, wickets: 1, reason: 'rain 2', method: 'dls' },
    ];
    const res = computeChaseTarget({ ...base, adjustments });

    // Full-log replay (the ONLY correct computation):
    //   curOvers=20 → adj1: R(17−5=12, 0) − R(20−5=15, 0); curOvers=17
    //   adj2:       R(15−10=5, 1) − R(17−10=7, 1); curOvers=15
    const r12 = resourcePercent(12, 0, 20);
    const r15 = resourcePercent(15, 0, 20);
    const r5w1 = resourcePercent(5, 1, 20);
    const r7w1 = resourcePercent(7, 1, 20);
    const expectedR2 = 100 + (r12 - r15) + (r5w1 - r7w1);
    expect(res.r2).toBeCloseTo(expectedR2, 1);

    // The incremental (WRONG) computation would restart from the second
    // adjustment only — assert the full-log replay differs from it.
    const incrementalR2 = 100 + (r5w1 - r7w1);
    expect(Math.abs(expectedR2 - incrementalR2)).toBeGreaterThan(0.5);
    expect(res.method).toBe('dls');
  });

  test('no adjustments → target = runsFirst + 1 (v1 parity)', () => {
    const res = computeChaseTarget({ ...base, adjustments: [] });
    expect(res.target).toBe(101);
    expect(res.r2).toBe(100);
  });

  test('approx fallback when the table is unavailable / flag off', () => {
    const adjustments: TargetAdjustment[] = [
      { at: '2026-09-14T10:00:00Z', innings: 2, from: 20, to: 15, oversUsed: 0, wickets: 0, reason: 'rain', method: 'approx' },
    ];
    const res = computeChaseTarget({ ...base, adjustments, useDls: false });
    expect(res.method).toBe('approx');
    // floor(100 × 15/20) + 1 = 76
    expect(res.target).toBe(76);
  });

  test('wickets down at the interruption reduce the resource LOSS (DLS-correct direction)', () => {
    // A team 5 down has fewer valuable overs left, so losing overs hurts
    // LESS: their total resources (and the recomputed target) stay HIGHER
    // than a 0-wicket team facing the same reduction.
    const noWickets = computeChaseTarget({
      runsFirst: 100,
      originalOvers: 20,
      adjustments: [{ at: 't', innings: 2, from: 20, to: 15, oversUsed: 10, wickets: 0, reason: 'r', method: 'dls' }],
    });
    const fiveWickets = computeChaseTarget({
      runsFirst: 100,
      originalOvers: 20,
      adjustments: [{ at: 't', innings: 2, from: 20, to: 15, oversUsed: 10, wickets: 5, reason: 'r', method: 'dls' }],
    });
    expect(fiveWickets.r2).toBeGreaterThan(noWickets.r2);
    expect(fiveWickets.target).toBeGreaterThanOrEqual(noWickets.target);
  });
});

describe('first-innings resources + targetAtBreak', () => {
  test('uninterrupted first innings → R1 = 100 and v1 target = runs + 1', () => {
    expect(computeFirstInningsResources(20, [])).toBe(100);
    const res = targetAtBreak({ runsFirst: 87, originalOversFirst: 20, oversScheduledSecond: 20, adjustments: [] });
    expect(res.target).toBe(88);
  });

  test('symmetric reduction (both innings 20 → 15) keeps the target fair', () => {
    const adjustments: TargetAdjustment[] = [
      { at: 't', innings: 1, from: 20, to: 15, oversUsed: 0, wickets: 0, reason: 'rain before innings 2', method: 'dls' },
    ];
    const res = targetAtBreak({
      runsFirst: 87,
      originalOversFirst: 20,
      oversScheduledSecond: 15,
      adjustments,
    });
    // R1 = 86.9 (lost 13.1% before a ball was bowled); R2 = 86.9 → target 88
    expect(res.target).toBe(88);
  });

  test('bowling-side penalty runs banked in innings 1 raise the target (§12.5)', () => {
    const res = targetAtBreak({
      runsFirst: 87,
      originalOversFirst: 20,
      oversScheduledSecond: 20,
      adjustments: [],
      penaltyRunsBowling: 5,
    });
    expect(res.target).toBe(93);
  });
});

describe('adjustment log serialization', () => {
  test('round trip parse/serialize preserves entries', () => {
    const adjustments: TargetAdjustment[] = [
      { at: '2026-09-14T10:00:00Z', innings: 2, from: 20, to: 15, oversUsed: 5, wickets: 0, reason: 'rain', method: 'dls', newTarget: 87 },
    ];
    const json = serializeAdjustments(adjustments);
    expect(parseAdjustments(json)).toEqual(adjustments);
  });

  test('malformed / non-array JSON → empty log (fail safe to v1)', () => {
    expect(parseAdjustments(null)).toEqual([]);
    expect(parseAdjustments('')).toEqual([]);
    expect(parseAdjustments('{oops')).toEqual([]);
    expect(parseAdjustments('"hello"')).toEqual([]);
    expect(parseAdjustments(JSON.stringify({ not: 'array' }))).toEqual([]);
  });
});
