'use client';

import { useMemo, useState } from 'react';
import { wagonAngle, compassToXY, wagonRadiusForRuns, WAGON_LABELS, type WagonDirection } from '@/lib/intelligence';
import type { BallRecord, Player } from '@/types';

interface WagonWheelProps {
  balls: BallRecord[];
  /** Batting-team players — used for left-hand mirroring. */
  players: Player[];
  /** Restrict to one batter (undefined = innings-wide view). */
  batterId?: string;
  /** Outer SVG size in px. */
  size?: number;
}

interface WagonBall extends BallRecord {
  dir: WagonDirection;
}

const RUN_COLORS: Record<number, string> = {
  4: '#00D4AA', // --run-4
  6: '#FFB020', // --run-6
};

/**
 * v2 §13.2 — polar wagon wheel SVG: 8-sector compass, one spoke line per
 * captured ball (length scales with runs; 4/6 reach the rope). Mirrored
 * for left-handers. Per-batter or innings-wide.
 */
export function WagonWheel({ balls, players, batterId, size = 220 }: WagonWheelProps) {
  const [hover, setHover] = useState<WagonBall | null>(null);

  const captured = useMemo(() => {
    return balls
      .filter((b) => b.deletedAt == null && b.wagonDirection != null)
      .filter((b) => batterId == null || b.batsmanId === batterId) as WagonBall[];
  }, [balls, batterId]);

  const leftHand = useMemo(() => {
    if (batterId == null) return false; // innings-wide: right-hander orientation
    return players.find((p) => p.id === batterId)?.battingHand === 'L';
  }, [players, batterId]);

  const R = size / 2 - 18; // rope radius inside the SVG
  const cx = size / 2;
  const cy = size / 2;

  if (captured.length === 0) {
    return (
      <div
        className="rounded-xl border border-border bg-bg-card flex items-center justify-center text-[11px] text-t3"
        style={{ height: size }}
      >
        No wagon data captured yet
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Wagon wheel">
        {/* Field: rope + 30-yard circle */}
        <circle cx={cx} cy={cy} r={R} fill="rgba(0,212,170,0.03)" stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
        <circle cx={cx} cy={cy} r={R * 0.55} fill="none" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 4" />
        {/* Pitch */}
        <rect x={cx - 3} y={cy - R * 0.42} width={6} height={R * 0.84} rx={2} fill="rgba(255,255,255,0.10)" />
        {/* Sector spokes (light) */}
        {(['V', 'MID_OFF', 'COVER', 'POINT', 'THIRD_MAN', 'FINE_LEG', 'SQUARE_LEG', 'MID_WICKET'] as WagonDirection[]).map((dir) => {
          const a = wagonAngle(dir, leftHand);
          const p = compassToXY(a, R);
          return (
            <line
              key={dir}
              x1={cx}
              y1={cy}
              x2={cx + p.x}
              y2={cy + p.y}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth={0.75}
            />
          );
        })}
        {/* Ball spokes */}
        {captured.map((b, i) => {
          const a = wagonAngle(b.wagonDirection as WagonDirection, leftHand);
          const r = wagonRadiusForRuns(b.runs) * R;
          const p = compassToXY(a, r);
          const color = RUN_COLORS[b.runs] ?? 'rgba(0,212,170,0.55)';
          const isHover = hover?.id === b.id;
          return (
            <g key={b.id ?? i} onMouseEnter={() => setHover(b)} onMouseLeave={() => setHover(null)}>
              <line
                x1={cx}
                y1={cy}
                x2={cx + p.x}
                y2={cy + p.y}
                stroke={color}
                strokeWidth={b.runs >= 4 ? 2.5 : 1.6}
                strokeLinecap="round"
                opacity={hover == null || isHover ? 1 : 0.35}
              />
              <circle cx={cx + p.x} cy={cy + p.y} r={b.runs >= 4 ? 3.5 : 2} fill={color} opacity={isHover ? 1 : 0.9} />
              {/* invisible fat hit area */}
              <line x1={cx} y1={cy} x2={cx + p.x} y2={cy + p.y} stroke="transparent" strokeWidth={10} />
            </g>
          );
        })}
        {/* Batter at the centre */}
        <circle cx={cx} cy={cy} r={4} fill="#fff" opacity={0.9} />
        {/* Sector labels */}
        {(['V', 'MID_OFF', 'COVER', 'POINT', 'THIRD_MAN', 'FINE_LEG', 'SQUARE_LEG', 'MID_WICKET'] as WagonDirection[]).map((dir) => {
          const a = wagonAngle(dir, leftHand);
          const p = compassToXY(a, R + 10);
          return (
            <text
              key={dir}
              x={cx + p.x}
              y={cy + p.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={7.5}
              fill="#6B6B85"
              fontFamily="var(--font-mono, monospace)"
            >
              {dir === 'V' ? 'V' : dir.replace('_', ' ').toLowerCase()}
            </text>
          );
        })}
      </svg>
      <p className="text-[10px] text-t3 font-mono">
        {hover
          ? `${hover.runs} — ${WAGON_LABELS[hover.wagonDirection as WagonDirection]}${leftHand ? ' (L)' : ''}`
          : `${captured.length} shot${captured.length === 1 ? '' : 's'} mapped${leftHand ? ' · left-hander' : ''}`}
      </p>
    </div>
  );
}
