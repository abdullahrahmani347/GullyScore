'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { compassToXY, wagonAngle, WAGON_DIRECTIONS, WAGON_LABELS, type WagonDirection } from '@/lib/intelligence';
import { deviceFetch } from '@/lib/device';
import { toast } from 'sonner';

const DONT_ASK_KEY = 'gs-wagon-dont-ask';

/** §13.2 — "Don't ask again" is a device-level preference (localStorage). */
export function wagonPromptDisabled(): boolean {
  try {
    return localStorage.getItem(DONT_ASK_KEY) === '1';
  } catch {
    return false;
  }
}

interface WagonPromptSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matchId: string;
  inningsId: string;
  ballId: string;
  /** runs off the bat of the boundary just scored (for spoke preview) */
  runs: number;
  leftHand?: boolean;
  onSaved?: () => void;
}

/**
 * v2 §13.2 — post-boundary wagon capture: an 8-sector compass, ONE tap to
 * record the direction (Ball.wagonDirection via the metadata-only PATCH).
 * Skippable per ball, or "don't ask again" for the device.
 */
export function WagonPromptSheet({
  open,
  onOpenChange,
  matchId,
  inningsId,
  ballId,
  runs,
  leftHand = false,
  onSaved,
}: WagonPromptSheetProps) {
  const [busy, setBusy] = useState(false);
  const [dontAsk, setDontAsk] = useState(false);

  const handleDirection = async (dir: WagonDirection) => {
    setBusy(true);
    try {
      const res = await deviceFetch(
        `/api/matches/${matchId}/innings/${inningsId}/balls/${ballId}`,
        { method: 'PATCH', body: JSON.stringify({ wagonDirection: dir }) }
      );
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to save');
      if (dontAsk) {
        try { localStorage.setItem(DONT_ASK_KEY, '1'); } catch {}
      }
      toast.success(`${WAGON_LABELS[dir]} — ${runs} runs`, { duration: 1200 });
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save direction');
    } finally {
      setBusy(false);
    }
  };

  const handleSkip = () => {
    if (dontAsk) {
      try { localStorage.setItem(DONT_ASK_KEY, '1'); } catch {}
    }
    onOpenChange(false);
  };

  // Compass button geometry — arranged on a circle inside the sheet
  const size = 260;
  const R = 96;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <Sheet open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-6 pt-3 max-w-md mx-auto">
        <SheetHeader className="pb-1">
          <SheetTitle className="text-base text-t1">Where did it go?</SheetTitle>
          <SheetDescription className="text-xs text-t3">
            {runs} runs — tap the sector {leftHand ? '(left-hander view)' : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="flex justify-center py-1">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {/* inner field hint */}
            <circle cx={cx} cy={cy} r={R + 14} fill="rgba(0,212,170,0.03)" stroke="rgba(255,255,255,0.08)" />
            <rect x={cx - 3} y={cy - R * 0.45} width={6} height={R * 0.9} rx={2} fill="rgba(255,255,255,0.08)" />
            {WAGON_DIRECTIONS.map((dir) => {
              const a = wagonAngle(dir, leftHand);
              const p = compassToXY(a, R);
              const label = dir === 'V' ? 'V' : dir.split('_').map((w) => w === 'MID' ? 'mid' : w.toLowerCase()).join(' ');
              return (
                <g key={dir} onClick={() => !busy && handleDirection(dir)} style={{ cursor: busy ? 'wait' : 'pointer' }}>
                  <circle cx={cx + p.x} cy={cy + p.y} r={27} fill="rgba(0,212,170,0.08)" stroke="rgba(0,212,170,0.3)" />
                  <text
                    x={cx + p.x}
                    y={cy + p.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={8.5}
                    fill="#E6E6F0"
                    fontFamily="var(--font-mono, monospace)"
                    fontWeight={600}
                  >
                    {label}
                  </text>
                  <circle cx={cx + p.x} cy={cy + p.y} r={30} fill="transparent" />
                </g>
              );
            })}
            <circle cx={cx} cy={cy} r={4} fill="#fff" opacity={0.85} />
          </svg>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <label
            className="flex items-center gap-1.5 text-[11px] text-t3 hover:text-t2 transition-colors cursor-pointer"
          >
            <input
              type="checkbox"
              checked={dontAsk}
              onChange={(e) => setDontAsk(e.target.checked)}
              className="h-3.5 w-3.5 accent-[#00D4AA]"
            />
            Don&apos;t ask again
          </label>
          <button
            onClick={handleSkip}
            disabled={busy}
            className="text-[11px] text-t3 hover:text-t1 px-3 py-1.5 rounded-lg border border-border transition-colors"
          >
            Skip for now
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
