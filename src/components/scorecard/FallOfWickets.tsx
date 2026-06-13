'use client';

import type { BallRecord } from '@/types';

interface FallOfWicketsProps {
  balls: BallRecord[];
  allPlayers: { id: string; name: string }[];
  battingTeamPlayers: { id: string; name: string }[];
}

function FallOfWickets({ balls, allPlayers, battingTeamPlayers }: FallOfWicketsProps) {
  const playerMap = new Map(allPlayers.map((p) => [p.id, p.name]));

  // Find all wicket balls
  const wicketBalls = balls.filter((b) => b.isWicket);

  if (wicketBalls.length === 0) {
    return null;
  }

  // Calculate cumulative score at each wicket
  let cumulativeRuns = 0;
  const wickets = wicketBalls.map((wb) => {
    // Sum all runs up to and including this ball
    const ballsUpToWicket = balls.filter(
      (b) => b.deliveryNumber <= wb.deliveryNumber
    );
    const scoreAtWicket = ballsUpToWicket.reduce(
      (sum, b) => sum + b.runs + b.extraRuns,
      0
    );

    const dismissedName = wb.dismissedPlayerId
      ? playerMap.get(wb.dismissedPlayerId) || '?'
      : '?';

    return {
      score: scoreAtWicket,
      wicketNumber: wicketBalls.indexOf(wb) + 1,
      batsmanName: dismissedName,
      overNumber: wb.overNumber,
      ballInOver: wb.ballInOver,
    };
  });

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4">
      <h4 className="text-xs font-semibold text-t3 uppercase tracking-wider mb-2">
        Fall of Wickets
      </h4>
      <div className="flex flex-wrap gap-x-1 gap-y-1">
        {wickets.map((w, i) => (
          <span key={i} className="text-xs text-t2">
            {i > 0 && <span className="text-t3 mr-1">,</span>}
            <span className="font-bold text-t1">{w.wicketNumber}-{w.score}</span>
            <span className="text-t3 ml-0.5">
              ({w.batsmanName}, {w.overNumber}.{w.ballInOver})
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export { FallOfWickets };
