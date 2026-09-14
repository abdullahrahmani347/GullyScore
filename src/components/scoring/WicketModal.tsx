'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useMatchStore } from '@/store/matchStore';
import { freeHitPending } from '@/lib/scoring-context';
import type { WicketType, MatchData, InningsState, ExtraType } from '@/types';
import {
  WicketBowledIcon,
  WicketCaughtIcon,
  WicketRunOutIcon,
  WicketLbwIcon,
  WicketStumpedIcon,
  WicketHitWicketIcon,
  WicketRetiredHurtIcon,
  WicketObstructingFieldIcon,
} from '@/components/icons/GullyIcons';

interface WicketModalProps {
  open: boolean;
  match: MatchData;
  currentInnings: InningsState;
  /** §12.6 — set when recording a wicket ON an extra (run-out off a wide etc.) */
  extraContext?: ExtraType | null;
  /** Runs already entered for the extra ball (byes taken before the run-out). */
  extraRunsContext?: number;
  onConfirm: (data: {
    wicketType: WicketType;
    dismissedPlayerId: string;
    fielderPlayerId?: string;
    runs?: number;
    extraType?: ExtraType | null;
    extraRuns?: number;
  }) => void;
  onCancel: () => void;
}

const wicketTypes: { type: WicketType; label: string; Icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { type: 'BOWLED', label: 'Bowled', Icon: WicketBowledIcon },
  { type: 'CAUGHT', label: 'Caught', Icon: WicketCaughtIcon },
  { type: 'RUN_OUT', label: 'Run Out', Icon: WicketRunOutIcon },
  { type: 'LBW', label: 'LBW', Icon: WicketLbwIcon },
  { type: 'STUMPED', label: 'Stumped', Icon: WicketStumpedIcon },
  { type: 'HIT_WICKET', label: 'Hit Wicket', Icon: WicketHitWicketIcon },
  { type: 'RETIRED_HURT', label: 'Retired Hurt', Icon: WicketRetiredHurtIcon },
  { type: 'OBSTRUCTING_FIELD', label: 'Obstructing', Icon: WicketObstructingFieldIcon },
];

/**
 * v2 §12.1/§12.6 gating table, evaluated client-side with the same engine
 * the server enforces:
 *   - free hit  → only RUN_OUT / OBSTRUCTING_FIELD ("Free hit — not out")
 *   - no-ball   → only RUN_OUT / OBSTRUCTING_FIELD ("No-ball — not out")
 *   - wide      → RUN_OUT / STUMPED / OBSTRUCTING_FIELD
 */
function dismissalAllowed(type: WicketType, ctx: { freeHit: boolean; extra: ExtraType | null }): boolean {
  if (ctx.freeHit) return type === 'RUN_OUT' || type === 'OBSTRUCTING_FIELD';
  if (ctx.extra === 'NO_BALL') return type === 'RUN_OUT' || type === 'OBSTRUCTING_FIELD';
  if (ctx.extra === 'WIDE') return type === 'RUN_OUT' || type === 'STUMPED' || type === 'OBSTRUCTING_FIELD';
  return true;
}

export function WicketModal({ open, match, currentInnings, extraContext = null, extraRunsContext = 0, onConfirm, onCancel }: WicketModalProps) {
  const strikerId = useMatchStore((s) => s.strikerId);
  const nonStrikerId = useMatchStore((s) => s.nonStrikerId);
  const isSubmitting = useMatchStore((s) => s.isSubmitting);

  const [selectedWicketType, setSelectedWicketType] = useState<WicketType | null>(null);
  const [dismissedPlayerId, setDismissedPlayerId] = useState<string | null>(null);
  const [fielderPlayerId, setFielderPlayerId] = useState<string | null>(null);
  const [runsCompleted, setRunsCompleted] = useState<number>(0);
  const [step, setStep] = useState<1 | 2>(1);

  // §12.1 — free-hit context (same fold the server runs)
  const freeHit = useMemo(
    () => open && freeHitPending(currentInnings, match),
    [open, currentInnings, match]
  );

  // Fielding team players
  const fieldingTeamId = match.team1Id === currentInnings.teamId ? match.team2Id : match.team1Id;
  const fieldingTeam = fieldingTeamId === match.team1Id ? match.team1 : match.team2;
  const fieldingPlayers = fieldingTeam.players;

  // Striker and non-striker info
  const striker = currentInnings.batting.find((b) => b.playerId === strikerId);
  const nonStriker = currentInnings.batting.find((b) => b.playerId === nonStrikerId);

  const needsBatsmanSelect = selectedWicketType === 'RUN_OUT' || selectedWicketType === 'RETIRED_HURT';
  const needsFielderSelect = selectedWicketType === 'CAUGHT' || selectedWicketType === 'RUN_OUT' || selectedWicketType === 'STUMPED';
  const needsRunsCompleted = selectedWicketType === 'RUN_OUT'; // §12.6 runs before dismissal

  const canConfirm = useMemo(() => {
    if (!selectedWicketType) return false;
    if (!dismissedPlayerId) return false;
    if (needsFielderSelect && !fielderPlayerId) return false;
    return true;
  }, [selectedWicketType, dismissedPlayerId, needsFielderSelect, fielderPlayerId]);

  const gatingHint = freeHit
    ? 'Free hit — not out. Only run-outs count.'
    : extraContext === 'NO_BALL'
      ? 'No-ball — not out. Only run-outs count.'
      : extraContext === 'WIDE'
        ? 'Off a wide: run out or stumped only.'
        : null;

  const handleWicketTypeSelect = (type: WicketType) => {
    if (!dismissalAllowed(type, { freeHit, extra: extraContext })) return;
    setSelectedWicketType(type);
    setRunsCompleted(0);

    if (type !== 'RUN_OUT' && type !== 'RETIRED_HURT') {
      // Striker is the dismissed player for all non-RUN_OUT types
      setDismissedPlayerId(strikerId);
      if (!needsFielderSelectFor(type)) {
        onConfirm({
          wicketType: type,
          dismissedPlayerId: strikerId!,
          extraType: extraContext,
          extraRuns: extraRunsContext,
        });
        resetState();
      } else {
        setStep(2);
      }
    } else {
      // RUN_OUT / RETIRED_HURT — pick who leaves (mankad defaults to striker)
      setDismissedPlayerId(type === 'RETIRED_HURT' ? strikerId : null);
      setStep(2);
    }
  };

  const needsFielderSelectFor = (type: WicketType) =>
    type === 'CAUGHT' || type === 'RUN_OUT' || type === 'STUMPED';

  const handleConfirm = () => {
    if (!canConfirm || !selectedWicketType || !dismissedPlayerId) return;

    onConfirm({
      wicketType: selectedWicketType,
      dismissedPlayerId,
      ...(fielderPlayerId ? { fielderPlayerId } : {}),
      ...(selectedWicketType === 'RUN_OUT' ? { runs: runsCompleted } : {}),
      extraType: extraContext,
      extraRuns: extraRunsContext,
    });
    resetState();
  };

  const handleCancel = () => {
    resetState();
    onCancel();
  };

  const resetState = () => {
    setSelectedWicketType(null);
    setDismissedPlayerId(null);
    setFielderPlayerId(null);
    setRunsCompleted(0);
    setStep(1);
  };

  const subtitleForStep2 = () => {
    if (selectedWicketType === 'RUN_OUT') return 'Who was run out — and how many runs were completed?';
    if (selectedWicketType === 'RETIRED_HURT') return 'Who is retiring hurt?';
    return 'Select the fielder involved';
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleCancel(); }}>
      <DialogContent showCloseButton={false} className="bg-bg-card border-border max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="text-t1 text-base">
            {step === 1 ? 'Wicket Type' : 'Wicket Details'}
          </DialogTitle>
          <DialogDescription className="text-t3 text-xs">
            {step === 1
              ? freeHit || extraContext
                ? gatingHint
                : 'How was the batsman dismissed?'
              : subtitleForStep2()}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="grid grid-cols-4 gap-1.5">
            {wicketTypes.map((wt) => {
              const Icon = wt.Icon;
              const allowed = dismissalAllowed(wt.type, { freeHit, extra: extraContext });
              return (
                <motion.button
                  key={wt.type}
                  whileTap={allowed && !isSubmitting ? { scale: 0.95 } : {}}
                  onClick={() => handleWicketTypeSelect(wt.type)}
                  disabled={isSubmitting || !allowed}
                  title={!allowed ? (gatingHint ?? undefined) : undefined}
                  className={`flex flex-col items-center justify-center h-20 rounded-xl border transition-colors ${
                    allowed
                      ? 'bg-wicket/10 hover:bg-wicket/20 border-wicket/20'
                      : 'bg-bg-elevated/40 border-border/40 opacity-40 cursor-not-allowed'
                  }`}
                >
                  <Icon size={22} className={`mb-1.5 ${allowed ? 'text-wicket' : 'text-t3'}`} />
                  <span className={`text-[10px] font-medium leading-tight text-center ${allowed ? 'text-t1' : 'text-t3'}`}>
                    {wt.label}
                  </span>
                </motion.button>
              );
            })}
          </div>
        )}

        {step === 1 && freeHit && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">FH</span>
            <span className="text-[10px] text-amber-400/90">Free hit in effect — bowler-credited dismissals are off</span>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            {/* Batsman selection for RUN_OUT / RETIRED_HURT */}
            {needsBatsmanSelect && (
              <div className="space-y-1.5">
                <p className="text-xs text-t3 uppercase tracking-wider font-medium">
                  {selectedWicketType === 'RETIRED_HURT' ? 'Who is retiring?' : 'Who was run out?'}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setDismissedPlayerId(strikerId)}
                    className={`flex items-center justify-center h-12 rounded-xl text-sm font-medium transition-colors ${
                      dismissedPlayerId === strikerId
                        ? 'bg-wicket/30 text-wicket border border-wicket/40'
                        : 'bg-bg-elevated text-t2 hover:bg-bg-elevated/80'
                    }`}
                  >
                    {striker?.player.name ?? 'Striker'}
                    <span className="text-accent text-xs ml-1">*</span>
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setDismissedPlayerId(nonStrikerId)}
                    className={`flex flex-col items-center justify-center h-12 rounded-xl text-sm font-medium transition-colors ${
                      dismissedPlayerId === nonStrikerId
                        ? 'bg-wicket/30 text-wicket border border-wicket/40'
                        : 'bg-bg-elevated text-t2 hover:bg-bg-elevated/80'
                    }`}
                  >
                    <span>{nonStriker?.player.name ?? 'Non-striker'}</span>
                    {selectedWicketType === 'RUN_OUT' && (
                      <span className="text-[9px] text-t3 uppercase tracking-wider">mankad</span>
                    )}
                  </motion.button>
                </div>
              </div>
            )}

            {/* Runs completed before dismissal (§12.6) */}
            {needsRunsCompleted && (
              <div className="space-y-1.5">
                <p className="text-xs text-t3 uppercase tracking-wider font-medium">Runs completed before dismissal</p>
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((r) => (
                    <motion.button
                      key={r}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setRunsCompleted(r)}
                      className={`flex items-center justify-center h-11 rounded-xl font-mono text-lg font-bold transition-colors ${
                        runsCompleted === r
                          ? 'bg-wicket/25 text-wicket border border-wicket/40'
                          : 'bg-bg-elevated text-t2 hover:bg-bg-elevated/80'
                      }`}
                    >
                      {r}
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* Fielder selection */}
            {needsFielderSelect && (
              <div className="space-y-1.5">
                <p className="text-xs text-t3 uppercase tracking-wider font-medium">
                  {selectedWicketType === 'STUMPED' ? 'Wicket keeper' : 'Fielder'}
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {fieldingPlayers.map((player) => (
                    <motion.button
                      key={player.id}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setFielderPlayerId(player.id)}
                      className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        fielderPlayerId === player.id
                          ? 'bg-accent/20 text-accent border border-accent/30'
                          : 'bg-bg-elevated text-t2 hover:bg-bg-elevated/80'
                      }`}
                    >
                      {player.name}
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* Confirm / Back */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setStep(1);
                  setDismissedPlayerId(null);
                  setFielderPlayerId(null);
                  setRunsCompleted(0);
                }}
                className="flex-1 h-11 rounded-xl border border-border text-t2 hover:text-t1"
              >
                Back
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!canConfirm || isSubmitting}
                className="flex-1 h-11 rounded-xl bg-wicket text-white hover:bg-wicket/80 font-semibold"
              >
                {isSubmitting ? 'Recording...' : 'Confirm Wicket'}
              </Button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="pt-1">
            <Button
              variant="ghost"
              onClick={handleCancel}
              className="w-full h-11 rounded-xl border border-border text-t2 hover:text-t1"
            >
              Cancel
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
