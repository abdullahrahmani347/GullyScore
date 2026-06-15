import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { verifyOwnership, isAuthorized } from '@/lib/api-auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pid: string }> }
) {
  try {
    const { id, pid } = await params;

    // Verify team ownership
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

    const player = await db.player.update({
      where: { id: pid },
      data: {
        ...(name !== undefined && { name }),
        ...(jerseyNumber !== undefined && { jerseyNumber }),
      },
    });

    return NextResponse.json(player);
  } catch (error) {
    console.error('Error updating player:', error);
    return NextResponse.json({ error: 'Failed to update player' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pid: string }> }
) {
  try {
    const { id, pid } = await params;

    // Verify team ownership
    const team = await db.team.findUnique({ where: { id } });
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const ownership = verifyOwnership(request, team.deviceId);
    if (!isAuthorized(ownership)) {
      return ownership;
    }

    // Check if player has match history
    const hasBattingPerf = await db.batsmanInnings.count({ where: { playerId: pid } });
    const hasBowlingPerf = await db.bowlerInnings.count({ where: { playerId: pid } });
    const hasBallRecords = await db.ball.count({ where: { OR: [{ batsmanId: pid }, { bowlerId: pid }] } });

    if (hasBattingPerf > 0 || hasBowlingPerf > 0 || hasBallRecords > 0) {
      return NextResponse.json(
        { error: 'This player has match history and cannot be removed.' },
        { status: 400 }
      );
    }

    await db.player.delete({ where: { id: pid } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting player:', error);
    return NextResponse.json({ error: 'Failed to delete player' }, { status: 500 });
  }
}
