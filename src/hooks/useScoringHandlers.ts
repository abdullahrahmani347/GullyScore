'use client';

import { useCallback, useState } from 'react';
import { useMatchStore } from '@/store/matchStore';
import { useSettingsStore } from '@/store/settingsStore';
import { toast } from 'sonner';
import { isOffline } from '@/lib/offline/fetch';
import {
  recordBallOffline,
  undoBallOffline,
  redoBallOffline,
  setStrikerOffline,
  setBowlerOffline,
  completeInningsOffline,
  completeMatchOffline,
  createInningsOffline,
} from '@/lib/offline/fetch';
import { predictAfterBall, newClientEventId, parseHouseRules, freeHitPending } from '@/lib/scoring-context';
import { feedback } from '@/lib/feedback';
import { liveBallsInOver } from '@/lib/scoring-ux';
import type { ExtraType, WicketType, BallRecord } from '@/types';

interface UseScoringHandlersProps {
  matchId: string;
  mutate: () => Promise<unknown>;
}

/**
 * Generate a human-readable summary for a ball, used in the offline queue
 * for the recovery screen.
 */
function getBallSummary(data: {
  runs: number;
  isWicket: boolean;
  extraType?: string | null;
  extraRuns?: number;
  wicketType?: string | null;
}): string {
  if (data.isWicket) {
    return `WICKET (${data.wicketType || 'Out'})`;
  }
  if (data.extraType === 'WIDE') {
    return `Wide${data.extraRuns && data.extraRuns > 1 ? ` +${data.extraRuns - 1}` : ''}`;
  }
  if (data.extraType === 'NO_BALL') {
    return `No ball${data.runs > 0 ? ` +${data.runs}` : ''}`;
  }
  if (data.extraType === 'BYE') {
    return `Bye${data.extraRuns ? ` ${data.extraRuns}` : ''}`;
  }
  if (data.extraType === 'LEG_BYE') {
    return `Leg bye${data.extraRuns ? ` ${data.extraRuns}` : ''}`;
  }
  if (data.runs === 4) return 'FOUR';
  if (data.runs === 6) return 'SIX';
  return `${data.runs} run${data.runs !== 1 ? 's' : ''}`;
}

/** Small label helper for penalty toasts. */
function pentingSideLabel(side: 'batting' | 'bowling'): string {
  return side === 'batting' ? 'batting side' : 'bowling side';
}

export function useScoringHandlers({ matchId, mutate }: UseScoringHandlersProps) {
  // v2 §12.7 — redo appears after an undo (tail-of-log tombstone)
  const [redoAvailable, setRedoAvailable] = useState(false);

  /**
   * v2 §12.7 — every ball event carries a clientEventId (idempotency key):
   * replayed offline-queue items are deduped server-side, never double-counted.
   */
  const handleScore = useCallback(async (runs: number, extraType?: ExtraType, extraRuns?: number, opts?: { clientEventId?: string }) => {
    const store = useMatchStore.getState();
    // Cross-match guard: the persisted store can momentarily hold the PREVIOUS
    // match's players while the new match is loading. Never write a ball with
    // striker/bowler/innings IDs that don't belong to THIS match.
    if (store.isSubmitting || !store.strikerId || !store.currentBowlerId || !store.currentInnings || !store.match) return;
    if (store.match.id !== matchId || store.currentInnings.matchId !== matchId) return;

    store.setState('PROCESSING');
    store.setSubmitting(true);

    const ballData = {
      batsmanId: store.strikerId,
      bowlerId: store.currentBowlerId,
      runs,
      isWicket: false,
      extraType: extraType ?? null,
      extraRuns: extraRuns ?? 0,
      clientEventId: opts?.clientEventId ?? newClientEventId(),
    };

    const summary = getBallSummary(ballData);

    // v2 §14.1 — feel layer on the write path (four/six/wicket/run)
    if (!ballData.isWicket) {
      if (runs === 4) feedback.four();
      else if (runs === 6) feedback.six();
      else feedback.run();
    }

    // v2 §12.7 — optimistic update computed by the SAME engine the server
    // runs (fold over balls + proposed): the predicted post-ball state is
    // exactly what the server will return, including v2 strike rotation.
    const optimisticInnings = { ...store.currentInnings };
    const isWide = extraType === 'WIDE';
    const isNoBall = extraType === 'NO_BALL';
    const isPenalty = extraType === 'PENALTY';
    const isLegalDelivery = !isWide && !isNoBall && !isPenalty;
    const predicted = predictAfterBall(store.currentInnings, store.match, {
      deliveryNumber: (store.currentInnings.balls?.length ?? 0) + 1,
      batsmanId: store.strikerId,
      bowlerId: store.currentBowlerId,
      runs,
      extraRuns: extraRuns ?? 0,
      extraType: extraType ?? null,
      isWicket: false,
      wicketType: null,
      dismissedPlayerId: null,
      fielderPlayerId: null,
      strikerIdBefore: store.strikerId,
      nonStrikerIdBefore: store.nonStrikerId,
    });
    const isOverComplete = predicted.completedOvers > (optimisticInnings.completedOvers ?? 0);

    // v2 — the optimistic update also appends the ball event to the list so
    // the OverStrip / FH pill / bowler-split chips react instantly (the
    // server remains the authority; mutate() reconciles).
    const fhBefore = store.match ? freeHitPending(store.currentInnings, store.match) : false;
    const optimisticBall: BallRecord = {
      id: `optimistic-${ballData.clientEventId}`,
      inningsId: optimisticInnings.id,
      overNumber: optimisticInnings.completedOvers ?? 0,
      ballInOver: isPenalty ? 0 : predicted.currentBalls,
      deliveryNumber: (optimisticInnings.balls?.length ?? 0) + 1,
      batsmanId: store.strikerId,
      bowlerId: store.currentBowlerId,
      runs,
      extraRuns: extraRuns ?? 0,
      extraType: extraType ?? null,
      isWicket: false,
      wicketType: null,
      dismissedPlayerId: null,
      fielderPlayerId: null,
      isLegalDelivery: isLegalDelivery,
      strikerIdBefore: store.strikerId,
      nonStrikerIdBefore: store.nonStrikerId,
      causedFreeHit: isNoBall,
      isFreeHit: fhBefore,
    } as unknown as BallRecord;

    // Apply optimistic update to store (predicted aggregates = server truth)
    store.setCurrentInnings({
      ...optimisticInnings,
      runs: predicted.runs,
      wickets: predicted.wickets,
      completedOvers: predicted.completedOvers,
      currentBalls: predicted.currentBalls,
      wideBalls: predicted.wideBalls,
      noBalls: predicted.noBalls,
      byes: predicted.byes,
      legByes: predicted.legByes,
      balls: [...(optimisticInnings.balls ?? []), optimisticBall],
    });
    if (predicted.strikerId && predicted.nonStrikerId) {
      store.setStrike(predicted.strikerId, predicted.nonStrikerId);
    }

    try {
      const { data: result, offline } = await recordBallOffline(
        matchId,
        store.currentInnings.id,
        ballData,
        summary
      );

      if (offline) {
        toast.info(`${summary} — saved offline`, { duration: 2000 });
        if (isOverComplete) {
          store.setState('OVER_COMPLETE');
        } else {
          store.setState('SCORING');
        }
      } else {
        if (result.error) {
          throw new Error(result.error);
        }

        store.setLastBallResult(result);
        if (result.strikerUpdate?.strikerId) {
          store.setStrike(result.strikerUpdate.strikerId, result.strikerUpdate.nonStrikerId);
        }

        // Settle the state machine BEFORE revalidating: the page's [match]
        // effect skips the store refresh while currentState is PROCESSING
        // (the optimistic update is in flight). Revalidating first made that
        // skip permanent — the reconcile effect then never re-fired (polls
        // returned deep-equal data), so per-batter/bowler rows froze at their
        // page-load values until a manual reload. Settling first means the
        // revalidation lands with the final state and reconciles fully.
        if (result.isMatchComplete) store.setState('MATCH_RESULT');
        else if (result.needsInningsBreak) store.setState('INNINGS_BREAK');
        else if (result.needsNewBatsman) store.setState('NEW_BATSMAN');
        else if (result.needsNewBowler) store.setState('OVER_COMPLETE');
        else store.setState('SCORING');
        await mutate();
      }
    } catch (err) {
      // Rollback: settle first, then re-fetch actual data from the server
      store.setState('SCORING');
      await mutate();
      const message = err instanceof Error ? err.message : 'Failed to record ball — please try again';
      toast.error(message, { duration: 4000 });
    } finally {
      store.setSubmitting(false);
    }
  }, [matchId, mutate]);

  const handleWicket = useCallback(async (wicketData: {
    wicketType: WicketType;
    dismissedPlayerId: string;
    fielderPlayerId?: string;
    runs?: number;
    extraType?: ExtraType | null;
    extraRuns?: number;
  }) => {
    const store = useMatchStore.getState();
    // Cross-match guard: the persisted store can momentarily hold the PREVIOUS
    // match's players while the new match is loading. Never write a ball with
    // striker/bowler/innings IDs that don't belong to THIS match.
    if (store.isSubmitting || !store.strikerId || !store.currentBowlerId || !store.currentInnings || !store.match) return;
    if (store.match.id !== matchId || store.currentInnings.matchId !== matchId) return;

    store.setState('PROCESSING');
    store.setSubmitting(true);

    const ballData = {
      batsmanId: store.strikerId,
      bowlerId: store.currentBowlerId,
      runs: wicketData.runs ?? 0,
      isWicket: true,
      wicketType: wicketData.wicketType,
      dismissedPlayerId: wicketData.dismissedPlayerId,
      fielderPlayerId: wicketData.fielderPlayerId ?? null,
      extraType: wicketData.extraType ?? null,
      extraRuns: wicketData.extraRuns ?? 0,
      clientEventId: newClientEventId(),
    };

    const summary = getBallSummary(ballData);

    // v2 §14.1 — the wicket haptic + sound
    feedback.wicket();

    // v2 §12.7 — optimistic update via the engine fold (same as server)
    const optimisticInnings = { ...store.currentInnings };
    const predicted = predictAfterBall(store.currentInnings, store.match, {
      deliveryNumber: (store.currentInnings.balls?.length ?? 0) + 1,
      batsmanId: store.strikerId,
      bowlerId: store.currentBowlerId,
      runs: wicketData.runs ?? 0,
      extraRuns: wicketData.extraRuns ?? 0,
      extraType: wicketData.extraType ?? null,
      isWicket: true,
      wicketType: wicketData.wicketType,
      dismissedPlayerId: wicketData.dismissedPlayerId,
      fielderPlayerId: wicketData.fielderPlayerId ?? null,
      strikerIdBefore: store.strikerId,
      nonStrikerIdBefore: store.nonStrikerId,
    });
    const isOverComplete = predicted.completedOvers > (optimisticInnings.completedOvers ?? 0);

    // v2 — append the optimistic ball event (OverStrip/FH pill react instantly)
    const fhBeforeW = store.match ? freeHitPending(store.currentInnings, store.match) : false;
    const optimisticWicketBall: BallRecord = {
      id: `optimistic-${ballData.clientEventId}`,
      inningsId: optimisticInnings.id,
      overNumber: optimisticInnings.completedOvers ?? 0,
      ballInOver: predicted.currentBalls,
      deliveryNumber: (optimisticInnings.balls?.length ?? 0) + 1,
      batsmanId: store.strikerId,
      bowlerId: store.currentBowlerId,
      runs: wicketData.runs ?? 0,
      extraRuns: wicketData.extraRuns ?? 0,
      extraType: wicketData.extraType ?? null,
      isWicket: true,
      wicketType: wicketData.wicketType,
      dismissedPlayerId: wicketData.dismissedPlayerId,
      fielderPlayerId: wicketData.fielderPlayerId ?? null,
      isLegalDelivery: wicketData.extraType == null || wicketData.extraType === 'BYE' || wicketData.extraType === 'LEG_BYE',
      strikerIdBefore: store.strikerId,
      nonStrikerIdBefore: store.nonStrikerId,
      isFreeHit: fhBeforeW,
    } as unknown as BallRecord;

    // Optimistically mark the dismissed batsman as out in the batting list
    const updatedBatting = optimisticInnings.batting.map((b) => {
      if (b.playerId === wicketData.dismissedPlayerId) {
        return { ...b, isOut: true, dismissalType: wicketData.wicketType };
      }
      return b;
    });

    store.setCurrentInnings({
      ...optimisticInnings,
      runs: predicted.runs,
      wickets: predicted.wickets,
      completedOvers: predicted.completedOvers,
      currentBalls: predicted.currentBalls,
      batting: updatedBatting,
      balls: [...(optimisticInnings.balls ?? []), optimisticWicketBall],
    });
    store.setStrike(predicted.strikerId || '', predicted.nonStrikerId || '');

    try {
      const { data: result, offline } = await recordBallOffline(
        matchId,
        store.currentInnings.id,
        ballData,
        summary
      );

      if (offline) {
        toast.info(`WICKET — saved offline`, { duration: 2000 });

        store.setLastBallResult({
          ball: ballData as unknown as BallRecord,
          inningsState: {
            runs: predicted.runs,
            wickets: predicted.wickets,
            completedOvers: predicted.completedOvers,
            currentBalls: predicted.currentBalls,
            currentRunRate: 0,
            requiredRunRate: null,
            runsNeeded: null,
            ballsRemaining: null,
            isCompleted: predicted.inningsComplete,
            isOverComplete,
          },
          strikerUpdate: { strikerId: predicted.strikerId || '', nonStrikerId: predicted.nonStrikerId || '' },
          needsNewBatsman: predicted.lastEffects?.needsNewBatsman ?? true,
          needsNewBowler: isOverComplete,
          needsInningsBreak: predicted.lastEffects?.needsInningsBreak ?? false,
          isMatchComplete: predicted.lastEffects?.isMatchComplete ?? false,
        });
        store.setState('NEW_BATSMAN');
      } else {
        if (result.error) {
          throw new Error(result.error);
        }

        store.setLastBallResult(result);
        if (result.strikerUpdate?.strikerId) {
          store.setStrike(result.strikerUpdate.strikerId, result.strikerUpdate.nonStrikerId);
        }

        // Same ordering fix as handleScore: settle, then revalidate.
        if (result.isMatchComplete) store.setState('MATCH_RESULT');
        else if (result.needsInningsBreak) store.setState('INNINGS_BREAK');
        else if (result.needsNewBatsman) store.setState('NEW_BATSMAN');
        else if (result.needsNewBowler) store.setState('OVER_COMPLETE');
        else store.setState('SCORING');
        await mutate();
      }
    } catch (err) {
      store.setState('SCORING');
      await mutate();
      const message = err instanceof Error ? err.message : 'Failed to record wicket — please try again';
      toast.error(message, { duration: 4000 });
    } finally {
      store.setSubmitting(false);
    }
  }, [matchId, mutate]);

  /**
   * v2 §12.5 — PENALTY runs. Logged as a Ball row with extraType PENALTY:
   * team extras only, consumes no ball, no batter or bowler charged.
   */
  const handlePenalty = useCallback(async (penaltySide: 'batting' | 'bowling', runs: number, reason: string) => {
    const store = useMatchStore.getState();
    // Cross-match guard: the persisted store can momentarily hold the PREVIOUS
    // match's players while the new match is loading. Never write a ball with
    // striker/bowler/innings IDs that don't belong to THIS match.
    if (store.isSubmitting || !store.strikerId || !store.currentBowlerId || !store.currentInnings || !store.match) return;
    if (store.match.id !== matchId || store.currentInnings.matchId !== matchId) return;

    store.setState('PROCESSING');
    store.setSubmitting(true);

    const ballData = {
      batsmanId: store.strikerId,
      bowlerId: store.currentBowlerId,
      runs: 0,
      isWicket: false,
      extraType: 'PENALTY' as ExtraType,
      extraRuns: runs,
      penaltySide,
      reason,
      clientEventId: newClientEventId(),
    };

    try {
      const { data: result, offline } = await recordBallOffline(
        matchId,
        store.currentInnings.id,
        ballData,
        `PENALTY +${runs} (${penaltySide})`
      );

      if (offline) {
        toast.info(`Penalty +${runs} — saved offline`, { duration: 2000 });
        // Optimistic: batting-side penalty raises the total
        if (penaltySide === 'batting') {
          store.setCurrentInnings({
            ...store.currentInnings,
            runs: store.currentInnings.runs + runs,
          });
        }
        store.setState('SCORING');
      } else {
        if (result.error) {
          throw new Error(result.error);
        }
        store.setLastBallResult(result);
        store.setState('SCORING');
        await mutate();
        toast.success(`Penalty +${runs} to the ${pentingSideLabel(penaltySide)}${reason ? ` — ${reason}` : ''}`, { duration: 2500 });
      }
    } catch (err) {
      store.setState('SCORING');
      await mutate();
      const message = err instanceof Error ? err.message : 'Failed to record penalty';
      toast.error(message, { duration: 4000 });
    } finally {
      store.setSubmitting(false);
    }
  }, [matchId, mutate]);

  const handleUndo = useCallback(async () => {
    const store = useMatchStore.getState();
    if (store.isSubmitting || !store.currentInnings || store.currentInnings.matchId !== matchId) return;

    // If last ball was a wicket, confirm first
    if (store.lastBallResult?.ball?.isWicket && useSettingsStore.getState().confirmUndoWicket) {
      const confirmed = window.confirm('Undo the last wicket? This will restore the dismissed batsman.');
      if (!confirmed) return;
    }

    store.setSubmitting(true);
    try {
      const { data: result, offline } = await undoBallOffline(matchId, store.currentInnings.id);

      if (offline) {
        toast.info('Undo — saved offline', { duration: 2000 });
        store.setLastBallResult(null);
        store.setState('SCORING');
        setRedoAvailable(true);
        feedback.light();
      } else {
        if (!result.success) {
          toast.error('Nothing to undo');
          return;
        }
        store.setLastBallResult(null);
        store.setState('SCORING');
        setRedoAvailable(true); // §12.7 — the tombstone is the log tail
        feedback.light(); // v2 §14.1
        await mutate();
        toast.success('Last ball undone');
      }
    } catch {
      toast.error('Failed to undo — please try again');
    } finally {
      store.setSubmitting(false);
    }
  }, [matchId, mutate]);

  /**
   * v2 §14.10 — long-press undo: "undo to start of over". Repeatedly removes
   * the tail event until the CURRENT over is empty (undoing the whole over
   * the scorer just bowled). No confirmation — it is discoverable, deliberate
   * and visible in the scorecard; redo stays available per-event.
   */
  const handleUndoToOverStart = useCallback(async () => {
    const store = useMatchStore.getState();
    if (store.isSubmitting || !store.currentInnings || store.currentInnings.matchId !== matchId) return;

    const innings = store.currentInnings;
    const currentOver = innings.completedOvers;
    const inOver = liveBallsInOver(innings.balls ?? [], currentOver);
    if (inOver.length === 0) {
      toast.info(`Already at the start of over ${currentOver + 1}`);
      return;
    }

    store.setSubmitting(true);
    try {
      let undone = 0;
      for (let i = 0; i < inOver.length; i++) {
        const { data: result, offline } = await undoBallOffline(matchId, innings.id);
        if (offline) {
          undone++;
          continue;
        }
        if (!result.success) break;
        undone++;
      }
      store.setLastBallResult(null);
      store.setState('SCORING');
      setRedoAvailable(true);
      feedback.light();
      await mutate();
      toast.success(`Undone to the start of over ${currentOver + 1} (${undone} ball${undone === 1 ? '' : 's'})`);
    } catch {
      toast.error('Could not undo to the start of the over');
    } finally {
      store.setSubmitting(false);
    }
  }, [matchId, mutate]);

  /** v2 §12.7 — redo the last undone event (un-tombstones the log tail). */
  const handleRedo = useCallback(async () => {
    const store = useMatchStore.getState();
    if (store.isSubmitting || !store.currentInnings || store.currentInnings.matchId !== matchId) return;

    store.setSubmitting(true);
    try {
      const { data: result, offline } = await redoBallOffline(matchId, store.currentInnings.id);

      if (offline) {
        toast.info('Redo — saved offline', { duration: 2000 });
      } else {
        if (!result.success) {
          toast.error('Nothing to redo');
          setRedoAvailable(false);
          return;
        }
        toast.success('Ball restored');
      }
      setRedoAvailable(false);
      store.setState('SCORING');
      await mutate(); // settle-then-revalidate (same reconcile fix as handleScore)
    } catch {
      toast.error('Failed to redo — please try again');
    } finally {
      store.setSubmitting(false);
    }
  }, [matchId, mutate]);

  const handleSetStriker = useCallback(async (strikerId: string, nonStrikerId: string) => {
    const store = useMatchStore.getState();
    if (!store.currentInnings || store.currentInnings.matchId !== matchId) return;

    // Optimistic
    store.setStrike(strikerId, nonStrikerId);

    try {
      const { offline } = await setStrikerOffline(matchId, store.currentInnings.id, strikerId, nonStrikerId);

      if (offline) {
        toast.info('Batsmen updated — saved offline', { duration: 2000 });
      } else {
        await mutate();
      }
    } catch {
      await mutate();
      toast.error('Failed to set batsmen');
    }
  }, [matchId, mutate]);

  const handleSetBowler = useCallback(async (bowlerId: string) => {
    const store = useMatchStore.getState();
    if (!store.currentInnings || store.currentInnings.matchId !== matchId) return;

    // Optimistic
    store.setBowler(bowlerId);

    try {
      const { offline } = await setBowlerOffline(matchId, store.currentInnings.id, bowlerId);

      if (offline) {
        toast.info('Bowler updated — saved offline', { duration: 2000 });
      } else {
        await mutate();
      }
    } catch {
      await mutate();
      toast.error('Failed to set bowler');
    }
  }, [matchId, mutate]);

  const handleCompleteInnings = useCallback(async () => {
    const store = useMatchStore.getState();
    if (!store.currentInnings || store.currentInnings.matchId !== matchId) return;

    try {
      const { offline } = await completeInningsOffline(matchId, store.currentInnings.id);

      if (offline) {
        toast.info('Innings completed — saved offline', { duration: 2000 });
      } else {
        await mutate();
      }

      // Transition state machine to INNINGS_BREAK if not already there
      // This ensures the state machine stays consistent even when called
      // from outside the InningsBreakScreen context (e.g., recovery flow)
      const currentState = useMatchStore.getState().currentState;
      if (currentState !== 'INNINGS_BREAK' && currentState !== 'MATCH_RESULT') {
        useMatchStore.getState().setState('INNINGS_BREAK');
      }
    } catch {
      toast.error('Failed to complete innings');
    }
  }, [matchId, mutate]);

  const handleCompleteMatch = useCallback(async () => {
    try {
      const { offline } = await completeMatchOffline(matchId);

      if (offline) {
        toast.info('Match completed — saved offline', { duration: 2000 });
      } else {
        await mutate();
      }
    } catch {
      toast.error('Failed to complete match');
    }
  }, [matchId, mutate]);

  const handleCreateInnings = useCallback(async (teamId: string, inningsNumber: number, target?: number) => {
    try {
      const { data: innings, offline } = await createInningsOffline(matchId, { teamId, inningsNumber, target });

      if (offline) {
        toast.info('Innings created — saved offline', { duration: 2000 });
        return { id: 'offline', inningsNumber, teamId, target, offline: true };
      } else {
        await mutate();
        return innings;
      }
    } catch {
      toast.error('Failed to create innings');
      return null;
    }
  }, [matchId, mutate]);

  return {
    handleScore,
    handleWicket,
    handlePenalty,
    handleUndo,
    handleUndoToOverStart,
    handleRedo,
    redoAvailable,
    handleSetStriker,
    handleSetBowler,
    handleCompleteInnings,
    handleCompleteMatch,
    handleCreateInnings,
  };
}
