import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getDeviceIdFromRequest } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    // Get deviceId from request header for filtering
    const deviceId = getDeviceIdFromRequest(request);

    const where: Record<string, unknown> = {};
    // Filter by deviceId - only show teams belonging to this device
    if (deviceId) {
      where.deviceId = deviceId;
    }

    const teams = await db.team.findMany({
      where,
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

    // Get deviceId from request header
    const deviceId = getDeviceIdFromRequest(request);
    if (!deviceId) {
      return NextResponse.json(
        { error: 'Device identification required. Please refresh the page.' },
        { status: 401 }
      );
    }

    const team = await db.team.create({
      data: {
        name,
        shortName,
        color: color || '#00D4AA',
        emoji: emoji || '🏏',
        deviceId,
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
