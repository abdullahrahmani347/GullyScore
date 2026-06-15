import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { verifyOwnership, isAuthorized } from '@/lib/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tournament = await db.tournament.findUnique({
      where: { id },
      include: {
        teams: { include: { team: true } },
      },
    });

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    // Verify device ownership
    const ownership = verifyOwnership(request, tournament.deviceId);
    if (!isAuthorized(ownership)) {
      return ownership;
    }

    // Sort by points desc, then NRR desc
    const pointsTable = tournament.teams
      .map((tt) => ({
        teamId: tt.teamId,
        team: tt.team,
        played: tt.played,
        won: tt.won,
        lost: tt.lost,
        tied: tt.tied,
        points: tt.points,
        nrr: tt.nrr,
        runsScored: tt.runsScored,
        runsConceded: tt.runsConceded,
        oversFaced: tt.oversFaced,
        oversBowled: tt.oversBowled,
      }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return b.nrr - a.nrr;
      });

    return NextResponse.json({
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      format: tournament.format,
      pointsTable,
    });
  } catch (error) {
    console.error('Error fetching points table:', error);
    return NextResponse.json({ error: 'Failed to fetch points table' }, { status: 500 });
  }
}
