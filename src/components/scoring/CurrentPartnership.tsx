'use client';

import { Users } from 'lucide-react';
import type { InningsState } from '@/types';

interface CurrentPartnershipProps {
  currentInnings: InningsState;
}

/**
 * Displays the current (open) partnership on the live scoring screen.
 * Shows runs, balls, and strike rate for the active batting pair.
 */
export function CurrentPartnership({ currentInnings }: CurrentPartnershipProps) {
  const partnerships = currentInnings.partnerships;
  if (!partnerships || partnerships.length === 0) return null;

  // Find the open (current) partnership
  const openPartnership = partnerships.find((p) => p.isOpen);
  if (!openPartnership) return null;

  const strikeRate = openPartnership.balls > 0
    ? ((openPartnership.runs / openPartnership.balls) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="rounded-xl bg-bg-card border border-border px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <Users size={11} className="text-green-400 flex-shrink-0" />
          <span className="text-[10px] text-green-400 font-semibold uppercase tracking-wider">Partnership</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-mono font-bold text-t1">
            {openPartnership.runs}
          </span>
          <span className="text-[10px] text-t3 font-mono">
            ({openPartnership.balls}b)
          </span>
          <span className="text-[10px] text-t3 font-mono">
            SR {strikeRate}
          </span>
          {openPartnership.runs >= 50 && (
            <span className="text-[9px] font-bold text-gold bg-gold/10 px-1.5 py-0.5 rounded">
              50+
            </span>
          )}
          {openPartnership.runs >= 100 && (
            <span className="text-[9px] font-bold text-gold bg-gold/20 px-1.5 py-0.5 rounded">
              100
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
