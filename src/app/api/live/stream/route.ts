import { subscribeToAll, type HubEvent } from '@/lib/live-emitter';
import { SSE_HEARTBEAT_MS, shouldRefetch } from '@/lib/sse-events';

export const dynamic = 'force-dynamic';

/**
 * v2 §15.1 — SSE endpoint: /api/live/stream
 * Hub-wide stream: every match event, filtered to the ones that change the
 * hub cards. Clients refetch /api/live (debounced) on receipt.
 * Heartbeat every 25 s keeps proxies from idling the connection out.
 */
export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      send('retry: 2000\n\n');
      send(`event: hello\ndata: ${JSON.stringify({ t: Date.now() })}\n\n`);

      const unsubscribe = subscribeToAll((event: HubEvent) => {
        // Ephemeral families (reaction/heartbeat) never change hub cards.
        if (!shouldRefetch(event.type)) return;
        send(
          `event: update\ndata: ${JSON.stringify({
            matchId: event.matchId,
            type: event.type,
            id: event.id ?? null,
          })}\n\n`
        );
      });

      const heartbeat = setInterval(() => {
        if (closed) {
          clearInterval(heartbeat);
          return;
        }
        send(`event: heartbeat\ndata: ${JSON.stringify({ t: Date.now() })}\n\n`);
      }, SSE_HEARTBEAT_MS);

      request.signal.addEventListener('abort', () => {
        closed = true;
        unsubscribe();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
