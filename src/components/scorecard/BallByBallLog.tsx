'use client';

import type { BallRecord } from '@/types';

interface BallByBallLogProps {
  balls: BallRecord[];
}

function getBallDisplay(ball: BallRecord): { label: string; color: string; bg: string } {
  if (ball.isWicket) {
    return { label: 'W', color: 'text-white', bg: 'bg-wicket' };
  }
  if (ball.extraType === 'WIDE') {
    return { label: `Wd${ball.extraRuns > 1 ? ball.extraRuns : ''}`, color: 'text-t1', bg: 'bg-bg-elevated' };
  }
  if (ball.extraType === 'NO_BALL') {
    return { label: `Nb${ball.extraRuns > 1 ? ball.extraRuns : ''}`, color: 'text-t1', bg: 'bg-bg-elevated' };
  }
  if (ball.extraType === 'BYE' || ball.extraType === 'LEG_BYE') {
    const prefix = ball.extraType === 'BYE' ? 'B' : 'Lb';
    if (ball.runs === 0) {
      return { label: prefix, color: 'text-t2', bg: 'bg-dot' };
    }
    if (ball.runs === 4) {
      return { label: `${prefix}4`, color: 'text-run-4', bg: 'bg-run-4-bg' };
    }
    if (ball.runs === 6) {
      return { label: `${prefix}6`, color: 'text-run-6', bg: 'bg-run-6-bg' };
    }
    return { label: `${prefix}${ball.runs}`, color: 'text-t1', bg: 'bg-bg-elevated' };
  }
  if (ball.runs === 0) {
    return { label: '0', color: 'text-t3', bg: 'bg-dot/60' };
  }
  if (ball.runs === 4) {
    return { label: '4', color: 'text-run-4', bg: 'bg-run-4-bg' };
  }
  if (ball.runs === 6) {
    return { label: '6', color: 'text-run-6', bg: 'bg-run-6-bg' };
  }
  return { label: String(ball.runs), color: 'text-t1', bg: 'bg-bg-elevated' };
}

function BallByBallLog({ balls }: BallByBallLogProps) {
  if (balls.length === 0) {
    return null;
  }

  // Group balls by over
  const overs: Map<number, BallRecord[]> = new Map();
  balls.forEach((b) => {
    const over = b.overNumber;
    if (!overs.has(over)) overs.set(over, []);
    overs.get(over)!.push(b);
  });

  // Sort balls within each over
  const oversArray = Array.from(overs.entries()).sort(([a], [b]) => a - b);

  return (
    <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <span className="text-sm font-bold text-t2">Ball by Ball</span>
      </div>

      <div className="max-h-80 overflow-y-auto">
        {oversArray.map(([overNum, overBalls]) => {
          const sortedBalls = [...overBalls].sort(
            (a, b) => a.deliveryNumber - b.deliveryNumber
          );
          const overRuns = sortedBalls.reduce(
            (sum, b) => sum + b.runs + b.extraRuns,
            0
          );

          return (
            <div
              key={overNum}
              className="px-4 py-2.5 border-b border-border/30 last:border-b-0"
            >
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-t3 w-8 flex-shrink-0 font-[family-name:var(--font-mono)]">
                  {overNum + 1}
                </span>
                <div className="flex items-center gap-1 flex-wrap flex-1">
                  {sortedBalls.map((ball) => {
                    const display = getBallDisplay(ball);
                    return (
                      <span
                        key={ball.id}
                        className={`inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-full text-[10px] font-bold font-[family-name:var(--font-mono)] px-1 ${display.color} ${display.bg}`}
                      >
                        {display.label}
                      </span>
                    );
                  })}
                </div>
                <span className="text-xs font-bold text-t2 font-[family-name:var(--font-mono)] flex-shrink-0 w-8 text-right">
                  {overRuns}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { BallByBallLog };
