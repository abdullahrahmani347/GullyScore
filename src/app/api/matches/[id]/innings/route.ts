import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { teamId, inningsNumber, target } = body;

    if (!teamId || !inningsNumber) {
      return NextResponse.json(
        { error: 'teamId and inningsNumber are required' },
        { status: 400 }
      );
    }

    const match = await db.match.findUnique({ where: { id } });
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const innings = await db.innings.create({
      data: {
        matchId: id,
        teamId,
        inningsNumber,
        target: target || null,
      },
    });

    // Update match to LIVE and set current innings
    await db.match.update({
      where: { id },
      data: {
        status: 'LIVE',
        currentInnings: inningsNumber,
      },
    });

    return NextResponse.json(innings, { status: 201 });
  } catch (error) {
    console.error('Error creating innings:', error);
    return NextResponse.json({ error: 'Failed to create innings' }, { status: 500 });
  }
}
