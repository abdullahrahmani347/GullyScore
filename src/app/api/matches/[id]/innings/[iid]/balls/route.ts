import { NextRequest, NextResponse } from 'next/server';
import { recordBall, EngineValidationError } from '@/lib/scoring-engine';
import { emitLiveEvent } from '@/lib/live-emitter';
import { queuePushNotification } from '@/lib/push';
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
    const match = await db.match.findUnique({
      where: { id },
      include: {
        team1: { select: { name: true } },
        team2: { select: { name: true } },
        innings: {
          where: { id: iid },
          select: { teamId: true, team: { select: { name: true } } },
        },
      },
    });
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
      expectedDeliveryNumber,
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
        expectedDeliveryNumber:
          typeof expectedDeliveryNumber === 'number' && Number.isFinite(expectedDeliveryNumber)
            ? expectedDeliveryNumber
            : null,
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

    // Emit SSE event for spectators — v2 §13.1: `wp` broadcasts per ball
    const eventType = result.ball.isWicket ? 'wicket' : 'ball';
    emitLiveEvent(id, {
      type: eventType,
      data: {
        ball: result.ball,
        inningsState: result.inningsState,
        wp: result.inningsState.winProbability ?? null,
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

    // ── v2 §15.2 — web push fanout (queued; NEVER blocks the response) ──────
    try {
      const code = match.liveCode ?? null;
      const teamsLabel = `${match.team1.name} v ${match.team2.name}`;
      const battingLabel = match.innings[0]?.team?.name ?? 'Batting side';
      const scoreLabel = `${result.inningsState.runs}/${result.inningsState.wickets}`;

      if (result.ball.isWicket) {
        queuePushNotification(id, {
          title: 'WICKET!',
          body: `${teamsLabel} — ${battingLabel} ${scoreLabel}`,
          tag: `wicket-${id}`,
          code,
        });
      }

      // 50 / 100 milestones — striker crossing a threshold off this ball
      // (inningsState is aggregate-only, so read the batting row directly)
      const strikerRow = await db.batsmanInnings
        .findUnique({
          where: { inningsId_playerId: { inningsId: iid, playerId: result.ball.batsmanId } },
          select: { runs: true, balls: true },
        })
        .catch(() => null);
      if (strikerRow) {
        const before = strikerRow.runs - result.ball.runs;
        for (const milestone of [50, 100]) {
          if (before < milestone && strikerRow.runs >= milestone) {
            queuePushNotification(id, {
              title: `${milestone} up!`,
              body: `${battingLabel}: ${milestone} for the striker (${strikerRow.runs} off ${strikerRow.balls})`,
              tag: `m${milestone}-${id}`,
              code,
            });
          }
        }
      }

      if (result.isMatchComplete) {
        queuePushNotification(id, {
          title: 'Match complete',
          body: `${teamsLabel} — ${battingLabel} ${scoreLabel}`,
          tag: `result-${id}`,
          code,
        });
      }
    } catch {
      // push triggers are best-effort — scoring always wins
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error recording ball:', error);
    return NextResponse.json({ error: 'Failed to record ball' }, { status: 500 });
  }
}
