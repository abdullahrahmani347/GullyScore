'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { PITCH_LENGTHS, PITCH_LINES, PITCH_LENGTH_LABELS, PITCH_LINE_LABELS, type PitchLength, type PitchLine } from '@/lib/intelligence';
import { deviceFetch } from '@/lib/device';
import { toast } from 'sonner';

interface PitchMapPromptSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matchId: string;
  inningsId: string;
  ballId: string;
  onSaved?: () => void;
}

/**
 * v2 §13.3 — 2-tap pitch map capture (shown after each legal delivery when
 * rules.pitchMapCapture is on): tap 1 = length, tap 2 = line → PATCH
 * Ball.pitchLength + Ball.pitchLine (metadata-only path).
 */
export function PitchMapPromptSheet({
  open,
  onOpenChange,
  matchId,
  inningsId,
  ballId,
  onSaved,
}: PitchMapPromptSheetProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [length, setLength] = useState<PitchLength | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep(1);
    setLength(null);
    setBusy(false);
  };

  const close = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const handleLine = async (line: PitchLine) => {
    if (!length || busy) return;
    setBusy(true);
    try {
      const res = await deviceFetch(
        `/api/matches/${matchId}/innings/${inningsId}/balls/${ballId}`,
        { method: 'PATCH', body: JSON.stringify({ pitchLength: length, pitchLine: line }) }
      );
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to save');
      toast.success(`${PITCH_LENGTH_LABELS[length]} · ${PITCH_LINE_LABELS[line]}`, { duration: 1200 });
      close(false);
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save pitch');
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !busy && close(o)}>
      <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-6 pt-3 max-w-md mx-auto">
        <SheetHeader className="pb-1">
          <SheetTitle className="text-base text-t1">
            {step === 1 ? 'Where did it pitch?' : 'And the line?'}
          </SheetTitle>
          <SheetDescription className="text-xs text-t3">
            {step === 1
              ? 'Tap 1 of 2 — length'
              : `${PITCH_LENGTH_LABELS[length!]} — now tap the line`}
          </SheetDescription>
        </SheetHeader>

        {step === 1 && (
          <div className="grid grid-cols-5 gap-1.5 py-2">
            {PITCH_LENGTHS.map((l) => (
              <button
                key={l}
                disabled={busy}
                onClick={() => { setLength(l); setStep(2); }}
                className="flex flex-col items-center justify-center h-14 rounded-xl border border-border bg-bg-elevated text-[10px] font-medium text-t2 hover:border-accent/40 hover:text-accent active:scale-95 transition-all"
              >
                {PITCH_LENGTH_LABELS[l]}
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-5 gap-1.5 py-2">
            {PITCH_LINES.map((l) => (
              <button
                key={l}
                disabled={busy}
                onClick={() => handleLine(l)}
                className="flex flex-col items-center justify-center h-14 rounded-xl border border-border bg-bg-elevated text-[10px] font-medium text-t2 hover:border-accent/40 hover:text-accent active:scale-95 transition-all"
              >
                {PITCH_LINE_LABELS[l].replace('Wide off', 'W-off')}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          {step === 2 && (
            <button
              onClick={() => setStep(1)}
              disabled={busy}
              className="text-[11px] text-t3 hover:text-t2 px-2 py-1"
            >
              ← Back
            </button>
          )}
          <button
            onClick={() => close(false)}
            disabled={busy}
            className="text-[11px] text-t3 hover:text-t1 px-3 py-1.5 rounded-lg border border-border transition-colors ml-auto"
          >
            Skip
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
