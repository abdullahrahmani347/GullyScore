import Dexie, { type EntityTable } from 'dexie';

/**
 * Represents a queued offline request that needs to be synced
 * when connectivity is restored.
 */
export interface OfflineQueueItem {
  /** Auto-incremented ID */
  id?: number;
  /** The API endpoint URL (e.g. /api/matches/123/innings/456/balls) */
  url: string;
  /** HTTP method (POST, PUT, PATCH, DELETE) */
  method: string;
  /** JSON-stringified request body */
  body: string;
  /** Timestamp when the request was originally made (for ordering) */
  timestamp: number;
  /** Current status of the queue item */
  status: 'pending' | 'syncing' | 'failed' | 'permanently_failed';
  /** Number of retry attempts */
  retryCount: number;
  /** Timestamp of last retry attempt */
  lastRetryAt?: number;
  /** Error message from last failed attempt */
  lastError?: string;
  /** Human-readable description for recovery screen */
  description: string;
  /** The match ID this request belongs to (for filtering) */
  matchId: string;
  /** The innings ID this request belongs to (for filtering) */
  inningsId?: string;
  /** Type of request for recovery display */
  type: 'ball' | 'wicket' | 'undo' | 'set_striker' | 'set_bowler' | 'complete_innings' | 'complete_match' | 'create_innings' | 'other';
  /** Ball-specific data for recovery screen display */
  ballSummary?: string;
}

/**
 * Tracks sync events for UI display
 */
export interface SyncEvent {
  id?: number;
  timestamp: number;
  type: 'sync_start' | 'sync_success' | 'sync_error' | 'sync_complete' | 'queue_item_failed';
  message: string;
  queueItemId?: number;
}

/**
 * GullyScore's offline-first IndexedDB database.
 * 
 * Tables:
 * - offlineQueue: Pending/syncing/failed API requests
 * - syncEvents: Log of sync operations for UI display
 */
class GullyScoreDB extends Dexie {
  offlineQueue!: EntityTable<OfflineQueueItem, 'id'>;
  syncEvents!: EntityTable<SyncEvent, 'id'>;

  constructor() {
    super('GullyScoreOffline');

    this.version(1).stores({
      offlineQueue: '++id, url, status, timestamp, matchId, inningsId, type',
      syncEvents: '++id, timestamp, type',
    });
  }
}

/** Singleton database instance */
export const offlineDB = new GullyScoreDB();

// ─── Queue Operations ────────────────────────────────────────────

/**
 * Add a request to the offline queue.
 * Returns the queue item ID for tracking.
 */
export async function enqueueRequest(item: Omit<OfflineQueueItem, 'id' | 'retryCount' | 'status'>): Promise<number> {
  const id = await offlineDB.offlineQueue.add({
    ...item,
    status: 'pending',
    retryCount: 0,
  });

  await logSyncEvent('sync_start', `Queued ${item.type} request for offline sync`);

  return id;
}

/**
 * Get all pending items for a specific match, ordered by timestamp.
 * This ensures balls sync in the exact order they were recorded.
 */
export async function getPendingItems(matchId?: string): Promise<OfflineQueueItem[]> {
  if (matchId) {
    return offlineDB.offlineQueue
      .where('matchId')
      .equals(matchId)
      .and(item => item.status === 'pending' || item.status === 'failed')
      .sortBy('timestamp');
  }
  
  return offlineDB.offlineQueue
    .where('status')
    .anyOf(['pending', 'failed'])
    .sortBy('timestamp');
}

/**
 * Get all items that have permanently failed (for recovery screen).
 */
export async function getPermanentlyFailedItems(matchId?: string): Promise<OfflineQueueItem[]> {
  if (matchId) {
    return offlineDB.offlineQueue
      .where('matchId')
      .equals(matchId)
      .and(item => item.status === 'permanently_failed')
      .sortBy('timestamp');
  }
  
  return offlineDB.offlineQueue
    .where('status')
    .equals('permanently_failed')
    .sortBy('timestamp');
}

/**
 * Get queue statistics for a match.
 */
export async function getQueueStats(matchId?: string): Promise<{
  pending: number;
  syncing: number;
  failed: number;
  permanentlyFailed: number;
  total: number;
}> {
  const items = matchId
    ? await offlineDB.offlineQueue.where('matchId').equals(matchId).toArray()
    : await offlineDB.offlineQueue.toArray();

  return {
    pending: items.filter(i => i.status === 'pending').length,
    syncing: items.filter(i => i.status === 'syncing').length,
    failed: items.filter(i => i.status === 'failed').length,
    permanentlyFailed: items.filter(i => i.status === 'permanently_failed').length,
    total: items.length,
  };
}

/**
 * Mark a queue item as syncing (in progress).
 */
export async function markSyncing(id: number): Promise<void> {
  await offlineDB.offlineQueue.update(id, {
    status: 'syncing',
    lastRetryAt: Date.now(),
  });
}

/**
 * Mark a queue item as successfully synced and remove it.
 */
export async function markSynced(id: number): Promise<void> {
  await offlineDB.offlineQueue.delete(id);
}

/**
 * Mark a queue item as failed (will be retried).
 */
export async function markFailed(id: number, error: string): Promise<void> {
  const item = await offlineDB.offlineQueue.get(id);
  if (!item) return;

  const newRetryCount = item.retryCount + 1;
  const maxRetries = 5;

  if (newRetryCount >= maxRetries) {
    await offlineDB.offlineQueue.update(id, {
      status: 'permanently_failed',
      retryCount: newRetryCount,
      lastError: error,
      lastRetryAt: Date.now(),
    });
    await logSyncEvent('queue_item_failed', `Item ${id} permanently failed after ${maxRetries} retries: ${error}`, id);
  } else {
    await offlineDB.offlineQueue.update(id, {
      status: 'failed',
      retryCount: newRetryCount,
      lastError: error,
      lastRetryAt: Date.now(),
    });
  }
}

/**
 * Remove a permanently failed item (user dismissed it on recovery screen).
 */
export async function dismissFailedItem(id: number): Promise<void> {
  await offlineDB.offlineQueue.delete(id);
}

/**
 * Retry a permanently failed item by resetting its status to pending.
 */
export async function retryFailedItem(id: number): Promise<void> {
  await offlineDB.offlineQueue.update(id, {
    status: 'pending',
    retryCount: 0,
    lastError: undefined,
  });
}

/**
 * Clear all queue items for a match (e.g., when match is completed).
 */
export async function clearMatchQueue(matchId: string): Promise<void> {
  await offlineDB.offlineQueue
    .where('matchId')
    .equals(matchId)
    .delete();
}

// ─── Sync Events ─────────────────────────────────────────────────

/**
 * Log a sync event for UI display.
 */
export async function logSyncEvent(
  type: SyncEvent['type'],
  message: string,
  queueItemId?: number
): Promise<void> {
  await offlineDB.syncEvents.add({
    timestamp: Date.now(),
    type,
    message,
    queueItemId,
  });

  // Keep only the last 50 sync events
  const count = await offlineDB.syncEvents.count();
  if (count > 50) {
    const oldest = await offlineDB.syncEvents.orderBy('id').limit(count - 50).toArray();
    const ids = oldest.map(e => e.id!);
    await offlineDB.syncEvents.bulkDelete(ids);
  }
}

/**
 * Get recent sync events.
 */
export async function getRecentSyncEvents(limit = 10): Promise<SyncEvent[]> {
  return offlineDB.syncEvents
    .orderBy('id')
    .reverse()
    .limit(limit)
    .toArray();
}

/**
 * Check if there are any pending items in the queue.
 */
export async function hasPendingItems(matchId?: string): Promise<boolean> {
  const items = await getPendingItems(matchId);
  return items.length > 0;
}
