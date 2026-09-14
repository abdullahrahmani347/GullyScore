'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { winProbability } from '@/lib/intelligence';
import { foldInnings, matchRulesFor } from '@/lib/scoring-context';
import type { MatchData, InningsState } from '@/types';

interface WPMeterProps {
  match: MatchData;
  currentInnings: InningsState;
}

/**
 * v2 §13.1 — small win-probability meter for the scoring screen.
 * Computed client-side from the SAME fold the server runs, so it updates
 * instantly on every optimistic ball (no round-trip).
 */
export function WPMeter({ match, currentInnings }: WPMeterProps) {
  const wp = useMemo(() => {
    const rules = matchRulesFor(match, currentInnings.inningsNumber, currentInnings.target ?? null);
    const state = foldInnings(currentInnings, match);
    if (state.legalBalls === 0 && state.runs === 0) return null;
    return winProbability(state, {
      inningsNumber: rules.inningsNumber,
      totalOvers: rules.totalOvers,
      maxWickets: rules.maxWickets,
      target: rules.target,
      ballsPerOver: rules.ballsPerOver,
    });
  }, [match, currentInnings]);

  if (wp == null) return null;

  const pct = Math.round(wp * 100);
  const battingColor = currentInnings.team.color || '#00D4AA';
  const favoured = pct >= 50;

  return (
    <div className="flex items-center gap-2" aria-label={`Win probability ${pct}% for ${currentInnings.team.name}`}>
      <span className="text-[10px] font-mono font-bold text-t3 uppercase tracking-wider">WP</span>
      <div className="relative h-1.5 w-24 rounded-full bg-bg-elevated overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ backgroundColor: battingColor }}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
      <span
        className="text-[10px] font-mono font-semibold"
        style={{ color: favoured ? battingColor : undefined }}
      >
        {pct}%
      </span>
      <span className="text-[9px] text-t3">
        {favoured ? currentInnings.team.shortName || currentInnings.team.name : 'opp.'}
      </span>
    </div>
  );
}
