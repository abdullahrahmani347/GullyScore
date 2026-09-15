/**
 * v2 §17.3 — POINTS-TABLE TIEBREAKERS + NRR TRANSPARENCY
 * ---------------------------------------------------------------------------
 * Ranking chain (first decisive criterion wins):
 *   1. Points (descending)
 *   2. Net Run Rate (descending)
 *   3. Head-to-head wins between the tied pair
 *   4. Most wins overall
 *   5. Organizer "drawing of lots" — persisted via lotsOrder (JSON teamIds)
 *
 * When two or more rows tie through criterion 4 and no lots order covers
 * them yet, they are flagged `needsLots: true` so the organizer tool can
 * offer the dice. Last-write-wins is NOT used here — standings are derived,
 * the lots order is the only persisted organizer override.
 *
 * NRR (transparency, for the UI tooltip):
 *   NRR = (runs scored / overs faced) − (runs conceded / overs bowled)
 *   - overs use the 0.1 cricket notation: an over written "9.4" means
 *     9 complete overs + 4 balls = (9 + 4/6) real overs.
 *   - an all-out innings counts the FULL quota of overs as faced/bowled
 *     (enforced upstream at write time, §7.4).
 */

export interface StandingsRow {
  teamId: string;
  team: { id: string; name: string; shortName: string; color: string; emoji: string } & Record<string, unknown>;
  played: number;
  won: number;
  lost: number;
  tied: number;
  points: number;
  nrr: number;
  runsScored: number;
  runsConceded: number;
  oversFaced: number;
  oversBowled: number;
}

export interface MinimalMatch {
  id: string;
  team1Id: string;
  team2Id: string;
  status: string;
  winnerId: string | null;
}

/** Sort comparator helper — head-to-head wins of a against b. */
function headToHeadWins(aId: string, bId: string, matches: MinimalMatch[]): number {
  let wins = 0;
  for (const m of matches) {
    if (m.status !== 'COMPLETED' || !m.winnerId) continue;
    const involvesPair =
      (m.team1Id === aId && m.team2Id === bId) || (m.team1Id === bId && m.team2Id === aId);
    if (involvesPair && m.winnerId === aId) wins++;
  }
  return wins;
}

/** Format an overs decimal (schema stores REAL overs) for display. */
export function formatOvers(overs: number): string {
  const full = Math.floor(overs);
  const balls = Math.round((overs - full) * 10);
  return `${full}.${balls}`;
}

/** Worked-example lines for the NRR tooltip (§17.3 transparency). */
export function nrrWorkedExample(row: {
  runsScored: number;
  oversFaced: number;
  runsConceded: number;
  oversBowled: number;
}): string[] {
  const forRate = row.oversFaced > 0 ? row.runsScored / row.oversFaced : 0;
  const againstRate = row.oversBowled > 0 ? row.runsConceded / row.oversBowled : 0;
  const nrr = forRate - againstRate;
  return [
    `Runs scored ${row.runsScored} ÷ overs faced ${formatOvers(row.oversFaced)} = ${forRate.toFixed(3)}`,
    `Runs conceded ${row.runsConceded} ÷ overs bowled ${formatOvers(row.oversBowled)} = ${againstRate.toFixed(3)}`,
    `NRR = ${forRate.toFixed(3)} − ${againstRate.toFixed(3)} = ${nrr >= 0 ? '+' : ''}${nrr.toFixed(3)}`,
  ];
}

/**
 * Apply the full §17.3 tiebreaker chain.
 *
 * @param rows           standings rows (already aggregated upstream)
 * @param matches        the tournament's matches (for head-to-head)
 * @param lotsOrder      persisted organizer lots result (teamIds in final order)
 */
export function rankStandings<Row extends StandingsRow>(
  rows: Row[],
  matches: MinimalMatch[],
  lotsOrder: string[] | null = null,
): (Row & { needsLots: boolean })[] {
  const lotsIndex = new Map((lotsOrder ?? []).map((teamId, i) => [teamId, i]));

  const sorted = [...rows].sort((a, b) => {
    // 1. points
    if (b.points !== a.points) return b.points - a.points;
    // 2. NRR
    if (b.nrr !== a.nrr) return b.nrr - a.nrr;
    // 3. head-to-head (a's wins over b minus b's wins over a — positive
    //    means a ranks FIRST, so we subtract b's wins from a's)
    const h2h = headToHeadWins(a.teamId, b.teamId, matches) - headToHeadWins(b.teamId, a.teamId, matches);
    if (h2h !== 0) return -h2h;
    // 4. most wins overall
    if (b.won !== a.won) return b.won - a.won;
    // 5. drawing of lots (organizer override)
    const ai = lotsIndex.get(a.teamId);
    const bi = lotsIndex.get(b.teamId);
    if (ai != null && bi != null) return ai - bi;
    // stable fallback: original order
    return 0;
  });

  // Flag fully-tied groups that still need the lots tool.
  const out = sorted.map((row) => ({ ...row, needsLots: false }));
  for (let i = 0; i < out.length; i++) {
    const j = firstDifferent(out, i, matches, lotsIndex);
    if (j > i + 1) {
      // rows i..j-1 tie on every objective criterion — needsLots unless the
      // lots order already disambiguates ALL of them.
      const allLotsed = out.slice(i, j).every((r) => lotsIndex.has(r.teamId));
      if (!allLotsed) {
        for (let k = i; k < j; k++) out[k].needsLots = true;
      }
      i = j - 1;
    }
  }
  return out;
}

/** Index of the first row after `from` that differs on any objective criterion. */
function firstDifferent<Row extends StandingsRow>(
  rows: (Row & { needsLots: boolean })[],
  from: number,
  matches: MinimalMatch[],
  lotsIndex: Map<string, number>,
): number {
  const a = rows[from];
  for (let j = from + 1; j < rows.length; j++) {
    const b = rows[j];
    if (b.points !== a.points) return j;
    if (b.nrr !== a.nrr) return j;
    if (headToHeadWins(a.teamId, b.teamId, matches) !== headToHeadWins(b.teamId, a.teamId, matches)) return j;
    if (b.won !== a.won) return j;
    // both in lots order with a defined relative position → differentiated
    const ai = lotsIndex.get(a.teamId);
    const bi = lotsIndex.get(b.teamId);
    if (ai != null && bi != null && ai !== bi) return j;
  }
  return rows.length;
}

/**
 * §17.3 drawing of lots — random order for a fully-tied group.
 * Pure function so it is unit-testable; the API route persists the result.
 */
export function drawLots(teamIds: string[]): string[] {
  const shuffled = [...teamIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
