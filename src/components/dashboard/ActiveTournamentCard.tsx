'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import type { Tournament } from '@/types';

interface ActiveTournamentCardProps {
  tournament: Tournament;
  index: number;
}

export function ActiveTournamentCard({ tournament, index }: ActiveTournamentCardProps) {
  const completedMatches = tournament.matches.filter((m) => m.status === 'COMPLETED').length;
  const totalMatches = tournament.matches.length;

  return (
    <Link href={`/tournaments/${tournament.id}`}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: index * 0.05 }}
        className="rounded-xl border border-border bg-bg-card p-4 hover:border-border-act transition-colors"
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gold-dim">
              <Trophy size={16} className="text-gold" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-t1">{tournament.name}</h3>
              <p className="text-xs text-t3">{tournament.format === 'ROUND_ROBIN' ? 'Round Robin' : 'Knockout'} • {tournament.totalOvers} ov</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3">
          <span className="text-xs text-t2">{tournament.teams.length} teams</span>
          <div className="flex-1 h-1.5 rounded-full bg-bg-elevated overflow-hidden">
            <div
              className="h-full rounded-full bg-gold transition-all"
              style={{ width: totalMatches > 0 ? `${(completedMatches / totalMatches) * 100}%` : '0%' }}
            />
          </div>
          <span className="text-xs text-t2">{completedMatches}/{totalMatches}</span>
        </div>
      </motion.div>
    </Link>
  );
}
