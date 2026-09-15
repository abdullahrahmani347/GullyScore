import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDbSchema } from '@/lib/db-bootstrap';
import { verifyOwnership, isAuthorized } from '@/lib/api-auth';
import { mvpIndex } from '@/lib/intelligence';

/**
 * v2 §17.4 — GET /api/tournaments/[id]/leaderboards
 *
 * Per-tournament leaderboards across COMPLETED matches:
 *   - runGetters   (top run scorers)
 *   - wicketTakers (top wicket takers)
 *   - mvp          (§13.5 MVP index: runs/4s/6s/wkts/maidens/dots/fielding)
 *   - bestEconomy  (≥ 3 overs bowled)
 *   - bestStrikeRate (≥ 30 balls faced)
 *
 * §17.7 — guest players: stats ALWAYS count on the match. When the
 * tournament opts in (guestPlayersAllowed), guests also appear in the
 * leaderboards flagged `isGuest: true`; otherwise they are excluded.
 */
const ECON_MIN_BALLS = 18; // 3 overs
const SR_MIN_BALLS = 30;

interface PlayerAgg {
  playerId: string;
  name: string;
  isGuest: boolean;
  teamShortName: string;
  teamColor: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  wickets: number;
  legalBalls: number;
  runsConceded: number;
  maidens: number;
  dots: number;
  catches: number;
  runouts: number;
  stumpings: number;
}

export async function GET(
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

    const matches = await db.match.findMany({
      where: { tournamentId: id, status: 'COMPLETED' },
      select: { innings: { select: { id: true } } },
    });
    const inningsIds = matches.flatMap((m) => m.innings.map((i) => i.id));

    if (inningsIds.length === 0) {
      return NextResponse.json({
        tournamentId: id,
        runGetters: [],
        wicketTakers: [],
        mvp: [],
        bestEconomy: [],
        bestStrikeRate: [],
        guestPlayersAllowed: tournament.guestPlayersAllowed,
      });
    }

    // ── raw aggregates ────────────────────────────────────────────────────
    const [batAgg, bowlAgg, balls, fieldingCatches, fieldingRunouts, fieldingStumpings] =
      await Promise.all([
        db.batsmanInnings.groupBy({
          by: ['playerId'],
          where: { inningsId: { in: inningsIds } },
          _sum: { runs: true, balls: true, fours: true, sixes: true },
        }),
        db.bowlerInnings.groupBy({
          by: ['playerId'],
          where: { inningsId: { in: inningsIds } },
          _sum: { wickets: true, balls: true, runs: true, maidens: true },
        }),
        db.ball.findMany({
          where: { inningsId: { in: inningsIds }, deletedAt: null },
          select: {
            bowlerId: true,
            overNumber: true,
            inningsId: true,
            runs: true,
            extraRuns: true,
            isLegalDelivery: true,
            wicketType: true,
            fielderPlayerId: true,
          },
        }),
        db.ball.groupBy({
          by: ['fielderPlayerId'],
          where: { inningsId: { in: inningsIds }, wicketType: 'CAUGHT', fielderPlayerId: { not: null } },
          _count: { _all: true },
        }),
        db.ball.groupBy({
          by: ['fielderPlayerId'],
          where: { inningsId: { in: inningsIds }, wicketType: 'RUN_OUT', fielderPlayerId: { not: null } },
          _count: { _all: true },
        }),
        db.ball.groupBy({
          by: ['fielderPlayerId'],
          where: { inningsId: { in: inningsIds }, wicketType: 'STUMPED', fielderPlayerId: { not: null } },
          _count: { _all: true },
        }),
      ]);

    // maidens per bowler: group legal-ball overs with 0 runs
    const maidenSet = new Set<string>();
    const overRuns = new Map<string, { inningsId: string; overNumber: number; bowlerId: string; runs: number; legal: number }>();
    for (const b of balls) {
      if (!b.isLegalDelivery) continue;
      const key = `${b.inningsId}:${b.bowlerId}:${b.overNumber}`;
      const cur = overRuns.get(key) ?? { inningsId: b.inningsId, overNumber: b.overNumber, bowlerId: b.bowlerId, runs: 0, legal: 0 };
      cur.runs += b.runs + b.extraRuns;
      cur.legal += 1;
      overRuns.set(key, cur);
    }
    for (const over of overRuns.values()) {
      if (over.legal === 6 && over.runs === 0) maidenSet.add(over.bowlerId);
      // maidens need per-innings counting, but bowlers bowl ≤1 innings per
      // match; approximate at bowler level for the leaderboard (same as UI card).
    }
    // count distinct maiden overs per bowler
    const maidenCounts = new Map<string, number>();
    for (const over of overRuns.values()) {
      if (over.legal === 6 && over.runs === 0) {
        maidenCounts.set(over.bowlerId, (maidenCounts.get(over.bowlerId) ?? 0) + 1);
      }
    }

    const catchMap = new Map(fieldingCatches.map((r) => [r.fielderPlayerId!, r._count._all]));
    const roMap = new Map(fieldingRunouts.map((r) => [r.fielderPlayerId!, r._count._all]));
    const stMap = new Map(fieldingStumpings.map((r) => [r.fielderPlayerId!, r._count._all]));

    const playerIds = new Set<string>([
      ...batAgg.map((r) => r.playerId),
      ...bowlAgg.map((r) => r.playerId),
      ...catchMap.keys(),
      ...roMap.keys(),
      ...stMap.keys(),
    ]);

    const players = await db.player.findMany({
      where: { id: { in: [...playerIds] } },
      select: { id: true, name: true, isGuest: true, team: { select: { shortName: true, color: true } } },
    });
    const playerById = new Map(players.map((p) => [p.id, p]));

    const agg: Record<string, PlayerAgg> = {};
    const ensure = (pid: string): PlayerAgg => {
      if (!agg[pid]) {
        const p = playerById.get(pid);
        agg[pid] = {
          playerId: pid,
          name: p?.name ?? 'Unknown',
          isGuest: p?.isGuest ?? false,
          teamShortName: p?.team?.shortName ?? '—',
          teamColor: p?.team?.color ?? '#888',
          runs: 0, balls: 0, fours: 0, sixes: 0,
          wickets: 0, legalBalls: 0, runsConceded: 0,
          maidens: 0, dots: 0, catches: 0, runouts: 0, stumpings: 0,
        };
      }
      return agg[pid];
    };

    for (const row of batAgg) {
      const a = ensure(row.playerId);
      a.runs = row._sum.runs ?? 0;
      a.balls = row._sum.balls ?? 0;
      a.fours = row._sum.fours ?? 0;
      a.sixes = row._sum.sixes ?? 0;
    }
    for (const row of bowlAgg) {
      const a = ensure(row.playerId);
      a.wickets = row._sum.wickets ?? 0;
      a.legalBalls = row._sum.balls ?? 0;
      a.runsConceded = row._sum.runs ?? 0;
      a.maidens = row._sum.maidens ?? 0;
    }
    // dots (bowler-credited) from live ball rows
    for (const b of balls) {
      if (b.isLegalDelivery && b.runs === 0 && b.extraRuns === 0) {
        ensure(b.bowlerId).dots += 1;
      }
    }
    // maidens recomputed per over (more accurate than the innings-row sum here)
    for (const [pid, count] of maidenCounts) ensure(pid).maidens = count;
    for (const [pid, count] of catchMap) ensure(pid).catches = count;
    for (const [pid, count] of roMap) ensure(pid).runouts = count;
    for (const [pid, count] of stMap) ensure(pid).stumpings = count;

    // §17.7 — guests: count on the match always; leaderboards opt-in
    const leaderboardPool = Object.values(agg).filter((a) => !a.isGuest || tournament.guestPlayersAllowed);

    const fmt = (a: PlayerAgg) => ({
      playerId: a.playerId,
      name: a.name,
      isGuest: a.isGuest,
      teamShortName: a.teamShortName,
      teamColor: a.teamColor,
    });

    const runGetters = leaderboardPool
      .filter((a) => a.balls > 0 || a.runs > 0)
      .sort((x, y) => y.runs - x.runs)
      .slice(0, 10)
      .map((a) => ({ ...fmt(a), runs: a.runs, balls: a.balls, fours: a.fours, sixes: a.sixes }));

    const wicketTakers = leaderboardPool
      .filter((a) => a.wickets > 0)
      .sort((x, y) => y.wickets - x.wickets)
      .slice(0, 10)
      .map((a) => ({ ...fmt(a), wickets: a.wickets, runsConceded: a.runsConceded, legalBalls: a.legalBalls }));

    const mvp = leaderboardPool
      .map((a) => ({
        ...fmt(a),
        mvp: mvpIndex({
          playerId: a.playerId,
          runs: a.runs,
          fours: a.fours,
          sixes: a.sixes,
          wickets: a.wickets,
          maidens: a.maidens,
          dots: a.dots,
          catches: a.catches,
          runouts: a.runouts,
          stumpings: a.stumpings,
          economy: a.legalBalls >= 6 ? a.runsConceded / (a.legalBalls / 6) : null,
          oversBowled: a.legalBalls / 6,
        }),
      }))
      .filter((r) => r.mvp > 0)
      .sort((x, y) => y.mvp - x.mvp)
      .slice(0, 10);

    const bestEconomy = leaderboardPool
      .filter((a) => a.legalBalls >= ECON_MIN_BALLS)
      .map((a) => ({ ...fmt(a), economy: Math.round((a.runsConceded / (a.legalBalls / 6)) * 100) / 100, overs: Math.round((a.legalBalls / 6) * 10) / 10 }))
      .sort((x, y) => x.economy - y.economy)
      .slice(0, 10);

    const bestStrikeRate = leaderboardPool
      .filter((a) => a.balls >= SR_MIN_BALLS)
      .map((a) => ({ ...fmt(a), strikeRate: Math.round((a.runs / a.balls) * 100) / 100, runs: a.runs, balls: a.balls }))
      .sort((x, y) => y.strikeRate - x.strikeRate)
      .slice(0, 10);

    return NextResponse.json({
      tournamentId: id,
      runGetters,
      wicketTakers,
      mvp,
      bestEconomy,
      bestStrikeRate,
      guestPlayersAllowed: tournament.guestPlayersAllowed,
    });
  } catch (error) {
    console.error('Error building leaderboards:', error);
    return NextResponse.json({ error: 'Failed to build leaderboards' }, { status: 500 });
  }
}
