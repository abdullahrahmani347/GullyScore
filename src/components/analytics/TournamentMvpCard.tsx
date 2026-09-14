'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Medal } from 'lucide-react';
import { seasonMvpTable } from '@/lib/analytics-data';
import type { MatchData } from '@/types';

interface TournamentMvpCardProps {
  matches: MatchData[];
  /** teamId → shortName lookup for the side column. */
  teamNames?: Record<string, string>;
}

/**
 * v2 §13.5 — season/tournament MVP leaderboard: every player's MVP inputs
 * accumulated across the completed matches, one index per player.
 */
export function TournamentMvpCard({ matches, teamNames }: TournamentMvpCardProps) {
  const table = useMemo(() => seasonMvpTable(matches), [matches]);
  if (table.length === 0) return null;

  return (
    <div className="rounded-xl bg-bg-card border border-gold/25 px-3 py-2.5">
      <div className="flex items-center gap-2 mb-2">
        <Medal size={13} className="text-gold" />
        <span className="text-[10px] font-mono font-bold text-gold uppercase tracking-wider">
          Season MVP leaderboard
        </span>
        <span className="text-[9px] text-t3 ml-auto font-mono">{table.length} players</span>
      </div>
      <div className="space-y-1">
        {table.slice(0, 8).map((row, i) => (
          <div key={row.playerId} className="flex items-center justify-between text-[11px]">
            <Link
              href={`/players/${row.playerId}`}
              className="flex items-center gap-1.5 min-w-0 flex-1 hover:underline"
            >
              <span
                className={`font-mono w-4 shrink-0 ${i === 0 ? 'text-gold font-bold' : 'text-t3'}`}
              >
                {i + 1}.
              </span>
              <span className="text-t2 truncate">{row.name}</span>
              {teamNames?.[row.teamId] && (
                <span className="text-[8px] text-t3 shrink-0">({teamNames[row.teamId]})</span>
              )}
            </Link>
            <span className="flex items-center gap-2 shrink-0">
              <span className="text-[8px] text-t3 font-mono">{row.matchesPlayed}m</span>
              <span className={`font-mono font-semibold ${i === 0 ? 'text-gold' : 'text-t1'}`}>
                {row.mvp.toFixed(0)}
              </span>
            </span>
          </div>
        ))}
      </div>
      <p className="text-[8px] text-t3 mt-1.5 border-t border-border/50 pt-1.5">
        MVP = runs·1 + 4s·2 + 6s·3 + wkts·20 + maidens·10 + dots·1 + catches·12 + run-outs·15 + stumpings·12 − econ penalty
      </p>
    </div>
  );
}
