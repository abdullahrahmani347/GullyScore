'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useMatchStore } from '@/store/matchStore';
import type { ExtraType } from '@/types';

interface ExtrasPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (extraType: ExtraType, extraRuns: number) => void;
}

const extraTypes: { type: ExtraType; label: string; description: string }[] = [
  { type: 'WIDE', label: 'Wide', description: '+1 run, can add more' },
  { type: 'NO_BALL', label: 'No Ball', description: '+1 run, batsman can score' },
  { type: 'BYE', label: 'Bye', description: 'Runs without bat' },
  { type: 'LEG_BYE', label: 'Leg Bye', description: 'Off the pads' },
];

const runOptions = [0, 1, 2, 3, 4, 6];

export function ExtrasPanel({ open, onOpenChange, onConfirm }: ExtrasPanelProps) {
  const [selectedExtra, setSelectedExtra] = useState<ExtraType | null>(null);
  const isSubmitting = useMatchStore((s) => s.isSubmitting);

  const handleExtraSelect = (type: ExtraType) => {
    setSelectedExtra(type);
  };

  const handleRunSelect = (runs: number) => {
    if (!selectedExtra) return;

    let extraRuns = runs;
    // Wide and No Ball already include +1 run from the extra itself
    // The API handles: extraRuns is the extra penalty (1 for wide/noball) + any additional runs
    // For Wide: extraRuns = 1 (penalty) + additional runs taken
    // For No Ball: extraRuns = 1 (penalty), batsman runs go in "runs"
    // For Bye/Leg Bye: extraRuns = runs taken, no penalty

    if (selectedExtra === 'WIDE') {
      // Wide: auto +1, extraRuns is the additional runs beyond the penalty
      extraRuns = runs; // additional runs beyond the 1 penalty
      onConfirm(selectedExtra, extraRuns);
    } else if (selectedExtra === 'NO_BALL') {
      // No Ball: auto +1 penalty in extraRuns, batsman runs go in "runs"
      // The handler needs to split: extraRuns=1 (penalty), runs=batsmanRuns
      onConfirm(selectedExtra, runs);
    } else {
      // Bye / Leg Bye: extraRuns = runs taken
      onConfirm(selectedExtra, runs);
    }

    setSelectedExtra(null);
    onOpenChange(false);
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedExtra(null);
    }
    onOpenChange(isOpen);
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="bg-bg-card border-t border-border rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="text-t1">
            {selectedExtra ? `Select runs for ${extraTypes.find(e => e.type === selectedExtra)?.label}` : 'Select Extra Type'}
          </SheetTitle>
          <SheetDescription className="text-t3 text-xs">
            {selectedExtra
              ? selectedExtra === 'WIDE'
                ? 'Wide penalty +1 already included. Select additional runs.'
                : selectedExtra === 'NO_BALL'
                ? 'No ball penalty +1 already included. Select batsman runs.'
                : 'Select the number of byes/leg byes taken.'
              : 'Choose the type of extra delivery.'
            }
          </SheetDescription>
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
          <div className="grid grid-cols-3 gap-2 px-4 pb-6">
            {runOptions.map((r) => (
              <motion.button
                key={r}
                whileTap={{ scale: 0.93 }}
                onClick={() => handleRunSelect(r)}
                disabled={isSubmitting}
                className={`flex items-center justify-center h-14 rounded-xl font-mono text-xl font-bold transition-colors ${
                  r === 0 ? 'bg-dot/70 text-t2' :
                  r === 4 ? 'bg-run-4/20 text-run-4' :
                  r === 6 ? 'bg-run-6/20 text-run-6' :
                  'bg-bg-elevated text-t1'
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
        )}
      </SheetContent>
    </Sheet>
  );
}
