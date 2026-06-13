import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; iid: string }> }
) {
  try {
    const { iid } = await params;
    const body = await request.json();
    const { bowlerId } = body;

    if (!bowlerId) {
      return NextResponse.json(
        { error: 'bowlerId is required' },
        { status: 400 }
      );
    }

    const innings = await db.innings.update({
      where: { id: iid },
      data: {
        currentBowlerId: bowlerId,
      },
    });

    return NextResponse.json(innings);
  } catch (error) {
    console.error('Error setting bowler:', error);
    return NextResponse.json({ error: 'Failed to set bowler' }, { status: 500 });
  }
}
