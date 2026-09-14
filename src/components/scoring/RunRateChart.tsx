'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ReferenceLine,
  Cell,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { computeRunsPerOver, computeParRunRate, getBarColor, computeGhostData } from '@/lib/run-rate-chart';
import type { MatchData, InningsState } from '@/types';

interface RunRateChartProps {
  match: MatchData;
  currentInnings: InningsState;
}

interface ChartDataPoint {
  over: number;
  runs: number;
  isCurrentOver: boolean;
  ghostRuns?: number | null;
}

/**
 * Live Run Rate Chart — compact bar chart showing runs-per-over
 * with a par baseline and optional 1st innings ghost overlay.
 *
 * 120px tall, full width, positioned between bowler card and scoring buttons.
 */
export function RunRateChart({ match, currentInnings }: RunRateChartProps) {
  // Compute runs per over from ball data
  const oversData = useMemo(
    () => computeRunsPerOver(currentInnings),
    [currentInnings],
  );

  // Compute par run rate
  const parRate = useMemo(
    () => computeParRunRate(currentInnings.runs, match.totalOvers),
    [currentInnings.runs, match.totalOvers],
  );

  // 2nd innings ghost data (1st innings comparison)
  const isFirstInnings = currentInnings.inningsNumber === 1;
  const firstInnings = match.innings.find((i) => i.inningsNumber === 1);
  const ghostData = useMemo(() => {
    if (isFirstInnings || !firstInnings) return null;
    return computeGhostData(firstInnings.balls, firstInnings.completedOvers);
  }, [isFirstInnings, firstInnings]);

  // Merge into chart data
  const chartData: ChartDataPoint[] = useMemo(() => {
    if (oversData.length === 0) return [];

    return oversData.map((over) => {
      const ghost = ghostData?.find((g) => g.overNumber === over.overNumber);
      return {
        over: over.overNumber,
        runs: over.runs,
        isCurrentOver: over.isCurrentOver,
        ghostRuns: ghost ? ghost.runs : null,
      };
    });
  }, [oversData, ghostData]);

  // Don't render until we have at least 1 over of data
  if (chartData.length === 0) return null;

  const maxRuns = Math.max(
    parRate + 2,
    ...chartData.map((d) => d.runs),
    ...chartData.map((d) => d.ghostRuns ?? 0),
  );

  return (
    <div className="rounded-xl bg-bg-card border border-border px-3 py-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-t3 uppercase tracking-wider font-medium">
          Run Rate
        </span>
        <span className="text-[10px] text-t3 font-mono">
          Par: {parRate.toFixed(1)}/ov
        </span>
      </div>

      {/* Chart */}
      <div style={{ height: 120, width: '100%' }} className="lg:h-[160px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
            barCategoryGap="20%"
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.04)"
              vertical={false}
            />
            <XAxis
              dataKey="over"
              tick={{ fontSize: 9, fill: '#4A4A62' }}
              axisLine={{ stroke: 'rgba(255,255,255,0.07)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: '#4A4A62' }}
              axisLine={false}
              tickLine={false}
              domain={[0, Math.ceil(maxRuns)]}
              width={25}
            />
            <ReferenceLine
              y={parRate}
              stroke="#FFD700"
              strokeDasharray="4 3"
              strokeWidth={1}
            />

            {/* Ghost bars (1st innings comparison) */}
            {ghostData && (
              <Bar
                dataKey="ghostRuns"
                fill="rgba(255,255,255,0.08)"
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
            )}

            {/* Main bars */}
            <Bar
              dataKey="runs"
              radius={[2, 2, 0, 0]}
              isAnimationActive={true}
              animationDuration={300}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.isCurrentOver ? 'rgba(0,212,170,0.35)' : getBarColor(entry.runs, parRate)}
                  stroke={entry.isCurrentOver ? '#00D4AA' : 'none'}
                  strokeWidth={entry.isCurrentOver ? 1.5 : 0}
                  strokeDasharray={entry.isCurrentOver ? '3 2' : 'none'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-1 pt-1 border-t border-border/50">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-[#00D4AA]" />
          <span className="text-[9px] text-t3">Above par</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-[#FFB020]" />
          <span className="text-[9px] text-t3">Near par</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-[#FF4444]" />
          <span className="text-[9px] text-t3">Below par</span>
        </div>
        {ghostData && (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm bg-white/10 border border-white/20" />
            <span className="text-[9px] text-t3">1st inn</span>
          </div>
        )}
      </div>
    </div>
  );
}
