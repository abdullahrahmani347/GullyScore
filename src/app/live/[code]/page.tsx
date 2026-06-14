'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, RefreshCw, AlertTriangle, Radio, Copy, Check } from 'lucide-react';
import { formatOvers, calculateCRR, calculateRRR, formatStrikeRate, formatEconomy, formatBowlingFigures } from '@/lib/scoring-utils';
import type { MatchData, InningsState, BallRecord } from '@/types';

/* ─── Spectator Score Card ─── */

function SpectatorScoreDisplay({ match, currentInnings }: { match: MatchData; currentInnings: InningsState }) {
  const runs = currentInnings.runs;
  const wickets = currentInnings.wickets;
  const completedOvers = currentInnings.completedOvers;
  const currentBalls = currentInnings.currentBalls;
  const crr = calculateCRR(runs, completedOvers, currentBalls);
  const isSecondInnings = currentInnings.inningsNumber === 2;
  const target = currentInnings.target;
  const rrr = isSecondInnings && target ? calculateRRR(target - runs, match.totalOvers, completedOvers, currentBalls) : null;
  const runsNeeded = isSecondInnings && target ? target - runs : null;
  const isDifficultChase = rrr !== null && crr > 0 && rrr > crr * 1.3;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-bg-card border border-border px-4 py-4">
      {/* Team name */}
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: currentInnings.team.color }} />
        <span className="text-xs font-medium text-t2 uppercase tracking-wider">
          {currentInnings.team.name} · Innings {currentInnings.inningsNumber}
        </span>
      </div>

      {/* Hero score */}
      <div className="flex items-baseline gap-3">
        <div className="font-mono text-5xl font-bold text-t1 leading-none">
          {runs}/{wickets}
        </div>
        <span className="font-mono text-lg text-t3">
          ({formatOvers(completedOvers, currentBalls)} ov)
        </span>
      </div>

      {/* Run rates */}
      <div className="flex items-center gap-4 mt-2">
        <span className="text-xs text-t2">
          CRR: <span className="text-t1 font-mono font-medium">{crr.toFixed(2)}</span>
        </span>
        {isSecondInnings && rrr !== null && runsNeeded !== null && (
          <span className={`text-xs ${isDifficultChase ? 'text-wicket' : 'text-accent'}`}>
            RRR: <span className="font-mono font-medium">{rrr.toFixed(2)}</span>
          </span>
        )}
        {isSecondInnings && runsNeeded !== null && runsNeeded > 0 && (
          <span className="text-xs text-t3">
            Need <span className="text-t1 font-mono font-medium">{runsNeeded}</span>
          </span>
        )}
        {isSecondInnings && runsNeeded !== null && runsNeeded <= 0 && (
          <span className="text-xs text-accent font-medium">Target reached!</span>
        )}
      </div>

      {/* Target */}
      {isSecondInnings && target && (
        <div className="mt-2 pt-2 border-t border-border">
          <span className="text-xs text-t3">
            Target: <span className="text-gold font-mono font-medium">{target}</span>
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── Over Strip (read-only) ─── */

function getBallDisplay(ball: BallRecord): { label: string; color: string; bg: string } {
  if (ball.isWicket) return { label: 'W', color: 'text-white', bg: 'bg-wicket' };
  if (ball.extraType === 'WIDE') return { label: 'Wd', color: 'text-t1', bg: 'bg-bg-elevated' };
  if (ball.extraType === 'NO_BALL') return { label: 'Nb', color: 'text-t1', bg: 'bg-bg-elevated' };
  if (ball.extraType === 'BYE' || ball.extraType === 'LEG_BYE') {
    const prefix = ball.extraType === 'BYE' ? 'B' : 'Lb';
    if (ball.runs === 4) return { label: `${prefix}4`, color: 'text-run-4', bg: 'bg-run-4-bg' };
    if (ball.runs === 6) return { label: `${prefix}6`, color: 'text-run-6', bg: 'bg-run-6-bg' };
    return { label: `${prefix}${ball.runs}`, color: 'text-t1', bg: 'bg-bg-elevated' };
  }
  if (ball.runs === 0) return { label: '0', color: 'text-t3', bg: 'bg-dot/60' };
  if (ball.runs === 4) return { label: '4', color: 'text-run-4', bg: 'bg-run-4-bg' };
  if (ball.runs === 6) return { label: '6', color: 'text-run-6', bg: 'bg-run-6-bg' };
  return { label: String(ball.runs), color: 'text-t1', bg: 'bg-bg-elevated' };
}

function SpectatorOverStrip({ currentInnings }: { currentInnings: InningsState }) {
  const currentOverNumber = currentInnings.completedOvers;
  const currentOverAllBalls = currentInnings.balls.filter(
    (b) => b.overNumber === currentOverNumber
  ).sort((a, b) => a.deliveryNumber - b.deliveryNumber);

  const prevOverNumber = currentOverNumber - 1;
  const prevOverBalls = prevOverNumber >= 0
    ? currentInnings.balls.filter((b) => b.overNumber === prevOverNumber).sort((a, b) => a.deliveryNumber - b.deliveryNumber)
    : [];

  const legalBallsInOver = currentInnings.balls.filter(
    (b) => b.overNumber === currentOverNumber && b.isLegalDelivery
  ).length;

  return (
    <div className="rounded-xl bg-bg-card border border-border px-3 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-t3 uppercase tracking-wider">Over {currentOverNumber + 1}</span>
        <span className="text-xs text-t3 font-mono">{legalBallsInOver}/6</span>
      </div>
      <div className="flex items-center gap-1.5 min-h-[28px]">
        {currentOverAllBalls.map((ball) => {
          const display = getBallDisplay(ball);
          return (
            <div
              key={ball.id}
              className={`flex items-center justify-center min-w-[28px] h-[28px] rounded-full text-xs font-bold font-mono px-1.5 ${display.color} ${display.bg}`}
            >
              {display.label}
            </div>
          );
        })}
        {Array.from({ length: Math.max(0, 6 - currentOverAllBalls.length) }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="flex items-center justify-center min-w-[28px] h-[28px] rounded-full border border-border/50 text-xs text-t3/30 font-mono"
          >
            ·
          </div>
        ))}
      </div>
      {prevOverBalls.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-border/50">
          <span className="text-[10px] text-t3">
            Prev: Ov {prevOverNumber + 1} → {prevOverBalls.map((b) => getBallDisplay(b).label).join(' ')} ({prevOverBalls.reduce((acc, b) => acc + b.runs + b.extraRuns, 0)} runs)
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── Batsmen Display (read-only) ─── */

function SpectatorBatsmen({ currentInnings }: { currentInnings: InningsState }) {
  const striker = currentInnings.batting.find((b) => b.playerId === currentInnings.strikerId);
  const nonStriker = currentInnings.batting.find((b) => b.playerId === currentInnings.nonStrikerId);

  if (!striker && !nonStriker) return null;

  return (
    <div className="rounded-xl bg-bg-card border border-border px-3 py-2.5">
      <div className="space-y-2">
        {striker && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-accent text-[10px]">●</span>
              <span className="text-sm font-semibold text-accent truncate">{striker.player.name}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-sm font-mono font-bold text-t1">
                {striker.runs}<span className="text-t3 font-normal">({striker.balls})</span>
              </span>
              <span className="text-xs text-t3 font-mono w-12 text-right">
                SR {formatStrikeRate(striker.runs, striker.balls)}
              </span>
            </div>
          </div>
        )}
        {nonStriker && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-t3 text-[10px]">○</span>
              <span className="text-sm text-t2 truncate">{nonStriker.player.name}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-sm font-mono text-t2">
                {nonStriker.runs}<span className="text-t3 font-normal">({nonStriker.balls})</span>
              </span>
              <span className="text-xs text-t3 font-mono w-12 text-right">
                SR {formatStrikeRate(nonStriker.runs, nonStriker.balls)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Bowler Display (read-only) ─── */

function SpectatorBowler({ currentInnings }: { currentInnings: InningsState }) {
  const bowler = currentInnings.bowling.find((b) => b.playerId === currentInnings.currentBowlerId);

  if (!bowler) {
    return (
      <div className="rounded-xl bg-bg-card border border-border px-3 py-2.5">
        <span className="text-xs text-t3">Bowling</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-bg-card border border-border px-3 py-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium text-t3 uppercase tracking-wider">Bowling</span>
          <span className="text-sm font-semibold text-t2 truncate">{bowler.player.name}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-mono font-bold text-t1">
            {formatBowlingFigures(bowler.completedOvers, bowler.balls, bowler.runs, bowler.wickets)}
          </span>
          <span className="text-xs text-t3 font-mono w-14 text-right">
            Econ {formatEconomy(bowler.runs, bowler.completedOvers, bowler.balls)}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── First Innings Summary ─── */

function FirstInningsSummary({ innings }: { innings: InningsState }) {
  return (
    <div className="rounded-xl bg-bg-card border border-border px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: innings.team.color }} />
        <span className="text-xs font-medium text-t2">
          {innings.team.name}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-xl font-bold text-t1">
          {innings.runs}/{innings.wickets}
        </span>
        <span className="font-mono text-sm text-t3">
          ({formatOvers(innings.completedOvers, innings.currentBalls)} ov)
        </span>
      </div>
    </div>
  );
}

/* ─── Main Spectator Page ─── */

export default function SpectatorPage() {
  const params = useParams();
  const code = params.code as string;

  const [match, setMatch] = useState<MatchData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [copied, setCopied] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch initial match data
  const fetchMatch = useCallback(async () => {
    try {
      const normalizedCode = code.replace(/^GS-/i, '').toUpperCase();
      const res = await fetch(`/api/live/${normalizedCode}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Match not found');
      }
      const data = await res.json();
      setMatch(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load match');
    } finally {
      setIsLoading(false);
    }
  }, [code]);

  // Initial fetch
  useEffect(() => {
    fetchMatch();
  }, [fetchMatch]);

  // SSE connection
  useEffect(() => {
    if (!match) return;

    const matchId = match.id;
    const es = new EventSource(`/api/matches/${matchId}/stream`);

    es.onopen = () => {
      setIsConnected(true);
    };

    es.onerror = () => {
      setIsConnected(false);
      // EventSource will auto-reconnect
    };

    es.addEventListener('init', (e) => {
      try {
        const data = JSON.parse(e.data);
        setMatch(data);
        setLastUpdate(new Date());
        setIsConnected(true);
      } catch {}
    });

    es.addEventListener('update', (e) => {
      try {
        const event = JSON.parse(e.data);
        setLastUpdate(new Date());

        // For ball/wicket/over_complete events, re-fetch full match data
        if (['ball', 'wicket', 'over_complete', 'innings_break', 'match_complete', 'match_abandoned', 'status_change'].includes(event.type)) {
          fetchMatch();
        }
      } catch {}
    });

    eventSourceRef.current = es;

    return () => {
      es.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    };
  }, [match?.id, fetchMatch]);

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/live/${code}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-dvh bg-bg-app flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-t2 text-sm">Connecting to match...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !match) {
    return (
      <div className="min-h-dvh bg-bg-app flex items-center justify-center p-4">
        <div className="rounded-2xl border border-border bg-bg-card p-8 text-center max-w-sm w-full">
          <AlertTriangle size={40} className="mx-auto mb-4 text-orange-400" />
          <h2 className="text-lg font-semibold text-t1 mb-2">Match not found</h2>
          <p className="text-sm text-t3 mb-1">{error || 'Check the code and try again.'}</p>
          <p className="text-xs text-t3 mb-6">Code: GS-{code.replace(/^GS-/i, '').toUpperCase()}</p>
          <button
            onClick={fetchMatch}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent-dim text-accent text-sm font-medium hover:bg-accent/20 transition-colors"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const currentInnings = match.innings?.find((i) => !i.isCompleted);
  const firstInnings = match.innings?.find((i) => i.inningsNumber === 1);
  const isLive = match.status === 'LIVE' || match.status === 'INNINGS_BREAK';
  const isCompleted = match.status === 'COMPLETED';
  const isAbandoned = match.status === 'ABANDONED';
  const normalizedCode = code.replace(/^GS-/i, '').toUpperCase();

  return (
    <div className="min-h-dvh bg-bg-app flex flex-col">
      {/* Header */}
      <div className="px-4 pt-6 pb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Zap size={20} className="text-accent" />
            <h1 className="text-xl font-bold text-t1">GullyScore</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Connection indicator */}
            {isLive && (
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                isConnected ? 'bg-accent/15 text-accent' : 'bg-t3/15 text-t3'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-accent animate-pulse' : 'bg-t3'}`} />
                {isConnected ? 'LIVE' : 'Reconnecting...'}
              </div>
            )}
            {isCompleted && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-t3/15 text-t3">Completed</span>
            )}
            {isAbandoned && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-orange-400/15 text-orange-400">Abandoned</span>
            )}
          </div>
        </div>

        {/* Teams header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: match.team1.color }} />
            <span className="text-sm font-semibold text-t1">{match.team1.name}</span>
          </div>
          <span className="text-xs text-t3 font-medium">vs</span>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-t1">{match.team2.name}</span>
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: match.team2.color }} />
          </div>
        </div>

        {/* Live code badge */}
        <div className="mt-2 flex items-center justify-center gap-2">
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-elevated border border-border hover:border-border-act transition-colors"
          >
            <Radio size={12} className="text-accent" />
            <span className="text-xs font-mono font-bold text-t1">GS-{normalizedCode}</span>
            {copied ? (
              <Check size={12} className="text-accent" />
            ) : (
              <Copy size={12} className="text-t3" />
            )}
          </button>
        </div>
      </div>

      {/* Match content */}
      <div className="px-3 flex-1">
        {currentInnings ? (
          <>
            {/* Current innings score */}
            <SpectatorScoreDisplay match={match} currentInnings={currentInnings} />

            {/* First innings summary (if 2nd innings) */}
            {currentInnings.inningsNumber === 2 && firstInnings && (
              <div className="mt-2">
                <FirstInningsSummary innings={firstInnings} />
              </div>
            )}

            {/* Over strip */}
            <div className="mt-2">
              <SpectatorOverStrip currentInnings={currentInnings} />
            </div>

            {/* Batsmen + Bowler */}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <SpectatorBatsmen currentInnings={currentInnings} />
              <SpectatorBowler currentInnings={currentInnings} />
            </div>
          </>
        ) : isCompleted || isAbandoned ? (
          /* Match result */
          <div className="mt-2 rounded-2xl bg-bg-card border border-border p-6 text-center">
            {match.result && (
              <p className="text-lg font-bold text-t1">{match.result}</p>
            )}
            {firstInnings && match.innings[1] && (
              <div className="mt-4 space-y-3">
                <FirstInningsSummary innings={firstInnings} />
                <FirstInningsSummary innings={match.innings[1]} />
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl bg-bg-card border border-border p-8 text-center">
            <Radio size={32} className="mx-auto mb-3 text-accent" />
            <p className="text-sm text-t2 mb-1">Match hasn&apos;t started yet</p>
            <p className="text-xs text-t3">Score updates will appear here automatically</p>
          </div>
        )}
      </div>

      {/* Footer with last update time */}
      <div className="px-4 py-4 mt-auto">
        <div className="flex items-center justify-between text-[10px] text-t3">
          <span>{match.totalOvers} overs · {match.venue || 'Gully cricket'}</span>
          {lastUpdate && (
            <span>Updated {lastUpdate.toLocaleTimeString()}</span>
          )}
        </div>
      </div>
    </div>
  );
}
