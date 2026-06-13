'use client';

import useSWR from 'swr';
import { useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useMatchStore } from '@/store/matchStore';
import { ScoringScreen } from '@/components/scoring/ScoringScreen';
import type { MatchData } from '@/types';

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error('Failed to fetch');
  return r.json();
});

export default function ScoringPage() {
  const params = useParams();
  const matchId = params.id as string;
  const { data: match, mutate, isLoading } = useSWR<MatchData>(`/api/matches/${matchId}`, fetcher, {
    refreshInterval: 5000,
  });

  const store = useMatchStore();
  const initialized = useRef(false);

  // Initialize store with match data (only once)
  useEffect(() => {
    if (match && !initialized.current) {
      initialized.current = true;
      store.setMatch(match);

      const currentInn = match.innings?.find((i) => !i.isCompleted);
      if (currentInn) {
        store.setCurrentInnings(currentInn);

        if (currentInn.strikerId && currentInn.nonStrikerId && currentInn.currentBowlerId) {
          store.setState('SCORING');
        } else if (currentInn.strikerId && currentInn.nonStrikerId && !currentInn.currentBowlerId) {
          store.setState('SETUP_OPENING_BOWLER');
        } else if (currentInn.strikerId && !currentInn.nonStrikerId) {
          store.setState('SETUP_OPENER_2');
        } else {
          store.setState('SETUP_OPENER_1');
        }
      } else if (match.innings?.length === 1 && match.innings[0].isCompleted) {
        // 1st innings complete, need innings break
        store.setState('INNINGS_BREAK');
      } else if (match.status === 'COMPLETED') {
        store.setState('MATCH_RESULT');
      } else if (match.status === 'UPCOMING' || match.status === 'TOSS') {
        // Match not started yet - need to create first innings
        // For now, set to opener selection
        store.setState('SETUP_OPENER_1');
      }
    }
  }, [match]);

  // Update store when match data refreshes (but don't override state machine)
  useEffect(() => {
    if (match && initialized.current) {
      store.setMatch(match);
      const currentInn = match.innings?.find((i) => !i.isCompleted);
      if (currentInn) {
        // Update innings data but don't override current state
        const currentState = store.currentState;
        if (currentState === 'SCORING' || currentState === 'PROCESSING') {
          store.setCurrentInnings(currentInn);
        }
      }
    }
  }, [match]);

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-bg-app flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-t2 text-sm">Loading match...</p>
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="min-h-dvh bg-bg-app flex items-center justify-center">
        <p className="text-t3 text-sm">Match not found</p>
      </div>
    );
  }

  return <ScoringScreen matchId={matchId} mutate={mutate} />;
}
