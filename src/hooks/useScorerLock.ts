'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  acquireScorerLock,
  broadcastScoreEvent,
  subscribeScoreEvents,
  setScoreLockState,
  type ScorerLockState,
} from '@/lib/offline/multi-tab';

/**
 * v2 §16.2 — useScorerLock
 *
 * Binds the Web Locks soft lock lifecycle to a mounted scoring screen:
 *   - 'acquiring'  → initial probe
 *   - 'held'       → this tab may score
 *   - 'readonly'   → another tab holds the lock; show "Take over"
 *   - 'unavailable'→ Web Locks unsupported; scoring allowed (offline-first)
 *
 * Handover: takeOver() steals the lock — the previous holder's hold
 * promise aborts and IT flips to readonly. Both tabs also ping each other
 * over BroadcastChannel('gullyscore') so the UI updates instantly.
 */
export function useScorerLock(matchId: string | null | undefined) {
  const [state, setState] = useState<ScorerLockState>('acquiring');
  const releaseRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);

  const becomeReadonly = useCallback(() => {
    releaseRef.current?.();
    releaseRef.current = null;
    if (matchId) setScoreLockState(matchId, true);
    if (mountedRef.current) setState('readonly');
  }, [matchId]);

  useEffect(() => {
    mountedRef.current = true;

    if (!matchId) {
      setState('unavailable');
      return;
    }

    let cancelled = false;
    setState('acquiring');

    const { held, release } = acquireScorerLock(matchId);
    releaseRef.current = release;

    held
      .then((gotIt) => {
        if (cancelled) {
          release();
          return;
        }
        if (gotIt) {
          setScoreLockState(matchId, false);
          setState('held');
          broadcastScoreEvent({ kind: 'lock-taken', matchId, at: Date.now() });
        } else {
          setScoreLockState(matchId, true);
          setState('readonly');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setScoreLockState(matchId, true);
          setState('readonly');
        }
      });

    // Another tab stole the lock / announced ownership → flip to read-only.
    const unsubscribe = subscribeScoreEvents((event) => {
      if (event.matchId !== matchId) return;
      if (event.kind === 'lock-taken' && releaseRef.current) {
        becomeReadonly();
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
      if (releaseRef.current) {
        releaseRef.current();
        releaseRef.current = null;
        broadcastScoreEvent({ kind: 'lock-released', matchId, at: Date.now() });
      }
      mountedRef.current = false;
    };
  }, [matchId, becomeReadonly]);

  /** §16.2 — "Take over": steal the lock from the other tab. */
  const takeOver = useCallback(() => {
    if (!matchId) return;
    // Release anything we half-hold, then steal.
    releaseRef.current?.();
    releaseRef.current = null;
    setState('acquiring');

    const { held, release } = acquireScorerLock(matchId, { steal: true });
    releaseRef.current = release;
    void held.then((gotIt) => {
      if (gotIt) {
        setScoreLockState(matchId, false);
        setState('held');
        broadcastScoreEvent({ kind: 'lock-taken', matchId, at: Date.now() });
      } else {
        setScoreLockState(matchId, true);
        setState('readonly');
      }
    });
  }, [matchId]);

  return {
    /** true when THIS tab is allowed to submit scoring actions */
    canScore: state === 'held' || state === 'unavailable',
    state,
    takeOver,
  };
}
