import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const match = await db.match.findUnique({
      where: { id },
      include: {
        team1: { include: { players: true } },
        team2: { include: { players: true } },
        innings: {
          include: {
            team: { include: { players: true } },
            batting: { include: { player: true }, orderBy: { battingOrder: 'asc' } },
            bowling: { include: { player: true } },
            balls: { orderBy: { deliveryNumber: 'asc' } },
          },
          orderBy: { inningsNumber: 'asc' },
        },
      },
    });

    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    return NextResponse.json(match);
  } catch (error) {
    console.error('Error fetching match:', error);
    return NextResponse.json({ error: 'Failed to fetch match' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, tossWinnerId, tossDecision, currentInnings, result, winnerId } = body;

    // Handle match abandon
    if (status === 'ABANDONED') {
      const updatedMatch = await db.match.update({
        where: { id },
        data: {
          status: 'ABANDONED',
          result: result || 'Match abandoned',
          completedAt: new Date(),
        },
        include: {
          team1: { include: { players: true } },
          team2: { include: { players: true } },
          innings: {
            include: {
              team: { include: { players: true } },
              batting: { include: { player: true } },
              bowling: { include: { player: true } },
              balls: { orderBy: { deliveryNumber: 'asc' } },
            },
            orderBy: { inningsNumber: 'asc' },
          },
        },
      });
      return NextResponse.json(updatedMatch);
    }

    const match = await db.match.update({
      where: { id },
      data: {
        ...(status !== undefined && { status }),
        ...(tossWinnerId !== undefined && { tossWinnerId }),
        ...(tossDecision !== undefined && { tossDecision }),
        ...(currentInnings !== undefined && { currentInnings }),
        ...(result !== undefined && { result }),
        ...(winnerId !== undefined && { winnerId }),
      },
      include: {
        team1: { include: { players: true } },
        team2: { include: { players: true } },
        innings: {
          include: {
            team: { include: { players: true } },
            batting: { include: { player: true } },
            bowling: { include: { player: true } },
            balls: { orderBy: { deliveryNumber: 'asc' } },
          },
          orderBy: { inningsNumber: 'asc' },
        },
      },
    });

    return NextResponse.json(match);
  } catch (error) {
    console.error('Error updating match:', error);
    return NextResponse.json({ error: 'Failed to update match' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const match = await db.match.findUnique({ where: { id } });
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    // Prevent deletion of live matches
    if (match.status === 'LIVE' || match.status === 'INNINGS_BREAK') {
      return NextResponse.json(
        { error: 'Cannot delete a live match. Abandon it first.' },
        { status: 400 }
      );
    }

    await db.match.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting match:', error);
    return NextResponse.json({ error: 'Failed to delete match' }, { status: 500 });
  }
}
