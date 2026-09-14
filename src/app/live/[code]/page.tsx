'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, AlertTriangle, Radio, Copy, Check, ArrowLeft, BellRing } from 'lucide-react';
import { LogoMark } from '@/components/brand/Logo';
import { formatOvers, calculateCRR, calculateRRR, formatStrikeRate, formatEconomy, formatBowlingFigures } from '@/lib/scoring-utils';
import { WpLineChart, TurningPointsList } from '@/components/analytics';
import { useLiveStream, type LiveStreamEvent } from '@/hooks/useLiveStream';
import { shouldRefetch } from '@/lib/sse-events';
import { teamTint } from '@/lib/scoring-ux';
import { useSettingsStore } from '@/store/settingsStore';
import { catchMeUpSummary } from '@/lib/catch-me-up';
import { useFeatures } from '@/hooks/useFeatures';
import { recordFollow } from '@/lib/follow';
import PushBell from '@/components/live/PushBell';
import StoryShareButton from '@/components/live/StoryShareButton';
import ReactionBar from '@/components/live/ReactionBar';
import BallTimeline from '@/components/live/BallTimeline';
import type { MatchData, InningsState, BallRecord } from '@/types';
import type { CSSProperties } from 'react';

/* ─── v2 §12.3 — Target Adjusted Banner ─── */

function TargetAdjustedBanner({
  banner,
  clear,
}: {
  banner: { newTarget: number; method: string; reason: string; at: number } | null;
  clear: () => void;
}) {
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(clear, 30000); // keep the banner up for 30s
    return () => clearTimeout(t);
  }, [banner, clear]);

  if (!banner) return null;
  const methodLabel = banner.method === 'dls' ? 'DLS' : banner.method === 'approx' ? 'approx' : 'manual';
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex items-center gap-2 mt-2 rounded-xl bg-gold/10 border border-gold/30 px-3 py-2"
    >
      <AlertTriangle size={14} className="text-gold shrink-0" />
      <span className="text-xs text-t2">
        Target adjusted: <span className="text-gold font-mono font-semibold">{banner.newTarget}</span>
        <span className="text-t3"> ({methodLabel})</span>
        {banner.reason ? <span className="text-t3"> — {banner.reason}</span> : null}
      </span>
    </motion.div>
  );
}

/* ─── v2 §13.1/§13.9 — Win Probability line + "Catch me up" digest ─── */

function WinProbabilityPanel({
  match,
  currentInnings,
  liveWp,
}: {
  match: MatchData;
  currentInnings: InningsState;
  liveWp: number | null;
}) {
  return (
    <div className="relative">
      <WpLineChart match={match} innings={currentInnings} compact />
      {liveWp != null && (
        <span className="absolute top-1.5 right-2.5 flex items-center gap-1 text-[10px] font-mono font-bold text-t1">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          {Math.round(liveWp * 100)}%
        </span>
      )}
    </div>
  );
}

function CatchMeUp({ match, currentInnings }: { match: MatchData; currentInnings: InningsState | null }) {
  const [open, setOpen] = useState(false);
  // §15.5 — 5-bullet template summary built on turning points (§13.9)
  const bullets = useMemo(
    () => catchMeUpSummary(match, currentInnings),
    [match, currentInnings]
  );
  if (bullets.length === 0) return null;
  return (
    <div className="rounded-xl bg-bg-card border border-border overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5"
        aria-expanded={open}
      >
        <span className="text-[10px] text-t3 uppercase tracking-wider font-medium">Catch me up</span>
        <span className="text-[9px] text-t3">the 5 moments that swung the match</span>
        <span className="ml-auto text-t3 text-xs">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <ul className="px-3 pb-3 space-y-1.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-[11px] leading-snug">
              <span
                className={`mt-0.5 w-4 h-4 flex items-center justify-center rounded shrink-0 text-[8px] font-bold ${
                  b.kind === 'state'
                    ? 'bg-accent/15 text-accent'
                    : b.kind === 'turn'
                      ? 'bg-wicket-bg text-wicket'
                      : b.kind === 'star'
                        ? 'bg-gold/15 text-gold'
                        : 'bg-bg-elevated text-t3'
                }`}
              >
                {b.kind === 'state' ? '●' : b.kind === 'turn' ? '↯' : b.kind === 'star' ? '★' : '•'}
              </span>
              <span className="text-t2">{b.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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

/* ─── Current Partnership (spectator) ─── */

function SpectatorPartnership({ currentInnings }: { currentInnings: InningsState }) {
  const partnerships = currentInnings.partnerships;
  if (!partnerships || partnerships.length === 0) return null;

  const openPartnership = partnerships.find((p) => p.isOpen);
  if (!openPartnership) return null;

  const strikeRate = openPartnership.balls > 0
    ? ((openPartnership.runs / openPartnership.balls) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="rounded-xl bg-bg-card border border-border px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] text-green-400 font-semibold uppercase tracking-wider">
            Partnership
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-mono font-bold text-t1">
            {openPartnership.runs}
          </span>
          <span className="text-[10px] text-t3 font-mono">
            ({openPartnership.balls}b)
          </span>
          <span className="text-[10px] text-t3 font-mono">
            SR {strikeRate}
          </span>
          {openPartnership.runs >= 50 && (
            <span className="text-[9px] font-bold text-gold bg-gold/10 px-1.5 py-0.5 rounded">
              50+
            </span>
          )}
          {openPartnership.runs >= 100 && (
            <span className="text-[9px] font-bold text-gold bg-gold/20 px-1.5 py-0.5 rounded">
              100
            </span>
          )}
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
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [copied, setCopied] = useState(false);
  // v2 §12.3 — target-adjusted banner state
  const [targetBanner, setTargetBanner] = useState<{ newTarget: number; method: string; reason: string; at: number } | null>(null);
  // v2 §13.1 — instant WP from the per-ball SSE broadcast
  const [liveWp, setLiveWp] = useState<number | null>(null);
  const themeMode = useSettingsStore((s) => s.theme);
  const { isEnabled } = useFeatures();

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

  // §15.4 — event registry so ReactionBar (and future widgets) receive
  // every typed SSE event without re-opening the stream.
  const handlersRef = useRef(new Set<(event: LiveStreamEvent) => void>());
  const registerEvent = useCallback((handler: (event: LiveStreamEvent) => void) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  // v2 §15.7 — live stream with manual 1 s→30 s backoff + Last-Event-ID
  // replay (subway-ride guarantee: no missed balls on reconnect).
  const { isConnected, isReplaying } = useLiveStream(match?.id ?? null, {
    onEvent: (event) => {
      setLastUpdate(new Date());
      for (const handler of handlersRef.current) handler(event);

      // v2 §13.1 — per-ball `wp` broadcast (instant, before the refetch)
      if ((event.type === 'ball' || event.type === 'wicket') && typeof event.data?.wp === 'number') {
        setLiveWp(event.data.wp as number);
      }

      // v2 §15.7 — typed registry decides which families trigger a refetch;
      // metadata-only edits (wagon/pitch capture, §13.2/§13.3) are excluded
      if (shouldRefetch(event.type) && !event.data?.metaOnly) {
        fetchMatch();
      }

      // v2 §12.3 — "Target adjusted: 87 (DLS)" banner
      if (event.type === 'target_adjusted' && event.data?.newTarget != null) {
        setTargetBanner({
          newTarget: event.data.newTarget as number,
          method: (event.data.method as string) ?? 'dls',
          reason: (event.data.reason as string) ?? '',
          at: Date.now(),
        });
      }
    },
    onInit: (data) => {
      if (data && typeof data === 'object' && 'id' in (data as Record<string, unknown>)) {
        setMatch(data as MatchData);
        setLastUpdate(new Date());
      }
    },
  });

  // §15.8 — follow: persist the last-watched match (localStorage)
  useEffect(() => {
    if (!match) return;
    recordFollow({
      matchId: match.id,
      code: (match.liveCode ?? code).replace(/^GS-/i, '').toUpperCase(),
      team1: match.team1?.name ?? '',
      team2: match.team2?.name ?? '',
      status: match.status,
    });
  }, [match?.id, code]); // record once per match, not per poll

  // §15.8 — team-color theming: accents tint with the batting team's
  // color (auto-lightened for contrast via teamTint).
  const tint = useMemo(() => {
    const currentInnings = match?.innings?.find((i) => !i.isCompleted);
    const color = currentInnings?.team?.color ?? match?.team1?.color;
    if (!color) return 'transparent';
    return teamTint(color, themeMode === 'light' ? 'light' : 'dark');
  }, [match, themeMode]);

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
    <div className="min-h-dvh bg-bg-app flex flex-col" style={{ '--team-tint': tint } as CSSProperties}>
      {/* Header */}
      <div className="px-4 pt-6 pb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <a
              href="/live"
              aria-label="Back to live hub"
              className="w-7 h-7 flex items-center justify-center rounded-full bg-bg-elevated border border-border text-t3 hover:text-t2 hover:border-border-act transition-colors"
            >
              <ArrowLeft size={13} />
            </a>
            <LogoMark size={20} />
            <h1 className="text-xl font-bold text-t1">GullyScore</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Connection indicator (§15.7: replay state shows too) */}
            {isLive && (
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                isConnected ? 'bg-accent/15 text-accent' : 'bg-t3/15 text-t3'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-accent animate-pulse' : 'bg-t3'}`} />
                {isConnected ? (isReplaying ? 'Syncing…' : 'LIVE') : 'Reconnecting…'}
              </div>
            )}
            {isCompleted && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-t3/15 text-t3">Completed</span>
            )}
            {isAbandoned && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-orange-400/15 text-orange-400">Abandoned</span>
            )}
            {/* v2 §15.2 — push bell (per match / all) */}
            <PushBell matchId={match.id} />
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

        {/* Live code badge + story share (§15.3) */}
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
          <StoryShareButton match={match} />
        </div>
      </div>

      {/* Match content */}
      <div className="px-3 flex-1">
        {currentInnings ? (
          <>
            {/* Current innings score */}
            <SpectatorScoreDisplay match={match} currentInnings={currentInnings} />

            {/* v2 §12.3 — "Target adjusted: 87 (DLS)" banner */}
            <TargetAdjustedBanner banner={targetBanner} clear={() => setTargetBanner(null)} />

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

            {/* Current partnership */}
            <div className="mt-2">
              <SpectatorPartnership currentInnings={currentInnings} />
            </div>

            {/* v2 §13.1 — win probability live line */}
            <div className="mt-2">
              <WinProbabilityPanel match={match} currentInnings={currentInnings} liveWp={liveWp} />
            </div>

            {/* v2 §13.9/§15.5 — "Catch me up" 5-bullet digest */}
            <div className="mt-2">
              <CatchMeUp match={match} currentInnings={currentInnings} />
            </div>

            {/* v2 §15.5 — ball timeline (chips + commentary, PP/FH/edited) */}
            <div className="mt-2">
              <BallTimeline match={match} currentInnings={currentInnings} />
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
        {/* v2 §15.4 — reactions (flag-gated, anonymous, ephemeral) */}
        {isEnabled('reactions') && isLive && currentInnings && (
          <div className="mb-3">
            <ReactionBar matchId={match.id} registerEvent={registerEvent} />
          </div>
        )}
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
