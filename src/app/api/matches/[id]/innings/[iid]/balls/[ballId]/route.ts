import { NextRequest, NextResponse } from 'next/server';
import { editBall, EngineValidationError } from '@/lib/scoring-engine';
import { emitLiveEvent } from '@/lib/live-emitter';
import { verifyOwnership, isAuthorized } from '@/lib/api-auth';
import { verifyPin } from '@/lib/organizer';
import { db } from '@/lib/db';
import { ensureDbSchema } from '@/lib/db-bootstrap';
import { WAGON_DIRECTIONS, PITCH_LENGTHS, PITCH_LINES } from '@/lib/intelligence';

/** v2 §13.2/§13.3 — valid capture values for the metadata-only patch path. */
function validMeta(
  body: Record<string, unknown>,
): { wagonDirection?: string | null; pitchLength?: string | null; pitchLine?: string | null } | { error: string } {
  const out: { wagonDirection?: string | null; pitchLength?: string | null; pitchLine?: string | null } = {};
  if (body.wagonDirection !== undefined) {
    if (body.wagonDirection !== null && !WAGON_DIRECTIONS.includes(body.wagonDirection as never)) {
      return { error: `wagonDirection must be one of ${WAGON_DIRECTIONS.join(', ')}` };
    }
    out.wagonDirection = body.wagonDirection as string | null;
  }
  if (body.pitchLength !== undefined) {
    if (body.pitchLength !== null && !PITCH_LENGTHS.includes(body.pitchLength as never)) {
      return { error: `pitchLength must be one of ${PITCH_LENGTHS.join(', ')}` };
    }
    out.pitchLength = body.pitchLength as string | null;
  }
  if (body.pitchLine !== undefined) {
    if (body.pitchLine !== null && !PITCH_LINES.includes(body.pitchLine as never)) {
      return { error: `pitchLine must be one of ${PITCH_LINES.join(', ')}` };
    }
    out.pitchLine = body.pitchLine as string | null;
  }
  return out;
}

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

    // --- v2 §13.2/§13.3 — METADATA-ONLY PATH (wagon / pitch capture) -------
    // A patch that carries ONLY wagon/pitch fields never touches scoring:
    // no replay validation, no recalculate, no MatchEditLog, no PIN — it
    // cannot change the result of a match. Version still bumps (audit).
    const hasScoringFields =
      runs !== undefined || extraRuns !== undefined || extraType !== undefined ||
      isWicket !== undefined || wicketType !== undefined ||
      dismissedPlayerId !== undefined || fielderPlayerId !== undefined || reason !== undefined;
    const metaBody = validMeta(body);
    if ('error' in metaBody) {
      return NextResponse.json({ error: metaBody.error, code: 'VALIDATION' }, { status: 422 });
    }
    if (!hasScoringFields && (metaBody.wagonDirection !== undefined || metaBody.pitchLength !== undefined || metaBody.pitchLine !== undefined)) {
      if (!['LIVE', 'INNINGS_BREAK', 'COMPLETED'].includes(match.status)) {
        return NextResponse.json(
          { error: 'Capture is only available during or after a live match.', code: 'INVALID_STATUS' },
          { status: 409 }
        );
      }
      const ball = await db.ball.findFirst({ where: { id: ballId, inningsId: iid } });
      if (!ball) {
        return NextResponse.json({ error: 'Ball not found in this innings.' }, { status: 404 });
      }
      const updated = await db.ball.update({
        where: { id: ballId },
        data: { ...metaBody, version: { increment: 1 } },
      });
      // Light SSE ping so any open wagon/pitch views can refresh — full
      // scorecards pick the columns up on their next fetch.
      emitLiveEvent(id, {
        type: 'ball_edited',
        data: { ballId, version: updated.version, metaOnly: true, ...metaBody },
      });
      return NextResponse.json({ success: true, ballId, version: updated.version, metaOnly: true });
    }

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
