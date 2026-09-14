import { EventEmitter } from 'events';

/**
 * In-memory event emitter for Server-Sent Events (SSE).
 * Singleton pattern — all modules import the same instance.
 *
 * Events emitted:
 *   match:<matchId>  —  sent after every ball recording, innings break, match completion
 *
 * For multi-instance deployment, replace with Redis pub/sub.
 */

const liveEmitter = new EventEmitter();
liveEmitter.setMaxListeners(200); // Allow many concurrent SSE connections

export interface LiveMatchEvent {
  type:
    | 'ball'
    | 'wicket'
    | 'over_complete'
    | 'innings_break'
    | 'match_complete'
    | 'match_abandoned'
    | 'status_change'
    | 'undo' // v2 §12.7 tombstone undo
    | 'redo' // v2 §12.7 redo
    | 'ball_edited' // v2 §12.7 ball editor
    | 'target_adjusted'; // v2 §12.3 DLS banner
  matchId: string;
  data: Record<string, unknown>;
  timestamp: number;
}

/** Emit a live event for a specific match */
export function emitLiveEvent(matchId: string, event: Omit<LiveMatchEvent, 'matchId' | 'timestamp'>) {
  const fullEvent: LiveMatchEvent = {
    ...event,
    matchId,
    timestamp: Date.now(),
  };
  liveEmitter.emit(`match:${matchId}`, fullEvent);
}

/** Subscribe to live events for a specific match. Returns unsubscribe function. */
export function subscribeToMatch(matchId: string, listener: (event: LiveMatchEvent) => void): () => void {
  const channel = `match:${matchId}`;
  liveEmitter.on(channel, listener);
  return () => {
    liveEmitter.off(channel, listener);
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
