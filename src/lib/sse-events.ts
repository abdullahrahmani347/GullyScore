/**
 * GULLYSCORE v2 §15.7 — SSE v2 EVENT REGISTRY
 * ---------------------------------------------------------------------------
 * The typed registry for every event the SSE layer can emit.
 *
 * Six spec families:
 *   ball      — a delivery + its delta aggregates
 *               ('ball', 'wicket', 'over_complete')
 *   state     — a full-state resync signal (after undo/edit)
 *               ('undo', 'redo', 'ball_edited', 'status_change',
 *                'target_adjusted', 'innings_break' → also 'innings')
 *   innings   — innings lifecycle ('innings_break', 'match_complete',
 *               'match_abandoned')
 *   wp        — win-probability updates (embedded per-ball; standalone type
 *               reserved for future wp-only pushes)
 *   reaction  — spectator emoji reactions (EPHEMERAL — never persisted)
 *   heartbeat — 25 s keepalive (EPHEMERAL — never persisted)
 *
 * Replay contract: every PERSISTED event gets a monotonic SSE id from the
 * SseEvent DB log (global autoincrement — effectively a
 * deliveryNumber-anchored sequence, since ball events are appended in
 * scoring order). Clients that reconnect with Last-Event-ID get exactly
 * the events with id > lastEventId replayed from the DB.
 */

export const SSE_EVENT_TYPES = [
  'ball',
  'wicket',
  'over_complete',
  'innings_break',
  'match_complete',
  'match_abandoned',
  'status_change',
  'undo',
  'redo',
  'ball_edited',
  'target_adjusted',
  'wp',
  'reaction',
  'heartbeat',
] as const;

export type SseEventType = (typeof SSE_EVENT_TYPES)[number];

export type SseEventFamily = 'ball' | 'state' | 'innings' | 'wp' | 'reaction' | 'heartbeat';

/** Registry: event type → spec family. Unknown types map to 'state' (safe
 * default — clients resync full state, which is always correct). */
export const SSE_EVENT_FAMILY: Record<SseEventType, SseEventFamily> = {
  ball: 'ball',
  wicket: 'ball',
  over_complete: 'ball',
  innings_break: 'innings',
  match_complete: 'innings',
  match_abandoned: 'innings',
  status_change: 'state',
  undo: 'state',
  redo: 'state',
  ball_edited: 'state',
  target_adjusted: 'state',
  wp: 'wp',
  reaction: 'reaction',
  heartbeat: 'heartbeat',
};

/** Events persisted to the SseEvent DB log (replayable). */
export const PERSISTED_SSE_TYPES: ReadonlySet<string> = new Set<string>([
  'ball',
  'wicket',
  'over_complete',
  'innings_break',
  'match_complete',
  'match_abandoned',
  'status_change',
  'undo',
  'redo',
  'ball_edited',
  'target_adjusted',
  // 'wp' standalone is reserved; per-ball wp rides on ball events (persisted)
]);

/** Events that are broadcast-only: reactions + heartbeats never touch disk. */
export const EPHEMERAL_SSE_TYPES: ReadonlySet<string> = new Set<string>([
  'reaction',
  'heartbeat',
]);

export function isPersistedSseType(type: string): boolean {
  return PERSISTED_SSE_TYPES.has(type);
}

/** Family of an (possibly unknown) event type — 'state' fallback. */
export function sseFamilyOf(type: string): SseEventFamily {
  if ((SSE_EVENT_FAMILY as Record<string, SseEventFamily>)[type]) {
    return (SSE_EVENT_FAMILY as Record<string, SseEventFamily>)[type];
  }
  return 'state';
}

/**
 * The event types that should trigger a spectator full refetch
 * (state families carry authoritative state; ball families do too, since
 * the UI shows aggregates). Ephemeral families do not.
 */
export function shouldRefetch(type: string): boolean {
  const family = sseFamilyOf(type);
  return family !== 'reaction' && family !== 'heartbeat';
}

/** Heartbeat interval for SSE connections (ms). */
export const SSE_HEARTBEAT_MS = 25_000;

/** Client reconnect backoff: 1 s → 30 s (doubling, capped). */
export function reconnectDelay(attempt: number): number {
  const ms = 1000 * Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(ms, 30_000);
}
