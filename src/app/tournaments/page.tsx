'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Plus, Trophy, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { TournamentCard } from '@/components/tournaments/TournamentCard';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { safeDeviceFetcher, deviceFetch } from '@/lib/device';
import type { Tournament } from '@/types';

export default function TournamentsPage() {
  const { data: tournaments, isLoading, error: tournamentsError, mutate } = useSWR<Tournament[]>(
    '/api/tournaments',
    safeDeviceFetcher
  );
  const isError = !!tournamentsError;

  const [deleteTarget, setDeleteTarget] = useState<Tournament | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await deviceFetch(`/api/tournaments/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete league');
      }
      toast.success('League deleted');
      setDeleteTarget(null);
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete league');
    } finally {
      setIsDeleting(false);
    }
  };

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
        ) : isError ? (
          <div className="rounded-xl border border-border bg-bg-card p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-wicket-bg flex items-center justify-center mx-auto mb-3">
              <AlertCircle size={22} className="text-wicket" />
            </div>
            <p className="text-sm text-t3 mb-1">Failed to load leagues</p>
            <p className="text-xs text-t3 mb-4">
              Something went wrong. Please try again.
            </p>
            <Button
              variant="outline"
              className="border-border text-t2 hover:text-t1 rounded-xl"
              onClick={() => mutate()}
            >
              Retry
            </Button>
          </div>
        ) : tournaments && tournaments.length > 0 ? (
          tournaments.map((tournament, i) => (
            <TournamentCard
              key={tournament.id}
              tournament={tournament}
              index={i}
              onDelete={setDeleteTarget}
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="bg-bg-elevated border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-t1">
              Delete {deleteTarget?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-t2">
              This will permanently delete the league and all its matches. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-bg-input border-border text-t1">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-wicket text-white hover:bg-wicket/90"
            >
              {isDeleting ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  Deleting...
                </span>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageWrapper>
  );
}
