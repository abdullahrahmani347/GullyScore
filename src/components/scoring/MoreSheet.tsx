'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { deviceFetch } from '@/lib/device';
import { toast } from 'sonner';
import type { MatchData, InningsState } from '@/types';

interface MoreSheetProps {
  open: boolean;
  match: MatchData;
  currentInnings: InningsState;
  onOpenChange: (open: boolean) => void;
  /** §12.5 — record the penalty ball locally through the normal scoring path */
  onPenalty: (penaltySide: 'batting' | 'bowling', runs: number, reason: string) => void;
  /** Strike-pair correction — patches the innings row (also recovers a degenerate pair). */
  onFixPair: (strikerId: string, nonStrikerId: string) => Promise<unknown> | void;
  /** refresh SWR after server-side changes (overs/target) */
  mutate: () => Promise<unknown>;
}

/**
 * v2 §12.3 + §12.5 — the "…" overflow sheet: PENALTY runs and the
 * organizer match settings (reduce overs / manual target with PIN).
 */
export function MoreSheet({ open, match, currentInnings, onOpenChange, onPenalty, onFixPair, mutate }: MoreSheetProps) {
  const [mode, setMode] = useState<'menu' | 'penalty' | 'reduce' | 'target' | 'pin' | 'batters'>('menu');
  const [penaltySide, setPenaltySide] = useState<'batting' | 'bowling'>('batting');
  const [penaltyRuns, setPenaltyRuns] = useState(5);
  const [penaltyReason, setPenaltyReason] = useState('');
  const [newOvers, setNewOvers] = useState(String(Math.max(1, match.totalOvers - 1)));
  const [reduceReason, setReduceReason] = useState('');
  const [manualTarget, setManualTarget] = useState(String(currentInnings.target ?? ''));
  const [targetReason, setTargetReason] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  // "Fix batters" selections
  const [fixStriker, setFixStriker] = useState<string>(currentInnings.strikerId ?? '');
  const [fixNonStriker, setFixNonStriker] = useState<string>(currentInnings.nonStrikerId ?? '');

  const isSecondInnings = currentInnings.inningsNumber === 2;
  // Degenerate pair: striker === non-striker (the frozen-rotation bug's
  // signature, or a scorer mistake) — surfaced so the scorer can fix it.
  const pairDegenerate =
    !!currentInnings.strikerId && currentInnings.strikerId === currentInnings.nonStrikerId;

  const reset = () => {
    setMode('menu');
    setPenaltySide('batting');
    setPenaltyRuns(5);
    setPenaltyReason('');
    setReduceReason('');
    setManualTarget(String(currentInnings.target ?? ''));
    setTargetReason('');
    setPin('');
    setFixStriker(currentInnings.strikerId ?? '');
    setFixNonStriker(currentInnings.nonStrikerId ?? '');
  };

  const close = (isOpen: boolean) => {
    if (!isOpen) reset();
    onOpenChange(isOpen);
  };

  // §12.5 — penalty: recorded through the same ball write path (extraType PENALTY)
  const handlePenalty = () => {
    onPenalty(penaltySide, penaltyRuns, penaltyReason.trim() || 'penalty');
    reset();
    onOpenChange(false);
  };

  // §12.3 — reduce overs (DLS)
  const handleReduce = async () => {
    const to = parseInt(newOvers, 10);
    if (!Number.isInteger(to) || to < 1) {
      toast.error('Enter a valid over count');
      return;
    }
    setBusy(true);
    try {
      const res = await deviceFetch(`/api/matches/${match.id}/overs`, {
        method: 'POST',
        body: JSON.stringify({ newTotalOvers: to, reason: reduceReason.trim() || 'overs reduced' }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not reduce overs');
        return;
      }
      await mutate();
      toast.success(
        data.newTarget != null
          ? `Overs ${data.from} → ${data.to} · Target adjusted: ${data.newTarget} (${data.method.toUpperCase()})`
          : `Overs reduced to ${data.to}`
      );
      close(false);
    } catch {
      toast.error('Could not reduce overs');
    } finally {
      setBusy(false);
    }
  };

  // §12.3 — manual target override (organizer PIN when set)
  const handleTarget = async () => {
    const t = parseInt(manualTarget, 10);
    if (!Number.isInteger(t) || t < 1) {
      toast.error('Enter a valid target');
      return;
    }
    setBusy(true);
    try {
      const res = await deviceFetch(`/api/matches/${match.id}/target`, {
        method: 'POST',
        body: JSON.stringify({ target: t, pin: pin.trim() || null, reason: targetReason.trim() || 'manual override' }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'PIN_REQUIRED') setMode('pin');
        toast.error(data.error || 'Could not override target');
        return;
      }
      await mutate();
      toast.success(`Target set to ${t}`);
      close(false);
    } catch {
      toast.error('Could not override target');
    } finally {
      setBusy(false);
    }
  };

  // Strike-pair correction: patches the innings row (authoritative pair).
  const handleFixPair = async () => {
    if (!fixStriker || !fixNonStriker || fixStriker === fixNonStriker) {
      toast.error('Pick two different batters');
      return;
    }
    setBusy(true);
    try {
      await onFixPair(fixStriker, fixNonStriker);
      await mutate();
      toast.success('Batting pair corrected — strike rotation resumes');
      close(false);
    } catch {
      toast.error('Could not update the batting pair');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent side="bottom" className="bg-bg-card border-t border-border rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-t1">
            {mode === 'menu' && 'More actions'}
            {mode === 'penalty' && 'Penalty runs'}
            {mode === 'reduce' && 'Reduce overs (DLS)'}
            {mode === 'target' && 'Manual target override'}
            {mode === 'batters' && 'Fix batting pair'}
          </SheetTitle>
          <SheetDescription className="text-t3 text-xs">
            {mode === 'menu' && 'Penalties, interruptions and organizer tools'}
            {mode === 'penalty' && '5 runs to the non-offending side — team extras, no ball consumed, no batter or bowler charged.'}
            {mode === 'reduce' && 'Rain or light failing? Reduce the remaining overs — the chase target is recomputed from the full adjustments log (DLS).'}
            {mode === 'target' && 'Override the recomputed target directly (needs the organizer PIN when one is set).'}
            {mode === 'batters' && 'Wrong batter on strike, or a stuck pair? Re-select who is on strike and who is at the other end.'}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-3">
          {mode === 'menu' && (
            <div className="space-y-2">
              {pairDegenerate && (
                <button
                  onClick={() => setMode('batters')}
                  className="w-full flex items-center gap-2 p-3 rounded-xl bg-wicket/10 border border-wicket/30 text-left"
                >
                  <span className="text-lg">⚠</span>
                  <span className="text-xs text-t1">
                    Striker and non-striker are the same player — strike rotation is
                    stuck. <span className="text-accent font-medium">Fix the pair →</span>
                  </span>
                </button>
              )}
              <div className="grid grid-cols-3 gap-2">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setMode('penalty')}
                  className="flex flex-col items-center justify-center h-20 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25"
                >
                  <span className="font-mono font-bold text-amber-400 text-lg">+5</span>
                  <span className="text-[10px] text-t2 mt-1">Penalty</span>
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setMode('reduce')}
                  className="flex flex-col items-center justify-center h-20 rounded-xl bg-bg-elevated hover:bg-bg-elevated/80 border border-border"
                >
                  <span className="font-mono font-bold text-t1 text-lg">{match.totalOvers}→?</span>
                  <span className="text-[10px] text-t2 mt-1">Reduce overs</span>
                </motion.button>
                {isSecondInnings && (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setMode('target')}
                    className="flex flex-col items-center justify-center h-20 rounded-xl bg-bg-elevated hover:bg-bg-elevated/80 border border-border"
                  >
                    <span className="font-mono font-bold text-gold text-lg">{currentInnings.target ?? '—'}</span>
                    <span className="text-[10px] text-t2 mt-1">Set target</span>
                  </motion.button>
                )}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setMode('batters')}
                  className="flex flex-col items-center justify-center h-20 rounded-xl bg-bg-elevated hover:bg-bg-elevated/80 border border-border"
                >
                  <span className="text-lg">🏏</span>
                  <span className="text-[10px] text-t2 mt-1">Fix batters</span>
                </motion.button>
              </div>
            </div>
          )}

          {mode === 'penalty' && (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-t3 uppercase tracking-wider font-medium mb-1.5">Which side gets the runs?</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setPenaltySide('batting')}
                    className={`h-12 rounded-xl text-sm font-medium transition-colors ${
                      penaltySide === 'batting' ? 'bg-accent/20 text-accent border border-accent/40' : 'bg-bg-elevated text-t2'
                    }`}
                  >
                    Batting team
                  </button>
                  <button
                    onClick={() => setPenaltySide('bowling')}
                    className={`h-12 rounded-xl text-sm font-medium transition-colors ${
                      penaltySide === 'bowling' ? 'bg-accent/20 text-accent border border-accent/40' : 'bg-bg-elevated text-t2'
                    }`}
                  >
                    Bowling team
                  </button>
                </div>
              </div>
              <div>
                <p className="text-xs text-t3 uppercase tracking-wider font-medium mb-1.5">Runs</p>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((r) => (
                    <button
                      key={r}
                      onClick={() => setPenaltyRuns(r)}
                      className={`h-11 rounded-xl font-mono font-bold transition-colors ${
                        penaltyRuns === r ? 'bg-amber-500/25 text-amber-400 border border-amber-500/40' : 'bg-bg-elevated text-t1'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <Input
                placeholder="Reason (optional) — shows in commentary"
                value={penaltyReason}
                onChange={(e) => setPenaltyReason(e.target.value)}
                maxLength={80}
              />
              <Button onClick={handlePenalty} className="w-full h-12 rounded-xl bg-amber-500 text-black hover:bg-amber-400 font-semibold">
                Apply penalty +{penaltyRuns}
              </Button>
            </div>
          )}

          {mode === 'reduce' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="font-mono text-sm text-t2 px-3 py-2 rounded-lg bg-bg-elevated">{match.totalOvers} ov</div>
                <span className="text-t3 text-sm">→</span>
                <Input
                  type="number"
                  min={1}
                  max={match.totalOvers - 1}
                  value={newOvers}
                  onChange={(e) => setNewOvers(e.target.value)}
                  className="flex-1 font-mono"
                />
              </div>
              <Input
                placeholder="Reason (rain, light, pitch…)"
                value={reduceReason}
                onChange={(e) => setReduceReason(e.target.value)}
                maxLength={80}
              />
              <p className="text-[10px] text-t3">
                Reduce-only. {isSecondInnings && currentInnings.target != null ? 'The chase target will be recomputed with the DLS resource table and shown to spectators.' : 'Applies to the innings in progress.'}
              </p>
              <Button onClick={handleReduce} disabled={busy} className="w-full h-12 rounded-xl bg-accent text-black hover:bg-accent/85 font-semibold">
                {busy ? 'Recomputing…' : `Reduce to ${newOvers} overs`}
              </Button>
            </div>
          )}

          {mode === 'target' && (
            <div className="space-y-3">
              <Input
                type="number"
                min={1}
                value={manualTarget}
                onChange={(e) => setManualTarget(e.target.value)}
                className="font-mono text-lg"
              />
              <Input
                placeholder="Reason (optional)"
                value={targetReason}
                onChange={(e) => setTargetReason(e.target.value)}
                maxLength={80}
              />
              {isSecondInnings && (
                <Input
                  type="password"
                  inputMode="numeric"
                  placeholder="Organizer PIN (if set)"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  maxLength={12}
                />
              )}
              <Button onClick={handleTarget} disabled={busy} className="w-full h-12 rounded-xl bg-gold text-black hover:bg-gold/85 font-semibold">
                {busy ? 'Setting…' : 'Set target'}
              </Button>
            </div>
          )}

          {mode === 'batters' && (
            <div className="space-y-3">
              {/* Striker picker */}
              <div>
                <p className="text-xs text-t3 uppercase tracking-wider font-medium mb-1.5">
                  On strike {fixStriker && currentInnings.team && <span className="text-accent normal-case">· {currentInnings.team.players.find((p) => p.id === fixStriker)?.name ?? ''}</span>}
                </p>
                <div className="max-h-36 overflow-y-auto rounded-xl border border-border bg-bg-app p-2 space-y-1">
                  {currentInnings.team?.players.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setFixStriker(p.id);
                        if (fixNonStriker === p.id) setFixNonStriker('');
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors ${
                        fixStriker === p.id ? 'bg-accent/20 text-accent' : 'text-t2 hover:bg-bg-elevated'
                      } ${fixNonStriker === p.id ? 'opacity-40' : ''}`}
                      disabled={fixNonStriker === p.id}
                    >
                      <span className="text-sm">{p.name}</span>
                      {fixStriker === p.id && <span className="text-[10px] font-mono uppercase">strike</span>}
                    </button>
                  ))}
                </div>
              </div>
              {/* Non-striker picker */}
              <div>
                <p className="text-xs text-t3 uppercase tracking-wider font-medium mb-1.5">
                  Other end {fixNonStriker && currentInnings.team && <span className="text-t2 normal-case">· {currentInnings.team.players.find((p) => p.id === fixNonStriker)?.name ?? ''}</span>}
                </p>
                <div className="max-h-36 overflow-y-auto rounded-xl border border-border bg-bg-app p-2 space-y-1">
                  {currentInnings.team?.players.map((p) => {
                    const bat = currentInnings.batting?.find((b) => b.playerId === p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          setFixNonStriker(p.id);
                          if (fixStriker === p.id) setFixStriker('');
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors ${
                          fixNonStriker === p.id ? 'bg-accent/20 text-accent' : 'text-t2 hover:bg-bg-elevated'
                        } ${fixStriker === p.id ? 'opacity-40' : ''}`}
                        disabled={fixStriker === p.id}
                      >
                        <span className="text-sm">{p.name}</span>
                        {bat?.isOut && <span className="text-[10px] text-wicket font-mono uppercase">out</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              {pairDegenerate && (
                <p className="text-[10px] text-wicket">
                  This pair is stuck (both ends are the same player) — correcting it
                  restores strike rotation for the next ball.
                </p>
              )}
              <Button
                onClick={handleFixPair}
                disabled={busy || !fixStriker || !fixNonStriker || fixStriker === fixNonStriker}
                className="w-full h-12 rounded-xl bg-accent text-black hover:bg-accent/85 font-semibold"
              >
                {busy ? 'Updating…' : 'Correct batting pair'}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
