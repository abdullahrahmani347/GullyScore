'use client';

import { useMatchStore } from '@/store/matchStore';
import { formatStrikeRate } from '@/lib/scoring-utils';
import type { InningsState, MatchData } from '@/types';

interface BatsmenCardProps {
  match: MatchData;
  currentInnings: InningsState;
}

export function BatsmenCard({ match, currentInnings }: BatsmenCardProps) {
  const strikerId = useMatchStore((s) => s.strikerId);
  const nonStrikerId = useMatchStore((s) => s.nonStrikerId);

  const striker = currentInnings.batting.find((b) => b.playerId === strikerId);
  const nonStriker = currentInnings.batting.find((b) => b.playerId === nonStrikerId);

  if (!striker && !nonStriker) return null;

  return (
    <div className="rounded-xl bg-bg-card border border-border px-3 py-2.5">
      <div className="space-y-2">
        {/* Striker */}
        {striker && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-accent text-[10px]">&#9679;</span>
              <span className="text-sm font-semibold text-accent truncate">
                {striker.player.name}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-sm font-mono font-bold text-t1">
                {striker.runs}<span className="text-t3 font-normal">({striker.balls})</span>
              </span>
              <span className="text-xs text-t3 font-mono w-12 text-right">
                SR {formatStrikeRate(striker.runs, striker.balls)}
              </span>
            </div>
          </div>
        )}

        {/* Non-striker */}
        {nonStriker && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-t3 text-[10px]">&#9675;</span>
              <span className="text-sm text-t2 truncate">
                {nonStriker.player.name}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-sm font-mono text-t2">
                {nonStriker.runs}<span className="text-t3 font-normal">({nonStriker.balls})</span>
              </span>
              <span className="text-xs text-t3 font-mono w-12 text-right">
                SR {formatStrikeRate(nonStriker.runs, nonStriker.balls)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
