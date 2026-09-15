'use client';

/**
 * v2 §16.2 — MULTI-TAB SAFETY + SCORER LOCK
 * ---------------------------------------------------------------------------
 * Two primitives:
 *
 * 1. getScoreChannel() — a BroadcastChannel('gullyscore') that mirrors store
 *    events across tabs (ball recorded, undo, match switch, lock handover).
 *    Receiving tabs use it to revalidate SWR caches instead of guessing.
 *
 * 2. useScorerLock(matchId) — a Web Locks (navigator.locks) SOFT lock:
 *    - The scoring tab holds `gullyscore-scorer-<matchId>` for as long as it
 *      is mounted.
 *    - A second tab opening the same match cannot acquire it → renders
 *      read-only with a "Take over" button.
 *    - "Take over" requests the lock with { steal: true }: the original
 *      holder's request rejects with an AbortError and that tab flips to
 *      read-only too (clean handoff in either direction).
 *    - If Web Locks is unsupported (old browsers), the lock reports
 *      'unavailable' and scoring stays enabled — offline-first wins.
 */

export type ScoreTabEvent =
  | { kind: 'ball'; matchId: string; deliveryNumber?: number; at: number }
  | { kind: 'undo'; matchId: string; deliveryNumber?: number; at: number }
  | { kind: 'edit'; matchId: string; deliveryNumber?: number; at: number }
  | { kind: 'lock-taken'; matchId: string; at: number }
  | { kind: 'lock-released'; matchId: string; at: number };

const CHANNEL_NAME = 'gullyscore';

type Listener = (event: ScoreTabEvent) => void;

let channel: BroadcastChannel | null = null;
const listeners = new Set<Listener>();

function ensureChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;
  if (!('BroadcastChannel' in window)) return null;
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (msg) => {
      const event = msg.data as ScoreTabEvent;
      if (!event || typeof event !== 'object' || !('kind' in event)) return;
      listeners.forEach((fn) => {
        try {
          fn(event);
        } catch {
          // listener errors must not break the tab
        }
      });
    };
  }
  return channel;
}

/** Subscribe to cross-tab score events from OTHER tabs. */
export function subscribeScoreEvents(listener: Listener): () => void {
  ensureChannel();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Broadcast a store event to all other tabs. */
export function broadcastScoreEvent(event: ScoreTabEvent): void {
  const ch = ensureChannel();
  try {
    ch?.postMessage(event);
  } catch {
    // structured-clone failure or closed channel — never break the caller
  }
}

// ─── Web Locks scorer lock ───────────────────────────────────────────────

export type ScorerLockState = 'acquiring' | 'held' | 'readonly' | 'unavailable';

interface LockManagerShim {
  request: (
    name: string,
    opts: {
      mode?: 'exclusive';
      ifAvailable?: boolean;
      steal?: boolean;
      signal?: AbortSignal;
    },
    callback: (lock: Lock | null) => Promise<void> | void,
  ) => Promise<void>;
}

function lockManager(): LockManagerShim | null {
  if (typeof navigator === 'undefined') return null;
  const lm = (navigator as Navigator & { locks?: LockManagerShim }).locks;
  return lm ?? null;
}

export function lockNameFor(matchId: string): string {
  return `gullyscore-scorer-${matchId}`;
}

// ── read-only registry (deep defense) ────────────────────────────────────
// The useScorerLock hook drives UI, but write-path guards (useScoringHandlers)
// also consult this set so a locked-out tab can never mutate even if a UI
// path slips through (keyboard shortcuts, voice, deep links).
const lockedOutMatches = new Set<string>();

/** True when THIS tab lost (or never won) the scorer lock for a match. */
export function isScoreLocked(matchId: string): boolean {
  return lockedOutMatches.has(matchId);
}

/** @internal — used by useScorerLock to publish lock outcomes. */
export function setScoreLockState(matchId: string, lockedOut: boolean): void {
  if (lockedOut) lockedOutMatches.add(matchId);
  else lockedOutMatches.delete(matchId);
}

/**
 * Try to hold the scorer lock for a match.
 *
 * - `steal: false` (first tab): acquires only if free; resolves
 *   { ok: false } when another tab already holds it → caller goes read-only.
 * - `steal: true` ("Take over"): breaks the existing holder. The previous
 *   tab's hold promise rejects (AbortError) and it flips to read-only.
 *
 * The lock is held until `release()` is called or the tab closes/dies —
 * the browser auto-releases dead-tab locks, which is exactly the recovery
 * behaviour we want for a scorer who closed their tab mid-match.
 */
export function acquireScorerLock(
  matchId: string,
  opts: { steal?: boolean } = {},
): { held: Promise<boolean>; release: () => void } {
  const lm = lockManager();
  if (!lm) {
    return { held: Promise.resolve(false), release: () => {} };
  }

  let releaseLock: (() => void) | null = null;
  let controller: AbortController | null = null;

  const held = new Promise<boolean>((resolve) => {
    const run = async () => {
      controller = new AbortController();
      await lm.request(
        lockNameFor(matchId),
        { ifAvailable: !opts.steal, steal: opts.steal ?? false, signal: controller.signal },
        async (lock) => {
          if (!lock) {
            resolve(false);
            return;
          }
          // Hold until release() or the tab dies.
          await new Promise<void>((keepHeld) => {
            releaseLock = () => {
              releaseLock = null;
              controller?.abort(); // aborting our own request exits the callback
              keepHeld();
            };
          });
          resolve(true);
        },
      ).catch(() => {
        // steal-rejected / aborted — either way we did not end up holding
        resolve(releaseLock !== null);
      });
    };
    void run();
  });

  return {
    held,
    release: () => {
      releaseLock?.();
    },
  };
}
