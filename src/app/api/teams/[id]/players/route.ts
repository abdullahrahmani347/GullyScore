import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { verifyOwnership, isAuthorized } from '@/lib/api-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify team ownership before adding players
    const team = await db.team.findUnique({ where: { id } });
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const ownership = verifyOwnership(request, team.deviceId);
    if (!isAuthorized(ownership)) {
      return ownership;
    }

    const body = await request.json();
    const { name, jerseyNumber } = body;

    if (!name) {
      return NextResponse.json({ error: 'Player name is required' }, { status: 400 });
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
