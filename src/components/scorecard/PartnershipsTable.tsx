'use client';

import { Users } from 'lucide-react';
import type { PartnershipData } from '@/types';

interface PartnershipsTableProps {
  partnerships: PartnershipData[];
}

function PartnershipsTable({ partnerships }: PartnershipsTableProps) {
  if (!partnerships || partnerships.length === 0) {
    return null;
  }

  // Find the highest partnership for highlighting
  const maxRuns = Math.max(...partnerships.map(p => p.runs));

  // Sort: closed partnerships by wicket number descending, then open ones last
  const sorted = [...partnerships].sort((a, b) => {
    // Open partnerships go to the end
    if (a.isOpen && !b.isOpen) return 1;
    if (!a.isOpen && b.isOpen) return -1;
    // Closed partnerships: higher wicket number first (most recent)
    if (!a.isOpen && !b.isOpen) return b.wicketNumber - a.wicketNumber;
    return 0;
  });

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4">
      <h4 className="text-xs font-semibold text-t3 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Users size={12} />
        Partnerships
      </h4>
      <div className="space-y-1.5">
        {sorted.map((p) => {
          const isTopStand = p.runs === maxRuns && p.runs > 0;
          const strikeRate = p.balls > 0 ? ((p.runs / p.balls) * 100).toFixed(1) : '0.0';

          return (
            <div
              key={p.id}
              className={`flex items-center justify-between py-2 px-3 rounded-lg ${
                isTopStand
                  ? 'bg-accent-dim/20 border border-accent/20'
                  : p.isOpen
                  ? 'bg-green-500/5 border border-green-500/10'
                  : 'bg-bg-app/50'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {/* Wicket number or "Current" */}
                <span className={`text-[10px] font-bold w-5 text-right flex-shrink-0 ${
                  p.isOpen ? 'text-green-400' : 'text-t3'
                }`}>
                  {p.isOpen ? '●' : `${p.wicketNumber}`}
                </span>

                {/* Batsman names */}
                <div className="min-w-0 flex-1">
                  <span className="text-xs text-t1 font-medium truncate block">
                    {p.batsman1.name} <span className="text-t3">&</span> {p.batsman2.name}
                  </span>
                </div>
              </div>

              {/* Runs and balls */}
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <span className={`text-xs font-bold font-[family-name:var(--font-mono)] ${
                  isTopStand ? 'text-accent' : 'text-t1'
                }`}>
                  {p.runs}
                </span>
                <span className="text-[10px] text-t3">
                  ({p.balls} ball{p.balls !== 1 ? 's' : ''})
                </span>
                {p.runs >= 50 && (
                  <span className="text-[9px] font-bold text-gold bg-gold/10 px-1.5 py-0.5 rounded">
                    50+
                  </span>
                )}
                {p.runs >= 100 && (
                  <span className="text-[9px] font-bold text-gold bg-gold/20 px-1.5 py-0.5 rounded">
                    100
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { PartnershipsTable };
