import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { verifyOwnership, isAuthorized } from '@/lib/api-auth';
import { ensureDbSchema } from '@/lib/db-bootstrap';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbSchema();
    const { id } = await params;
    const tournament = await db.tournament.findUnique({
      where: { id },
    });

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    // Verify device ownership
    const ownership = verifyOwnership(request, tournament.deviceId);
    if (!isAuthorized(ownership)) {
      return ownership;
    }

    const matches = await db.match.findMany({
      where: { tournamentId: id },
      include: {
        team1: true,
        team2: true,
        innings: {
          select: {
            teamId: true,
            runs: true,
            wickets: true,
            completedOvers: true,
            currentBalls: true,
            isCompleted: true,
          },
          orderBy: { inningsNumber: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const schedule = matches.map((match) => ({
      id: match.id,
      team1: match.team1,
      team2: match.team2,
      status: match.status,
      result: match.result,
      winnerId: match.winnerId,
      innings: match.innings,
      createdAt: match.createdAt,
    }));

    return NextResponse.json({
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      totalMatches: matches.length,
      completedMatches: matches.filter((m) => m.status === 'COMPLETED').length,
      schedule,
    });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 });
  }
}
