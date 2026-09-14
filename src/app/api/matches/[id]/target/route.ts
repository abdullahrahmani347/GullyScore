import { NextRequest, NextResponse } from 'next/server';
import { emitLiveEvent } from '@/lib/live-emitter';
import { verifyOwnership, isAuthorized } from '@/lib/api-auth';
import { verifyPin } from '@/lib/organizer';
import { parseAdjustments, serializeAdjustments, type TargetAdjustment } from '@/lib/dls';
import { db } from '@/lib/db';
import { ensureDbSchema } from '@/lib/db-bootstrap';

/**
 * v2 §12.3 — MANUAL TARGET OVERRIDE (organizer PIN required when set).
 * Body: { target: number, pin?: string, reason?: string }
 * Appends a { method: 'manual' } entry to Match.adjustments and updates
 * the 2nd innings target. DLS recomputations later still replay the FULL
 * log, so the manual value participates in the audit history.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbSchema();
    const { id } = await params;

    const match = await db.match.findUnique({
      where: { id },
      include: { innings: true },
    });
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const ownership = verifyOwnership(request, match.deviceId);
    if (!isAuthorized(ownership)) {
      return ownership;
    }

    const body = await request.json();
    const target = Number(body.target);
    const pin = typeof body.pin === 'string' ? body.pin : null;
    const reason = typeof body.reason === 'string' ? body.reason.slice(0, 200) : 'manual override';

    if (!verifyPin(match.organizerPinHash, pin)) {
      return NextResponse.json(
        { error: 'Organizer PIN required for a manual target override.', code: 'PIN_REQUIRED' },
        { status: 403 }
      );
    }
    if (!Number.isInteger(target) || target < 1 || target > 999) {
      return NextResponse.json({ error: 'target must be an integer 1–999.' }, { status: 400 });
    }

    const secondInnings = match.innings.find((i) => i.inningsNumber === 2);
    if (!secondInnings) {
      return NextResponse.json({ error: 'The second innings has not started yet.' }, { status: 409 });
    }
    if (secondInnings.isCompleted || match.status === 'COMPLETED') {
      return NextResponse.json({ error: 'The chase is already over.' }, { status: 409 });
    }

    const adjustments = parseAdjustments(match.adjustments);
    const entry: TargetAdjustment = {
      at: new Date().toISOString(),
      innings: 2,
      from: match.totalOvers,
      to: match.totalOvers,
      oversUsed: secondInnings.completedOvers + secondInnings.currentBalls / 6,
      wickets: secondInnings.wickets,
      reason,
      method: 'manual',
      newTarget: target,
    };
    adjustments.push(entry);

    await db.innings.update({ where: { id: secondInnings.id }, data: { target } });
    await db.match.update({ where: { id }, data: { adjustments: serializeAdjustments(adjustments) } });

    emitLiveEvent(id, {
      type: 'target_adjusted',
      data: { newTarget: target, method: 'manual', reason },
    });

    return NextResponse.json({ success: true, target, method: 'manual', adjustments });
  } catch (error) {
    console.error('Error overriding target:', error);
    return NextResponse.json({ error: 'Failed to override target' }, { status: 500 });
  }
}
