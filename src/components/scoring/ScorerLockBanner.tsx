'use client';

import { Lock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ScorerLockState } from '@/lib/offline/multi-tab';

/**
 * v2 §16.2 — ScorerLockBanner
 *
 * Rendered on the scoring screen:
 * - state 'readonly' → amber "another tab is scoring" banner with a
 *   "Take over" button (Web Locks steal). The other tab flips to the
 *   same banner instantly via BroadcastChannel.
 * - state 'held' → nothing (silent confirmation of ownership).
 */
export function ScorerLockBanner({
  state,
  onTakeOver,
}: {
  state: ScorerLockState;
  onTakeOver: () => void;
}) {
  if (state !== 'readonly') return null;

  return (
    <div className="mx-3 mb-3 rounded-xl border border-gold/30 bg-gold/5 p-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-gold/15 flex items-center justify-center flex-shrink-0">
        <Lock size={15} className="text-gold" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-t1">Another tab is scoring this match</p>
        <p className="text-[11px] text-t3 mt-0.5">
          You can follow along here — taking over will make the other tab read-only.
        </p>
      </div>
      <Button
        size="sm"
        onClick={onTakeOver}
        className="flex-shrink-0 h-8 px-3 rounded-lg bg-gold text-bg-app hover:bg-gold/90 text-xs font-semibold"
      >
        <ShieldCheck size={13} className="mr-1" />
        Take over
      </Button>
    </div>
  );
}
