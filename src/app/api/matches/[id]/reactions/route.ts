import { NextResponse } from 'next/server';
import { withFeatureFlag } from '@/lib/api-flag';
import { queueReaction } from '@/lib/reactions';
import { db } from '@/lib/db';
import { ensureDbSchema } from '@/lib/db-bootstrap';

export const dynamic = 'force-dynamic';

/**
 * v2 §15.4 — POST /api/matches/[id]/reactions
 * Body: { emoji: string, count?: number } (count from the 1 s client-side
 * debounce batch; capped server-side).
 * Anonymous + ephemeral: no auth, nothing persisted. The server coalesces
 * 1 s and broadcasts SSE `reaction` events.
 * Flag-gated: `reactions` off → 404.
 */
export const POST = withFeatureFlag(
  'reactions',
  async (
    request: Request,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    try {
      await ensureDbSchema();
      const { id: matchId } = await params;

      const match = await db.match.findUnique({ where: { id: matchId }, select: { id: true } });
      if (!match) {
        return NextResponse.json({ error: 'Match not found' }, { status: 404 });
      }

      const body = await request.json().catch(() => null);
      const emoji = typeof body?.emoji === 'string' ? body.emoji : '';
      const count = Math.min(Math.max(Number(body?.count) || 1, 1), 10);

      if (!queueReaction(matchId, emoji)) {
        return NextResponse.json({ error: 'Unknown reaction' }, { status: 422 });
      }
      for (let i = 1; i < count; i++) queueReaction(matchId, emoji);

      return NextResponse.json({ ok: true, coalesced: true, emoji });
    } catch (error) {
      console.error('Error queueing reaction:', error);
      return NextResponse.json({ error: 'Failed to queue reaction' }, { status: 500 });
    }
  }
);
