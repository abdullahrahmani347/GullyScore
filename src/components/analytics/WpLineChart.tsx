'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { wpTimeline, type WpSnapshot } from '@/lib/intelligence';
import { matchRulesFor } from '@/lib/scoring-context';
import type { MatchData, InningsState } from '@/types';
import type { BallEvent } from '@/lib/engine';

interface WpLineChartProps {
  match: MatchData;
  innings: InningsState;
  /** Team name whose probability the line tracks (the batting team). */
  compact?: boolean;
}

/**
 * v2 §13.1 — spectator win-probability line. One point per completed over
 * (plus "now"), computed from the same pure wpTimeline the turning-point
 * detector uses. Live SSE `wp` values append instantly between refetches.
 */
export function WpLineChart({ match, innings, compact = false }: WpLineChartProps) {
  const data = useMemo(() => {
    const rules = matchRulesFor(match, innings.inningsNumber, innings.target ?? null);
    const timeline: WpSnapshot[] = wpTimeline((innings.balls ?? []) as unknown as BallEvent[], rules);
    return timeline.map((s) => ({
      over: s.overNumber,
      wp: Math.round(s.wp * 1000) / 10,
    }));
  }, [match, innings]);

  if (data.length < 2) return null;

  const battingColor = innings.team.color || '#00D4AA';

  return (
    <div className="rounded-xl bg-bg-card border border-border px-3 py-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-t3 uppercase tracking-wider font-medium">
          Win probability
        </span>
        <span className="text-[9px] text-t3 font-mono">
          {innings.team.name} · {Math.round(data[data.length - 1].wp)}%
        </span>
      </div>
      <div style={{ height: compact ? 90 : 110, width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="over"
              tick={{ fontSize: 9, fill: '#4A4A62' }}
              axisLine={{ stroke: 'rgba(255,255,255,0.07)' }}
              tickLine={false}
              tickFormatter={(v: number) => `${v}`}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 9, fill: '#4A4A62' }}
              axisLine={false}
              tickLine={false}
              width={28}
              tickFormatter={(v: number) => `${v}%`}
            />
            <ReferenceLine y={50} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 3" strokeWidth={1} />
            <Line
              type="monotone"
              dataKey="wp"
              stroke={battingColor}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
