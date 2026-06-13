'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Radio, CheckCircle, Clock, XCircle, MoreVertical, Trash2, Ban } from 'lucide-react';
import { format } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import type { MatchData, MatchStatus } from '@/types';
import { formatOvers } from '@/lib/scoring-utils';

interface MatchListCardProps {
  match: MatchData;
  index: number;
  onAbandon?: (match: MatchData) => void;
  onDelete?: (match: MatchData) => void;
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
    case 'ABANDONED':
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-orange-400">
          <XCircle size={10} />
          Abandoned
        </span>
      );
    case 'UPCOMING':
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-t3">
          <Clock size={10} />
          Upcoming
        </span>
      );
    case 'TOSS':
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-t3">
          <Clock size={10} />
          Toss
        </span>
      );
    default:
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-t3">
          <Clock size={10} />
          {status}
        </span>
      );
  }
}

export function MatchListCard({ match, index, onAbandon, onDelete }: MatchListCardProps) {
  const inn1 = match.innings[0];
  const inn2 = match.innings[1];

  const isLive = match.status === 'LIVE' || match.status === 'INNINGS_BREAK';
  const isCompleted = match.status === 'COMPLETED';
  const isAbandoned = match.status === 'ABANDONED';

  const matchHref =
    isCompleted || isAbandoned
      ? `/matches/${match.id}/scorecard`
      : `/matches/${match.id}`;

  const showAbandon = isLive && onAbandon;
  const showDelete = !isLive && onDelete;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      className={`relative rounded-xl border bg-bg-card transition-colors ${
        isLive ? 'border-accent/30' : isAbandoned ? 'border-orange-400/20' : 'border-border hover:border-border-act'
      }`}
    >
      <Link href={matchHref} className="block p-4">
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
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: match.team1.color }}
              />
              <span className="text-sm font-semibold text-t1">
                {match.team1.name}
              </span>
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
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: match.team2.color }}
              />
              <span className="text-sm font-semibold text-t1">
                {match.team2.name}
              </span>
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
        {(isCompleted || isAbandoned) && match.result && (
          <p className={`text-xs font-medium mt-2 pt-2 border-t border-border truncate ${isAbandoned ? 'text-orange-400' : 'text-accent'}`}>
            {match.result}
          </p>
        )}

        {/* Match info */}
        <div className="flex items-center gap-3 mt-2 text-t3">
          <span className="text-xs">{match.totalOvers} overs</span>
          {match.venue && <span className="text-xs">• {match.venue}</span>}
        </div>
      </Link>

      {/* Dropdown menu — outside Link so it doesn't navigate */}
      {(showAbandon || showDelete) && (
        <div className="absolute top-3 right-3 z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-1.5 rounded-md hover:bg-white/10 transition-colors text-t3 hover:text-t1"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {showAbandon && (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAbandon(match);
                  }}
                >
                  <Ban size={14} />
                  Abandon Match
                </DropdownMenuItem>
              )}
              {showAbandon && showDelete && <DropdownMenuSeparator />}
              {showDelete && (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(match);
                  }}
                >
                  <Trash2 size={14} />
                  Delete Match
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </motion.div>
  );
}
