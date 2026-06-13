'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { Plus, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { TournamentCard } from '@/components/tournaments/TournamentCard';
import type { Tournament } from '@/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function TournamentsPage() {
  const { data: tournaments, isLoading } = useSWR<Tournament[]>(
    '/api/tournaments',
    fetcher
  );

  return (
    <PageWrapper>
      {/* Header */}
      <div className="px-4 pt-6 pb-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-t1">Leagues</h1>
          <p className="text-sm text-t2 mt-0.5">Tournaments & leagues</p>
        </div>
        <Link href="/tournaments/new">
          <Button className="bg-accent text-bg-app hover:bg-accent/90 font-semibold rounded-xl h-10 px-4">
            <Plus size={18} className="mr-1" />
            Create
          </Button>
        </Link>
      </div>

      {/* Tournament List */}
      <div className="px-4 space-y-3 pb-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl bg-bg-card" />
          ))
        ) : tournaments && tournaments.length > 0 ? (
          tournaments.map((tournament, i) => (
            <TournamentCard
              key={tournament.id}
              tournament={tournament}
              index={i}
            />
          ))
        ) : (
          <div className="rounded-xl border border-border bg-bg-card p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-gold-dim flex items-center justify-center mx-auto mb-3">
              <Trophy size={22} className="text-gold" />
            </div>
            <p className="text-sm text-t3 mb-1">No leagues yet</p>
            <p className="text-xs text-t3 mb-4">
              Create teams first, then start a league
            </p>
            <Link href="/tournaments/new">
              <Button className="bg-accent text-bg-app hover:bg-accent/90 font-semibold rounded-xl h-10 px-6">
                <Plus size={18} className="mr-1" />
                Create League
              </Button>
            </Link>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
