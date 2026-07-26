import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { ensureDbSchema } from '@/lib/db-bootstrap';

/**
 * GET /api/live/[code]
 * Resolves a live code (e.g. "X7KP2") to the match data.
 * Used by spectator pages to find the match from the shareable code.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    await ensureDbSchema();
    const { code } = await params;

    // Normalize: remove "GS-" prefix if present, uppercase
    const normalizedCode = code.replace(/^GS-/i, '').toUpperCase();

    const match = await db.match.findUnique({
      where: { liveCode: normalizedCode },
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

    if (!match) {
      return NextResponse.json(
        { error: 'Match not found. Check the code and try again.' },
        { status: 404 }
      );
    }

    return NextResponse.json(match);
  } catch (error) {
    console.error('Error resolving live code:', error);
    return NextResponse.json({ error: 'Failed to resolve code' }, { status: 500 });
  }
}
