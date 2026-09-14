/**
 * GULLYSCORE v2 §12.7 — EVENT-SOURCED WRITE PATH (ONE CODE PATH)
 * ---------------------------------------------------------------------------
 * v1 updated aggregates incrementally per ball (BatsmanInnings / BowlerInnings /
 * Innings / Partnership each with their own hand-rolled delta logic). v2
 * collapses all of that into the single engine fold():
 *
 *   recordBall:  validate → append event → recalculate (fold + write)
 *   undoLastBall: tombstone the last event (deletedAt) → recalculate
 *   redoLastBall: un-tombstone the most recent tombstone → recalculate
 *   editBall:    patch the event → re-validate the ENTIRE sequence →
 *                bump version + MatchEditLog → recalculate
 *
 * Parity: fold() reproduces v1's stored aggregates exactly (golden fixtures),
 * so legacy matches (Match.rules null) keep identical numbers through the new
 * path — with the v1 write path's latent defects (maiden drift, striker
 * re-derivation, partnership rebuild) gone as a side effect.
 *
 * Idempotency (§12.7 invariant 16): every event may carry clientEventId
 * (unique index). A replayed offline-queue item returns the current state
 * response WITHOUT writing — replays never alter state.
 */

import { db } from '@/lib/db';
import type { RecordBallInput, RecordBallResponse, WicketType, ExtraType } from '@/types';
import { calculateCRR, calculateRRR } from './scoring-utils';
import { winProbability } from './intelligence';
import {
  fold,
  validateNext,
  replayValidate,
  parseMatchRules,
  type BallEvent,
  type MatchRules,
  type InningsState,
} from './engine';
import { recalculate } from './recalculate';

/** Thrown by the write path when validateNext/replayValidate rejects. */
export class EngineValidationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'EngineValidationError';
  }
}

export interface RecordBallInputV2 extends RecordBallInput {
  clientEventId?: string | null;
  penaltySide?: 'batting' | 'bowling' | null;
  reason?: string | null;
}

export interface BallEditPatch {
  runs?: number;
  extraRuns?: number;
  extraType?: ExtraType | null;
  isWicket?: boolean;
  wicketType?: WicketType | null;
  dismissedPlayerId?: string | null;
  fielderPlayerId?: string | null;
  reason?: string;
}

/** Full innings row + event list, loaded once per write. */
interface LoadedInnings {
  inningsId: string;
  matchId: string;
  matchRules: string | null;
  maxWickets: number;
  totalOvers: number;
  inningsNumber: number;
  target: number | null;
  events: BallEvent[];
}

/**
 * Map persisted Ball rows (meta JSON column) into engine BallEvents with
 * penaltySide/reason hydrated. Used by EVERY fold over DB balls so replay
 * validation and penalty accounting see the submitted event exactly.
 */
export function hydrateEvents(rows: { meta?: string | null }[]): BallEvent[] {
  return rows.map((b) => {
    const ev: BallEvent = { ...(b as unknown as BallEvent) };
    if (b.meta != null) {
      try {
        const meta = JSON.parse(b.meta) as { penaltySide?: string; reason?: string };
        ev.penaltySide = (meta.penaltySide as 'batting' | 'bowling' | undefined) ?? null;
        ev.reason = meta.reason ?? null;
      } catch {
        /* malformed meta — ignore */
      }
    }
    return ev;
  });
}

async function loadInnings(inningsId: string): Promise<LoadedInnings> {
  const innings = await db.innings.findUniqueOrThrow({
    where: { id: inningsId },
    include: {
      match: true,
      balls: { orderBy: { deliveryNumber: 'asc' } },
    },
  });
  return {
    inningsId: innings.id,
    matchId: innings.matchId,
    matchRules: innings.match.rules,
    maxWickets: innings.match.maxWickets,
    totalOvers: innings.match.totalOvers,
    inningsNumber: innings.inningsNumber,
    target: innings.target,
    events: hydrateEvents(innings.balls),
  };
}

function rulesFor(loaded: LoadedInnings): MatchRules {
  return parseMatchRules(loaded.matchRules, {
    maxWickets: loaded.maxWickets,
    totalOvers: loaded.totalOvers,
    inningsNumber: loaded.inningsNumber,
    target: loaded.target,
  });
}

/** Build the UI-facing response from a folded state (v1 shape preserved). */
function buildResponse(ballRow: unknown, state: InningsState, rules: MatchRules, loaded: LoadedInnings): RecordBallResponse {
  const ballsRemaining =
    loaded.inningsNumber === 2 && loaded.target != null
      ? rules.totalOvers * rules.ballsPerOver - state.legalBalls
      : null;
  // v2 §13.1 — win probability for the batting team, broadcast per ball.
  const wp = state.legalBalls > 0 || state.runs > 0
    ? Math.round(
        winProbability(state, {
          inningsNumber: rules.inningsNumber,
          totalOvers: rules.totalOvers,
          maxWickets: rules.maxWickets,
          target: rules.target,
          ballsPerOver: rules.ballsPerOver,
        }) * 10000,
      ) / 10000
    : null;
  return {
    ball: ballRow as RecordBallResponse['ball'],
    inningsState: {
      runs: state.runs,
      wickets: state.wickets,
      completedOvers: state.completedOvers,
      currentBalls: state.currentBalls,
      currentRunRate: calculateCRR(state.runs, state.completedOvers, state.currentBalls),
      requiredRunRate:
        loaded.target != null
          ? calculateRRR(loaded.target - state.runs, loaded.totalOvers, state.completedOvers, state.currentBalls)
          : null,
      runsNeeded: loaded.target != null ? loaded.target - state.runs : null,
      ballsRemaining,
      isCompleted: state.inningsComplete,
      isOverComplete: state.lastEffects?.isOverComplete ?? false,
      winProbability: wp,
    },
    strikerUpdate: {
      strikerId: state.strikerId ?? '',
      nonStrikerId: state.nonStrikerId ?? '',
    },
    needsNewBatsman: state.lastEffects?.needsNewBatsman ?? false,
    needsNewBowler: state.lastEffects?.needsNewBowler ?? false,
    needsInningsBreak: state.lastEffects?.needsInningsBreak ?? false,
    isMatchComplete: state.lastEffects?.isMatchComplete ?? false,
  };
}

// ---------------------------------------------------------------------------
// recordBall — validate → append → recalculate
// ---------------------------------------------------------------------------

export async function recordBall(
  inningsId: string,
  input: RecordBallInputV2
): Promise<RecordBallResponse> {
  const loaded = await loadInnings(inningsId);
  const rules = rulesFor(loaded);

  // --- §12.7 idempotency: replayed clientEventId returns the current state --
  if (input.clientEventId) {
    const existing = await db.ball.findUnique({ where: { clientEventId: input.clientEventId } });
    if (existing && existing.inningsId === inningsId) {
      const state = fold(loaded.events, rules);
      return buildResponse(existing, state, rules, loaded);
    }
    if (existing && existing.inningsId !== inningsId) {
      throw new EngineValidationError('VALIDATION', 'clientEventId already used in another innings.');
    }
  }

  // --- Fold the current state and validate the proposed event ----------------
  const state = fold(loaded.events, rules);

  const lastDelivery = loaded.events[loaded.events.length - 1];
  const nextDeliveryNumber = (lastDelivery?.deliveryNumber ?? 0) + 1;

  const proposed: BallEvent = {
    deliveryNumber: nextDeliveryNumber,
    batsmanId: input.batsmanId,
    bowlerId: input.bowlerId,
    runs: input.runs,
    extraRuns: input.extraRuns,
    extraType: input.extraType ?? null,
    isWicket: input.isWicket,
    wicketType: input.wicketType ?? null,
    dismissedPlayerId: input.dismissedPlayerId ?? null,
    fielderPlayerId: input.fielderPlayerId ?? null,
    strikerIdBefore: state.strikerId,
    nonStrikerIdBefore: state.nonStrikerId,
    clientEventId: input.clientEventId ?? null,
    penaltySide: input.penaltySide ?? null,
    reason: input.reason ?? null,
  };

  const check = validateNext(state, rules, proposed);
  if (!check.ok) {
    throw new EngineValidationError(check.error.code, check.error.message);
  }

  const isNoBall = proposed.extraType === 'NO_BALL';
  const isWide = proposed.extraType === 'WIDE';
  const isPenalty = proposed.extraType === 'PENALTY';
  const isLegalBall = !isNoBall && !isWide && !isPenalty;

  // --- Append the event -------------------------------------------------------
  const ball = await db.ball.create({
    data: {
      inningsId,
      overNumber: state.completedOvers,
      ballInOver: isLegalBall ? state.currentBalls + 1 : 0,
      deliveryNumber: nextDeliveryNumber,
      batsmanId: input.batsmanId,
      bowlerId: input.bowlerId,
      runs: input.runs,
      isWicket: input.isWicket,
      wicketType: input.isWicket ? input.wicketType : null,
      dismissedPlayerId: input.isWicket ? input.dismissedPlayerId : null,
      fielderPlayerId: input.isWicket && input.fielderPlayerId ? input.fielderPlayerId : null,
      extraType: input.extraType ?? null,
      extraRuns: input.extraRuns,
      isLegalDelivery: !isNoBall && !isWide && !isPenalty,
      strikerIdBefore: state.strikerId ?? input.batsmanId,
      nonStrikerIdBefore: state.nonStrikerId ?? input.batsmanId,
      // §12.1 free-hit flags
      isFreeHit: state.freeHitPending && rules.freeHitOnNoBall && !isPenalty,
      causedFreeHit: rules.freeHitOnNoBall && isNoBall,
      clientEventId: input.clientEventId ?? null,
      meta: isPenalty
        ? JSON.stringify({ penaltySide: input.penaltySide ?? 'batting', reason: input.reason ?? null })
        : input.reason
          ? JSON.stringify({ reason: input.reason })
          : null,
    },
  });

  // --- One code path: recompute every aggregate from the event log -----------
  await recalculate(inningsId);

  const finalEvents = hydrateEvents(
    await db.ball.findMany({
      where: { inningsId },
      orderBy: { deliveryNumber: 'asc' },
    })
  );
  const finalState = fold(finalEvents, rules);

  // Match bookkeeping (v1 semantics preserved)
  if (loaded.inningsNumber === 2) {
    await db.match.update({ where: { id: loaded.matchId }, data: { currentInnings: 2 } });
  }

  return buildResponse(ball, finalState, rules, loaded);
}

// ---------------------------------------------------------------------------
// undoLastBall — §12.7 soft-delete (tombstone) the last live event
// ---------------------------------------------------------------------------

export async function undoLastBall(inningsId: string): Promise<{ success: boolean }> {
  const lastLive = await db.ball.findFirst({
    where: { inningsId, deletedAt: null },
    orderBy: { deliveryNumber: 'desc' },
  });
  if (!lastLive) return { success: false };

  await db.ball.update({
    where: { id: lastLive.id },
    data: { deletedAt: new Date(), version: { increment: 1 } },
  });

  await recalculate(inningsId);
  return { success: true };
}

// ---------------------------------------------------------------------------
// redoLastBall — un-tombstone the most recent tombstone (only when it is the
// tail of the log: redo is impossible once a newer live event exists)
// ---------------------------------------------------------------------------

export async function redoLastBall(inningsId: string): Promise<{ success: boolean }> {
  const last = await db.ball.findFirst({
    where: { inningsId },
    orderBy: { deliveryNumber: 'desc' },
  });
  if (!last || last.deletedAt == null) return { success: false };

  await db.ball.update({
    where: { id: last.id },
    data: { deletedAt: null, version: { increment: 1 } },
  });

  await recalculate(inningsId);
  return { success: true };
}

// ---------------------------------------------------------------------------
// editBall — §12.7 ball editor with full-sequence re-validation
// ---------------------------------------------------------------------------

export interface EditBallResult {
  success: true;
  ballId: string;
  version: number;
  inningsState: RecordBallResponse['inningsState'];
}

export async function editBall(
  inningsId: string,
  ballId: string,
  patch: BallEditPatch
): Promise<EditBallResult> {
  const loaded = await loadInnings(inningsId);
  const rules = rulesFor(loaded);

  const target = loaded.events.find((e) => e.id === ballId && e.deletedAt == null);
  if (!target) {
    throw new EngineValidationError('VALIDATION', 'Ball not found in this innings.');
  }

  const before = { ...target };

  // --- Apply the patch ---------------------------------------------------------
  const edited: BallEvent = {
    ...target,
    runs: patch.runs ?? target.runs,
    extraRuns: patch.extraRuns ?? target.extraRuns,
    extraType: patch.extraType !== undefined ? patch.extraType : target.extraType,
    isWicket: patch.isWicket ?? target.isWicket,
    wicketType: patch.wicketType !== undefined ? patch.wicketType : target.wicketType,
    dismissedPlayerId: patch.dismissedPlayerId !== undefined ? patch.dismissedPlayerId : target.dismissedPlayerId,
    fielderPlayerId: patch.fielderPlayerId !== undefined ? patch.fielderPlayerId : target.fielderPlayerId,
    reason: patch.reason ?? null,
  };

  // --- Re-validate the ENTIRE sequence with fold() (§12.7) ---------------------
  const events = loaded.events.map((e) => (e.id === ballId ? edited : e));
  const replay = replayValidate(events, rules);
  if (!replay.ok) {
    throw new EngineValidationError(replay.error.code, replay.error.message);
  }

  // --- Persist: bump version, write the edit, audit-log it ---------------------
  const isPenalty = edited.extraType === 'PENALTY';
  await db.ball.update({
    where: { id: ballId },
    data: {
      runs: edited.runs,
      extraRuns: edited.extraRuns,
      extraType: edited.extraType ?? null,
      isWicket: edited.isWicket,
      wicketType: edited.isWicket ? edited.wicketType ?? null : null,
      dismissedPlayerId: edited.isWicket ? edited.dismissedPlayerId ?? null : null,
      fielderPlayerId: edited.isWicket ? edited.fielderPlayerId ?? null : null,
      isLegalDelivery: edited.extraType !== 'WIDE' && edited.extraType !== 'NO_BALL' && edited.extraType !== 'PENALTY',
      version: { increment: 1 },
      meta: isPenalty ? JSON.stringify({ penaltySide: 'batting', reason: patch.reason ?? null }) : null,
    },
  });

  await db.matchEditLog.create({
    data: {
      matchId: loaded.matchId,
      ballId,
      reason: patch.reason ?? null,
      before: JSON.stringify({
        runs: before.runs,
        extraRuns: before.extraRuns,
        extraType: before.extraType,
        isWicket: before.isWicket,
        wicketType: before.wicketType,
        dismissedPlayerId: before.dismissedPlayerId,
        fielderPlayerId: before.fielderPlayerId,
      }),
      after: JSON.stringify({
        runs: edited.runs,
        extraRuns: edited.extraRuns,
        extraType: edited.extraType,
        isWicket: edited.isWicket,
        wicketType: edited.wicketType,
        dismissedPlayerId: edited.dismissedPlayerId,
        fielderPlayerId: edited.fielderPlayerId,
      }),
    },
  });

  await recalculate(inningsId);

  const state = replay.value;
  return {
    success: true,
    ballId,
    version: (target.version ?? 1) + 1,
    inningsState: {
      runs: state.runs,
      wickets: state.wickets,
      completedOvers: state.completedOvers,
      currentBalls: state.currentBalls,
      currentRunRate: calculateCRR(state.runs, state.completedOvers, state.currentBalls),
      requiredRunRate:
        loaded.target != null
          ? calculateRRR(loaded.target - state.runs, loaded.totalOvers, state.completedOvers, state.currentBalls)
          : null,
      runsNeeded: loaded.target != null ? loaded.target - state.runs : null,
      ballsRemaining: null,
      isCompleted: state.inningsComplete,
      isOverComplete: state.lastEffects?.isOverComplete ?? false,
    },
  };
}
