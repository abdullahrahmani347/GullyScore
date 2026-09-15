import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDbSchema } from '@/lib/db-bootstrap';
import { verifyOwnership, isAuthorized } from '@/lib/api-auth';

/**
 * GET — schedule feed for the tournament page (v1 §7.4 shape preserved, plus
 * §17.2 scheduling fields: scheduledAt, venue, umpires, round, bracketSlot).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbSchema();
    const { id } = await params;
    const tournament = await db.tournament.findUnique({
      where: { id },
    });

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    // Verify device ownership
    const ownership = verifyOwnership(request, tournament.deviceId);
    if (!isAuthorized(ownership)) {
      return ownership;
    }

    const matches = await db.match.findMany({
      where: { tournamentId: id },
      include: {
        team1: true,
        team2: true,
        innings: {
          select: {
            teamId: true,
            runs: true,
            wickets: true,
            completedOvers: true,
            currentBalls: true,
            isCompleted: true,
          },
          orderBy: { inningsNumber: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const schedule = matches.map((match) => ({
      id: match.id,
      team1: match.team1,
      team2: match.team2,
      status: match.status,
      result: match.result,
      winnerId: match.winnerId,
      innings: match.innings,
      createdAt: match.createdAt,
      // v2 §17.2 — schedule editor fields
      scheduledAt: match.scheduledAt,
      venue: match.venue,
      umpires: match.umpires,
      round: match.round,
      bracketSlot: match.bracketSlot,
      liveCode: match.liveCode,
    }));

    return NextResponse.json({
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      totalMatches: matches.length,
      completedMatches: matches.filter((m) => m.status === 'COMPLETED').length,
      schedule,
    });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 });
  }
}

/**
 * v2 §17.2 — PATCH /api/tournaments/[id]/schedule
 *
 * Schedule editor write path (organizer device only). Reslots a fixture:
 * scheduledAt, venue, umpires, round and bracketSlot. Enforces
 * DOUBLE-BOOKING detection:
 *   - same venue with another match starting within ±2 h of the slot
 *   - the same team playing another match within ±2 h of the slot
 * Conflicts return 409 { error, conflicts: [...] } — the UI surfaces them
 * and requires explicit confirmation (body.confirm: true) to save anyway.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbSchema();
    const { id } = await params;
    const tournament = await db.tournament.findUnique({ where: { id } });
    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const ownership = verifyOwnership(request, tournament.deviceId);
    if (!isAuthorized(ownership)) {
      return ownership;
    }

    const body = await request.json();
    const { matchId, scheduledAt, venue, umpires, round, bracketSlot, confirm } = body;
    if (!matchId) {
      return NextResponse.json({ error: 'matchId is required' }, { status: 400 });
    }

    const match = await db.match.findFirst({
      where: { id: matchId, tournamentId: id },
      include: { team1: { select: { shortName: true } }, team2: { select: { shortName: true } } },
    });
    if (!match) {
      return NextResponse.json({ error: 'Match not found in this tournament' }, { status: 404 });
    }

    // Parse the incoming slot
    const newTime = scheduledAt
      ? new Date(scheduledAt)
      : match.scheduledAt
        ? new Date(match.scheduledAt)
        : null;
    if (scheduledAt && isNaN(newTime?.getTime() ?? NaN)) {
      return NextResponse.json({ error: 'scheduledAt must be a valid ISO date' }, { status: 400 });
    }
    const newVenue = venue !== undefined ? (venue ?? null) : match.venue;

    // ── double-booking detection ──────────────────────────────────────────
    const WINDOW_MS = 2 * 60 * 60 * 1000;
    const conflicts: Array<{ matchId: string; reason: string; label: string; scheduledAt: string | null }> = [];

    if (newTime) {
      const from = new Date(newTime.getTime() - WINDOW_MS);
      const to = new Date(newTime.getTime() + WINDOW_MS);
      const others = await db.match.findMany({
        where: {
          tournamentId: id,
          id: { not: matchId },
          scheduledAt: { gte: from, lte: to },
        },
        include: { team1: { select: { shortName: true } }, team2: { select: { shortName: true } } },
      });
      for (const other of others) {
        const sameVenue = newVenue && other.venue && other.venue.toLowerCase() === String(newVenue).toLowerCase();
        const sharesTeam = [match.team1Id, match.team2Id].some(
          (t) => t === other.team1Id || t === other.team2Id,
        );
        if (sameVenue || sharesTeam) {
          conflicts.push({
            matchId: other.id,
            reason: sameVenue ? 'venue' : 'team',
            label: `${other.team1.shortName} v ${other.team2.shortName}`,
            scheduledAt: other.scheduledAt?.toISOString() ?? null,
          });
        }
      }
    }

    if (conflicts.length > 0 && !confirm) {
      return NextResponse.json(
        { error: 'Double-booking detected', conflicts },
        { status: 409 },
      );
    }

    const updated = await db.match.update({
      where: { id: matchId },
      data: {
        scheduledAt: newTime,
        venue: newVenue,
        umpires: umpires !== undefined ? (umpires ?? null) : undefined,
        round: round !== undefined ? (round ?? null) : undefined,
        bracketSlot: bracketSlot !== undefined ? (typeof bracketSlot === 'number' ? bracketSlot : null) : undefined,
      },
    });

    return NextResponse.json({ match: updated });
  } catch (error) {
    console.error('Error updating schedule:', error);
    return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 });
  }
}
