'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useParams, useRouter } from 'next/navigation';
import { Pencil, Trash2, Users, Trophy, ClipboardList } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { AppHeader } from '@/components/layout/AppHeader';
import { TeamForm } from '@/components/teams/TeamForm';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface TeamDetail {
  id: string;
  name: string;
  shortName: string;
  color: string;
  emoji: string;
  players: { id: string; name: string; jerseyNumber: number | null }[];
  createdAt: string;
  stats: {
    totalMatches: number;
    wins: number;
    losses: number;
  };
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function TeamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.id as string;

  const { data: team, isLoading, mutate } = useSWR<TeamDetail>(`/api/teams/${teamId}`, fetcher);
  const [showEditForm, setShowEditForm] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleUpdateTeam = async (data: {
    name: string;
    shortName: string;
    color: string;
    emoji: string;
    players: { name: string; jerseyNumber?: number }[];
  }) => {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          shortName: data.shortName,
          color: data.color,
          emoji: data.emoji,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update team');
      }
      toast.success('Team updated!');
      setShowEditForm(false);
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update team');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteTeam = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/teams/${teamId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete team');
      }
      toast.success('Team deleted');
      router.push('/teams');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete team');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <PageWrapper>
        <AppHeader title="Team" showBack />
        <div className="p-4 space-y-4">
          <Skeleton className="h-32 rounded-2xl bg-bg-card" />
          <Skeleton className="h-10 rounded-xl bg-bg-card" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl bg-bg-card" />
          ))}
        </div>
      </PageWrapper>
    );
  }

  if (!team) {
    return (
      <PageWrapper>
        <AppHeader title="Team" showBack />
        <div className="p-4 text-center">
          <p className="text-t3">Team not found</p>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <AppHeader
        title={team.shortName}
        showBack
        action={
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-t2 hover:text-t1"
            onClick={() => setShowEditForm(true)}
          >
            <Pencil size={18} />
          </Button>
        }
      />

      {/* Team Banner */}
      <div
        className="mx-4 mt-4 rounded-2xl p-5 border border-border"
        style={{
          background: `linear-gradient(135deg, ${team.color}18 0%, ${team.color}08 100%)`,
          borderColor: team.color + '30',
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
            style={{ backgroundColor: team.color + '22' }}
          >
            {team.emoji}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-t1">{team.name}</h2>
            <p className="text-sm text-t2">{team.shortName}</p>
          </div>
          <div
            className="w-5 h-5 rounded-full"
            style={{ backgroundColor: team.color }}
          />
        </div>

        {/* Stats */}
        <div className="flex gap-4 mt-4">
          <div className="flex items-center gap-1.5 text-t2">
            <ClipboardList size={14} />
            <span className="text-sm">{team.stats.totalMatches} matches</span>
          </div>
          <div className="flex items-center gap-1.5 text-accent">
            <Trophy size={14} />
            <span className="text-sm">{team.stats.wins} won</span>
          </div>
          <div className="flex items-center gap-1.5 text-wicket">
            <Trophy size={14} />
            <span className="text-sm">{team.stats.losses} lost</span>
          </div>
        </div>
      </div>

      {/* Player Roster */}
      <div className="px-4 mt-6">
        <div className="flex items-center gap-2 mb-3">
          <Users size={16} className="text-t2" />
          <h3 className="text-sm font-semibold text-t2 uppercase tracking-wider">
            Players ({team.players.length})
          </h3>
        </div>

        {team.players.length === 0 ? (
          <div className="rounded-xl border border-border bg-bg-card p-6 text-center">
            <p className="text-sm text-t3">No players in this team</p>
          </div>
        ) : (
          <div className="space-y-2">
            {team.players.map((player, i) => (
              <motion.div
                key={player.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: i * 0.03 }}
                className="flex items-center gap-3 rounded-xl border border-border bg-bg-card px-4 py-3"
              >
                <span className="text-xs text-t3 w-5 text-center font-[family-name:var(--font-mono)]">
                  {player.jerseyNumber ?? i + 1}
                </span>
                <div
                  className="w-1 h-6 rounded-full"
                  style={{ backgroundColor: team.color }}
                />
                <span className="text-sm font-medium text-t1">{player.name}</span>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Team */}
      <div className="px-4 mt-8 mb-4">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              className="w-full text-wicket hover:text-wicket hover:bg-wicket-bg h-11 rounded-xl"
            >
              <Trash2 size={16} className="mr-2" />
              Delete Team
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-bg-elevated border-border">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-t1">Delete {team.name}?</AlertDialogTitle>
              <AlertDialogDescription className="text-t2">
                This will permanently delete the team and all its players. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-bg-input border-border text-t1">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteTeam}
                disabled={isDeleting}
                className="bg-wicket text-white hover:bg-wicket/90"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Edit Sheet */}
      <Sheet open={showEditForm} onOpenChange={setShowEditForm}>
        <SheetContent side="bottom" className="bg-bg-app border-border rounded-t-2xl max-h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-t1">Edit Team</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <TeamForm
              initialData={team}
              onSubmit={handleUpdateTeam}
              isLoading={isUpdating}
            />
          </div>
        </SheetContent>
      </Sheet>
    </PageWrapper>
  );
}
