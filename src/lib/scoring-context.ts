/**
 * GULLYSCORE v2 §12 — CLIENT SCORING CONTEXT
 * ---------------------------------------------------------------------------
 * The UI derives free-hit / powerplay / strike context from the SAME pure
 * engine the server uses (fold over the innings' event list). One code path
 * (§12.7): what the UI predicts is exactly what the server will compute.
 *
 * This module is client-safe (imports only the zero-dependency engine).
 */

import { fold, parseMatchRules, autoPowerplayOvers, powerplaySplit, type MatchRules, type InningsState as EngineState, type BallEvent } from './engine';

export { powerplaySplit };
import type { MatchData, InningsState } from '@/types';

/** Effective rules for an innings (MatchData.rules JSON over v1 parity). */
export function matchRulesFor(
  match: Pick<MatchData, 'rules' | 'maxWickets' | 'totalOvers'>,
  inningsNumber: number,
  target: number | null
): MatchRules {
  return parseMatchRules(match.rules, {
    maxWickets: match.maxWickets,
    totalOvers: match.totalOvers,
    inningsNumber,
    target,
  });
}

/** Fold an API innings (balls list) into the engine state. */
export function foldInnings(currentInnings: InningsState, match: MatchData): EngineState {
  const rules = matchRulesFor(match, currentInnings.inningsNumber, currentInnings.target ?? null);
  const events = (currentInnings.balls ?? []) as unknown as BallEvent[];
  return fold(events, rules);
}

/** §12.1 — is the NEXT delivery a free hit? */
export function freeHitPending(currentInnings: InningsState, match: MatchData): boolean {
  if (match.rules == null) return false; // v1 parity — free hits off
  return foldInnings(currentInnings, match).freeHitPending;
}

export interface PowerplayContext {
  ppOvers: number;
  active: boolean; // the current over is inside the powerplay
  completed: boolean; // powerplay fully bowled
  split: ReturnType<typeof powerplaySplit>;
}

/** §12.2 — powerplay phase context for badges / tints. */
export function powerplayContext(currentInnings: InningsState, match: MatchData): PowerplayContext | null {
  const rules = matchRulesFor(match, currentInnings.inningsNumber, currentInnings.target ?? null);
  const ppOvers = rules.powerplayOvers;
  if (ppOvers <= 0) return null;
  const state = foldInnings(currentInnings, match);
  const currentOver = state.completedOvers;
  return {
    ppOvers,
    active: currentOver < ppOvers,
    completed: currentOver >= ppOvers,
    split: powerplaySplit(state, rules),
  };
}

/** §12.10 — balls per over for displays ("4/6" vs "4/8"). */
export function ballsPerOverFor(match: MatchData): number {
  const rules = matchRulesFor(match, 1, null);
  return rules.ballsPerOver;
}

/** §12.2 auto PP helper re-export for the create form. */
export { autoPowerplayOvers };

/** §12.4 — retired-hurt batters eligible to return (not out, RH badge). */
export function retiredBatters(currentInnings: InningsState) {
  return currentInnings.batting.filter(
    (b) => !b.isOut && b.dismissalType === 'RETIRED_HURT'
  );
}

/** §12.12.19-predictive: the exact post-ball striker pair for an optimistic
 * update — fold(balls + proposed) is the same computation the server runs. */
export function predictAfterBall(
  currentInnings: InningsState,
  match: MatchData,
  proposed: BallEvent
): EngineState {
  const rules = matchRulesFor(match, currentInnings.inningsNumber, currentInnings.target ?? null);
  const events = (currentInnings.balls ?? []) as unknown as BallEvent[];
  return fold([...events, proposed], rules);
}

/** Generate the idempotency key for a new ball event (§12.7). */
export function newClientEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ce-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Parse a MatchData.rules JSON string for display (house rules sheet). */
export function parseHouseRules(rules: string | null | undefined) {
  if (rules == null) return null;
  try {
    return JSON.parse(rules);
  } catch {
    return null;
  }
}

/** Parse MatchData.adjustments for the live target banner (§12.3). */
export function latestAdjustment(adjustments: string | null | undefined) {
  if (adjustments == null) return null;
  try {
    const list = JSON.parse(adjustments);
    if (Array.isArray(list) && list.length > 0) return list[list.length - 1];
    return null;
  } catch {
    return null;
  }
}
