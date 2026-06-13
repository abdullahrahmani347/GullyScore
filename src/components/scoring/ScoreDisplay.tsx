'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useMatchStore } from '@/store/matchStore';
import { formatOvers, calculateCRR, calculateRRR } from '@/lib/scoring-utils';
import type { MatchData, InningsState } from '@/types';

interface ScoreDisplayProps {
  match: MatchData;
  currentInnings: InningsState;
}

export function ScoreDisplay({ match, currentInnings }: ScoreDisplayProps) {
  const lastBallResult = useMatchStore((s) => s.lastBallResult);

  const runs = lastBallResult?.inningsState?.runs ?? currentInnings.runs;
  const wickets = lastBallResult?.inningsState?.wickets ?? currentInnings.wickets;
  const completedOvers = lastBallResult?.inningsState?.completedOvers ?? currentInnings.completedOvers;
  const currentBalls = lastBallResult?.inningsState?.currentBalls ?? currentInnings.currentBalls;

  const crr = lastBallResult?.inningsState?.currentRunRate ?? calculateCRR(runs, completedOvers, currentBalls);

  const isSecondInnings = currentInnings.inningsNumber === 2;
  const target = currentInnings.target;

  const rrr = isSecondInnings && target
    ? (lastBallResult?.inningsState?.requiredRunRate ?? calculateRRR(target - runs, match.totalOvers, completedOvers, currentBalls))
    : null;
  const runsNeeded = isSecondInnings && target ? (lastBallResult?.inningsState?.runsNeeded ?? target - runs) : null;
  const ballsRemaining = lastBallResult?.inningsState?.ballsRemaining ?? null;

  // Determine if chase is difficult
  const isDifficultChase = rrr !== null && crr > 0 && rrr > crr * 1.3;

  // Last ball flash
  const lastBall = lastBallResult?.ball;
  const isWicketFlash = lastBall?.isWicket;
  const isFourFlash = lastBall?.runs === 4 && !lastBall?.extraType;
  const isSixFlash = lastBall?.runs === 6 && !lastBall?.extraType;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-bg-card border border-border px-4 py-3">
      {/* Flash overlay */}
      <AnimatePresence>
        {isWicketFlash && (
          <motion.div
            key="wicket-flash"
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0 bg-wicket/20 pointer-events-none rounded-2xl"
          />
        )}
        {isFourFlash && (
          <motion.div
            key="four-flash"
            initial={{ opacity: 0.5 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="absolute inset-0 bg-run-4/15 pointer-events-none rounded-2xl"
          />
        )}
        {isSixFlash && (
          <motion.div
            key="six-flash"
            initial={{ opacity: 0.5 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="absolute inset-0 bg-run-6/15 pointer-events-none rounded-2xl"
          />
        )}
      </AnimatePresence>

      {/* Team name */}
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: currentInnings.team.color }} />
        <span className="text-xs font-medium text-t2 uppercase tracking-wider">
          {currentInnings.team.name} &middot; Innings {currentInnings.inningsNumber}
        </span>
      </div>

      {/* Hero score */}
      <div className="flex items-baseline gap-3">
        <motion.div
          key={`${runs}-${wickets}`}
          initial={{ scale: 1.15 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="font-mono text-5xl font-bold text-t1 leading-none"
        >
          {runs}/{wickets}
        </motion.div>
        <span className="font-mono text-lg text-t3">
          ({formatOvers(completedOvers, currentBalls)} ov)
        </span>
      </div>

      {/* Run rates */}
      <div className="flex items-center gap-4 mt-2">
        <span className="text-xs text-t2">
          CRR: <span className="text-t1 font-mono font-medium">{crr.toFixed(2)}</span>
        </span>
        {isSecondInnings && rrr !== null && runsNeeded !== null && (
          <span className={`text-xs ${isDifficultChase ? 'text-wicket' : 'text-accent'}`}>
            RRR: <span className="font-mono font-medium">{rrr.toFixed(2)}</span>
          </span>
        )}
        {isSecondInnings && runsNeeded !== null && runsNeeded > 0 && (
          <span className="text-xs text-t3">
            Need <span className="text-t1 font-mono font-medium">{runsNeeded}</span>
            {ballsRemaining !== null && ballsRemaining > 0 && (
              <> from <span className="text-t1 font-mono">{Math.ceil(ballsRemaining / 6)} ov</span></>
            )}
          </span>
        )}
        {isSecondInnings && runsNeeded !== null && runsNeeded <= 0 && (
          <span className="text-xs text-accent font-medium">Target reached!</span>
        )}
      </div>

      {/* Target display for 2nd innings */}
      {isSecondInnings && target && (
        <div className="mt-2 pt-2 border-t border-border">
          <span className="text-xs text-t3">
            Target: <span className="text-gold font-mono font-medium">{target}</span>
          </span>
        </div>
      )}
    </div>
  );
}
