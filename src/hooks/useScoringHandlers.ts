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

    try {
      await fetch(`/api/matches/${matchId}/innings/${store.currentInnings.id}/striker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strikerId, nonStrikerId }),
      });

      store.setStrike(strikerId, nonStrikerId);
      await mutate();
    } catch {
      toast.error('Failed to set batsmen');
    }
  }, [matchId, mutate]);

  const handleSetBowler = useCallback(async (bowlerId: string) => {
    const store = useMatchStore.getState();
    if (!store.currentInnings) return;

    try {
      await fetch(`/api/matches/${matchId}/innings/${store.currentInnings.id}/bowler`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bowlerId }),
      });

      store.setBowler(bowlerId);
      await mutate();
    } catch {
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
