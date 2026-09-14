/**
 * GULLYSCORE v2 §13 — ANALYTICS DATA ADAPTERS
 * ---------------------------------------------------------------------------
 * Bridges the API's MatchData/InningsState rows into the pure intelligence
 * module's input shapes (MvpInput, FormInning, ...). Pure — no DB, no React:
 * usable from components, routes and scripts alike.
 */

import {
  mvpTable,
  lastFiveBatting,
  teamFormStrip,
  type MvpInput,
  type MvpEntry,
  type FormInning,
  type TeamFormResult,
} from './intelligence';
import type { BallRecord, MatchData, InningsState, Player } from '@/types';

/** Per-player MVP inputs aggregated across BOTH innings of a match (§13). */
export function buildMvpInputs(match: MatchData): (MvpInput & { name: string; teamId: string })[] {
  const acc = new Map<string, MvpInput & { name: string; teamId: string; chargedRuns: number }>();
  const players = new Map<string, Player>();
  for (const team of [match.team1, match.team2]) {
    if (!team) continue;
    const teamId = team.id;
    for (const p of team.players ?? []) players.set(p.id, { ...p, teamId });
  }

  const get = (id: string): MvpInput & { name: string; teamId: string; chargedRuns: number } => {
    let row = acc.get(id);
    if (!row) {
      row = {
        playerId: id,
        name: players.get(id)?.name ?? '?',
        teamId: players.get(id)?.teamId ?? '',
        runs: 0, fours: 0, sixes: 0, wickets: 0, maidens: 0, dots: 0,
        catches: 0, runouts: 0, stumpings: 0,
        economy: null, oversBowled: 0, chargedRuns: 0,
      };
      acc.set(id, row);
    }
    return row;
  };

  for (const inn of match.innings ?? []) {
    // Batting contributions
    for (const b of inn.batting ?? []) {
      const row = get(b.playerId);
      row.runs += b.runs;
      row.fours += b.fours;
      row.sixes += b.sixes;
    }
    // Bowling contributions — v1 BowlerInnings.runs is the charged figure
    // (bat runs + wide/NB penalties), so economy = chargedRuns / overs.
    for (const b of inn.bowling ?? []) {
      const row = get(b.playerId);
      row.wickets += b.wickets ?? 0;
      row.maidens += b.maidens ?? 0; // scorecard rows historically omitted maidens
      row.oversBowled += b.completedOvers + (b.balls ?? 0) / 6;
      row.chargedRuns += b.runs ?? 0;
    }
    // Fielding contributions + bowler dots — from the ball log
    for (const ball of inn.balls ?? []) {
      if (ball.deletedAt != null) continue;
      if (ball.isWicket && ball.fielderPlayerId) {
        const row = get(ball.fielderPlayerId);
        if (ball.wicketType === 'CAUGHT') row.catches += 1;
        else if (ball.wicketType === 'RUN_OUT') row.runouts += 1;
        else if (ball.wicketType === 'STUMPED') row.stumpings += 1;
      }
      // Dot ball: legal delivery, nothing scored at all (bowler pressure)
      if (ball.isLegalDelivery && ball.runs === 0 && ball.extraType == null) {
        const row = get(ball.bowlerId);
        row.dots += 1;
      }
    }
  }

  // Economy is a derived, whole-career figure — computed once at the end.
  for (const row of acc.values()) {
    row.economy = row.oversBowled > 0 ? Math.round((row.chargedRuns / row.oversBowled) * 100) / 100 : null;
  }

  return [...acc.values()].filter(
    // Dots count 1 MVP point each — a bowler with only dot balls still appears
    (r) =>
      r.runs > 0 || r.wickets > 0 || r.catches > 0 || r.runouts > 0 ||
      r.stumpings > 0 || r.maidens > 0 || r.dots > 0
  ) as (MvpInput & { name: string; teamId: string })[];
}

/** Match MVP leaderboard (§13.5) — sorted desc with display breakdowns. */
export function matchMvpTable(match: MatchData): (MvpEntry & { name: string; teamId: string })[] {
  const inputs = buildMvpInputs(match);
  const names = new Map(inputs.map((i) => [i.playerId, i]));
  return mvpTable(inputs).map((e) => ({
    ...e,
    name: names.get(e.playerId)?.name ?? '?',
    teamId: names.get(e.playerId)?.teamId ?? '',
  }));
}

/**
 * §13.5 season/tournament leaderboard — MvpInputs summed across every
 * completed match, ONE index per player (runs/wickets/etc. accumulate,
 * then the formula is applied once, exactly like a single long season).
 */
export function seasonMvpTable(matches: MatchData[]): (MvpEntry & { name: string; teamId: string; matchesPlayed: number })[] {
  const acc = new Map<string, MvpInput & { name: string; teamId: string; chargedRuns: number; matchesPlayed: number }>();
  for (const match of matches) {
    if (match.status !== 'COMPLETED') continue;
    const seen = new Set<string>();
    for (const input of buildMvpInputs(match)) {
      seen.add(input.playerId);
      const row =
        acc.get(input.playerId) ??
        {
          playerId: input.playerId,
          name: input.name,
          teamId: input.teamId,
          runs: 0, fours: 0, sixes: 0, wickets: 0, maidens: 0, dots: 0,
          catches: 0, runouts: 0, stumpings: 0,
          economy: null, oversBowled: 0, chargedRuns: 0, matchesPlayed: 0,
        };
      row.runs += input.runs;
      row.fours += input.fours;
      row.sixes += input.sixes;
      row.wickets += input.wickets;
      row.maidens += input.maidens;
      row.dots += input.dots;
      row.catches += input.catches;
      row.runouts += input.runouts;
      row.stumpings += input.stumpings;
      row.oversBowled += input.oversBowled;
      row.chargedRuns += input.oversBowled > 0 ? Math.round(input.economy! * input.oversBowled) : 0;
      acc.set(input.playerId, row);
    }
    for (const pid of seen) {
      const row = acc.get(pid)!;
      row.matchesPlayed += 1;
    }
  }
  for (const row of acc.values()) {
    row.economy = row.oversBowled > 0 ? Math.round((row.chargedRuns / row.oversBowled) * 100) / 100 : null;
  }
  const inputs = [...acc.values()] as unknown as (MvpInput & { name: string; teamId: string; matchesPlayed: number })[];
  const names = new Map(inputs.map((i) => [i.playerId, i]));
  return mvpTable(inputs as MvpInput[]).map((e) => {
    const src = names.get(e.playerId)!;
    return { ...e, name: src.name, teamId: src.teamId, matchesPlayed: src.matchesPlayed };
  });
}

/** Last-5 batting innings rows for one player across a match list (§13.7). */
export function playerFormInnings(playerId: string, matches: MatchData[]): FormInning[] {
  const rows: FormInning[] = [];
  for (const match of matches) {
    for (const inn of match.innings ?? []) {
      for (const b of inn.batting ?? []) {
        if (b.playerId !== playerId) continue;
        const opposition = inn.teamId === match.team1Id ? match.team2?.name : match.team1?.name;
        rows.push({
          runs: b.runs,
          isOut: b.isOut,
          balls: b.balls,
          matchId: match.id,
          date: match.createdAt,
          opposition: opposition ?? undefined,
        });
      }
    }
  }
  return lastFiveBatting(rows);
}

/** Team form strip across a match list (§13.7): W/L/T/Q, most recent last. */
export function teamForm(matches: MatchData[], teamId: string): TeamFormResult[] {
  const sorted = [...matches].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  return teamFormStrip(
    sorted.map((m) => ({ winnerId: m.winnerId ?? null, status: m.status })),
    teamId
  );
}

/** Balls from one innings filtered to non-deleted rows (convenience). */
export function liveBalls(innings: InningsState | undefined | null): BallRecord[] {
  return (innings?.balls ?? []).filter((b) => b.deletedAt == null);
}
