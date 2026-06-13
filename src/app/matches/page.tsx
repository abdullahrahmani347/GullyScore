'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { MatchListCard } from '@/components/matches/MatchListCard';
import type { MatchData, MatchStatus } from '@/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const FILTERS: { label: string; value: MatchStatus | 'ALL' }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Live', value: 'LIVE' },
  { label: 'Completed', value: 'COMPLETED' },
];

export default function MatchesPage() {
  const [filter, setFilter] = useState<MatchStatus | 'ALL'>('ALL');

  const { data: matches, isLoading } = useSWR<MatchData[]>(
    `/api/matches${filter !== 'ALL' ? `?status=${filter}` : ''}`,
    fetcher,
    { refreshInterval: 10000 }
  );

  return (
    <PageWrapper>
      {/* Header */}
      <div className="px-4 pt-6 pb-2">
        <h1 className="text-2xl font-bold text-t1">Matches</h1>
        <p className="text-sm text-t2 mt-0.5">All your cricket matches</p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 px-4 pb-3">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f.value
                ? 'bg-accent-dim text-accent border border-accent/30'
                : 'bg-bg-card text-t3 border border-border hover:border-border-act'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Match List */}
      <div className="px-4 space-y-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[140px] rounded-xl bg-bg-card" />
          ))
        ) : matches && matches.length > 0 ? (
          <motion.div layout className="space-y-3">
            {matches.map((match, i) => (
              <MatchListCard key={match.id} match={match} index={i} />
            ))}
          </motion.div>
        ) : (
          <div className="rounded-xl border border-border bg-bg-card p-8 text-center">
            <p className="text-sm text-t3">
              {filter !== 'ALL' ? `No ${filter.toLowerCase()} matches` : 'No matches yet'}
            </p>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
