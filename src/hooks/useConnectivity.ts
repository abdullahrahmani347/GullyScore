'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { syncEngine, type SyncEngineEvent } from '@/lib/offline/sync-engine';
import {
  getQueueStats,
  getPendingItems,
  getPermanentlyFailedItems,
  hasPendingItems,
  type OfflineQueueItem,
} from '@/lib/offline/db';

/**
 * Hook to track online/offline state.
 * Returns true when the browser is online.
 */
export function useConnectivity() {
  const [isOnline, setIsOnline] = useState(
    typeof window !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

/**
 * Hook to track sync status and queue state.
 * Provides real-time updates about the offline queue.
 */
export function useOfflineSync(matchId?: string) {
  const [queueStats, setQueueStats] = useState({
    pending: 0,
    syncing: 0,
    failed: 0,
    permanentlyFailed: 0,
    total: 0,
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncEvent, setLastSyncEvent] = useState<SyncEngineEvent | null>(null);
  const [failedItems, setFailedItems] = useState<OfflineQueueItem[]>([]);
  const refreshRef = useRef<() => void>();

  const refresh = useCallback(async () => {
    const stats = await getQueueStats(matchId);
    setQueueStats(stats);

    if (matchId) {
      const items = await getPermanentlyFailedItems(matchId);
      setFailedItems(items);
    }
  }, [matchId]);

  refreshRef.current = refresh;

  useEffect(() => {
    // Initial load
    refreshRef.current?.();

    // Subscribe to sync engine events
    const unsubscribe = syncEngine.subscribe((event) => {
      setLastSyncEvent(event);
      setIsSyncing(event.type === 'sync_start' || event.type === 'sync_progress');

      // Refresh queue stats after any sync event
      if (event.type === 'sync_complete' || event.type === 'sync_error' || event.type === 'item_failed') {
        refreshRef.current?.();
      }
    });

    // Poll queue stats periodically
    const interval = setInterval(() => {
      refreshRef.current?.();
    }, 5000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  /**
   * Trigger a manual sync of the offline queue.
   */
  const triggerSync = useCallback(async () => {
    if (!navigator.onLine) return;
    await syncEngine.syncAll(matchId);
    await refresh();
  }, [matchId, refresh]);

  /**
   * Dismiss a permanently failed item.
   */
  const dismissFailed = useCallback(async (id: number) => {
    const { dismissFailedItem } = await import('@/lib/offline/db');
    await dismissFailedItem(id);
    await refresh();
  }, [refresh]);

  /**
   * Retry a permanently failed item.
   */
  const retryFailed = useCallback(async (id: number) => {
    const { retryFailedItem } = await import('@/lib/offline/db');
    await retryFailedItem(id);
    await refresh();
    // Auto-trigger sync after retrying
    if (navigator.onLine) {
      await syncEngine.syncAll(matchId);
      await refresh();
    }
  }, [matchId, refresh]);

  return {
    queueStats,
    isSyncing,
    lastSyncEvent,
    failedItems,
    triggerSync,
    dismissFailed,
    retryFailed,
    refresh,
    hasPending: queueStats.pending > 0 || queueStats.failed > 0,
    hasFailures: queueStats.permanentlyFailed > 0,
  };
}

/**
 * Hook to check if there are unsynced items for a match.
 * Useful for showing warnings before navigation.
 */
export function useUnsyncedBalls(matchId?: string) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!matchId) return;

    const check = async () => {
      const items = await getPendingItems(matchId);
      setCount(items.filter(i => i.type === 'ball' || i.type === 'wicket').length);
    };

    check();
    const interval = setInterval(check, 3000);
    return () => clearInterval(interval);
  }, [matchId]);

  return count;
}
