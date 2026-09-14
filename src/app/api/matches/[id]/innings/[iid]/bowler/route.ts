import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { verifyOwnership, isAuthorized } from '@/lib/api-auth';
import { ensureDbSchema } from '@/lib/db-bootstrap';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; iid: string }> }
) {
  try {
    await ensureDbSchema();
    const { id, iid } = await params;

    // Verify match ownership
    const match = await db.match.findUnique({ where: { id } });
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const ownership = verifyOwnership(request, match.deviceId);
    if (!isAuthorized(ownership)) {
      return ownership;
    }

    const body = await request.json();
    const { bowlerId } = body;

    if (!bowlerId) {
      return NextResponse.json(
        { error: 'bowlerId is required' },
        { status: 400 }
      );
    }

    // v2 §14.8 — team-membership guard: the bowler must belong to the
    // FIELDING side (the team NOT batting in this innings).
    const inningsRow = await db.innings.findUnique({
      where: { id: iid },
      select: { teamId: true, matchId: true },
    });
    if (!inningsRow) {
      return NextResponse.json({ error: 'Innings not found' }, { status: 404 });
    }
    if (inningsRow.matchId !== id) {
      return NextResponse.json({ error: 'Innings does not belong to this match' }, { status: 400 });
    }
    const fieldingTeamId =
      inningsRow.teamId === match.team1Id ? match.team2Id : match.team1Id;
    const bowler = await db.player.findUnique({
      where: { id: bowlerId },
      select: { teamId: true },
    });
    if (!bowler || bowler.teamId !== fieldingTeamId) {
      return NextResponse.json(
        { error: 'Bowler must belong to the fielding team' },
        { status: 400 }
      );
    }

    const innings = await db.innings.update({
      where: { id: iid },
      data: {
        currentBowlerId: bowlerId,
      },
    });

    return NextResponse.json(innings);
  } catch (error) {
    console.error('Error setting bowler:', error);
    return NextResponse.json({ error: 'Failed to set bowler' }, { status: 500 });
  }
}
