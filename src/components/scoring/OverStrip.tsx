'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useMatchStore } from '@/store/matchStore';
import type { InningsState, BallRecord } from '@/types';

interface OverStripProps {
  currentInnings: InningsState;
}

function getBallDisplay(ball: BallRecord): { label: string; color: string; bg: string } {
  if (ball.isWicket) {
    return { label: 'W', color: 'text-white', bg: 'bg-wicket' };
  }
  if (ball.extraType === 'WIDE') {
    const overthrows = ball.extraRuns - 1;
    const label = overthrows > 0 ? `Wd+${overthrows}` : 'Wd';
    return { label, color: 'text-t1', bg: 'bg-bg-elevated' };
  }
  if (ball.extraType === 'NO_BALL') {
    return { label: 'Nb', color: 'text-t1', bg: 'bg-bg-elevated' };
  }
  if (ball.extraType === 'BYE' || ball.extraType === 'LEG_BYE') {
    const prefix = ball.extraType === 'BYE' ? 'B' : 'Lb';
    if (ball.runs === 0) {
      return { label: prefix, color: 'text-t2', bg: 'bg-dot' };
    }
    if (ball.runs === 4) {
      return { label: `${prefix}4`, color: 'text-run-4', bg: 'bg-run-4-bg' };
    }
    if (ball.runs === 6) {
      return { label: `${prefix}6`, color: 'text-run-6', bg: 'bg-run-6-bg' };
    }
    return { label: `${prefix}${ball.runs}`, color: 'text-t1', bg: 'bg-bg-elevated' };
  }
  if (ball.runs === 0) {
    return { label: '0', color: 'text-t3', bg: 'bg-dot/60' };
  }
  if (ball.runs === 4) {
    return { label: '4', color: 'text-run-4', bg: 'bg-run-4-bg' };
  }
  if (ball.runs === 6) {
    return { label: '6', color: 'text-run-6', bg: 'bg-run-6-bg' };
  }
  if (ball.runs === 1 || ball.runs === 2 || ball.runs === 3) {
    return { label: String(ball.runs), color: 'text-t1', bg: 'bg-bg-elevated' };
  }
  return { label: String(ball.runs), color: 'text-t1', bg: 'bg-bg-elevated' };
}

export function OverStrip({ currentInnings }: OverStripProps) {
  const lastBallResult = useMatchStore((s) => s.lastBallResult);

  // Get balls for the current over
  const currentOverNumber = currentInnings.completedOvers;
  const currentOverBalls = currentInnings.balls.filter(
    (b) => b.overNumber === currentOverNumber && b.isLegalDelivery
  );

  // Also include any extras in this over for display
  const currentOverAllBalls = currentInnings.balls.filter(
    (b) => b.overNumber === currentOverNumber
  );

  // Sort by delivery number
  const sortedBalls = [...currentOverAllBalls].sort(
    (a, b) => a.deliveryNumber - b.deliveryNumber
  );

  // Get previous over for display
  const prevOverNumber = currentOverNumber - 1;
  const prevOverBalls = prevOverNumber >= 0
    ? currentInnings.balls.filter((b) => b.overNumber === prevOverNumber).sort((a, b) => a.deliveryNumber - b.deliveryNumber)
    : [];

  const overLabel = `Over ${currentOverNumber + 1}`;
  const legalBallsInOver = currentOverBalls.length;

  return (
    <div className="rounded-xl bg-bg-card border border-border px-3 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-t3 uppercase tracking-wider">{overLabel}</span>
        <span className="text-xs text-t3 font-mono">{legalBallsInOver}/6</span>
      </div>

      {/* Current over balls */}
      <div className="flex items-center gap-1.5 min-h-[28px]">
        <AnimatePresence mode="popLayout">
          {sortedBalls.map((ball, i) => {
            const display = getBallDisplay(ball);
            return (
              <motion.div
                key={ball.id}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20, delay: i === sortedBalls.length - 1 ? 0 : 0 }}
                className={`flex items-center justify-center min-w-[28px] h-[28px] rounded-full text-xs font-bold font-mono px-1.5 ${display.color} ${display.bg}`}
              >
                {display.label}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Empty slots */}
        {Array.from({ length: Math.max(0, 6 - sortedBalls.length) }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="flex items-center justify-center min-w-[28px] h-[28px] rounded-full border border-border/50 text-xs text-t3/30 font-mono"
          >
            &middot;
          </div>
        ))}
      </div>

      {/* Previous over summary */}
      {prevOverBalls.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-border/50">
          <span className="text-[10px] text-t3">
            Prev: Ov {prevOverNumber + 1} &rarr;{' '}
            {prevOverBalls.map((b) => {
              const d = getBallDisplay(b);
              return d.label;
            }).join(' ')}
            {' '}({prevOverBalls.reduce((acc, b) => acc + b.runs + b.extraRuns, 0)} runs)
          </span>
        </div>
      )}
    </div>
  );
}
