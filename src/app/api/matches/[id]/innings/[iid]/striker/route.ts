import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; iid: string }> }
) {
  try {
    const { iid } = await params;
    const body = await request.json();
    const { strikerId, nonStrikerId } = body;

    if (!strikerId || !nonStrikerId) {
      return NextResponse.json(
        { error: 'strikerId and nonStrikerId are required' },
        { status: 400 }
      );
    }

    const innings = await db.innings.update({
      where: { id: iid },
      data: {
        strikerId,
        nonStrikerId,
      },
    });

    return NextResponse.json(innings);
  } catch (error) {
    console.error('Error setting striker:', error);
    return NextResponse.json({ error: 'Failed to set striker' }, { status: 500 });
  }
}
