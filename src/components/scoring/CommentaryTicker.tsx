'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { BallRecord } from '@/types';
import type { CommentaryEvent } from '@/lib/intelligence';

interface CommentaryTickerProps {
  commentary: CommentaryEvent | null;
  onConsumed?: () => void;
  /** §14.3 — long-press the commentary row to open the ball editor. */
  onEditBall?: (ball: BallRecord) => void;
  /** §14.3 — the ball this commentary describes (for the long-press edit). */
  ball?: BallRecord | null;
}

const CATEGORY_STYLES: Record<string, { icon: string; accentColor: string }> = {
  SIX: { icon: '6', accentColor: 'text-run-6' },
  FOUR: { icon: '4', accentColor: 'text-run-4' },
  WICKET_BOWLED: { icon: 'W', accentColor: 'text-wicket' },
  WICKET_CAUGHT: { icon: 'W', accentColor: 'text-wicket' },
  WICKET_OTHER: { icon: 'W', accentColor: 'text-wicket' },
  MILESTONE_50: { icon: '50', accentColor: 'text-gold' },
  MILESTONE_100: { icon: '100', accentColor: 'text-gold' },
  OVER_COMPLETE: { icon: 'Ov', accentColor: 'text-t3' },
  DOT_SEQUENCE: { icon: '...', accentColor: 'text-t3' },
  CHASE_CLOSE: { icon: '!', accentColor: 'text-amber-400' },
  EXTRA: { icon: '+', accentColor: 'text-t3' },
};

/**
 * Auto-Commentary Ticker Strip.
 * Displays a one-line commentary string below the score display.
 * Shows for 5 seconds with slide-in animation, then fades out.
 */
export function CommentaryTicker({ commentary, onConsumed, onEditBall, ball }: CommentaryTickerProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The parent owns the commentary lifecycle: it sets a fresh event per ball
  // and clears it via onConsumed. This effect only arms the 5s auto-dismiss
  // timer (an external system) — no state mirroring, no cascading renders.
  useEffect(() => {
    if (!commentary) return;
    timerRef.current = setTimeout(() => {
      onConsumed?.();
    }, 5000);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [commentary, onConsumed]);

  if (!commentary) return null;

  const style = CATEGORY_STYLES[commentary.category] ?? {
    icon: '>',
    accentColor: 'text-t2',
  };

  // §14.3 — long-press the row → edit this ball (server-confirmed balls only)
  const canEdit =
    onEditBall != null &&
    ball != null &&
    typeof ball.id === 'string' &&
    !ball.id.startsWith('optimistic-');
  const pressStart = () => {
    if (!canEdit || !ball) return;
    pressTimerRef.current = setTimeout(() => {
      pressTimerRef.current = null;
      onEditBall?.(ball);
    }, 550);
  };
  const pressEnd = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  return (
    <div className="overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={commentary.timestamp}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -10, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          onPointerDown={pressStart}
          onPointerUp={pressEnd}
          onPointerLeave={pressEnd}
          className={`flex items-center gap-2 bg-bg-card border border-border rounded-lg px-3 py-1.5 ${
            canEdit ? 'cursor-pointer select-none' : ''
          }`}
          title={canEdit ? 'Long-press to edit this ball' : undefined}
        >
          {/* Category badge */}
          <span
            className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-bg-elevated ${style.accentColor}`}
          >
            {style.icon}
          </span>

          {/* Commentary text */}
          <span className="text-[11px] text-t2 italic truncate flex-1">
            {commentary.text}
          </span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
