/**
 * GULLYSCORE v2 §15.1 — LIVE HUB (pure card computation)
 * ---------------------------------------------------------------------------
 * Turns raw match rows (Prisma or API JSON) into the public mini-card feed
 * for the /live hub. PURE — runs identically on the server (page + API) and
 * in bun tests.
 *
 * Mini card (spec): teams, score, overs, striker, RRR, last-6-balls chips,
 * PP badge. Plus the "recently completed" rail shape.
 */

import { matchRulesFor } from './scoring-context';
import { calculateRRR, formatOvers } from './scoring-utils';

/* ── Loose structural input (accepts Prisma rows AND API JSON) ── */

export interface HubBallLike {
  id?: string;
  overNumber: number;
  ballInOver: number;
  deliveryNumber: number;
  batsmanId?: string;
  bowlerId?: string;
  runs: number;
  isWicket: boolean;
  wicketType?: string | null;
  extraType?: string | null;
  extraRuns: number;
  isLegalDelivery: boolean;
  deletedAt?: string | Date | null;
  isFreeHit?: boolean;
  version?: number;
  timestamp?: string | Date | null;
}

export interface HubBatterLike {
  playerId: string;
  runs: number;
  balls: number;
  isOut?: boolean;
  player?: { name: string } | null;
}

export interface HubInningsLike {
  id: string;
  inningsNumber: number;
  teamId: string;
  runs: number;
  wickets: number;
  completedOvers: number;
  currentBalls: number;
  target?: number | null;
  strikerId?: string | null;
  nonStrikerId?: string | null;
  currentBowlerId?: string | null;
  isCompleted?: boolean;
  balls?: HubBallLike[];
  batting?: HubBatterLike[];
}

export interface HubMatchLike {
  id: string;
  status: string;
  totalOvers: number;
  maxWickets?: number;
  rules?: string | null;
  liveCode?: string | null;
  result?: string | null;
  winnerId?: string | null;
  venue?: string | null;
  createdAt?: string | Date;
  completedAt?: string | Date | null;
  tournament?: { id: string; name: string } | null;
  tournamentId?: string | null;
  team1: { id: string; name: string; shortName: string; color: string };
  team2: { id: string; name: string; shortName: string; color: string };
  innings?: HubInningsLike[];
}

/* ── Output shapes ── */

export interface BallChip {
  label: string;
  kind: 'dot' | 'run' | 'four' | 'six' | 'wicket' | 'extra';
}

export interface LiveHubCard {
  matchId: string;
  liveCode: string | null;
  status: string;
  tournamentId: string | null;
  tournamentName: string | null;
  venue: string | null;
  battingTeam: { name: string; shortName: string; color: string };
  bowlingTeam: { name: string; shortName: string; color: string };
  inningsNumber: number;
  runs: number;
  wickets: number;
  overs: string; // "4.3"
  striker: { name: string; runs: number; balls: number } | null;
  rrr: number | null;
  target: number | null;
  last6: BallChip[];
  powerplay: { active: boolean; overs: number } | null;
  freeHitPending: boolean;
  lastBallAt: number; // epoch ms — hub sorts by this
}

export interface CompletedCard {
  matchId: string;
  liveCode: string | null;
  tournamentId: string | null;
  tournamentName: string | null;
  result: string | null;
  team1: { name: string; shortName: string; color: string };
  team2: { name: string; shortName: string; color: string };
  innings: { teamName: string; color: string; score: string }[];
  completedAt: number;
}

/* ── Ball chip label (shared by hub cards, timeline, embed) ── */

/** §15.1 — compact chip label for a delivery (W, 4, 6, wd, nb, b1, •). */
export function ballChipLabel(ball: HubBallLike): { label: string; kind: BallChip['kind'] } {
  if (ball.isWicket) return { label: 'W', kind: 'wicket' };
  switch (ball.extraType) {
    case 'WIDE':
      return { label: ball.extraRuns > 1 ? `wd${ball.extraRuns}` : 'wd', kind: 'extra' };
    case 'NO_BALL': {
      const offBat = ball.runs; // §12.9 — runs off the bat on a NB
      return { label: offBat > 0 ? `nb${offBat}` : 'nb', kind: 'extra' };
    }
    case 'BYE':
      return { label: ball.runs > 0 ? `b${ball.runs}` : 'b', kind: 'extra' };
    case 'LEG_BYE':
      return { label: ball.runs > 0 ? `lb${ball.runs}` : 'lb', kind: 'extra' };
    case 'PENALTY':
      return { label: 'p', kind: 'extra' };
    default:
      break;
  }
  if (ball.runs === 4) return { label: '4', kind: 'four' };
  if (ball.runs === 6) return { label: '6', kind: 'six' };
  if (ball.runs === 0) return { label: '•', kind: 'dot' };
  return { label: String(ball.runs), kind: 'run' };
}

/* ── Mini card builder ── */

function liveBalls(innings: HubInningsLike): HubBallLike[] {
  return (innings.balls ?? [])
    .filter((b) => b.deletedAt == null || b.deletedAt === undefined)
    .sort((a, b) => a.deliveryNumber - b.deliveryNumber);
}

/**
 * Build ONE live mini card from a match row. Returns null when the match
 * has no open innings (shouldn't appear in the live grid).
 */
export function liveHubCard(match: HubMatchLike): LiveHubCard | null {
  const openInnings = (match.innings ?? []).find((i) => !i.isCompleted);
  if (!openInnings) return null;

  const battingTeam = openInnings.teamId === match.team1.id ? match.team1 : match.team2;
  const bowlingTeam = openInnings.teamId === match.team1.id ? match.team2 : match.team1;

  const balls = liveBalls(openInnings);
  const last6 = balls.slice(-6).map(ballChipLabel);

  // Striker: current strikerId, falling back to the last ball's striker
  const strikerId =
    openInnings.strikerId ??
    (balls.length ? balls[balls.length - 1].batsmanId ?? null : null);
  let striker: LiveHubCard['striker'] = null;
  if (strikerId) {
    const row = (openInnings.batting ?? []).find((b) => b.playerId === strikerId);
    if (row?.player) striker = { name: row.player.name, runs: row.runs, balls: row.balls };
  }

  const target = openInnings.target ?? null;
  const rrr =
    openInnings.inningsNumber === 2 && target != null
      ? calculateRRR(target - openInnings.runs, match.totalOvers, openInnings.completedOvers, openInnings.currentBalls)
      : null;

  // PP badge — same rules pipeline as the scoring screen
  const rules = matchRulesFor(
    { rules: match.rules ?? null, maxWickets: match.maxWickets ?? 10, totalOvers: match.totalOvers },
    openInnings.inningsNumber,
    target
  );
  const powerplay =
    rules.powerplayOvers > 0
      ? { active: openInnings.completedOvers < rules.powerplayOvers, overs: rules.powerplayOvers }
      : null;

  // Free-hit pending — hub heuristic: the very last delivery leaves an FH
  // pending when it was a no-ball (any follow-up delivery consumes or
  // re-triggers it), or a wide DURING a free hit (wides never consume FH).
  const last = balls.length ? balls[balls.length - 1] : null;
  const freeHitPending =
    match.rules != null &&
    last != null &&
    (last.extraType === 'NO_BALL' || (last.isFreeHit === true && last.extraType === 'WIDE'));

  const lastBall = balls.length ? balls[balls.length - 1] : null;
  const lastBallAt = lastBall?.timestamp
    ? matchDateMs(lastBall.timestamp)
    : matchDateMs(match.createdAt);

  return {
    matchId: match.id,
    liveCode: match.liveCode ?? null,
    status: match.status,
    tournamentId: match.tournament?.id ?? match.tournamentId ?? null,
    tournamentName: match.tournament?.name ?? null,
    venue: match.venue ?? null,
    battingTeam: { name: battingTeam.name, shortName: battingTeam.shortName, color: battingTeam.color },
    bowlingTeam: { name: bowlingTeam.name, shortName: bowlingTeam.shortName, color: bowlingTeam.color },
    inningsNumber: openInnings.inningsNumber,
    runs: openInnings.runs,
    wickets: openInnings.wickets,
    overs: formatOvers(openInnings.completedOvers, openInnings.currentBalls),
    striker,
    rrr,
    target,
    last6,
    powerplay,
    freeHitPending,
    lastBallAt,
  };
}

function matchDateMs(d: string | Date | null | undefined): number {
  if (d == null) return 0;
  return d instanceof Date ? d.getTime() : Date.parse(d) || 0;
}

/** Build the hub feed: live cards (most-recent-ball first) + completed rail. */
export function liveHubFeed(matches: HubMatchLike[]) {
  const live: LiveHubCard[] = [];
  const completed: CompletedCard[] = [];

  for (const match of matches) {
    if (match.status === 'LIVE' || match.status === 'INNINGS_BREAK') {
      const card = liveHubCard(match);
      if (card) live.push(card);
    } else if (match.status === 'COMPLETED') {
      completed.push(completedCard(match));
    }
  }

  live.sort((a, b) => b.lastBallAt - a.lastBallAt);
  completed.sort((a, b) => b.completedAt - a.completedAt);

  const tournaments = new Map<string, string>();
  for (const card of live) {
    if (card.tournamentId && card.tournamentName) {
      tournaments.set(card.tournamentId, card.tournamentName);
    }
  }

  return {
    live,
    completed: completed.slice(0, 10), // "recently completed" rail
    tournaments: Array.from(tournaments, ([id, name]) => ({ id, name })),
  };
}

function completedCard(match: HubMatchLike): CompletedCard {
  return {
    matchId: match.id,
    liveCode: match.liveCode ?? null,
    tournamentId: match.tournament?.id ?? match.tournamentId ?? null,
    tournamentName: match.tournament?.name ?? null,
    result: match.result ?? null,
    team1: { name: match.team1.name, shortName: match.team1.shortName, color: match.team1.color },
    team2: { name: match.team2.name, shortName: match.team2.shortName, color: match.team2.color },
    innings: (match.innings ?? [])
      .slice()
      .sort((a, b) => a.inningsNumber - b.inningsNumber)
      .map((i) => {
        const team = i.teamId === match.team1.id ? match.team1 : match.team2;
        return {
          teamName: team.name,
          color: team.color,
          score: `${i.runs}/${i.wickets} (${formatOvers(i.completedOvers, i.currentBalls)})`,
        };
      }),
    completedAt: matchDateMs(match.completedAt),
  };
}

/* ── §15.6 — embed widget snapshot (compact keys: HTML stays ≤ 15 KB) ── */

export interface EmbedBowlerLike {
  playerId: string;
  completedOvers: number;
  balls: number;
  runs: number;
  wickets: number;
  player?: { name: string } | null;
}

export interface EmbedSnapshot {
  ok: boolean;
  /** match id — the SSE/poll endpoints key off this */
  id: string;
  /** status code: LIVE | INNINGS_BREAK | COMPLETED | ABANDONED | other */
  st: string;
  /** normalized live code (no GS- prefix) or null */
  code: string | null;
  /** [team1, team2] { n: name, c: color } */
  t: { n: string; c: string }[];
  /** batting side context */
  bat: {
    n: string;
    c: string;
    s: string; // "84/3"
    o: string; // "12.3"
    inn: number;
    tgt: number | null;
    rrr: number | null;
    need: number | null;
    crr: number | null;
  };
  /** striker / non-striker { n, r: "45(31)" } */
  s1: { n: string; r: string } | null;
  s2: { n: string; r: string } | null;
  /** bowler { n, f: "2/18" } */
  bw: { n: string; f: string } | null;
  /** last-6 chip labels */
  l6: string[];
  /** powerplay active */
  pp: boolean;
  /** first-innings summary { n, s } or null */
  fi: { n: string; s: string } | null;
  /** result string or null */
  r: string | null;
}

export function embedSnapshot(match: HubMatchLike): EmbedSnapshot {
  const teams = [
    { n: match.team1.name, c: match.team1.color },
    { n: match.team2.name, c: match.team2.color },
  ];

  const openInnings = (match.innings ?? []).find((i) => !i.isCompleted);
  const firstInnings = (match.innings ?? []).find((i) => i.inningsNumber === 1);

  if (!openInnings) {
    return {
      ok: true,
      id: match.id,
      st: match.status,
      code: match.liveCode ?? null,
      t: teams,
      bat: { n: '', c: '', s: '—', o: '', inn: 0, tgt: null, rrr: null, need: null, crr: null },
      s1: null,
      s2: null,
      bw: null,
      l6: [],
      pp: false,
      fi: firstInnings
        ? { n: teamNameFor(match, firstInnings.teamId), s: `${firstInnings.runs}/${firstInnings.wickets}` }
        : null,
      r: match.result ?? null,
    };
  }

  const battingTeam = teamNameFor(match, openInnings.teamId);
  const battingColor = teamColorFor(match, openInnings.teamId);
  const balls = liveBalls(openInnings);
  const l6 = balls.slice(-6).map((b) => ballChipLabel(b).label);

  const strikerId = openInnings.strikerId ?? null;
  const nonStrikerId = openInnings.nonStrikerId ?? null;
  const fmt = (id: string | null) => {
    if (!id) return null;
    const row = (openInnings.batting ?? []).find((b) => b.playerId === id);
    if (!row?.player) return null;
    return { n: row.player.name, r: `${row.runs}(${row.balls})` };
  };

  const bowlerId = (openInnings as { currentBowlerId?: string | null }).currentBowlerId ?? null;
  const bowlers = (openInnings as unknown as { bowling?: EmbedBowlerLike[] }).bowling ?? [];
  const bowlerRow = bowlerId ? bowlers.find((b) => b.playerId === bowlerId) : null;
  const bw =
    bowlerRow?.player != null
      ? {
          n: bowlerRow.player.name,
          f: `${bowlerRow.wickets}/${bowlerRow.runs}`,
        }
      : null;

  const oversDecimal =
    openInnings.completedOvers + (openInnings.currentBalls ?? 0) / 6;
  const crr = oversDecimal > 0 ? openInnings.runs / oversDecimal : null;
  const target = openInnings.target ?? null;
  const rrr =
    openInnings.inningsNumber === 2 && target != null
      ? calculateRRR(
          target - openInnings.runs,
          match.totalOvers,
          openInnings.completedOvers,
          openInnings.currentBalls
        )
      : null;

  const rules = matchRulesFor(
    { rules: match.rules ?? null, maxWickets: match.maxWickets ?? 10, totalOvers: match.totalOvers },
    openInnings.inningsNumber,
    target
  );

  return {
    ok: true,
    id: match.id,
    st: match.status,
    code: match.liveCode ?? null,
    t: teams,
    bat: {
      n: battingTeam,
      c: battingColor,
      s: `${openInnings.runs}/${openInnings.wickets}`,
      o: formatOvers(openInnings.completedOvers, openInnings.currentBalls),
      inn: openInnings.inningsNumber,
      tgt: target,
      rrr,
      need: target != null ? Math.max(target - openInnings.runs, 0) : null,
      crr,
    },
    s1: fmt(strikerId),
    s2: fmt(nonStrikerId),
    bw,
    l6,
    pp: rules.powerplayOvers > 0 && openInnings.completedOvers < rules.powerplayOvers,
    fi:
      openInnings.inningsNumber === 2 && firstInnings
        ? {
            n: teamNameFor(match, firstInnings.teamId),
            s: `${firstInnings.runs}/${firstInnings.wickets} (${formatOvers(firstInnings.completedOvers, firstInnings.currentBalls)})`,
          }
        : null,
    r: match.result ?? null,
  };
}

function teamNameFor(match: HubMatchLike, teamId: string): string {
  return teamId === match.team1.id ? match.team1.name : match.team2.name;
}

function teamColorFor(match: HubMatchLike, teamId: string): string {
  return teamId === match.team1.id ? match.team1.color : match.team2.color;
}
