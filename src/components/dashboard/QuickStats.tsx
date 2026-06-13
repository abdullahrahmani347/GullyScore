'use client';

import { Home, ClipboardList, Trophy } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface QuickStatsProps {
  totalMatches: number;
  totalTeams: number;
  totalTournaments: number;
  isLoading?: boolean;
}

export function QuickStats({ totalMatches, totalTeams, totalTournaments, isLoading }: QuickStatsProps) {
  const stats = [
    { label: 'Matches', value: totalMatches, icon: ClipboardList, color: 'text-accent' },
    { label: 'Teams', value: totalTeams, icon: Home, color: 'text-gold' },
    { label: 'Leagues', value: totalTournaments, icon: Trophy, color: 'text-run-6' },
  ];

  if (isLoading) {
    return (
      <div className="flex gap-3 px-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="flex-1 h-16 rounded-xl bg-bg-elevated" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-3 px-4">
      {stats.map(({ label, value, icon: Icon, color }) => (
        <div
          key={label}
          className="flex-1 flex flex-col items-center justify-center gap-1 rounded-xl border border-border bg-bg-card p-3"
        >
          <Icon size={18} className={color} />
          <span className="text-lg font-bold text-t1 leading-none">{value}</span>
          <span className="text-[10px] text-t3 uppercase tracking-wider">{label}</span>
        </div>
      ))}
    </div>
  );
}
