import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDbSchema } from '@/lib/db-bootstrap';
import { embedSnapshot, type HubMatchLike } from '@/lib/live-hub';

export const dynamic = 'force-dynamic';

/**
 * v2 §15.6 — GET /api/embed/match/[id]
 * Compact JSON snapshot for the embeddable widget (also accepts ?code=).
 * Public read. The widget's SSE/poll loop refetches this.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbSchema();
    const { id } = await params;
    const url = new URL(request.url);
    const code = url.searchParams.get('code')?.replace(/^GS-/i, '').toUpperCase();

    const match = await db.match.findFirst({
      where: code ? { liveCode: code } : { id },
      include: {
        team1: true,
        team2: true,
        innings: {
          include: {
            team: true,
            balls: { orderBy: { deliveryNumber: 'asc' } },
            batting: { include: { player: true } },
            bowling: { include: { player: true } },
          },
          orderBy: { inningsNumber: 'asc' },
        },
      },
    });

    if (!match) {
      return NextResponse.json({ ok: false, error: 'Match not found' }, { status: 404 });
    }

    return NextResponse.json(
      embedSnapshot(match as unknown as HubMatchLike),
      { headers: { 'Cache-Control': 'public, max-age=3' } }
    );
  } catch (error) {
    console.error('Error building embed snapshot:', error);
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}
