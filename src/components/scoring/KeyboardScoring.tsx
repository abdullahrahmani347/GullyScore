'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Keyboard } from 'lucide-react';

interface KeyboardScoringProps {
  /** Only captures keys while true (SCORING state, no modal open). */
  active: boolean;
  onScore: (runs: number) => void;
  onWicket: () => void;
  /** §14.5 — ⇧W wide · N no-ball · B bye · L leg-bye go through the extras path. */
  onExtra: (extraType: 'WIDE' | 'NO_BALL' | 'BYE' | 'LEG_BYE') => void;
  onUndo: () => void;
  /** Esc closes modals/sheets. */
  onEscape: () => void;
}

interface Binding {
  keys: string;
  action: string;
}

const BINDINGS: Binding[] = [
  { keys: '0 – 6', action: 'Runs off the bat' },
  { keys: 'W', action: 'Wicket' },
  { keys: '⇧ W', action: 'Wide' },
  { keys: 'N', action: 'No ball' },
  { keys: 'B', action: 'Bye' },
  { keys: 'L', action: 'Leg bye' },
  { keys: 'U', action: 'Undo' },
  { keys: 'Esc', action: 'Close panels' },
  { keys: '?', action: 'This cheat sheet' },
];

/**
 * v2 §14.5 — keyboard scoring for desktop. Keys are ignored while typing in
 * any input. `?` toggles the cheat-sheet popover.
 */
export function KeyboardScoring({ active, onScore, onWicket, onExtra, onUndo, onEscape }: KeyboardScoringProps) {
  const [cheatOpen, setCheatOpen] = useState(false);
  // Refs keep the listener fresh without re-binding on every render. The
  // sync itself lives in an effect (never during render).
  const handlers = useRef({ onScore, onWicket, onExtra, onUndo, onEscape, active, cheatOpen });
  useEffect(() => {
    handlers.current = { onScore, onWicket, onExtra, onUndo, onEscape, active, cheatOpen };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const h = handlers.current;
      // Never steal keys from form fields
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (e.key === '?') {
        setCheatOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape') {
        // Esc: close the cheat sheet if open, else bubble to modal-closers
        if (handlers.current.cheatOpen) {
          setCheatOpen(false);
          return;
        }
        h.onEscape();
        return;
      }
      if (!h.active) return;

      // W vs ⇧W
      if (e.key === 'W' || e.key === 'w') {
        if (e.shiftKey) h.onExtra('WIDE');
        else h.onWicket();
        e.preventDefault();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'n' || e.key === 'N') { h.onExtra('NO_BALL'); e.preventDefault(); return; }
      if (e.key === 'b' || e.key === 'B') { h.onExtra('BYE'); e.preventDefault(); return; }
      if (e.key === 'l' || e.key === 'L') { h.onExtra('LEG_BYE'); e.preventDefault(); return; }
      if (e.key === 'u' || e.key === 'U') { h.onUndo(); e.preventDefault(); return; }
      if (/^[0-6]$/.test(e.key)) {
        h.onScore(parseInt(e.key, 10));
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="fixed bottom-3 right-3 z-40 hidden md:block print:hidden">
      <AnimatePresence>
        {cheatOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            className="absolute bottom-12 right-0 w-64 rounded-xl bg-bg-card border border-border shadow-lg p-3"
          >
            <p className="text-xs font-semibold text-t1 mb-2 uppercase tracking-wider">Keyboard scoring</p>
            <div className="space-y-1.5">
              {BINDINGS.map((b) => (
                <div key={b.keys} className="flex items-center justify-between gap-2">
                  <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated border border-border text-t2 min-w-[2.5rem] text-center">
                    {b.keys}
                  </kbd>
                  <span className="text-[11px] text-t3">{b.action}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => setCheatOpen((v) => !v)}
        title="Keyboard shortcuts (?)"
        className="w-9 h-9 rounded-full bg-bg-card border border-border text-t3 hover:text-t1 flex items-center justify-center transition-colors"
      >
        <Keyboard size={16} />
      </button>
    </div>
  );
}
