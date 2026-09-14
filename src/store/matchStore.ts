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

/**
 * Normalize any innings-shaped object into a full InningsState.
 * Raw rows (POST /innings returns the bare Prisma record; offline creates
 * return a stub; persisted state may predate v2 columns) can lack the
 * batting/bowling/balls/partnerships arrays — every consumer in the scoring
 * UI iterates them, so defaulting here kills the whole class of
 * "X is not iterable" crashes at the store boundary.
 */
function normalizeInnings(innings: InningsState): InningsState {
  return {
    ...innings,
    batting: Array.isArray(innings.batting) ? innings.batting : [],
    bowling: Array.isArray(innings.bowling) ? innings.bowling : [],
    balls: Array.isArray(innings.balls) ? innings.balls : [],
    partnerships: Array.isArray(innings.partnerships) ? innings.partnerships : [],
  } as InningsState;
}

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
      xiOrder: null,
      keeperId: null,

      setMatch: (match: MatchData) => set({ match }),
      setCurrentInnings: (innings: InningsState) => set({
        currentInnings: normalizeInnings(innings),
        strikerId: innings.strikerId ?? null,
        nonStrikerId: innings.nonStrikerId ?? null,
        currentBowlerId: innings.currentBowlerId ?? null,
      }),
      /** Update innings data (batting/bowling/balls/partnerships) WITHOUT resetting striker/bowler IDs.
       *  Used during SWR revalidation in transitional states (NEW_BATSMAN, OVER_COMPLETE)
       *  so the batting list refreshes while preserving the scorer's pending selections.
       */
      refreshInningsData: (innings: InningsState) => set({
        currentInnings: normalizeInnings(innings),
      }),
      setStrike: (strikerId: string, nonStrikerId: string) => set({ strikerId, nonStrikerId }),
      setBowler: (bowlerId: string) => set({ currentBowlerId: bowlerId }),
      setState: (state: ScoringState) => set({ currentState: state }),
      setSubmitting: (v: boolean) => set({ isSubmitting: v }),
      setLastBallResult: (result: RecordBallResponse | null) => set({ lastBallResult: result }),
      // v2 §14.8 — wizard XI order + keeper tag (smart-default inputs only)
      setXiOrder: (ids: string[]) => set({ xiOrder: ids }),
      setKeeperId: (id: string | null) => set({ keeperId: id }),
      reset: () => set({
        currentState: 'SETUP_OPENER_1',
        match: null,
        currentInnings: null,
        strikerId: null,
        nonStrikerId: null,
        currentBowlerId: null,
        lastBallResult: null,
        isSubmitting: false,
        xiOrder: null,
        keeperId: null,
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
        xiOrder: state.xiOrder,
        keeperId: state.keeperId,
      }),
      // Rehydrate through the same normalizer — persisted state from an
      // older build may carry shapeless innings rows.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<MatchStoreState>;
        return {
          ...current,
          ...p,
          currentInnings: p.currentInnings ? normalizeInnings(p.currentInnings) : current.currentInnings,
        };
      },
    }
  )
);
