'use client';

import { useMemo, useState } from 'react';
import { pitchHeatmap, PITCH_LENGTHS, PITCH_LINES, PITCH_LENGTH_LABELS, PITCH_LINE_LABELS } from '@/lib/intelligence';
import type { BallRecord, Player } from '@/types';

interface PitchMapChartProps {
  balls: BallRecord[];
  /** Bowling-team players for the bowler selector. */
  players: Player[];
  /** Fixed bowler (undefined = selector). */
  bowlerId?: string;
}

/**
 * v2 §13.3 — per-bowler pitch map: 5×5 length×line heatmap grid plus
 * length and line distribution bars. Wicket cells get a gold ring.
 */
export function PitchMapChart({ balls, players, bowlerId }: PitchMapChartProps) {
  const bowlersWithMap = useMemo(() => {
    const ids = new Set(
      balls.filter((b) => b.deletedAt == null && b.pitchLength != null && b.pitchLine != null).map((b) => b.bowlerId)
    );
    return players.filter((p) => ids.has(p.id));
  }, [balls, players]);

  const [selected, setSelected] = useState<string | undefined>(bowlerId ?? bowlersWithMap[0]?.id);
  const active = selected ?? bowlerId ?? bowlersWithMap[0]?.id;

  const hm = useMemo(() => {
    const subset = balls.filter((b) => b.bowlerId === active);
    return pitchHeatmap(subset);
  }, [balls, active]);

  if (hm.total === 0) {
    return (
      <div className="rounded-xl border border-border bg-bg-card px-3 py-6 text-center text-[11px] text-t3">
        No pitch data captured for this match (enable it in house rules)
      </div>
    );
  }

  const maxCell = Math.max(...hm.grid.flat());
  const maxLen = Math.max(...hm.lengthTotals, 1);
  const maxLine = Math.max(...hm.lineTotals, 1);

  return (
    <div className="rounded-xl bg-bg-card border border-border px-3 py-2.5 space-y-3">
      {bowlerId == null && bowlersWithMap.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {bowlersWithMap.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className={`text-[10px] font-medium px-2 py-0.5 rounded-full border transition-colors ${
                active === p.id
                  ? 'bg-accent/15 border-accent/40 text-accent'
                  : 'bg-bg-elevated border-border text-t3 hover:text-t2'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-t3 uppercase tracking-wider font-medium">
          Pitch map{active ? ` · ${players.find((p) => p.id === active)?.name ?? ''}` : ''}
        </span>
        <span className="text-[9px] text-t3 font-mono">{hm.total} balls</span>
      </div>

      {/* 5×5 heatmap: rows = length (yorker→bouncer), cols = line (wide-off→leg) */}
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-[3px] mx-auto">
          <thead>
            <tr>
              <th />
              {PITCH_LINES.map((l) => (
                <th key={l} className="text-[8px] text-t3 font-normal pb-0.5 whitespace-nowrap">
                  {PITCH_LINE_LABELS[l].replace('Wide off', 'W-off')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PITCH_LENGTHS.map((len, li) => (
              <tr key={len}>
                <td className="text-[8px] text-t3 font-normal pr-1 whitespace-nowrap text-right">
                  {PITCH_LENGTH_LABELS[len]}
                </td>
                {PITCH_LINES.map((line, ci) => {
                  const v = hm.grid[li][ci];
                  const wkts = hm.wicketGrid[li][ci];
                  const intensity = maxCell > 0 ? v / maxCell : 0;
                  return (
                    <td key={line}>
                      <div
                        className={`relative flex items-center justify-center w-[34px] h-[26px] rounded-md text-[10px] font-mono font-semibold ${
                          v > 0 ? 'text-t1' : 'text-t3/40'
                        } ${wkts > 0 ? 'ring-1 ring-gold' : ''}`}
                        style={{
                          backgroundColor:
                            v > 0 ? `rgba(0, 212, 170, ${0.08 + intensity * 0.5})` : 'rgba(255,255,255,0.03)',
                        }}
                        title={`${PITCH_LENGTH_LABELS[len]} · ${PITCH_LINE_LABELS[line]} — ${v} ball${v === 1 ? '' : 's'}${wkts > 0 ? `, ${wkts} wicket${wkts > 1 ? 's' : ''}` : ''}`}
                      >
                        {v > 0 ? v : ''}
                        {wkts > 0 && (
                          <span className="absolute -top-1 -right-1 text-[7px] text-gold font-bold">W</span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Distribution bars */}
      <div className="grid grid-cols-2 gap-3 pt-1 border-t border-border/50">
        <div>
          <p className="text-[8px] text-t3 uppercase tracking-wider mb-1">By length</p>
          {PITCH_LENGTHS.map((len, li) => (
            <div key={len} className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[8px] text-t3 w-11 shrink-0">{PITCH_LENGTH_LABELS[len]}</span>
              <div className="h-1.5 flex-1 rounded-full bg-bg-elevated overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent/70"
                  style={{ width: `${(hm.lengthTotals[li] / maxLen) * 100}%` }}
                />
              </div>
              <span className="text-[8px] text-t3 font-mono w-4 text-right">{hm.lengthTotals[li]}</span>
            </div>
          ))}
        </div>
        <div>
          <p className="text-[8px] text-t3 uppercase tracking-wider mb-1">By line</p>
          {PITCH_LINES.map((line, ci) => (
            <div key={line} className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[8px] text-t3 w-11 shrink-0">{PITCH_LINE_LABELS[line].replace('Wide off', 'W-off')}</span>
              <div className="h-1.5 flex-1 rounded-full bg-bg-elevated overflow-hidden">
                <div
                  className="h-full rounded-full bg-gold/60"
                  style={{ width: `${(hm.lineTotals[ci] / maxLine) * 100}%` }}
                />
              </div>
              <span className="text-[8px] text-t3 font-mono w-4 text-right">{hm.lineTotals[ci]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
