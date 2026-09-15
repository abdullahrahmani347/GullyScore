'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CloudDownload, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  subscribeConflicts,
  resolveByApplyingServer,
  resolveByKeepingLocal,
  type ConflictState,
} from '@/lib/offline/conflicts';

/**
 * v2 §16.3 — ConflictSheet
 *
 * Appears on the scoring screen when a ball POST reports deliveryNumber
 * divergence. Lists the divergent server events and offers:
 *   - "Apply server" (DEFAULT, primary): revalidate from the server — the
 *     local log is replaced by server truth (the SSE `state` resync does
 *     the same in the background).
 *   - "Keep mine" (dismiss): documented last-write-wins — the local log
 *     stands and the next write re-aligns numbering.
 */
export function ConflictSheet({ onApply }: { onApply: () => void | Promise<unknown> }) {
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => subscribeConflicts(setConflict), []);

  const handleApplyServer = async () => {
    setApplying(true);
    try {
      await onApply();
    } finally {
      resolveByApplyingServer();
      setApplying(false);
    }
  };

  const handleKeepMine = () => {
    resolveByKeepingLocal();
  };

  return (
    <AnimatePresence>
      {conflict && conflict.events.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="mx-3 mb-3 rounded-xl border border-gold/30 bg-gold/5 p-3"
        >
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gold/15 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={15} className="text-gold" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-t1">Scoring got out of sync</p>
              <p className="text-[11px] text-t3 mt-0.5">
                {conflict.events.length} event{conflict.events.length !== 1 ? 's' : ''} recorded elsewhere since ball{' '}
                <span className="font-[family-name:var(--font-mono)]">{conflict.clientExpected}</span>. Applying the
                server version keeps everyone aligned.
              </p>

              {/* Divergent events list (compact) */}
              <div className="mt-2 space-y-1 max-h-28 overflow-y-auto">
                {conflict.events.slice(0, 8).map((e, i) => (
                  <div
                    key={`${e.inningsId}-${e.deliveryNumber}-${i}`}
                    className="flex items-center justify-between px-2 py-1 rounded-md bg-bg-elevated/70 text-[11px]"
                  >
                    <span className="font-[family-name:var(--font-mono)] text-t3">
                      #{e.deliveryNumber}
                    </span>
                    <span className={`font-semibold ${e.isWicket ? 'text-wicket' : 'text-t1'}`}>
                      {e.isWicket
                        ? `WICKET${e.wicketType ? ` (${e.wicketType})` : ''}`
                        : e.extraType
                          ? `${e.extraType === 'WIDE' ? 'Wide' : e.extraType === 'NO_BALL' ? 'No ball' : e.extraType.toLowerCase()}${e.extraRuns > 0 ? ` +${e.extraRuns}` : ''}`
                          : e.runs === 4
                            ? 'FOUR'
                            : e.runs === 6
                              ? 'SIX'
                              : `${e.runs} run${e.runs !== 1 ? 's' : ''}`}
                    </span>
                    <span className="text-t3">
                      {new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
                {conflict.events.length > 8 && (
                  <p className="text-[10px] text-t3 px-2">+ {conflict.events.length - 8} more…</p>
                )}
              </div>

              {/* Actions — "Apply server" is the default */}
              <div className="flex items-center gap-2 mt-2.5">
                <Button
                  size="sm"
                  onClick={handleApplyServer}
                  disabled={applying}
                  className="h-8 px-3 rounded-lg bg-accent text-bg-app hover:bg-accent/90 text-xs font-semibold"
                >
                  <CloudDownload size={13} className="mr-1" />
                  {applying ? 'Applying…' : 'Apply server'}
                </Button>
                <button
                  onClick={handleKeepMine}
                  className="flex items-center gap-1 text-[11px] text-t3 hover:text-t2 transition-colors px-2 h-8"
                >
                  <X size={12} />
                  Keep mine
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
