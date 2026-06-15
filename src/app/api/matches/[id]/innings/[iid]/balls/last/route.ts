import { NextRequest, NextResponse } from 'next/server';
import { undoLastBall } from '@/lib/scoring-engine';
import { verifyOwnership, isAuthorized } from '@/lib/api-auth';
import { db } from '@/lib/db';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; iid: string }> }
) {
  try {
    const { id, iid } = await params;

    // Verify match ownership before undoing ball
    const match = await db.match.findUnique({ where: { id } });
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const ownership = verifyOwnership(request, match.deviceId);
    if (!isAuthorized(ownership)) {
      return ownership;
    }

    const result = await undoLastBall(iid);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error undoing last ball:', error);
    return NextResponse.json({ error: 'Failed to undo last ball' }, { status: 500 });
  }
}
