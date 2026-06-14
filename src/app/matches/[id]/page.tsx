'use client';

import { Component, useState, useEffect, useRef } from 'react';
import useSWR from 'swr';
import { useParams, useRouter } from 'next/navigation';
import { Ban, AlertTriangle, ArrowLeft, QrCode, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { useMatchStore } from '@/store/matchStore';
import { ScoringScreen } from '@/components/scoring/ScoringScreen';
import { LiveShareModal } from '@/components/scoring/LiveShareModal';
import { OfflineIndicator, RecoveryScreen } from '@/components/offline';
import { useConnectivity, useOfflineSync } from '@/hooks/useConnectivity';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import type { MatchData } from '@/types';

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error('Failed to fetch');
    return r.json();
  });

/* ─── Error Boundary ─── */

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback: (error: Error, reset: () => void) => React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ScoringErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      return this.props.fallback(this.state.error, this.reset);
    }
    return this.props.children;
  }
}

function ErrorFallback({ error, onReset }: { error: Error; onReset: () => void }) {
  const router = useRouter();

  return (
    <div className="min-h-dvh bg-bg-app flex items-center justify-center p-4">
      <div className="rounded-xl border border-border bg-bg-card p-8 text-center max-w-sm w-full">
        <AlertTriangle size={40} className="mx-auto mb-4 text-orange-400" />
        <h2 className="text-lg font-semibold text-t1 mb-2">Something went wrong</h2>
        <p className="text-sm text-t3 mb-1">
          An unexpected error occurred while scoring.
        </p>
        <p className="text-xs text-t3 mb-6 bg-bg-app rounded-md p-2 font-mono break-all">
          {error.message}
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onReset}
            className="w-full px-4 py-2.5 rounded-lg bg-accent-dim text-accent text-sm font-medium hover:bg-accent/20 transition-colors"
          >
            Try Again
          </button>
          <button
            onClick={() => router.push('/matches')}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border text-t2 text-sm font-medium hover:bg-white/5 transition-colors"
          >
            <ArrowLeft size={14} />
            Go to Matches
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Abandon Match Button ─── */

function AbandonMatchButton({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAbandon = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/matches/${matchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ABANDONED', result: 'Match abandoned' }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to abandon match');
        return;
      }

      toast.success('Match abandoned');
      router.push('/matches');
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-orange-400 hover:bg-orange-400/10 transition-colors"
      >
        <Ban size={12} />
        Abandon
      </button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="bg-bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-t1">Abandon Match?</AlertDialogTitle>
            <AlertDialogDescription className="text-t3">
              This will end the match immediately. The match will be marked as
              abandoned and cannot be resumed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading} className="border-border text-t2 hover:bg-white/5">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAbandon}
              disabled={loading}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Abandoning...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Ban size={14} />
                  Abandon Match
                </span>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ─── Main Scoring Page ─── */

export default function ScoringPage() {
  const params = useParams();
  const router = useRouter();
  const matchId = params.id as string;

  const isOnline = useConnectivity();
  const { hasPending, hasFailures, queueStats } = useOfflineSync(matchId);

  // Use longer refresh interval when offline to avoid unnecessary retries
  const refreshInterval = isOnline ? 5000 : 0;

  const { data: match, mutate, isLoading, error: swrError } = useSWR<MatchData>(
    `/api/matches/${matchId}`,
    fetcher,
    {
      refreshInterval,
      // Don't retry when offline — we use the persisted store data instead
      onErrorRetry: (error, _key, _config, revalidate, { retryCount }) => {
        if (!navigator.onLine) return; // Never retry offline
        if (retryCount >= 3) return;
        setTimeout(() => revalidate({ retryCount }), 3000);
      },
    }
  );

  const store = useMatchStore();
  const initialized = useRef(false);
  const [liveShareOpen, setLiveShareOpen] = useState(false);

  // Revalidate SWR data when coming back online
  const wasOfflineRef = useRef(false);
  useEffect(() => {
    if (isOnline && wasOfflineRef.current) {
      // Back online — trigger full revalidation and sync
      mutate();
      wasOfflineRef.current = false;
    } else if (!isOnline) {
      wasOfflineRef.current = true;
    }
  }, [isOnline, mutate]);

  // Initialize store with match data (only once)
  useEffect(() => {
    if (match && !initialized.current) {
      initialized.current = true;
      store.setMatch(match);

      // If match is abandoned or completed, redirect to matches
      if (match.status === 'ABANDONED') {
        toast.info('This match has been abandoned');
        router.push('/matches');
        return;
      }

      const currentInn = match.innings?.find((i) => !i.isCompleted);
      if (currentInn) {
        store.setCurrentInnings(currentInn);

        if (currentInn.strikerId && currentInn.nonStrikerId && currentInn.currentBowlerId) {
          store.setState('SCORING');
        } else if (currentInn.strikerId && currentInn.nonStrikerId && !currentInn.currentBowlerId) {
          store.setState('SETUP_OPENING_BOWLER');
        } else if (currentInn.strikerId && !currentInn.nonStrikerId) {
          store.setState('SETUP_OPENER_2');
        } else {
          store.setState('SETUP_OPENER_1');
        }
      } else if (match.innings?.length === 1 && match.innings[0].isCompleted) {
        store.setState('INNINGS_BREAK');
      } else if (match.status === 'COMPLETED') {
        store.setState('MATCH_RESULT');
      } else if (match.status === 'UPCOMING' || match.status === 'TOSS') {
        store.setState('SETUP_OPENER_1');
      }
    }
  }, [match]);

  // Update store when match data refreshes (but don't override state machine)
  useEffect(() => {
    if (match && initialized.current) {
      // Check if match was abandoned by another client
      if (match.status === 'ABANDONED') {
        toast.info('This match has been abandoned');
        router.push('/matches');
        return;
      }

      store.setMatch(match);
      const currentInn = match.innings?.find((i) => !i.isCompleted);
      if (currentInn) {
        const currentState = store.currentState;
        // Always update currentInnings from server data EXCEPT during PROCESSING
        // (to avoid race conditions with optimistic updates)
        // During NEW_BATSMAN, we MUST update so the batting list refreshes
        if (currentState !== 'PROCESSING') {
          store.setCurrentInnings(currentInn);
        }
      }
    }
  }, [match]);

  // Clear the initialized ref when the match changes (different match ID)
  useEffect(() => {
    return () => {
      initialized.current = false;
    };
  }, [matchId]);

  if (isLoading && !store.match) {
    return (
      <div className="min-h-dvh bg-bg-app flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-t2 text-sm">Loading match...</p>
        </div>
      </div>
    );
  }

  if (swrError && !store.match) {
    return (
      <div className="min-h-dvh bg-bg-app flex items-center justify-center p-4">
        <div className="rounded-xl border border-border bg-bg-card p-8 text-center max-w-sm w-full">
          <AlertTriangle size={40} className="mx-auto mb-4 text-orange-400" />
          <h2 className="text-lg font-semibold text-t1 mb-2">Match not found</h2>
          <p className="text-sm text-t3 mb-6">
            {swrError ? 'Failed to load match data.' : 'This match does not exist or has been removed.'}
          </p>
          <button
            onClick={() => router.push('/matches')}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border text-t2 text-sm font-medium hover:bg-white/5 transition-colors"
          >
            <ArrowLeft size={14} />
            Go to Matches
          </button>
        </div>
      </div>
    );
  }

  // If offline but have persisted store data, use it (don't block on network)
  const matchData = match || store.match;
  if (!matchData) {
    return (
      <div className="min-h-dvh bg-bg-app flex items-center justify-center p-4">
        <div className="rounded-xl border border-border bg-bg-card p-8 text-center max-w-sm w-full">
          <WifiOff size={40} className="mx-auto mb-4 text-yellow-400" />
          <h2 className="text-lg font-semibold text-t1 mb-2">You&apos;re offline</h2>
          <p className="text-sm text-t3 mb-6">
            No cached match data available. Connect to the internet to load this match.
          </p>
          <button
            onClick={() => router.push('/matches')}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border text-t2 text-sm font-medium hover:bg-white/5 transition-colors"
          >
            <ArrowLeft size={14} />
            Go to Matches
          </button>
        </div>
      </div>
    );
  }

  const isLive =
    matchData.status === 'LIVE' ||
    matchData.status === 'INNINGS_BREAK' ||
    matchData.status === 'UPCOMING' ||
    matchData.status === 'TOSS';

  const hasLiveCode = !!matchData.liveCode;

  return (
    <ScoringErrorBoundary fallback={(error, reset) => <ErrorFallback error={error} onReset={reset} />}>
      <div className="min-h-dvh bg-bg-app flex flex-col">
        {/* Offline indicator bar */}
        <OfflineIndicator matchId={matchId} />

        {/* Top bar with QR share + abandon button for live matches */}
        {isLive && (
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-bg-card/50">
            <span className="text-xs text-t3">Match in progress</span>
            <div className="flex items-center gap-1">
              {/* QR Code / Live Share button */}
              {hasLiveCode && (
                <button
                  onClick={() => setLiveShareOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-accent hover:bg-accent/10 transition-colors"
                >
                  <QrCode size={14} />
                  Share
                </button>
              )}
              <AbandonMatchButton matchId={matchId} />
            </div>
          </div>
        )}
        <div className="flex-1 flex flex-col">
          <ScoringScreen matchId={matchId} mutate={mutate} />
        </div>

        {/* Recovery screen for permanently failed sync items */}
        <RecoveryScreen matchId={matchId} />
      </div>

      {/* Live Share Modal */}
      {hasLiveCode && (
        <LiveShareModal
          open={liveShareOpen}
          onOpenChange={setLiveShareOpen}
          match={matchData}
        />
      )}
    </ScoringErrorBoundary>
  );
}
