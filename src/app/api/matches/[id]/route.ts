import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { generateLiveCode, emitLiveEvent } from '@/lib/live-emitter';
import { getDeviceIdFromRequest, verifyOwnership, isAuthorized } from '@/lib/api-auth';
import { ensureDbSchema } from '@/lib/db-bootstrap';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbSchema();
    const { id } = await params;
    const match = await db.match.findUnique({
      where: { id },
      include: {
        team1: { include: { players: true } },
        team2: { include: { players: true } },
        innings: {
          include: {
            team: { include: { players: true } },
            batting: { include: { player: true }, orderBy: { battingOrder: 'asc' } },
            bowling: { include: { player: true } },
            balls: { orderBy: { deliveryNumber: 'asc' } },
            partnerships: {
              include: {
                batsman1: true,
                batsman2: true,
              },
              orderBy: { wicketNumber: 'desc' },
            },
          },
          orderBy: { inningsNumber: 'asc' },
        },
      },
    });

    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    // Verify device ownership for detailed match data (scoring page)
    const ownership = verifyOwnership(request, match.deviceId);
    if (!isAuthorized(ownership)) {
      return ownership;
    }

    // v2 §12.3 — the PIN hash never leaves the server
    delete (match as { organizerPinHash?: string }).organizerPinHash;
    return NextResponse.json(match);
  } catch (error) {
    console.error('Error fetching match:', error);
    return NextResponse.json({ error: 'Failed to fetch match' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbSchema();
    const { id } = await params;
    const body = await request.json();
    const { status, tossWinnerId, tossDecision, currentInnings, result, winnerId, rules, organizerPin } = body;

    // Check ownership first
    const existingMatch = await db.match.findUnique({ where: { id } });
    if (!existingMatch) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const ownership = verifyOwnership(request, existingMatch.deviceId);
    if (!isAuthorized(ownership)) {
      return ownership;
    }

    // Handle match abandon
    if (status === 'ABANDONED') {
      const updatedMatch = await db.match.update({
        where: { id },
        data: {
          status: 'ABANDONED',
          result: result || 'Match abandoned',
          completedAt: new Date(),
        },
        include: {
          team1: { include: { players: true } },
          team2: { include: { players: true } },
          innings: {
            include: {
              team: { include: { players: true } },
              batting: { include: { player: true } },
              bowling: { include: { player: true } },
              balls: { orderBy: { deliveryNumber: 'asc' } },
              partnerships: {
                include: { batsman1: true, batsman2: true },
                orderBy: { wicketNumber: 'desc' },
              },
            },
            orderBy: { inningsNumber: 'asc' },
          },
        },
      });

      // Emit abandon event for SSE
      emitLiveEvent(id, {
        type: 'match_abandoned',
        data: { result: updatedMatch.result },
      });

      return NextResponse.json(updatedMatch);
    }

    // If match is going LIVE, generate a live code if it doesn't have one
    let liveCode: string | undefined;
    if (status === 'LIVE') {
      if (!existingMatch.liveCode) {
        // Generate unique code (retry if collision)
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
    }

    // v2 §12.10 — house rules may be edited until play starts (TOSS or earlier).
    let rulesUpdate: string | undefined;
    if (rules != null && typeof rules === 'object') {
      if (!['UPCOMING', 'TOSS'].includes(existingMatch.status)) {
        return NextResponse.json(
          { error: 'House rules can only be changed before play starts.' },
          { status: 409 }
        );
      }
      const { v2HouseRules } = await import('@/lib/engine');
      rulesUpdate = JSON.stringify(v2HouseRules(rules as Record<string, unknown>));
    }

    // v2 §12.3/§19.4 — set/change/clear the organizer PIN (SHA-256 stored).
    let organizerPinHashUpdate: string | null | undefined;
    if (organizerPin !== undefined) {
      if (typeof organizerPin !== 'string' || (organizerPin.trim() !== '' && organizerPin.trim().length < 4)) {
        return NextResponse.json({ error: 'Organizer PIN must be at least 4 characters (or empty to clear).' }, { status: 400 });
      }
      const { hashPin } = await import('@/lib/organizer');
      organizerPinHashUpdate = organizerPin.trim() === '' ? null : hashPin(organizerPin);
    }

    const match = await db.match.update({
      where: { id },
      data: {
        ...(status !== undefined && { status }),
        ...(tossWinnerId !== undefined && { tossWinnerId }),
        ...(tossDecision !== undefined && { tossDecision }),
        ...(currentInnings !== undefined && { currentInnings }),
        ...(result !== undefined && { result }),
        ...(winnerId !== undefined && { winnerId }),
        ...(rulesUpdate !== undefined && { rules: rulesUpdate }),
        ...(organizerPinHashUpdate !== undefined && { organizerPinHash: organizerPinHashUpdate }),
        ...(liveCode && { liveCode }),
      },
      include: {
        team1: { include: { players: true } },
        team2: { include: { players: true } },
        innings: {
          include: {
            team: { include: { players: true } },
            batting: { include: { player: true } },
            bowling: { include: { player: true } },
            balls: { orderBy: { deliveryNumber: 'asc' } },
            partnerships: {
              include: { batsman1: true, batsman2: true },
              orderBy: { wicketNumber: 'desc' },
            },
          },
          orderBy: { inningsNumber: 'asc' },
        },
      },
    });

    // Emit status change event
    if (status) {
      emitLiveEvent(id, {
        type: 'status_change',
        data: { status, liveCode: match.liveCode },
      });
    }

    return NextResponse.json(match);
  } catch (error) {
    console.error('Error updating match:', error);
    return NextResponse.json({ error: 'Failed to update match' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbSchema();
    const { id } = await params;
    const match = await db.match.findUnique({ where: { id } });
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    // Verify ownership
    const ownership = verifyOwnership(request, match.deviceId);
    if (!isAuthorized(ownership)) {
      return ownership;
    }

    // Prevent deletion of live matches
    if (match.status === 'LIVE' || match.status === 'INNINGS_BREAK') {
      return NextResponse.json(
        { error: 'Cannot delete a live match. Abandon it first.' },
        { status: 400 }
      );
    }

    await db.match.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting match:', error);
    return NextResponse.json({ error: 'Failed to delete match' }, { status: 500 });
  }
}
