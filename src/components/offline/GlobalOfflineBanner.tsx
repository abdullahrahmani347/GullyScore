'use client';

import { WifiOff, RefreshCw } from 'lucide-react';
import { useConnectivity, useOfflineSync } from '@/hooks/useConnectivity';
import { syncEngine } from '@/lib/offline/sync-engine';
import { useEffect } from 'react';

/**
 * GlobalOfflineBanner — Shown at the very top of the app when offline.
 * A thin banner visible on all pages, not just the scoring screen.
 */
export function GlobalOfflineBanner() {
  const isOnline = useConnectivity();
  const { queueStats, isSyncing, triggerSync } = useOfflineSync();

  // When coming back online, auto-trigger sync
  useEffect(() => {
    if (isOnline && queueStats.total > 0) {
      syncEngine.syncAll();
    }
  }, [isOnline, queueStats.total]);

  if (isOnline && queueStats.total === 0) return null;

  if (!isOnline) {
    return (
      <div className="flex items-center justify-center gap-2 px-3 py-1 bg-yellow-500/20 border-b border-yellow-500/30 text-yellow-400 text-[11px] font-medium">
        <WifiOff size={11} />
        <span>You&apos;re offline</span>
        {queueStats.total > 0 && (
          <span className="text-yellow-300/60">({queueStats.total} items queued)</span>
        )}
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div className="flex items-center justify-center gap-2 px-3 py-1 bg-blue-500/20 border-b border-blue-500/30 text-blue-400 text-[11px] font-medium">
        <RefreshCw size={11} className="animate-spin" />
        <span>Syncing offline data...</span>
      </div>
    );
  }

  if (queueStats.total > 0) {
    return (
      <div className="flex items-center justify-center gap-2 px-3 py-1 bg-orange-500/20 border-b border-orange-500/30 text-orange-400 text-[11px] font-medium">
        <span>{queueStats.total} items pending sync</span>
        <button
          onClick={triggerSync}
          className="underline hover:no-underline"
        >
          Sync now
        </button>
      </div>
    );
  }

  return null;
}
