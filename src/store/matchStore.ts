import { create } from 'zustand';
import type { MatchStoreState, MatchData, InningsState, ScoringState, RecordBallResponse } from '@/types';

export const useMatchStore = create<MatchStoreState>((set) => ({
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
}));
