import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, jerseyNumber } = body;

    if (!name) {
      return NextResponse.json({ error: 'Player name is required' }, { status: 400 });
    }

    // Verify team exists
    const team = await db.team.findUnique({ where: { id } });
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const player = await db.player.create({
      data: {
        name,
        teamId: id,
        jerseyNumber: jerseyNumber || null,
      },
    });

    return NextResponse.json(player, { status: 201 });
  } catch (error) {
    console.error('Error adding player:', error);
    return NextResponse.json({ error: 'Failed to add player' }, { status: 500 });
  }
}
