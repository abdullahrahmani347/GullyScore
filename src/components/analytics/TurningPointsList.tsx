'use client';

import { useMemo } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { detectTurningPoints, type TurningPoint } from '@/lib/intelligence';
import { matchRulesFor } from '@/lib/scoring-context';
import type { BallRecord, MatchData } from '@/types';

interface TurningPointsListProps {
  match: MatchData;
  balls: BallRecord[];
  /** Compact mode for the live "Catch me up" digest. */
  compact?: boolean;
  /** Limit (defaults 5 compact / all full). */
  limit?: number;
}

/**
 * v2 §13.9 — overs where win probability swung > 15%. Renders the moments
 * feed used by the scorecard insights and the live "Catch me up" digest.
 */
export function TurningPointsList({ match, balls, compact = false, limit }: TurningPointsListProps) {
  const points: TurningPoint[] = useMemo(() => {
    const inningsNumber = match.innings?.find((i) => i.balls === balls)?.inningsNumber ?? 1;
    const target = match.innings?.find((i) => i.balls === balls)?.target ?? null;
    const rules = matchRulesFor(match, inningsNumber, target);
    return detectTurningPoints(balls as never, rules);
  }, [match, balls]);

  if (points.length === 0) return null;

  const shown = points.slice(-(limit ?? (compact ? 5 : points.length))).reverse();

  return (
    <div className="rounded-xl bg-bg-card border border-border px-3 py-2.5">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] text-t3 uppercase tracking-wider font-medium">Turning points</span>
        <span className="text-[9px] text-t3 ml-auto font-mono">{points.length} swing{points.length === 1 ? '' : 's'} &gt; 15%</span>
      </div>
      <div className="space-y-1">
        {shown.map((tp, i) => {
          const battingWonGround = tp.swing > 0;
          return (
            <div
              key={`${tp.overNumber}-${i}`}
              className="flex items-center gap-2 rounded-lg bg-bg-elevated px-2 py-1.5"
            >
              {battingWonGround ? (
                <TrendingUp size={12} className="text-accent shrink-0" />
              ) : (
                <TrendingDown size={12} className="text-wicket shrink-0" />
              )}
              <span className="text-[10px] font-mono text-t2">
                {compact ? tp.label.replace(` over:`, ':') : tp.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
