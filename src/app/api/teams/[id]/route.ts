import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const team = await db.team.findUnique({
      where: { id },
      include: { players: true },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Calculate career stats
    const matchesAsTeam1 = await db.match.findMany({
      where: { team1Id: id, status: 'COMPLETED' },
      include: { innings: true },
    });
    const matchesAsTeam2 = await db.match.findMany({
      where: { team2Id: id, status: 'COMPLETED' },
      include: { innings: true },
    });

    const allMatches = [...matchesAsTeam1, ...matchesAsTeam2];
    const totalMatches = allMatches.length;
    let wins = 0;
    let losses = 0;

    for (const match of allMatches) {
      if (match.winnerId === id) {
        wins++;
      } else if (match.winnerId) {
        losses++;
      }
    }

    return NextResponse.json({
      ...team,
      stats: { totalMatches, wins, losses },
    });
  } catch (error) {
    console.error('Error fetching team:', error);
    return NextResponse.json({ error: 'Failed to fetch team' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, shortName, color, emoji } = body;

    const team = await db.team.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(shortName !== undefined && { shortName }),
        ...(color !== undefined && { color }),
        ...(emoji !== undefined && { emoji }),
      },
      include: { players: true },
    });

    return NextResponse.json(team);
  } catch (error) {
    console.error('Error updating team:', error);
    return NextResponse.json({ error: 'Failed to update team' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.team.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting team:', error);
    return NextResponse.json({ error: 'Failed to delete team' }, { status: 500 });
  }
}
