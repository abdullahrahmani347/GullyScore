'use client';

/**
 * GULLYSCORE v2 §15.1/§15.8 — LIVE HUB CLIENT
 * ---------------------------------------------------------------------------
 * Server-rendered grid (initial props from the page) + streamed updates:
 *   - hub SSE (/api/live/stream) → debounced refetch of /api/live
 *   - 30 s SWR fallback refresh
 * Mini cards: teams, score, overs, striker, RRR, last-6 chips, PP badge.
 * Tournament filter chips; "recently completed" rail; "Continue watching"
 * rail from localStorage follows; install prompt on the 2nd visit (§15.8).
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio, Trophy, Clock, X, Download, BellRing } from 'lucide-react';
import { LogoMark } from '@/components/brand/Logo';
import type { LiveHubCard, CompletedCard } from '@/lib/live-hub';
import type { FollowedMatch } from '@/lib/follow';
import {
  useFollows,
  isInstallDismissed,
  bumpLiveVisit,
  dismissInstallPrompt,
} from '@/lib/follow';

interface HubFeed {
  live: LiveHubCard[];
  completed: CompletedCard[];
  tournaments: { id: string; name: string }[];
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/* ── Mini card chip styles ── */

function chipClass(kind: string): string {
  switch (kind) {
    case 'wicket':
      return 'bg-wicket text-white';
    case 'four':
      return 'bg-run-4-bg text-run-4';
    case 'six':
      return 'bg-run-6-bg text-run-6';
    case 'extra':
      return 'bg-bg-elevated text-t2';
    case 'dot':
      return 'bg-dot/40 text-t3';
    default:
      return 'bg-bg-elevated text-t1';
  }
}

/* ── Mini card ── */

function LiveMiniCard({ card }: { card: LiveHubCard }) {
  return (
    <Link
      href={`/live/${card.liveCode ?? card.matchId}`}
      className="block rounded-2xl bg-bg-card border border-border p-4 hover:border-border-act transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: card.battingTeam.color }}
          />
          <span className="text-sm font-semibold text-t1 truncate">
            {card.battingTeam.shortName || card.battingTeam.name}
          </span>
          <span className="text-[10px] text-t3 shrink-0">vs</span>
          <span className="text-sm text-t2 truncate">
            {card.bowlingTeam.shortName || card.bowlingTeam.name}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {card.powerplay?.active && (
            <span className="text-[9px] font-bold text-gold bg-gold/10 px-1.5 py-0.5 rounded">
              PP
            </span>
          )}
          {card.freeHitPending && (
            <span className="text-[9px] font-bold text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded">
              FH
            </span>
          )}
          {card.inningsNumber === 2 && (
            <span className="text-[9px] font-medium text-t3">2nd</span>
          )}
        </div>
      </div>

      <div className="flex items-baseline gap-2.5 mb-2">
        <span className="font-mono text-2xl font-bold text-t1 leading-none">
          {card.runs}/{card.wickets}
        </span>
        <span className="font-mono text-xs text-t3">({card.overs} ov)</span>
        {card.rrr != null && (
          <span className="ml-auto text-xs font-mono text-accent">
            RRR {card.rrr.toFixed(1)}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        {/* Last 6 balls */}
        <div className="flex items-center gap-1 min-w-0 overflow-hidden">
          {card.last6.map((chip, i) => (
            <span
              key={i}
              className={`flex items-center justify-center min-w-[22px] h-[22px] rounded-full text-[10px] font-bold font-mono px-1 ${chipClass(chip.kind)}`}
            >
              {chip.label}
            </span>
          ))}
          {card.last6.length === 0 && <span className="text-[10px] text-t3"> awaiting first ball…</span>}
        </div>
        {/* Striker */}
        {card.striker && (
          <span className="text-[11px] text-t2 truncate shrink-0 max-w-[40%]">
            <span className="text-accent">●</span> {card.striker.name}{' '}
            <span className="font-mono text-t1">
              {card.striker.runs}
              <span className="text-t3">({card.striker.balls})</span>
            </span>
          </span>
        )}
      </div>

      {card.tournamentName && (
        <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between">
          <span className="text-[10px] text-t3 truncate">🏆 {card.tournamentName}</span>
          <span className="flex items-center gap-1 text-[10px] text-accent font-medium">
            <Radio size={10} /> {card.status === 'INNINGS_BREAK' ? 'Break' : 'LIVE'}
          </span>
        </div>
      )}
    </Link>
  );
}

/* ── Completed rail card ── */

function CompletedRailCard({ card }: { card: CompletedCard }) {
  return (
    <Link
      href={`/live/${card.liveCode ?? card.matchId}`}
      className="flex items-center gap-3 rounded-xl bg-bg-card border border-border px-3 py-2.5 min-w-[240px] hover:border-border-act transition-colors"
    >
      <Trophy size={14} className="text-gold shrink-0" />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-xs font-medium text-t1 truncate">
          <span style={{ color: card.team1.color }}>{card.team1.shortName}</span>
          <span className="text-t3">v</span>
          <span style={{ color: card.team2.color }}>{card.team2.shortName}</span>
        </div>
        <div className="text-[10px] text-t3 truncate">{card.result ?? 'Completed'}</div>
      </div>
      <div className="ml-auto flex items-center gap-1 text-[10px] text-t3 shrink-0">
        <Clock size={10} />
        {card.completedAt ? new Date(card.completedAt).toLocaleDateString() : ''}
      </div>
    </Link>
  );
}

/* ── Continue watching (§15.8 follows) ── */

function ContinueWatchingRail({
  follows,
  feed,
}: {
  follows: FollowedMatch[];
  feed: HubFeed | undefined;
}) {
  type FollowCard = FollowedMatch & { live?: LiveHubCard; done?: CompletedCard };
  const cards = useMemo<FollowCard[]>(() => {
    if (!feed) return follows.slice(0, 3);
    const liveById = new Map(feed.live.map((c) => [c.matchId, c]));
    const doneByCode = new Map(feed.completed.map((c) => [c.liveCode, c]));
    return follows
      .map((f): FollowCard => {
        const live = liveById.get(f.matchId);
        if (live) return { ...f, live };
        const done = doneByCode.get(f.code);
        if (done) return { ...f, done };
        return { ...f };
      })
      .slice(0, 3);
  }, [follows, feed]);

  if (cards.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <BellRing size={12} className="text-accent" />
        <h2 className="text-xs font-medium text-t2 uppercase tracking-wider">Continue watching</h2>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {cards.map((c) => (
          <Link
            key={c.matchId}
            href={`/live/${c.code}`}
            className="flex items-center gap-2.5 rounded-xl bg-accent-dim border border-accent/20 px-3 py-2 min-w-[200px] hover:border-accent/40 transition-colors"
          >
            <span className="text-xs text-t1 font-medium truncate">
              {c.team1} <span className="text-t3">v</span> {c.team2}
            </span>
            {'live' in c && c.live ? (
              <span className="ml-auto flex items-center gap-1 text-[10px] text-accent font-bold shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                {c.live.runs}/{c.live.wickets}
              </span>
            ) : 'done' in c && c.done ? (
              <span className="ml-auto text-[10px] text-t3 shrink-0">FT</span>
            ) : (
              <span className="ml-auto text-[10px] text-t3 shrink-0">→</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ── Install prompt (§15.8 — 2nd visit) ── */

function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferred, setDeferred] = useState<{ prompt: () => Promise<void> } | null>(null);

  useEffect(() => {
    const visits = bumpLiveVisit();
    if (visits < 2 || isInstallDismissed()) return;
    const t = setTimeout(() => setShow(true), 1200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as unknown as { prompt: () => Promise<void> });
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const close = () => {
    setShow(false);
    dismissInstallPrompt();
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md"
        >
          <div className="rounded-2xl bg-bg-elevated border border-border shadow-xl px-4 py-3 flex items-center gap-3">
            <Download size={16} className="text-accent shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-t1">Install GullyScore</p>
              <p className="text-xs text-t3">Follow matches from your home screen — even offline.</p>
            </div>
            <button
              onClick={() => {
                if (deferred) {
                  void deferred.prompt();
                }
                close();
              }}
              className="px-3 py-1.5 rounded-lg bg-accent-dim text-accent text-xs font-medium hover:bg-accent/20 transition-colors shrink-0"
            >
              Install
            </button>
            <button
              onClick={close}
              aria-label="Dismiss"
              className="p-1 text-t3 hover:text-t2 shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── Main hub client ── */

export default function LiveHubClient({ initial }: { initial: HubFeed }) {
  const { data: feed, mutate } = useSWR<HubFeed>('/api/live', fetcher, {
    fallbackData: initial,
    revalidateOnFocus: true,
    refreshInterval: 30_000, // fallback poll — SSE usually refreshes sooner
  });

  // Hub SSE → debounced refetch
  const esRef = useRef<EventSource | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const es = new EventSource('/api/live/stream');
    esRef.current = es;
    const onUpdate = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void mutate();
      }, 400);
    };
    es.addEventListener('update', onUpdate);
    return () => {
      es.close();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [mutate]);

  // §15.8 follows (reactive localStorage snapshot — hydration-safe)
  const follows = useFollows();

  // Tournament filter
  const [filter, setFilter] = useState<string>('all');
  const live = useMemo(
    () =>
      (feed?.live ?? []).filter(
        (c) => filter === 'all' || c.tournamentId === filter
      ),
    [feed, filter]
  );

  return (
    <div className="min-h-dvh bg-bg-app flex flex-col">
      {/* Header */}
      <div className="px-4 pt-6 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LogoMark size={20} />
            <h1 className="text-xl font-bold text-t1">
              Live<span className="text-accent">Hub</span>
            </h1>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-t3">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            {live.length} live
          </span>
        </div>
      </div>

      <div className="px-4 flex-1 space-y-5 pb-8">
        {/* Continue watching (§15.8) */}
        <ContinueWatchingRail follows={follows} feed={feed} />

        {/* Tournament filter */}
        {(feed?.tournaments?.length ?? 0) > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filter === 'all'
                  ? 'bg-accent-dim text-accent border border-accent/30'
                  : 'bg-bg-card text-t2 border border-border'
              }`}
            >
              All matches
            </button>
            {feed!.tournaments.map((t) => (
              <button
                key={t.id}
                onClick={() => setFilter(t.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap truncate max-w-[180px] transition-colors ${
                  filter === t.id
                    ? 'bg-accent-dim text-accent border border-accent/30'
                    : 'bg-bg-card text-t2 border border-border'
                }`}
              >
                🏆 {t.name}
              </button>
            ))}
          </div>
        )}

        {/* Live grid */}
        {live.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {live.map((card) => (
              <LiveMiniCard key={card.matchId} card={card} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-bg-card border border-border p-8 text-center">
            <Radio size={28} className="mx-auto mb-3 text-accent/60" />
            <p className="text-sm text-t2 mb-1">No live matches right now</p>
            <p className="text-xs text-t3">
              Matches go live here the moment the first ball is scored.
            </p>
          </div>
        )}

        {/* Recently completed rail */}
        {(feed?.completed?.length ?? 0) > 0 && (
          <div>
            <h2 className="text-xs font-medium text-t2 uppercase tracking-wider mb-2">
              Recently completed
            </h2>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {feed!.completed.map((card) => (
                <CompletedRailCard key={card.matchId} card={card} />
              ))}
            </div>
          </div>
        )}
      </div>

      <InstallPrompt />
    </div>
  );
}
