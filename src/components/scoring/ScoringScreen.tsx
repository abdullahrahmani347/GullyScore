'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import { useMatchStore } from '@/store/matchStore';
import { useScoringHandlers } from '@/hooks/useScoringHandlers';
import { ScoreDisplay } from './ScoreDisplay';
import { ScoreButtons } from './ScoreButtons';
import { OverStrip } from './OverStrip';
import { BatsmenCard } from './BatsmenCard';
import { BowlerCard } from './BowlerCard';
import { CurrentPartnership } from './CurrentPartnership';
import { MilestoneAlertStrip } from './MilestoneAlertStrip';
import { CommentaryTicker } from './CommentaryTicker';
import { ExtrasPanel } from './ExtrasPanel';
import { WicketModal } from './WicketModal';
import { PlayerSelectModal } from './PlayerSelectModal';
import { OverCompleteModal } from './OverCompleteModal';
import { InningsBreakScreen } from './InningsBreakScreen';
import { MatchResultScreen } from './MatchResultScreen';
import { toast } from 'sonner';
import { computeMilestoneAlerts, generateCommentary, getBatsmanMilestone } from '@/lib/intelligence';
import type { ExtraType, CommentaryEvent, BallRecord } from '@/types';

interface ScoringScreenProps {
  matchId: string;
  mutate: () => Promise<unknown>;
}

export function ScoringScreen({ matchId, mutate }: ScoringScreenProps) {
  const store = useMatchStore();
  const {
    handleScore,
    handleWicket,
    handleUndo,
    handleSetStriker,
    handleSetBowler,
    handleCompleteInnings,
    handleCompleteMatch,
    handleCreateInnings,
  } = useScoringHandlers({ matchId, mutate });

  const [extrasPanelOpen, setExtrasPanelOpen] = useState(false);
  const [wicketModalOpen, setWicketModalOpen] = useState(false);

  // ── Intelligence Layer State ──
  const [commentary, setCommentary] = useState<CommentaryEvent | null>(null);
  const previousBatsmanRunsRef = useRef<Record<string, number>>({});

  const match = store.match;
  const currentInnings = store.currentInnings;
  const currentState = store.currentState;

  // ── Milestone alerts (computed every render — cheap) ──
  const milestoneAlerts = useMemo(() => {
    if (!match || !currentInnings) return [];
    return computeMilestoneAlerts(match, currentInnings, store.currentBowlerId);
  }, [match, currentInnings, store.currentBowlerId]);

  // ── Track batsman runs before each ball for milestone detection ──
  const trackBatsmanRunsBefore = useCallback(() => {
    if (!currentInnings) return;
    const runsMap: Record<string, number> = {};
    for (const b of currentInnings.batting) {
      runsMap[b.playerId] = b.runs;
    }
    previousBatsmanRunsRef.current = runsMap;
  }, [currentInnings]);

  // ── Generate commentary after a ball is recorded ──
  const triggerCommentary = useCallback((ball: BallRecord) => {
    if (!currentInnings || !match) return;
    const prevRuns = previousBatsmanRunsRef.current[ball.batsmanId];
    const event = generateCommentary(ball, currentInnings, match, prevRuns);
    if (event) {
      setCommentary(event);
    }
  }, [currentInnings, match]);

  // Get available players based on current state
  const getAvailableBatsmen = useCallback(() => {
    if (!match || !currentInnings) return [];
    const dismissedIds = currentInnings.batting
      .filter((b) => b.isOut)
      .map((b) => b.playerId);
    const currentBattingIds = [
      store.strikerId,
      store.nonStrikerId,
    ].filter(Boolean) as string[];

    return currentInnings.team.players.filter(
      (p) => !dismissedIds.includes(p.id) && !currentBattingIds.includes(p.id)
    );
  }, [match, currentInnings, store.strikerId, store.nonStrikerId]);

  const getAvailableBowlers = useCallback(() => {
    if (!match || !currentInnings) return [];
    const fieldingTeamId = match.team1Id === currentInnings.teamId ? match.team2Id : match.team1Id;
    const fieldingTeam = fieldingTeamId === match.team1Id ? match.team1 : match.team2;
    return fieldingTeam.players;
  }, [match, currentInnings]);

  const getDisabledBowlerIds = useCallback(() => {
    // Can't bowl consecutive overs - disable current bowler
    return store.currentBowlerId ? [store.currentBowlerId] : [];
  }, [store.currentBowlerId]);

  // Scoring handlers — wrapped with intelligence layer
  const onScore = useCallback((runs: number) => {
    trackBatsmanRunsBefore();
    handleScore(runs);
  }, [handleScore, trackBatsmanRunsBefore]);

  const onExtras = useCallback(() => {
    setExtrasPanelOpen(true);
  }, []);

  const onExtrasConfirm = useCallback((extraType: ExtraType, extraRuns: number) => {
    trackBatsmanRunsBefore();
    if (extraType === 'NO_BALL') {
      handleScore(extraRuns, extraType, 1);
    } else if (extraType === 'WIDE') {
      handleScore(0, extraType, extraRuns + 1);
    } else {
      handleScore(0, extraType, extraRuns);
    }
  }, [handleScore, trackBatsmanRunsBefore]);

  const onWicket = useCallback(() => {
    setWicketModalOpen(true);
  }, []);

  const onWicketConfirm = useCallback((data: { wicketType: any; dismissedPlayerId: string; fielderPlayerId?: string }) => {
    setWicketModalOpen(false);
    trackBatsmanRunsBefore();
    handleWicket(data);
  }, [handleWicket, trackBatsmanRunsBefore]);

  const onUndo = useCallback(() => {
    handleUndo();
  }, [handleUndo]);

  // ── Generate commentary when lastBallResult changes ──
  const lastBallResult = store.lastBallResult;
  const lastBallResultId = lastBallResult?.ball?.id;

  // We use a ref to avoid re-triggering commentary for the same ball
  const lastCommentedBallId = useRef<string | null>(null);

  // Effect: when lastBallResult changes, generate commentary
  useMemo(() => {
    if (!lastBallResult?.ball || !currentInnings || !match) return;
    if (lastBallResult.ball.id === lastCommentedBallId.current) return;
    lastCommentedBallId.current = lastBallResult.ball.id;
    triggerCommentary(lastBallResult.ball);
  }, [lastBallResultId, currentInnings, match, triggerCommentary, lastBallResult]);

  // Player selection handlers
  const onOpenerSelect = useCallback((playerId: string) => {
    if (currentState === 'SETUP_OPENER_1') {
      store.setStrike(playerId, store.nonStrikerId ?? '');
      store.setState('SETUP_OPENER_2');
    } else if (currentState === 'SETUP_OPENER_2') {
      store.setStrike(store.strikerId ?? '', playerId);
      handleSetStriker(store.strikerId ?? '', playerId).then(() => {
        store.setState('SETUP_OPENING_BOWLER');
      });
    }
  }, [currentState, store, handleSetStriker]);

  const onOpeningBowlerSelect = useCallback((bowlerId: string) => {
    store.setBowler(bowlerId);
    handleSetBowler(bowlerId).then(() => {
      store.setState('SCORING');
      toast.success('Match started! Let the scoring begin.');
    });
  }, [store, handleSetBowler]);

  const onNewBatsmanSelect = useCallback((playerId: string) => {
    // Set as new striker (or non-striker if striker still exists)
    const newStriker = store.nonStrikerId || playerId;
    const newNonStriker = store.nonStrikerId ? playerId : '';

    store.setStrike(newStriker, newNonStriker);
    handleSetStriker(newStriker, newNonStriker).then(() => {
      // Check if the over was also complete when the wicket fell
      // (wicket on last ball of over → need new bowler too)
      const lastResult = store.lastBallResult;
      if (lastResult?.needsNewBowler) {
        store.setState('OVER_COMPLETE');
      } else {
        store.setState('SCORING');
      }
    });
  }, [store, handleSetStriker]);

  const onOverCompleteBowlerSelect = useCallback((bowlerId: string) => {
    store.setBowler(bowlerId);
    handleSetBowler(bowlerId).then(() => {
      store.setState('SCORING');
    });
  }, [store, handleSetBowler]);

  // Render based on state
  if (!match || !currentInnings) {
    return (
      <div className="min-h-dvh bg-bg-app flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-t2 text-sm">Initializing scoring...</p>
        </div>
      </div>
    );
  }

  // Full-screen states
  if (currentState === 'INNINGS_BREAK') {
    const firstInnings = match.innings.find((i) => i.inningsNumber === 1);
    if (!firstInnings) return null;

    return (
      <InningsBreakScreen
        match={match}
        firstInnings={firstInnings}
        onCreateInnings={async (teamId, innNum, target) => {
          const result = await handleCreateInnings(teamId, innNum, target);
          if (result) {
            store.setCurrentInnings(result);
          }
          return result as any;
        }}
        onSetStriker={handleSetStriker}
        onSetBowler={handleSetBowler}
        onCompleteInnings={handleCompleteInnings}
        onStateChange={(state) => {
          // After innings break setup, move to scoring
          const updatedInnings = match.innings.find((i) => i.inningsNumber === 2 && !i.isCompleted);
          if (updatedInnings) {
            store.setCurrentInnings(updatedInnings);
            if (updatedInnings.strikerId && updatedInnings.nonStrikerId && updatedInnings.currentBowlerId) {
              store.setState('SCORING');
            }
          }
        }}
      />
    );
  }

  if (currentState === 'MATCH_RESULT') {
    return (
      <MatchResultScreen
        match={match}
        onCompleteMatch={handleCompleteMatch}
      />
    );
  }

  // Player selection modals
  const renderPlayerModals = () => (
    <>
      {/* Opener 1 selection */}
      {(currentState === 'SETUP_OPENER_1') && (
        <PlayerSelectModal
          open={true}
          players={currentInnings.team.players}
          title="Select Striker"
          description="Choose the opening batsman on strike"
          onSelect={onOpenerSelect}
          mode="batsman"
        />
      )}

      {/* Opener 2 selection */}
      {currentState === 'SETUP_OPENER_2' && (
        <PlayerSelectModal
          open={true}
          players={currentInnings.team.players.filter((p) => p.id !== store.strikerId)}
          title="Select Non-Striker"
          description="Choose the opening batsman at the other end"
          onSelect={onOpenerSelect}
          disabledPlayerIds={store.strikerId ? [store.strikerId] : []}
          mode="batsman"
        />
      )}

      {/* Opening bowler selection */}
      {currentState === 'SETUP_OPENING_BOWLER' && (
        <PlayerSelectModal
          open={true}
          players={getAvailableBowlers()}
          title="Select Opening Bowler"
          description="Choose the bowler to open the attack"
          onSelect={onOpeningBowlerSelect}
          mode="bowler"
          bowlingStats={currentInnings.bowling}
        />
      )}

      {/* New batsman after wicket */}
      {currentState === 'NEW_BATSMAN' && (
        <PlayerSelectModal
          open={true}
          players={getAvailableBatsmen()}
          title="New Batsman"
          description="Select the next batsman to come in"
          onSelect={onNewBatsmanSelect}
          mode="batsman"
        />
      )}

      {/* Over complete - select next bowler */}
      {currentState === 'OVER_COMPLETE' && (
        <OverCompleteModal
          open={true}
          match={match}
          currentInnings={currentInnings}
          onSelectBowler={onOverCompleteBowlerSelect}
        />
      )}

      {/* Wicket modal */}
      <WicketModal
        open={wicketModalOpen}
        match={match}
        currentInnings={currentInnings}
        onConfirm={onWicketConfirm}
        onCancel={() => setWicketModalOpen(false)}
      />

      {/* Extras panel */}
      <ExtrasPanel
        open={extrasPanelOpen}
        onOpenChange={setExtrasPanelOpen}
        onConfirm={onExtrasConfirm}
      />
    </>
  );

  // Main scoring UI
  const isScoring = ['SCORING', 'PROCESSING'].includes(currentState);

  return (
    <div className="min-h-dvh bg-bg-app flex flex-col">
      {/* Score display */}
      <div className="px-3 pt-3">
        <ScoreDisplay match={match} currentInnings={currentInnings} />
      </div>

      {/* Milestone alerts */}
      {milestoneAlerts.length > 0 && (
        <div className="px-3 mt-2">
          <MilestoneAlertStrip alerts={milestoneAlerts} />
        </div>
      )}

      {/* Commentary ticker */}
      <div className="px-3 mt-2">
        <CommentaryTicker
          commentary={commentary}
          onConsumed={() => setCommentary(null)}
        />
      </div>

      {/* Over strip */}
      <div className="px-3 mt-2">
        <OverStrip currentInnings={currentInnings} />
      </div>

      {/* Batsmen + Bowler cards side by side on larger screens, stacked on mobile */}
      <div className="px-3 mt-2 grid grid-cols-2 gap-2">
        <BatsmenCard match={match} currentInnings={currentInnings} />
        <BowlerCard currentInnings={currentInnings} />
      </div>

      {/* Current partnership */}
      <div className="px-3 mt-2">
        <CurrentPartnership currentInnings={currentInnings} />
      </div>

      {/* Spacer to push buttons to bottom */}
      <div className="flex-1" />

      {/* Score buttons */}
      <div className="px-3 pb-4 pt-2">
        <ScoreButtons
          onScore={onScore}
          onExtras={onExtras}
          onWicket={onWicket}
          onUndo={onUndo}
        />
      </div>

      {/* Modals and panels */}
      {renderPlayerModals()}
    </div>
  );
}
