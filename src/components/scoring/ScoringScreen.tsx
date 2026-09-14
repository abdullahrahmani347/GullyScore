'use client';

import { useState, useCallback, useMemo, useEffect, useRef, type CSSProperties } from 'react';
import { useMatchStore } from '@/store/matchStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useFeatures } from '@/hooks/useFeatures';
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
// ── v2 §14 Scoring UX components ──
import { ProModeLayout, useProMode } from './ProModeLayout';
import { KeyboardScoring } from './KeyboardScoring';
import { VoiceScoring } from './VoiceScoring';
import { ContextFooter } from './ContextFooter';
import { OfflineQueueInspector } from './OfflineQueueInspector';
import { SettingsSheet } from './SettingsSheet';
import { SetupWizard } from './SetupWizard';
import { WagonPromptSheet, PitchMapPromptSheet, wagonPromptDisabled } from '@/components/analytics';
import { Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { computeMilestoneAlerts, generateCommentary } from '@/lib/intelligence';
import { parseHouseRules } from '@/lib/scoring-context';
import { teamTint, nextBatterSuggestion } from '@/lib/scoring-ux';
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
    handleUndoToOverStart,
    handleRedo,
    redoAvailable,
    handleSetStriker,
    handleSetBowler,
    handleCompleteInnings,
    handleCompleteMatch,
    handleCreateInnings,
  } = useScoringHandlers({ matchId, mutate });

  // ── v2 §14 wiring ──
  // §14.2 — landscape two-thumb layout (+ persisted override in settings)
  const { proModeActive } = useProMode();
  // §14.11 — voice flag (default OFF; false until the flag is confirmed ON)
  const { isEnabled } = useFeatures();
  const voiceEnabled = isEnabled('voice');
  // §14.0 — team tint for the scoring root (contrast-guarded per theme)
  const themeMode = useSettingsStore((s) => s.theme);

  const [extrasPanelOpen, setExtrasPanelOpen] = useState(false);
  const [wicketModalOpen, setWicketModalOpen] = useState(false);
  // v2 §12.6 — wicket ON an extra (run-out off a wide / no-ball)
  const [wicketExtraContext, setWicketExtraContext] = useState<{ extraType: ExtraType; extraRuns: number } | null>(null);
  // v2 §12.3/§12.5 — more actions (penalty, reduce overs, target)
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  // v2 §14.1 — the feel & layout settings sheet
  const [settingsSheetOpen, setSettingsSheetOpen] = useState(false);
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

  // v2 §14.5/§14.11 — one shared extras commit path for buttons, keyboard and
  // voice. NO_BALL: extraRuns = runs off the bat, penalty baked in as +1;
  // WIDE/BYE/LEG_BYE: extraRuns = total runs from the extra.
  const commitExtra = useCallback(
    (extraType: ExtraType, extraRuns: number) => {
      trackBatsmanRunsBefore();
      if (extraType === 'NO_BALL') {
        handleScore(extraRuns, extraType, 1);
      } else {
        handleScore(0, extraType, extraRuns);
      }
    },
    [handleScore, trackBatsmanRunsBefore]
  );

  const onExtrasConfirm = useCallback(
    (extraType: ExtraType, extraRuns: number) => commitExtra(extraType, extraRuns),
    [commitExtra]
  );

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

  // v2 §14.11 — voice wicket: the striker is the default dismissed batter
  // (caught/bowled/lbw/stumped all dismiss the striker); the ball editor can
  // correct any mis-commit afterwards. Run-outs by voice are discouraged —
  // the confirm toast lets the scorer cancel.
  const onVoiceWicket = useCallback(
    (wicketType: WicketType) => {
      const s = useMatchStore.getState();
      if (!s.strikerId) return;
      trackBatsmanRunsBefore();
      setWicketExtraContext(null);
      handleWicket({ wicketType, dismissedPlayerId: s.strikerId });
    },
    [handleWicket, trackBatsmanRunsBefore]
  );

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
  }, [lastBallResultId]);

  // Player selection handlers
  // (v2 §14.8: the old SETUP_OPENER_1/2 + SETUP_OPENING_BOWLER modal chain was
  // replaced by the SetupWizard — see the isInitialSetup branch above.)

  const onNewBatsmanSelect = useCallback((playerId: string) => {
    // [P7]/[P8]: the SURVIVOR keeps strike; the new batter takes the vacated
    // end. The survivor is derived from the WICKET BALL's Before pair — NOT
    // from store.strikerId, which under the pinned v1 [P9] quirk (or any
    // mid-state race) can hold the OUT batter. The previous logic
    // (`store.nonStrikerId || playerId`) put the NEW batter on strike and kept
    // the non-striker slot EMPTY — the striker-route POST then failed its
    // required-field validation, the innings row kept the pre-modal pair, and
    // the next ball was credited against the wrong batter.
    const balls = currentInnings?.balls ?? [];
    const lastBall = balls[balls.length - 1];
    const outId = lastBall?.isWicket ? (lastBall.dismissedPlayerId ?? lastBall.batsmanId) : null;
    const sBefore = lastBall?.strikerIdBefore ?? null;
    const nsBefore = lastBall?.nonStrikerIdBefore ?? null;
    const survivorId =
      outId && sBefore && outId === sBefore
        ? nsBefore ?? store.strikerId // striker dismissed → non-striker survived [P7]
        : outId && nsBefore && outId === nsBefore
          ? sBefore ?? store.strikerId // non-striker dismissed → striker survived [P8]
          : store.strikerId; // defensive fallback
    const newStriker = survivorId || playerId;
    const newNonStriker = survivorId ? playerId : '';

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
  }, [store, handleSetStriker, currentInnings]);

  const onOverCompleteBowlerSelect = useCallback((bowlerId: string) => {
    store.setBowler(bowlerId);
    handleSetBowler(bowlerId).then(() => {
      store.setState('SCORING');
    });
  }, [store, handleSetBowler]);

  // ── v2 §14.4 — smart default for the new-batter sheet: next XI slot ──
  // (wizard XI order wins; falls back to squad order when no wizard ran)
  const nextBatterIn = useMemo(() => {
    if (!currentInnings) return null;
    return nextBatterSuggestion(currentInnings, store.strikerId, store.nonStrikerId, store.xiOrder);
  }, [currentInnings, store.strikerId, store.nonStrikerId, store.xiOrder]);

  // ── v2 §14.0 — team tint (batting team colour at 20%, contrast-guarded
  // per theme). Set as --team-tint on the scoring root; components read the
  // CSS var so both themes get the same one-line theming.
  const tint = useMemo(() => {
    const color = currentInnings?.team?.color;
    if (!color) return 'transparent';
    return teamTint(color, themeMode === 'light' ? 'light' : 'dark');
  }, [currentInnings?.team?.color, themeMode]);

  // ── v2 §14.8 — Setup wizard replaces the old 3-modal opener chain ──
  // Any pre-LIVE setup state routes here: fresh matches (the wizard runs the
  // full toss → XI → bowler flow and creates the innings itself) as well as
  // interrupted setups (an innings row already exists — the wizard resumes at
  // the earliest unfinished step and never duplicates the row).
  const isInitialSetup =
    currentState === 'SETUP_OPENER_1' || currentState === 'SETUP_OPENER_2' || currentState === 'SETUP_OPENING_BOWLER';
  if (match && isInitialSetup) {
    const existingInnings =
      currentInnings && currentInnings.matchId === matchId ? currentInnings : null;
    return (
      <SetupWizard
        match={match}
        mutate={mutate}
        initialInnings={existingInnings}
        onCreateInnings={async (teamId, inningsNumber) => {
          if (existingInnings) return existingInnings;
          return handleCreateInnings(teamId, inningsNumber);
        }}
        onSetStriker={handleSetStriker}
        onSetBowler={handleSetBowler}
      />
    );
  }

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
      {/* New batsman after wicket */}
      {currentState === 'NEW_BATSMAN' && (
        <PlayerSelectModal
          open={true}
          players={getAvailableBatsmen()}
          title="New Batsman"
          description="Select the next batsman to come in"
          onSelect={onNewBatsmanSelect}
          mode="batsman"
          suggestedPlayerId={nextBatterIn}
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

      {/* More actions (v2 §12.3/§12.5: penalty, reduce overs, target + §14.1 settings) */}
      <MoreSheet
        open={moreSheetOpen}
        match={match}
        currentInnings={currentInnings}
        onOpenChange={setMoreSheetOpen}
        onPenalty={handlePenalty}
        onOpenSettings={() => setSettingsSheetOpen(true)}
        onFixPair={async (strikerId, nonStrikerId) => {
          // Patches the innings row (authoritative pair) + the store —
          // recovers a stuck (degenerate) pair and scorer mistakes.
          await handleSetStriker(strikerId, nonStrikerId);
        }}
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

  // v2 §14.5 — keys only land while scoring with no overlay open (player
  // modals already gate themselves via currentState).
  const anyOverlayOpen =
    extrasPanelOpen ||
    wicketModalOpen ||
    moreSheetOpen ||
    settingsSheetOpen ||
    editBall != null ||
    wagonBall != null ||
    pitchBall != null;
  const keyboardActive = currentState === 'SCORING' && !anyOverlayOpen;

  // v2 §14.5 — Esc closes the topmost overlay (KeyboardScoring keeps refs,
  // so a fresh inline function each render is fine)
  const onKeyboardEscape = () => {
    if (wicketModalOpen) {
      setWicketModalOpen(false);
      setWicketExtraContext(null);
    } else if (extrasPanelOpen) setExtrasPanelOpen(false);
    else if (moreSheetOpen) setMoreSheetOpen(false);
    else if (settingsSheetOpen) setSettingsSheetOpen(false);
    else if (editBall) setEditBall(null);
    else if (wagonBall) setWagonBall(null);
    else if (pitchBall) setPitchBall(null);
  };

  return (
    <div
      className="min-h-dvh bg-bg-app flex flex-col relative"
      style={{ '--team-tint': tint } as CSSProperties}
    >
      {proModeActive ? (
        <>
          {/* v2 §14.2 — landscape two-thumb layout */}
          <ProModeLayout
            match={match}
            currentInnings={currentInnings}
            onScore={onScore}
            onExtra={commitExtra}
            onWicket={onWicket}
            onUndo={onUndo}
            onUndoToOverStart={handleUndoToOverStart}
            onRedo={handleRedo}
            redoAvailable={redoAvailable}
            onMore={() => setMoreSheetOpen(true)}
          />
          {/* v2 §14.7 — the context strip stays pinned under both layouts */}
          <div className="px-2 pb-2">
            <ContextFooter match={match} currentInnings={currentInnings} />
          </div>
          {/* v2 §14.11 — floating voice toggle in pro mode */}
          {voiceEnabled && (
            <div className="absolute top-2 right-2 z-20">
              <VoiceScoring
                enabled={voiceEnabled}
                onRuns={onScore}
                onExtra={commitExtra}
                onWicket={onVoiceWicket}
                onUndo={onUndo}
              />
            </div>
          )}
        </>
      ) : (
        <>
          {/* v2 §14.9 — offline queue pill · v2 §14.1 — feel & layout entry */}
          <div className="flex items-center justify-between px-3 pt-2 gap-2">
            <OfflineQueueInspector matchId={matchId} />
            <button
              onClick={() => setSettingsSheetOpen(true)}
              title="Scoring feel & layout"
              aria-label="Scoring feel & layout settings"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-mono font-semibold border bg-bg-elevated text-t3 border-border hover:text-t1 transition-colors"
            >
              <Settings2 size={11} />
              feel
            </button>
          </div>

          {/* Score display */}
          <div className="px-3 pt-1">
            <ScoreDisplay match={match} currentInnings={currentInnings} />
          </div>

          {/* Milestone alerts */}
          {milestoneAlerts.length > 0 && (
            <div className="px-3 mt-2">
              <MilestoneAlertStrip alerts={milestoneAlerts} />
            </div>
          )}

          {/* Commentary ticker (v2 §14.3: long-press the row to edit the ball) */}
          <div className="px-3 mt-2">
            <CommentaryTicker
              commentary={commentary}
              onConsumed={() => setCommentary(null)}
              onEditBall={setEditBall}
              ball={lastBallResult?.ball ?? null}
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

          {/* v2 §14.11 — voice scoring toggle (flag-gated, default OFF) */}
          {voiceEnabled && (
            <div className="px-3 mt-2 flex justify-end">
              <VoiceScoring
                enabled={voiceEnabled}
                onRuns={onScore}
                onExtra={commitExtra}
                onWicket={onVoiceWicket}
                onUndo={onUndo}
              />
            </div>
          )}

          {/* Spacer to push buttons to bottom */}
          <div className="flex-1" />

          {/* v2 §14.7 — persistent context strip with over-rate */}
          <div className="px-3 pb-1">
            <ContextFooter match={match} currentInnings={currentInnings} />
          </div>

          {/* Score buttons (v2: penalty/more overflow + redo + undo badge/long-press) */}
          <div className="px-3 pb-4 pt-1">
            <ScoreButtons
              onScore={onScore}
              onExtras={onExtras}
              onWicket={onWicket}
              onUndo={onUndo}
              onUndoToOverStart={handleUndoToOverStart}
              onRedo={handleRedo}
              redoAvailable={redoAvailable}
              onMore={() => setMoreSheetOpen(true)}
            />
          </div>
        </>
      )}

      {/* Modals and panels */}
      {renderPlayerModals()}

      {/* v2 §14.1 — feel & layout settings sheet */}
      <SettingsSheet open={settingsSheetOpen} onOpenChange={setSettingsSheetOpen} />

      {/* v2 §14.5 — desktop keyboard scoring (0-6 · W · ⇧W · N · B · L · U · Esc · ?) */}
      <KeyboardScoring
        active={keyboardActive}
        onScore={onScore}
        onWicket={onWicket}
        onExtra={(extraType) => commitExtra(extraType, extraType === 'NO_BALL' ? 0 : 1)}
        onUndo={onUndo}
        onEscape={onKeyboardEscape}
      />
    </div>
  );
}
