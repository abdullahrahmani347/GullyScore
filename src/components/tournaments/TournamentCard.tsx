'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Trophy, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import type { Tournament, TournamentStatus } from '@/types';

interface TournamentCardProps {
  tournament: Tournament;
  index: number;
  onDelete?: (tournament: Tournament) => void;
}

function StatusBadge({ status }: { status: TournamentStatus }) {
  switch (status) {
    case 'ONGOING':
      return (
        <span className="text-[10px] font-bold text-gold bg-gold-dim px-2 py-0.5 rounded-full">
          LIVE
        </span>
      );
    case 'COMPLETED':
      return (
        <span className="text-[10px] font-medium text-t3 bg-bg-elevated px-2 py-0.5 rounded-full">
          Completed
        </span>
      );
    default:
      return (
        <span className="text-[10px] font-medium text-t3 bg-bg-elevated px-2 py-0.5 rounded-full">
          Upcoming
        </span>
      );
  }
}

function TournamentCard({ tournament, index, onDelete }: TournamentCardProps) {
  const completedMatches = tournament.matches.filter(
    (m) => m.status === 'COMPLETED'
  ).length;
  const abandonedMatches = tournament.matches.filter(
    (m) => m.status === 'ABANDONED'
  ).length;
  const totalMatches = tournament.matches.length;
  const progress = totalMatches > 0 ? (completedMatches / totalMatches) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      className={`rounded-xl border bg-bg-card transition-colors hover:border-border-act ${
        tournament.status === 'ONGOING' ? 'border-gold/30' : 'border-border'
      }`}
    >
      <Link href={`/tournaments/${tournament.id}`} className="block p-4">
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gold-dim flex-shrink-0">
            <Trophy size={18} className="text-gold" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-sm text-t1 truncate">
                {tournament.name}
              </h3>
              <StatusBadge status={tournament.status} />
            </div>
            <p className="text-xs text-t3">
              {tournament.format === 'ROUND_ROBIN'
                ? 'Round Robin'
                : 'Knockout'}{' '}
              • {tournament.totalOvers} ov • {tournament.teams.length} teams
            </p>
            <div className="flex items-center gap-3 mt-2">
              <div className="flex-1 h-1.5 rounded-full bg-bg-elevated overflow-hidden">
                <div
                  className="h-full rounded-full bg-gold transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-t3 font-[family-name:var(--font-mono)]">
                {completedMatches}/{totalMatches}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-[10px] text-t3">
                Created {format(new Date(tournament.createdAt), 'dd MMM yyyy')}
              </p>
              {abandonedMatches > 0 && (
                <span className="text-[10px] text-wicket font-medium">
                  {abandonedMatches} abandoned
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>

      {onDelete && (
        <div className="border-t border-border/50 px-4 py-2 flex justify-end">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(tournament);
            }}
            className="flex items-center gap-1.5 text-xs text-t3 hover:text-wicket transition-colors px-2 py-1 rounded-lg hover:bg-wicket-bg"
          >
            <Trash2 size={12} />
            Delete
          </button>
        </div>
      )}
    </motion.div>
  );
}

export { TournamentCard };
