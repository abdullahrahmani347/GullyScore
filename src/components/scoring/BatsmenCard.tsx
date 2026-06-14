'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useMatchStore } from '@/store/matchStore';
import { formatStrikeRate } from '@/lib/scoring-utils';
import type { InningsState, MatchData, BatsmanInningsData } from '@/types';

interface BatsmenCardProps {
  match: MatchData;
  currentInnings: InningsState;
}

const BATSMAN_MILESTONES = [25, 50, 75, 100];

/**
 * Check if a batsman is within striking distance of a milestone.
 * Returns the nearest milestone and distance, or null.
 */
function getMilestoneProximity(runs: number): { milestone: number; away: number } | null {
  for (const m of BATSMAN_MILESTONES) {
    if (runs >= m - 5 && runs < m) {
      return { milestone: m, away: m - runs };
    }
    if (runs >= m) continue; // Past this milestone
    break; // Below this milestone and all subsequent ones
  }
  return null;
}

/**
 * Check if the batsman is exactly on the boundary-milestone threshold
 * (e.g., on 46 → one four for 50, on 44 → one six for 50).
 */
function isBoundaryMilestone(runs: number): { milestone: number; boundary: '4' | '6' } | null {
  for (const m of BATSMAN_MILESTONES) {
    if (m - runs === 4) return { milestone: m, boundary: '4' };
    if (m - runs === 6) return { milestone: m, boundary: '6' };
  }
  return null;
}

function BatsmanRow({ batsman, isStriker }: { batsman: BatsmanInningsData; isStriker: boolean }) {
  const proximity = getMilestoneProximity(batsman.runs);
  const boundaryMilestone = isBoundaryMilestone(batsman.runs);
  const isOn49 = batsman.runs === 49;
  const isOn99 = batsman.runs === 99;

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 min-w-0">
        <span className={isStriker ? 'text-accent text-[10px]' : 'text-t3 text-[10px]'}>
          {isStriker ? '\u25CF' : '\u25CB'}
        </span>
        <span className={`text-sm truncate ${isStriker ? 'font-semibold text-accent' : 'text-t2'}`}>
          {batsman.player.name}
        </span>

        {/* Milestone proximity badge */}
        <AnimatePresence>
          {proximity && (
            <motion.span
              key={`ms-${proximity.milestone}`}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              className={`
                text-[9px] font-bold font-mono px-1.5 py-0.5 rounded shrink-0
                ${proximity.away <= 1
                  ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                  : proximity.away <= 3
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                    : 'bg-gold/10 text-gold/70 border border-gold/20'
                }
              `}
            >
              {isOn49
                ? '1 FOR 50!'
                : isOn99
                  ? '1 FOR 100!'
                  : boundaryMilestone
                    ? `${boundaryMilestone.boundary} FOR ${boundaryMilestone.milestone}!`
                    : `${proximity.away} TO ${proximity.milestone}`}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className={`text-sm font-mono ${isStriker ? 'font-bold text-t1' : 'text-t2'}`}>
          {batsman.runs}<span className="text-t3 font-normal">({batsman.balls})</span>
        </span>
        <span className="text-xs text-t3 font-mono w-12 text-right">
          SR {formatStrikeRate(batsman.runs, batsman.balls)}
        </span>
      </div>
    </div>
  );
}

export function BatsmenCard({ match, currentInnings }: BatsmenCardProps) {
  const strikerId = useMatchStore((s) => s.strikerId);
  const nonStrikerId = useMatchStore((s) => s.nonStrikerId);

  const striker = currentInnings.batting.find((b) => b.playerId === strikerId);
  const nonStriker = currentInnings.batting.find((b) => b.playerId === nonStrikerId);

  if (!striker && !nonStriker) return null;

  return (
    <div className="rounded-xl bg-bg-card border border-border px-3 py-2.5">
      <div className="space-y-2">
        {striker && <BatsmanRow batsman={striker} isStriker={true} />}
        {nonStriker && <BatsmanRow batsman={nonStriker} isStriker={false} />}
      </div>
    </div>
  );
}
