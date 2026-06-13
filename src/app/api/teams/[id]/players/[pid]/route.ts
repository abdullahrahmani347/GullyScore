import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pid: string }> }
) {
  try {
    const { pid } = await params;
    const body = await request.json();
    const { name, jerseyNumber } = body;

    const player = await db.player.update({
      where: { id: pid },
      data: {
        ...(name !== undefined && { name }),
        ...(jerseyNumber !== undefined && { jerseyNumber }),
      },
    });

    return NextResponse.json(player);
  } catch (error) {
    console.error('Error updating player:', error);
    return NextResponse.json({ error: 'Failed to update player' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pid: string }> }
) {
  try {
    const { pid } = await params;
    await db.player.delete({ where: { id: pid } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting player:', error);
    return NextResponse.json({ error: 'Failed to delete player' }, { status: 500 });
  }
}
