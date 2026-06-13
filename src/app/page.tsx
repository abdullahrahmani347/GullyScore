'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { Plus, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { QuickStats } from '@/components/dashboard/QuickStats';
import { LiveMatchBanner } from '@/components/dashboard/LiveMatchBanner';
import { RecentMatchCard } from '@/components/dashboard/RecentMatchCard';
import { ActiveTournamentCard } from '@/components/dashboard/ActiveTournamentCard';
import type { MatchData, Tournament } from '@/types';

interface DashboardStats {
  totalMatches: number;
  totalTeams: number;
  totalTournaments: number;
  liveMatches: MatchData[];
  recentMatches: MatchData[];
  activeTournaments: Tournament[];
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function DashboardPage() {
  const { data, isLoading } = useSWR<DashboardStats>('/api/stats', fetcher, {
    refreshInterval: 10000,
  });

  const hasLiveMatches = data?.liveMatches && data.liveMatches.length > 0;

  return (
    <PageWrapper>
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-t1 flex items-center gap-2">
              <Zap size={24} className="text-accent" />
              GullyScore
            </h1>
            <p className="text-sm text-t2 mt-0.5">Cricket scoring, simplified</p>
          </div>
          <Link href="/matches/new">
            <Button
              className="bg-accent text-bg-app hover:bg-accent/90 font-semibold rounded-xl h-10 px-4"
            >
              <Plus size={18} className="mr-1" />
              New Match
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick Stats */}
      <QuickStats
        totalMatches={data?.totalMatches ?? 0}
        totalTeams={data?.totalTeams ?? 0}
        totalTournaments={data?.totalTournaments ?? 0}
        isLoading={isLoading}
      />

      {/* Live Match Banner */}
      <div className="mt-6">
        <h2 className="px-4 text-sm font-semibold text-t2 uppercase tracking-wider mb-3">Live Matches</h2>
        {isLoading ? (
          <div className="px-4">
            <Skeleton className="w-full h-40 rounded-2xl bg-bg-card" />
          </div>
        ) : hasLiveMatches ? (
          <div className="flex flex-col gap-3">
            {data.liveMatches.map((match) => (
              <LiveMatchBanner key={match.id} match={match} />
            ))}
          </div>
        ) : (
          <div className="mx-4 rounded-2xl border border-border bg-bg-card p-6 flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-accent-dim flex items-center justify-center mb-3">
              <Zap size={22} className="text-accent" />
            </div>
            <p className="text-sm text-t2 mb-1">No live matches</p>
            <p className="text-xs text-t3 mb-4">Start a new match to begin scoring</p>
            <Link href="/matches/new">
              <Button className="bg-accent text-bg-app hover:bg-accent/90 font-semibold rounded-xl h-10 px-6">
                <Plus size={18} className="mr-1" />
                Start Match
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Recent Matches */}
      <div className="mt-8">
        <div className="flex items-center justify-between px-4 mb-3">
          <h2 className="text-sm font-semibold text-t2 uppercase tracking-wider">Recent Matches</h2>
          {data?.recentMatches && data.recentMatches.length > 0 && (
            <Link href="/matches" className="text-xs text-accent font-medium">
              View All
            </Link>
          )}
        </div>
        {isLoading ? (
          <div className="flex gap-3 px-4 overflow-x-auto">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="min-w-[260px] h-[130px] rounded-xl bg-bg-card" />
            ))}
          </div>
        ) : data?.recentMatches && data.recentMatches.length > 0 ? (
          <div className="flex gap-3 px-4 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
            {data.recentMatches.map((match, i) => (
              <RecentMatchCard key={match.id} match={match} index={i} />
            ))}
          </div>
        ) : (
          <div className="px-4">
            <div className="rounded-xl border border-border bg-bg-card p-6 text-center">
              <p className="text-sm text-t3">No matches yet. Create your first match!</p>
            </div>
          </div>
        )}
      </div>

      {/* Active Tournaments */}
      <div className="mt-8 pb-4">
        <div className="flex items-center justify-between px-4 mb-3">
          <h2 className="text-sm font-semibold text-t2 uppercase tracking-wider">Active Leagues</h2>
          {data?.activeTournaments && data.activeTournaments.length > 0 && (
            <Link href="/tournaments" className="text-xs text-accent font-medium">
              View All
            </Link>
          )}
        </div>
        {isLoading ? (
          <div className="flex flex-col gap-3 px-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="w-full h-24 rounded-xl bg-bg-card" />
            ))}
          </div>
        ) : data?.activeTournaments && data.activeTournaments.length > 0 ? (
          <div className="flex flex-col gap-3 px-4">
            {data.activeTournaments.map((tournament, i) => (
              <ActiveTournamentCard key={tournament.id} tournament={tournament} index={i} />
            ))}
          </div>
        ) : (
          <div className="px-4">
            <div className="rounded-xl border border-border bg-bg-card p-6 text-center">
              <p className="text-sm text-t3">No active leagues</p>
            </div>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
