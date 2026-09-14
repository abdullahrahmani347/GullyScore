import { publishEphemeralEvent } from './live-emitter';

/**
 * GULLYSCORE v2 §15.4 — SPECTATOR REACTIONS (server-side coalescing)
 * ---------------------------------------------------------------------------
 * Six floating emoji reactions. POSTs are coalesced server-side in a 1 s
 * window per match, then broadcast as SSE `reaction` events.
 * Anonymous, ephemeral, NEVER persisted — no rows, no device ids, the
 * in-memory window is the only state and it dies with the flush.
 */

export const REACTION_EMOJIS = ['👍', '❤️', '😮', '😂', '👏', '🔥'] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

const WINDOW_MS = 1_000;
const MAX_PER_EMOJI_PER_WINDOW = 50; // abuse cap

const windows = new Map<string, Map<string, number>>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function isReactionEmoji(emoji: string): emoji is ReactionEmoji {
  return (REACTION_EMOJIS as readonly string[]).includes(emoji);
}

/** Queue a reaction; returns false for unknown emoji. */
export function queueReaction(matchId: string, emoji: string): boolean {
  if (!isReactionEmoji(emoji)) return false;

  let window = windows.get(matchId);
  if (!window) {
    window = new Map();
    windows.set(matchId, window);
  }
  const next = Math.min((window.get(emoji) ?? 0) + 1, MAX_PER_EMOJI_PER_WINDOW);
  window.set(emoji, next);

  if (!timers.has(matchId)) {
    timers.set(
      matchId,
      setTimeout(() => {
        flushReactions(matchId);
      }, WINDOW_MS)
    );
  }
  return true;
}

/** Flush the coalescing window → one ephemeral SSE event per emoji. */
function flushReactions(matchId: string): void {
  timers.delete(matchId);
  const window = windows.get(matchId);
  if (!window) return;
  windows.delete(matchId);
  for (const [emoji, count] of window) {
    publishEphemeralEvent(matchId, {
      type: 'reaction',
      data: { emoji, count },
    });
  }
}

/** Test/introspection helper: pending reactions for a match. */
export function pendingReactions(matchId: string): Record<string, number> {
  const window = windows.get(matchId);
  return window ? Object.fromEntries(window) : {};
}
