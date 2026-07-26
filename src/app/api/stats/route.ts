import { db } from '@/lib/db';
import { ensureDbSchema } from '@/lib/db-bootstrap';
import { NextRequest, NextResponse } from 'next/server';
import { getDeviceIdFromRequest } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    await ensureDbSchema();
    // Auto-create SQLite schema if missing (serverless cold-start safety).
    await ensureDbSchema();
    // Get deviceId from request header for filtering
    const deviceId = getDeviceIdFromRequest(request);

    // Build where clause for device-scoped queries
    const deviceWhere = deviceId ? { deviceId } : {};

    const [totalMatches, totalTeams, totalTournaments, liveMatches, recentMatches, activeTournaments] =
      await Promise.all([
        db.match.count({ where: deviceWhere }),
        db.team.count({ where: deviceWhere }),
        db.tournament.count({ where: deviceWhere }),
        db.match.findMany({
          where: { ...deviceWhere, status: 'LIVE' },
          include: {
            team1: { include: { players: true } },
            team2: { include: { players: true } },
            innings: {
              include: {
                team: { include: { players: true } },
                batting: { include: { player: true }, orderBy: { battingOrder: 'asc' } },
                bowling: { include: { player: true } },
                balls: { orderBy: { deliveryNumber: 'asc' } },
              },
              orderBy: { inningsNumber: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        db.match.findMany({
          where: { ...deviceWhere, status: 'COMPLETED' },
          include: {
            team1: { include: { players: true } },
            team2: { include: { players: true } },
            innings: {
              include: {
                team: { include: { players: true } },
                batting: { include: { player: true }, orderBy: { battingOrder: 'asc' } },
                bowling: { include: { player: true } },
              },
              orderBy: { inningsNumber: 'asc' },
            },
          },
          orderBy: { completedAt: 'desc' },
          take: 6,
        }),
        db.tournament.findMany({
          where: { ...deviceWhere, status: 'ONGOING' },
          include: {
            teams: { include: { team: true } },
            matches: {
              include: {
                team1: true,
                team2: true,
              },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

    return NextResponse.json({
      totalMatches,
      totalTeams,
      totalTournaments,
      liveMatches,
      recentMatches,
      activeTournaments,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
