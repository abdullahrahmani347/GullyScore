'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useMatchStore } from '@/store/matchStore';
import { formatStrikeRate } from '@/lib/scoring-utils';
import { retiredBatters } from '@/lib/scoring-context';
import type { InningsState, MatchData, BatsmanInningsData } from '@/types';

interface BatsmenCardProps {
  match: MatchData;
  currentInnings: InningsState;
  /** §12.4 — bring a retired batter back (dead ball) */
  onReturnBatter?: (playerId: string, asStriker: boolean) => void;
}

const BATSMAN_MILESTONES = [25, 50, 75, 100];

function getMilestoneProximity(runs: number): { milestone: number; away: number } | null {
  for (const m of BATSMAN_MILESTONES) {
    if (runs >= m - 5 && runs < m) {
      return { milestone: m, away: m - runs };
    }
    if (runs >= m) continue;
    break;
  }
  return null;
}

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
  // §12.4 — RH badge: retired but not out, eligible to return
  const isRetired = !batsman.isOut && batsman.dismissalType === 'RETIRED_HURT';

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 min-w-0">
        <span className={isStriker ? 'text-accent text-[10px]' : 'text-t3 text-[10px]'}>
          {isStriker ? '●' : '○'}
        </span>
        <span className={`text-sm truncate ${isStriker ? 'font-semibold text-accent' : 'text-t2'}`}>
          {batsman.player.name}
        </span>

        {/* §12.4 — retired-hurt badge */}
        {isRetired && (
          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0" title="Retired hurt — can return">
            RH
          </span>
        )}

        {/* Milestone proximity badge */}
        <AnimatePresence>
          {proximity && !isRetired && (
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

export function BatsmenCard({ match, currentInnings, onReturnBatter }: BatsmenCardProps) {
  const strikerId = useMatchStore((s) => s.strikerId);
  const nonStrikerId = useMatchStore((s) => s.nonStrikerId);
  const [returnSheet, setReturnSheet] = useState<{ playerId: string; name: string } | null>(null);

  const striker = currentInnings.batting.find((b) => b.playerId === strikerId);
  const nonStriker = currentInnings.batting.find((b) => b.playerId === nonStrikerId);

  // §12.4 — retired batters eligible to return (not out, RH badge)
  const retired = retiredBatters(currentInnings).filter(
    (b) => b.playerId !== strikerId && b.playerId !== nonStrikerId
  );

  if (!striker && !nonStriker) return null;

  return (
    <div className="rounded-xl bg-bg-card border border-border px-3 py-2.5">
      <div className="space-y-2">
        {striker && <BatsmanRow batsman={striker} isStriker={true} />}
        {nonStriker && <BatsmanRow batsman={nonStriker} isStriker={false} />}
      </div>

      {/* §12.4 — Return retired batter (overflow affordance) */}
      {retired.length > 0 && onReturnBatter && (
        <div className="mt-2 pt-2 border-t border-border/60 flex items-center gap-2 flex-wrap">
          {retired.map((b) => (
            <button
              key={b.playerId}
              onClick={() => setReturnSheet({ playerId: b.playerId, name: b.player.name })}
              className="flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/25 hover:bg-amber-500/20 transition-colors"
            >
              <span className="font-mono font-bold">RH</span>
              <span>{b.player.name}</span>
              <span className="text-amber-400/70">return</span>
            </button>
          ))}
        </div>
      )}

      {/* Return-as sheet: which end does the returning batter take? */}
      <Sheet open={returnSheet != null} onOpenChange={(o) => !o && setReturnSheet(null)}>
        <SheetContent side="bottom" className="bg-bg-card border-t border-border rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className="text-t1 text-base">{returnSheet?.name} returns</SheetTitle>
            <SheetDescription className="text-t3 text-xs">
              Dead ball — which end does the batter take?
            </SheetDescription>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-2 px-4 pb-6">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                if (returnSheet) onReturnBatter?.(returnSheet.playerId, true);
                setReturnSheet(null);
              }}
              className="h-14 rounded-xl bg-accent/20 text-accent border border-accent/30 text-sm font-semibold"
            >
              Take strike
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                if (returnSheet) onReturnBatter?.(returnSheet.playerId, false);
                setReturnSheet(null);
              }}
              className="h-14 rounded-xl bg-bg-elevated text-t2 border border-border text-sm font-semibold"
            >
              Go to the other end
            </motion.button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
