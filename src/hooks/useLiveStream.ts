'use client';

/**
 * GULLYSCORE v2 §15.7 — CLIENT LIVE STREAM HOOK
 * ---------------------------------------------------------------------------
 * Manual EventSource lifecycle with the v2 reconnect policy:
 *   - on error: close and reconnect after backoff 1 s → 30 s (doubling,
 *     capped), reset to 1 s after a successful open
 *   - on reconnect: send the Last-Event-ID so the server can replay every
 *     event the client missed (subway-ride guarantee)
 *   - heartbeats (25 s) keep the connection liveness visible; the `id:`
 *     lines on persisted events advance the browser's lastEventId
 *
 * Replaces the raw `new EventSource(...)` usage on the spectator page.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { SSE_EVENT_TYPES, reconnectDelay } from '@/lib/sse-events';

export interface LiveStreamEvent {
  id?: number;
  type: string;
  matchId: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export interface UseLiveStreamOptions {
  /** Called for every typed live event (ball/wicket/undo/reaction/...). */
  onEvent?: (event: LiveStreamEvent) => void;
  /** Called once per fresh (non-reconnect) connection with the full match. */
  onInit?: (data: unknown) => void;
  /** Extra event names to listen for (e.g. legacy names). */
  extraEventNames?: string[];
}

export function useLiveStream(matchId: string | null, options: UseLiveStreamOptions = {}) {
  const { onEvent, onInit, extraEventNames } = options;
  const [isConnected, setIsConnected] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const [isReplaying, setIsReplaying] = useState(false);

  const callbacksRef = useRef({ onEvent, onInit });

  // Mirror the latest callbacks into the ref WITHOUT a render-time write
  // (react-hooks/refs): the effect below reads them at event time.
  useEffect(() => {
    callbacksRef.current = { onEvent, onInit };
  }, [onEvent, onInit]);

  const esRef = useRef<EventSource | null>(null);
  const lastEventIdRef = useRef<string>('');
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!matchId) return;

    const eventNames = Array.from(
      new Set([...SSE_EVENT_TYPES, ...(extraEventNames ?? [])])
    ).filter((n) => n !== 'heartbeat'); // heartbeat handled separately

    const connect = () => {
      const url =
        lastEventIdRef.current !== ''
          ? `/api/matches/${matchId}/stream?lastEventId=${encodeURIComponent(lastEventIdRef.current)}`
          : `/api/matches/${matchId}/stream`;
      const es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => {
        attemptRef.current = 0; // reset backoff after a successful open
        setIsConnected(true);
        if (lastEventIdRef.current !== '') setIsReplaying(true);
      };

      es.addEventListener('init', (e) => {
        try {
          callbacksRef.current.onInit?.(JSON.parse((e as MessageEvent).data));
        } catch {}
      });

      es.addEventListener('heartbeat', () => {
        setLastEventAt(Date.now());
      });

      for (const name of eventNames) {
        es.addEventListener(name, (e) => {
          const me = e as MessageEvent;
          if (me.lastEventId) lastEventIdRef.current = me.lastEventId;
          setLastEventAt(Date.now());
          setIsReplaying(false);
          try {
            const parsed = JSON.parse(me.data) as LiveStreamEvent;
            if (parsed && typeof parsed === 'object') {
              if (parsed.id != null && String(parsed.id) === lastEventIdRef.current) {
                setIsReplaying(false);
              }
              callbacksRef.current.onEvent?.(parsed);
            }
          } catch {}
        });
      }

      es.onerror = () => {
        // Manual backoff (§15.7): close + retry 1 s→30 s, never let the
        // browser's default fast-retry spin against a dead network.
        setIsConnected(false);
        es.close();
        if (esRef.current === es) esRef.current = null;
        attemptRef.current += 1;
        const delay = reconnectDelay(attemptRef.current);
        timerRef.current = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      cleanup();
      setIsConnected(false);
    };
  }, [matchId, cleanup]);

  return { isConnected, lastEventAt, isReplaying };
}
