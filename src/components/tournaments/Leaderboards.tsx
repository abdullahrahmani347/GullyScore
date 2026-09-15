'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Medal, Target, Zap, Activity, Star, UserPlus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { safeDeviceFetcher } from '@/lib/device';

/**
 * v2 §17.4 — per-tournament leaderboards: run-getters, wicket-takers,
 * MVP (§13.5), best economy (≥ 3 overs) and best SR (≥ 30 balls).
 * §17.7 — guest entries appear only when the tournament opts in, flagged.
 */

interface Entry {
  playerId: string;
  name: string;
  isGuest: boolean;
  teamShortName: string;
  teamColor: string;
}

interface LeaderboardsData {
  runGetters: (Entry & { runs: number; balls: number; fours: number; sixes: number })[];
  wicketTakers: (Entry & { wickets: number; runsConceded: number; legalBalls: number })[];
  mvp: (Entry & { mvp: number })[];
  bestEconomy: (Entry & { economy: number; overs: number })[];
  bestStrikeRate: (Entry & { strikeRate: number; runs: number; balls: number })[];
  guestPlayersAllowed: boolean;
}

type BoardKey = 'mvp' | 'runs' | 'wickets' | 'economy' | 'sr';

const BOARDS: { key: BoardKey; label: string; icon: typeof Medal }[] = [
  { key: 'mvp', label: 'MVP', icon: Medal },
  { key: 'runs', label: 'Runs', icon: Target },
  { key: 'wickets', label: 'Wickets', icon: Zap },
  { key: 'economy', label: 'Economy', icon: Activity },
  { key: 'sr', label: 'Strike rate', icon: Star },
];

function GuestFlag() {
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1 py-px rounded text-[9px] bg-bg-elevated text-t3 flex-shrink-0"
      title="One-off guest — counts on the match, not on any team roster"
    >
      <UserPlus size={8} />
      guest
    </span>
  );
}

function Row({
  entry,
  rank,
  primary,
  secondary,
}: {
  entry: Entry;
  rank: number;
  primary: string;
  secondary: string;
}) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-border/30 last:border-0">
      <span className={`w-4 text-center text-[11px] font-mono ${rank === 0 ? 'text-gold font-bold' : 'text-t3'}`}>
        {rank + 1}
      </span>
      <Link href={`/players/${entry.playerId}`} className="flex-1 min-w-0 flex items-center gap-1.5 hover:underline">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.teamColor }} />
        <span className="text-[11px] text-t1 truncate">{entry.name}</span>
        {entry.isGuest && <GuestFlag />}
      </Link>
      <span className="text-[10px] text-t3 flex-shrink-0">{secondary}</span>
      <span className="text-[11px] font-bold font-mono text-t1 w-12 text-right flex-shrink-0">{primary}</span>
    </div>
  );
}

export function Leaderboards({ tournamentId }: { tournamentId: string }) {
  const [board, setBoard] = useState<BoardKey>('mvp');
  const { data, isLoading } = useSWR<LeaderboardsData>(
    `/api/tournaments/${tournamentId}/leaderboards`,
    safeDeviceFetcher,
  );

  return (
    <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
      <div className="flex overflow-x-auto border-b border-border" style={{ scrollbarWidth: 'none' }}>
        {BOARDS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setBoard(key)}
            className={`flex items-center gap-1 px-3 py-2.5 text-[11px] font-semibold whitespace-nowrap transition-colors border-b-2 ${
              board === key ? 'border-accent text-accent' : 'border-transparent text-t3 hover:text-t2'
            }`}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      <div className="px-3 py-2">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-6 rounded-md bg-bg-elevated" />
            ))}
          </div>
        ) : !data ? (
          <p className="text-xs text-t3 text-center py-6">Leaderboards unavailable</p>
        ) : data.mvp.length === 0 && data.runGetters.length === 0 ? (
          <p className="text-xs text-t3 text-center py-6">Complete matches to build the leaderboards</p>
        ) : (
          <>
            {data.guestPlayersAllowed && (
              <p className="text-[10px] text-t3 mb-1.5">Guests count in matches; flagged below.</p>
            )}
            {board === 'mvp' &&
              data.mvp.map((e, i) => (
                <Row key={e.playerId} entry={e} rank={i} primary={String(e.mvp)} secondary="MVP pts" />
              ))}
            {board === 'runs' &&
              data.runGetters.map((e, i) => (
                <Row key={e.playerId} entry={e} rank={i} primary={String(e.runs)} secondary={`${e.balls} b · ${e.fours}×4 ${e.sixes}×6`} />
              ))}
            {board === 'wickets' &&
              data.wicketTakers.map((e, i) => (
                <Row key={e.playerId} entry={e} rank={i} primary={String(e.wickets)} secondary={`${e.runsConceded} runs in ${e.legalBalls} b`} />
              ))}
            {board === 'economy' &&
              data.bestEconomy.map((e, i) => (
                <Row key={e.playerId} entry={e} rank={i} primary={e.economy.toFixed(2)} secondary={`${e.overs} ov`} />
              ))}
            {board === 'sr' &&
              data.bestStrikeRate.map((e, i) => (
                <Row key={e.playerId} entry={e} rank={i} primary={e.strikeRate.toFixed(1)} secondary={`${e.runs} in ${e.balls} b`} />
              ))}
            {((board === 'economy' && data.bestEconomy.length === 0) ||
              (board === 'sr' && data.bestStrikeRate.length === 0)) && (
              <p className="text-xs text-t3 text-center py-4">
                {board === 'economy' ? 'Needs 3+ overs bowled' : 'Needs 30+ balls faced'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
