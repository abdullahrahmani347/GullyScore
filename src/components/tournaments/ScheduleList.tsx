'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Radio, CheckCircle, Clock } from 'lucide-react';
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
        const isLive = match.status === 'LIVE' || match.status === 'INNINGS_BREAK';
        const isCompleted = match.status === 'COMPLETED';
        const matchHref = isCompleted
          ? `/matches/${match.id}/scorecard`
          : `/matches/${match.id}`;

        const inn1 = match.innings[0];
        const inn2 = match.innings[1];

        return (
          <Link key={match.id} href={matchHref}>
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: idx * 0.03 }}
              className={`rounded-xl border bg-bg-card p-3 transition-colors hover:border-border-act ${
                isLive ? 'border-accent/30' : 'border-border'
              }`}
            >
              {/* Status & Date */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  {isLive && (
                    <Radio
                      size={10}
                      fill="currentColor"
                      className="text-accent animate-pulse"
                    />
                  )}
                  {isCompleted && <CheckCircle size={10} className="text-t3" />}
                  {!isLive && !isCompleted && (
                    <Clock size={10} className="text-t3" />
                  )}
                  <span
                    className={`text-[10px] font-medium ${
                      isLive
                        ? 'text-accent font-bold'
                        : 'text-t3'
                    }`}
                  >
                    {isLive
                      ? 'LIVE'
                      : isCompleted
                      ? 'Completed'
                      : match.status === 'TOSS'
                      ? 'Toss'
                      : 'Upcoming'}
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
              {isCompleted && match.result && (
                <p className="text-[10px] text-accent font-medium mt-1.5 pt-1.5 border-t border-border/50 truncate">
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
