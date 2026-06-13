'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Radio, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import type { MatchStatus } from '@/types';

interface ScheduleMatch {
  id: string;
  team1: { id: string; name: string; shortName: string; color: string };
  team2: { id: string; name: string; shortName: string; color: string };
  status: MatchStatus;
  result?: string | null;
  winnerId?: string | null;
  innings: {
    teamId: string;
    runs: number;
    wickets: number;
    completedOvers: number;
    currentBalls: number;
    isCompleted: boolean;
  }[];
  createdAt: string;
}

interface ScheduleListProps {
  schedule: ScheduleMatch[];
}

function getStatusDisplay(status: MatchStatus) {
  switch (status) {
    case 'LIVE':
    case 'INNINGS_BREAK':
      return { label: 'LIVE', icon: Radio, color: 'text-accent', isLive: true };
    case 'COMPLETED':
      return { label: 'Completed', icon: CheckCircle, color: 'text-t3', isLive: false };
    case 'ABANDONED':
      return { label: 'Abandoned', icon: AlertTriangle, color: 'text-wicket', isLive: false };
    case 'TOSS':
      return { label: 'Toss', icon: Clock, color: 'text-gold', isLive: false };
    case 'UPCOMING':
    default:
      return { label: 'Upcoming', icon: Clock, color: 'text-t3', isLive: false };
  }
}

function getMatchHref(status: MatchStatus, matchId: string) {
  // UPCOMING/TOSS → scoring setup, LIVE/INNINGS_BREAK → scoring, COMPLETED → scorecard, ABANDONED → scorecard
  if (status === 'COMPLETED' || status === 'ABANDONED') {
    return `/matches/${matchId}/scorecard`;
  }
  return `/matches/${matchId}`;
}

function ScheduleList({ schedule }: ScheduleListProps) {
  if (schedule.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-bg-card p-8 text-center">
        <p className="text-sm text-t3">No matches scheduled</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {schedule.map((match, idx) => {
        const statusDisplay = getStatusDisplay(match.status);
        const StatusIcon = statusDisplay.icon;
        const matchHref = getMatchHref(match.status, match.id);
        const isLive = statusDisplay.isLive;
        const isAbandoned = match.status === 'ABANDONED';

        const inn1 = match.innings[0];
        const inn2 = match.innings[1];

        return (
          <Link key={match.id} href={matchHref}>
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: idx * 0.03 }}
              className={`rounded-xl border bg-bg-card p-3 transition-colors hover:border-border-act ${
                isLive
                  ? 'border-accent/30'
                  : isAbandoned
                  ? 'border-wicket/20'
                  : 'border-border'
              }`}
            >
              {/* Status & Date */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  {isLive && (
                    <StatusIcon
                      size={10}
                      fill="currentColor"
                      className={`${statusDisplay.color} animate-pulse`}
                    />
                  )}
                  {!isLive && <StatusIcon size={10} className={statusDisplay.color} />}
                  <span
                    className={`text-[10px] font-medium ${
                      isLive
                        ? 'text-accent font-bold'
                        : statusDisplay.color
                    }`}
                  >
                    {statusDisplay.label}
                  </span>
                </div>
                <span className="text-[10px] text-t3">
                  {format(new Date(match.createdAt), 'dd MMM')}
                </span>
              </div>

              {/* Teams & Scores */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: match.team1.color }}
                    />
                    <span className="text-xs font-semibold text-t1">
                      {match.team1.shortName || match.team1.name}
                    </span>
                  </div>
                  {inn1 && (
                    <span className="text-xs font-bold text-t1 font-[family-name:var(--font-mono)]">
                      {inn1.runs}/{inn1.wickets}
                      <span className="text-[10px] text-t3 ml-0.5">
                        ({inn1.completedOvers}.{inn1.currentBalls})
                      </span>
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: match.team2.color }}
                    />
                    <span className="text-xs font-semibold text-t1">
                      {match.team2.shortName || match.team2.name}
                    </span>
                  </div>
                  {inn2 && (
                    <span className="text-xs font-bold text-t1 font-[family-name:var(--font-mono)]">
                      {inn2.runs}/{inn2.wickets}
                      <span className="text-[10px] text-t3 ml-0.5">
                        ({inn2.completedOvers}.{inn2.currentBalls})
                      </span>
                    </span>
                  )}
                </div>
              </div>

              {/* Result */}
              {(match.status === 'COMPLETED' || match.status === 'ABANDONED') && match.result && (
                <p className={`text-[10px] font-medium mt-1.5 pt-1.5 border-t border-border/50 truncate ${
                  isAbandoned ? 'text-wicket' : 'text-accent'
                }`}>
                  {match.result}
                </p>
              )}
            </motion.div>
          </Link>
        );
      })}
    </div>
  );
}

export { ScheduleList };
