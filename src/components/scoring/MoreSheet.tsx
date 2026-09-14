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
  /** refresh SWR after server-side changes (overs/target) */
  mutate: () => Promise<unknown>;
}

/**
 * v2 §12.3 + §12.5 — the "…" overflow sheet: PENALTY runs and the
 * organizer match settings (reduce overs / manual target with PIN).
 */
export function MoreSheet({ open, match, currentInnings, onOpenChange, onPenalty, mutate }: MoreSheetProps) {
  const [mode, setMode] = useState<'menu' | 'penalty' | 'reduce' | 'target' | 'pin'>('menu');
  const [penaltySide, setPenaltySide] = useState<'batting' | 'bowling'>('batting');
  const [penaltyRuns, setPenaltyRuns] = useState(5);
  const [penaltyReason, setPenaltyReason] = useState('');
  const [newOvers, setNewOvers] = useState(String(Math.max(1, match.totalOvers - 1)));
  const [reduceReason, setReduceReason] = useState('');
  const [manualTarget, setManualTarget] = useState(String(currentInnings.target ?? ''));
  const [targetReason, setTargetReason] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  const isSecondInnings = currentInnings.inningsNumber === 2;

  const reset = () => {
    setMode('menu');
    setPenaltySide('batting');
    setPenaltyRuns(5);
    setPenaltyReason('');
    setReduceReason('');
    setManualTarget(String(currentInnings.target ?? ''));
    setTargetReason('');
    setPin('');
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

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent side="bottom" className="bg-bg-card border-t border-border rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-t1">
            {mode === 'menu' && 'More actions'}
            {mode === 'penalty' && 'Penalty runs'}
            {mode === 'reduce' && 'Reduce overs (DLS)'}
            {mode === 'target' && 'Manual target override'}
          </SheetTitle>
          <SheetDescription className="text-t3 text-xs">
            {mode === 'menu' && 'Penalties, interruptions and organizer tools'}
            {mode === 'penalty' && '5 runs to the non-offending side — team extras, no ball consumed, no batter or bowler charged.'}
            {mode === 'reduce' && 'Rain or light failing? Reduce the remaining overs — the chase target is recomputed from the full adjustments log (DLS).'}
            {mode === 'target' && 'Override the recomputed target directly (needs the organizer PIN when one is set).'}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-3">
          {mode === 'menu' && (
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
