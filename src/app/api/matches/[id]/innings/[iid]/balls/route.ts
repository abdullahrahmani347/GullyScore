import { NextRequest, NextResponse } from 'next/server';
import { recordBall } from '@/lib/scoring-engine';

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

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error recording ball:', error);
    return NextResponse.json({ error: 'Failed to record ball' }, { status: 500 });
  }
}
