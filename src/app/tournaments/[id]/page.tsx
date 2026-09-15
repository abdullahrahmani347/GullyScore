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
  Share2,
  Download,
  GitMerge,
  Medal,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { AppHeader } from '@/components/layout/AppHeader';
import { PointsTable } from '@/components/tournaments/PointsTable';
import { ScheduleEditor } from '@/components/tournaments/ScheduleEditor';
import { BracketView } from '@/components/tournaments/BracketView';
import { Leaderboards } from '@/components/tournaments/Leaderboards';
import { TournamentMvpCard } from '@/components/analytics';
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

type TabKey = 'points' | 'schedule' | 'bracket' | 'stats' | 'teams';

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
  // v2 §17.3 — drawing-of-lots pending state
  const [lotsPending, setLotsPending] = useState(false);

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

  // v2 §17.1 — bracket for KNOCKOUT / HYBRID formats
  const isKnockoutish = tournament?.format === 'KNOCKOUT' || tournament?.format === 'HYBRID';
  const { data: bracketData, mutate: mutateBracket } = useSWR<{ rounds: never[]; champion: never; needsGeneration: boolean }>(
    tournament && isKnockoutish ? `/api/tournaments/${tournamentId}/bracket` : null,
    fetcher,
  );

  // Edit sheet state
  const [showEditForm, setShowEditForm] = useState(false);
  const [editName, setEditName] = useState('');
  const [editFormat, setEditFormat] = useState<TournamentFormat>('ROUND_ROBIN');
  const [editTotalOvers, setEditTotalOvers] = useState('');
  // v2 §17.7 — squad lock + guest opt-in
  const [editSquadLockDate, setEditSquadLockDate] = useState('');
  const [editGuestsAllowed, setEditGuestsAllowed] = useState(false);
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
    setEditSquadLockDate(
      tournament.squadLockDate
        ? new Date(tournament.squadLockDate).toISOString().slice(0, 10)
        : '',
    );
    setEditGuestsAllowed(!!tournament.guestPlayersAllowed);
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
          squadLockDate: editSquadLockDate || null,
          guestPlayersAllowed: editGuestsAllowed,
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

  // v2 §17.3 — organizer drawing-of-lots action
  const handleDrawLots = async (teamIds: string[]) => {
    setLotsPending(true);
    try {
      const res = await deviceFetch(`/api/tournaments/${tournamentId}/draw-lots`, {
        method: 'POST',
        body: JSON.stringify({ teamIds }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to draw lots');
      }
      toast.success('Lots drawn — order updated');
      mutatePoints();
      mutateBracket();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to draw lots');
    } finally {
      setLotsPending(false);
    }
  };

  // v2 §17.5 — share the tournament hub like a match
  const handleShare = async () => {
    const url = `${window.location.origin}/tournaments/${tournamentId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: tournament.name, text: `${tournament.name} — ${tournament.teams.length} teams on GullyScore`, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied');
      }
    } catch {
      // share cancelled
    }
  };

  const tabs: { key: TabKey; label: string; icon: any }[] = [
    { key: 'points', label: 'Points', icon: BarChart3 },
    { key: 'schedule', label: 'Schedule', icon: Calendar },
    // v2 §17.1 — bracket tab for knockout / hybrid formats
    ...(isKnockoutish ? [{ key: 'bracket' as TabKey, label: 'Bracket', icon: GitMerge }] : []),
    { key: 'stats', label: 'Stats', icon: Medal },
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
            <div className="flex-1 min-w-0">
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

      {/* v2 §17.1/§17.5 — champion banner on completion */}
      {(() => {
        const championTeam = tournament.championTeamId
          ? tournament.teams.find((tt) => tt.teamId === tournament.championTeamId)?.team
          : null;
        if (!championTeam) return null;
        return (
          <div className="px-4 mt-3">
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl border border-gold/40 p-4 flex items-center gap-3"
              style={{
                background:
                  'linear-gradient(135deg, rgba(255,215,0,0.18) 0%, rgba(255,215,0,0.04) 100%)',
              }}
            >
              <div className="w-10 h-10 rounded-full bg-gold/20 flex items-center justify-center flex-shrink-0">
                <Trophy size={18} className="text-gold" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gold">Champion</p>
                <p className="text-base font-bold text-t1 truncate">
                  {championTeam.emoji} {championTeam.name}
                </p>
              </div>
            </motion.div>
          </div>
        );
      })()}

      {/* v2 §17.2/§17.5/§17.6 — share + exports row */}
      <div className="px-4 mt-3 flex items-center gap-2 flex-wrap">
        <button
          onClick={handleShare}
          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-bg-card border border-border text-t2 text-xs font-medium hover:text-t1 transition-colors"
        >
          <Share2 size={13} />
          Share hub
        </button>
        <a
          href={`/api/tournaments/${tournamentId}/export?format=ics`}
          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-bg-card border border-border text-t2 text-xs font-medium hover:text-t1 transition-colors"
        >
          <Calendar size={13} />
          .ics
        </a>
        <a
          href={`/api/tournaments/${tournamentId}/export?format=csv&type=points`}
          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-bg-card border border-border text-t2 text-xs font-medium hover:text-t1 transition-colors"
        >
          <Download size={13} />
          CSV
        </a>
        <button
          onClick={() => window.open(`/tournaments/${tournamentId}/report`, '_blank')}
          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-bg-card border border-border text-t2 text-xs font-medium hover:text-t1 transition-colors"
        >
          <Download size={13} />
          PDF report
        </button>
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
              <div className="space-y-3">
                {/* v2 §17.3 — full tiebreaker chain + drawing-of-lots tool */}
                <PointsTable pointsTable={pointsData.pointsTable} onDrawLots={handleDrawLots} lotsPending={lotsPending} />
                {/* v2 §13.5 — season MVP leaderboard across completed matches */}
                <TournamentMvpCard
                  matches={(tournament?.matches ?? []) as unknown as MatchData[]}
                  teamNames={Object.fromEntries(
                    (tournament?.teams ?? []).map((t) => [t.team.id, t.team.shortName])
                  )}
                />
              </div>
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
              /* v2 §17.2 — full schedule editor (drag-to-reslot, venue/time/umpires,
                double-booking detection). Read-only list kept for non-organizer
                contexts via the same component (canEdit=false). */
              <ScheduleEditor schedule={scheduleData.schedule} canEdit tournamentId={tournamentId} />
            ) : (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-xl bg-bg-card" />
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* v2 §17.1 — knockout bracket (KNOCKOUT / HYBRID only) */}
        {activeTab === 'bracket' && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {bracketData ? (
              <BracketView bracket={bracketData as unknown as import('@/lib/bracket').BracketData} />
            ) : (
              <Skeleton className="h-64 rounded-xl bg-bg-card" />
            )}
          </motion.div>
        )}

        {/* v2 §17.4 — leaderboards: MVP / runs / wickets / economy / SR */}
        {activeTab === 'stats' && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Leaderboards tournamentId={tournamentId} />
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
                  {/* v2 §17.1 — round robin stage + knockout bracket */}
                  <SelectItem value="HYBRID" className="text-t1 focus:bg-bg-input focus:text-t1">
                    Hybrid (RR + Knockout)
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

            {/* v2 §17.7 — squad lock date */}
            <div className="space-y-2">
              <Label htmlFor="edit-squad-lock" className="text-t2">
                Squad lock date (optional)
              </Label>
              <Input
                id="edit-squad-lock"
                type="date"
                value={editSquadLockDate}
                onChange={(e) => setEditSquadLockDate(e.target.value)}
                className="bg-bg-input border-border text-t1 rounded-xl h-11"
              />
              <p className="text-[11px] text-t3">
                After this date team squads are locked and cannot be edited.
              </p>
            </div>

            {/* v2 §17.7 — guest players opt-in */}
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg-card p-3 cursor-pointer">
              <span className="min-w-0">
                <span className="block text-sm font-medium text-t1">Allow guest players</span>
                <span className="block text-[11px] text-t3 mt-0.5">
                  One-off guests on a match XI — stats count but are flagged in leaderboards.
                </span>
              </span>
              <input
                type="checkbox"
                checked={editGuestsAllowed}
                onChange={(e) => setEditGuestsAllowed(e.target.checked)}
                className="w-5 h-5 accent-[var(--accent)] flex-shrink-0"
              />
            </label>

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
