'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useMatchStore } from '@/store/matchStore';
import { formatBowlingFigures, formatEconomy } from '@/lib/scoring-utils';
import type { InningsState } from '@/types';

interface BowlerCardProps {
  currentInnings: InningsState;
}

export function BowlerCard({ currentInnings }: BowlerCardProps) {
  const currentBowlerId = useMatchStore((s) => s.currentBowlerId);

  const bowler = currentInnings.bowling.find((b) => b.playerId === currentBowlerId);

  if (!bowler) {
    return (
      <div className="rounded-xl bg-bg-card border border-border px-3 py-2.5">
        <span className="text-xs text-t3">No bowler selected</span>
      </div>
    );
  }

  // Calculate this over's runs — use the current over context
  // If the over just completed (currentBalls === 0 and balls exist for completed over),
  // show the completed over's data until new balls are recorded in the new over
  const justCompletedOverBalls = currentInnings.balls.filter(
    (b) => b.overNumber === currentInnings.completedOvers && b.bowlerId === currentBowlerId
  );
  const isOverJustCompleted = currentInnings.currentBalls === 0 && justCompletedOverBalls.length === 6;
  const displayOverNumber = isOverJustCompleted ? currentInnings.completedOvers - 1 : currentInnings.completedOvers;
  const currentOverBalls = currentInnings.balls.filter(
    (b) => b.overNumber === displayOverNumber && b.bowlerId === currentBowlerId
  );
  const thisOverRuns = currentOverBalls.reduce((acc, b) => {
    if (b.extraType === 'BYE' || b.extraType === 'LEG_BYE') return acc;
    return acc + b.runs + b.extraRuns;
  }, 0);

  // Hat-trick detection: 2 wickets in the current over
  const thisOverWickets = currentOverBalls.filter((b) => b.isWicket).length;
  const isHatTrickChance = thisOverWickets === 2;

  return (
    <div className="rounded-xl bg-bg-card border border-border px-3 py-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium text-t3 uppercase tracking-wider">Bowling</span>
          <span className="text-sm font-semibold text-t2 truncate">{bowler.player.name}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-mono font-bold text-t1">
            {formatBowlingFigures(bowler.completedOvers, bowler.balls, bowler.runs, bowler.wickets)}
          </span>
          <span className="text-xs text-t3 font-mono w-14 text-right">
            Econ {formatEconomy(bowler.runs, bowler.completedOvers, bowler.balls)}
          </span>
        </div>
      </div>

      {/* This over summary + hat-trick alert */}
      {(currentOverBalls.length > 0 || isHatTrickChance) && (
        <div className="mt-1 pt-1 border-t border-border/50 flex items-center justify-between">
          <span className="text-[10px] text-t3">This over: <span className="text-t1 font-mono">{thisOverRuns}</span> runs</span>

          {/* Hat-trick chance badge */}
          <AnimatePresence>
            {isHatTrickChance && (
              <motion.span
                key="hat-trick"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                className="inline-flex items-center gap-1 text-[9px] font-bold font-mono px-2 py-0.5 rounded bg-wicket/15 border border-wicket/30 text-wicket"
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-wicket opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-wicket" />
                </span>
                HAT TRICK CHANCE!
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
