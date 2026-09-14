'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { ArrowUpDown, RefreshCw, Trash2, HardDrive } from 'lucide-react';
import { toast } from 'sonner';
import type { OfflineQueueItem } from '@/lib/offline/db';

interface OfflineQueueInspectorProps {
  matchId: string;
}

interface StorageEstimate {
  usage: number;
  quota: number;
}

function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[u]}`;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const TYPE_BADGE: Record<OfflineQueueItem['type'], string> = {
  ball: 'ball',
  wicket: 'wkt',
  undo: 'undo',
  set_striker: 'pair',
  set_bowler: 'bowler',
  complete_innings: 'inn',
  complete_match: 'end',
  create_innings: 'inn',
  other: '?',
};

/**
 * v2 §14.9 — offline queue inspector. A header pill ("⇅ n queued") opens a
 * sheet listing pending events with retry-all, discard-with-confirm and a
 * navigator.storage.estimate() quota meter.
 */
export function OfflineQueueInspector({ matchId }: OfflineQueueInspectorProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<OfflineQueueItem[]>([]);
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const [busy, setBusy] = useState(false);
  const [discardAllOpen, setDiscardAllOpen] = useState(false);
  const [confirmDiscardId, setConfirmDiscardId] = useState<number | null>(null);

  const queued = items.filter((i) => i.status === 'pending' || i.status === 'failed').length;

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined') return;
    try {
      const { getPendingItems, getPermanentlyFailedItems } = await import('@/lib/offline/db');
      const [pending, failed] = await Promise.all([
        getPendingItems(matchId),
        getPermanentlyFailedItems(matchId),
      ]);
      setItems([...pending, ...failed].sort((a, b) => a.timestamp - b.timestamp));
    } catch {
      // IndexedDB unavailable (private mode etc.) — keep the pill silent
    }
    try {
      if (navigator.storage?.estimate) {
        const e = await navigator.storage.estimate();
        setEstimate({ usage: e.usage ?? 0, quota: e.quota ?? 0 });
      }
    } catch {
      /* estimate unsupported */
    }
  }, [matchId]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh, open]);

  const retryAll = async () => {
    setBusy(true);
    try {
      const { getSyncEngine } = await import('@/lib/offline/sync-engine');
      const engine = getSyncEngine();
      const { processed, failed } = await engine.syncAll(matchId);
      if (failed === 0) {
        toast.success(`Synced ${processed} queued event${processed === 1 ? '' : 's'}`);
      } else {
        toast.error(`${processed} synced · ${failed} failed — they stay queued for retry`);
      }
    } catch {
      toast.error('Retry failed — still offline?');
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  const discard = async (id: number) => {
    setBusy(true);
    try {
      const { dismissFailedItem, getOfflineDB } = await import('@/lib/offline/db');
      await dismissFailedItem(id);
      // also hard-remove pending items if the user discards them
      await getOfflineDB().offlineQueue.delete(id).catch(() => undefined);
      toast.success('Event discarded — it will not sync');
    } catch {
      toast.error('Could not discard the event');
    } finally {
      setBusy(false);
      setConfirmDiscardId(null);
      void refresh();
    }
  };

  const discardAll = async () => {
    setBusy(true);
    try {
      const { clearMatchQueue } = await import('@/lib/offline/db');
      await clearMatchQueue(matchId);
      toast.success(`Discarded ${queued} queued event${queued === 1 ? '' : 's'}`);
    } catch {
      toast.error('Could not discard the queue');
    } finally {
      setBusy(false);
      setDiscardAllOpen(false);
      void refresh();
    }
  };

  const quotaPct = estimate && estimate.quota > 0 ? Math.min(100, (estimate.usage / estimate.quota) * 100) : null;

  return (
    <>
      {/* Header pill — §14.9 */}
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-mono font-semibold border transition-colors ${
          queued > 0
            ? 'bg-warn/15 text-warn border-warn/40 hover:bg-warn/25'
            : 'bg-bg-elevated text-t3 border-border'
        }`}
        title="Offline queue — pending events"
      >
        <ArrowUpDown size={11} />
        {queued} queued
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="bg-bg-card border-t border-border rounded-t-2xl max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-t1">Offline queue</SheetTitle>
            <SheetDescription className="text-t3 text-xs">
              Events recorded while offline. They sync automatically when you reconnect — or retry them now.
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 pb-6 space-y-3">
            {/* Storage quota meter — §14.9 navigator.storage.estimate() */}
            <div className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-t2 flex items-center gap-1.5">
                  <HardDrive size={12} />
                  Device storage
                </span>
                {estimate && (
                  <span className="text-[10px] font-mono text-t3">
                    {fmtBytes(estimate.usage)} {quotaPct != null && quotaPct > 80 ? '· almost full' : ''}
                  </span>
                )}
              </div>
              <div className="h-2 rounded-full bg-bg-elevated overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${quotaPct != null && quotaPct > 80 ? 'bg-danger' : 'bg-accent'}`}
                  style={{ width: `${Math.max(quotaPct ?? 2, 2)}%` }}
                />
              </div>
              {estimate && (
                <p className="text-[10px] text-t3 mt-1.5">
                  {fmtBytes(estimate.usage)} used of {fmtBytes(estimate.quota)} available
                </p>
              )}
            </div>

            {/* Pending events */}
            {items.length === 0 && (
              <div className="py-6 text-center text-t3 text-sm">
                Nothing queued — every event is synced.
              </div>
            )}
            <div className="space-y-1.5">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-bg-elevated text-t2 uppercase">
                        {TYPE_BADGE[item.type] ?? '?'}
                      </span>
                      <span className="text-xs text-t1 truncate">{item.ballSummary ?? item.description}</span>
                      {item.status === 'permanently_failed' && (
                        <span className="text-[9px] font-mono px-1 rounded bg-wicket/15 text-wicket uppercase shrink-0">
                          failed
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-t3 mt-0.5 font-mono">
                      {fmtTime(item.timestamp)}
                      {item.retryCount > 0 && ` · retried ${item.retryCount}×`}
                      {item.lastError && ` · ${item.lastError.slice(0, 40)}`}
                    </p>
                  </div>
                  <button
                    onClick={() => setConfirmDiscardId(item.id!)}
                    disabled={busy}
                    className="text-t3 hover:text-wicket p-1.5 rounded-lg transition-colors shrink-0"
                    title="Discard this event"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                onClick={retryAll}
                disabled={busy || queued === 0}
                className="flex-1 h-11 rounded-xl bg-accent text-black hover:bg-accent/85 font-semibold"
              >
                <RefreshCw size={14} className="mr-1.5" />
                {busy ? 'Syncing…' : `Retry all (${queued})`}
              </Button>
              <Button
                onClick={() => setDiscardAllOpen(true)}
                disabled={busy || items.length === 0}
                variant="ghost"
                className="h-11 rounded-xl border border-wicket/30 text-wicket hover:bg-wicket/10"
              >
                <Trash2 size={14} className="mr-1.5" />
                Discard all
              </Button>
            </div>

            <p className="text-[10px] text-t3">
              Discarded events are gone for good — the server will never see them. Retry-all replays them in the exact
              order they were scored.
            </p>
          </div>
        </SheetContent>
      </Sheet>

      {/* Discard confirmations */}
      <AlertDialog open={confirmDiscardId != null} onOpenChange={(o) => !o && setConfirmDiscardId(null)}>
        <AlertDialogContent className="bg-bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-t1">Discard this event?</AlertDialogTitle>
            <AlertDialogDescription className="text-t3">
              It will be removed from the queue and never synced. The scorecard will not include it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-t2">Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDiscardId != null && discard(confirmDiscardId)}
              className="bg-wicket hover:bg-wicket/85 text-white"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={discardAllOpen} onOpenChange={setDiscardAllOpen}>
        <AlertDialogContent className="bg-bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-t1">Discard all {queued} queued events?</AlertDialogTitle>
            <AlertDialogDescription className="text-t3">
              Every event listed above will be removed permanently. Only do this if you are sure the match state on
              the server is already correct.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-t2">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={discardAll}
              className="bg-wicket hover:bg-wicket/85 text-white"
            >
              Discard all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
