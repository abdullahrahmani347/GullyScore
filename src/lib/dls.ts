/**
 * GULLYSCORE v2 §12.3 — GULLY-DLS INTERRUPTION MANAGEMENT
 * ---------------------------------------------------------------------------
 * DLS Standard Edition resource-percentage method:
 *
 *     target = floor(runsFirst × R2 / R1) + 1
 *
 *   - R1 = resources available to the first innings (100% when uninterrupted)
 *   - R2 = resources available to the second innings, replayed from the FULL
 *     adjustments log (invariant 17 — never recomputed incrementally):
 *
 *         R2 = 100 + Σ_i [ R(remAfter_i, w_i) − R(remBefore_i, w_i) ]
 *
 *     where interruption i happened with `oversUsed_i` overs gone and
 *     `wickets_i` down; remBefore_i = curOvers_i − oversUsed_i,
 *     remAfter_i = newOvers_i − oversUsed_i.
 *
 * RESOURCE TABLE: the published 50-over × 10-wicket Standard Edition table
 * (src/lib/dls-table.json), LINEARLY SCALED to the match length:
 * R(oversLeft, wickets, N) = table50(oversLeft × 50 / N, wickets), with
 * linear interpolation between whole rows. This scaling is a DOCUMENTED
 * APPROXIMATION of the per-format tables (a 20-over match's 10-overs-left
 * percentage is approximated by the 50-over table's 25-overs-left row).
 *
 * FALLBACK (feature flag `dls` off or table missing):
 *     target = floor(runsFirst × ballsRemaining2 / ballsTotal1) + 1
 *     labelled "approx" in the audit log and the live banner.
 *
 * Reduce-only: every adjustment must lower the remaining overs — mid-match
 * increases are refused. Manual override requires the organizer PIN
 * (§19.4) and is logged with method "manual".
 *
 * This module is PURE — it imports only the resource table, so it runs in
 * the browser (banner preview), API routes, and tests alike.
 */

import table from './dls-table.json';

export type DlsMethod = 'dls' | 'approx' | 'manual';

/** One entry of Match.adjustments (persisted as a JSON string on SQLite). */
export interface TargetAdjustment {
  at: string; // ISO timestamp
  innings: 1 | 2; // which innings the reduction applied to
  from: number; // overs before this adjustment
  to: number; // overs after (must be < from)
  oversUsed: number; // legal overs progress of the affected innings at adjustment time
  wickets: number; // wickets down at adjustment time
  reason: string;
  method: DlsMethod;
  newTarget?: number | null; // computed target at this point (audit)
}

const TABLE: Record<string, number[]> = (table as { table: Record<string, number[]> }).table;
const MAX_OVERS = 50;

/** Raw 50-over table lookup with linear interpolation on fractional overs. */
function table50(oversLeft: number, wickets: number): number {
  const w = Math.min(9, Math.max(0, Math.floor(wickets)));
  const o = Math.min(MAX_OVERS, Math.max(0, oversLeft));
  const lo = Math.floor(o);
  const hi = Math.ceil(o);
  if (lo === hi) {
    const row = TABLE[String(lo)];
    return row ? row[w] : 0;
  }
  const rowLo = TABLE[String(lo)];
  const rowHi = TABLE[String(hi)];
  if (!rowLo || !rowHi) return rowLo?.[w] ?? rowHi?.[w] ?? 0;
  const frac = o - lo;
  return rowLo[w] + (rowHi[w] - rowLo[w]) * frac;
}

/** Table availability (flag check happens at the route layer). */
export function dlsTableAvailable(): boolean {
  return TABLE != null && TABLE['50'] != null && TABLE['50'][0] === 100.0;
}

/**
 * Resource % remaining for an innings of `totalOvers` scheduled overs with
 * `oversLeft` overs still to bowl and `wickets` down — the §12.3 scaling.
 */
export function resourcePercent(oversLeft: number, wickets: number, totalOvers: number): number {
  const n = Math.max(1, totalOvers);
  // Clamp: an innings cannot have more overs left than were scheduled.
  const clamped = Math.min(oversLeft, n);
  return Math.round(table50(clamped * (MAX_OVERS / n), wickets) * 10) / 10;
}

export interface TargetResult {
  target: number;
  method: DlsMethod;
  /** Resources R2 (percent) — exposed for tests and the audit banner. */
  r2: number;
}

/**
 * Recompute the chase target from the FULL adjustments log (invariant 17).
 * `originalOvers` = overs scheduled for innings 2 when it STARTED.
 */
export function computeChaseTarget(params: {
  runsFirst: number;
  originalOvers: number;
  adjustments: TargetAdjustment[];
  useDls?: boolean;
}): TargetResult {
  const { runsFirst, originalOvers, adjustments } = params;
  const useDls = params.useDls ?? dlsTableAvailable();

  if (!useDls || !dlsTableAvailable()) {
    // Approx fallback: proportional-overs method (documented as crude).
    const last = adjustments[adjustments.length - 1];
    const newOvers = last ? last.to : originalOvers;
    const oversUsed = last ? last.oversUsed : 0;
    const ballsRemaining2 = Math.max(0, newOvers - oversUsed);
    const target = Math.floor((runsFirst * ballsRemaining2) / originalOvers) + 1;
    return { target, method: 'approx', r2: (100 * ballsRemaining2) / originalOvers };
  }

  let curOvers = originalOvers;
  let r2 = 100; // resource(originalOvers, 0) = 100 by construction
  for (const adj of adjustments) {
    if (adj.innings !== 2) continue;
    const remBefore = Math.max(0, curOvers - adj.oversUsed);
    const remAfter = Math.max(0, adj.to - adj.oversUsed);
    r2 += resourcePercent(remAfter, adj.wickets, originalOvers) - resourcePercent(remBefore, adj.wickets, originalOvers);
    curOvers = adj.to;
  }
  const target = Math.floor((runsFirst * r2) / 100) + 1;
  return { target, method: 'dls', r2: Math.round(r2 * 10) / 10 };
}

/**
 * Resources the FIRST innings actually had, replayed from its own
 * adjustments — used at the innings break when innings 1 was shortened.
 */
export function computeFirstInningsResources(
  originalOvers: number,
  adjustments: TargetAdjustment[],
  useDls = true
): number {
  if (!useDls || !dlsTableAvailable()) return 100;
  let curOvers = originalOvers;
  let r1 = 100;
  for (const adj of adjustments) {
    if (adj.innings !== 1) continue;
    const remBefore = Math.max(0, curOvers - adj.oversUsed);
    const remAfter = Math.max(0, adj.to - adj.oversUsed);
    r1 += resourcePercent(remAfter, adj.wickets, originalOvers) - resourcePercent(remBefore, adj.wickets, originalOvers);
    curOvers = adj.to;
  }
  return Math.round(r1 * 10) / 10;
}

/**
 * Target at the innings break: DLS when innings 1 was interrupted
 * (R1 < 100 or innings 2 has a different overs allocation), else v1
 * parity runsFirst + 1. Bowling-side penalty runs banked during innings 1
 * are added to the chase (§12.5).
 */
export function targetAtBreak(params: {
  runsFirst: number;
  originalOversFirst: number;
  oversScheduledSecond: number;
  adjustments: TargetAdjustment[];
  penaltyRunsBowling?: number;
  useDls?: boolean;
}): TargetResult {
  const { runsFirst, originalOversFirst, oversScheduledSecond, adjustments, penaltyRunsBowling = 0 } = params;
  const useDls = params.useDls ?? dlsTableAvailable();
  const anyAdjustments = adjustments.some((a) => a.innings === 1);

  if (!anyAdjustments || !useDls || !dlsTableAvailable()) {
    // v1 parity: straight target = runs + 1 (+ banked bowling penalties).
    return { target: runsFirst + penaltyRunsBowling + 1, method: 'dls', r2: 100 };
  }

  const r1 = computeFirstInningsResources(originalOversFirst, adjustments, useDls);
  const r2 = resourcePercent(oversScheduledSecond, 0, originalOversFirst);
  const target = Math.floor((runsFirst * r2) / r1) + 1 + penaltyRunsBowling;
  return { target, method: 'dls', r2 };
}

/** Parse a persisted Match.adjustments JSON string (defensive). */
export function parseAdjustments(json: string | null | undefined): TargetAdjustment[] {
  if (json == null || json.trim() === '') return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is TargetAdjustment =>
        typeof a === 'object' && a !== null && typeof a.at === 'string' && typeof a.to === 'number'
    );
  } catch {
    return [];
  }
}

/** Serialize adjustments for persistence. */
export function serializeAdjustments(adjustments: TargetAdjustment[]): string {
  return JSON.stringify(adjustments);
}

// ---------------------------------------------------------------------------
// Pure tests are in src/lib/dls.test.ts (bun test).
// The AC fixture: a 20-over match, 100 runs in innings 1, innings 2 reduced
// 20 → 15 overs with 0 wickets down → target 87 (DLS).
// ---------------------------------------------------------------------------
