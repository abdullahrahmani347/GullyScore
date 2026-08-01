'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { Plus, AlertTriangle, RefreshCw, Sun, Moon, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { QuickStats } from '@/components/dashboard/QuickStats';
import { LiveMatchBanner } from '@/components/dashboard/LiveMatchBanner';
import { RecentMatchCard } from '@/components/dashboard/RecentMatchCard';
import { ActiveTournamentCard } from '@/components/dashboard/ActiveTournamentCard';
import { LogoLockup, LogoMark } from '@/components/brand/Logo';
import { safeDeviceFetcher } from '@/lib/device';
import { useSettingsStore } from '@/store/settingsStore';
import type { MatchData, Tournament } from '@/types';

interface DashboardStats {
  totalMatches: number;
  totalTeams: number;
  totalTournaments: number;
  liveMatches: MatchData[];
  recentMatches: MatchData[];
  activeTournaments: Tournament[];
}

function ThemeToggle() {
  const { theme, setTheme } = useSettingsStore();

  // Cycle: dark → amoled → light → dark
  const toggleTheme = () => {
    const next: typeof theme = theme === 'dark' ? 'amoled' : theme === 'amoled' ? 'light' : 'dark';
    setTheme(next);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className="h-9 w-9 rounded-xl text-t2 hover:text-t1 hover:bg-bg-card flex-shrink-0"
      aria-label={`Current theme: ${theme}. Click to switch.`}
    >
      {theme === 'dark' ? <Moon size={18} /> : theme === 'amoled' ? <Smartphone size={18} /> : <Sun size={18} />}
    </Button>
  );
}

export default function DashboardPage() {
  const { data, isLoading, error, mutate } = useSWR<DashboardStats>('/api/stats', safeDeviceFetcher, {
    refreshInterval: 10000,
  });
  const isError = !!error;

  const hasLiveMatches = data?.liveMatches && data.liveMatches.length > 0;

  if (isError) {
    return (
      <PageWrapper>
        <div className="px-4 pt-6 pb-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-t1 flex items-center gap-2">
                <LogoMark size={24} className="flex-shrink-0" />
                <span>GullyScore</span>
              </h1>
              <p className="text-sm text-t2 mt-0.5">Cricket scoring, simplified</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <ThemeToggle />
              <Link href="/matches/new">
                <Button className="bg-accent text-bg-app hover:bg-accent/90 font-semibold rounded-xl h-9 px-3 text-sm">
                  <Plus size={16} className="mr-1" />
                  <span className="hidden xs:inline">New Match</span>
                  <span className="xs:hidden">New</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
        <div className="px-4">
          <div className="rounded-2xl border border-wicket/20 bg-wicket/5 p-8 flex flex-col items-center justify-center text-center">
            <AlertTriangle size={40} className="text-wicket mb-3" />
            <p className="text-sm font-medium text-t1 mb-1">Failed to load dashboard</p>
            <p className="text-xs text-t3 mb-4">Something went wrong while fetching your data</p>
            <Button
              onClick={() => mutate()}
              variant="outline"
              className="rounded-xl border-border text-t2 hover:text-t1"
            >
              <RefreshCw size={14} className="mr-1.5" />
              Retry
            </Button>
          </div>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      {/* Header - Responsive with theme toggle and new match button */}
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-t1 flex items-center gap-2">
              <LogoMark size={24} className="flex-shrink-0" />
              <span>GullyScore</span>
            </h1>
            <p className="text-sm text-t2 mt-0.5">Cricket scoring, simplified</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <ThemeToggle />
            <Link href="/matches/new">
              <Button className="bg-accent text-bg-app hover:bg-accent/90 font-semibold rounded-xl h-9 px-3 text-sm">
                <Plus size={16} className="mr-1" />
                <span className="sm:inline hidden">New Match</span>
                <span className="sm:hidden">New</span>
              </Button>
            </Link>
          </div>
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
            {data!.liveMatches.map((match) => (
              <LiveMatchBanner key={match.id} match={match} />
            ))}
          </div>
        ) : (
          <div className="mx-4 rounded-2xl border border-border bg-bg-card p-6 flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-accent-dim flex items-center justify-center mb-3">
              <LogoMark size={22} className="text-accent" />
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
