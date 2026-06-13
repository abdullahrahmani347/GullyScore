'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import type { MatchData } from '@/types';
import { format } from 'date-fns';

interface RecentMatchCardProps {
  match: MatchData;
  index: number;
}

export function RecentMatchCard({ match, index }: RecentMatchCardProps) {
  const inn1 = match.innings[0];
  const inn2 = match.innings[1];
  const isCompleted = match.status === 'COMPLETED';
  const matchHref = isCompleted ? `/matches/${match.id}/scorecard` : `/matches/${match.id}`;

  return (
    <Link href={matchHref}>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, delay: index * 0.05 }}
        className="min-w-[260px] rounded-xl border border-border bg-bg-card p-3.5 hover:border-border-act transition-colors"
      >
        {/* Team 1 */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: match.team1.color }} />
            <span className="font-semibold text-sm text-t1">{match.team1.shortName}</span>
          </div>
          {inn1 && (
            <span className="text-sm font-bold text-t1 font-[family-name:var(--font-mono)]">
              {inn1.runs}/{inn1.wickets}
              <span className="text-xs text-t3 ml-1">
                ({inn1.completedOvers}.{inn1.currentBalls})
              </span>
            </span>
          )}
        </div>

        {/* Team 2 */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: match.team2.color }} />
            <span className="font-semibold text-sm text-t1">{match.team2.shortName}</span>
          </div>
          {inn2 && (
            <span className="text-sm font-bold text-t1 font-[family-name:var(--font-mono)]">
              {inn2.runs}/{inn2.wickets}
              <span className="text-xs text-t3 ml-1">
                ({inn2.completedOvers}.{inn2.currentBalls})
              </span>
            </span>
          )}
        </div>

        {/* Result & Date */}
        <div className="mt-2 pt-2 border-t border-border">
          {match.result ? (
            <p className="text-xs text-accent font-medium truncate">{match.result}</p>
          ) : (
            <p className="text-xs text-t3">No result</p>
          )}
          <p className="text-[10px] text-t3 mt-0.5">
            {format(new Date(match.createdAt), 'dd MMM yyyy')}
          </p>
        </div>
      </motion.div>
    </Link>
  );
}
