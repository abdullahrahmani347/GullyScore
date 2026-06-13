import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    const teams = await db.team.findMany({
      include: { players: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(teams);
  } catch (error) {
    console.error('Error fetching teams:', error);
    return NextResponse.json({ error: 'Failed to fetch teams' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, shortName, color, emoji, players } = body;

    if (!name || !shortName) {
      return NextResponse.json({ error: 'Name and shortName are required' }, { status: 400 });
    }

    const team = await db.team.create({
      data: {
        name,
        shortName,
        color: color || '#00D4AA',
        emoji: emoji || '🏏',
        players: {
          create: (players || []).map((p: { name: string; jerseyNumber?: number }) => ({
            name: p.name,
            jerseyNumber: p.jerseyNumber,
          })),
        },
      },
      include: { players: true },
    });

    return NextResponse.json(team, { status: 201 });
  } catch (error) {
    console.error('Error creating team:', error);
    return NextResponse.json({ error: 'Failed to create team' }, { status: 500 });
  }
}
