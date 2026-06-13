import { NextRequest, NextResponse } from 'next/server';
import { recordBall } from '@/lib/scoring-engine';
import { emitLiveEvent } from '@/lib/live-emitter';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; iid: string }> }
) {
  try {
    const { id, iid } = await params;
    const body = await request.json();

    const {
      batsmanId,
      bowlerId,
      runs,
      isWicket,
      wicketType,
      dismissedPlayerId,
      fielderPlayerId,
      extraType,
      extraRuns,
    } = body;

    if (!batsmanId || !bowlerId) {
      return NextResponse.json(
        { error: 'batsmanId and bowlerId are required' },
        { status: 400 }
      );
    }

    const result = await recordBall(iid, {
      batsmanId,
      bowlerId,
      runs: runs || 0,
      isWicket: isWicket || false,
      wicketType: wicketType || null,
      dismissedPlayerId: dismissedPlayerId || null,
      fielderPlayerId: fielderPlayerId || null,
      extraType: extraType || null,
      extraRuns: extraRuns || 0,
    });

    // Emit SSE event for spectators
    const eventType = result.ball.isWicket ? 'wicket' : 'ball';
    emitLiveEvent(id, {
      type: eventType,
      data: {
        ball: result.ball,
        inningsState: result.inningsState,
        strikerUpdate: result.strikerUpdate,
        needsNewBatsman: result.needsNewBatsman,
        needsNewBowler: result.needsNewBowler,
        needsInningsBreak: result.needsInningsBreak,
        isMatchComplete: result.isMatchComplete,
      },
    });

    // Also emit over_complete if over is complete
    if (result.inningsState.isOverComplete) {
      emitLiveEvent(id, {
        type: 'over_complete',
        data: {
          inningsState: result.inningsState,
          strikerUpdate: result.strikerUpdate,
          needsNewBowler: result.needsNewBowler,
        },
      });
    }

    // Emit innings_break if needed
    if (result.needsInningsBreak) {
      emitLiveEvent(id, {
        type: 'innings_break',
        data: {
          inningsState: result.inningsState,
        },
      });
    }

    // Emit match_complete if done
    if (result.isMatchComplete) {
      emitLiveEvent(id, {
        type: 'match_complete',
        data: {
          inningsState: result.inningsState,
        },
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error recording ball:', error);
    return NextResponse.json({ error: 'Failed to record ball' }, { status: 500 });
  }
}
