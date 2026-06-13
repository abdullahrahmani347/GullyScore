import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

const inningsInclude = {
  team: { include: { players: true } },
  batting: { include: { player: true }, orderBy: { battingOrder: 'asc' as const } },
  bowling: { include: { player: true } },
  balls: { orderBy: { deliveryNumber: 'asc' as const } },
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    const where: Record<string, unknown> = {};
    if (status) {
      where.status = status;
    }

    const matches = await db.match.findMany({
      where,
      include: {
        team1: { include: { players: true } },
        team2: { include: { players: true } },
        innings: { include: inningsInclude },
      },
      orderBy: { createdAt: 'desc' },
      ...(limit ? { take: limit } : {}),
    });

    return NextResponse.json(matches);
  } catch (error) {
    console.error('Error fetching matches:', error);
    return NextResponse.json({ error: 'Failed to fetch matches' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { team1Id, team2Id, totalOvers, maxWickets, venue, tournamentId } = body;

    if (!team1Id || !team2Id || !totalOvers) {
      return NextResponse.json(
        { error: 'team1Id, team2Id, and totalOvers are required' },
        { status: 400 }
      );
    }

    if (team1Id === team2Id) {
      return NextResponse.json(
        { error: 'Team 1 and Team 2 must be different' },
        { status: 400 }
      );
    }

    const match = await db.match.create({
      data: {
        team1Id,
        team2Id,
        totalOvers,
        maxWickets: maxWickets || 10,
        venue: venue || null,
        tournamentId: tournamentId || null,
      },
      include: {
        team1: { include: { players: true } },
        team2: { include: { players: true } },
        innings: true,
      },
    });

    return NextResponse.json(match, { status: 201 });
  } catch (error) {
    console.error('Error creating match:', error);
    return NextResponse.json({ error: 'Failed to create match' }, { status: 500 });
  }
}
