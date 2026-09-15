import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDbSchema } from '@/lib/db-bootstrap';
import { verifyOwnership, isAuthorized } from '@/lib/api-auth';

/**
 * v2 §16.3 — GET /api/matches/[id]/events?since=<deliveryNumber>
 *
 * Server-truth event log (all innings of the match) after the given
 * deliveryNumber, oldest first. Powers the client's conflict sheet:
 * when a scored ball POST reports `divergence`, the client fetches the
 * events it is missing/diverged from and offers "apply server".
 *
 * Response shape (minimal — enough to diff and display):
 * { matchId, inningsId, events: [{ inningsId, deliveryNumber, batsmanId,
 *   bowlerId, runs, extraRuns, extraType, isWicket, wicketType,
 *   clientEventId, timestamp, deletedAt }] }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbSchema();
    const { id } = await params;
    const since = Number(new URL(request.url).searchParams.get('since') ?? 0);

    const match = await db.match.findUnique({
      where: { id },
      select: { deviceId: true, innings: { select: { id: true, inningsNumber: true } } },
    });
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const ownership = verifyOwnership(request, match.deviceId);
    if (!isAuthorized(ownership)) {
      return ownership;
    }

    const events = await db.ball.findMany({
      where: {
        inningsId: { in: match.innings.map((i) => i.id) },
        deliveryNumber: { gt: Number.isFinite(since) ? since : 0 },
      },
      orderBy: { deliveryNumber: 'asc' },
      select: {
        inningsId: true,
        deliveryNumber: true,
        batsmanId: true,
        bowlerId: true,
        runs: true,
        extraRuns: true,
        extraType: true,
        isWicket: true,
        wicketType: true,
        clientEventId: true,
        timestamp: true,
        deletedAt: true,
      },
    });

    return NextResponse.json(
      { matchId: id, inningsId: match.innings.at(-1)?.id ?? null, events },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Error fetching match events:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}
