'use client';

import type { BatsmanInningsData, WicketType } from '@/types';

interface BattingTableProps {
  batting: BatsmanInningsData[];
  teamName: string;
  totalRuns: number;
  totalWickets: number;
  completedOvers: number;
  currentBalls: number;
  extras: {
    wides: number;
    noBalls: number;
    byes: number;
    legByes: number;
    total: number;
  };
  allPlayers: { id: string; name: string }[];
}

function BattingTable({
  batting,
  teamName,
  totalRuns,
  totalWickets,
  completedOvers,
  currentBalls,
  extras,
  allPlayers,
}: BattingTableProps) {
  const playerMap = new Map(allPlayers.map((p) => [p.id, p.name]));

  function getDismissal(batsman: BatsmanInningsData): string {
    if (!batsman.isOut) {
      return 'not out';
    }

    const type = batsman.dismissalType as WicketType | null;
    const bowlerName = batsman.dismissedByBowlerId
      ? playerMap.get(batsman.dismissedByBowlerId) || '?'
      : null;
    const fielderName = batsman.fielderPlayerId
      ? playerMap.get(batsman.fielderPlayerId) || '?'
      : null;

    switch (type) {
      case 'BOWLED':
        return `b. ${bowlerName || '?'}`;
      case 'CAUGHT':
        return fielderName
          ? `c. ${fielderName} b. ${bowlerName || '?'}`
          : `c. sub b. ${bowlerName || '?'}`;
      case 'RUN_OUT':
        return fielderName ? `run out (${fielderName})` : 'run out';
      case 'LBW':
        return `lbw b. ${bowlerName || '?'}`;
      case 'STUMPED':
        return fielderName
          ? `st. ${fielderName} b. ${bowlerName || '?'}`
          : `stumped b. ${bowlerName || '?'}`;
      case 'HIT_WICKET':
        return `hit wicket b. ${bowlerName || '?'}`;
      case 'RETIRED_HURT':
        return 'retired hurt';
      default:
        return 'out';
    }
  }

  const formatSR = (runs: number, balls: number): string => {
    if (balls === 0) return '0.0';
    return ((runs / balls) * 100).toFixed(1);
  };

  const maxRuns = Math.max(...batting.map((x) => x.runs), 0);

  return (
    <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
      {/* Team header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="text-sm font-bold text-t1">{teamName}</span>
        <span className="text-sm font-bold text-accent font-[family-name:var(--font-mono)]">
          {totalRuns}/{totalWickets}
          <span className="text-xs text-t3 ml-1 font-sans">
            ({completedOvers}.{currentBalls} ov)
          </span>
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50 text-t3 uppercase tracking-wider">
              <th className="text-left py-2 px-3 font-medium">Batsman</th>
              <th className="text-right py-2 px-1.5 font-medium w-8">R</th>
              <th className="text-right py-2 px-1.5 font-medium w-8">B</th>
              <th className="text-right py-2 px-1.5 font-medium w-8">4s</th>
              <th className="text-right py-2 px-1.5 font-medium w-8">6s</th>
              <th className="text-right py-2 px-1.5 font-medium w-10">SR</th>
            </tr>
          </thead>
          <tbody>
            {batting.map((b) => {
              const dismissal = getDismissal(b);
              const isTopScorer = b.runs > 0 && b.runs === maxRuns;
              return (
                <tr
                  key={b.id}
                  className={`border-b border-border/30 ${isTopScorer ? 'bg-accent-dim/20' : ''}`}
                >
                  <td className="py-2 px-3">
                    <div className="flex flex-col">
                      <span
                        className={`font-medium ${
                          b.isOut ? 'text-t2' : 'text-t1 font-semibold'
                        }`}
                      >
                        {b.player.name}
                        {!b.isOut && (
                          <span className="text-accent text-[10px] ml-0.5">*</span>
                        )}
                      </span>
                      <span className="text-t3 text-[10px] leading-tight">
                        {dismissal}
                      </span>
                    </div>
                  </td>
                  <td
                    className={`text-right py-2 px-1.5 font-bold font-[family-name:var(--font-mono)] ${
                      b.runs >= 50
                        ? 'text-run-6'
                        : b.runs >= 30
                        ? 'text-accent'
                        : 'text-t1'
                    }`}
                  >
                    {b.runs}
                  </td>
                  <td className="text-right py-2 px-1.5 text-t2 font-[family-name:var(--font-mono)]">
                    {b.balls}
                  </td>
                  <td className="text-right py-2 px-1.5 text-run-4 font-[family-name:var(--font-mono)]">
                    {b.fours}
                  </td>
                  <td className="text-right py-2 px-1.5 text-run-6 font-[family-name:var(--font-mono)]">
                    {b.sixes}
                  </td>
                  <td className="text-right py-2 px-1.5 text-t2 font-[family-name:var(--font-mono)]">
                    {formatSR(b.runs, b.balls)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Extras row */}
      <div className="px-4 py-2 border-t border-border/50 flex items-center justify-between text-xs">
        <span className="text-t3">Extras</span>
        <div className="flex items-center gap-3 text-t2">
          {extras.wides > 0 && <span>Wd {extras.wides}</span>}
          {extras.noBalls > 0 && <span>Nb {extras.noBalls}</span>}
          {extras.byes > 0 && <span>B {extras.byes}</span>}
          {extras.legByes > 0 && <span>Lb {extras.legByes}</span>}
          <span className="font-bold text-t1">{extras.total}</span>
        </div>
      </div>

      {/* Total row */}
      <div className="px-4 py-2.5 bg-bg-elevated/50 flex items-center justify-between">
        <span className="text-sm font-bold text-t1">Total</span>
        <span className="text-sm font-bold text-accent font-[family-name:var(--font-mono)]">
          {totalRuns}/{totalWickets}
          <span className="text-xs text-t3 ml-1 font-sans">
            ({completedOvers}.{currentBalls} overs)
          </span>
        </span>
      </div>
    </div>
  );
}

export { BattingTable };
