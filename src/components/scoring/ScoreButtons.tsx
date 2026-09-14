'use client';

import { useRef } from 'react';
import { motion } from 'framer-motion';
import { MoreHorizontal, Redo2, Undo2 } from 'lucide-react';
import { useMatchStore } from '@/store/matchStore';
import { undoableBallCount } from '@/lib/scoring-ux';

interface ScoreButtonsProps {
  onScore: (runs: number) => void;
  onExtras: () => void;
  onWicket: () => void;
  onUndo: () => void;
  /** v2 §14.10 — long-press undo = "undo to start of over". */
  onUndoToOverStart?: () => void;
  /** v2 §12.7 — redo appears after an undo */
  onRedo?: () => void;
  redoAvailable?: boolean;
  /** v2 §12.5 — overflow menu (penalty + more) */
  onMore: () => void;
}

const scoreButtons = [
  { runs: 0, label: '0', bg: 'bg-dot/70 hover:bg-dot', text: 'text-t2' },
  { runs: 1, label: '1', bg: 'bg-bg-elevated hover:bg-bg-elevated/80', text: 'text-t1' },
  { runs: 2, label: '2', bg: 'bg-bg-elevated hover:bg-bg-elevated/80', text: 'text-t1' },
  { runs: 3, label: '3', bg: 'bg-bg-elevated hover:bg-bg-elevated/80', text: 'text-t1' },
  { runs: 4, label: '4', bg: 'bg-run-4/20 hover:bg-run-4/30', text: 'text-run-4' },
  { runs: 6, label: '6', bg: 'bg-run-6/20 hover:bg-run-6/30', text: 'text-run-6' },
];

export function ScoreButtons({
  onScore,
  onExtras,
  onWicket,
  onUndo,
  onUndoToOverStart,
  onRedo,
  redoAvailable,
  onMore,
}: ScoreButtonsProps) {
  const isSubmitting = useMatchStore((s) => s.isSubmitting);
  const currentState = useMatchStore((s) => s.currentState);
  const currentInnings = useMatchStore((s) => s.currentInnings);
  const disabled = isSubmitting || currentState === 'PROCESSING';

  // v2 §14.10 — count badge: live events an undo could remove
  const undoCount = undoableBallCount(currentInnings?.balls ?? []);

  // v2 §14.10 — long-press → "undo to start of over"; tap → single undo
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressedRef = useRef(false);
  const undoPressStart = () => {
    longPressedRef.current = false;
    pressTimerRef.current = setTimeout(() => {
      pressTimerRef.current = null;
      longPressedRef.current = true;
      if (!disabled && undoCount > 0) onUndoToOverStart?.();
    }, 550);
  };
  const undoPressEnd = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
      if (!longPressedRef.current && !disabled) onUndo();
    }
  };

  return (
    <div className="space-y-2">
      {/* 3x2 grid of scoring buttons */}
      <div className="grid grid-cols-3 gap-2">
        {scoreButtons.map((btn) => (
          <motion.button
            key={btn.runs}
            whileTap={disabled ? {} : { scale: 0.93 }}
            onClick={() => !disabled && onScore(btn.runs)}
            disabled={disabled}
            className={`
              flex items-center justify-center h-14 rounded-xl font-mono text-2xl font-bold
              transition-colors select-none
              ${btn.bg} ${btn.text}
              ${disabled ? 'opacity-50 pointer-events-none' : 'active:scale-95'}
            `}
          >
            {btn.label}
          </motion.button>
        ))}
      </div>

      {/* Bottom row: Extras + Wicket + Undo (count badge) + Redo + More */}
      <div className={`grid gap-2 ${redoAvailable ? 'grid-cols-5' : 'grid-cols-4'}`}>
        {/* Extras */}
        <motion.button
          whileTap={disabled ? {} : { scale: 0.95 }}
          onClick={() => !disabled && onExtras()}
          disabled={disabled}
          className={`
            flex items-center justify-center h-12 rounded-xl text-sm font-semibold
            bg-bg-elevated hover:bg-bg-elevated/80 text-accent border border-border
            transition-colors select-none
            ${disabled ? 'opacity-50 pointer-events-none' : ''}
          `}
        >
          Extras
        </motion.button>

        {/* Wicket */}
        <motion.button
          whileTap={disabled ? {} : { scale: 0.95 }}
          onClick={() => !disabled && onWicket()}
          disabled={disabled}
          className={`
            flex items-center justify-center h-12 rounded-xl text-sm font-bold
            bg-wicket/20 hover:bg-wicket/30 text-wicket border border-wicket/30
            transition-colors select-none
            ${disabled ? 'opacity-50 pointer-events-none' : ''}
          `}
        >
          Wicket
        </motion.button>

        {/* Undo — §14.10: always visible, count badge, long-press to over start */}
        <motion.button
          whileTap={disabled ? {} : { scale: 0.95 }}
          onPointerDown={undoPressStart}
          onPointerUp={undoPressEnd}
          onPointerLeave={() => {
            if (pressTimerRef.current) {
              clearTimeout(pressTimerRef.current);
              pressTimerRef.current = null;
            }
          }}
          disabled={disabled}
          className={`
            relative flex items-center justify-center h-12 rounded-xl text-sm font-medium
            bg-bg-card hover:bg-bg-elevated text-t2 border border-border
            transition-colors select-none
            ${disabled ? 'opacity-50 pointer-events-none' : ''}
          `}
          title={
            onUndoToOverStart
              ? 'Tap: undo last ball · hold: undo to start of over'
              : 'Undo last ball'
          }
        >
          <Undo2 size={16} />
          {undoCount > 0 && (
            <span
              className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-t2 text-bg-app text-[10px] font-bold font-mono flex items-center justify-center"
              aria-label={`${undoCount} balls to undo`}
            >
              {undoCount > 99 ? '99+' : undoCount}
            </span>
          )}
        </motion.button>

        {/* Redo (§12.7) — appears after an undo */}
        {redoAvailable && (
          <motion.button
            whileTap={disabled ? {} : { scale: 0.95 }}
            onClick={() => !disabled && onRedo?.()}
            disabled={disabled}
            className={`
              flex items-center justify-center h-12 rounded-xl
              bg-accent/10 hover:bg-accent/20 text-accent border border-accent/25
              transition-colors select-none
              ${disabled ? 'opacity-50 pointer-events-none' : ''}
            `}
            title="Redo the undone ball"
          >
            <Redo2 size={16} />
          </motion.button>
        )}

        {/* More (§12.5 penalty, §12.3 match settings, §14.1 settings) */}
        <motion.button
          whileTap={disabled ? {} : { scale: 0.95 }}
          onClick={() => !disabled && onMore()}
          disabled={disabled}
          className={`
            flex items-center justify-center h-12 rounded-xl
            bg-bg-card hover:bg-bg-elevated text-t3 border border-border
            transition-colors select-none
            ${disabled ? 'opacity-50 pointer-events-none' : ''}
          `}
          title="Penalty, match settings, feel settings"
        >
          <MoreHorizontal size={18} />
        </motion.button>
      </div>
    </div>
  );
}
