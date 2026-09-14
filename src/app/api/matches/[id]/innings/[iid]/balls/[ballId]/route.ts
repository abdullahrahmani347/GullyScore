import { NextRequest, NextResponse } from 'next/server';
import { editBall, EngineValidationError } from '@/lib/scoring-engine';
import { emitLiveEvent } from '@/lib/live-emitter';
import { verifyOwnership, isAuthorized } from '@/lib/api-auth';
import { verifyPin } from '@/lib/organizer';
import { db } from '@/lib/db';
import { ensureDbSchema } from '@/lib/db-bootstrap';

/**
 * v2 §12.7 — BALL EDITOR.
 * PATCH a recorded ball (runs / extras / wicket / dismissal / fielder).
 * The server re-validates the ENTIRE sequence with fold(): an edit that
 * invalidates a downstream event is rejected atomically (422). On success
 * Ball.version is bumped, a MatchEditLog row is written and the new state
 * is rebroadcast over SSE.
 *
 * Guard rails:
 *   - allowed while match.status ∈ { LIVE, INNINGS_BREAK }
 *   - editing a COMPLETED match requires the organizer PIN and flips the
 *     match back to LIVE (result/winner cleared) under an "edited" banner
 *     until it is re-completed.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; iid: string; ballId: string }> }
) {
  try {
    await ensureDbSchema();
    const { id, iid, ballId } = await params;

    const match = await db.match.findUnique({ where: { id } });
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const ownership = verifyOwnership(request, match.deviceId);
    if (!isAuthorized(ownership)) {
      return ownership;
    }

    const body = await request.json();
    const { runs, extraRuns, extraType, isWicket, wicketType, dismissedPlayerId, fielderPlayerId, reason, pin } = body;

    // --- Guard rails ---------------------------------------------------------
    const completed = match.status === 'COMPLETED';
    if (completed && !verifyPin(match.organizerPinHash, pin)) {
      return NextResponse.json(
        { error: 'Editing a completed match requires the organizer PIN.', code: 'PIN_REQUIRED' },
        { status: 403 }
      );
    }
    if (!['LIVE', 'INNINGS_BREAK', 'COMPLETED'].includes(match.status)) {
      return NextResponse.json(
        { error: 'Balls can only be edited during or after a live match.', code: 'INVALID_STATUS' },
        { status: 409 }
      );
    }

    try {
      const result = await editBall(iid, ballId, {
        runs: typeof runs === 'number' ? runs : undefined,
        extraRuns: typeof extraRuns === 'number' ? extraRuns : undefined,
        extraType: extraType ?? undefined,
        isWicket: typeof isWicket === 'boolean' ? isWicket : undefined,
        wicketType: wicketType ?? undefined,
        dismissedPlayerId: dismissedPlayerId ?? undefined,
        fielderPlayerId: fielderPlayerId ?? undefined,
        reason: typeof reason === 'string' ? reason : undefined,
      });

      // Completed match reopened under the "edited" banner
      if (completed) {
        await db.match.update({
          where: { id },
          data: { status: 'LIVE', result: null, winnerId: null, completedAt: null },
        });
      }

      emitLiveEvent(id, {
        type: 'ball_edited',
        data: { ballId, version: result.version, inningsState: result.inningsState, edited: true },
      });

      return NextResponse.json(result);
    } catch (err) {
      if (err instanceof EngineValidationError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: 422 });
      }
      throw err;
    }
  } catch (error) {
    console.error('Error editing ball:', error);
    return NextResponse.json({ error: 'Failed to edit ball' }, { status: 500 });
  }
}
