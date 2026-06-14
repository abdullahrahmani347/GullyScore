'use client';

import { WifiOff, Wifi, CloudOff, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useConnectivity, useOfflineSync } from '@/hooks/useConnectivity';
import { useState, useEffect } from 'react';

/**
 * OfflineIndicator — A persistent status bar shown at the top of the scoring screen.
 *
 * Shows:
 * - Green "Online" indicator when connected with no pending items
 * - Yellow "Offline" indicator when disconnected, with pending count
 * - Blue "Syncing..." when queue is being processed
 * - Red "Sync Failed" when items have permanently failed
 */
export function OfflineIndicator({ matchId }: { matchId?: string }) {
  const isOnline = useConnectivity();
  const { queueStats, isSyncing, hasPending, hasFailures, triggerSync } = useOfflineSync(matchId);

  // Don't show anything when online and no pending items
  if (isOnline && !hasPending && !hasFailures) {
    return null;
  }

  // Syncing state
  if (isSyncing) {
    return (
      <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-blue-500/20 border-b border-blue-500/30 text-blue-400 text-xs font-medium">
        <RefreshCw size={12} className="animate-spin" />
        <span>Syncing {queueStats.pending + queueStats.failed} queued items...</span>
      </div>
    );
  }

  // Offline with pending items
  if (!isOnline) {
    return (
      <div className="flex items-center justify-between px-3 py-1.5 bg-yellow-500/20 border-b border-yellow-500/30 text-yellow-400 text-xs font-medium">
        <div className="flex items-center gap-2">
          <WifiOff size={12} />
          <span>Offline</span>
          {queueStats.total > 0 && (
            <span className="text-yellow-300/70">
              ({queueStats.pending + queueStats.failed} queued)
            </span>
          )}
        </div>
        {hasFailures && (
          <span className="flex items-center gap-1 text-orange-400">
            <AlertTriangle size={10} />
            {queueStats.permanentlyFailed} failed
          </span>
        )}
      </div>
    );
  }

  // Online but has pending/failed items
  if (hasPending) {
    return (
      <div className="flex items-center justify-between px-3 py-1.5 bg-orange-500/20 border-b border-orange-500/30 text-orange-400 text-xs font-medium">
        <div className="flex items-center gap-2">
          <CloudOff size={12} />
          <span>{queueStats.pending + queueStats.failed} items to sync</span>
        </div>
        <button
          onClick={triggerSync}
          className="flex items-center gap-1 px-2 py-0.5 rounded bg-orange-500/30 hover:bg-orange-500/50 transition-colors"
        >
          <RefreshCw size={10} />
          Sync now
        </button>
      </div>
    );
  }

  // Online but has permanently failed items
  if (hasFailures) {
    return (
      <div className="flex items-center justify-between px-3 py-1.5 bg-red-500/20 border-b border-red-500/30 text-red-400 text-xs font-medium">
        <div className="flex items-center gap-2">
          <AlertTriangle size={12} />
          <span>{queueStats.permanentlyFailed} items failed to sync</span>
        </div>
        <button
          onClick={triggerSync}
          className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/30 hover:bg-red-500/50 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return null;
}

/**
 * Compact offline badge for the top bar.
 * Shows a small icon when offline.
 */
export function OfflineBadge() {
  const isOnline = useConnectivity();
  const { hasPending } = useOfflineSync();

  if (isOnline && !hasPending) return null;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-yellow-500/20 text-yellow-400 text-[10px] font-medium">
      <WifiOff size={10} />
      <span>Offline</span>
    </div>
  );
}
