/**
 * GullyScore Run Rate Chart Utilities
 *
 * Computes runs-per-over data from ball records for the live
 * run rate chart on the scoring screen.
 */

import type { BallRecord, InningsState } from '@/types';

export interface OverRunData {
  overNumber: number;      // 1-indexed display number
  runs: number;            // total runs in this over (incl extras)
  isCurrentOver: boolean;  // is this the in-progress over?
}

/**
 * Compute runs per completed over from ball records.
 * Also includes the current (in-progress) over as an unfilled bar.
 */
export function computeRunsPerOver(innings: InningsState): OverRunData[] {
  const balls = innings.balls;
  if (balls.length === 0) return [];

  const overs: OverRunData[] = [];

  // Completed overs (0-indexed overNumber in ball records)
  for (let overNum = 0; overNum < innings.completedOvers; overNum++) {
    const overBalls = balls.filter((b) => b.overNumber === overNum);
    const runs = overBalls.reduce((acc, b) => acc + b.runs + b.extraRuns, 0);
    overs.push({
      overNumber: overNum + 1,
      runs,
      isCurrentOver: false,
    });
  }

  // Current in-progress over
  if (innings.currentBalls > 0 || balls.some((b) => b.overNumber === innings.completedOvers)) {
    const currentOverBalls = balls.filter((b) => b.overNumber === innings.completedOvers);
    const runs = currentOverBalls.reduce((acc, b) => acc + b.runs + b.extraRuns, 0);
    overs.push({
      overNumber: innings.completedOvers + 1,
      runs,
      isCurrentOver: true,
    });
  }

  return overs;
}

/**
 * Compute the par (average) run rate per over for the innings.
 * This is totalRuns / (totalOvers for the match), which represents
 * the rate needed to use all overs.
 */
export function computeParRunRate(totalRuns: number, totalOvers: number): number {
  if (totalOvers === 0) return 0;
  return Math.round((totalRuns / totalOvers) * 10) / 10;
}

/**
 * Determine bar color based on runs in the over vs par rate.
 * - Green: above par (scoring well)
 * - Amber: near par (within 1 run of par)
 * - Red: below par (struggling)
 */
export function getBarColor(runs: number, parRate: number): string {
  if (runs >= parRate + 1) return '#00D4AA';      // accent green — above par
  if (runs >= parRate - 1) return '#FFB020';       // amber — near par
  return '#FF4444';                                 // red — below par
}

/**
 * Get ghost (1st innings comparison) data for 2nd innings chart overlay.
 */
export function computeGhostData(
  firstInningsBalls: BallRecord[],
  firstInningsCompletedOvers: number,
): OverRunData[] {
  const overs: OverRunData[] = [];

  for (let overNum = 0; overNum < firstInningsCompletedOvers; overNum++) {
    const overBalls = firstInningsBalls.filter((b) => b.overNumber === overNum);
    const runs = overBalls.reduce((acc, b) => acc + b.runs + b.extraRuns, 0);
    overs.push({
      overNumber: overNum + 1,
      runs,
      isCurrentOver: false,
    });
  }

  return overs;
}
