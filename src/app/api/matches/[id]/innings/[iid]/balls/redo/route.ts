import { NextRequest, NextResponse } from 'next/server';
import { redoLastBall } from '@/lib/scoring-engine';
import { emitLiveEvent } from '@/lib/live-emitter';
import { verifyOwnership, isAuthorized } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { ensureDbSchema } from '@/lib/db-bootstrap';

/**
 * v2 §12.7 — REDO: un-tombstone the most recent tombstone. Only possible
 * when the tombstone is the tail of the event log (once a newer live event
 * exists, redo is refused — the scorer would need to edit instead).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; iid: string }> }
) {
  try {
    await ensureDbSchema();
    const { id, iid } = await params;

    const match = await db.match.findUnique({ where: { id } });
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const ownership = verifyOwnership(request, match.deviceId);
    if (!isAuthorized(ownership)) {
      return ownership;
    }

    const result = await redoLastBall(iid);

    if (result.success) {
      const innings = await db.innings.findUnique({ where: { id: iid } });
      if (innings) {
        emitLiveEvent(id, {
          type: 'redo',
          data: {
            inningsState: {
              runs: innings.runs,
              wickets: innings.wickets,
              completedOvers: innings.completedOvers,
              currentBalls: innings.currentBalls,
            },
          },
        });
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error redoing ball:', error);
    return NextResponse.json({ error: 'Failed to redo ball' }, { status: 500 });
  }
}
