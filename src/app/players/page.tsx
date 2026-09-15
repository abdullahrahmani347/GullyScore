'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Search, AlertTriangle, RefreshCw, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { safeDeviceFetcher } from '@/lib/device';

interface PlayerDirectoryItem {
  id: string;
  name: string;
  jerseyNumber: number | null;
  battingHand: string | null;
  team: { id: string; name: string; shortName: string; color: string; emoji: string };
  career: { innings: number; runs: number; balls: number; wickets: number };
}

type SortMode = 'name' | 'runs' | 'wickets';

const sortOptions: { mode: SortMode; label: string }[] = [
  { mode: 'name', label: 'A–Z' },
  { mode: 'runs', label: 'Runs' },
  { mode: 'wickets', label: 'Wickets' },
];

export default function PlayersPage() {
  const {
    data,
    isLoading,
    error,
    mutate,
  } = useSWR<{ players: PlayerDirectoryItem[] }>('/api/players', safeDeviceFetcher);
  const isError = !!error;
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('runs');

  const players = data?.players ?? [];

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? players.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.team.name.toLowerCase().includes(q) ||
            p.team.shortName.toLowerCase().includes(q),
        )
      : players;
    const sorted = [...filtered];
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'runs') sorted.sort((a, b) => b.career.runs - a.career.runs);
    if (sort === 'wickets') sorted.sort((a, b) => b.career.wickets - a.career.wickets);
    return sorted;
  }, [players, search, sort]);

  if (isError) {
    return (
      <PageWrapper>
        <div className="px-4 pt-6 pb-2">
          <h1 className="text-2xl font-bold text-t1">Players</h1>
          <p className="text-sm text-t2 mt-0.5">Every cricketer across your teams</p>
        </div>
        <div className="px-4 mt-4">
          <div className="rounded-2xl border border-wicket/20 bg-wicket/5 p-8 flex flex-col items-center justify-center text-center">
            <AlertTriangle size={40} className="text-wicket mb-3" />
            <p className="text-sm font-medium text-t1 mb-1">Failed to load players</p>
            <p className="text-xs text-t3 mb-4">Something went wrong while fetching players</p>
            <Button
              onClick={() => mutate()}
              variant="outline"
              className="rounded-xl border-border text-t2 hover:text-t1"
            >
              <RefreshCw size={14} className="mr-1.5" />
              Retry
            </Button>
          </div>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      {/* Header */}
      <div className="px-4 pt-6 pb-2">
        <h1 className="text-2xl font-bold text-t1">Players</h1>
        <p className="text-sm text-t2 mt-0.5">Every cricketer across your teams</p>
      </div>

      {/* Search */}
      <div className="px-4 pb-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-t3" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players or teams..."
            className="h-10 bg-bg-input border-border text-t1 placeholder:text-t3 pl-9"
          />
        </div>
      </div>

      {/* Sort chips */}
      <div className="px-4 pb-3 flex items-center gap-2">
        {sortOptions.map(({ mode, label }) => (
          <button
            key={mode}
            onClick={() => setSort(mode)}
            className={`px-3 h-7 rounded-full text-xs font-medium border transition-colors ${
              sort === mode
                ? 'bg-accent/10 text-accent border-accent/40'
                : 'text-t3 border-border hover:text-t2'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Player list */}
      <div className="px-4 flex flex-col gap-2.5">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] rounded-xl bg-bg-card" />
          ))
        ) : visible.length > 0 ? (
          visible.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3) }}
            >
              <Link
                href={`/players/${p.id}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-bg-card p-3.5 hover:border-accent/40 transition-colors"
              >
                {/* Jersey avatar tinted with team colour */}
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={{
                    backgroundColor: `${p.team.color}1f`,
                    color: p.team.color,
                  }}
                >
                  {p.jerseyNumber ?? p.name.charAt(0).toUpperCase()}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-t1 truncate">{p.name}</p>
                  <p className="text-xs text-t3 mt-0.5 flex items-center gap-1.5">
                    <span
                      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: p.team.color }}
                    />
                    <span className="truncate">{p.team.emoji} {p.team.shortName}</span>
                    {p.battingHand && (
                      <span className="text-t3">· {p.battingHand === 'L' ? 'LHB' : 'RHB'}</span>
                    )}
                  </p>
                </div>

                <div className="flex flex-col items-end flex-shrink-0 text-right">
                  <span className="text-sm font-bold text-t1 tabular-nums">{p.career.runs}</span>
                  <span className="text-[10px] text-t3 leading-tight">runs</span>
                </div>
                <div className="flex flex-col items-end flex-shrink-0 text-right w-10">
                  <span className="text-sm font-bold text-t1 tabular-nums">{p.career.wickets}</span>
                  <span className="text-[10px] text-t3 leading-tight">wkts</span>
                </div>
              </Link>
            </motion.div>
          ))
        ) : (
          <div className="rounded-xl border border-border bg-bg-card p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-accent-dim flex items-center justify-center mx-auto mb-3">
              <Users size={22} className="text-accent" />
            </div>
            <p className="text-sm text-t2 mb-1">
              {search ? 'No players match your search' : 'No players yet'}
            </p>
            {!search && (
              <>
                <p className="text-xs text-t3 mb-4">
                  Create a team and its squad will show up here
                </p>
                <Link href="/teams">
                  <Button className="bg-accent text-bg-app hover:bg-accent/90 font-semibold rounded-xl h-9 px-4 text-sm">
                    Go to Teams
                  </Button>
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
