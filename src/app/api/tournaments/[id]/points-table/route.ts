import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { verifyOwnership, isAuthorized } from '@/lib/api-auth';
import { ensureDbSchema } from '@/lib/db-bootstrap';
import { rankStandings, type MinimalMatch } from '@/lib/standings';

/**
 * v2 §17.3 — GET points table with the FULL tiebreaker chain:
 * points → NRR → head-to-head → most wins → organizer lots.
 * Rows carry `needsLots` so the UI can offer the drawing-of-lots tool.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbSchema();
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

    const matches: MinimalMatch[] = await db.match.findMany({
      where: { tournamentId: id },
      select: { id: true, team1Id: true, team2Id: true, status: true, winnerId: true },
    });

    let lotsOrder: string[] | null = null;
    try {
      lotsOrder = tournament.lotsOrder ? (JSON.parse(tournament.lotsOrder) as string[]) : null;
    } catch {
      lotsOrder = null;
    }

    const pointsTable = rankStandings(
      tournament.teams.map((tt) => ({
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
      })),
      matches,
      lotsOrder,
    );

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
