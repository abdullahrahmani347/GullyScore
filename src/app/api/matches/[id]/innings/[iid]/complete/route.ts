import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { verifyOwnership, isAuthorized } from '@/lib/api-auth';
import { ensureDbSchema } from '@/lib/db-bootstrap';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; iid: string }> }
) {
  try {
    await ensureDbSchema();
    const { id, iid } = await params;

    // Verify match ownership
    const match = await db.match.findUnique({ where: { id } });
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const ownership = verifyOwnership(request, match.deviceId);
    if (!isAuthorized(ownership)) {
      return ownership;
    }

    const innings = await db.innings.findUniqueOrThrow({
      where: { id: iid },
      include: { match: true },
    });

    if (innings.isCompleted) {
      // Idempotent double-complete (auto-complete + user tap, or an offline
      // replay): return the CURRENT state with 200 instead of a 400 that the
      // client would otherwise queue and replay forever.
      if (innings.inningsNumber === 1) {
        const second = await db.innings.findFirst({
          where: { matchId: id, inningsNumber: 2 },
        });
        return NextResponse.json({
          message: '1st innings completed. 2nd innings created.',
          secondInnings: second,
          target: second?.target ?? innings.runs + 1,
          alreadyCompleted: true,
        });
      }
      return NextResponse.json({
        message: '2nd innings completed. Match is ready for completion.',
        alreadyCompleted: true,
      });
    }

    // Mark current innings as completed
    await db.innings.update({
      where: { id: iid },
      data: { isCompleted: true },
    });

    if (innings.inningsNumber === 1) {
      // Create 2nd innings with the opposing team
      const matchData = innings.match;
      const battingTeam2Id = matchData.team1Id === innings.teamId ? matchData.team2Id : matchData.team1Id;
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
