'use client';

import { useEffect, useRef } from 'react';
import { useMatchStore } from '@/store/matchStore';
import { formatOvers } from '@/lib/scoring-utils';
import { overRateFromBalls } from '@/lib/scoring-ux';
import { toast } from 'sonner';
import type { InningsState, MatchData, Player } from '@/types';

interface ContextFooterProps {
  match: MatchData;
  currentInnings: InningsState;
}

function findPlayer(match: MatchData, teamId: string, playerId: string | null | undefined): Player | undefined {
  if (!playerId) return undefined;
  const team = teamId === match.team1Id ? match.team1 : match.team2;
  return team.players.find((p) => p.id === playerId);
}

/**
 * v2 §14.7 — the persistent context strip:
 *   "3.4 · Kohli 41(24) · Bumrah 2-0-14-1 · need 43 off 28"
 * Team-tinted (§14.0) and over-rate aware: per-ball timestamps drive the
 * pace stats and a toast warns when the average interval tops 90 s
 * (throttled to once per over so it never spams).
 */
export function ContextFooter({ match, currentInnings }: ContextFooterProps) {
  const strikerId = useMatchStore((s) => s.strikerId);
  const nonStrikerId = useMatchStore((s) => s.nonStrikerId);
  // §14.7 — pure bookkeeping (which over we last warned about): a ref, not
  // state — no render depends on it, so it never needs to re-render anyone.
  const slowWarnedRef = useRef<string | null>(null);

  const striker = findPlayer(match, currentInnings.teamId, strikerId);
  const nonStriker = findPlayer(match, currentInnings.teamId, nonStrikerId);
  const bowlerId = currentInnings.currentBowlerId;
  const bowlerRow = (currentInnings.bowling ?? []).find((b) => b.playerId === bowlerId);
  const bowler = bowlerRow?.player ?? findPlayer(match, currentInnings.teamId === match.team1Id ? match.team2Id : match.team1Id, bowlerId);

  const strikerBat = strikerId
    ? (currentInnings.batting ?? []).find((b) => b.playerId === strikerId)
    : undefined;
  const nonStrikerBat = nonStrikerId
    ? (currentInnings.batting ?? []).find((b) => b.playerId === nonStrikerId)
    : undefined;

  const runs = currentInnings.runs;
  const wickets = currentInnings.wickets;
  const oversText = formatOvers(currentInnings.completedOvers, currentInnings.currentBalls);

  // §14.7 — chase context (2nd innings)
  const target = currentInnings.target;
  const isSecondInnings = currentInnings.inningsNumber === 2 && target != null;
  const runsNeeded = isSecondInnings ? Math.max(0, target - runs) : null;
  const ballsRemaining = isSecondInnings
    ? Math.max(0, match.totalOvers * 6 - (currentInnings.completedOvers * 6 + currentInnings.currentBalls))
    : null;

  // §14.7 — over-rate from stored per-ball timestamps
  const stats = overRateFromBalls(currentInnings.balls ?? []);
  const overKey = `${currentInnings.completedOvers}-${currentInnings.currentBalls}`;

  useEffect(() => {
    if (!stats.slow) {
      // Pace recovered — allow future warnings.
      slowWarnedRef.current = null;
      return;
    }
    // Warn at most once per over: warnId is keyed to the over number.
    const warnId = `over-${currentInnings.id}-${currentInnings.completedOvers}`;
    if (slowWarnedRef.current === warnId) return;
    slowWarnedRef.current = warnId;
    toast.warning(
      `Slow over rate — ${Math.round(stats.avgIntervalSec ?? 0)}s between balls (target ≤ 90s). ${stats.oversPerHour != null ? `${stats.oversPerHour.toFixed(1)} ov/hr.` : ''}`,
      { duration: 4000 }
    );
  }, [overKey, stats.slow, stats.avgIntervalSec, stats.oversPerHour, currentInnings.completedOvers, currentInnings.id]);

  const paceLabel = stats.oversPerHour != null ? `${stats.oversPerHour.toFixed(1)} ov/hr` : null;

  return (
    <div
      className="rounded-xl border border-border px-3 py-1.5 flex items-center gap-2 overflow-x-auto text-[11px] font-mono whitespace-nowrap"
      style={{ background: 'var(--team-tint)' }}
      role="status"
      aria-label="Match context"
    >
      <span className="text-t1 font-semibold">{oversText}</span>
      <span className="text-t3" aria-hidden>·</span>
      {striker && (
        <span className="text-t2">
          <span className="text-t1">{striker.name.split(' ').slice(-1)[0]}</span>{' '}
          {strikerBat ? `${strikerBat.runs}(${strikerBat.balls})` : '0(0)'}
          {nonStriker && (
            <span className="text-t3">
              {' '}/ {nonStriker.name.split(' ').slice(-1)[0]}{' '}
              {nonStrikerBat ? `${nonStrikerBat.runs}(${nonStrikerBat.balls})` : '0(0)'}
            </span>
          )}
        </span>
      )}
      <span className="text-t3" aria-hidden>·</span>
      {bowler && (
        <span className="text-t2">
          {bowler.name.split(' ').slice(-1)[0]}{' '}
          <span className="text-t1">
            {bowlerRow
              ? `${bowlerRow.completedOvers}-${bowlerRow.maidens}-${bowlerRow.runs}-${bowlerRow.wickets}`
              : '0-0-0-0'}
          </span>
        </span>
      )}
      {isSecondInnings && runsNeeded != null && runsNeeded > 0 && ballsRemaining != null && (
        <>
          <span className="text-t3" aria-hidden>·</span>
          <span className={runsNeeded <= 10 ? 'text-warn font-semibold' : 'text-t2'}>
            need {runsNeeded} off {ballsRemaining}
          </span>
        </>
      )}
      {isSecondInnings && runsNeeded === 0 && (
        <>
          <span className="text-t3" aria-hidden>·</span>
          <span className="text-accent font-semibold">scores level</span>
        </>
      )}
      {paceLabel && (
        <>
          <span className="text-t3" aria-hidden>·</span>
          <span className={stats.slow ? 'text-warn' : 'text-t3'}>{paceLabel}</span>
        </>
      )}
      <span className="ml-auto text-t3 shrink-0">
        {runs}/{wickets}
      </span>
    </div>
  );
}
