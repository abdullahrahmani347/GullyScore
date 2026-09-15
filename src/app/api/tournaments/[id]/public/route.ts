import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDbSchema } from '@/lib/db-bootstrap';

/**
 * v2 §17.5 — GET /api/tournaments/[id]/public
 *
 * Public, shareable tournament hub feed — NO device-scoping (read-only,
 * like /api/live). Powers the spectator view of /tournaments/[id] with:
 *   - tournament meta + standings-lite
 *   - live-now rail (matches with a liveCode)
 *   - fixtures/results (both filters served from one list)
 *   - champion banner source (championTeamId)
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
      include: { teams: { include: { team: { select: { id: true, name: true, shortName: true, color: true, emoji: true } } } } },
    });
    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const matches = await db.match.findMany({
      where: { tournamentId: id },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        status: true,
        result: true,
        winnerId: true,
        round: true,
        venue: true,
        scheduledAt: true,
        liveCode: true,
        totalOvers: true,
        team1: { select: { id: true, name: true, shortName: true, color: true, emoji: true } },
        team2: { select: { id: true, name: true, shortName: true, color: true, emoji: true } },
        innings: {
          select: { teamId: true, runs: true, wickets: true, completedOvers: true, currentBalls: true, isCompleted: true },
          orderBy: { inningsNumber: 'asc' },
        },
      },
    });

    const liveNow = matches.filter((m) => m.liveCode && (m.status === 'LIVE' || m.status === 'INNINGS_BREAK'));
    const completed = matches.filter((m) => m.status === 'COMPLETED' || m.status === 'ABANDONED');
    const upcoming = matches.filter((m) => m.status === 'UPCOMING' || m.status === 'TOSS');

    const champion = tournament.championTeamId
      ? tournament.teams.map((tt) => tt.team).find((t) => t.id === tournament.championTeamId) ?? null
      : null;

    return NextResponse.json(
      {
        tournamentId: id,
        name: tournament.name,
        format: tournament.format,
        totalOvers: tournament.totalOvers,
        status: tournament.status,
        champion,
        teams: tournament.teams.map((tt) => ({
          teamId: tt.teamId,
          team: tt.team,
          played: tt.played,
          won: tt.won,
          lost: tt.lost,
          tied: tt.tied,
          points: tt.points,
          nrr: tt.nrr,
        })),
        liveNow,
        fixtures: upcoming,
        results: completed,
        totalMatches: matches.length,
      },
      { headers: { 'Cache-Control': 'public, max-age=10, stale-while-revalidate=30' } },
    );
  } catch (error) {
    console.error('Error fetching public tournament:', error);
    return NextResponse.json({ error: 'Failed to fetch tournament' }, { status: 500 });
  }
}
