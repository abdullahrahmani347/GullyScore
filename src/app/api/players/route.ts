import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDbSchema } from '@/lib/db-bootstrap';
import { getDeviceIdFromRequest } from '@/lib/api-auth';

/**
 * GET /api/players — roster-wide player directory.
 *
 * Returns every non-guest player on the requesting device's teams with
 * lightweight career aggregates (batting innings, runs, wickets) so the
 * /players index page can render rich cards without N+1 career lookups.
 * Guest players (v2 §14.8 one-off match entrants) are never listed.
 */
export async function GET(request: NextRequest) {
  try {
    await ensureDbSchema();
    const deviceId = getDeviceIdFromRequest(request);

    const teamWhere: Record<string, unknown> = {};
    if (deviceId) teamWhere.deviceId = deviceId;

    const players = await db.player.findMany({
      where: { isGuest: false, team: teamWhere },
      include: {
        team: {
          select: { id: true, name: true, shortName: true, color: true, emoji: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const ids = players.map((p) => p.id);

    const [batAgg, bowlAgg] = await Promise.all([
      db.batsmanInnings.groupBy({
        by: ['playerId'],
        where: { playerId: { in: ids } },
        _count: { _all: true },
        _sum: { runs: true, balls: true },
      }),
      db.bowlerInnings.groupBy({
        by: ['playerId'],
        where: { playerId: { in: ids } },
        _sum: { wickets: true },
      }),
    ]);

    const batById = new Map(batAgg.map((row) => [row.playerId, row]));
    const bowlById = new Map(bowlAgg.map((row) => [row.playerId, row]));

    const directory = players.map((p) => {
      const bat = batById.get(p.id);
      const bowl = bowlById.get(p.id);
      return {
        id: p.id,
        name: p.name,
        jerseyNumber: p.jerseyNumber,
        battingHand: p.battingHand,
        team: p.team,
        career: {
          innings: bat?._count._all ?? 0,
          runs: bat?._sum.runs ?? 0,
          balls: bat?._sum.balls ?? 0,
          wickets: bowl?._sum.wickets ?? 0,
        },
      };
    });

    return NextResponse.json(
      { players: directory },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Error fetching player directory:', error);
    return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 });
  }
}
