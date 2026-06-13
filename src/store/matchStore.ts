import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MatchStoreState, MatchData, InningsState, ScoringState, RecordBallResponse } from '@/types';

/**
 * GullyScore Match Store — PERSISTED for offline resilience.
 *
 * The scoring state machine is now persisted to localStorage so that
 * a page refresh during an offline session doesn't lose the scorer's state.
 * When connectivity restores, SWR will reconcile the server state.
 */
export const useMatchStore = create<MatchStoreState>()(
  persist(
    (set) => ({
      currentState: 'SETUP_OPENER_1',
      match: null,
      currentInnings: null,
      strikerId: null,
      nonStrikerId: null,
      currentBowlerId: null,
      lastBallResult: null,
      isSubmitting: false,

      setMatch: (match: MatchData) => set({ match }),
      setCurrentInnings: (innings: InningsState) => set({
        currentInnings: innings,
        strikerId: innings.strikerId ?? null,
        nonStrikerId: innings.nonStrikerId ?? null,
        currentBowlerId: innings.currentBowlerId ?? null,
      }),
      setStrike: (strikerId: string, nonStrikerId: string) => set({ strikerId, nonStrikerId }),
      setBowler: (bowlerId: string) => set({ currentBowlerId: bowlerId }),
      setState: (state: ScoringState) => set({ currentState: state }),
      setSubmitting: (v: boolean) => set({ isSubmitting: v }),
      setLastBallResult: (result: RecordBallResponse) => set({ lastBallResult: result }),
      reset: () => set({
        currentState: 'SETUP_OPENER_1',
        match: null,
        currentInnings: null,
        strikerId: null,
        nonStrikerId: null,
        currentBowlerId: null,
        lastBallResult: null,
        isSubmitting: false,
      }),
    }),
    {
      name: 'gullyscore-match-state',
      // Only persist the essential scoring state, not the submitting flag
      // (which would be stale after page reload)
      partialize: (state) => ({
        currentState: state.currentState,
        match: state.match,
        currentInnings: state.currentInnings,
        strikerId: state.strikerId,
        nonStrikerId: state.nonStrikerId,
        currentBowlerId: state.currentBowlerId,
        lastBallResult: state.lastBallResult,
      }),
    }
  )
);
