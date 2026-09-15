import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDbSchema } from '@/lib/db-bootstrap';
import { verifyOwnership, isAuthorized } from '@/lib/api-auth';
import { drawLots } from '@/lib/standings';

/**
 * v2 §17.3 — POST /api/tournaments/[id]/draw-lots
 *
 * Organizer "drawing of lots" tool: randomises the final order of a fully
 * tied group and persists it on the tournament (lotsOrder JSON). The points
 * table then ranks the group by the drawn order. Body: { teamIds: string[] }.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbSchema();
    const { id } = await params;
    const tournament = await db.tournament.findUnique({ where: { id } });
    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const ownership = verifyOwnership(request, tournament.deviceId);
    if (!isAuthorized(ownership)) {
      return ownership;
    }

    const body = await request.json();
    const teamIds: unknown = body?.teamIds;
    if (!Array.isArray(teamIds) || teamIds.length < 2 || !teamIds.every((t) => typeof t === 'string')) {
      return NextResponse.json({ error: 'teamIds must be an array of 2+ team ids' }, { status: 400 });
    }

    const drawn = drawLots(teamIds as string[]);

    // Merge with any existing lots order (keep previously drawn positions).
    let merged = drawn;
    if (tournament.lotsOrder) {
      try {
        const existing = JSON.parse(tournament.lotsOrder) as string[];
        if (Array.isArray(existing)) {
          merged = [...existing.filter((t) => !drawn.includes(t)), ...drawn];
        }
      } catch {
        // replace malformed lots order
      }
    }

    await db.tournament.update({
      where: { id },
      data: { lotsOrder: JSON.stringify(merged) },
    });

    return NextResponse.json({ lotsOrder: merged });
  } catch (error) {
    console.error('Error drawing lots:', error);
    return NextResponse.json({ error: 'Failed to draw lots' }, { status: 500 });
  }
}
