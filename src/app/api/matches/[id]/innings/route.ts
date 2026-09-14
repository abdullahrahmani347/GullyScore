import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { generateLiveCode } from '@/lib/live-emitter';
import { verifyOwnership, isAuthorized } from '@/lib/api-auth';
import { ensureDbSchema } from '@/lib/db-bootstrap';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbSchema();
    const { id } = await params;
    const body = await request.json();
    const { teamId, inningsNumber, target } = body;

    if (!teamId || !inningsNumber) {
      return NextResponse.json(
        { error: 'teamId and inningsNumber are required' },
        { status: 400 }
      );
    }

    const match = await db.match.findUnique({
      where: { id },
      include: { innings: { orderBy: { inningsNumber: 'asc' } } },
    });
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    // Verify ownership
    const ownership = verifyOwnership(request, match.deviceId);
    if (!isAuthorized(ownership)) {
      return ownership;
    }

    // --- v2 §12.3/§12.5: compute the chase target when innings 2 starts ------
    //   - No interruptions + no banked bowling penalties → v1 parity
    //     (target = runsFirst + 1, i.e. the client-supplied value).
    //   - Any innings-1 reduction in the adjustments log → DLS Standard
    //     Edition (targetAtBreak replays the full log — invariant 17).
    //   - Penalty runs banked for the fielding side during innings 1 are
    //     added to the chase target (§12.5).
    let effectiveTarget = target || null;
    if (inningsNumber === 2) {
      const firstInnings = match.innings.find((i) => i.inningsNumber === 1);
      if (firstInnings) {
        const { parseAdjustments, targetAtBreak } = await import('@/lib/dls');
        const { fold, parseMatchRules } = await import('@/lib/engine');
        const { isFeatureEnabled } = await import('@/lib/features');
        const adjustments = parseAdjustments(match.adjustments);
        const rules = parseMatchRules(match.rules, {
          maxWickets: match.maxWickets,
          totalOvers: match.totalOvers,
          inningsNumber: 1,
          target: null,
        });
        const balls = await db.ball.findMany({
          where: { inningsId: firstInnings.id, deletedAt: null },
          orderBy: { deliveryNumber: 'asc' },
        });
        const { hydrateEvents } = await import('@/lib/scoring-engine');
        const state = fold(hydrateEvents(balls), rules);
        if (adjustments.length > 0 || state.penaltyRunsBowling > 0) {
          const res = targetAtBreak({
            runsFirst: firstInnings.runs,
            originalOversFirst: adjustments.find((a) => a.innings === 1)?.from ?? match.totalOvers,
            oversScheduledSecond: match.totalOvers,
            adjustments,
            penaltyRunsBowling: state.penaltyRunsBowling,
            useDls: isFeatureEnabled('dls'),
          });
          effectiveTarget = res.target;
        }
      }
    }

    const innings = await db.innings.create({
      data: {
        matchId: id,
        teamId,
        inningsNumber,
        target: effectiveTarget,
      },
    });

    // Generate a liveCode if this match doesn't have one yet (match going LIVE)
    let liveCode: string | undefined;
    if (!match.liveCode) {
      let attempts = 0;
      while (attempts < 10) {
        const code = generateLiveCode();
        const existing = await db.match.findUnique({ where: { liveCode: code } });
        if (!existing) {
          liveCode = code;
          break;
        }
        attempts++;
      }
    }

    // Update match to reflect innings creation, but keep status as SETUP/TOSS
    // The match should only go LIVE when the first ball is actually recorded
    // If the match already has a liveCode, keep it; otherwise don't generate one yet
    await db.match.update({
      where: { id },
      data: {
        currentInnings: inningsNumber,
        ...(liveCode && { liveCode }),
      },
    });

    return NextResponse.json(innings, { status: 201 });
  } catch (error) {
    console.error('Error creating innings:', error);
    return NextResponse.json({ error: 'Failed to create innings' }, { status: 500 });
  }
}
