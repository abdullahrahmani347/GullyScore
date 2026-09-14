'use client';

import { useMemo } from 'react';
import { Users, Zap } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid } from 'recharts';
import { partnershipAnalytics } from '@/lib/intelligence';
import type { PartnershipData, Player } from '@/types';

interface PartnershipAnalyticsCardProps {
  partnerships: PartnershipData[];
  players: Player[];
}

/**
 * v2 §13.8 — partnership analytics: per-wicket stand graph, biggest and
 * fastest stands, average stand per wicket number, run rate per stand.
 */
export function PartnershipAnalyticsCard({ partnerships, players }: PartnershipAnalyticsCardProps) {
  const a = useMemo(
    () =>
      partnershipAnalytics(
        partnerships.map((p) => ({
          batsman1Id: p.batsman1?.id ?? '',
          batsman2Id: p.batsman2?.id ?? '',
          batsman1Name: p.batsman1?.name,
          batsman2Name: p.batsman2?.name,
          runs: p.runs,
          balls: p.balls,
          wicketNumber: p.wicketNumber,
          isOpen: p.isOpen,
        }))
      ),
    [partnerships]
  );

  const name = (p: { batsman1Name?: string; batsman2Name?: string; batsman1Id: string; batsman2Id: string }) =>
    `${p.batsman1Name ?? players.find((x) => x.id === p.batsman1Id)?.name ?? '?'} & ${
      p.batsman2Name ?? players.find((x) => x.id === p.batsman2Id)?.name ?? '?'
    }`;

  if (partnerships.length === 0) return null;

  return (
    <div className="rounded-xl bg-bg-card border border-border px-3 py-2.5 space-y-2.5">
      <div className="flex items-center gap-2">
        <Users size={13} className="text-accent" />
        <span className="text-[10px] text-t3 uppercase tracking-wider font-medium">Partnership analytics</span>
        <span className="text-[9px] text-t3 ml-auto font-mono">avg {a.avgStand}</span>
      </div>

      {/* Biggest + fastest */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-bg-elevated px-2.5 py-1.5">
          <p className="text-[8px] text-t3 uppercase tracking-wider">Biggest</p>
          {a.biggest ? (
            <>
              <p className="text-[11px] font-semibold text-t1 truncate" title={name(a.biggest)}>
                {name(a.biggest)}
              </p>
              <p className="text-[10px] font-mono text-accent">
                {a.biggest.runs} <span className="text-t3">({a.biggest.balls}b)</span>
              </p>
            </>
          ) : (
            <p className="text-[10px] text-t3">—</p>
          )}
        </div>
        <div className="rounded-lg bg-bg-elevated px-2.5 py-1.5">
          <p className="text-[8px] text-t3 uppercase tracking-wider flex items-center gap-1">
            <Zap size={8} className="text-gold" /> Fastest (≥30)
          </p>
          {a.fastest ? (
            <>
              <p className="text-[11px] font-semibold text-t1 truncate" title={name(a.fastest)}>
                {name(a.fastest)}
              </p>
              <p className="text-[10px] font-mono text-gold">
                {a.fastest.runs} off {a.fastest.balls} · {a.fastestRunRate}/ov
              </p>
            </>
          ) : (
            <p className="text-[10px] text-t3">—</p>
          )}
        </div>
      </div>

      {/* Per-wicket graph */}
      {a.perWicket.length > 0 && (
        <div>
          <p className="text-[8px] text-t3 uppercase tracking-wider mb-0.5">Average stand by wicket</p>
          <div style={{ height: 84, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={a.perWicket} margin={{ top: 2, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="wicketNumber"
                  tick={{ fontSize: 9, fill: '#4A4A62' }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.07)' }}
                  tickLine={false}
                  tickFormatter={(v: number) => `W${v}`}
                />
                <YAxis tick={{ fontSize: 9, fill: '#4A4A62' }} axisLine={false} tickLine={false} width={26} />
                <Bar dataKey="avgRuns" fill="rgba(0,212,170,0.55)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Stand list with run rates */}
      {a.stands.length > 0 && (
        <div className="pt-1 border-t border-border/50 space-y-0.5 max-h-32 overflow-y-auto">
          {a.stands.map((p, i) => (
            <div key={i} className="flex items-center justify-between text-[10px]">
              <span className="text-t3 font-mono w-5 shrink-0">
                {p.isOpen ? 'open' : `W${p.wicketNumber}`}
              </span>
              <span className="text-t2 truncate flex-1 px-1.5" title={name(p)}>
                {name(p)}
              </span>
              <span className="font-mono text-t1 shrink-0">
                {p.runs}
                <span className="text-t3"> ({p.balls}b)</span>
              </span>
              <span className="font-mono text-accent/80 w-11 text-right shrink-0">{p.runRate}/ov</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
