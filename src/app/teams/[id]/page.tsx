'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import { useParams, useRouter } from 'next/navigation';
import {
  Pencil,
  Trash2,
  Users,
  Trophy,
  ClipboardList,
  Plus,
  Check,
  X,
  Loader2,
  AlertCircle,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { safeDeviceFetcher, deviceFetch } from '@/lib/device';

// --- Types ---

interface Player {
  id: string;
  name: string;
  jerseyNumber: number | null;
  hasMatchHistory: boolean;
}

interface TeamDetail {
  id: string;
  name: string;
  shortName: string;
  color: string;
  emoji: string;
  players: Player[];
  createdAt: string;
  stats: {
    totalMatches: number;
    wins: number;
    losses: number;
  };
}

// --- Fetcher ---

const fetcher = safeDeviceFetcher;

// --- Inline Edit Row Component ---

function InlineEditRow({
  player,
  teamColor,
  onSave,
  onCancel,
  isSaving,
}: {
  player: Player;
  teamColor: string;
  onSave: (id: string, name: string, jerseyNumber: string) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState(player.name);
  const [jerseyNumber, setJerseyNumber] = useState(
    player.jerseyNumber?.toString() ?? ''
  );

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Player name is required');
      return;
    }
    onSave(player.id, name.trim(), jerseyNumber);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') onCancel();
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="flex items-center gap-2 rounded-xl border border-border-act bg-bg-elevated px-3 py-2"
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Player name"
        className="h-9 bg-bg-input border-border text-t1 text-sm placeholder:text-t3 flex-1 min-w-0"
        autoFocus
        disabled={isSaving}
      />
      <Input
        value={jerseyNumber}
        onChange={(e) => setJerseyNumber(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="#"
        type="number"
        className="h-9 bg-bg-input border-border text-t1 text-sm placeholder:text-t3 w-16"
        disabled={isSaving}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 text-accent hover:text-accent flex-shrink-0"
        onClick={handleSave}
        disabled={isSaving || !name.trim()}
      >
        {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 text-t3 hover:text-t1 flex-shrink-0"
        onClick={onCancel}
        disabled={isSaving}
      >
        <X size={16} />
      </Button>
    </motion.div>
  );
}

// --- Player Row Component ---

function PlayerRow({
  player,
  index,
  teamColor,
  onEdit,
  onDelete,
  isEditing,
  isSaving,
  onSaveEdit,
  onCancelEdit,
}: {
  player: Player;
  index: number;
  teamColor: string;
  onEdit: (id: string) => void;
  onDelete: (player: Player) => void;
  isEditing: boolean;
  isSaving: boolean;
  onSaveEdit: (id: string, name: string, jerseyNumber: string) => void;
  onCancelEdit: () => void;
}) {
  if (isEditing) {
    return (
      <InlineEditRow
        player={player}
        teamColor={teamColor}
        onSave={onSaveEdit}
        onCancel={onCancelEdit}
        isSaving={isSaving}
      />
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      className="flex items-center gap-3 rounded-xl border border-border bg-bg-card px-4 py-3 group"
    >
      <span className="text-xs text-t3 w-5 text-center font-[family-name:var(--font-mono)]">
        {player.jerseyNumber ?? index + 1}
      </span>
      <div
        className="w-1 h-6 rounded-full flex-shrink-0"
        style={{ backgroundColor: teamColor }}
      />
      <span className="text-sm font-medium text-t1 flex-1 min-w-0 truncate">
        {player.name}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 text-t3 hover:text-t1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0"
        onClick={() => onEdit(player.id)}
        aria-label={`Edit ${player.name}`}
      >
        <Pencil size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 text-t3 hover:text-wicket sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0"
        onClick={() => onDelete(player)}
        aria-label={`Delete ${player.name}`}
      >
        <Trash2 size={14} />
      </Button>
    </motion.div>
  );
}

// --- Add Player Form Component ---

function AddPlayerForm({
  teamColor,
  onAdd,
  isAdding,
}: {
  teamColor: string;
  onAdd: (name: string, jerseyNumber: string) => void;
  isAdding: boolean;
}) {
  const [name, setName] = useState('');
  const [jerseyNumber, setJerseyNumber] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Player name is required');
      return;
    }
    onAdd(name.trim(), jerseyNumber);
    setName('');
    setJerseyNumber('');
  };

  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className="flex items-center gap-3 w-full rounded-xl border border-dashed border-border hover:border-border-act bg-bg-card/50 px-4 py-3 transition-colors min-h-[44px]"
      >
        <Plus size={16} className="text-accent flex-shrink-0" />
        <span className="text-sm text-t3">Add player</span>
      </button>
    );
  }

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="flex items-center gap-2 rounded-xl border border-border bg-bg-card px-3 py-2"
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Player name"
        className="h-9 bg-bg-input border-border text-t1 text-sm placeholder:text-t3 flex-1 min-w-0"
        autoFocus
        disabled={isAdding}
      />
      <Input
        value={jerseyNumber}
        onChange={(e) => setJerseyNumber(e.target.value)}
        placeholder="#"
        type="number"
        className="h-9 bg-bg-input border-border text-t1 text-sm placeholder:text-t3 w-16"
        disabled={isAdding}
      />
      <Button
        type="submit"
        size="sm"
        className="h-9 bg-accent text-bg-app hover:bg-accent/90 font-semibold rounded-lg px-3 flex-shrink-0 disabled:opacity-50"
        disabled={isAdding || !name.trim()}
      >
        {isAdding ? <Loader2 size={16} className="animate-spin" /> : 'Add'}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 text-t3 hover:text-t1 flex-shrink-0"
        onClick={() => {
          setIsExpanded(false);
          setName('');
          setJerseyNumber('');
        }}
        disabled={isAdding}
      >
        <X size={16} />
      </Button>
    </motion.form>
  );
}

// --- Error State Component ---

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-14 h-14 rounded-2xl bg-wicket-bg flex items-center justify-center mb-4">
        <AlertCircle size={28} className="text-wicket" />
      </div>
      <p className="text-t1 font-semibold mb-1">Failed to load team</p>
      <p className="text-t3 text-sm mb-4 text-center">
        Something went wrong. Please try again.
      </p>
      <Button
        variant="outline"
        className="h-10 rounded-xl border-border text-t1 hover:bg-bg-elevated"
        onClick={onRetry}
      >
        <RefreshCw size={16} className="mr-2" />
        Retry
      </Button>
    </div>
  );
}

// --- Main Page ---

export default function TeamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.id as string;

  const { data: team, isLoading, error: teamError, mutate } = useSWR<TeamDetail>(
    `/api/teams/${teamId}`,
    fetcher,
    {
      revalidateOnFocus: false,
    }
  );
  const isError = !!teamError;

  // Edit sheet
  const [showEditForm, setShowEditForm] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Delete team
  const [isDeleting, setIsDeleting] = useState(false);

  // Player inline editing
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [isSavingPlayer, setIsSavingPlayer] = useState(false);

  // Player add
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);

  // Player delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Player | null>(null);
  const [isDeletingPlayer, setIsDeletingPlayer] = useState(false);

  // --- Team Update ---

  const handleUpdateTeam = async (data: {
    name: string;
    shortName: string;
    color: string;
    emoji: string;
    players: { id?: string; name: string; jerseyNumber?: number }[];
  }) => {
    setIsUpdating(true);
    try {
      const res = await deviceFetch(`/api/teams/${teamId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
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

  // --- Team Delete ---

  const handleDeleteTeam = async () => {
    setIsDeleting(true);
    try {
      const res = await deviceFetch(`/api/teams/${teamId}`, { method: 'DELETE' });
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

  // --- Add Player (with optimistic update) ---

  const handleAddPlayer = useCallback(
    async (name: string, jerseyNumber: string) => {
      if (!team) return;

      setIsAddingPlayer(true);

      // Optimistic: create a temporary player object
      const optimisticPlayer: Player = {
        id: `temp-${Date.now()}`,
        name,
        jerseyNumber: jerseyNumber ? parseInt(jerseyNumber, 10) : null,
        hasMatchHistory: false,
      };

      // Optimistically update the UI
      await mutate(
        {
          ...team,
          players: [...team.players, optimisticPlayer],
        },
        false
      );

      try {
        const res = await deviceFetch(`/api/teams/${teamId}/players`, {
          method: 'POST',
          body: JSON.stringify({
            name,
            jerseyNumber: jerseyNumber ? parseInt(jerseyNumber, 10) : undefined,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to add player');
        }
        toast.success(`${name} added`);
        // Revalidate from server
        mutate();
      } catch (err) {
        // Rollback: revalidate from server to restore original state
        await mutate();
        toast.error(err instanceof Error ? err.message : 'Failed to add player');
      } finally {
        setIsAddingPlayer(false);
      }
    },
    [team, teamId, mutate]
  );

  // --- Edit Player ---

  const handleSaveEdit = useCallback(
    async (playerId: string, name: string, jerseyNumber: string) => {
      setIsSavingPlayer(true);
      try {
        const res = await deviceFetch(`/api/teams/${teamId}/players/${playerId}`, {
          method: 'PUT',
          body: JSON.stringify({
            name,
            jerseyNumber: jerseyNumber ? parseInt(jerseyNumber, 10) : null,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to update player');
        }
        toast.success('Player updated');
        setEditingPlayerId(null);
        mutate();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update player');
      } finally {
        setIsSavingPlayer(false);
      }
    },
    [teamId, mutate]
  );

  // --- Delete Player ---

  const handleConfirmDeletePlayer = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeletingPlayer(true);
    try {
      const res = await deviceFetch(
        `/api/teams/${teamId}/players/${deleteTarget.id}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete player');
      }
      toast.success(`${deleteTarget.name} removed`);
      setDeleteTarget(null);
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete player');
      setDeleteTarget(null);
    } finally {
      setIsDeletingPlayer(false);
    }
  }, [deleteTarget, teamId, mutate]);

  // --- Loading State ---

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

  // --- Error State ---

  if (isError) {
    return (
      <PageWrapper>
        <AppHeader title="Team" showBack />
        <ErrorState onRetry={() => mutate()} />
      </PageWrapper>
    );
  }

  // --- Not Found State ---

  if (!team) {
    return (
      <PageWrapper>
        <AppHeader title="Team" showBack />
        <div className="p-4 text-center py-16">
          <p className="text-t3">Team not found</p>
        </div>
      </PageWrapper>
    );
  }

  // --- Prepare initial data for TeamForm (include player IDs) ---

  const teamFormInitialData = {
    id: team.id,
    name: team.name,
    shortName: team.shortName,
    color: team.color,
    emoji: team.emoji,
    players: team.players.map((p) => ({
      id: p.id,
      name: p.name,
      teamId: team.id,
      jerseyNumber: p.jerseyNumber,
    })),
    createdAt: team.createdAt,
  };

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
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-bg-card p-6 text-center">
              <p className="text-sm text-t3">No players in this team</p>
            </div>
            <AddPlayerForm
              teamColor={team.color}
              onAdd={handleAddPlayer}
              isAdding={isAddingPlayer}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {team.players.map((player, i) => (
                <PlayerRow
                  key={player.id}
                  player={player}
                  index={i}
                  teamColor={team.color}
                  onEdit={(id) => setEditingPlayerId(id)}
                  onDelete={(p) => setDeleteTarget(p)}
                  isEditing={editingPlayerId === player.id}
                  isSaving={isSavingPlayer}
                  onSaveEdit={handleSaveEdit}
                  onCancelEdit={() => setEditingPlayerId(null)}
                />
              ))}
            </AnimatePresence>

            {/* Add Player Inline Form */}
            <AddPlayerForm
              teamColor={team.color}
              onAdd={handleAddPlayer}
              isAdding={isAddingPlayer}
            />
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
              <AlertDialogTitle className="text-t1">
                Delete {team.name}?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-t2">
                This will permanently delete the team and all its players. This
                action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-bg-input border-border text-t1">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteTeam}
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
      </div>

      {/* Delete Player AlertDialog */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="bg-bg-elevated border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-t1 flex items-center gap-2">
              {deleteTarget?.hasMatchHistory ? (
                <>
                  <ShieldAlert size={20} className="text-gold flex-shrink-0" />
                  Cannot Remove Player
                </>
              ) : (
                `Remove ${deleteTarget?.name}?`
              )}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-t2">
              {deleteTarget?.hasMatchHistory ? (
                'This player has match history and cannot be removed. Their records are part of completed matches.'
              ) : (
                `This will remove ${deleteTarget?.name} from the team. This action cannot be undone.`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-bg-input border-border text-t1">
              {deleteTarget?.hasMatchHistory ? 'OK' : 'Cancel'}
            </AlertDialogCancel>
            {!deleteTarget?.hasMatchHistory && (
              <AlertDialogAction
                onClick={handleConfirmDeletePlayer}
                disabled={isDeletingPlayer}
                className="bg-wicket text-white hover:bg-wicket/90"
              >
                {isDeletingPlayer ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Removing...
                  </span>
                ) : (
                  'Remove'
                )}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Sheet */}
      <Sheet open={showEditForm} onOpenChange={setShowEditForm}>
        <SheetContent
          side="bottom"
          className="bg-bg-app border-border rounded-t-2xl max-h-[90vh] overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle className="text-t1">Edit Team</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <TeamForm
              initialData={teamFormInitialData}
              onSubmit={handleUpdateTeam}
              isLoading={isUpdating}
            />
          </div>
        </SheetContent>
      </Sheet>
    </PageWrapper>
  );
}
