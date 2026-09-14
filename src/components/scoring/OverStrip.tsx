'use client';

import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMatchStore } from '@/store/matchStore';
import { powerplayContext, ballsPerOverFor } from '@/lib/scoring-context';
import type { InningsState, BallRecord, MatchData } from '@/types';

interface OverStripProps {
  currentInnings: InningsState;
  match: MatchData;
  /** §12.7 — long-press a chip to open the ball editor */
  onEditBall?: (ball: BallRecord) => void;
}

function getBallDisplay(ball: BallRecord): { label: string; color: string; bg: string } {
  // §12.5 — penalty chips
  if (ball.extraType === 'PENALTY') {
    return { label: `P+${ball.extraRuns}`, color: 'text-amber-300', bg: 'bg-amber-500/25 border border-amber-500/40' };
  }
  if (ball.isWicket) {
    return { label: 'W', color: 'text-white', bg: 'bg-wicket' };
  }
  if (ball.extraType === 'WIDE') {
    const overthrows = ball.extraRuns - 1;
    const label = overthrows > 0 ? `Wd+${overthrows}` : 'Wd';
    return { label, color: 'text-t1', bg: 'bg-bg-elevated' };
  }
  if (ball.extraType === 'NO_BALL') {
    const label = ball.runs > 0 ? `Nb+${ball.runs}` : 'Nb';
    return { label, color: 'text-t1', bg: 'bg-bg-elevated' };
  }
  if (ball.extraType === 'BYE' || ball.extraType === 'LEG_BYE') {
    const prefix = ball.extraType === 'BYE' ? 'B' : 'Lb';
    if (ball.runs === 0 && ball.extraRuns === 0) {
      return { label: prefix, color: 'text-t2', bg: 'bg-dot' };
    }
    const total = ball.extraRuns;
    if (total === 4) {
      return { label: `${prefix}4`, color: 'text-run-4', bg: 'bg-run-4-bg' };
    }
    if (total === 6) {
      return { label: `${prefix}6`, color: 'text-run-6', bg: 'bg-run-6-bg' };
    }
    return { label: total > 0 ? `${prefix}${total}` : prefix, color: 'text-t1', bg: 'bg-bg-elevated' };
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

export function OverStrip({ currentInnings, match, onEditBall }: OverStripProps) {
  const lastBallResult = useMatchStore((s) => s.lastBallResult);

  const ballsPerOver = ballsPerOverFor(match);
  const pp = powerplayContext(currentInnings, match);

  // Get balls for the current over
  const currentOverNumber = currentInnings.completedOvers;
  const currentOverBalls = currentInnings.balls.filter(
    (b) => b.overNumber === currentOverNumber && b.isLegalDelivery && b.extraType !== 'PENALTY'
  );

  // Also include any extras in this over for display
  const currentOverAllBalls = currentInnings.balls.filter(
    (b) => b.overNumber === currentOverNumber && b.deletedAt == null && b.extraType !== 'PENALTY'
  );

  // Sort by delivery number
  const sortedBalls = [...currentOverAllBalls].sort(
    (a, b) => a.deliveryNumber - b.deliveryNumber
  );

  // §12.8 — detect mid-over bowler splits for the divider chip
  const splitIndexes: number[] = [];
  for (let i = 1; i < sortedBalls.length; i++) {
    if (sortedBalls[i].bowlerId !== sortedBalls[i - 1].bowlerId) {
      splitIndexes.push(i);
    }
  }

  // Get previous over for display
  const prevOverNumber = currentOverNumber - 1;
  const prevOverBalls = prevOverNumber >= 0
    ? currentInnings.balls.filter((b) => b.overNumber === prevOverNumber && b.deletedAt == null && b.extraType !== 'PENALTY').sort((a, b) => a.deliveryNumber - b.deliveryNumber)
    : [];

  const overLabel = `Over ${currentOverNumber + 1}`;
  const legalBallsInOver = currentOverBalls.length;
  const ppActiveForCurrentOver = pp?.active ?? false;

  // Long-press handling (§12.7 — opens the ball editor)
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleBallPressStart = (ball: BallRecord) => {
    pressTimerRef.current = setTimeout(() => {
      pressTimerRef.current = null;
      onEditBall?.(ball);
    }, 550);
  };
  const handleBallPressEnd = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const renderChip = (ball: BallRecord, i: number, isCurrentOver: boolean) => {
    const display = getBallDisplay(ball);
    const isFH = ball.isFreeHit === true;
    // §14.3 — edited chips carry a small pencil dot (version > 1)
    const isEdited = ball.version != null && ball.version > 1;
    return (
      <span key={ball.id} className="inline-flex items-center">
        {/* §12.8 — divider chip where the replacement bowler took over */}
        {isCurrentOver && splitIndexes.includes(i) && (
          <span className="mx-0.5 w-px h-5 bg-accent/60 rounded-full" title="Bowler change mid-over" />
        )}
        <motion.div
          initial={isCurrentOver ? { scale: 0, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          onPointerDown={isCurrentOver ? () => handleBallPressStart(ball) : undefined}
          onPointerUp={handleBallPressEnd}
          onPointerLeave={handleBallPressEnd}
          className={`relative flex items-center justify-center min-w-[28px] h-[28px] rounded-full text-xs font-bold font-mono px-1.5 ${display.color} ${display.bg} ${
            // §14.0/§12.1 — free-hit ring uses the --free-hit token
            isFH ? 'ring-2 ring-free-hit/80 ring-offset-1 ring-offset-bg-card' : ''
          } ${isCurrentOver && onEditBall ? 'cursor-pointer select-none active:scale-95' : ''}`}
          title={
            isEdited
              ? `Edited (v${ball.version}) — long-press to edit again`
              : isFH
                ? 'Free hit delivery'
                : isCurrentOver && onEditBall
                  ? 'Long-press to edit this ball'
                  : undefined
          }
        >
          {isFH ? <span className="mr-0.5 text-[8px] text-free-hit">FH</span> : null}
          {display.label}
          {/* §14.3 — the pencil dot marks a previously edited ball */}
          {isEdited && (
            <span
              className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-free-hit border border-bg-card"
              aria-label="Edited ball"
            />
          )}
        </motion.div>
      </span>
    );
  };

  return (
    <div className={`rounded-xl bg-bg-card border px-3 py-2.5 transition-colors ${
      ppActiveForCurrentOver ? 'border-pp-gold/40' : 'border-border'
    }`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-xs font-medium uppercase tracking-wider flex items-center gap-1.5 ${
          ppActiveForCurrentOver ? 'text-pp-gold' : 'text-t3'
        }`}>
          {overLabel}
          {/* §12.2/§14.0 — powerplay tint marker uses the --pp-gold token */}
          {ppActiveForCurrentOver && (
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-pp-gold/15 text-pp-gold border border-pp-gold/30">
              PP
            </span>
          )}
        </span>
        <span className="text-xs text-t3 font-mono">{legalBallsInOver}/{ballsPerOver}</span>
      </div>

      {/* Current over balls */}
      <div className="flex items-center gap-1.5 min-h-[28px] flex-wrap">
        <AnimatePresence mode="popLayout">
          {sortedBalls.map((ball, i) => renderChip(ball, i, true))}
        </AnimatePresence>

        {/* Empty slots */}
        {Array.from({ length: Math.max(0, ballsPerOver - sortedBalls.filter((b) => b.isLegalDelivery || b.extraType === 'PENALTY').length) }).map((_, i) => (
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

      {lastBallResult?.inningsState?.isOverComplete && (
        <div className="mt-1.5 pt-1.5 border-t border-border/50">
          <span className="text-[10px] text-accent font-medium">Over complete — select the next bowler</span>
        </div>
      )}
    </div>
  );
}
