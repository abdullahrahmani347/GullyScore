'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCw, Trash2, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { MatchListCard } from '@/components/matches/MatchListCard';
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
import { safeDeviceFetcher, deviceFetch } from '@/lib/device';
import type { MatchData, MatchStatus } from '@/types';

const FILTERS: { label: string; value: MatchStatus | 'ALL' }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Live', value: 'LIVE' },
  { label: 'Upcoming', value: 'UPCOMING' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Abandoned', value: 'ABANDONED' },
];

export default function MatchesPage() {
  const [filter, setFilter] = useState<MatchStatus | 'ALL'>('ALL');

  const { data: matches, isLoading, error, mutate } = useSWR<MatchData[]>(
    `/api/matches${filter !== 'ALL' ? `?status=${filter}` : ''}`,
    safeDeviceFetcher,
    { refreshInterval: 10000 }
  );
  const isError = !!error;

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: 'delete' | 'abandon';
    match: MatchData | null;
  }>({ open: false, type: 'delete', match: null });

  const [actionLoading, setActionLoading] = useState(false);

  // Optimistic delete handler
  const handleDelete = useCallback(
    (match: MatchData) => {
      setConfirmDialog({ open: true, type: 'delete', match });
    },
    []
  );

  // Abandon handler
  const handleAbandon = useCallback(
    (match: MatchData) => {
      setConfirmDialog({ open: true, type: 'abandon', match });
    },
    []
  );

  const handleConfirmAction = useCallback(async () => {
    const { type, match } = confirmDialog;
    if (!match) return;

    setActionLoading(true);

    try {
      if (type === 'delete') {
        // Optimistic update: remove match from list immediately
        await mutate(
          (currentMatches) =>
            currentMatches?.filter((m) => m.id !== match.id) ?? [],
          false
        );

        const res = await deviceFetch(`/api/matches/${match.id}`, { method: 'DELETE' });
        const data = await res.json();

        if (!res.ok) {
          // Revert optimistic update
          await mutate();
          toast.error(data.error || 'Failed to delete match');
          return;
        }

        toast.success('Match deleted');
      } else if (type === 'abandon') {
        const res = await deviceFetch(`/api/matches/${match.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'ABANDONED', result: 'Match abandoned' }),
        });
        const data = await res.json();

        if (!res.ok) {
          toast.error(data.error || 'Failed to abandon match');
          return;
        }

        toast.success('Match abandoned');
      }

      // Revalidate the list
      await mutate();
    } catch {
      // Revert on network error
      await mutate();
      toast.error('Something went wrong. Please try again.');
    } finally {
      setActionLoading(false);
      setConfirmDialog({ open: false, type: 'delete', match: null });
    }
  }, [confirmDialog, mutate]);

  return (
    <PageWrapper>
      {/* Header */}
      <div className="px-4 pt-6 pb-2">
        <h1 className="text-2xl font-bold text-t1">Matches</h1>
        <p className="text-sm text-t2 mt-0.5">All your cricket matches</p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 px-4 pb-3 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
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
      <div className="px-4 space-y-3 pb-6">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[140px] rounded-xl bg-bg-card" />
          ))
        ) : isError ? (
          <div className="rounded-xl border border-border bg-bg-card p-8 text-center">
            <AlertTriangle size={32} className="mx-auto mb-3 text-orange-400" />
            <p className="text-sm text-t2 mb-1">Failed to load matches</p>
            <p className="text-xs text-t3 mb-4">
              Something went wrong. Please try again.
            </p>
            <button
              onClick={() => mutate()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-dim text-accent text-sm font-medium hover:bg-accent/20 transition-colors"
            >
              <RefreshCw size={14} />
              Retry
            </button>
          </div>
        ) : matches && matches.length > 0 ? (
          <motion.div layout className="space-y-3">
            {matches.map((match, i) => (
              <MatchListCard
                key={match.id}
                match={match}
                index={i}
                onAbandon={handleAbandon}
                onDelete={handleDelete}
              />
            ))}
          </motion.div>
        ) : (
          <div className="rounded-xl border border-border bg-bg-card p-8 text-center">
            <p className="text-sm text-t3">
              {filter !== 'ALL'
                ? `No ${filter.toLowerCase()} matches`
                : 'No matches yet'}
            </p>
          </div>
        )}
      </div>

      {/* Confirmation AlertDialog */}
      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDialog({ open: false, type: 'delete', match: null });
          }
        }}
      >
        <AlertDialogContent className="bg-bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-t1">
              {confirmDialog.type === 'delete'
                ? 'Delete Match?'
                : 'Abandon Match?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-t3">
              {confirmDialog.type === 'delete'
                ? `Are you sure you want to delete ${confirmDialog.match?.team1.name} vs ${confirmDialog.match?.team2.name}? This action cannot be undone.`
                : `Are you sure you want to abandon ${confirmDialog.match?.team1.name} vs ${confirmDialog.match?.team2.name}? This will end the match immediately.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading} className="border-border text-t2 hover:bg-white/5">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              disabled={actionLoading}
              className={`${
                confirmDialog.type === 'delete'
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-orange-600 hover:bg-orange-700 text-white'
              }`}
            >
              {actionLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  {confirmDialog.type === 'delete' ? 'Deleting...' : 'Abandoning...'}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  {confirmDialog.type === 'delete' ? (
                    <>
                      <Trash2 size={14} />
                      Delete
                    </>
                  ) : (
                    <>
                      <Ban size={14} />
                      Abandon
                    </>
                  )}
                </span>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageWrapper>
  );
}
