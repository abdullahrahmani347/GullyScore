'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Undo2, Redo2, MoreHorizontal } from 'lucide-react';
import { useMatchStore } from '@/store/matchStore';
import { useSettingsStore } from '@/store/settingsStore';
import { formatOvers } from '@/lib/scoring-utils';
import type { ExtraType, MatchData, InningsState, BallRecord } from '@/types';

interface ProModeLayoutProps {
  match: MatchData;
  currentInnings: InningsState;
  onScore: (runs: number) => void;
  onExtra: (extraType: ExtraType, extraRuns: number) => void;
  onWicket: () => void;
  onUndo: () => void;
  onUndoToOverStart: () => void;
  onRedo?: () => void;
  redoAvailable?: boolean;
  onMore: () => void;
}

/** §14.2 — orientation + input detection with a persisted override. */
export function useProMode(): { landscape: boolean; proModeActive: boolean } {
  const proMode = useSettingsStore((s) => s.proMode);
  const [landscape, setLandscape] = useState(false);
  const [coarse, setCoarse] = useState(false);
  const [shortHeight, setShortHeight] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const orient = window.matchMedia('(orientation: landscape)');
    const pointer = window.matchMedia('(pointer: coarse)');
    const sync = () => {
      setLandscape(orient.matches);
      setCoarse(pointer.matches);
      setShortHeight(window.innerHeight < 500);
    };
    sync();
    orient.addEventListener('change', sync);
    pointer.addEventListener('change', sync);
    window.addEventListener('resize', sync);
    return () => {
      orient.removeEventListener('change', sync);
      pointer.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);

  const active =
    proMode === 'off'
      ? false
      : proMode === 'on'
        ? landscape && (coarse || shortHeight)
        : landscape && coarse;

  return { landscape, proModeActive: active };
}

const runKeys = [0, 1, 2, 3, 4, 6];
const extraKeys: { label: string; type: ExtraType; runs: number }[] = [
  { label: 'Wide', type: 'WIDE', runs: 1 },
  { label: 'No ball', type: 'NO_BALL', runs: 1 },
  { label: 'Bye', type: 'BYE', runs: 1 },
  { label: 'L-bye', type: 'LEG_BYE', runs: 1 },
];

/**
 * v2 §14.2 — Landscape Pro Mode. Two-thumb layout: the runs grid sits under
 * the right thumb at 64 px targets, the extras/wicket cluster under the left,
 * and the header compresses to a single team-tinted score strip.
 */
export function ProModeLayout({
  match,
  currentInnings,
  onScore,
  onExtra,
  onWicket,
  onUndo,
  onUndoToOverStart,
  onRedo,
  redoAvailable,
  onMore,
}: ProModeLayoutProps) {
  const isSubmitting = useMatchStore((s) => s.isSubmitting);
  const currentState = useMatchStore((s) => s.currentState);
  const disabled = isSubmitting || currentState === 'PROCESSING';

  const target = currentInnings.target;
  const isChase = currentInnings.inningsNumber === 2 && target != null;
  const runsNeeded = isChase ? Math.max(0, target - currentInnings.runs) : null;
  const ballsRemaining = isChase
    ? Math.max(0, match.totalOvers * 6 - (currentInnings.completedOvers * 6 + currentInnings.currentBalls))
    : null;

  // Compressed over chips for the strip
  const overBalls = (currentInnings.balls ?? [])
    .filter((b: BallRecord) => b.overNumber === currentInnings.completedOvers && b.deletedAt == null && b.extraType !== 'PENALTY')
    .sort((a: BallRecord, b: BallRecord) => a.deliveryNumber - b.deliveryNumber);

  // §14.10 — long-press timer state lives in a real ref (mutated only from
  // event handlers, never during render)
  const lastPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const undoPressStart = () => {
    lastPressRef.current = setTimeout(() => {
      lastPressRef.current = null;
      if (!disabled) onUndoToOverStart();
    }, 550);
  };
  const undoPressEnd = () => {
    if (lastPressRef.current) {
      clearTimeout(lastPressRef.current);
      lastPressRef.current = null;
      if (!disabled) onUndo();
    }
  };

  return (
    <div className="flex-1 min-h-0 bg-bg-app flex flex-col scoring-screen">
      {/* Single score strip (header) */}
      <div
        className="flex items-center gap-3 px-3 py-2 border-b border-border text-sm font-mono overflow-x-auto whitespace-nowrap"
        style={{ background: 'var(--team-tint)' }}
      >
        <span className="flex items-center gap-1.5 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: currentInnings.team.color }} />
          <span className="text-t2 text-xs uppercase tracking-wider">{currentInnings.team.shortName}</span>
        </span>
        <span className="text-2xl font-bold text-t1 leading-none">
          {currentInnings.runs}/{currentInnings.wickets}
        </span>
        <span className="text-t3 text-xs">
          {formatOvers(currentInnings.completedOvers, currentInnings.currentBalls)}
        </span>
        <span className="flex gap-1 shrink-0">
          {overBalls.slice(-8).map((b: BallRecord) => (
            <span
              key={b.id}
              className={`flex items-center justify-center min-w-[22px] h-[22px] rounded-full text-[10px] font-bold px-1 ${
                b.isWicket
                  ? 'bg-wicket text-white'
                  : b.runs === 4
                    ? 'bg-run-4-bg text-run-4'
                    : b.runs === 6
                      ? 'bg-run-6-bg text-run-6'
                      : b.extraType
                        ? 'bg-bg-elevated text-t2'
                        : 'bg-bg-elevated/60 text-t3'
              }`}
            >
              {b.isWicket ? 'W' : b.extraType === 'WIDE' ? 'wd' : b.extraType === 'NO_BALL' ? 'nb' : b.runs}
            </span>
          ))}
        </span>
        {isChase && runsNeeded != null && runsNeeded > 0 && ballsRemaining != null && (
          <span className={`ml-auto text-xs shrink-0 ${runsNeeded <= 10 ? 'text-warn' : 'text-t2'}`}>
            need {runsNeeded} off {ballsRemaining}
          </span>
        )}
      </div>

      {/* Two-thumb zone */}
      <div className="flex-1 grid grid-cols-2 gap-3 p-3 pro-mode-grid items-end">
        {/* LEFT cluster — extras + wicket (left thumb) */}
        <div className="space-y-2">
          <motion.button
            whileTap={disabled ? {} : { scale: 0.93 }}
            onClick={() => !disabled && onWicket()}
            disabled={disabled}
            className={`pro-target w-full rounded-2xl bg-wicket/20 text-wicket border border-wicket/30 font-bold text-base ${
              disabled ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            WICKET
          </motion.button>
          <div className="grid grid-cols-2 gap-2">
            {extraKeys.map((e) => (
              <motion.button
                key={e.label}
                whileTap={disabled ? {} : { scale: 0.93 }}
                onClick={() => !disabled && onExtra(e.type, e.runs)}
                disabled={disabled}
                className={`h-14 rounded-2xl bg-bg-elevated text-t1 border border-border text-sm font-semibold ${
                  disabled ? 'opacity-50 pointer-events-none' : ''
                }`}
              >
                {e.label}
              </motion.button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <motion.button
              whileTap={disabled ? {} : { scale: 0.93 }}
              onPointerDown={undoPressStart}
              onPointerUp={undoPressEnd}
              onPointerLeave={undoPressEnd}
              disabled={disabled}
              className={`h-12 rounded-2xl bg-bg-card text-t2 border border-border text-xs font-medium ${
                disabled ? 'opacity-50 pointer-events-none' : ''
              }`}
              title="Tap: undo · hold: undo to start of over"
            >
              <Undo2 size={16} className="mx-auto" />
            </motion.button>
            {redoAvailable && (
              <motion.button
                whileTap={disabled ? {} : { scale: 0.93 }}
                onClick={() => !disabled && onRedo?.()}
                disabled={disabled}
                className="h-12 rounded-2xl bg-accent/10 text-accent border border-accent/25"
              >
                <Redo2 size={16} className="mx-auto" />
              </motion.button>
            )}
            <motion.button
              whileTap={disabled ? {} : { scale: 0.93 }}
              onClick={() => !disabled && onMore()}
              disabled={disabled}
              className="h-12 rounded-2xl bg-bg-card text-t3 border border-border"
            >
              <MoreHorizontal size={16} className="mx-auto" />
            </motion.button>
          </div>
        </div>

        {/* RIGHT cluster — runs 0-6 at 64px targets (right thumb) */}
        <div className="grid grid-cols-3 gap-2 place-items-end">
          {runKeys.map((r) => (
            <motion.button
              key={r}
              whileTap={disabled ? {} : { scale: 0.92 }}
              onClick={() => !disabled && onScore(r)}
              disabled={disabled}
              className={`
                pro-target w-full rounded-2xl font-mono text-2xl font-bold
                ${r === 4 ? 'bg-run-4/20 text-run-4' : r === 6 ? 'bg-run-6/20 text-run-6' : r === 0 ? 'bg-dot/70 text-t2' : 'bg-bg-elevated text-t1'}
                ${disabled ? 'opacity-50 pointer-events-none' : ''}
              `}
            >
              {r}
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
