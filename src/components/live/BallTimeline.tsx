'use client';

/**
 * GULLYSCORE v2 §15.5 — BALL TIMELINE (spectator)
 * ---------------------------------------------------------------------------
 * Vertical ball-by-ball timeline of the current innings: per-over groups,
 * chips + one-line commentary, PP / FH / EDITED markers. Newest over at
 * the top; capped at the last 12 overs (72 balls) of live commentary.
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { generateCommentary } from '@/lib/intelligence';
import { ballChipLabel } from '@/lib/live-hub';
import { matchRulesFor } from '@/lib/scoring-context';
import type { BallRecord, InningsState, MatchData } from '@/types';

const MAX_BALLS = 72;

interface TimelineBall {
  ball: BallRecord;
  chip: { label: string; kind: string };
  commentary: string | null;
  markers: { pp: boolean; fh: boolean; edited: boolean };
}

function chipClass(kind: string): string {
  switch (kind) {
    case 'wicket':
      return 'bg-wicket text-white';
    case 'four':
      return 'bg-run-4-bg text-run-4';
    case 'six':
      return 'bg-run-6-bg text-run-6';
    case 'extra':
      return 'bg-bg-elevated text-t2';
    case 'dot':
      return 'bg-dot/40 text-t3';
    default:
      return 'bg-bg-elevated text-t1';
  }
}

export default function BallTimeline({
  match,
  currentInnings,
}: {
  match: MatchData;
  currentInnings: InningsState;
}) {
  const rules = matchRulesFor(
    match,
    currentInnings.inningsNumber,
    currentInnings.target ?? null
  );

  const overs = useMemo(() => {
    const balls = (currentInnings.balls ?? [])
      .filter((b) => b.deletedAt == null)
      .sort((a, b) => b.deliveryNumber - a.deliveryNumber)
      .slice(0, MAX_BALLS);

    const entries: TimelineBall[] = balls.map((ball) => {
      const commentary = generateCommentary(ball, currentInnings, match);
      return {
        ball,
        chip: ballChipLabel(ball),
        commentary: commentary?.text ?? null,
        markers: {
          pp: rules.powerplayOvers > 0 && ball.overNumber < rules.powerplayOvers,
          fh: ball.isFreeHit === true,
          edited: (ball.version ?? 1) > 1,
        },
      };
    });

    // Group by over, newest over first, balls in bowling order inside
    const byOver = new Map<number, TimelineBall[]>();
    for (const entry of entries) {
      const list = byOver.get(entry.ball.overNumber) ?? [];
      list.push(entry);
      byOver.set(entry.ball.overNumber, list);
    }
    return Array.from(byOver.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([overNumber, list]) => [
        overNumber,
        list.sort((a, b) => a.ball.deliveryNumber - b.ball.deliveryNumber),
      ] as [number, TimelineBall[]]);
  }, [currentInnings.balls, currentInnings, match, rules.powerplayOvers]);

  const hidden = (currentInnings.balls ?? []).filter((b) => b.deletedAt == null).length - MAX_BALLS;

  return (
    <div className="rounded-xl bg-bg-card border border-border overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border">
        <span className="text-xs font-medium text-t2 uppercase tracking-wider">
          Ball timeline
        </span>
        <span className="ml-2 text-[10px] text-t3">
          {currentInnings.team?.name} · innings {currentInnings.inningsNumber}
        </span>
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        {hidden > 0 && (
          <div className="px-3 py-1.5 text-[10px] text-t3 border-b border-border/50">
            … {hidden} earlier balls
          </div>
        )}
        {overs.map(([overNumber, balls], oi) => (
          <div key={overNumber} className={oi % 2 === 0 ? '' : 'bg-bg-app/40'}>
            <div className="px-3 pt-2 pb-1 flex items-center gap-2">
              <span className="text-[10px] font-mono font-semibold text-t3 uppercase tracking-wider">
                Over {overNumber + 1}
              </span>
              <span className="text-[10px] text-t3 font-mono">
                {balls.reduce((acc, b) => acc + b.ball.runs + b.ball.extraRuns, 0)} runs
              </span>
              {rules.powerplayOvers > 0 && overNumber < rules.powerplayOvers && (
                <span className="text-[8px] font-bold text-gold bg-gold/10 px-1 py-0.5 rounded">
                  PP
                </span>
              )}
            </div>
            {balls.map(({ ball, chip, commentary, markers }) => (
              <motion.div
                key={ball.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-start gap-2.5 px-3 py-1.5 border-t border-border/30"
              >
                <span
                  className={`flex items-center justify-center min-w-[26px] h-[26px] rounded-full text-[10px] font-bold font-mono px-1 shrink-0 ${chipClass(chip.kind)}`}
                >
                  {chip.label}
                </span>
                <span className="text-[11px] text-t2 leading-snug min-w-0 flex-1">
                  {commentary ?? (
                    <span className="font-mono">
                      {ball.runs + ball.extraRuns} run{ball.runs + ball.extraRuns === 1 ? '' : 's'}
                      {ball.extraType ? ` (${ball.extraType.toLowerCase()})` : ''}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  {markers.fh && (
                    <span className="text-[8px] font-bold text-orange-400 bg-orange-400/10 px-1 py-0.5 rounded">
                      FH
                    </span>
                  )}
                  {markers.edited && (
                    <span
                      className="text-[8px] font-bold text-t3 bg-bg-elevated px-1 py-0.5 rounded"
                      title="This ball was edited"
                    >
                      EDITED
                    </span>
                  )}
                </span>
              </motion.div>
            ))}
          </div>
        ))}
        {overs.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-t3">
            The first ball will land here.
          </div>
        )}
      </div>
    </div>
  );
}
