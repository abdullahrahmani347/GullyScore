'use client';

import { useState } from 'react';
import { Dices, HelpCircle, X } from 'lucide-react';
import type { TournamentTeamStat } from '@/types';
import { nrrWorkedExample } from '@/lib/standings';

interface PointsTableProps {
  pointsTable: TournamentTeamStat[];
  /** v2 §17.3 — organizer action: offer the drawing-of-lots tool for tied groups */
  onDrawLots?: (teamIds: string[]) => void;
  lotsPending?: boolean;
}

/**
 * §17.3 NRR transparency — the tooltip shows the formula and a WORKED
 * EXAMPLE using this team's actual numbers:
 *   NRR = (runs scored / overs faced) − (runs conceded / overs bowled)
 * Overs shown in 0.1 cricket notation (balls/6); all-out innings count the
 * full quota (enforced at write time, §7.4).
 */
function NrrTooltip({ team }: { team: TournamentTeamStat }) {
  const [open, setOpen] = useState(false);
  const lines = nrrWorkedExample({
    runsScored: team.runsScored,
    oversFaced: team.oversFaced,
    runsConceded: team.runsConceded,
    oversBowled: team.oversBowled,
  });

  return (
    <span className="relative inline-flex items-center gap-1 justify-end">
      <span
        className={
          team.nrr > 0 ? 'text-accent' : team.nrr < 0 ? 'text-wicket' : 'text-t3'
        }
      >
        {team.nrr > 0 ? '+' : ''}
        {team.nrr.toFixed(3)}
      </span>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="How is NRR calculated?"
        className="text-t3 hover:text-t2 transition-colors"
      >
        <HelpCircle size={11} />
      </button>
      {open && (
        <span
          className="absolute right-0 top-5 z-20 w-56 rounded-lg border border-border bg-bg-elevated p-2.5 text-left shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold text-t2 uppercase tracking-wider">NRR formula</span>
            <button onClick={() => setOpen(false)} className="text-t3 hover:text-t2" aria-label="Close">
              <X size={10} />
            </button>
          </span>
          <span className="block text-[10px] text-t3 leading-relaxed mb-1.5">
            NRR = (runs scored ÷ overs faced) − (runs conceded ÷ overs bowled).
            Overs use 0.1 notation (9.4 overs = 9 overs + 4 balls = 58/6 overs).
            An all-out innings counts the full quota.
          </span>
          <span className="block text-[10px] text-t2 font-[family-name:var(--font-mono)] leading-relaxed border-t border-border/60 pt-1.5">
            {lines.map((l, i) => (
              <span key={i} className="block whitespace-nowrap">{l}</span>
            ))}
          </span>
        </span>
      )}
    </span>
  );
}

function PointsTable({ pointsTable, onDrawLots, lotsPending }: PointsTableProps) {
  if (pointsTable.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-bg-card p-8 text-center">
        <p className="text-sm text-t3">No teams in this league yet</p>
      </div>
    );
  }

  // v2 §17.3 — groups still tied after every objective criterion
  const lotsGroups: string[][] = [];
  let current: string[] = [];
  for (const row of pointsTable) {
    if (row.needsLots) {
      current.push(row.teamId);
    } else if (current.length > 0) {
      lotsGroups.push(current);
      current = [];
    }
  }
  if (current.length > 0) lotsGroups.push(current);

  return (
    <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <span className="text-sm font-bold text-t2">Points Table</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50 text-t3 uppercase tracking-wider">
              <th className="text-left py-2 px-3 font-medium w-6">#</th>
              <th className="text-left py-2 px-2 font-medium">Team</th>
              <th className="text-center py-2 px-1.5 font-medium w-6">P</th>
              <th className="text-center py-2 px-1.5 font-medium w-6">W</th>
              <th className="text-center py-2 px-1.5 font-medium w-6">L</th>
              <th className="text-center py-2 px-1.5 font-medium w-6">T</th>
              <th className="text-center py-2 px-1.5 font-medium w-7">Pts</th>
              <th className="text-right py-2 px-2 font-medium w-14">NRR</th>
            </tr>
          </thead>
          <tbody>
            {pointsTable.map((team, idx) => {
              const isLeader = idx === 0;
              return (
                <tr
                  key={team.teamId}
                  className={`border-b border-border/30 ${
                    isLeader
                      ? 'bg-gold-dim/20 border-l-2 border-l-gold'
                      : ''
                  }`}
                >
                  <td className="py-2.5 px-3">
                    <span
                      className={`font-bold font-[family-name:var(--font-mono)] ${
                        isLeader ? 'text-gold' : 'text-t3'
                      }`}
                    >
                      {idx + 1}
                    </span>
                  </td>
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: team.team.color }}
                      />
                      <span
                        className={`font-medium truncate ${
                          isLeader ? 'text-t1' : 'text-t2'
                        }`}
                      >
                        {team.team.shortName || team.team.name}
                      </span>
                      {/* §17.3 — tied beyond the chain, lots not drawn yet */}
                      {team.needsLots && (
                        <Dices size={11} className="text-gold flex-shrink-0" aria-label="Tied — needs drawing of lots" />
                      )}
                    </div>
                  </td>
                  <td className="text-center py-2.5 px-1.5 text-t2 font-[family-name:var(--font-mono)]">
                    {team.played}
                  </td>
                  <td className="text-center py-2.5 px-1.5 text-t1 font-bold font-[family-name:var(--font-mono)]">
                    {team.won}
                  </td>
                  <td className="text-center py-2.5 px-1.5 text-t2 font-[family-name:var(--font-mono)]">
                    {team.lost}
                  </td>
                  <td className="text-center py-2.5 px-1.5 text-t2 font-[family-name:var(--font-mono)]">
                    {team.tied}
                  </td>
                  <td className="text-center py-2.5 px-1.5 font-bold font-[family-name:var(--font-mono)] text-accent">
                    {team.points}
                  </td>
                  <td className="text-right py-2.5 px-2 font-[family-name:var(--font-mono)]">
                    <NrrTooltip team={team} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* §17.3 — drawing of lots action for tied groups (organizer only) */}
      {onDrawLots && lotsGroups.length > 0 && (
        <div className="px-4 py-3 border-t border-border bg-bg-elevated/40">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-t3">
              {lotsGroups.length} tie{lotsGroups.length !== 1 ? 's' : ''} unresolved — decide by drawing of lots.
            </p>
            <button
              onClick={() => onDrawLots(lotsGroups[0])}
              disabled={lotsPending}
              className="flex items-center gap-1.5 px-3 h-7 rounded-lg bg-gold/15 text-gold text-xs font-semibold hover:bg-gold/25 transition-colors disabled:opacity-50 flex-shrink-0"
            >
              <Dices size={13} className={lotsPending ? 'animate-spin' : ''} />
              Draw lots
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export { PointsTable };
