import { NextResponse } from 'next/server';
import { undoLastBall } from '@/lib/scoring-engine';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; iid: string }> }
) {
  try {
    const { iid } = await params;
    const result = await undoLastBall(iid);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error undoing last ball:', error);
    return NextResponse.json({ error: 'Failed to undo last ball' }, { status: 500 });
  }
}
