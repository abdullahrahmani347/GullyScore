'use client';

import type { TournamentTeamStat } from '@/types';

interface PointsTableProps {
  pointsTable: TournamentTeamStat[];
}

function PointsTable({ pointsTable }: PointsTableProps) {
  if (pointsTable.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-bg-card p-8 text-center">
        <p className="text-sm text-t3">No teams in this league yet</p>
      </div>
    );
  }

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
              <th className="text-right py-2 px-2 font-medium w-12">NRR</th>
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
                    <span
                      className={
                        team.nrr > 0
                          ? 'text-accent'
                          : team.nrr < 0
                          ? 'text-wicket'
                          : 'text-t3'
                      }
                    >
                      {team.nrr > 0 ? '+' : ''}
                      {team.nrr.toFixed(3)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { PointsTable };
