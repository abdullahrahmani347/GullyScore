import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const match = await db.match.findUnique({
      where: { id },
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
    });

    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    // Structure for scorecard display
    const scorecard = {
      id: match.id,
      status: match.status,
      totalOvers: match.totalOvers,
      maxWickets: match.maxWickets,
      tossWinnerId: match.tossWinnerId,
      tossDecision: match.tossDecision,
      result: match.result,
      winnerId: match.winnerId,
      venue: match.venue,
      createdAt: match.createdAt,
      completedAt: match.completedAt,
      tournamentId: match.tournamentId,
      team1: match.team1,
      team2: match.team2,
      innings: match.innings.map((inn) => ({
        id: inn.id,
        inningsNumber: inn.inningsNumber,
        team: inn.team,
        runs: inn.runs,
        wickets: inn.wickets,
        completedOvers: inn.completedOvers,
        currentBalls: inn.currentBalls,
        wideBalls: inn.wideBalls,
        noBalls: inn.noBalls,
        byes: inn.byes,
        legByes: inn.legByes,
        target: inn.target,
        isCompleted: inn.isCompleted,
        strikerId: inn.strikerId,
        nonStrikerId: inn.nonStrikerId,
        currentBowlerId: inn.currentBowlerId,
        batting: inn.batting.map((b) => ({
          id: b.id,
          player: b.player,
          runs: b.runs,
          balls: b.balls,
          fours: b.fours,
          sixes: b.sixes,
          isOut: b.isOut,
          dismissalType: b.dismissalType,
          dismissedByBowlerId: b.dismissedByBowlerId,
          fielderPlayerId: b.fielderPlayerId,
          battingOrder: b.battingOrder,
        })),
        bowling: inn.bowling.map((b) => ({
          id: b.id,
          player: b.player,
          completedOvers: b.completedOvers,
          balls: b.balls,
          runs: b.runs,
          wickets: b.wickets,
          wides: b.wides,
          noBalls: b.noBalls,
        })),
        balls: inn.balls,
        extras: {
          wides: inn.wideBalls,
          noBalls: inn.noBalls,
          byes: inn.byes,
          legByes: inn.legByes,
          total: inn.wideBalls + inn.noBalls + inn.byes + inn.legByes,
        },
      })),
    };

    return NextResponse.json(scorecard);
  } catch (error) {
    console.error('Error fetching scorecard:', error);
    return NextResponse.json({ error: 'Failed to fetch scorecard' }, { status: 500 });
  }
}
