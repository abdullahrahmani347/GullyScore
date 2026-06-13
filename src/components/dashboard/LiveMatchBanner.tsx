'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Radio } from 'lucide-react';
import type { MatchData } from '@/types';
import { formatOvers, calculateCRR, calculateRRR } from '@/lib/scoring-utils';

interface LiveMatchBannerProps {
  match: MatchData;
}

export function LiveMatchBanner({ match }: LiveMatchBannerProps) {
  const currentInnings = match.innings.find((inn) => !inn.isCompleted) || match.innings[match.innings.length - 1];
  const firstInnings = match.innings[0];

  const battingTeam = currentInnings?.team;
  const bowlingTeam = match.team1Id === currentInnings?.teamId ? match.team2 : match.team1;

  const crr = currentInnings
    ? calculateCRR(currentInnings.runs, currentInnings.completedOvers, currentInnings.currentBalls)
    : 0;

  let rrr: number | null = null;
  if (currentInnings && match.innings.length > 1 && currentInnings.target) {
    const runsNeeded = currentInnings.target - currentInnings.runs;
    const totalBalls = match.totalOvers * 6;
    const ballsUsed = currentInnings.completedOvers * 6 + currentInnings.currentBalls;
    const ballsRemaining = totalBalls - ballsUsed;
    if (ballsRemaining > 0 && runsNeeded > 0) {
      rrr = Math.round((runsNeeded / (ballsRemaining / 6)) * 100) / 100;
    }
  }

  return (
    <Link href={`/matches/${match.id}`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="mx-4 rounded-2xl border border-border-act bg-bg-card overflow-hidden"
        style={{ boxShadow: '0 0 24px rgba(0,212,170,0.15)' }}
      >
        {/* Live badge */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="flex items-center gap-1.5 bg-accent/20 px-2.5 py-0.5 rounded-full"
            >
              <Radio size={10} className="text-accent" fill="currentColor" />
              <span className="text-xs font-bold text-accent tracking-wide">LIVE</span>
            </motion.div>
            <span className="text-xs text-t3">
              {currentInnings ? `${formatOvers(currentInnings.completedOvers, currentInnings.currentBalls)} ov` : ''}
            </span>
          </div>
          {match.venue && <span className="text-xs text-t3">{match.venue}</span>}
        </div>

        {/* Scores */}
        <div className="px-4 pb-3">
          {/* Batting team (current) */}
          {currentInnings && (
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-base">{battingTeam?.emoji}</span>
                <span className="font-semibold text-t1 text-sm">{battingTeam?.shortName}</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-t1 font-[family-name:var(--font-mono)]">
                  {currentInnings.runs}/{currentInnings.wickets}
                </span>
                <span className="text-xs text-t3 font-[family-name:var(--font-mono)]">
                  ({formatOvers(currentInnings.completedOvers, currentInnings.currentBalls)})
                </span>
              </div>
            </div>
          )}

          {/* First innings score (if 2nd innings) */}
          {match.innings.length > 1 && firstInnings && firstInnings.isCompleted && (
            <div className="flex items-center justify-between mb-2 opacity-60">
              <div className="flex items-center gap-2">
                <span className="text-base">{bowlingTeam?.emoji}</span>
                <span className="font-medium text-t2 text-sm">{bowlingTeam?.shortName}</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-base font-semibold text-t2 font-[family-name:var(--font-mono)]">
                  {firstInnings.runs}/{firstInnings.wickets}
                </span>
                <span className="text-xs text-t3 font-[family-name:var(--font-mono)]">
                  ({formatOvers(firstInnings.completedOvers, firstInnings.currentBalls)})
                </span>
              </div>
            </div>
          )}

          {/* Rates */}
          <div className="flex gap-4 mt-1">
            <span className="text-xs text-t2">
              CRR: <span className="text-t1 font-[family-name:var(--font-mono)]">{crr.toFixed(2)}</span>
            </span>
            {rrr !== null && (
              <span className="text-xs text-t2">
                RRR: <span className="text-run-6 font-[family-name:var(--font-mono)]">{rrr.toFixed(2)}</span>
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
