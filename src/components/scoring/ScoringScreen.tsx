'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
import { MoreSheet } from './MoreSheet';
import { BallEditorSheet } from './BallEditorSheet';
import { WagonPromptSheet, PitchMapPromptSheet, wagonPromptDisabled } from '@/components/analytics';
import { toast } from 'sonner';
import { computeMilestoneAlerts, generateCommentary, getBatsmanMilestone } from '@/lib/intelligence';
import { freeHitPending, parseHouseRules } from '@/lib/scoring-context';
import type { ExtraType, CommentaryEvent, BallRecord, WicketType } from '@/types';

interface ScoringScreenProps {
  matchId: string;
  mutate: () => Promise<unknown>;
}

export function ScoringScreen({ matchId, mutate }: ScoringScreenProps) {
  const store = useMatchStore();
  const {
    handleScore,
    handleWicket,
    handlePenalty,
    handleUndo,
    handleRedo,
    redoAvailable,
    handleSetStriker,
    handleSetBowler,
    handleCompleteInnings,
    handleCompleteMatch,
    handleCreateInnings,
  } = useScoringHandlers({ matchId, mutate });

  const [extrasPanelOpen, setExtrasPanelOpen] = useState(false);
  const [wicketModalOpen, setWicketModalOpen] = useState(false);
  // v2 §12.6 — wicket ON an extra (run-out off a wide / no-ball)
  const [wicketExtraContext, setWicketExtraContext] = useState<{ extraType: ExtraType; extraRuns: number } | null>(null);
  // v2 §12.3/§12.5 — more actions (penalty, reduce overs, target)
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  // v2 §12.7 — ball editor (long-press an OverStrip chip)
  const [editBall, setEditBall] = useState<BallRecord | null>(null);
  // v2 §13.2/§13.3 — post-ball capture prompts (wagon wheel, pitch map)
  const [wagonBall, setWagonBall] = useState<BallRecord | null>(null);
  const [pitchBall, setPitchBall] = useState<BallRecord | null>(null);

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
    // Defensive: raw/offline innings rows can lack batting (store normalizes,
    // but the persisted state may predate that fix)
    for (const b of currentInnings.batting ?? []) {
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
      // v2 §12.1 — commentary prefixed [FH] on free-hit deliveries
      if (ball.isFreeHit) {
        setCommentary({ ...event, text: `[FH] ${event.text}` });
      } else {
        setCommentary(event);
      }
    } else if (ball.isFreeHit) {
      setCommentary({
        category: 'EXTRA',
        text: `[FH] Free-hit delivery — ${ball.runs} run${ball.runs === 1 ? '' : 's'}${ball.extraType ? ` (${ball.extraType.toLowerCase().replace('_', ' ')})` : ''}`,
        timestamp: Date.now(),
      });
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
      handleScore(0, extraType, extraRuns);
    } else {
      handleScore(0, extraType, extraRuns);
    }
  }, [handleScore, trackBatsmanRunsBefore]);

  // §12.6 — run-out on an extra delivery: open the wicket modal with context
  const onExtrasRunOut = useCallback((extraType: ExtraType, extraRuns: number) => {
    trackBatsmanRunsBefore();
    setWicketExtraContext({ extraType, extraRuns });
    setWicketModalOpen(true);
  }, [trackBatsmanRunsBefore]);

  const onWicket = useCallback(() => {
    setWicketExtraContext(null);
    setWicketModalOpen(true);
  }, []);

  const onWicketConfirm = useCallback((data: {
    wicketType: WicketType;
    dismissedPlayerId: string;
    fielderPlayerId?: string;
    runs?: number;
    extraType?: ExtraType | null;
    extraRuns?: number;
  }) => {
    setWicketModalOpen(false);
    trackBatsmanRunsBefore();
    setWicketExtraContext(null);
    handleWicket(data);
  }, [handleWicket, trackBatsmanRunsBefore]);

  const onUndo = useCallback(() => {
    handleUndo();
  }, [handleUndo]);

  // v2 §12.4 — retired batter returns (dead ball): set the pair either end
  const onReturnBatter = useCallback((playerId: string, asStriker: boolean) => {
    const s = useMatchStore.getState();
    if (!s.strikerId && !s.nonStrikerId) return;
    const striker = asStriker ? playerId : (s.strikerId ?? playerId);
    const nonStriker = asStriker ? (s.nonStrikerId ?? playerId) : playerId;
    handleSetStriker(striker, nonStriker).then(() => {
      toast.success('Retired batter is back at the crease');
    });
  }, [handleSetStriker]);

  // ── Generate commentary when lastBallResult changes ──
  const lastBallResult = store.lastBallResult;
  const lastBallResultId = lastBallResult?.ball?.id;

  // We use a ref to avoid re-triggering commentary for the same ball
  const lastCommentedBallId = useRef<string | null>(null);

  // Effect: when lastBallResult changes, generate commentary
  useEffect(() => {
    if (!lastBallResult?.ball || !currentInnings || !match) return;
    if (lastBallResult.ball.id === lastCommentedBallId.current) return;
    lastCommentedBallId.current = lastBallResult.ball.id;
    triggerCommentary(lastBallResult.ball);
  }, [lastBallResultId, currentInnings, match, triggerCommentary, lastBallResult]);

  // ── v2 §13.2/§13.3 — post-ball capture orchestration ──
  // Wagon prompt (post-boundary, 1 tap) first; the pitch map (2 taps)
  // queues behind it so a boundary with both rules on costs 3 taps total.
  const houseRules = useMemo(
    () => parseHouseRules(match?.rules ?? null),
    [match?.rules]
  );

  useEffect(() => {
    const ball = lastBallResult?.ball;
    if (!ball || !currentInnings || !match) return;
    // Only server-confirmed balls (offline queue items carry no real id)
    if (typeof ball.id !== 'string' || ball.id.startsWith('optimistic-')) return;
    // State-machine modals take priority over capture sheets this ball
    if (lastBallResult?.needsNewBatsman || lastBallResult?.needsInningsBreak || lastBallResult?.isMatchComplete) return;

    const wagonMode = houseRules?.wagonCapture ?? 'off'; // legacy matches: off
    const isBoundary = ball.runs >= 4 && ball.extraType !== 'WIDE';
    const isScoringShot = ball.runs > 0;
    const wantsWagon =
      wagonMode !== 'off' &&
      !wagonPromptDisabled() &&
      ball.wagonDirection == null &&
      (wagonMode === 'all' ? isScoringShot : isBoundary);
    const wantsPitch =
      houseRules?.pitchMapCapture === true &&
      ball.isLegalDelivery &&
      ball.pitchLength == null;

    if (wantsWagon) {
      setWagonBall(ball);
      if (wantsPitch) setPitchBall(ball); // queued — shows after the wagon tap
    } else if (wantsPitch) {
      setPitchBall(ball);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastBallResultId]);

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

      {/* Wicket modal (v2: FH gating, mankad, runs-completed, OBSTRUCTING_FIELD) */}
      <WicketModal
        open={wicketModalOpen}
        match={match}
        currentInnings={currentInnings}
        extraContext={wicketExtraContext?.extraType ?? null}
        extraRunsContext={wicketExtraContext?.extraRuns ?? 0}
        onConfirm={onWicketConfirm}
        onCancel={() => {
          setWicketModalOpen(false);
          setWicketExtraContext(null);
        }}
      />

      {/* Extras panel (v2: rich entry, remembered choices, run-out path) */}
      <ExtrasPanel
        open={extrasPanelOpen}
        match={match}
        onOpenChange={setExtrasPanelOpen}
        onConfirm={onExtrasConfirm}
        onRunOut={onExtrasRunOut}
      />

      {/* More actions (v2 §12.3/§12.5: penalty, reduce overs, target) */}
      <MoreSheet
        open={moreSheetOpen}
        match={match}
        currentInnings={currentInnings}
        onOpenChange={setMoreSheetOpen}
        onPenalty={handlePenalty}
        mutate={mutate}
      />

      {/* Ball editor (v2 §12.7: long-press an OverStrip chip) */}
      <BallEditorSheet
        open={editBall != null}
        ball={editBall}
        match={match}
        currentInnings={currentInnings}
        onOpenChange={(o) => !o && setEditBall(null)}
        mutate={mutate}
      />

      {/* v2 §13.2 — wagon wheel capture (post-boundary, 1 tap) */}
      {wagonBall && match && (
        <WagonPromptSheet
          open
          onOpenChange={(o) => {
            if (!o) setWagonBall(null);
          }}
          matchId={matchId}
          inningsId={wagonBall.inningsId}
          ballId={wagonBall.id}
          runs={wagonBall.runs}
          leftHand={
            (currentInnings?.team?.players ?? []).find((p) => p.id === wagonBall.batsmanId)?.battingHand === 'L'
          }
          onSaved={() => { mutate(); }}
        />
      )}

      {/* v2 §13.3 — pitch map capture (2 taps; queued behind the wagon) */}
      {pitchBall && !wagonBall && match && (
        <PitchMapPromptSheet
          open
          onOpenChange={(o) => {
            if (!o) setPitchBall(null);
          }}
          matchId={matchId}
          inningsId={pitchBall.inningsId}
          ballId={pitchBall.id}
          onSaved={() => { mutate(); }}
        />
      )}
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

      {/* Over strip (v2: FH rings, PP tint, split divider, long-press edit) */}
      <div className="px-3 mt-2">
        <OverStrip
          currentInnings={currentInnings}
          match={match}
          onEditBall={setEditBall}
        />
      </div>

      {/* Batsmen + Bowler cards side by side on larger screens, stacked on mobile */}
      <div className="px-3 mt-2 grid grid-cols-2 gap-2">
        <BatsmenCard match={match} currentInnings={currentInnings} onReturnBatter={onReturnBatter} />
        <BowlerCard currentInnings={currentInnings} />
      </div>

      {/* Current partnership */}
      <div className="px-3 mt-2">
        <CurrentPartnership currentInnings={currentInnings} />
      </div>

      {/* Spacer to push buttons to bottom */}
      <div className="flex-1" />

      {/* Score buttons (v2: penalty/more overflow + redo) */}
      <div className="px-3 pb-4 pt-2">
        <ScoreButtons
          onScore={onScore}
          onExtras={onExtras}
          onWicket={onWicket}
          onUndo={onUndo}
          onRedo={handleRedo}
          redoAvailable={redoAvailable}
          onMore={() => setMoreSheetOpen(true)}
        />
      </div>

      {/* Modals and panels */}
      {renderPlayerModals()}
    </div>
  );
}
