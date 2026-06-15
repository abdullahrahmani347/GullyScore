'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useParams, useRouter } from 'next/navigation';
import {
  Pencil,
  Trash2,
  Trophy,
  Users,
  Calendar,
  BarChart3,
  Loader2,
  Play,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { AppHeader } from '@/components/layout/AppHeader';
import { PointsTable } from '@/components/tournaments/PointsTable';
import { ScheduleList } from '@/components/tournaments/ScheduleList';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { safeDeviceFetcher, deviceFetch } from '@/lib/device';
import type { Tournament, TournamentFormat, TournamentStatus, TournamentTeamStat, MatchData } from '@/types';

const fetcher = safeDeviceFetcher;

type TabKey = 'points' | 'schedule' | 'teams';

function StatusBadge({ status }: { status: TournamentStatus }) {
  switch (status) {
    case 'ONGOING':
      return (
        <span className="text-xs font-bold text-gold bg-gold-dim px-3 py-1 rounded-full">
          LIVE
        </span>
      );
    case 'COMPLETED':
      return (
        <span className="text-xs font-medium text-t3 bg-bg-elevated px-3 py-1 rounded-full">
          Completed
        </span>
      );
    case 'UPCOMING':
    default:
      return (
        <span className="text-xs font-medium text-t2 bg-bg-elevated px-3 py-1 rounded-full">
          Upcoming
        </span>
      );
  }
}

export default function TournamentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tournamentId = params.id as string;
  const [activeTab, setActiveTab] = useState<TabKey>('points');

  // SWR hooks
  const {
    data: tournament,
    isLoading,
    error: tournamentError,
    mutate: mutateTournament,
  } = useSWR<Tournament>(
    `/api/tournaments/${tournamentId}`,
    fetcher
  );
  const isTournamentError = !!tournamentError;

  const {
    data: pointsData,
    error: pointsError,
    mutate: mutatePoints,
  } = useSWR<{
    tournamentId: string;
    tournamentName: string;
    format: string;
    pointsTable: TournamentTeamStat[];
  }>(
    tournament ? `/api/tournaments/${tournamentId}/points-table` : null,
    fetcher
  );
  const isPointsError = !!pointsError;

  const {
    data: scheduleData,
    error: scheduleError,
    mutate: mutateSchedule,
  } = useSWR<{
    tournamentId: string;
    tournamentName: string;
    totalMatches: number;
    completedMatches: number;
    schedule: MatchData[];
  }>(
    tournament ? `/api/tournaments/${tournamentId}/schedule` : null,
    fetcher
  );
  const isScheduleError = !!scheduleError;

  // Edit sheet state
  const [showEditForm, setShowEditForm] = useState(false);
  const [editName, setEditName] = useState('');
  const [editFormat, setEditFormat] = useState<TournamentFormat>('ROUND_ROBIN');
  const [editTotalOvers, setEditTotalOvers] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Delete state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Status transition state
  const [isStatusUpdating, setIsStatusUpdating] = useState(false);

  const mutateAll = () => {
    mutateTournament();
    mutatePoints();
    mutateSchedule();
  };

  const openEditSheet = () => {
    if (!tournament) return;
    setEditName(tournament.name);
    setEditFormat(tournament.format);
    setEditTotalOvers(String(tournament.totalOvers));
    setShowEditForm(true);
  };

  const handleUpdateTournament = async () => {
    const totalOversNum = parseInt(editTotalOvers, 10);
    if (!editName.trim()) {
      toast.error('League name is required');
      return;
    }
    if (isNaN(totalOversNum) || totalOversNum < 1) {
      toast.error('Total overs must be a positive number');
      return;
    }

    setIsUpdating(true);
    try {
      const res = await deviceFetch(`/api/tournaments/${tournamentId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editName.trim(),
          format: editFormat,
          totalOvers: totalOversNum,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update league');
      }
      toast.success('League updated!');
      setShowEditForm(false);
      mutateAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update league');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteTournament = async () => {
    setIsDeleting(true);
    try {
      const res = await deviceFetch(`/api/tournaments/${tournamentId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete league');
      }
      toast.success('League deleted');
      router.push('/tournaments');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete league');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStatusTransition = async (newStatus: TournamentStatus) => {
    setIsStatusUpdating(true);
    try {
      const res = await deviceFetch(`/api/tournaments/${tournamentId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update league status');
      }
      toast.success(
        newStatus === 'ONGOING'
          ? 'League started!'
          : 'League completed!'
      );
      mutateAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update league status');
    } finally {
      setIsStatusUpdating(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <PageWrapper>
        <AppHeader title="League" showBack />
        <div className="p-4 space-y-4">
          <Skeleton className="h-40 rounded-2xl bg-bg-card" />
          <Skeleton className="h-12 rounded-xl bg-bg-card" />
          <Skeleton className="h-48 rounded-xl bg-bg-card" />
        </div>
      </PageWrapper>
    );
  }

  // Error state
  if (isTournamentError) {
    return (
      <PageWrapper>
        <AppHeader title="League" showBack />
        <div className="p-4">
          <div className="rounded-xl border border-border bg-bg-card p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-wicket-bg flex items-center justify-center mx-auto mb-3">
              <AlertCircle size={22} className="text-wicket" />
            </div>
            <p className="text-sm text-t3 mb-1">Failed to load league</p>
            <p className="text-xs text-t3 mb-4">
              Something went wrong. Please try again.
            </p>
            <Button
              variant="outline"
              className="border-border text-t2 hover:text-t1 rounded-xl"
              onClick={() => mutateTournament()}
            >
              Retry
            </Button>
          </div>
        </div>
      </PageWrapper>
    );
  }

  // Not found
  if (!tournament) {
    return (
      <PageWrapper>
        <AppHeader title="League" showBack />
        <div className="p-4 text-center">
          <p className="text-t3">League not found</p>
        </div>
      </PageWrapper>
    );
  }

  const completedMatches = tournament.matches.filter(
    (m) => m.status === 'COMPLETED'
  ).length;
  const abandonedMatches = tournament.matches.filter(
    (m) => m.status === 'ABANDONED'
  ).length;
  const liveMatches = tournament.matches.filter(
    (m) => m.status === 'LIVE' || m.status === 'INNINGS_BREAK' || m.status === 'TOSS'
  ).length;
  const totalMatches = tournament.matches.length;
  const allMatchesCompleted =
    totalMatches > 0 &&
    tournament.matches.every(
      (m) => m.status === 'COMPLETED' || m.status === 'ABANDONED'
    );

  const canStartLeague = tournament.status === 'UPCOMING';
  const canCompleteLeague = tournament.status === 'ONGOING' && allMatchesCompleted;

  const tabs: { key: TabKey; label: string; icon: any }[] = [
    { key: 'points', label: 'Points', icon: BarChart3 },
    { key: 'schedule', label: 'Schedule', icon: Calendar },
    { key: 'teams', label: 'Teams', icon: Users },
  ];

  return (
    <PageWrapper>
      {/* Header */}
      <AppHeader
        title={tournament.name}
        showBack
        action={
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-t2 hover:text-t1"
            onClick={openEditSheet}
          >
            <Pencil size={18} />
          </Button>
        }
      />

      {/* Tournament Banner */}
      <div className="px-4 mt-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-gold/20 bg-bg-card p-5"
          style={{
            background:
              'linear-gradient(135deg, rgba(255,215,0,0.08) 0%, rgba(255,215,0,0.02) 100%)',
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gold-dim">
              <Trophy size={22} className="text-gold" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-t1">{tournament.name}</h2>
              <p className="text-xs text-t3">
                {tournament.format === 'ROUND_ROBIN'
                  ? 'Round Robin'
                  : 'Knockout'}{' '}
                • {tournament.totalOvers} overs
              </p>
            </div>
            <StatusBadge status={tournament.status} />
          </div>

          <div className="flex items-center gap-4 mb-3">
            <div className="flex items-center gap-1.5 text-t2">
              <Users size={14} />
              <span className="text-sm">{tournament.teams.length} teams</span>
            </div>
            <span className="text-sm text-t2">
              {totalMatches} matches
            </span>
            {liveMatches > 0 && (
              <span className="text-sm text-accent font-medium">
                {liveMatches} live
              </span>
            )}
            {abandonedMatches > 0 && (
              <span className="text-sm text-wicket font-medium">
                {abandonedMatches} abandoned
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-bg-elevated overflow-hidden">
              <div
                className="h-full rounded-full bg-gold transition-all"
                style={{
                  width:
                    totalMatches > 0
                      ? `${(completedMatches / totalMatches) * 100}%`
                      : '0%',
                }}
              />
            </div>
            <span className="text-xs text-t2 font-[family-name:var(--font-mono)]">
              {completedMatches}/{totalMatches}
            </span>
          </div>
        </motion.div>
      </div>

      {/* Status Transition Buttons */}
      {(canStartLeague || canCompleteLeague) && (
        <div className="px-4 mt-4">
          {canStartLeague && (
            <Button
              className="w-full bg-accent text-bg-app hover:bg-accent/90 font-semibold rounded-xl h-11"
              onClick={() => handleStatusTransition('ONGOING')}
              disabled={isStatusUpdating}
            >
              {isStatusUpdating ? (
                <Loader2 size={16} className="mr-2 animate-spin" />
              ) : (
                <Play size={16} className="mr-2" />
              )}
              {isStatusUpdating ? 'Starting...' : 'Start League'}
            </Button>
          )}
          {canCompleteLeague && (
            <Button
              className="w-full bg-gold text-bg-app hover:bg-gold/90 font-semibold rounded-xl h-11"
              onClick={() => handleStatusTransition('COMPLETED')}
              disabled={isStatusUpdating}
            >
              {isStatusUpdating ? (
                <Loader2 size={16} className="mr-2 animate-spin" />
              ) : (
                <CheckCircle2 size={16} className="mr-2" />
              )}
              {isStatusUpdating ? 'Completing...' : 'Complete League'}
            </Button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="px-4 mt-5">
        <div className="flex rounded-xl bg-bg-card border border-border p-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold rounded-lg transition-colors ${
                  activeTab === tab.key
                    ? 'bg-accent text-bg-app'
                    : 'text-t3 hover:text-t1'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-4 mt-4 pb-6">
        {activeTab === 'points' && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {isPointsError ? (
              <div className="rounded-xl border border-border bg-bg-card p-8 text-center">
                <div className="w-10 h-10 rounded-full bg-wicket-bg flex items-center justify-center mx-auto mb-3">
                  <AlertCircle size={18} className="text-wicket" />
                </div>
                <p className="text-sm text-t3 mb-3">Failed to load points table</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-border text-t2 hover:text-t1 rounded-xl"
                  onClick={() => mutatePoints()}
                >
                  Retry
                </Button>
              </div>
            ) : pointsData ? (
              <PointsTable pointsTable={pointsData.pointsTable} />
            ) : (
              <Skeleton className="h-48 rounded-xl bg-bg-card" />
            )}
          </motion.div>
        )}

        {activeTab === 'schedule' && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {isScheduleError ? (
              <div className="rounded-xl border border-border bg-bg-card p-8 text-center">
                <div className="w-10 h-10 rounded-full bg-wicket-bg flex items-center justify-center mx-auto mb-3">
                  <AlertCircle size={18} className="text-wicket" />
                </div>
                <p className="text-sm text-t3 mb-3">Failed to load schedule</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-border text-t2 hover:text-t1 rounded-xl"
                  onClick={() => mutateSchedule()}
                >
                  Retry
                </Button>
              </div>
            ) : scheduleData ? (
              <ScheduleList schedule={scheduleData.schedule} />
            ) : (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-xl bg-bg-card" />
                ))}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'teams' && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="grid grid-cols-2 gap-2">
              {tournament.teams.map((tt) => {
                const teamMatches = tournament.matches.filter(
                  (m) =>
                    m.team1Id === tt.teamId || m.team2Id === tt.teamId
                );
                const wins = teamMatches.filter(
                  (m) => m.status === 'COMPLETED' && m.winnerId === tt.teamId
                ).length;
                return (
                  <div
                    key={tt.teamId}
                    className="rounded-xl border border-border bg-bg-card p-4"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: tt.team.color }}
                      />
                      <span className="text-sm font-bold text-t1 truncate">
                        {tt.team.shortName}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-t3">
                      <span>M: {teamMatches.length}</span>
                      <span className="text-accent">W: {wins}</span>
                      <span>Pts: {tt.points}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>

      {/* Delete League */}
      <div className="px-4 mt-4 mb-4">
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              className="w-full text-wicket hover:text-wicket hover:bg-wicket-bg h-11 rounded-xl"
            >
              <Trash2 size={16} className="mr-2" />
              Delete League
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-bg-elevated border-border">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-t1">
                Delete {tournament.name}?
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
                onClick={handleDeleteTournament}
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

      {/* Edit Sheet */}
      <Sheet open={showEditForm} onOpenChange={setShowEditForm}>
        <SheetContent side="bottom" className="bg-bg-app border-border rounded-t-2xl max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-t1">Edit League</SheetTitle>
            <SheetDescription className="text-t2">
              Update league details
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 mt-4 space-y-5">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="edit-name" className="text-t2">
                League Name
              </Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Enter league name"
                className="bg-bg-input border-border text-t1 placeholder:text-t3 rounded-xl h-11"
              />
            </div>

            {/* Format */}
            <div className="space-y-2">
              <Label className="text-t2">Format</Label>
              <Select
                value={editFormat}
                onValueChange={(val) => setEditFormat(val as TournamentFormat)}
              >
                <SelectTrigger className="w-full bg-bg-input border-border text-t1 rounded-xl h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-bg-elevated border-border">
                  <SelectItem value="ROUND_ROBIN" className="text-t1 focus:bg-bg-input focus:text-t1">
                    Round Robin
                  </SelectItem>
                  <SelectItem value="KNOCKOUT" className="text-t1 focus:bg-bg-input focus:text-t1">
                    Knockout
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Total Overs */}
            <div className="space-y-2">
              <Label htmlFor="edit-overs" className="text-t2">
                Total Overs
              </Label>
              <Input
                id="edit-overs"
                type="number"
                value={editTotalOvers}
                onChange={(e) => setEditTotalOvers(e.target.value)}
                placeholder="e.g. 20"
                min={1}
                className="bg-bg-input border-border text-t1 placeholder:text-t3 rounded-xl h-11"
              />
            </div>

            {/* Submit Button */}
            <Button
              className="w-full bg-accent text-bg-app hover:bg-accent/90 font-semibold rounded-xl h-11"
              onClick={handleUpdateTournament}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  Updating...
                </span>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </PageWrapper>
  );
}
