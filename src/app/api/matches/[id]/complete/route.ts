import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { generateResultString } from '@/lib/scoring-utils';
import { verifyOwnership, isAuthorized } from '@/lib/api-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const match = await db.match.findUnique({
      where: { id },
      include: {
        team1: true,
        team2: true,
        innings: {
          include: {
            team: true,
            batting: { include: { player: true } },
            bowling: { include: { player: true } },
          },
          orderBy: { inningsNumber: 'asc' },
        },
      },
    });

    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    // Verify ownership
    const ownership = verifyOwnership(request, match.deviceId);
    if (!isAuthorized(ownership)) {
      return ownership;
    }

    const inn1 = match.innings.find((i) => i.inningsNumber === 1);
    const inn2 = match.innings.find((i) => i.inningsNumber === 2);

    if (!inn1 || !inn2) {
      return NextResponse.json({ error: 'Both innings must be completed' }, { status: 400 });
    }

    // Determine who batted first
    const battingFirstTeam = inn1.team;
    const chasingTeam = inn2.team;

    // Generate result string
    const result = generateResultString(
      battingFirstTeam.name,
      chasingTeam.name,
      inn1.runs,
      inn2.runs,
      inn2.wickets,
      inn2.isCompleted,
      inn2.completedOvers,
      inn2.currentBalls,
      match.totalOvers,
      match.maxWickets
    );

    // Determine winner
    let winnerId: string | null = null;
    if (inn2.runs > inn1.runs) {
      winnerId = inn2.teamId;
    } else if (inn1.runs > inn2.runs) {
      winnerId = inn1.teamId;
    }
    // If tied, winnerId stays null

    // Update match
    const updatedMatch = await db.match.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        result,
        winnerId,
        completedAt: new Date(),
      },
      include: {
        team1: { include: { players: true } },
        team2: { include: { players: true } },
        innings: {
          include: {
            team: { include: { players: true } },
            batting: { include: { player: true } },
            bowling: { include: { player: true } },
          },
          orderBy: { inningsNumber: 'asc' },
        },
      },
    });

    // Update tournament stats if match belongs to a tournament
    if (match.tournamentId) {
      await updateTournamentStats(match.tournamentId, match.team1Id, match.team2Id, winnerId, inn1, inn2);
    }

    return NextResponse.json(updatedMatch);
  } catch (error) {
    console.error('Error completing match:', error);
    return NextResponse.json({ error: 'Failed to complete match' }, { status: 500 });
  }
}

async function updateTournamentStats(
  tournamentId: string,
  team1Id: string,
  team2Id: string,
  winnerId: string | null,
  inn1: { runs: number; completedOvers: number; currentBalls: number; teamId: string; wickets: number },
  inn2: { runs: number; completedOvers: number; currentBalls: number; teamId: string; wickets: number }
) {
  // Update stats for team1
  const team1Stat = await db.tournamentTeam.findUnique({
    where: { tournamentId_teamId: { tournamentId, teamId: team1Id } },
  });
  if (team1Stat) {
    const isTeam1Winner = winnerId === team1Id;
    const isTeam1Loser = winnerId && !isTeam1Winner;
    const isTied = !winnerId;

    // Calculate overs for team1
    const team1Innings = inn1.teamId === team1Id ? inn1 : inn2;
    const team1BowlingInnings = inn1.teamId === team1Id ? inn2 : inn1;
    const team1OversFaced = team1Innings.completedOvers + team1Innings.currentBalls / 6;
    const team1OversBowled = team1BowlingInnings.completedOvers + team1BowlingInnings.currentBalls / 6;

    await db.tournamentTeam.update({
      where: { id: team1Stat.id },
      data: {
        played: { increment: 1 },
        won: { increment: isTeam1Winner ? 1 : 0 },
        lost: { increment: isTeam1Loser ? 1 : 0 },
        tied: { increment: isTied ? 1 : 0 },
        points: { increment: isTeam1Winner ? 2 : isTied ? 1 : 0 },
        runsScored: { increment: team1Innings.runs },
        runsConceded: { increment: team1BowlingInnings.runs },
        oversFaced: { increment: team1OversFaced },
        oversBowled: { increment: team1OversBowled },
      },
    });

    // Recalculate NRR for team1
    const updatedTeam1 = await db.tournamentTeam.findUniqueOrThrow({ where: { id: team1Stat.id } });
    const nrr1 = updatedTeam1.oversFaced > 0
      ? (updatedTeam1.runsScored / updatedTeam1.oversFaced) - (updatedTeam1.oversBowled > 0 ? updatedTeam1.runsConceded / updatedTeam1.oversBowled : 0)
      : 0;
    await db.tournamentTeam.update({
      where: { id: team1Stat.id },
      data: { nrr: Math.round(nrr1 * 1000) / 1000 },
    });
  }

  // Update stats for team2
  const team2Stat = await db.tournamentTeam.findUnique({
    where: { tournamentId_teamId: { tournamentId, teamId: team2Id } },
  });
  if (team2Stat) {
    const isTeam2Winner = winnerId === team2Id;
    const isTeam2Loser = winnerId && !isTeam2Winner;
    const isTied = !winnerId;

    // Calculate overs for team2
    const team2Innings = inn2.teamId === team2Id ? inn2 : inn1;
    const team2BowlingInnings = inn2.teamId === team2Id ? inn1 : inn2;
    const team2OversFaced = team2Innings.completedOvers + team2Innings.currentBalls / 6;
    const team2OversBowled = team2BowlingInnings.completedOvers + team2BowlingInnings.currentBalls / 6;

    await db.tournamentTeam.update({
      where: { id: team2Stat.id },
      data: {
        played: { increment: 1 },
        won: { increment: isTeam2Winner ? 1 : 0 },
        lost: { increment: isTeam2Loser ? 1 : 0 },
        tied: { increment: isTied ? 1 : 0 },
        points: { increment: isTeam2Winner ? 2 : isTied ? 1 : 0 },
        runsScored: { increment: team2Innings.runs },
        runsConceded: { increment: team2BowlingInnings.runs },
        oversFaced: { increment: team2OversFaced },
        oversBowled: { increment: team2OversBowled },
      },
    });

    // Recalculate NRR for team2
    const updatedTeam2 = await db.tournamentTeam.findUniqueOrThrow({ where: { id: team2Stat.id } });
    const nrr2 = updatedTeam2.oversFaced > 0
      ? (updatedTeam2.runsScored / updatedTeam2.oversFaced) - (updatedTeam2.oversBowled > 0 ? updatedTeam2.runsConceded / updatedTeam2.oversBowled : 0)
      : 0;
    await db.tournamentTeam.update({
      where: { id: team2Stat.id },
      data: { nrr: Math.round(nrr2 * 1000) / 1000 },
    });
  }
}
