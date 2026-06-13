'use client';

import useSWR from 'swr';
import { Skeleton } from '@/components/ui/skeleton';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { AppHeader } from '@/components/layout/AppHeader';
import { MatchCreateForm } from '@/components/matches/MatchCreateForm';
import type { Team } from '@/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function NewMatchPage() {
  const { data: teams, isLoading } = useSWR<Team[]>('/api/teams', fetcher);

  return (
    <PageWrapper>
      <AppHeader title="New Match" showBack />

      <div className="px-4 mt-4">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-40 rounded-lg bg-bg-card" />
            <Skeleton className="h-64 rounded-xl bg-bg-card" />
          </div>
        ) : teams && teams.length >= 2 ? (
          <MatchCreateForm teams={teams} />
        ) : (
          <div className="rounded-xl border border-border bg-bg-card p-8 text-center">
            <p className="text-sm text-t2 mb-2">You need at least 2 teams to create a match</p>
            <p className="text-xs text-t3">Go to the Teams tab to create your teams first</p>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
