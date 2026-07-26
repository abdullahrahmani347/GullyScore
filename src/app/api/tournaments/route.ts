import { db } from '@/lib/db';
import { ensureDbSchema } from '@/lib/db-bootstrap';
import { NextRequest, NextResponse } from 'next/server';
import { generateRoundRobinSchedule } from '@/lib/scoring-utils';
import { getDeviceIdFromRequest } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
   await ensureDbSchema();
    await ensureDbSchema();
    // Get deviceId from request header for filtering
    const deviceId = getDeviceIdFromRequest(request);

    const where: Record<string, unknown> = {};
    // Filter by deviceId - only show tournaments belonging to this device
    if (deviceId) {
      where.deviceId = deviceId;
    }

    const tournaments = await db.tournament.findMany({
      where,
      include: {
        teams: { include: { team: true } },
        matches: {
          include: {
            team1: { include: { players: true } },
            team2: { include: { players: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = tournaments.map((t) => ({
      ...t,
      matchCount: t.matches.length,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching tournaments:', error);
    return NextResponse.json({ error: 'Failed to fetch tournaments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
   await ensureDbSchema();
    await ensureDbSchema();
    const body = await request.json();
    const { name, format, totalOvers, teamIds } = body;

    if (!name || !format || !teamIds || teamIds.length < 2) {
      return NextResponse.json(
        { error: 'name, format, and at least 2 teamIds are required' },
        { status: 400 }
      );
    }

    // Get deviceId from request header
    const deviceId = getDeviceIdFromRequest(request);
    if (!deviceId) {
      return NextResponse.json(
        { error: 'Device identification required. Please refresh the page.' },
        { status: 401 }
      );
    }

    // Verify all teams belong to this device
    for (const teamId of teamIds) {
      const team = await db.team.findUnique({ where: { id: teamId } });
      if (!team || (team.deviceId && team.deviceId !== deviceId)) {
        return NextResponse.json(
          { error: `Team not found or does not belong to this device.` },
          { status: 403 }
        );
      }
    }

    // Create tournament with teams
    const tournament = await db.tournament.create({
      data: {
        name,
        format,
        totalOvers: totalOvers || 10,
        deviceId,
        teams: {
          create: teamIds.map((teamId: string) => ({
            teamId,
          })),
        },
      },
      include: {
        teams: { include: { team: true } },
        matches: true,
      },
    });

    // Auto-generate schedule for round-robin format
    if (format === 'ROUND_ROBIN' && teamIds.length >= 2) {
      const schedule = generateRoundRobinSchedule(teamIds);

      for (const [team1Id, team2Id] of schedule) {
        await db.match.create({
          data: {
            team1Id,
            team2Id,
            totalOvers: tournament.totalOvers,
            tournamentId: tournament.id,
            deviceId,
          },
        });
      }
    }

    // Fetch the complete tournament with matches
    const completeTournament = await db.tournament.findUniqueOrThrow({
      where: { id: tournament.id },
      include: {
        teams: { include: { team: true } },
        matches: {
          include: {
            team1: { include: { players: true } },
            team2: { include: { players: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return NextResponse.json(completeTournament, { status: 201 });
  } catch (error) {
    console.error('Error creating tournament:', error);
    return NextResponse.json({ error: 'Failed to create tournament' }, { status: 500 });
  }
}
