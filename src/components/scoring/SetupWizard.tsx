'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Shield, Sparkles, X } from 'lucide-react';
import { useMatchStore } from '@/store/matchStore';
import { deviceFetch } from '@/lib/device';
import { rankBowlerSuggestions } from '@/lib/scoring-ux';
import { toast } from 'sonner';
import type { MatchData, Player, Team, InningsState } from '@/types';

interface SetupWizardProps {
  match: MatchData;
  mutate: () => Promise<unknown>;
  onCreateInnings: (teamId: string, inningsNumber: number) => Promise<unknown>;
  onSetStriker: (strikerId: string, nonStrikerId: string) => Promise<unknown>;
  onSetBowler: (bowlerId: string) => Promise<unknown>;
  /**
   * v2 §14.8 — a match whose setup was interrupted midway: the innings row
   * already exists (and possibly the openers too). The wizard then skips the
   * toss, defaults the XI to the batting side and jumps straight to the
   * earliest unfinished step — never creating a duplicate innings.
   */
  initialInnings?: InningsState | null;
}

type WizardStep = 'toss' | 'xi' | 'bowler';

interface SortableRowProps {
  player: Player;
  isGuest: boolean;
  isOpener: boolean;
  isKeeper: boolean;
  onToggleKeeper: () => void;
}

function SortableRow({ player, isGuest, isOpener, isKeeper, onToggleKeeper }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: player.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 px-2.5 py-2.5 rounded-xl border ${
        isDragging ? 'bg-bg-elevated border-accent/40 z-10 shadow-lg' : 'bg-bg-card border-border'
      } ${isOpener ? 'border-accent/30' : ''}`}
    >
      {/* Drag handle — the row itself stays tappable for keeper */}
      <button
        {...attributes}
        {...listeners}
        className="touch-none text-t3 hover:text-t1 p-1 -ml-1 cursor-grab active:cursor-grabbing"
        aria-label={`Reorder ${player.name}`}
      >
        <GripVertical size={16} />
      </button>

      <span className="text-sm font-medium text-t1 flex-1 truncate">
        {player.name}
        {isGuest && (
          <span className="ml-1.5 text-[9px] font-mono px-1 py-0.5 rounded bg-pp-gold/15 text-pp-gold border border-pp-gold/30 uppercase">
            guest
          </span>
        )}
      </span>

      {isOpener && (
        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/30 uppercase">
          opener
        </span>
      )}

      <button
        onClick={onToggleKeeper}
        title={isKeeper ? 'Remove keeper tag' : 'Tag as wicketkeeper'}
        className={`p-1.5 rounded-lg transition-colors ${
          isKeeper ? 'bg-warn/15 text-warn' : 'text-t3 hover:text-t2'
        }`}
      >
        <Shield size={14} />
      </button>
    </div>
  );
}

/**
 * v2 §14.8 — Setup wizard: toss → XI → LIVE in ≤ 4 taps.
 *
 *   1. Animated 3D coin flip (CSS, reduced-motion-safe)
 *   2. Winner picks bat/field
 *   3. XI drag-reorder (@dnd-kit) with openers marked (top 2)
 *   4. First bowler pre-suggested (engine ranking) — one tap starts LIVE
 *
 * Guest players enter here as one-off names (§17.7) and never pollute the
 * team roster: they are created with isGuest and filtered out of roster views.
 */
export function SetupWizard({ match, mutate, onCreateInnings, onSetStriker, onSetBowler, initialInnings }: SetupWizardProps) {
  const store = useMatchStore();
  // §14.8 resume path — an innings row already exists (toss decided, possibly
  // openers set). The wizard continues from the earliest unfinished step.
  const resume = initialInnings ?? null;
  const [step, setStep] = useState<WizardStep>(() =>
    resume ? (store.strikerId && store.nonStrikerId ? 'bowler' : 'xi') : 'toss'
  );
  const [busy, setBusy] = useState(false);

  // Toss state — when resuming, the batting side is already fixed by the
  // innings row, so the toss is "done" from the wizard's point of view.
  const resumeBattingTeam = resume
    ? (match.team1Id === resume.teamId ? match.team1 : match.team2)
    : null;
  const [flipping, setFlipping] = useState(false);
  const [coinSide, setCoinSide] = useState<'front' | 'back'>('front');
  const [tossWinner, setTossWinner] = useState<Team | null>(resumeBattingTeam);

  // XI state — starts from the persisted wizard order if present
  const persistedXi = store.xiOrder;
  const [xi, setXi] = useState<Player[]>(() => {
    // Resuming: the XI defaults to the BATTING side's squad (that's who we
    // are ordering). Fresh match: team1's squad.
    const fallback = resumeBattingTeam
      ? resumeBattingTeam.players.slice(0, 11)
      : match.team1.players.slice(0, 11);
    // A persisted order from a previous visit of THIS setup wins if it still
    // maps onto the squad.
    if (persistedXi && persistedXi.length > 0) {
      const all = [...match.team1.players, ...match.team2.players];
      const known = persistedXi.filter((id) => all.some((p) => p.id === id));
      if (known.length >= 2) {
        return known
          .map((id) => all.find((p) => p.id === id))
          .filter((p): p is Player => p != null);
      }
    }
    return fallback;
  });
  const [keeperId, setKeeperId] = useState<string | null>(store.keeperId ?? null);
  const [guestName, setGuestName] = useState('');
  const [guestIds, setGuestIds] = useState<Set<string>>(new Set());
  const [addingGuest, setAddingGuest] = useState(false);
  // The toss DECISION — the winner choosing FIELD means the OTHER side bats.
  // (The XI default and the innings team both derive from this.)
  const [decision, setDecision] = useState<'BAT' | 'FIELD' | null>(
    resume ? 'BAT' : null // resume: the innings row already fixes the batting side
  );

  // Batting/fielding teams AFTER the toss decision:
  //   BAT  → the winner bats
  //   FIELD → the OTHER team bats
  // (The original derivation ignored the decision — a "field first" winner
  // got the innings created for the WRONG team, and the XI defaulted to
  // team1's squad no matter who actually batted.)
  const otherTeam = tossWinner
    ? (tossWinner.id === match.team1Id ? match.team2 : match.team1)
    : null;
  const battingTeam =
    resumeBattingTeam ??
    (tossWinner && decision ? (decision === 'BAT' ? tossWinner : otherTeam) : null);
  const fieldingTeam = battingTeam
    ? (battingTeam.id === match.team1Id ? match.team2 : match.team1)
    : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setXi((items) => {
        const oldIndex = items.findIndex((p) => p.id === active.id);
        const newIndex = items.findIndex((p) => p.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  // ── Step 1: the toss ──
  const flipCoin = () => {
    if (flipping || busy) return;
    setFlipping(true);
    // Winner chosen up-front; the coin animation just reveals it
    const winner = Math.random() < 0.5 ? match.team1 : match.team2;
    const winnerIsFront = winner.id === match.team1Id;
    setTimeout(() => {
      setCoinSide(winnerIsFront ? 'front' : 'back');
    }, 400);
    setTimeout(() => {
      setFlipping(false);
      setTossWinner(winner);
      // Step 2 (bat/field pick) shows immediately after the coin lands
    }, 1450);
  };

  const pickDecision = async (decisionChoice: 'BAT' | 'FIELD') => {
    if (!tossWinner || busy) return;
    setBusy(true);
    try {
      const res = await deviceFetch(`/api/matches/${match.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          tossWinnerId: tossWinner.id,
          tossDecision: decisionChoice,
          status: 'LIVE',
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Could not save the toss');
        return;
      }
      await mutate();
      // Now the batting side is KNOWN — re-default the XI to their squad.
      // The XI was initialized to team1 at mount (the batting side is only
      // decided here), so without this the wrong team's players would be
      // offered whenever the toss winner isn't team1, or chooses to field.
      const willBat =
        decisionChoice === 'BAT'
          ? tossWinner
          : tossWinner.id === match.team1Id
            ? match.team2
            : match.team1;
      setXi((current) => {
        // Only re-default while the XI is untouched (still exactly team1's
        // top slice) — a persisted order or earlier customization wins.
        const untouched =
          current.length === Math.min(11, match.team1.players.length) &&
          current.every((p, i) => p.id === match.team1.players[i]?.id);
        return untouched ? willBat.players.slice(0, 11) : current;
      });
      setGuestIds(new Set()); // guests belong to the (now-known) batting side only
      setDecision(decisionChoice);
      setStep('xi');
    } catch {
      toast.error('Could not save the toss — check your connection');
    } finally {
      setBusy(false);
    }
  };

  // ── Step 2: guests + XI order ──
  const addGuest = async () => {
    const name = guestName.trim();
    if (!name || !battingTeam || addingGuest) return;
    setAddingGuest(true);
    try {
      const res = await deviceFetch(`/api/teams/${battingTeam.id}/players`, {
        method: 'POST',
        body: JSON.stringify({ name, isGuest: true }),
      });
      const player = (await res.json()) as Player;
      if (!res.ok) {
        toast.error((player as unknown as { error?: string }).error || 'Could not add the guest');
        return;
      }
      setXi((items) => [...items, player]);
      setGuestIds((s) => new Set(s).add(player.id));
      setGuestName('');
      toast.success(`${player.name} added as a guest — not saved to the roster`);
    } catch {
      toast.error('Could not add the guest — check your connection');
    } finally {
      setAddingGuest(false);
    }
  };

  const removeGuest = (id: string) => {
    setXi((items) => items.filter((p) => p.id !== id));
    setGuestIds((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    if (keeperId === id) setKeeperId(null);
  };

  const confirmXI = async () => {
    if (busy) return;
    if (xi.length < 2) {
      toast.error('Pick at least two batters');
      return;
    }
    setBusy(true);
    try {
      store.setXiOrder(xi.map((p) => p.id));
      store.setKeeperId(keeperId);
      setStep('bowler');
    } finally {
      setBusy(false);
    }
  };

  // ── Step 3: first bowler (pre-suggested) → LIVE ──
  const bowlerRanking = useMemo(() => {
    if (!fieldingTeam) return [];
    return rankBowlerSuggestions(fieldingTeam.players, {
      balls: [],
      bowling: [],
      currentBowlerId: null,
    });
  }, [fieldingTeam]);

  const suggestedBowler = bowlerRanking[0]
    ? fieldingTeam?.players.find((p) => p.id === bowlerRanking[0].playerId) ?? null
    : null;

  const startLive = async (bowlerId: string) => {
    if (!battingTeam || busy) return;
    setBusy(true);
    // Resuming? The openers may already be locked in the innings row — never
    // overwrite a pair the scorer already confirmed.
    const st = useMatchStore.getState();
    const strikerId = st.strikerId ?? xi[0]?.id;
    const nonStrikerId = st.nonStrikerId ?? xi[1]?.id;
    if (!strikerId || !nonStrikerId) {
      toast.error('The XI needs two openers');
      setBusy(false);
      return;
    }
    try {
      // 1. Create the first innings — or REUSE the existing row on the resume
      //    path (a second POST would duplicate innings 1).
      const innings = (resume ?? ((await onCreateInnings(battingTeam.id, 1)) as { id?: string; matchId?: string } | null)) as
        | { id?: string; matchId?: string }
        | null;
      if (!innings || !innings.id) {
        toast.error('Could not create the innings');
        return;
      }
      // Ensure the store holds the new innings BEFORE the striker/bowler
      // routes run (their guards require a same-match currentInnings).
      const s = useMatchStore.getState();
      if (s.currentInnings?.id !== innings.id) {
        s.setCurrentInnings({
          ...s.currentInnings,
          ...innings,
          matchId: match.id,
          batting: [],
          bowling: [],
          balls: [],
          partnerships: [],
        } as Parameters<typeof s.setCurrentInnings>[0]);
      }
      // 2. Openers take strike (XI top two) — skipped when the pair was
      //    already confirmed (onSetStriker is idempotent on the same pair).
      await onSetStriker(strikerId, nonStrikerId);
      // 3. First bowler
      await onSetBowler(bowlerId);
      // 4. Resume path never ran pickDecision — flip the match LIVE here so
      //    it surfaces in live hubs and match lists immediately.
      if (match.status !== 'LIVE') {
        await deviceFetch(`/api/matches/${match.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'LIVE' }),
        }).catch(() => undefined);
      }
      await mutate();
      useMatchStore.getState().setState('SCORING');
      toast.success('Match is LIVE — let the scoring begin!');
    } catch {
      toast.error('Could not start the match — try again');
    } finally {
      setBusy(false);
    }
  };

  const stepLabel =
    step === 'toss' ? 'Step 1 of 3 · Toss' : step === 'xi' ? 'Step 2 of 3 · Batting XI' : 'Step 3 of 3 · First bowler';

  return (
    <div className="min-h-dvh bg-bg-app flex flex-col px-4 py-6 max-w-md mx-auto w-full">
      {/* Header */}
      <div className="mb-5">
        <p className="text-[10px] font-mono uppercase tracking-widest text-t3">{stepLabel}</p>
        <h1 className="text-2xl font-bold text-t1 mt-1">
          {match.team1.shortName} <span className="text-t3 font-normal">vs</span> {match.team2.shortName}
        </h1>
        <p className="text-xs text-t3 mt-1">
          {match.totalOvers} overs · {match.venue ?? 'gully ground'}
        </p>
      </div>

      <AnimatePresence mode="wait">
        {/* ────────── TOSS ────────── */}
        {step === 'toss' && (
          <motion.div
            key="toss"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="flex-1 flex flex-col items-center justify-center gap-8"
          >
            {/* 3D coin */}
            <div className="coin-3d relative w-36 h-36" style={{ perspective: 600 }}>
              <div className={`coin-3d w-full h-full relative ${flipping ? 'flipping' : ''}`}>
                {/* Front = team1 */}
                <div
                  className={`coin-face front absolute inset-0 rounded-full flex flex-col items-center justify-center border-4 ${
                    coinSide === 'front' ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{
                    background: `linear-gradient(135deg, ${match.team1.color}33, ${match.team1.color}11)`,
                    borderColor: `${match.team1.color}88`,
                  }}
                >
                  <span className="text-3xl">{match.team1.emoji}</span>
                  <span className="text-sm font-bold text-t1 mt-1">{match.team1.shortName}</span>
                </div>
                {/* Back = team2 */}
                <div
                  className={`coin-face back absolute inset-0 rounded-full flex flex-col items-center justify-center border-4 ${
                    coinSide === 'back' ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{
                    background: `linear-gradient(135deg, ${match.team2.color}33, ${match.team2.color}11)`,
                    borderColor: `${match.team2.color}88`,
                  }}
                >
                  <span className="text-3xl">{match.team2.emoji}</span>
                  <span className="text-sm font-bold text-t1 mt-1">{match.team2.shortName}</span>
                </div>
              </div>
            </div>

            {!tossWinner ? (
              <button
                onClick={flipCoin}
                disabled={flipping}
                className="w-full h-14 rounded-2xl bg-accent text-black font-bold text-base hover:bg-accent/85 disabled:opacity-60"
              >
                {flipping ? 'Flipping…' : 'Flip the coin'}
              </button>
            ) : (
              <motion.div
                key="decision"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full space-y-3"
              >
                <p className="text-center text-sm text-t2">
                  <span className="text-t1 font-semibold">
                    {tossWinner.name}
                  </span>{' '}
                  won the toss. What&apos;s the call?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => pickDecision('BAT')}
                    disabled={busy}
                    className="h-14 rounded-2xl bg-bg-elevated border border-accent/40 text-t1 font-semibold hover:bg-accent/15"
                  >
                    🏏 Bat first
                  </button>
                  <button
                    onClick={() => pickDecision('FIELD')}
                    disabled={busy}
                    className="h-14 rounded-2xl bg-bg-elevated border border-accent/40 text-t1 font-semibold hover:bg-accent/15"
                  >
                    ⚾ Field first
                  </button>
                </div>
                <button
                  onClick={() => setTossWinner(null)}
                  disabled={busy}
                  className="w-full text-center text-xs text-t3 hover:text-t2 py-1"
                >
                  Re-flip the coin
                </button>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* ────────── XI ────────── */}
        {step === 'xi' && (
          <motion.div
            key="xi"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="flex-1 flex flex-col gap-3"
          >
            <p className="text-xs text-t2">
              <span className="text-t1 font-semibold">{battingTeam?.name}</span> bats first. Drag to set the
              order — the top two open.
            </p>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={xi.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5 flex-1 overflow-y-auto max-h-[46vh] pb-2">
                  {xi.map((p, i) => (
                    <div key={p.id} className="relative">
                      <SortableRow
                        player={p}
                        isGuest={guestIds.has(p.id)}
                        isOpener={i < 2}
                        isKeeper={keeperId === p.id}
                        onToggleKeeper={() => setKeeperId(keeperId === p.id ? null : p.id)}
                      />
                      {guestIds.has(p.id) && (
                        <button
                          onClick={() => removeGuest(p.id)}
                          className="absolute -right-1 -top-1 w-5 h-5 rounded-full bg-wicket text-white flex items-center justify-center"
                          title="Remove guest"
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {/* Guest entry (§17.7 forward-ref: one-off names) */}
            <div className="flex gap-2">
              <input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addGuest()}
                placeholder="Guest player name…"
                maxLength={30}
                className="flex-1 h-10 rounded-xl bg-bg-input border border-border px-3 text-sm text-t1 placeholder:text-t3"
              />
              <button
                onClick={addGuest}
                disabled={!guestName.trim() || addingGuest}
                className="h-10 px-3 rounded-xl bg-pp-gold/15 border border-pp-gold/30 text-pp-gold text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
              >
                <Plus size={13} />
                Guest
              </button>
            </div>
            <p className="text-[10px] text-t3">
              Guests are one-off players for this match — they never appear in the team roster.
            </p>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setStep('toss')}
                disabled={busy}
                className="h-12 px-4 rounded-xl border border-border text-t2 text-sm"
              >
                Back
              </button>
              <button
                onClick={confirmXI}
                disabled={busy || xi.length < 2}
                className="flex-1 h-12 rounded-xl bg-accent text-black font-bold text-sm hover:bg-accent/85 disabled:opacity-50"
              >
                Confirm XI ({xi.length})
              </button>
            </div>
          </motion.div>
        )}

        {/* ────────── BOWLER → LIVE ────────── */}
        {step === 'bowler' && (
          <motion.div
            key="bowler"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="flex-1 flex flex-col gap-3"
          >
            <p className="text-xs text-t2">
              <span className="text-t1 font-semibold">{fieldingTeam?.name}</span> opens the attack.
            </p>

            {suggestedBowler && (
              <button
                onClick={() => startLive(suggestedBowler.id)}
                disabled={busy}
                className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-accent/15 border border-accent/40 hover:bg-accent/20 text-left disabled:opacity-60"
              >
                <span className="w-11 h-11 rounded-full bg-accent/25 border border-accent/40 flex items-center justify-center">
                  <Sparkles size={18} className="text-accent" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-t1">
                    Start with {suggestedBowler.name}
                  </p>
                  <p className="text-[10px] text-accent font-mono uppercase tracking-wider mt-0.5">
                    suggested · freshest arm
                  </p>
                </div>
                <span className="text-accent font-bold text-lg">→</span>
              </button>
            )}

            <div className="flex-1 overflow-y-auto max-h-[40vh] space-y-1.5">
              {fieldingTeam?.players
                .filter((p) => p.id !== suggestedBowler?.id)
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => startLive(p.id)}
                    disabled={busy}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-bg-card border border-border hover:bg-bg-elevated text-left disabled:opacity-60"
                  >
                    {p.jerseyNumber != null && (
                      <span className="w-8 h-8 rounded-full bg-bg-elevated flex items-center justify-center text-xs font-bold text-t2 font-mono">
                        {p.jerseyNumber}
                      </span>
                    )}
                    <span className="text-sm text-t1 font-medium truncate">{p.name}</span>
                  </button>
                ))}
            </div>

            <button
              onClick={() => setStep('xi')}
              disabled={busy}
              className="h-12 rounded-xl border border-border text-t2 text-sm"
            >
              Back to XI
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {busy && (
        <div className="mt-3 flex items-center justify-center gap-2 text-xs text-t3">
          <span className="w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          Setting things up…
        </div>
      )}
    </div>
  );
}
