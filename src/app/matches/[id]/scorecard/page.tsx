'use client';

import useSWR from 'swr';
import { useParams } from 'next/navigation';
import { ScorecardView } from '@/components/scorecard/ScorecardView';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Share2 } from 'lucide-react';
import Link from 'next/link';
import { safeDeviceFetcher } from '@/lib/device';

const fetcher = safeDeviceFetcher;

export default function ScorecardPage() {
  const params = useParams();
  const matchId = params.id as string;
  const { data: match, isLoading } = useSWR(
    `/api/matches/${matchId}/scorecard`,
    fetcher
  );

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-bg-app">
        <header className="sticky top-0 z-40 glass border-b border-border flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 text-t2">
            <ArrowLeft size={20} />
            <span className="text-sm">Back</span>
          </div>
          <h1 className="text-sm font-semibold text-t1">Scorecard</h1>
          <div className="w-5" />
        </header>
        <div className="p-4 space-y-4">
          <Skeleton className="h-48 rounded-2xl bg-bg-card" />
          <Skeleton className="h-64 rounded-xl bg-bg-card" />
          <Skeleton className="h-32 rounded-xl bg-bg-card" />
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="min-h-dvh bg-bg-app flex items-center justify-center">
        <div className="text-center">
          <p className="text-t3 text-sm">Match not found</p>
          <Link
            href="/matches"
            className="text-accent text-xs mt-2 inline-block"
          >
            Back to Matches
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-bg-app">
      <header className="sticky top-0 z-40 glass border-b border-border flex items-center justify-between px-4 py-3">
        <Link
          href="/matches"
          className="flex items-center gap-2 text-t2 hover:text-t1 transition-colors"
        >
          <ArrowLeft size={20} />
          <span className="text-sm">Back</span>
        </Link>
        <h1 className="text-sm font-semibold text-t1">Scorecard</h1>
        <div className="w-5" />
      </header>
      <ScorecardView match={match} />
    </div>
  );
}
