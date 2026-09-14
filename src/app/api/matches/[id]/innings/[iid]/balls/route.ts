import { NextRequest, NextResponse } from 'next/server';
import { recordBall, EngineValidationError } from '@/lib/scoring-engine';
import { emitLiveEvent } from '@/lib/live-emitter';
import { verifyOwnership, isAuthorized } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { ensureDbSchema } from '@/lib/db-bootstrap';

/**
 * v2 §12.7 — the ball write path. Body accepts the v1 fields plus:
 *   clientEventId?: string   — idempotency key (offline replay dedupe)
 *   penaltySide?: 'batting' | 'bowling'  — §12.5 PENALTY events
 *   reason?: string          — §12.5 penalty reason (commentary/audit)
 * Engine rejections return 422 { error, code } (code is an EngineErrorCode).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; iid: string }> }
) {
  try {
    await ensureDbSchema();
    const { id, iid } = await params;

    // Verify match ownership before recording ball
    const match = await db.match.findUnique({ where: { id } });
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const ownership = verifyOwnership(request, match.deviceId);
    if (!isAuthorized(ownership)) {
      return ownership;
    }

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
      clientEventId,
      penaltySide,
      reason,
    } = body;

    if (!batsmanId || !bowlerId) {
      return NextResponse.json(
        { error: 'batsmanId and bowlerId are required' },
        { status: 400 }
      );
    }

    let result;
    try {
      result = await recordBall(iid, {
        batsmanId,
        bowlerId,
        runs: runs || 0,
        isWicket: isWicket || false,
        wicketType: wicketType || null,
        dismissedPlayerId: dismissedPlayerId || null,
        fielderPlayerId: fielderPlayerId || null,
        extraType: extraType || null,
        extraRuns: extraRuns || 0,
        clientEventId: clientEventId || null,
        penaltySide: penaltySide || null,
        reason: reason || null,
      });
    } catch (err) {
      if (err instanceof EngineValidationError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: 422 });
      }
      throw err;
    }

    // Transition match to LIVE on the first ball recorded
    // (match stays in TOSS/UPCOMING until actual play begins)
    if (match.status !== 'LIVE' && match.status !== 'COMPLETED' && match.status !== 'ABANDONED') {
      const updateData: Record<string, unknown> = { status: 'LIVE' };
      if (!match.liveCode) {
        const { generateLiveCode } = await import('@/lib/live-emitter');
        let attempts = 0;
        while (attempts < 10) {
          const code = generateLiveCode();
          const existing = await db.match.findUnique({ where: { liveCode: code } });
          if (!existing) {
            updateData.liveCode = code;
            break;
          }
          attempts++;
        }
      }
      await db.match.update({ where: { id }, data: updateData });
    }

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

    if (result.needsInningsBreak) {
      emitLiveEvent(id, { type: 'innings_break', data: { inningsState: result.inningsState } });
    }

    if (result.isMatchComplete) {
      emitLiveEvent(id, { type: 'match_complete', data: { inningsState: result.inningsState } });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error recording ball:', error);
    return NextResponse.json({ error: 'Failed to record ball' }, { status: 500 });
  }
}
