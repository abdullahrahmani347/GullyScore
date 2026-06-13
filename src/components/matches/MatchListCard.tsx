'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Radio, CheckCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import type { MatchData, MatchStatus } from '@/types';
import { formatOvers } from '@/lib/scoring-utils';

interface MatchListCardProps {
  match: MatchData;
  index: number;
}

function StatusBadge({ status }: { status: MatchStatus }) {
  switch (status) {
    case 'LIVE':
    case 'INNINGS_BREAK':
      return (
        <span className="flex items-center gap-1 text-xs font-bold text-accent">
          <Radio size={10} fill="currentColor" className="animate-pulse" />
          LIVE
        </span>
      );
    case 'COMPLETED':
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-t3">
          <CheckCircle size={10} />
          Completed
        </span>
      );
    default:
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-t3">
          <Clock size={10} />
          {status === 'TOSS' ? 'Toss' : 'Upcoming'}
        </span>
      );
  }
}

export function MatchListCard({ match, index }: MatchListCardProps) {
  const inn1 = match.innings[0];
  const inn2 = match.innings[1];

  const isLive = match.status === 'LIVE' || match.status === 'INNINGS_BREAK';
  const isCompleted = match.status === 'COMPLETED';

  const matchHref = isCompleted
    ? `/matches/${match.id}/scorecard`
    : `/matches/${match.id}`;

  return (
    <Link href={matchHref}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: index * 0.04 }}
        className={`rounded-xl border bg-bg-card p-4 transition-colors ${
          isLive ? 'border-accent/30' : 'border-border hover:border-border-act'
        }`}
      >
        {/* Status & Date */}
        <div className="flex items-center justify-between mb-3">
          <StatusBadge status={match.status} />
          <span className="text-xs text-t3">
            {format(new Date(match.createdAt), 'dd MMM yyyy')}
          </span>
        </div>

        {/* Teams & Scores */}
        <div className="space-y-2">
          {/* Team 1 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: match.team1.color }} />
              <span className="text-sm font-semibold text-t1">{match.team1.name}</span>
            </div>
            {inn1 && (
              <span className="text-sm font-bold text-t1 font-[family-name:var(--font-mono)]">
                {inn1.runs}/{inn1.wickets}
                <span className="text-xs text-t3 ml-1">
                  ({formatOvers(inn1.completedOvers, inn1.currentBalls)})
                </span>
              </span>
            )}
          </div>

          {/* Team 2 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: match.team2.color }} />
              <span className="text-sm font-semibold text-t1">{match.team2.name}</span>
            </div>
            {inn2 && (
              <span className="text-sm font-bold text-t1 font-[family-name:var(--font-mono)]">
                {inn2.runs}/{inn2.wickets}
                <span className="text-xs text-t3 ml-1">
                  ({formatOvers(inn2.completedOvers, inn2.currentBalls)})
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Result */}
        {isCompleted && match.result && (
          <p className="text-xs text-accent font-medium mt-2 pt-2 border-t border-border truncate">
            {match.result}
          </p>
        )}

        {/* Match info */}
        <div className="flex items-center gap-3 mt-2 text-t3">
          <span className="text-xs">{match.totalOvers} overs</span>
          {match.venue && <span className="text-xs">• {match.venue}</span>}
        </div>
      </motion.div>
    </Link>
  );
}
