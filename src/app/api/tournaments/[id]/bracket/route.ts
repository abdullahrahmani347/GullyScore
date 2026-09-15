import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDbSchema } from '@/lib/db-bootstrap';
import { verifyOwnership, isAuthorized } from '@/lib/api-auth';
import { buildBracket, type BracketTeam, type BracketInputMatch } from '@/lib/bracket';

/**
 * v2 §17.1 — GET /api/tournaments/[id]/bracket
 *
 * QF/SF/F bracket for KNOCKOUT and HYBRID tournaments. Auto-seeded from the
 * standings (1vN …) with byes when knockout fixtures don't exist yet; real
 * Match rows (round + bracketSlot) always override auto-seeding. The
 * champion is persisted (championTeamId) once the Final completes so the
 * public hub can render the banner.
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
      include: { teams: { include: { team: true } } },
    });
    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const ownership = verifyOwnership(request, tournament.deviceId);
    if (!isAuthorized(ownership)) {
      return ownership;
    }

    // Standings order = seed order (§17.3 chain, compact variant for seeding)
    const tt = await db.tournamentTeam.findMany({
      where: { tournamentId: id },
      include: { team: true },
    });
    const ranked = [...tt]
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return b.nrr - a.nrr;
      })
      .map((row) => row.team as BracketTeam);

    const matchRows = await db.match.findMany({
      where: { tournamentId: id, round: { in: ['QF', 'SF', 'F'] } },
      orderBy: [{ round: 'asc' }, { bracketSlot: 'asc' }],
      include: {
        team1: { select: { id: true, name: true, shortName: true, color: true, emoji: true } },
        team2: { select: { id: true, name: true, shortName: true, color: true, emoji: true } },
      },
    });

    const bracket = buildBracket(
      ranked,
      matchRows.map((m): BracketInputMatch => ({
        id: m.id,
        round: m.round,
        bracketSlot: m.bracketSlot,
        status: m.status,
        winnerId: m.winnerId,
        liveCode: m.liveCode,
        team1: m.team1,
        team2: m.team2,
      })),
    );

    // Persist the champion once the Final completes (§17.5 banner source)
    if (bracket.champion && tournament.championTeamId !== bracket.champion.id) {
      await db.tournament.update({
        where: { id },
        data: {
          championTeamId: bracket.champion.id,
          status: tournament.status === 'ONGOING' ? 'COMPLETED' : tournament.status,
        },
      });
    }

    return NextResponse.json({
      tournamentId: id,
      format: tournament.format,
      ...bracket,
    });
  } catch (error) {
    console.error('Error building bracket:', error);
    return NextResponse.json({ error: 'Failed to build bracket' }, { status: 500 });
  }
}
