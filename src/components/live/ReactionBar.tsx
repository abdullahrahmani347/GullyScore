'use client';

/**
 * GULLYSCORE v2 §15.4 — REACTIONS BAR (client)
 * ---------------------------------------------------------------------------
 * Six floating emoji reactions. Local taps: float immediately + queue;
 * POST debounced 1 s (one request per emoji, batched count). Remote SSE
 * `reaction` events spawn floating bursts — our own echo is best-effort
 * subtracted (reactions are anonymous, so perfect dedup is impossible
 * by design; each tab subtracts only what it sent in the last ~2.5 s).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { LiveStreamEvent } from '@/hooks/useLiveStream';

const EMOJIS = ['👍', '❤️', '😮', '😂', '👏', '🔥'] as const;
const DEBOUNCE_MS = 1_000;

interface FloatItem {
  key: number;
  emoji: string;
  x: number; // % across the bar
}

let floatKey = 0;

export default function ReactionBar({
  matchId,
  registerEvent,
}: {
  matchId: string;
  /** Parent (live page) forwards SSE events; returns an unregister fn. */
  registerEvent: (handler: (event: LiveStreamEvent) => void) => () => void;
}) {
  const [floats, setFloats] = useState<FloatItem[]>([]);
  const pending = useRef<Map<string, number>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sent = useRef<Map<string, { count: number; at: number }>>(new Map());
  const gone = useRef(false);

  const spawn = useCallback((emoji: string, count: number) => {
    const n = Math.min(Math.max(count, 0), 6);
    if (n === 0) return;
    const items: FloatItem[] = Array.from({ length: n }, () => ({
      key: floatKey++,
      emoji,
      x: 8 + Math.random() * 84,
    }));
    setFloats((prev) => [...prev, ...items]);
    setTimeout(() => {
      if (gone.current) return;
      const ids = new Set(items.map((i) => i.key));
      setFloats((prev) => prev.filter((f) => !ids.has(f.key)));
    }, 1800);
  }, []);

  // Remote reaction events from the SSE stream
  useEffect(() => {
    const off = registerEvent((event) => {
      if (event.type === 'reaction' && typeof event.data?.emoji === 'string') {
        const emoji = event.data.emoji as string;
        let count = Number(event.data.count) || 1;
        // Best-effort echo dedup: subtract what THIS tab sent recently
        const mine = sent.current.get(emoji);
        if (mine && Date.now() - mine.at < 2_500) {
          count -= mine.count;
          sent.current.delete(emoji);
        }
        if (count > 0) spawn(emoji, count);
      }
    });
    return off;
  }, [registerEvent, spawn]);

  const tap = (emoji: string) => {
    spawn(emoji, 1); // optimistic local float
    pending.current.set(emoji, (pending.current.get(emoji) ?? 0) + 1);
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      const batch = Array.from(pending.current.entries());
      pending.current.clear();
      for (const [e, c] of batch) {
        sent.current.set(e, { count: c, at: Date.now() });
        // 1 s client-side debounce done → POST (fire-and-forget)
        void fetch(`/api/matches/${matchId}/reactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emoji: e, count: c }),
        }).catch(() => {
          // offline — the float already played; reactions are ephemeral
        });
      }
    }, DEBOUNCE_MS);
  };

  useEffect(() => {
    gone.current = false;
    return () => {
      gone.current = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [matchId]);

  return (
    <div className="relative">
      {/* Floating layer */}
      <div className="pointer-events-none absolute bottom-2 left-0 right-0 h-36 overflow-hidden">
        <AnimatePresence>
          {floats.map((f) => (
            <motion.span
              key={f.key}
              initial={{ opacity: 0, y: 0, scale: 0.6 }}
              animate={{ opacity: [0, 1, 1, 0], y: -130, scale: 1.15 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.6, ease: 'easeOut' }}
              className="absolute bottom-0 text-2xl select-none"
              style={{ left: `${f.x}%` }}
            >
              {f.emoji}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>

      {/* Bar */}
      <div className="flex items-center justify-center gap-0.5 rounded-full bg-bg-card/90 backdrop-blur border border-border px-1.5 py-1 mx-auto w-fit">
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => tap(emoji)}
            aria-label={`React ${emoji}`}
            className="w-9 h-9 flex items-center justify-center rounded-full text-xl active:scale-125 transition-transform hover:bg-bg-elevated"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
