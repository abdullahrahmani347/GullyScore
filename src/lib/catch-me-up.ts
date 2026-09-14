/**
 * GULLYSCORE v2 §15.5 — "CATCH ME UP" 5-BULLET TEMPLATE SUMMARY (pure)
 * ---------------------------------------------------------------------------
 * Renders turning points (§13.9) as a 5-bullet digest so a late joiner
 * understands the match without reading every ball:
 *
 *   1. Where it stands (score/overs/chase or projection)
 *   2–4. Top turning points (fall back to milestones/partnership/powerplay)
 *   5. The player of the moment (top bat + best bowl)
 *
 * PURE — identical on server (OG/story cards) and client (live page).
 */

import type { BallRecord, InningsState, MatchData } from '@/types';
import { matchRulesFor } from './scoring-context';
import { detectTurningPoints } from './intelligence';
import { calculateRRR } from './scoring-utils';
import type { BallEvent } from './engine';

export interface CatchMeUpBullet {
  kind: 'state' | 'turn' | 'star' | 'fill';
  text: string;
}

const MAX_BULLETS = 5;

export function catchMeUpSummary(
  match: MatchData,
  currentInnings: InningsState | null
): CatchMeUpBullet[] {
  if (!currentInnings) {
    const bullets: CatchMeUpBullet[] = [];
    if (match.result) bullets.push({ kind: 'state', text: match.result });
    for (const inn of match.innings ?? []) {
      bullets.push({
        kind: 'fill',
        text: `${inn.team?.name ?? 'Innings ' + inn.inningsNumber}: ${inn.runs}/${inn.wickets} (${inn.completedOvers}.${inn.currentBalls} ov)`,
      });
    }
    return bullets.slice(0, MAX_BULLETS);
  }

  const bullets: CatchMeUpBullet[] = [];

  /* ── 1. Where it stands ── */
  const overs = currentInnings.completedOvers + (currentInnings.currentBalls ?? 0) / 6;
  const crr = overs > 0 ? currentInnings.runs / overs : 0;
  const teamName = currentInnings.team?.name ?? 'Batting side';
  let state = `${teamName} ${currentInnings.runs}/${currentInnings.wickets} after ${currentInnings.completedOvers}.${currentInnings.currentBalls} ov (CRR ${crr.toFixed(1)})`;
  if (currentInnings.inningsNumber === 2 && currentInnings.target != null) {
    const need = currentInnings.target - currentInnings.runs;
    const ballsLeft = Math.max(match.totalOvers * 6 - (currentInnings.completedOvers * 6 + currentInnings.currentBalls), 0);
    const rrr = calculateRRR(
      need,
      match.totalOvers,
      currentInnings.completedOvers,
      currentInnings.currentBalls
    );
    state +=
      need > 0
        ? ` — chasing ${currentInnings.target}, need ${need} off ${ballsLeft} (RRR ${rrr?.toFixed(1) ?? '—'})`
        : ` — target ${currentInnings.target} reached`;
  } else if (overs > 0 && !currentInnings.isCompleted) {
    const projected = Math.round(crr * match.totalOvers);
    state += ` — on pace for ~${projected}`;
  }
  bullets.push({ kind: 'state', text: state });

  /* ── 2–4. Turning points (with graceful fillers) ── */
  const rules = matchRulesFor(
    match,
    currentInnings.inningsNumber,
    currentInnings.target ?? null
  );
  const liveBalls = (currentInnings.balls ?? []) as unknown as BallEvent[];
  const turns = detectTurningPoints(liveBalls, rules).slice(0, 3);
  for (const t of turns) {
    bullets.push({ kind: 'turn', text: t.label });
  }

  if (bullets.length < MAX_BULLETS - 1) {
    // Fillers in priority order: milestone, partnership, powerplay
    const batting = currentInnings.batting ?? [];
    const topBat = [...batting].sort((a, b) => b.runs - a.runs)[0];
    if (topBat && topBat.runs >= 50) {
      bullets.push({
        kind: 'fill',
        text: `${topBat.player?.name ?? 'Batter'} reached ${topBat.runs >= 100 ? 'a century' : 'a fifty'} — ${topBat.runs} off ${topBat.balls}`,
      });
    }
    const open = (currentInnings.partnerships ?? []).find((p) => p.isOpen);
    if (bullets.length < MAX_BULLETS - 1 && open && open.runs >= 30) {
      bullets.push({
        kind: 'fill',
        text: `Current stand: ${open.batsman1?.name ?? '?'} & ${open.batsman2?.name ?? '?'} have added ${open.runs} off ${open.balls}`,
      });
    }
    if (bullets.length < MAX_BULLETS - 1 && rules.powerplayOvers > 0 && currentInnings.completedOvers >= rules.powerplayOvers) {
      const ppBalls = liveBalls.filter(
        (b) => (b as { overNumber?: number }).overNumber != null &&
          (b as { overNumber?: number }).overNumber! < rules.powerplayOvers && !b.deletedAt
      );
      const ppRuns = ppBalls.reduce((acc, b) => acc + b.runs + b.extraRuns, 0);
      const ppWkts = ppBalls.filter((b) => b.isWicket).length;
      bullets.push({
        kind: 'fill',
        text: `Powerplay: ${ppRuns}/${ppWkts} in ${rules.powerplayOvers} overs`,
      });
    }
  }

  /* ── 5. Player of the moment ── */
  const topBatter = [...(currentInnings.batting ?? [])]
    .filter((b) => !b.isOut)
    .sort((a, b) => b.runs - a.runs)[0];
  const bestBowler = [...(currentInnings.bowling ?? [])]
    .filter((b) => b.balls > 0 || b.completedOvers > 0)
    .sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)[0];
  const parts: string[] = [];
  if (topBatter && topBatter.runs > 0) {
    parts.push(`${topBatter.player?.name ?? 'Batter'} ${topBatter.runs}(${topBatter.balls})`);
  }
  if (bestBowler && (bestBowler.wickets > 0 || bestBowler.balls >= 6)) {
    parts.push(
      `${bestBowler.player?.name ?? 'Bowler'} ${bestBowler.wickets}/${bestBowler.runs}`
    );
  }
  if (parts.length > 0) {
    bullets.push({ kind: 'star', text: `In form: ${parts.join(' · ')}` });
  }

  return bullets.slice(0, MAX_BULLETS);
}
