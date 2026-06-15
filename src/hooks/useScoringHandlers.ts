'use client';

import { useCallback } from 'react';
import { useMatchStore } from '@/store/matchStore';
import { useSettingsStore } from '@/store/settingsStore';
import { toast } from 'sonner';
import { isOffline } from '@/lib/offline/fetch';
import {
  recordBallOffline,
  undoBallOffline,
  setStrikerOffline,
  setBowlerOffline,
  completeInningsOffline,
  completeMatchOffline,
  createInningsOffline,
} from '@/lib/offline/fetch';
import type { ExtraType, WicketType } from '@/types';

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

export function useScoringHandlers({ matchId, mutate }: UseScoringHandlersProps) {
  const handleScore = useCallback(async (runs: number, extraType?: ExtraType, extraRuns?: number) => {
    const store = useMatchStore.getState();
    if (store.isSubmitting || !store.strikerId || !store.currentBowlerId || !store.currentInnings) return;

    store.setState('PROCESSING');
    store.setSubmitting(true);

    const ballData = {
      batsmanId: store.strikerId,
      bowlerId: store.currentBowlerId,
      runs,
      isWicket: false,
      extraType: extraType ?? null,
      extraRuns: extraRuns ?? 0,
    };

    const summary = getBallSummary(ballData);

    // Optimistic update: immediately update the UI with expected runs
    const optimisticInnings = { ...store.currentInnings };
    const totalRuns = runs + (extraRuns ?? 0);
    const isWide = extraType === 'WIDE';
    const isNoBall = extraType === 'NO_BALL';
    const isLegalDelivery = !isWide && !isNoBall;
    const currentLegalBalls = optimisticInnings.currentBalls;
    const newBallInOver = isLegalDelivery ? currentLegalBalls + 1 : 0;
    const isOverComplete = isLegalDelivery && newBallInOver === 6;
    const newCurrentBalls = isOverComplete ? 0 : (isLegalDelivery ? currentLegalBalls + 1 : currentLegalBalls);
    const newCompletedOvers = optimisticInnings.completedOvers + (isOverComplete ? 1 : 0);

    // Calculate optimistic striker change
    let newStrikerId: string | null = store.strikerId;
    let newNonStrikerId: string | null = store.nonStrikerId;
    if (isLegalDelivery) {
      if (runs % 2 === 1) {
        [newStrikerId, newNonStrikerId] = [newNonStrikerId, newStrikerId];
      }
      if (isOverComplete && runs % 2 === 0) {
        [newStrikerId, newNonStrikerId] = [newNonStrikerId, newStrikerId];
      }
    }

    // Apply optimistic update to store
    store.setCurrentInnings({
      ...optimisticInnings,
      runs: optimisticInnings.runs + totalRuns,
      completedOvers: newCompletedOvers,
      currentBalls: newCurrentBalls,
      wideBalls: optimisticInnings.wideBalls + (isWide ? 1 : 0),
      noBalls: optimisticInnings.noBalls + (isNoBall ? 1 : 0),
      byes: optimisticInnings.byes + (extraType === 'BYE' ? (extraRuns ?? 0) : 0),
      legByes: optimisticInnings.legByes + (extraType === 'LEG_BYE' ? (extraRuns ?? 0) : 0),
    });
    if (newStrikerId && newNonStrikerId) {
      store.setStrike(newStrikerId, newNonStrikerId);
    }

    try {
      const { data: result, offline } = await recordBallOffline(
        matchId,
        store.currentInnings.id,
        ballData,
        summary
      );

      if (offline) {
        // Ball was recorded offline — keep optimistic state
        toast.info(`${summary} — saved offline`, { duration: 2000 });

        // Determine next state optimistically
        if (isOverComplete) {
          store.setState('OVER_COMPLETE');
        } else {
          store.setState('SCORING');
        }
      } else {
        // Online success — use server response
        if (result.error) {
          throw new Error(result.error);
        }

        store.setLastBallResult(result);
        if (result.strikerUpdate?.strikerId) {
          store.setStrike(result.strikerUpdate.strikerId, result.strikerUpdate.nonStrikerId);
        }
        await mutate();

        if (result.isMatchComplete) store.setState('MATCH_RESULT');
        else if (result.needsInningsBreak) store.setState('INNINGS_BREAK');
        else if (result.needsNewBatsman) store.setState('NEW_BATSMAN');
        else if (result.needsNewBowler) store.setState('OVER_COMPLETE');
        else store.setState('SCORING');
      }
    } catch {
      // Rollback: re-fetch actual data from server
      await mutate();
      store.setState('SCORING');
      toast.error('Failed to record ball — please try again');
    } finally {
      store.setSubmitting(false);
    }
  }, [matchId, mutate]);

  const handleWicket = useCallback(async (wicketData: { wicketType: WicketType; dismissedPlayerId: string; fielderPlayerId?: string }) => {
    const store = useMatchStore.getState();
    if (store.isSubmitting || !store.strikerId || !store.currentBowlerId || !store.currentInnings) return;

    store.setState('PROCESSING');
    store.setSubmitting(true);

    const ballData = {
      batsmanId: store.strikerId,
      bowlerId: store.currentBowlerId,
      runs: 0,
      isWicket: true,
      wicketType: wicketData.wicketType,
      dismissedPlayerId: wicketData.dismissedPlayerId,
      fielderPlayerId: wicketData.fielderPlayerId ?? null,
      extraType: null,
      extraRuns: 0,
    };

    const summary = getBallSummary(ballData);

    // Optimistic: update wickets count, over state, and batting list immediately
    const optimisticInnings = { ...store.currentInnings };
    const isLegalDelivery = true; // Wickets are always on legal deliveries
    const currentLegalBalls = optimisticInnings.currentBalls;
    const newBallInOver = currentLegalBalls + 1;
    const isOverComplete = newBallInOver === 6;
    const newCurrentBalls = isOverComplete ? 0 : newBallInOver;
    const newCompletedOvers = optimisticInnings.completedOvers + (isOverComplete ? 1 : 0);

    // Optimistic striker change for wicket: dismissed player leaves, non-striker stays
    let newStrikerId = store.nonStrikerId; // The surviving batsman becomes striker
    let newNonStrikerId = ''; // New batsman to be selected

    // If the dismissed player was the non-striker (run out), striker stays
    if (wicketData.dismissedPlayerId === store.nonStrikerId) {
      newStrikerId = store.strikerId;
      newNonStrikerId = '';
    }

    // Optimistically mark the dismissed batsman as out in the batting list
    const updatedBatting = optimisticInnings.batting.map((b) => {
      if (b.playerId === wicketData.dismissedPlayerId) {
        return { ...b, isOut: true, dismissalType: wicketData.wicketType };
      }
      return b;
    });

    store.setCurrentInnings({
      ...optimisticInnings,
      wickets: optimisticInnings.wickets + 1,
      completedOvers: newCompletedOvers,
      currentBalls: newCurrentBalls,
      batting: updatedBatting,
    });
    store.setStrike(newStrikerId || '', newNonStrikerId);

    try {
      const { data: result, offline } = await recordBallOffline(
        matchId,
        store.currentInnings.id,
        ballData,
        summary
      );

      if (offline) {
        // Wicket recorded offline — keep optimistic state
        toast.info(`WICKET — saved offline`, { duration: 2000 });

        // Store a synthetic lastBallResult so the new batsman flow
        // knows whether the over was also complete
        store.setLastBallResult({
          ball: ballData as any,
          inningsState: {
            runs: optimisticInnings.runs,
            wickets: optimisticInnings.wickets + 1,
            completedOvers: newCompletedOvers,
            currentBalls: newCurrentBalls,
            currentRunRate: 0,
            requiredRunRate: null,
            runsNeeded: null,
            ballsRemaining: null,
            isCompleted: false,
            isOverComplete,
          },
          strikerUpdate: { strikerId: newStrikerId || '', nonStrikerId: '' },
          needsNewBatsman: true,
          needsNewBowler: isOverComplete,
          needsInningsBreak: false,
          isMatchComplete: false,
        });
        store.setState('NEW_BATSMAN');
      } else {
        // Online success — use server response
        if (result.error) {
          throw new Error(result.error);
        }

        store.setLastBallResult(result);
        if (result.strikerUpdate?.strikerId) {
          store.setStrike(result.strikerUpdate.strikerId, result.strikerUpdate.nonStrikerId);
        }
        await mutate();

        if (result.isMatchComplete) store.setState('MATCH_RESULT');
        else if (result.needsInningsBreak) store.setState('INNINGS_BREAK');
        else if (result.needsNewBatsman) store.setState('NEW_BATSMAN');
        else if (result.needsNewBowler) store.setState('OVER_COMPLETE');
        else store.setState('SCORING');
      }
    } catch {
      // Rollback: re-fetch actual data
      await mutate();
      store.setState('SCORING');
      toast.error('Failed to record wicket — please try again');
    } finally {
      store.setSubmitting(false);
    }
  }, [matchId, mutate]);

  const handleUndo = useCallback(async () => {
    const store = useMatchStore.getState();
    if (store.isSubmitting || !store.currentInnings) return;

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
      } else {
        if (!result.success) {
          toast.error('Nothing to undo');
          return;
        }
        await mutate();
        store.setLastBallResult(null);
        store.setState('SCORING');
        toast.success('Last ball undone');
      }
    } catch {
      toast.error('Failed to undo — please try again');
    } finally {
      store.setSubmitting(false);
    }
  }, [matchId, mutate]);

  const handleSetStriker = useCallback(async (strikerId: string, nonStrikerId: string) => {
    const store = useMatchStore.getState();
    if (!store.currentInnings) return;

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
    if (!store.currentInnings) return;

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
    if (!store.currentInnings) return;

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
    handleUndo,
    handleSetStriker,
    handleSetBowler,
    handleCompleteInnings,
    handleCompleteMatch,
    handleCreateInnings,
  };
}
