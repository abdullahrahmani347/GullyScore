import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { generateRoundRobinSchedule } from '@/lib/scoring-utils';

export async function GET() {
  try {
    const tournaments = await db.tournament.findMany({
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
    const body = await request.json();
    const { name, format, totalOvers, teamIds } = body;

    if (!name || !format || !teamIds || teamIds.length < 2) {
      return NextResponse.json(
        { error: 'name, format, and at least 2 teamIds are required' },
        { status: 400 }
      );
    }

    // Create tournament with teams
    const tournament = await db.tournament.create({
      data: {
        name,
        format,
        totalOvers: totalOvers || 10,
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
