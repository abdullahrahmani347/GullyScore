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
    const { status, tossWinnerId, tossDecision, currentInnings } = body;

    const match = await db.match.update({
      where: { id },
      data: {
        ...(status !== undefined && { status }),
        ...(tossWinnerId !== undefined && { tossWinnerId }),
        ...(tossDecision !== undefined && { tossDecision }),
        ...(currentInnings !== undefined && { currentInnings }),
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
