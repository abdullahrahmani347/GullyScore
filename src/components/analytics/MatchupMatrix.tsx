'use client';

import { useMemo, useState } from 'react';
import { matchupMatrix, type MatchupCell } from '@/lib/intelligence';
import type { BallRecord, Player } from '@/types';

interface MatchupMatrixProps {
  balls: BallRecord[];
  battingPlayers: Player[];
  bowlingPlayers: Player[];
}

/**
 * v2 §13.4 — batter × bowler matchup grid: runs (balls) per cell with dots
 * and dismissals. Computed from Ball rows; aggregates whatever list it is
 * fed (per match here, per season on player pages).
 */
export function MatchupMatrix({ balls, battingPlayers, bowlingPlayers }: MatchupMatrixProps) {
  const [minBalls, setMinBalls] = useState(1);

  const { cells, batIds, bowlIds } = useMemo(() => {
    const cells: MatchupCell[] = matchupMatrix(balls).filter((c) => c.balls >= 1);
    const batIds = [...new Set(cells.map((c) => c.batsmanId))].filter((id) =>
      battingPlayers.some((p) => p.id === id)
    );
    const bowlIds = [...new Set(cells.map((c) => c.bowlerId))].filter((id) =>
      bowlingPlayers.some((p) => p.id === id)
    );
    return { cells, batIds, bowlIds };
  }, [balls, battingPlayers, bowlingPlayers]);

  const filtered = useMemo(
    () => cells.filter((c) => c.balls >= minBalls),
    [cells, minBalls]
  );

  if (cells.length === 0) return null;

  const nameOf = (list: Player[], id: string) => list.find((p) => p.id === id)?.name ?? '?';
  const cellOf = (bat: string, bowl: string) => filtered.find((c) => c.batsmanId === bat && c.bowlerId === bowl);
  const maxRuns = Math.max(...filtered.map((c) => c.runs), 1);

  return (
    <div className="rounded-xl bg-bg-card border border-border px-3 py-2.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-t3 uppercase tracking-wider font-medium">Matchups · bat vs bowl</span>
        <div className="flex items-center gap-1">
          {[1, 3, 6].map((n) => (
            <button
              key={n}
              onClick={() => setMinBalls(n)}
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full border ${
                minBalls === n ? 'border-accent/40 text-accent bg-accent/10' : 'border-border text-t3'
              }`}
            >
              ≥{n}b
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <table className="text-[10px] font-mono border-separate border-spacing-[2px]">
          <thead>
            <tr>
              <th className="text-left text-t3 font-normal pr-1 sticky left-0 bg-bg-card">bat \\ bowl</th>
              {bowlIds.map((id) => (
                <th key={id} className="text-t3 font-normal pb-0.5 whitespace-nowrap">
                  <span className="inline-block max-w-[64px] truncate align-bottom" title={nameOf(bowlingPlayers, id)}>
                    {nameOf(bowlingPlayers, id).split(' ')[0]}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {batIds.map((batId) => (
              <tr key={batId}>
                <td className="text-t2 pr-1 whitespace-nowrap sticky left-0 bg-bg-card">
                  <span className="inline-block max-w-[72px] truncate" title={nameOf(battingPlayers, batId)}>
                    {nameOf(battingPlayers, batId)}
                  </span>
                </td>
                {bowlIds.map((bowlId) => {
                  const c = cellOf(batId, bowlId);
                  if (!c) return <td key={bowlId} />;
                  const intensity = c.runs / maxRuns;
                  return (
                    <td key={bowlId}>
                      <div
                        className={`flex flex-col items-center justify-center min-w-[42px] h-[34px] rounded-md ${
                          c.dismissals > 0 ? 'ring-1 ring-wicket/60' : ''
                        }`}
                        style={{ backgroundColor: `rgba(0,212,170,${0.05 + intensity * 0.45})` }}
                        title={`${nameOf(battingPlayers, batId)} vs ${nameOf(bowlingPlayers, bowlId)}: ${c.runs} runs, ${c.balls} balls, ${c.dots} dots, ${c.fours}×4, ${c.sixes}×6${c.dismissals ? `, ${c.dismissals} dismissal(s)` : ''}`}
                      >
                        <span className="text-t1 font-semibold leading-none">
                          {c.runs}
                          {c.dismissals > 0 && <span className="text-wicket">†</span>}
                          <span className="text-t3 font-normal">({c.balls})</span>
                        </span>
                        {c.dots > 0 && <span className="text-[7px] text-t3 leading-none mt-0.5">{c.dots}d</span>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[8px] text-t3 mt-1.5">
        runs (balls faced) · † dismissed · d dots — intensity by runs scored
      </p>
    </div>
  );
}
