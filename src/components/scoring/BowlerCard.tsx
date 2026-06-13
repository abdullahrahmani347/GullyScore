'use client';

import { useMatchStore } from '@/store/matchStore';
import { formatBowlingFigures, formatEconomy } from '@/lib/scoring-utils';
import type { InningsState } from '@/types';

interface BowlerCardProps {
  currentInnings: InningsState;
}

export function BowlerCard({ currentInnings }: BowlerCardProps) {
  const currentBowlerId = useMatchStore((s) => s.currentBowlerId);

  const bowler = currentInnings.bowling.find((b) => b.playerId === currentBowlerId);

  if (!bowler) {
    return (
      <div className="rounded-xl bg-bg-card border border-border px-3 py-2.5">
        <span className="text-xs text-t3">No bowler selected</span>
      </div>
    );
  }

  // Calculate this over's runs
  const currentOverBalls = currentInnings.balls.filter(
    (b) => b.overNumber === currentInnings.completedOvers && b.bowlerId === currentBowlerId
  );
  const thisOverRuns = currentOverBalls.reduce((acc, b) => {
    if (b.extraType === 'BYE' || b.extraType === 'LEG_BYE') return acc;
    return acc + b.runs + b.extraRuns;
  }, 0);

  return (
    <div className="rounded-xl bg-bg-card border border-border px-3 py-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium text-t3 uppercase tracking-wider">Bowling</span>
          <span className="text-sm font-semibold text-t2 truncate">{bowler.player.name}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-mono font-bold text-t1">
            {formatBowlingFigures(bowler.completedOvers, bowler.balls, bowler.runs, bowler.wickets)}
          </span>
          <span className="text-xs text-t3 font-mono w-14 text-right">
            Econ {formatEconomy(bowler.runs, bowler.completedOvers, bowler.balls)}
          </span>
        </div>
      </div>
      {currentOverBalls.length > 0 && (
        <div className="mt-1 pt-1 border-t border-border/50">
          <span className="text-[10px] text-t3">This over: <span className="text-t1 font-mono">{thisOverRuns}</span> runs</span>
        </div>
      )}
    </div>
  );
}
