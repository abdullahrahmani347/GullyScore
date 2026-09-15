'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Trophy } from 'lucide-react';
import type { BracketData, BracketMatch, BracketRoundNode } from '@/lib/bracket';

/**
 * v2 §17.1 — SVG bracket renderer.
 *
 * Horizontal layout: one column per round (QF → SF → F), match nodes drawn
 * as rounded rects with both team colours/names and the score state, and
 * cubic-bezier connectors from each pair of nodes into the feeding node.
 * Nodes link to the live spectator page or the scorecard; byes render as a
 * dashed auto-advance node. Champion banner renders when the final completed.
 */

const NODE_W = 168;
const NODE_H = 52;
const COL_GAP = 64;
const ROW_GAP = 16;

function matchHref(m: BracketMatch): string | null {
  if (!m.id) return null;
  if (m.status === 'COMPLETED' || m.status === 'ABANDONED') return `/matches/${m.id}/scorecard`;
  if (m.status === 'LIVE' || m.status === 'INNINGS_BREAK') {
    return m.liveCode ? `/live/${m.liveCode}` : `/matches/${m.id}`;
  }
  return `/matches/${m.id}`;
}

function TeamRow({ team, winner }: { team: { name: string; shortName: string; color: string } | null; winner: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 px-2 flex-1 min-w-0 ${winner ? 'opacity-100' : 'opacity-60'}`}>
      {team ? (
        <>
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
          <span className={`text-[11px] truncate ${winner ? 'text-t1 font-bold' : 'text-t2'}`}>
            {team.shortName || team.name}
          </span>
        </>
      ) : (
        <span className="text-[10px] text-t3 italic truncate">TBD</span>
      )}
    </div>
  );
}

export function BracketView({ bracket }: { bracket: BracketData }) {
  const rounds = bracket.rounds;
  const layout = useMemo(() => {
    // vertical positions per round column
    const positions: Array<Array<{ x: number; y: number }>> = [];
    rounds.forEach((_: BracketRoundNode, r: number) => {
      const count = rounds[r].matches.length;
      const colX = r * (NODE_W + COL_GAP);
      // spacing doubles per round so nodes center on their feeders
      const spacing = (NODE_H + ROW_GAP) * Math.pow(2, r);
      const colHeight = (count - 1) * spacing;
      positions.push(
        Array.from({ length: count }, (_, i) => ({ x: colX, y: i * spacing })),
      );
    });
    const totalW = rounds.length * NODE_W + (rounds.length - 1) * COL_GAP;
    const lastCol = positions[positions.length - 1] ?? [];
    const totalH = (lastCol.length * NODE_H) + positions.reduce((acc, col, r) => {
      const spacing = (NODE_H + ROW_GAP) * Math.pow(2, r);
      return Math.max(acc, (col.length - 1) * spacing);
    }, 0);
    return { positions, totalW, totalH };
  }, [rounds]);

  if (rounds.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-bg-card p-8 text-center">
        <p className="text-sm text-t3">Add at least 2 teams to seed the bracket</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {bracket.champion && (
        <div className="rounded-2xl border border-gold/30 p-4 flex items-center gap-3" style={{ background: 'linear-gradient(135deg, rgba(255,215,0,0.12), rgba(255,215,0,0.03))' }}>
          <div className="w-10 h-10 rounded-full bg-gold/15 flex items-center justify-center flex-shrink-0">
            <Trophy size={18} className="text-gold" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gold font-bold">Champion</p>
            <p className="text-base font-bold text-t1">
              {bracket.champion.emoji} {bracket.champion.name}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-bg-card p-4 overflow-x-auto">
        <svg
          width={layout.totalW}
          height={layout.totalH + NODE_H}
          viewBox={`0 0 ${layout.totalW} ${layout.totalH + NODE_H}`}
          className="min-w-full"
          role="img"
          aria-label="Tournament knockout bracket"
        >
          {/* connectors */}
          {rounds.slice(1).map((_, r) => {
            const from = layout.positions[r];
            const to = layout.positions[r + 1];
            return to.map((target, i) => {
              const a = from[i * 2];
              const b = from[i * 2 + 1];
              if (!a || !b) return null;
              const ax = a.x + NODE_W;
              const ay = a.y + NODE_H / 2;
              const by = b.y + NODE_H / 2;
              const ty = target.y + NODE_H / 2;
              const mx = ax + COL_GAP / 2;
              return (
                <g key={`c-${r}-${i}`} stroke="var(--border, #333)" strokeWidth={1.5} fill="none" opacity={0.7}>
                  <path d={`M ${ax} ${ay} H ${mx}`} />
                  <path d={`M ${ax} ${by} H ${mx}`} />
                  <path d={`M ${mx} ${ay} V ${by}`} />
                  <path d={`M ${mx} ${ty} H ${target.x}`} />
                </g>
              );
            });
          })}

          {/* nodes */}
          {rounds.map((round, r) =>
            round.matches.map((m, i) => {
              const pos = layout.positions[r]?.[i];
              if (!pos) return null;
              const winner = m.winnerId;
              const href = matchHref(m);
              return (
                <g key={`${m.round}-${i}`} transform={`translate(${pos.x}, ${pos.y + 24})`}>
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx={10}
                    fill="var(--bg-card, #141414)"
                    stroke={
                      m.status === 'LIVE' || m.status === 'INNINGS_BREAK'
                        ? 'var(--accent, #00D4AA)'
                        : winner
                          ? 'var(--gold, #FFD700)'
                          : 'var(--border, #333)'
                    }
                    strokeWidth={m.status === 'LIVE' ? 2 : 1}
                    strokeDasharray={m.isBye ? '4 3' : undefined}
                    opacity={m.id || m.isBye ? 1 : 0.55}
                  />
                  {m.isBye ? (
                    <text x={NODE_W / 2} y={NODE_H / 2 + 4} textAnchor="middle" className="fill-current text-t3" fontSize={10}>
                      BYE — auto advance
                    </text>
                  ) : (
                    <>
                      <foreignObject x={0} y={0} width={NODE_W} height={NODE_H / 2}>
                        <TeamRow team={m.team1} winner={winner === m.team1?.id} />
                      </foreignObject>
                      <foreignObject x={0} y={NODE_H / 2} width={NODE_W} height={NODE_H / 2}>
                        <TeamRow team={m.team2} winner={winner === m.team2?.id} />
                      </foreignObject>
                      {(m.status === 'LIVE' || m.status === 'INNINGS_BREAK') && (
                        <circle cx={NODE_W - 10} cy={10} r={4} fill="var(--accent, #00D4AA)">
                          <animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite" />
                        </circle>
                      )}
                      {href && (
                        <a href={href}>
                          <rect width={NODE_W} height={NODE_H} fill="transparent" />
                        </a>
                      )}
                    </>
                  )}
                </g>
              );
            }),
          )}
        </svg>
      </div>

      {bracket.needsGeneration && (
        <p className="text-[11px] text-t3 px-1">
          Fixtures shown are auto-seeded from the standings. Generate them as real matches to assign venues and times.
        </p>
      )}
    </div>
  );
}
