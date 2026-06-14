'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CommentaryEvent } from '@/lib/intelligence';

interface CommentaryTickerProps {
  commentary: CommentaryEvent | null;
  onConsumed?: () => void;
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
export function CommentaryTicker({ commentary, onConsumed }: CommentaryTickerProps) {
  const [activeCommentary, setActiveCommentary] = useState<CommentaryEvent | null>(null);
  const [displayKey, setDisplayKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!commentary) return;

    // New commentary arrived — display it
    setActiveCommentary(commentary);
    setDisplayKey((k) => k + 1);

    // Clear any existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Auto-dismiss after 5 seconds
    timerRef.current = setTimeout(() => {
      setActiveCommentary(null);
      onConsumed?.();
    }, 5000);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [commentary, onConsumed]);

  if (!activeCommentary) return null;

  const style = CATEGORY_STYLES[activeCommentary.category] ?? {
    icon: '>',
    accentColor: 'text-t2',
  };

  return (
    <div className="overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={displayKey}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -10, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="flex items-center gap-2 bg-bg-card border border-border rounded-lg px-3 py-1.5"
        >
          {/* Category badge */}
          <span
            className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-bg-elevated ${style.accentColor}`}
          >
            {style.icon}
          </span>

          {/* Commentary text */}
          <span className="text-[11px] text-t2 italic truncate flex-1">
            {activeCommentary.text}
          </span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
