import { subscribeToMatch } from '@/lib/live-emitter';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * SSE endpoint: /api/matches/[id]/stream
 * Returns text/event-stream with real-time match updates.
 * Also sends initial state on connect so spectators see current score immediately.
 *
 * NOTE: This endpoint does NOT verify device ownership. This is intentional —
 * spectators with a live code should be able to watch the match without
 * needing the creator's device ID. The live code itself serves as the
 * access token for spectator viewing. If stricter privacy is needed,
 * add a liveCode query parameter check here.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: matchId } = await params;

  // Verify match exists
  const match = await db.match.findUnique({ where: { id: matchId } });
  if (!match) {
    return new Response('Match not found', { status: 404 });
  }

  const encoder = new TextEncoder();

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    start(controller) {
      // Send initial match state
      const sendEvent = (eventName: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Stream may be closed
        }
      };

      // Send initial full state
      const sendInitialState = async () => {
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
            sendEvent('init', fullMatch);
          }
        } catch (err) {
          console.error('Error sending initial state:', err);
        }
      };

      sendInitialState();

      // Subscribe to live events
      const unsubscribe = subscribeToMatch(matchId, (event) => {
        sendEvent('update', event);
      });

      // Send keepalive every 25 seconds to prevent connection timeout
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(':keepalive\n\n'));
        } catch {
          clearInterval(keepalive);
        }
      }, 25000);

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        unsubscribe();
        clearInterval(keepalive);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
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
