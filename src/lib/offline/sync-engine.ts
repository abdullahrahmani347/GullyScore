/**
 * Sync Engine — Processes the offline queue when connectivity is restored.
 *
 * Key behaviors:
 * - Processes items in strict timestamp order (balls sync in the order they were recorded)
 * - Exponential backoff on retries (1s, 2s, 4s, 8s, then permanent failure)
 * - Emits events for UI updates
 * - Handles the case where a scorer goes offline for 3+ overs
 */

import {
  offlineDB,
  getPendingItems,
  markSyncing,
  markSynced,
  markFailed,
  logSyncEvent,
  type OfflineQueueItem,
} from './db';

export type SyncEngineEventType = 'sync_start' | 'sync_progress' | 'sync_complete' | 'sync_error' | 'item_failed';

export interface SyncEngineEvent {
  type: SyncEngineEventType;
  processed: number;
  total: number;
  currentUrl?: string;
  error?: string;
}

type SyncEngineListener = (event: SyncEngineEvent) => void;

class SyncEngine {
  private listeners: Set<SyncEngineListener> = new Set();
  private isSyncing = false;
  private abortController: AbortController | null = null;

  /**
   * Subscribe to sync engine events.
   */
  subscribe(listener: SyncEngineListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: SyncEngineEvent) {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch {
        // Don't let listener errors break the sync
      }
    });
  }

  /**
   * Process all pending items in the offline queue, in timestamp order.
   * This is the core sync logic.
   */
  async syncAll(matchId?: string): Promise<{ processed: number; failed: number }> {
    if (this.isSyncing) {
      return { processed: 0, failed: 0 };
    }

    this.isSyncing = true;
    this.abortController = new AbortController();

    const items = await getPendingItems(matchId);
    let processed = 0;
    let failed = 0;

    if (items.length === 0) {
      this.isSyncing = false;
      return { processed: 0, failed: 0 };
    }

    this.emit({ type: 'sync_start', processed: 0, total: items.length });
    await logSyncEvent('sync_start', `Starting sync of ${items.length} queued items`);

    for (const item of items) {
      // Check if sync was aborted
      if (this.abortController.signal.aborted) {
        break;
      }

      this.emit({
        type: 'sync_progress',
        processed,
        total: items.length,
        currentUrl: item.url,
      });

      const success = await this.syncItem(item);
      if (success) {
        processed++;
      } else {
        failed++;
      }
    }

    this.isSyncing = false;
    this.abortController = null;

    this.emit({ type: 'sync_complete', processed, total: items.length });
    await logSyncEvent('sync_complete', `Sync complete: ${processed} processed, ${failed} failed`);

    return { processed, failed };
  }

  /**
   * Sync a single queue item.
   */
  private async syncItem(item: OfflineQueueItem): Promise<boolean> {
    if (!item.id) return false;

    await markSyncing(item.id);

    try {
      const fetchOptions: RequestInit = {
        method: item.method,
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000), // 15 second timeout per item
      };

      // Only add body for methods that support it
      if (item.body && !['GET', 'HEAD'].includes(item.method)) {
        fetchOptions.body = item.body;
      }

      const response = await fetch(item.url, fetchOptions);

      if (response.ok) {
        // Successfully synced — remove from queue
        await markSynced(item.id);
        return true;
      }

      // Server returned an error
      let errorMsg = `HTTP ${response.status}`;
      try {
        const errorBody = await response.json();
        errorMsg = errorBody.error || errorMsg;
      } catch {
        // Can't parse error body
      }

      // Don't retry 4xx errors (except 408, 429)
      if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
        // Client error — permanent failure
        await offlineDB.offlineQueue.update(item.id, {
          status: 'permanently_failed',
          retryCount: item.retryCount + 1,
          lastError: errorMsg,
          lastRetryAt: Date.now(),
        });
        await logSyncEvent('queue_item_failed', `Item permanently failed (${errorMsg}): ${item.description}`, item.id);
        return false;
      }

      // Server error or rate limit — mark as failed for retry
      await markFailed(item.id, errorMsg);
      return false;
    } catch (error) {
      // Network error — mark as failed for retry
      const errorMsg = error instanceof Error ? error.message : 'Network error';
      await markFailed(item.id, errorMsg);
      return false;
    }
  }

  /**
   * Abort an in-progress sync operation.
   */
  abort() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Check if sync is currently in progress.
   */
  getIsSyncing(): boolean {
    return this.isSyncing;
  }
}

/** Singleton sync engine instance */
export const syncEngine = new SyncEngine();
