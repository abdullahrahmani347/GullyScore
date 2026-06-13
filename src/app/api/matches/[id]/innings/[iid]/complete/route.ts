import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; iid: string }> }
) {
  try {
    const { id, iid } = await params;

    const innings = await db.innings.findUniqueOrThrow({
      where: { id: iid },
      include: { match: true },
    });

    if (innings.isCompleted) {
      return NextResponse.json(
        { error: 'Innings is already completed' },
        { status: 400 }
      );
    }

    // Mark current innings as completed
    await db.innings.update({
      where: { id: iid },
      data: { isCompleted: true },
    });

    if (innings.inningsNumber === 1) {
      // Create 2nd innings with the opposing team
      const match = innings.match;
      const battingTeam2Id = match.team1Id === innings.teamId ? match.team2Id : match.team1Id;
      const target = innings.runs + 1;

      const secondInnings = await db.innings.create({
        data: {
          matchId: id,
          teamId: battingTeam2Id,
          inningsNumber: 2,
          target,
        },
      });

      // Update match status to INNINGS_BREAK and currentInnings to 2
      await db.match.update({
        where: { id },
        data: {
          status: 'INNINGS_BREAK',
          currentInnings: 2,
        },
      });

      return NextResponse.json({
        message: '1st innings completed. 2nd innings created.',
        secondInnings,
        target,
      });
    } else if (innings.inningsNumber === 2) {
      // 2nd innings complete - match is ready for completion
      return NextResponse.json({
        message: '2nd innings completed. Match is ready for completion.',
      });
    }

    return NextResponse.json({ message: 'Innings completed' });
  } catch (error) {
    console.error('Error completing innings:', error);
    return NextResponse.json({ error: 'Failed to complete innings' }, { status: 500 });
  }
}
