import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getDeviceIdFromRequest, verifyOwnership, isAuthorized } from '@/lib/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tournament = await db.tournament.findUnique({
      where: { id },
      include: {
        teams: { include: { team: { include: { players: true } } } },
        matches: {
          include: {
            team1: { include: { players: true } },
            team2: { include: { players: true } },
            innings: {
              include: {
                team: true,
                batting: { include: { player: true } },
                bowling: { include: { player: true } },
              },
              orderBy: { inningsNumber: 'asc' },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    // Verify ownership
    const ownership = verifyOwnership(request, tournament.deviceId);
    if (!isAuthorized(ownership)) {
      return ownership;
    }

    return NextResponse.json(tournament);
  } catch (error) {
    console.error('Error fetching tournament:', error);
    return NextResponse.json({ error: 'Failed to fetch tournament' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check ownership first
    const existingTournament = await db.tournament.findUnique({ where: { id } });
    if (!existingTournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const ownership = verifyOwnership(request, existingTournament.deviceId);
    if (!isAuthorized(ownership)) {
      return ownership;
    }

    const body = await request.json();
    const { name, format, totalOvers, status } = body;

    // Validate status transition
    if (status) {
      const validTransitions: Record<string, string[]> = {
        'UPCOMING': ['ONGOING'],
        'ONGOING': ['COMPLETED'],
        'COMPLETED': [],
      };
      if (!validTransitions[existingTournament.status]?.includes(status)) {
        return NextResponse.json(
          { error: `Cannot transition from ${existingTournament.status} to ${status}` },
          { status: 400 }
        );
      }
    }

    const updatedTournament = await db.tournament.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(format !== undefined && { format }),
        ...(totalOvers !== undefined && { totalOvers }),
        ...(status !== undefined && { status }),
      },
      include: {
        teams: { include: { team: true } },
        matches: {
          include: {
            team1: { include: { players: true } },
            team2: { include: { players: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return NextResponse.json(updatedTournament);
  } catch (error) {
    console.error('Error updating tournament:', error);
    return NextResponse.json({ error: 'Failed to update tournament' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check ownership first
    const existingTournament = await db.tournament.findUnique({ where: { id } });
    if (!existingTournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const ownership = verifyOwnership(request, existingTournament.deviceId);
    if (!isAuthorized(ownership)) {
      return ownership;
    }

    // Check for live matches
    const liveMatches = await db.match.count({
      where: { tournamentId: id, status: { in: ['LIVE', 'INNINGS_BREAK', 'TOSS'] } },
    });
    if (liveMatches > 0) {
      return NextResponse.json(
        { error: 'Cannot delete tournament with live matches. Abandon or complete them first.' },
        { status: 400 }
      );
    }

    await db.tournament.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting tournament:', error);
    return NextResponse.json({ error: 'Failed to delete tournament' }, { status: 500 });
  }
}
