'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Trophy, Users, Calendar, BarChart3 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { PointsTable } from '@/components/tournaments/PointsTable';
import { ScheduleList } from '@/components/tournaments/ScheduleList';
import type { Tournament, TournamentTeamStat } from '@/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type TabKey = 'points' | 'schedule' | 'teams';

export default function TournamentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tournamentId = params.id as string;
  const [activeTab, setActiveTab] = useState<TabKey>('points');

  const { data: tournament, isLoading } = useSWR<Tournament>(
    `/api/tournaments/${tournamentId}`,
    fetcher
  );

  const { data: pointsData } = useSWR(
    tournament ? `/api/tournaments/${tournamentId}/points-table` : null,
    fetcher
  );

  const { data: scheduleData } = useSWR(
    tournament ? `/api/tournaments/${tournamentId}/schedule` : null,
    fetcher
  );

  if (isLoading) {
    return (
      <PageWrapper>
        <div className="sticky top-0 z-40 flex items-center gap-3 px-4 h-14 border-b border-border bg-bg-app/90 backdrop-blur-xl">
          <button
            onClick={() => router.back()}
            className="text-t2 hover:text-t1 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold text-t1">League</h1>
        </div>
        <div className="p-4 space-y-4">
          <Skeleton className="h-40 rounded-2xl bg-bg-card" />
          <Skeleton className="h-32 rounded-xl bg-bg-card" />
        </div>
      </PageWrapper>
    );
  }

  if (!tournament) {
    return (
      <PageWrapper>
        <div className="sticky top-0 z-40 flex items-center gap-3 px-4 h-14 border-b border-border bg-bg-app/90 backdrop-blur-xl">
          <button
            onClick={() => router.back()}
            className="text-t2 hover:text-t1 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold text-t1">League</h1>
        </div>
        <div className="p-4 text-center">
          <p className="text-t3">League not found</p>
        </div>
      </PageWrapper>
    );
  }

  const completedMatches = tournament.matches.filter(
    (m) => m.status === 'COMPLETED'
  ).length;
  const totalMatches = tournament.matches.length;
  const isActive = tournament.status === 'ONGOING';

  const tabs: { key: TabKey; label: string; icon: any }[] = [
    { key: 'points', label: 'Points', icon: BarChart3 },
    { key: 'schedule', label: 'Schedule', icon: Calendar },
    { key: 'teams', label: 'Teams', icon: Users },
  ];

  return (
    <PageWrapper>
      {/* Header */}
      <div className="sticky top-0 z-40 flex items-center gap-3 px-4 h-14 border-b border-border bg-bg-app/90 backdrop-blur-xl">
        <button
          onClick={() => router.back()}
          className="text-t2 hover:text-t1 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold text-t1 truncate flex-1">
          {tournament.name}
        </h1>
        {isActive && (
          <span className="text-[10px] font-bold text-gold bg-gold-dim px-2 py-0.5 rounded-full flex-shrink-0">
            ACTIVE
          </span>
        )}
      </div>

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
          </div>

          <div className="flex items-center gap-4 mb-3">
            <div className="flex items-center gap-1.5 text-t2">
              <Users size={14} />
              <span className="text-sm">{tournament.teams.length} teams</span>
            </div>
            <span className="text-sm text-t2">
              {totalMatches} matches
            </span>
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
            {pointsData ? (
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
            {scheduleData ? (
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
    </PageWrapper>
  );
}
