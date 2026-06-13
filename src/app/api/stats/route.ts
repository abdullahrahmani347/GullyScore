import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const [totalMatches, totalTeams, totalTournaments, liveMatches, recentMatches, activeTournaments] =
      await Promise.all([
        db.match.count(),
        db.team.count(),
        db.tournament.count(),
        db.match.findMany({
          where: { status: 'LIVE' },
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
          where: { status: 'COMPLETED' },
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
          where: { status: 'ONGOING' },
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
