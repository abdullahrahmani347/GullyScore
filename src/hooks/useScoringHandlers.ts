'use client';

import { useCallback } from 'react';
import { useMatchStore } from '@/store/matchStore';
import { useSettingsStore } from '@/store/settingsStore';
import { toast } from 'sonner';
import type { ExtraType, WicketType } from '@/types';

interface UseScoringHandlersProps {
  matchId: string;
  mutate: () => Promise<unknown>;
}

export function useScoringHandlers({ matchId, mutate }: UseScoringHandlersProps) {
  const handleScore = useCallback(async (runs: number, extraType?: ExtraType, extraRuns?: number) => {
    const store = useMatchStore.getState();
    if (store.isSubmitting || !store.strikerId || !store.currentBowlerId || !store.currentInnings) return;

    store.setState('PROCESSING');
    store.setSubmitting(true);

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
    let newStrikerId = store.strikerId;
    let newNonStrikerId = store.nonStrikerId;
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
      const result = await fetch(`/api/matches/${matchId}/innings/${store.currentInnings.id}/balls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batsmanId: store.strikerId,
          bowlerId: store.currentBowlerId,
          runs,
          isWicket: false,
          extraType: extraType ?? null,
          extraRuns: extraRuns ?? 0,
        }),
      }).then(r => r.json());

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

    // Optimistic: update wickets count immediately
    const optimisticInnings = { ...store.currentInnings };
    store.setCurrentInnings({
      ...optimisticInnings,
      wickets: optimisticInnings.wickets + 1,
    });

    try {
      const result = await fetch(`/api/matches/${matchId}/innings/${store.currentInnings.id}/balls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batsmanId: store.strikerId,
          bowlerId: store.currentBowlerId,
          runs: 0,
          isWicket: true,
          wicketType: wicketData.wicketType,
          dismissedPlayerId: wicketData.dismissedPlayerId,
          fielderPlayerId: wicketData.fielderPlayerId ?? null,
          extraType: null,
          extraRuns: 0,
        }),
      }).then(r => r.json());

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
      const res = await fetch(`/api/matches/${matchId}/innings/${store.currentInnings.id}/balls/last`, {
        method: 'DELETE',
      });
      const result = await res.json();

      if (!result.success) {
        toast.error('Nothing to undo');
        return;
      }

      await mutate();
      store.setLastBallResult(null);
      store.setState('SCORING');
      toast.success('Last ball undone');
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
      await fetch(`/api/matches/${matchId}/innings/${store.currentInnings.id}/striker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strikerId, nonStrikerId }),
      });
      await mutate();
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
      await fetch(`/api/matches/${matchId}/innings/${store.currentInnings.id}/bowler`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bowlerId }),
      });
      await mutate();
    } catch {
      await mutate();
      toast.error('Failed to set bowler');
    }
  }, [matchId, mutate]);

  const handleCompleteInnings = useCallback(async () => {
    const store = useMatchStore.getState();
    if (!store.currentInnings) return;

    try {
      await fetch(`/api/matches/${matchId}/innings/${store.currentInnings.id}/complete`, {
        method: 'POST',
      });
      await mutate();
    } catch {
      toast.error('Failed to complete innings');
    }
  }, [matchId, mutate]);

  const handleCompleteMatch = useCallback(async () => {
    try {
      await fetch(`/api/matches/${matchId}/complete`, {
        method: 'POST',
      });
      await mutate();
    } catch {
      toast.error('Failed to complete match');
    }
  }, [matchId, mutate]);

  const handleCreateInnings = useCallback(async (teamId: string, inningsNumber: number, target?: number) => {
    try {
      const res = await fetch(`/api/matches/${matchId}/innings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, inningsNumber, target }),
      });
      const innings = await res.json();
      await mutate();
      return innings;
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
