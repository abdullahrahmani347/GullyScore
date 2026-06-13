'use client';

import type { BowlerInningsData } from '@/types';
import { formatEconomy } from '@/lib/scoring-utils';

interface BowlingTableProps {
  bowling: BowlerInningsData[];
}

function BowlingTable({ bowling }: BowlingTableProps) {
  const formatOvers = (completedOvers: number, balls: number): string => {
    if (balls === 0) return `${completedOvers}`;
    return `${completedOvers}.${balls}`;
  };

  return (
    <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <span className="text-sm font-bold text-t2">Bowling</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50 text-t3 uppercase tracking-wider">
              <th className="text-left py-2 px-3 font-medium">Bowler</th>
              <th className="text-right py-2 px-1.5 font-medium w-8">O</th>
              <th className="text-right py-2 px-1.5 font-medium w-6">M</th>
              <th className="text-right py-2 px-1.5 font-medium w-8">R</th>
              <th className="text-right py-2 px-1.5 font-medium w-8">W</th>
              <th className="text-right py-2 px-1.5 font-medium w-12">Econ</th>
            </tr>
          </thead>
          <tbody>
            {bowling.map((b) => {
              const isBestBowler =
                b.wickets === Math.max(...bowling.map((x) => x.wickets)) &&
                b.wickets > 0;
              return (
                <tr
                  key={b.id}
                  className={`border-b border-border/30 ${
                    isBestBowler ? 'bg-accent-dim/20' : ''
                  }`}
                >
                  <td className="py-2 px-3">
                    <span className={`font-medium ${isBestBowler ? 'text-t1' : 'text-t2'}`}>
                      {b.player.name}
                    </span>
                  </td>
                  <td className="text-right py-2 px-1.5 text-t1 font-[family-name:var(--font-mono)]">
                    {formatOvers(b.completedOvers, b.balls)}
                  </td>
                  <td className="text-right py-2 px-1.5 text-t3 font-[family-name:var(--font-mono)]">
                    0
                  </td>
                  <td className="text-right py-2 px-1.5 text-t1 font-[family-name:var(--font-mono)]">
                    {b.runs}
                  </td>
                  <td
                    className={`text-right py-2 px-1.5 font-bold font-[family-name:var(--font-mono)] ${
                      b.wickets >= 3 ? 'text-run-6' : b.wickets >= 2 ? 'text-accent' : 'text-t1'
                    }`}
                  >
                    {b.wickets}
                  </td>
                  <td className="text-right py-2 px-1.5 text-t2 font-[family-name:var(--font-mono)]">
                    {formatEconomy(b.runs, b.completedOvers, b.balls)}
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

export { BowlingTable };
