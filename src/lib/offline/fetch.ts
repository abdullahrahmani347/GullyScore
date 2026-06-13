/**
 * Offline-aware fetch utility.
 *
 * When the app is offline, POST/PUT/PATCH/DELETE requests are stored in the
 * IndexedDB offline queue instead of failing. The UI receives a synthetic
 * success response, and the request is replayed when connectivity returns.
 *
 * This is the critical divergence from normal fetch: the scorer never loses a ball.
 */

import { enqueueRequest, type OfflineQueueItem } from './db';

/** Check if the browser is currently offline */
export function isOffline(): boolean {
  if (typeof window === 'undefined') return false;
  return !navigator.onLine;
}

/** Check if the browser is currently online */
export function isOnline(): boolean {
  if (typeof window === 'undefined') return true;
  return navigator.onLine;
}

/**
 * Configuration for offline-aware fetch
 */
export interface OfflineFetchOptions extends RequestInit {
  /** Whether to queue the request if offline (default: true for mutations) */
  queueIfOffline?: boolean;
  /** Human-readable description for the recovery screen */
  description?: string;
  /** Match ID this request belongs to */
  matchId?: string;
  /** Innings ID this request belongs to */
  inningsId?: string;
  /** Type of request for recovery display */
  type?: OfflineQueueItem['type'];
  /** Ball summary for recovery display (e.g., "4 runs", "WICKET - Bowled") */
  ballSummary?: string;
}

/**
 * Offline-aware fetch. Wraps the native fetch API with queueing behavior:
 *
 * 1. If online, tries the network request normally
 * 2. If offline AND it's a mutation (POST/PUT/PATCH/DELETE):
 *    - Stores the request in the IndexedDB offline queue
 *    - Returns a synthetic success response so the UI doesn't break
 * 3. If offline AND it's a GET request:
 *    - Returns cached response if available (via service worker)
 *    - Throws if no cache available
 *
 * The Zustand store holds the optimistic state; the DB catches up when online.
 */
export async function offlineFetch<T = any>(
  url: string,
  options: OfflineFetchOptions = {}
): Promise<{ data: T; offline: boolean; queuedItemId?: number }> {
  const {
    queueIfOffline = true,
    description = `${options.method || 'GET'} ${url}`,
    matchId = '',
    inningsId,
    type = 'other',
    ballSummary,
    ...fetchOptions
  } = options;

  const method = (fetchOptions.method || 'GET').toUpperCase();
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  // If online, try the network request normally
  if (isOnline()) {
    try {
      const response = await fetch(url, fetchOptions);

      if (response.ok) {
        const data = await response.json();
        return { data, offline: false };
      }

      // Server error — throw
      const errorBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      throw new Error(errorBody.error || `HTTP ${response.status}`);
    } catch (error) {
      // Network error even though we thought we were online
      // This can happen with flaky connections
      if (isMutation && queueIfOffline) {
        // Fall through to offline queueing
        console.warn(`[GullyScore] Network error on ${method} ${url}, falling back to offline queue`);
      } else {
        throw error;
      }
    }
  }

  // Offline path: queue the mutation
  if (!isOnline() && isMutation && queueIfOffline) {
    const body = typeof fetchOptions.body === 'string' ? fetchOptions.body : JSON.stringify(fetchOptions.body);

    const queuedItemId = await enqueueRequest({
      url,
      method,
      body: body || '{}',
      timestamp: Date.now(),
      description,
      matchId,
      inningsId,
      type,
      ballSummary,
    });

    // Return a synthetic success response
    // The UI has already optimistically updated, so this keeps things consistent
    const syntheticResponse = {
      success: true,
      offline: true,
      message: 'Recorded offline — will sync when connected',
    } as T;

    return { data: syntheticResponse, offline: true, queuedItemId };
  }

  // GET request while offline — this should be handled by the service worker cache
  // If we reach here, there's no cache available
  throw new Error('You are offline and this data is not cached');
}

/**
 * Convenience method for recording a ball offline.
 * Pre-configures the offline fetch for ball recording.
 */
export async function recordBallOffline(
  matchId: string,
  inningsId: string,
  ballData: Record<string, any>,
  ballSummary: string
): Promise<{ data: any; offline: boolean; queuedItemId?: number }> {
  return offlineFetch(`/api/matches/${matchId}/innings/${inningsId}/balls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ballData),
    description: `Ball: ${ballSummary}`,
    matchId,
    inningsId,
    type: ballData.isWicket ? 'wicket' : 'ball',
    ballSummary,
  });
}

/**
 * Convenience method for undo last ball offline.
 */
export async function undoBallOffline(
  matchId: string,
  inningsId: string
): Promise<{ data: any; offline: boolean; queuedItemId?: number }> {
  return offlineFetch(`/api/matches/${matchId}/innings/${inningsId}/balls/last`, {
    method: 'DELETE',
    description: 'Undo last ball',
    matchId,
    inningsId,
    type: 'undo',
  });
}

/**
 * Convenience method for setting striker offline.
 */
export async function setStrikerOffline(
  matchId: string,
  inningsId: string,
  strikerId: string,
  nonStrikerId: string
): Promise<{ data: any; offline: boolean; queuedItemId?: number }> {
  return offlineFetch(`/api/matches/${matchId}/innings/${inningsId}/striker`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strikerId, nonStrikerId }),
    description: `Set batsmen: ${strikerId}, ${nonStrikerId}`,
    matchId,
    inningsId,
    type: 'set_striker',
  });
}

/**
 * Convenience method for setting bowler offline.
 */
export async function setBowlerOffline(
  matchId: string,
  inningsId: string,
  bowlerId: string
): Promise<{ data: any; offline: boolean; queuedItemId?: number }> {
  return offlineFetch(`/api/matches/${matchId}/innings/${inningsId}/bowler`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bowlerId }),
    description: `Set bowler: ${bowlerId}`,
    matchId,
    inningsId,
    type: 'set_bowler',
  });
}

/**
 * Convenience method for completing innings offline.
 */
export async function completeInningsOffline(
  matchId: string,
  inningsId: string
): Promise<{ data: any; offline: boolean; queuedItemId?: number }> {
  return offlineFetch(`/api/matches/${matchId}/innings/${inningsId}/complete`, {
    method: 'POST',
    description: 'Complete innings',
    matchId,
    inningsId,
    type: 'complete_innings',
  });
}

/**
 * Convenience method for completing match offline.
 */
export async function completeMatchOffline(
  matchId: string
): Promise<{ data: any; offline: boolean; queuedItemId?: number }> {
  return offlineFetch(`/api/matches/${matchId}/complete`, {
    method: 'POST',
    description: 'Complete match',
    matchId,
    type: 'complete_match',
  });
}

/**
 * Convenience method for creating innings offline.
 */
export async function createInningsOffline(
  matchId: string,
  data: { teamId: string; inningsNumber: number; target?: number }
): Promise<{ data: any; offline: boolean; queuedItemId?: number }> {
  return offlineFetch(`/api/matches/${matchId}/innings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    description: `Create innings ${data.inningsNumber}`,
    matchId,
    type: 'create_innings',
  });
}
