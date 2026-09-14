'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useMatchStore } from '@/store/matchStore';
import { parseHouseRules } from '@/lib/scoring-context';
import type { ExtraType, MatchData } from '@/types';

interface ExtrasPanelProps {
  open: boolean;
  match: MatchData;
  onOpenChange: (open: boolean) => void;
  onConfirm: (extraType: ExtraType, extraRuns: number) => void;
  /** §12.6 — record a RUN_OUT on this extra delivery (opens the wicket flow) */
  onRunOut?: (extraType: ExtraType, extraRuns: number) => void;
}

const extraTypes: { type: ExtraType; label: string; description: string }[] = [
  { type: 'WIDE', label: 'Wide', description: '+1 run, add more' },
  { type: 'NO_BALL', label: 'No Ball', description: '+1, bat can score' },
  { type: 'BYE', label: 'Bye', description: 'Runs without bat' },
  { type: 'LEG_BYE', label: 'Leg Bye', description: 'Off the pads' },
];

// §12.9 — remembered last choice per session (module scope)
let lastWideAdditional = 0;
let lastNbRuns = 0;
let lastByeRuns = 1;
let lastLegByeRuns = 1;

export function ExtrasPanel({ open, match, onOpenChange, onConfirm, onRunOut }: ExtrasPanelProps) {
  const [selectedExtra, setSelectedExtra] = useState<ExtraType | null>(null);
  const [selectedRuns, setSelectedRuns] = useState<number>(0);
  const isSubmitting = useMatchStore((s) => s.isSubmitting);

  const rules = parseHouseRules(match.rules);
  const wideLimitAdditional = typeof rules?.wideLimitAdditional === 'number' ? rules.wideLimitAdditional : 4;

  const handleExtraSelect = (type: ExtraType) => {
    setSelectedExtra(type);
    // §12.9 — preselect the remembered last choice
    if (type === 'WIDE') setSelectedRuns(lastWideAdditional);
    else if (type === 'NO_BALL') setSelectedRuns(lastNbRuns);
    else if (type === 'BYE') setSelectedRuns(lastByeRuns);
    else if (type === 'LEG_BYE') setSelectedRuns(lastLegByeRuns);
  };

  // §12.9 — option grids per extra type
  const runOptions = (): number[] => {
    if (selectedExtra === 'WIDE') {
      return Array.from({ length: Math.min(4, wideLimitAdditional) + 1 }, (_, i) => i); // 0..wideLimitAdditional (additional runs)
    }
    if (selectedExtra === 'NO_BALL') return [0, 1, 2, 3, 4, 6]; // runs OFF THE BAT
    return [1, 2, 3, 4]; // byes / leg-byes
  };

  const rememberChoice = () => {
    if (selectedExtra === 'WIDE') lastWideAdditional = selectedRuns;
    else if (selectedExtra === 'NO_BALL') lastNbRuns = selectedRuns;
    else if (selectedExtra === 'BYE') lastByeRuns = selectedRuns;
    else if (selectedExtra === 'LEG_BYE') lastLegByeRuns = selectedRuns;
  };

  const handleConfirm = () => {
    if (!selectedExtra) return;
    rememberChoice();
    if (selectedExtra === 'WIDE') {
      // Wide: extraRuns = 1 (penalty) + additional
      onConfirm(selectedExtra, selectedRuns + 1);
    } else if (selectedExtra === 'NO_BALL') {
      // NB: extraRuns = 1 (penalty), runs off the bat are separate
      onConfirm(selectedExtra, selectedRuns);
    } else {
      // Byes / leg byes: extraRuns = runs taken
      onConfirm(selectedExtra, selectedRuns);
    }
    setSelectedExtra(null);
    onOpenChange(false);
  };

  const handleRunOut = () => {
    if (!selectedExtra || !onRunOut) return;
    rememberChoice();
    onRunOut(selectedExtra, selectedExtra === 'WIDE' ? selectedRuns + 1 : selectedRuns);
    setSelectedExtra(null);
    onOpenChange(false);
  };

  const subtitle = () => {
    if (!selectedExtra) return 'Choose the type of extra delivery.';
    if (selectedExtra === 'WIDE') return `Wide penalty +1 included. Additional runs: 0–${Math.min(4, wideLimitAdditional)}.`;
    if (selectedExtra === 'NO_BALL') return 'No-ball penalty +1 included. Runs off the bat below — a wicket off a no-ball can only be a run out.';
    return 'How many were taken?';
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="bg-bg-card border-t border-border rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="text-t1">
            {selectedExtra ? `Select runs for ${extraTypes.find((e) => e.type === selectedExtra)?.label}` : 'Select Extra Type'}
          </SheetTitle>
          <SheetDescription className="text-t3 text-xs">{subtitle()}</SheetDescription>
        </SheetHeader>

        {!selectedExtra ? (
          <div className="grid grid-cols-2 gap-2 px-4 pb-6">
            {extraTypes.map((et) => (
              <motion.button
                key={et.type}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleExtraSelect(et.type)}
                disabled={isSubmitting}
                className="flex flex-col items-center justify-center h-20 rounded-xl bg-bg-elevated hover:bg-bg-elevated/80 border border-border transition-colors"
              >
                <span className="text-base font-bold text-t1">{et.label}</span>
                <span className="text-[10px] text-t3 mt-0.5">{et.description}</span>
              </motion.button>
            ))}
          </div>
        ) : (
          <div className="px-4 pb-6 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {runOptions().map((r) => (
                <motion.button
                  key={r}
                  whileTap={{ scale: 0.93 }}
                  onClick={() => setSelectedRuns(r)}
                  disabled={isSubmitting}
                  className={`flex items-center justify-center h-14 rounded-xl font-mono text-xl font-bold transition-colors ${
                    selectedRuns === r
                      ? 'bg-accent/25 text-accent border border-accent/40'
                      : r === 0
                        ? 'bg-dot/70 text-t2'
                        : r === 4
                          ? 'bg-run-4/20 text-run-4'
                          : r === 6
                            ? 'bg-run-6/20 text-run-6'
                            : 'bg-bg-elevated text-t1'
                  }`}
                >
                  {r}
                </motion.button>
              ))}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedExtra(null)}
                className="flex items-center justify-center h-14 rounded-xl text-sm font-medium bg-bg-card border border-border text-t3 hover:text-t2 transition-colors"
              >
                Back
              </motion.button>
            </div>

            <div className="flex gap-2">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleConfirm}
                disabled={isSubmitting}
                className="flex-1 h-12 rounded-xl text-sm font-semibold bg-accent text-bg-app hover:bg-accent/85 transition-colors"
              >
                Record {selectedExtra === 'WIDE' ? `Wide +${selectedRuns}` : selectedExtra === 'NO_BALL' ? (selectedRuns > 0 ? `No-ball +${selectedRuns}` : 'No-ball') : `${selectedRuns} ${extraTypes.find((e) => e.type === selectedExtra)?.label}${selectedRuns > 1 ? 's' : ''}`}
              </motion.button>
              {/* §12.6 — run out on this extra (the only legal dismissal off NB/Wide) */}
              {onRunOut && (selectedExtra === 'WIDE' || selectedExtra === 'NO_BALL' || selectedExtra === 'BYE' || selectedExtra === 'LEG_BYE') && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleRunOut}
                  disabled={isSubmitting}
                  className="h-12 px-4 rounded-xl text-sm font-semibold bg-wicket/20 text-wicket border border-wicket/30 hover:bg-wicket/30 transition-colors"
                >
                  Run out
                </motion.button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );

  function handleClose(isOpen: boolean) {
    if (!isOpen) {
      setSelectedExtra(null);
    }
    onOpenChange(isOpen);
  }
}
