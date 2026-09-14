import {
  subscribeToMatch,
  replaySseEvents,
  type LiveMatchEvent,
} from '@/lib/live-emitter';
import { SSE_HEARTBEAT_MS } from '@/lib/sse-events';
import { db } from '@/lib/db';
import { ensureDbSchema } from '@/lib/db-bootstrap';

export const dynamic = 'force-dynamic';

/**
 * v2 §15.7 — SSE endpoint: /api/matches/[id]/stream
 *
 * Event framing:
 *   id: <monotonic SseEvent id>     (persisted events only)
 *   event: ball|wicket|over_complete|innings_break|match_complete|…
 *   data: {...}
 *   event: heartbeat                (every 25 s, no id — never replayed)
 *   retry: 1000                     (reconnect hint; client uses 1 s→30 s
 *                                    backoff, see hooks/useLiveStream.ts)
 *
 * Replay: a client that reconnects with `Last-Event-ID: n` (header, sent
 * automatically by EventSource on auto-reconnect) or `?lastEventId=n`
 * (manual backoff reconnect) gets every persisted event with id > n
 * replayed from the DB event log BEFORE the live subscription is attached
 * live — no missed balls during a subway ride.
 *
 * NOTE: no device-ownership check — the live code is the spectator access
 * token (same policy as /api/live/[code]).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: matchId } = await params;

  // Auto-create SQLite schema if missing (serverless cold-start safety).
  await ensureDbSchema();

  // Verify match exists
  const match = await db.match.findUnique({ where: { id: matchId } });
  if (!match) {
    return new Response('Match not found', { status: 404 });
  }

  // ── Last-Event-ID (header first, then query param for manual reconnects)
  const url = new URL(request.url);
  const headerId = request.headers.get('last-event-id');
  const queryId = url.searchParams.get('lastEventId');
  const lastEventId = parseLastEventId(headerId) ?? parseLastEventId(queryId) ?? null;

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const sendEvent = (event: LiveMatchEvent) => {
        const idLine = event.id != null ? `id: ${event.id}\n` : '';
        send(`${idLine}event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      };

      const sendNamed = (name: string, data: unknown, id?: number) => {
        const idLine = id != null ? `id: ${id}\n` : '';
        send(`${idLine}event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      // Reconnect hint for native EventSource auto-retry (v2 clients use
      // their own 1 s→30 s backoff; this keeps v1 pages resilient too).
      send('retry: 1000\n\n');

      if (lastEventId != null) {
        // ── RECONNECT: replay missed events, gap-free ──────────────────────
        // Buffer live events while we query the DB so nothing published in
        // between is lost, then flush the buffer past the replay cursor.
        const buffer: LiveMatchEvent[] = [];
        let live = false;
        const unsubscribe = subscribeToMatch(matchId, (event) => {
          if (live) sendEvent(event);
          else buffer.push(event);
        });

        let replayed: LiveMatchEvent[] = [];
        try {
          replayed = await replaySseEvents(matchId, lastEventId);
        } catch (err) {
          console.error('[sse] replay query failed:', err);
        }
        for (const event of replayed) sendEvent(event);
        const maxSeen = replayed.length
          ? Math.max(...replayed.map((e) => e.id ?? 0))
          : lastEventId;
        // Flush buffered events not covered by the replay (dedupe by id).
        for (const event of buffer) {
          if ((event.id ?? 0) > maxSeen) sendEvent(event);
        }
        live = true;
        if (closed) unsubscribe();
        request.signal.addEventListener('abort', () => {
          closed = true;
          unsubscribe();
          clearInterval(heartbeat);
          try {
            controller.close();
          } catch {}
        });
      } else {
        // ── FRESH CONNECT: initial full state, then live events ────────────
        try {
          const fullMatch = await db.match.findUnique({
            where: { id: matchId },
            include: {
              team1: { include: { players: true } },
              team2: { include: { players: true } },
              innings: {
                include: {
                  team: { include: { players: true } },
                  batting: { include: { player: true }, orderBy: { battingOrder: 'asc' } },
                  bowling: { include: { player: true } },
                  balls: { orderBy: { deliveryNumber: 'asc' } },
                  partnerships: {
                    include: { batsman1: true, batsman2: true },
                    orderBy: { wicketNumber: 'desc' },
                  },
                },
                orderBy: { inningsNumber: 'asc' },
              },
            },
          });

          if (fullMatch) {
            delete (fullMatch as { organizerPinHash?: string }).organizerPinHash;
            sendNamed('init', fullMatch);
          }
        } catch (err) {
          console.error('Error sending initial state:', err);
        }

        const unsubscribe = subscribeToMatch(matchId, (event) => {
          sendEvent(event);
        });

        request.signal.addEventListener('abort', () => {
          closed = true;
          unsubscribe();
          clearInterval(heartbeat);
          try {
            controller.close();
          } catch {}
        });
      }

      // ── Heartbeat (§15.7): typed 25 s keepalive, no id (never replayed)
      const heartbeat = setInterval(() => {
        if (closed) {
          clearInterval(heartbeat);
          return;
        }
        try {
          send(`event: heartbeat\ndata: ${JSON.stringify({ t: Date.now() })}\n\n`);
        } catch {
          clearInterval(heartbeat);
        }
      }, SSE_HEARTBEAT_MS);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}

function parseLastEventId(raw: string | null): number | null {
  if (raw == null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}
