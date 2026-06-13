'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import type { Team } from '@/types';

interface TeamCardProps {
  team: Team;
  index: number;
}

export function TeamCard({ team, index }: TeamCardProps) {
  return (
    <Link href={`/teams/${team.id}`}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: index * 0.04 }}
        className="rounded-xl border border-border bg-bg-card p-4 hover:border-border-act transition-colors"
      >
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
            style={{ backgroundColor: team.color + '22' }}
          >
            {team.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-t1 truncate">{team.name}</h3>
            <p className="text-xs text-t3">{team.shortName}</p>
          </div>
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: team.color }}
          />
        </div>
        <div className="flex items-center gap-1 text-t3">
          <Users size={12} />
          <span className="text-xs">{team.players?.length ?? 0} players</span>
        </div>
      </motion.div>
    </Link>
  );
}
