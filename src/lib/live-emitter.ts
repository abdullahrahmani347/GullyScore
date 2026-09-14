import { EventEmitter } from 'events';
import { isPersistedSseType } from './sse-events';

/**
 * GULLYSCORE v2 §15.7 — LIVE EMITTER v2 (SSE event bus + DB event log)
 * ---------------------------------------------------------------------------
 * In-memory EventEmitter singleton for SSE fanout PLUS a DB-backed event
 * log (Prisma `SseEvent`) that gives every persisted event a monotonic id
 * and lets reconnecting clients replay what they missed (Last-Event-ID).
 *
 * Ephemeral events (reactions, heartbeats) are broadcast-only — they never
 * touch disk (§15.4: "anonymous, ephemeral, never persisted").
 *
 * Publish path is serialized through a single promise chain so SSE ids are
 * strictly monotonic in emission order even under concurrent writes.
 *
 * For multi-instance deployment, replace with Redis pub/sub + a shared log.
 */

import { db } from '@/lib/db';

const liveEmitter = new EventEmitter();
liveEmitter.setMaxListeners(500); // Allow many concurrent SSE connections

export interface LiveMatchEvent {
  /** v2 §15.7 — monotonic SSE id (SseEvent DB row id). Absent on ephemeral
   * events (reactions) and heartbeats — clients never replay those. */
  id?: number;
  type: string;
  matchId: string;
  data: Record<string, unknown>;
  timestamp: number;
}

/** Hub-wide listener context (§15.1 — the /live hub subscribes to all). */
export interface HubEvent {
  id?: number;
  type: string;
  matchId: string;
  data: Record<string, unknown>;
  timestamp: number;
}

// Serialize DB writes so ids are monotonic in emission order.
let writeChain: Promise<void> = Promise.resolve();

/**
 * Publish an event: persist to the DB log (monotonic id) then broadcast.
 * Returns the SSE id. Fire-and-forget callers use emitLiveEvent().
 */
export async function publishMatchEvent(
  matchId: string,
  event: { type: string; data: Record<string, unknown> }
): Promise<number> {
  const type = event.type;
  const data = JSON.stringify(event.data ?? {});

  let eventId = 0;
  writeChain = writeChain
    .then(async () => {
      if (!isPersistedSseType(type)) return; // ephemeral — no row
      const row = await db.sseEvent.create({
        data: { matchId, type, data },
      });
      eventId = Number(row.id);
    })
    .catch((err) => {
      console.error('[live-emitter] SseEvent log write failed:', err);
    });

  await writeChain;

  const fullEvent: LiveMatchEvent = {
    id: eventId || undefined,
    type,
    matchId,
    data: event.data ?? {},
    timestamp: Date.now(),
  };
  liveEmitter.emit(`match:${matchId}`, fullEvent);
  liveEmitter.emit('hub', fullEvent);
  return eventId;
}

/**
 * Publish an ephemeral event (reactions): broadcast only, never persisted,
 * no SSE id. Returns immediately.
 */
export function publishEphemeralEvent(
  matchId: string,
  event: { type: string; data: Record<string, unknown> }
): void {
  const fullEvent: LiveMatchEvent = {
    type: event.type,
    matchId,
    data: event.data ?? {},
    timestamp: Date.now(),
  };
  liveEmitter.emit(`match:${matchId}`, fullEvent);
  liveEmitter.emit('hub', fullEvent);
}

/**
 * v2 §15.7 — replay missed events from the DB event log.
 * Returns events with id > afterId for the match, oldest first.
 */
export async function replaySseEvents(
  matchId: string,
  afterId: number,
  limit = 500
): Promise<LiveMatchEvent[]> {
  const rows = await db.sseEvent.findMany({
    where: { matchId, id: { gt: afterId } },
    orderBy: { id: 'asc' },
    take: limit,
  });
  return rows.map((row) => ({
    id: Number(row.id),
    type: row.type,
    matchId: row.matchId,
    data: safeParse(row.data),
    timestamp: row.createdAt.getTime(),
  }));
}

function safeParse(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Legacy-compatible sync publish (used by the scoring write paths).
 * Persists + broadcasts without blocking the caller; log failures degrade
 * to broadcast-only (spectators still get the live event, only replay of
 * that one event is lost).
 */
export function emitLiveEvent(
  matchId: string,
  event: { type: string; data: Record<string, unknown> }
): void {
  if (isPersistedSseType(event.type)) {
    void publishMatchEvent(matchId, event).catch((err) => {
      console.error('[live-emitter] publish failed:', err);
    });
  } else {
    publishEphemeralEvent(matchId, event);
  }
}

/** Subscribe to live events for a specific match. Returns unsubscribe. */
export function subscribeToMatch(
  matchId: string,
  listener: (event: LiveMatchEvent) => void
): () => void {
  const channel = `match:${matchId}`;
  liveEmitter.on(channel, listener);
  return () => {
    liveEmitter.off(channel, listener);
  };
}

/** v2 §15.1 — subscribe to ALL match events (hub stream). Returns unsubscribe. */
export function subscribeToAll(listener: (event: HubEvent) => void): () => void {
  liveEmitter.on('hub', listener);
  return () => {
    liveEmitter.off('hub', listener);
  };
}

/** Generate a unique 6-character alphanumeric code (excludes ambiguous chars: 0/O, 1/I/L) */
export function generateLiveCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export { liveEmitter };
