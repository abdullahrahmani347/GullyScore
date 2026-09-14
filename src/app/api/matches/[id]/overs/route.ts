import { NextRequest, NextResponse } from 'next/server';
import { emitLiveEvent } from '@/lib/live-emitter';
import { verifyOwnership, isAuthorized } from '@/lib/api-auth';
import { isFeatureEnabled } from '@/lib/features';
import { fold, parseMatchRules } from '@/lib/engine';
import {
  computeChaseTarget,
  parseAdjustments,
  serializeAdjustments,
  dlsTableAvailable,
  type TargetAdjustment,
} from '@/lib/dls';
import { db } from '@/lib/db';
import { ensureDbSchema } from '@/lib/db-bootstrap';

/**
 * v2 §12.3 — GULLY-DLS "Reduce overs" (organizer action).
 * Body: { newTotalOvers: number, reason: string }
 *
 *   - Reduce-only: newTotalOvers < match.totalOvers, ≥ 1, and must leave
 *     at least one over for the affected innings to complete.
 *   - Every adjustment is APPENDED to Match.adjustments (audit log:
 *     {at, innings, from, to, oversUsed, wickets, reason, method, newTarget}).
 *   - Targets are ALWAYS recomputed from the full log (invariant 17), never
 *     incrementally.
 *   - DLS Standard Edition with the scaled 50-over resource table; falls
 *     back to the proportional "approx" method when the dls flag is off or
 *     the table is missing (labelled in the response + live banner).
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
      include: { innings: { orderBy: { inningsNumber: 'asc' } } },
    });
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const ownership = verifyOwnership(request, match.deviceId);
    if (!isAuthorized(ownership)) {
      return ownership;
    }

    const body = await request.json();
    const newTotalOvers = Number(body.newTotalOvers);
    const reason = typeof body.reason === 'string' ? body.reason.slice(0, 200) : '';

    if (!Number.isInteger(newTotalOvers) || newTotalOvers < 1 || newTotalOvers > 50) {
      return NextResponse.json({ error: 'newTotalOvers must be an integer 1–50.' }, { status: 400 });
    }
    if (newTotalOvers >= match.totalOvers) {
      return NextResponse.json(
        { error: `Reduce-only: new total overs (${newTotalOvers}) must be less than the current ${match.totalOvers}.` },
        { status: 400 }
      );
    }
    if (match.status === 'COMPLETED' || match.status === 'ABANDONED') {
      return NextResponse.json({ error: 'This match has finished — overs cannot be reduced.' }, { status: 409 });
    }

    // --- Which innings does the reduction apply to? ---------------------------
    const currentInnings = match.innings.find((i) => i.inningsNumber === match.currentInnings) ?? match.innings[0];
    if (!currentInnings) {
      return NextResponse.json({ error: 'No innings to adjust yet.' }, { status: 409 });
    }
    const rules = parseMatchRules(match.rules, {
      maxWickets: match.maxWickets,
      totalOvers: match.totalOvers,
      inningsNumber: currentInnings.inningsNumber,
      target: currentInnings.target,
    });

    const balls = await db.ball.findMany({
      where: { inningsId: currentInnings.id, deletedAt: null },
      orderBy: { deliveryNumber: 'asc' },
    });
    const { hydrateEvents } = await import('@/lib/scoring-engine');
    const state = fold(hydrateEvents(balls), rules);
    const oversUsed = state.completedOvers + state.currentBalls / rules.ballsPerOver;
    if (newTotalOvers <= oversUsed) {
      return NextResponse.json(
        { error: `Cannot reduce to ${newTotalOvers} overs — ${oversUsed.toFixed(1)} have already been bowled.` },
        { status: 400 }
      );
    }

    // --- Append to the audit log (invariant 17: full log is the source) -------
    const useDls = isFeatureEnabled('dls') && dlsTableAvailable();
    const adjustments = parseAdjustments(match.adjustments);
    const adjustment: TargetAdjustment = {
      at: new Date().toISOString(),
      innings: currentInnings.inningsNumber as 1 | 2,
      from: match.totalOvers,
      to: newTotalOvers,
      oversUsed: Math.round(oversUsed * 100) / 100,
      wickets: state.wickets,
      reason: reason || 'overs reduced',
      method: useDls ? 'dls' : 'approx',
    };
    adjustments.push(adjustment);

    // --- Recompute the chase target from the FULL log --------------------------
    let newTarget: number | null = null;
    let r2: number | undefined;
    if (currentInnings.inningsNumber === 2) {
      const firstInnings = match.innings.find((i) => i.inningsNumber === 1);
      const runsFirst = firstInnings?.runs ?? 0;
      const originalOvers = firstInnings && adjustments.length > 0
        ? adjustments.find((a) => a.innings === 2)?.from ?? match.totalOvers
        : match.totalOvers;
      const chase = computeChaseTarget({
        runsFirst,
        originalOvers,
        adjustments,
        useDls,
      });
      newTarget = chase.target;
      r2 = chase.r2;
      adjustment.newTarget = newTarget;
      await db.innings.update({ where: { id: currentInnings.id }, data: { target: newTarget } });
    }

    await db.match.update({
      where: { id },
      data: {
        totalOvers: newTotalOvers,
        adjustments: serializeAdjustments(adjustments),
      },
    });

    // --- Live banner ------------------------------------------------------------
    emitLiveEvent(id, {
      type: 'target_adjusted',
      data: {
        newTotalOvers,
        from: match.totalOvers,
        newTarget,
        method: adjustment.method,
        reason: adjustment.reason,
      },
    });

    return NextResponse.json({
      success: true,
      from: match.totalOvers,
      to: newTotalOvers,
      innings: currentInnings.inningsNumber,
      newTarget,
      method: adjustment.method,
      r2,
      adjustments,
    });
  } catch (error) {
    console.error('Error reducing overs:', error);
    return NextResponse.json({ error: 'Failed to reduce overs' }, { status: 500 });
  }
}
