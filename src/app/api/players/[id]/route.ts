import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { verifyOwnership, isAuthorized } from '@/lib/api-auth';
import { ensureDbSchema } from '@/lib/db-bootstrap';
import {
  careerBatting,
  careerBowling,
  careerMilestones,
  matchupMatrix,
  lastFiveBatting,
  type CareerMilestone,
  type MatchupCell,
  type FormInning,
} from '@/lib/intelligence';

/**
 * v2 §13.6 — PLAYER CAREER PAGE DATA.
 * Aggregates every match a player appeared in: career batting/bowling
 * summaries, milestones, per-innings run worm, form chips and the
 * batter × bowler matchup table (optionally scoped to a tournament).
 *
 * GET /api/players/[id]?tournamentId=...&code=GS-XXXX (public via live code)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbSchema();
    const { id } = await params;
    const url = new URL(request.url);
    const tournamentId = url.searchParams.get('tournamentId');

    const player = await db.player.findUnique({
      where: { id },
      include: { team: true },
    });
    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Device ownership: same device as the player's team (legacy teams open).
    // Spectators holding a live code for a match this player played may read.
    const ownership = verifyOwnership(request, player.team.deviceId);
    if (!isAuthorized(ownership)) {
      const code = url.searchParams.get('code');
      let publicOk = false;
      if (code) {
        const normalized = code.replace(/^GS-/i, '').toUpperCase();
        const pub = await db.match.findFirst({
          where: {
            liveCode: normalized,
            OR: [{ team1Id: player.teamId }, { team2Id: player.teamId }],
          },
          select: { id: true },
        });
        publicOk = pub != null;
      }
      if (!publicOk) return ownership;
    }

    const scopeFilter = tournamentId ? { innings: { match: { tournamentId } } } : {};

    const [battingRows, bowlingRows, batBalls, fieldBalls] = await Promise.all([
      db.batsmanInnings.findMany({
        where: { playerId: id, ...scopeFilter },
        include: {
          innings: {
            include: { team: true, match: { include: { team1: true, team2: true } } },
          },
        },
        orderBy: [{ innings: { match: { createdAt: 'asc' } } }, { innings: { inningsNumber: 'asc' } }],
      }),
      db.bowlerInnings.findMany({
        where: { playerId: id, ...scopeFilter },
        include: { innings: { include: { match: { include: { team1: true, team2: true } } } } },
        orderBy: [{ innings: { match: { createdAt: 'asc' } } }, { innings: { inningsNumber: 'asc' } }],
      }),
      db.ball.findMany({
        where: { batsmanId: id, ...scopeFilter },
        orderBy: [{ innings: { match: { createdAt: 'asc' } } }, { deliveryNumber: 'asc' }],
        include: { bowler: true },
      }),
      db.ball.findMany({
        where: { fielderPlayerId: id, isWicket: true, ...scopeFilter },
        select: { wicketType: true },
      }),
    ]);

    const oppositionOf = (inn: {
      teamId: string;
      match: { team1Id: string; team1: { name: string }; team2: { name: string } };
    }) => (inn.teamId === inn.match.team1Id ? inn.match.team2.name : inn.match.team1.name);

    const battingCareerRows = battingRows.map((r) => ({
      runs: r.runs,
      balls: r.balls,
      fours: r.fours,
      sixes: r.sixes,
      isOut: r.isOut,
      matchId: r.innings.matchId,
      date: r.innings.match.createdAt,
      opposition: oppositionOf(r.innings),
    }));
    const bowlingCareerRows = bowlingRows.map((r) => ({
      completedOvers: r.completedOvers,
      balls: r.balls,
      runs: r.runs,
      wickets: r.wickets,
      matchId: r.innings.matchId,
      date: r.innings.match.createdAt,
      opposition: oppositionOf(r.innings),
    }));

    const fielding = {
      catches: fieldBalls.filter((b) => b.wicketType === 'CAUGHT').length,
      runouts: fieldBalls.filter((b) => b.wicketType === 'RUN_OUT').length,
      stumpings: fieldBalls.filter((b) => b.wicketType === 'STUMPED').length,
    };

    const milestones: CareerMilestone[] = careerMilestones(battingCareerRows, bowlingCareerRows);

    // Per-innings list + run worm (cumulative runs per ball faced)
    const inningsList = battingRows.map((r, i) => {
      const balls = batBalls.filter((b) => b.inningsId === r.inningsId && b.deletedAt == null);
      let cum = 0;
      const worm = [0];
      for (const b of balls) {
        cum += b.runs;
        worm.push(cum);
      }
      return {
        index: i + 1,
        matchId: r.innings.matchId,
        date: r.innings.match.createdAt,
        opposition: oppositionOf(r.innings),
        runs: r.runs,
        balls: r.balls,
        isOut: r.isOut,
        fours: r.fours,
        sixes: r.sixes,
        worm,
      };
    });

    const matchups: MatchupCell[] = matchupMatrix(batBalls.filter((b) => b.deletedAt == null));

    const form: FormInning[] = lastFiveBatting(battingCareerRows);

    return NextResponse.json({
      player: {
        id: player.id,
        name: player.name,
        battingHand: player.battingHand ?? 'R',
        team: {
          id: player.team.id,
          name: player.team.name,
          shortName: player.team.shortName,
          color: player.team.color,
          emoji: player.team.emoji,
        },
      },
      batting: careerBatting(battingCareerRows),
      bowling: careerBowling(bowlingCareerRows),
      fielding,
      milestones,
      innings: inningsList.slice(-20).reverse(),
      worm: inningsList.slice(-8).map((inn) => ({
        index: inn.index,
        opposition: inn.opposition,
        points: inn.worm,
      })),
      matchups,
      matchupBowlers: [...new Set(matchups.map((m) => m.bowlerId))].map((bid) => {
        const b = batBalls.find((x) => x.bowlerId === bid)?.bowler;
        return { id: bid, name: b?.name ?? '?' };
      }),
      form,
    });
  } catch (error) {
    console.error('Error fetching player career:', error);
    return NextResponse.json({ error: 'Failed to fetch player' }, { status: 500 });
  }
}
