'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Medal } from 'lucide-react';
import { matchMvpTable } from '@/lib/analytics-data';
import type { MatchData } from '@/types';

/**
 * v2 §13.5 — per-match MVP card: the match MVP with a weighted-points
 * breakdown, plus an expandable top-5 leaderboard (both teams).
 */
export function MvpCard({ match }: { match: MatchData }) {
  const [open, setOpen] = useState(false);
  const table = useMemo(() => matchMvpTable(match), [match]);
  if (table.length === 0) return null;

  const mvp = table[0];
  const teamColor = mvp.teamId === match.team1Id ? match.team1?.color : match.team2?.color;
  const teamName = mvp.teamId === match.team1Id ? match.team1?.name : match.team2?.name;

  return (
    <div className="rounded-xl bg-bg-card border border-gold/25 px-3 py-2.5">
      <div className="flex items-center gap-2 mb-2">
        <Medal size={14} className="text-gold" />
        <span className="text-[10px] font-mono font-bold text-gold uppercase tracking-wider">
          Player of the Match
        </span>
        <span className="text-[9px] text-t3 ml-auto">MVP index {mvp.mvp.toFixed(0)}</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: teamColor }} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-t1 truncate">{mvp.name}</p>
            <p className="text-[10px] text-t3 truncate">{teamName}</p>
          </div>
        </div>
        {/* Breakdown chips */}
        <div className="flex items-center gap-1 flex-wrap justify-end max-w-[55%]">
          {mvp.breakdown.slice(0, 4).map((b) => (
            <motion.span
              key={b.key}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded-full border ${
                b.points < 0
                  ? 'bg-wicket/10 border-wicket/30 text-wicket'
                  : 'bg-accent/10 border-accent/25 text-accent'
              }`}
            >
              {b.label === 'Runs' || b.label === 'Wickets' ? `${b.value}${b.label[0]}` : b.label}{' '}
              {b.points > 0 ? '+' : ''}{b.points}
            </motion.span>
          ))}
        </div>
      </div>

      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left text-[10px] text-t3 hover:text-t2 pt-2 transition-colors"
      >
        {open ? 'Hide' : 'Show'} MVP leaderboard ({table.length})
      </button>

      {open && (
        <div className="mt-1.5 pt-1.5 border-t border-border/50 space-y-1">
          {table.slice(0, 5).map((row, i) => (
            <div key={row.playerId} className="flex items-center justify-between text-[10px]">
              <span className="text-t2 truncate">
                <span className="text-t3 font-mono mr-1.5">{i + 1}.</span>
                {row.name}
                <span className="text-t3 ml-1.5">
                  ({row.teamId === match.team1Id ? match.team1?.shortName : match.team2?.shortName})
                </span>
              </span>
              <span className="font-mono font-semibold text-t1">{row.mvp.toFixed(0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
