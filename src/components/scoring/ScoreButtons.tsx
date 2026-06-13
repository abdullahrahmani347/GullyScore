'use client';

import { motion } from 'framer-motion';
import { useMatchStore } from '@/store/matchStore';

interface ScoreButtonsProps {
  onScore: (runs: number) => void;
  onExtras: () => void;
  onWicket: () => void;
  onUndo: () => void;
}

const scoreButtons = [
  { runs: 0, label: '0', bg: 'bg-dot/70 hover:bg-dot', text: 'text-t2' },
  { runs: 1, label: '1', bg: 'bg-bg-elevated hover:bg-bg-elevated/80', text: 'text-t1' },
  { runs: 2, label: '2', bg: 'bg-bg-elevated hover:bg-bg-elevated/80', text: 'text-t1' },
  { runs: 3, label: '3', bg: 'bg-bg-elevated hover:bg-bg-elevated/80', text: 'text-t1' },
  { runs: 4, label: '4', bg: 'bg-run-4/20 hover:bg-run-4/30', text: 'text-run-4' },
  { runs: 6, label: '6', bg: 'bg-run-6/20 hover:bg-run-6/30', text: 'text-run-6' },
];

export function ScoreButtons({ onScore, onExtras, onWicket, onUndo }: ScoreButtonsProps) {
  const isSubmitting = useMatchStore((s) => s.isSubmitting);
  const currentState = useMatchStore((s) => s.currentState);
  const disabled = isSubmitting || currentState === 'PROCESSING';

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

      {/* Bottom row: Extras + Wicket + Undo */}
      <div className="grid grid-cols-3 gap-2">
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

        {/* Undo */}
        <motion.button
          whileTap={disabled ? {} : { scale: 0.95 }}
          onClick={() => !disabled && onUndo()}
          disabled={disabled}
          className={`
            flex items-center justify-center h-12 rounded-xl text-sm font-medium
            bg-bg-card hover:bg-bg-elevated text-t3 border border-border
            transition-colors select-none
            ${disabled ? 'opacity-50 pointer-events-none' : ''}
          `}
        >
          Undo
        </motion.button>
      </div>
    </div>
  );
}
