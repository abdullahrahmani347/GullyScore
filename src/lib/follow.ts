'use client';

/**
 * GULLYSCORE v2 §15.8 — FOLLOW (last-watched matches, localStorage)
 * ---------------------------------------------------------------------------
 * "follow" persists the last-watched matches in localStorage. The hub shows
 * a "Continue watching" rail for followed matches, and the live page records
 * every visit. Pure client-side — anonymous, no server state.
 */

import { useCallback, useRef, useSyncExternalStore } from 'react';

const KEY = 'gullyscore-follows';
const MAX = 5;
const EMPTY: FollowedMatch[] = [];

export interface FollowedMatch {
  matchId: string;
  code: string; // normalized live code (no GS- prefix)
  team1: string;
  team2: string;
  status?: string;
  at: number; // epoch ms of last visit
}

export function getFollows(): FollowedMatch[] {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    return parsed
      .filter(
        (m): m is FollowedMatch =>
          m && typeof m.matchId === 'string' && typeof m.code === 'string'
      )
      .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  } catch {
    return EMPTY;
  }
}

/**
 * Reactive follows store (hydration-safe): server renders an empty rail,
 * the client snapshot arrives after mount without setState-in-effect.
 * Re-reads on window focus + cross-tab storage events.
 */
export function useFollows(): FollowedMatch[] {
  const cache = useRef<{ json: string; value: FollowedMatch[] } | null>(null);
  const getSnapshot = useCallback((): FollowedMatch[] => {
    let json = '[]';
    try {
      json = window.localStorage.getItem(KEY) ?? '[]';
    } catch {}
    if (cache.current && cache.current.json === json) return cache.current.value;
    let value: FollowedMatch[] = EMPTY;
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) {
        value = parsed
          .filter(
            (m): m is FollowedMatch =>
              m && typeof m.matchId === 'string' && typeof m.code === 'string'
          )
          .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
      }
    } catch {}
    cache.current = { json, value };
    return value;
  }, []);

  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener('focus', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('focus', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

/** Record (or refresh) a followed match; keeps the 5 most recent. */
export function recordFollow(entry: Omit<FollowedMatch, 'at'> & { at?: number }): void {
  if (typeof window === 'undefined') return;
  try {
    const next: FollowedMatch[] = [
      { ...entry, at: entry.at ?? Date.now() },
      ...getFollows().filter((m) => m.matchId !== entry.matchId),
    ].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full/blocked — following is best-effort.
  }
}

export function unfollow(matchId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify(getFollows().filter((m) => m.matchId !== matchId))
    );
  } catch {}
}

/* ── Install prompt (§15.8): "spectator gets an install prompt on 2nd visit" ── */

const VISIT_KEY = 'gullyscore-live-visits';
const DISMISS_KEY = 'gullyscore-install-dismissed';

/** Increment the live-page visit counter; returns the new count. */
export function bumpLiveVisit(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const n = Number(window.localStorage.getItem(VISIT_KEY) ?? '0') + 1;
    window.localStorage.setItem(VISIT_KEY, String(n));
    return n;
  } catch {
    return 1;
  }
}

export function isInstallDismissed(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return true;
  }
}

export function dismissInstallPrompt(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DISMISS_KEY, '1');
  } catch {}
}
