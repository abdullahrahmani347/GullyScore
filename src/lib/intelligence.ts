/**
 * GullyScore Intelligence Layer
 *
 * Milestone proximity alerts, innings projections, RRR danger meter,
 * and auto-commentary engine. All computed from existing ball data —
 * zero additional scorer input required.
 */

import type {
  InningsState,
  MatchData,
  BatsmanInningsData,
  BowlerInningsData,
  BallRecord,
  WicketType,
} from '@/types';
import { fold, type BallEvent, type MatchRules } from './engine';

// ─────────────────────────────────────────────────────
// MILESTONE PROXIMITY ALERTS
// ─────────────────────────────────────────────────────

export interface MilestoneAlert {
  type: 'BATSMAN_MILESTONE' | 'BOUNDARY_MILESTONE' | 'HAT_TRICK' | 'TEAM_MILESTONE' | 'CHASE_COUNTDOWN';
  message: string;
  urgency: 'info' | 'warning' | 'critical'; // info = subtle, warning = amber, critical = flashing
  icon: string;
}

const BATSMAN_MILESTONES = [25, 50, 75, 100];
const TEAM_MILESTONES = [50, 100, 150, 200, 250, 300];

/**
 * Check if a batsman is within striking distance of a milestone.
 * Returns an alert if the batsman is within 5 runs of 25/50/75/100,
 * or on 49 (one boundary away from 50).
 */
function checkBatsmanMilestones(batting: BatsmanInningsData[]): MilestoneAlert[] {
  const alerts: MilestoneAlert[] = [];

  for (const b of batting) {
    if (b.isOut) continue;

    // Check proximity to milestones (within 5 runs)
    for (const milestone of BATSMAN_MILESTONES) {
      if (b.runs >= milestone - 5 && b.runs < milestone) {
        const away = milestone - b.runs;
        const isBoundaryMilestone = b.runs === milestone - 4 || b.runs === milestone - 6;

        if (b.runs === milestone - 1) {
          // On 49, 24, 74, 99 — one single away
          alerts.push({
            type: 'BATSMAN_MILESTONE',
            message: `${b.player.name} on ${b.runs} — 1 run for ${milestone}!`,
            urgency: 'critical',
            icon: milestone === 100 ? '100' : `${milestone}`,
          });
        } else if (isBoundaryMilestone) {
          // One boundary away — special callout
          const boundaryType = b.runs === milestone - 4 ? 'FOUR' : 'SIX';
          if (milestone === 50 && b.runs === 49) {
            alerts.push({
              type: 'BOUNDARY_MILESTONE',
              message: `ONE MORE FOUR FOR 50! ${b.player.name} on ${b.runs}!`,
              urgency: 'critical',
              icon: '50',
            });
          } else {
            alerts.push({
              type: 'BATSMAN_MILESTONE',
              message: `${b.player.name} ${away} away from ${milestone} — one ${boundaryType} does it!`,
              urgency: 'warning',
              icon: `${milestone}`,
            });
          }
        } else {
          alerts.push({
            type: 'BATSMAN_MILESTONE',
            message: `${b.player.name} approaching ${milestone} — ${away} away`,
            urgency: away <= 2 ? 'warning' : 'info',
            icon: `${milestone}`,
          });
        }
        break; // Only alert for the nearest milestone
      }
    }
  }

  return alerts;
}

/**
 * Check if the current bowler has taken 2 wickets in the current over
 * (hat-trick chance).
 */
function checkHatTrick(
  currentBowlerId: string | null | undefined,
  bowling: BowlerInningsData[],
  balls: BallRecord[],
  completedOvers: number,
): MilestoneAlert[] {
  if (!currentBowlerId) return [];

  const currentOverWickets = balls.filter(
    (b) => b.overNumber === completedOvers && b.bowlerId === currentBowlerId && b.isWicket,
  );

  if (currentOverWickets.length === 2) {
    const bowler = bowling.find((b) => b.playerId === currentBowlerId);
    const bowlerName = bowler?.player.name ?? 'Bowler';
    return [{
      type: 'HAT_TRICK',
      message: `Hat trick chance? ${bowlerName} has 2 wickets this over!`,
      urgency: 'critical',
      icon: 'HAT',
    }];
  }

  return [];
}

/**
 * Check if the batting team is within 10 runs of a round number.
 */
function checkTeamMilestones(runs: number, teamName: string): MilestoneAlert[] {
  for (const milestone of TEAM_MILESTONES) {
    if (runs >= milestone - 10 && runs < milestone) {
      const away = milestone - runs;
      return [{
        type: 'TEAM_MILESTONE',
        message: `${teamName} approaching ${milestone} — ${away} away`,
        urgency: away <= 3 ? 'critical' : away <= 5 ? 'warning' : 'info',
        icon: `${milestone}`,
      }];
    }
    if (runs >= milestone) break; // Past this milestone, no need to check further
  }
  return [];
}

/**
 * In 2nd innings, check if the chasing team is within 10 of the target.
 */
function checkChaseCountdown(runs: number, target: number | null | undefined): MilestoneAlert[] {
  if (!target) return [];
  const needed = target - runs;
  if (needed > 0 && needed <= 10) {
    return [{
      type: 'CHASE_COUNTDOWN',
      message: `${needed} NEEDED!`,
      urgency: needed <= 3 ? 'critical' : needed <= 6 ? 'warning' : 'info',
      icon: `${needed}`,
    }];
  }
  return [];
}

/**
 * Compute all milestone proximity alerts for the current match state.
 * Call after every ball — cheap derived value check.
 */
export function computeMilestoneAlerts(
  match: MatchData,
  innings: InningsState,
  currentBowlerId: string | null | undefined,
): MilestoneAlert[] {
  const alerts: MilestoneAlert[] = [];

  // Defensive defaults: raw/offline innings rows can lack these arrays
  const batting = innings.batting ?? [];
  const bowling = innings.bowling ?? [];
  const balls = innings.balls ?? [];

  // Batsman milestones (both striker and non-striker)
  alerts.push(...checkBatsmanMilestones(batting));

  // Hat-trick chance
  alerts.push(...checkHatTrick(currentBowlerId, bowling, balls, innings.completedOvers));

  // Team milestones
  alerts.push(...checkTeamMilestones(innings.runs, innings.team?.name ?? innings.teamId));

  // Chase countdown (2nd innings only)
  if (innings.inningsNumber === 2) {
    alerts.push(...checkChaseCountdown(innings.runs, innings.target));
  }

  return alerts;
}

// ─────────────────────────────────────────────────────
// INNINGS PROJECTOR (1st innings)
// ─────────────────────────────────────────────────────

export interface ProjectionData {
  projectedScore: number;
  projectedWickets: number;
  projectedOvers: number;
  crr: number;
}

/**
 * PAR PROJECTION for 1st innings.
 * Formula: (currentRuns / currentOvers) * totalOvers
 * Also project wickets based on fall rate.
 */
export function computeProjection(
  innings: InningsState,
  totalOvers: number,
): ProjectionData | null {
  // Only for 1st innings
  if (innings.inningsNumber !== 2) {
    // Actually, inningsNumber 1 means 1st innings
  }
  if (innings.inningsNumber !== 1) return null;
  if (innings.isCompleted) return null;

  const oversBowled = innings.completedOvers + (innings.currentBalls ?? 0) / 6;
  if (oversBowled === 0) return null;

  const crr = innings.runs / oversBowled;
  const projectedScore = Math.round(crr * totalOvers);

  // Project wickets based on current fall rate
  const wicketsPerOver = innings.wickets / oversBowled;
  const projectedWickets = Math.min(
    Math.round(wicketsPerOver * totalOvers),
    10, // Max 10 wickets
  );

  return {
    projectedScore,
    projectedWickets,
    projectedOvers: totalOvers,
    crr: Math.round(crr * 100) / 100,
  };
}

// ─────────────────────────────────────────────────────
// REQUIRED RATE DANGER METER (2nd innings)
// ─────────────────────────────────────────────────────

export type DangerLevel = 'comfortable' | 'achievable' | 'difficult';

export interface RRRDangerData {
  rrr: number;
  level: DangerLevel;
  color: string;       // Tailwind text color
  bgColor: string;     // Tailwind bg color
  borderColor: string; // Tailwind border color
  label: string;
}

/**
 * Color-code the RRR display:
 * - Below 8 RPO → green ("comfortable")
 * - 8-12 RPO → amber ("achievable")
 * - Above 12 RPO → red ("very difficult")
 */
export function computeRRRDanger(
  rrr: number | null,
): RRRDangerData | null {
  if (rrr === null) return null;

  if (rrr < 8) {
    return {
      rrr,
      level: 'comfortable',
      color: 'text-green-400',
      bgColor: 'bg-green-400/10',
      borderColor: 'border-green-400/30',
      label: 'Comfortable',
    };
  }
  if (rrr <= 12) {
    return {
      rrr,
      level: 'achievable',
      color: 'text-amber-400',
      bgColor: 'bg-amber-400/10',
      borderColor: 'border-amber-400/30',
      label: 'Achievable',
    };
  }
  return {
    rrr,
    level: 'difficult',
    color: 'text-red-400',
    bgColor: 'bg-red-400/10',
    borderColor: 'border-red-400/30',
    label: 'Very Difficult',
  };
}

// ─────────────────────────────────────────────────────
// AUTO-COMMENTARY ENGINE
// ─────────────────────────────────────────────────────

export interface CommentaryEvent {
  category: CommentaryCategory;
  text: string;
  timestamp: number;
}

export type CommentaryCategory =
  | 'SIX'
  | 'FOUR'
  | 'WICKET_BOWLED'
  | 'WICKET_CAUGHT'
  | 'WICKET_OTHER'
  | 'MILESTONE_50'
  | 'MILESTONE_100'
  | 'OVER_COMPLETE'
  | 'DOT_SEQUENCE'
  | 'CHASE_CLOSE'
  | 'EXTRA';

const COMMENTARY_TEMPLATES: Record<CommentaryCategory, string[]> = {
  SIX: [
    '{batsman} sends it into orbit! SIX runs over long on!',
    'MAXIMUM! {batsman} clears the boundary with contempt!',
    '{batsman} goes downtown! That\'s SIX and the crowd erupts!',
    'Into the stands! {batsman} with a massive six!',
    'That\'s gone! {batsman} deposits it into the crowd — SIX!',
  ],
  FOUR: [
    '{batsman} finds the gap! Racing to the boundary — FOUR!',
    'Oh that\'s timed beautifully by {batsman}. FOUR runs!',
    '{batsman} slaps it past point! Four more on the board!',
    'FOUR! {batsman} threads the needle — unstoppable!',
    'Classy drive from {batsman} and it races away for FOUR!',
  ],
  WICKET_BOWLED: [
    'BOWLED! {bowler} hits the top of off stump! {batsman} walks!',
    'CLEANED UP! {batsman} is gone for {runs}! {bowler} with a beauty!',
    'Timber! {bowler} rattles the stumps! {batsman} departs for {runs}!',
  ],
  WICKET_CAUGHT: [
    'CAUGHT! {batsman} holes out to {fielder} off {bowler}! Gone for {runs}!',
    'Skies it and {fielder} takes a clean catch! {batsman} departs!',
    '{bowler} strikes! {batsman} edges to {fielder} — gone for {runs}!',
  ],
  WICKET_OTHER: [
    'GONE! {batsman} is out for {runs}! {bowler} gets the breakthrough!',
    'WICKET! {batsman} has to walk for {runs}. {bowler} is delighted!',
  ],
  MILESTONE_50: [
    'FIFTY UP for {batsman}! {balls} balls, {fours} fours, {sixes} sixes. Outstanding!',
    'What a knock! {batsman} reaches his half century in {balls} deliveries!',
    '{batsman} brings up the FIFTY! A masterclass in gully cricket!',
  ],
  MILESTONE_100: [
    'CENTURY! {batsman} reaches three figures! {balls} balls of pure class!',
    'HUNDRED for {batsman}! Take a bow — {fours} fours, {sixes} sixes!',
    '{batsman} brings up the HUNDRED! The crowd goes wild!',
  ],
  OVER_COMPLETE: [
    'Over {over} to {bowler}: {overRuns} runs, {overWickets} wicket(s). {innings_runs}/{innings_wickets}',
  ],
  DOT_SEQUENCE: [
    'Tight bowling from {bowler}. Three dots in a row — the pressure builds.',
    'Three consecutive dots! {bowler} is building serious pressure here.',
  ],
  CHASE_CLOSE: [
    'Just {needed} needed! Can they finish it from here?',
    '{needed} to win — this is getting tense!',
    'The finish line is in sight! {needed} more runs needed!',
  ],
  EXTRA: [
    'Extra runs! {extraType} and the total keeps ticking.',
  ],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getPlayerName(id: string | null | undefined, innings: InningsState): string {
  if (!id) return 'the batsman';
  const b = innings.batting.find((bi) => bi.playerId === id);
  return b?.player.name ?? 'the batsman';
}

function getBowlerName(id: string | null | undefined, innings: InningsState): string {
  if (!id) return 'the bowler';
  const b = innings.bowling.find((bi) => bi.playerId === id);
  return b?.player.name ?? 'the bowler';
}

function getFielderName(id: string | null | undefined, innings: InningsState, match: MatchData): string {
  if (!id) return 'the fielder';
  // Find player name from fielding team
  const fieldingTeamId = match.team1Id === innings.teamId ? match.team2Id : match.team1Id;
  const fieldingTeam = fieldingTeamId === match.team1Id ? match.team1 : match.team2;
  const player = fieldingTeam.players.find((p) => p.id === id);
  return player?.name ?? 'the fielder';
}

/**
 * Detect if the last 3 legal deliveries by the current bowler were all dots.
 */
function hasDotSequence(balls: BallRecord[], currentBowlerId: string | null, completedOvers: number, currentBalls: number): boolean {
  if (!currentBowlerId) return false;

  // Get last 3 legal deliveries by the current bowler
  const bowlerLegalBalls = balls
    .filter((b) => b.bowlerId === currentBowlerId && b.isLegalDelivery)
    .sort((a, b) => b.deliveryNumber - a.deliveryNumber);

  if (bowlerLegalBalls.length < 3) return false;

  const last3 = bowlerLegalBalls.slice(0, 3);
  return last3.every((b) => b.runs === 0);
}

/**
 * Compute over stats for the just-completed over.
 */
function getOverStats(balls: BallRecord[], overNumber: number): { runs: number; wickets: number } {
  const overBalls = balls.filter((b) => b.overNumber === overNumber);
  return {
    runs: overBalls.reduce((acc, b) => acc + b.runs + b.extraRuns, 0),
    wickets: overBalls.filter((b) => b.isWicket).length,
  };
}

/**
 * Generate a commentary line based on the last ball recorded.
 * This is the main entry point — call after each ball is recorded.
 */
export function generateCommentary(
  ball: BallRecord,
  innings: InningsState,
  match: MatchData,
  previousBatsmanRuns?: number, // runs before this ball (for milestone detection)
): CommentaryEvent | null {
  const batsmanName = getPlayerName(ball.batsmanId, innings);
  const bowlerName = getBowlerName(ball.bowlerId, innings);
  const fielderName = getFielderName(ball.fielderPlayerId, innings, match);

  // ── WICKET commentary ──
  if (ball.isWicket) {
    const dismissedRuns = innings.batting.find(
      (b) => b.playerId === ball.dismissedPlayerId,
    )?.runs ?? 0;
    // For milestones, we want the runs AT the time of dismissal
    // The batsman's current runs include this ball's contribution (which is 0 for wickets)
    const templateVars = {
      batsman: getPlayerName(ball.dismissedPlayerId, innings),
      bowler: bowlerName,
      fielder: fielderName,
      runs: String(dismissedRuns),
    };

    let category: CommentaryCategory;
    let templatePool: string[];

    if (ball.wicketType === 'BOWLED') {
      category = 'WICKET_BOWLED';
      templatePool = COMMENTARY_TEMPLATES.WICKET_BOWLED;
    } else if (ball.wicketType === 'CAUGHT') {
      category = 'WICKET_CAUGHT';
      templatePool = COMMENTARY_TEMPLATES.WICKET_CAUGHT;
    } else {
      category = 'WICKET_OTHER';
      templatePool = COMMENTARY_TEMPLATES.WICKET_OTHER;
    }

    return {
      category,
      text: interpolate(pickRandom(templatePool), templateVars),
      timestamp: Date.now(),
    };
  }

  // ── SIX commentary ──
  if (ball.runs === 6 && !ball.extraType) {
    const templateVars = { batsman: batsmanName, bowler: bowlerName };

    // Check for milestone
    const batsmanData = innings.batting.find((b) => b.playerId === ball.batsmanId);
    if (batsmanData && batsmanData.runs >= 100 && (previousBatsmanRuns ?? 0) < 100) {
      return {
        category: 'MILESTONE_100',
        text: interpolate(pickRandom(COMMENTARY_TEMPLATES.MILESTONE_100), {
          batsman: batsmanName,
          balls: String(batsmanData.balls),
          fours: String(batsmanData.fours),
          sixes: String(batsmanData.sixes),
        }),
        timestamp: Date.now(),
      };
    }
    if (batsmanData && batsmanData.runs >= 50 && (previousBatsmanRuns ?? 0) < 50) {
      return {
        category: 'MILESTONE_50',
        text: interpolate(pickRandom(COMMENTARY_TEMPLATES.MILESTONE_50), {
          batsman: batsmanName,
          balls: String(batsmanData.balls),
          fours: String(batsmanData.fours),
          sixes: String(batsmanData.sixes),
        }),
        timestamp: Date.now(),
      };
    }

    return {
      category: 'SIX',
      text: interpolate(pickRandom(COMMENTARY_TEMPLATES.SIX), templateVars),
      timestamp: Date.now(),
    };
  }

  // ── FOUR commentary ──
  if (ball.runs === 4 && !ball.extraType) {
    const templateVars = { batsman: batsmanName, bowler: bowlerName };

    // Check for milestone (batsman reached 50/100 with this four)
    const batsmanData = innings.batting.find((b) => b.playerId === ball.batsmanId);
    if (batsmanData && batsmanData.runs >= 100 && (previousBatsmanRuns ?? 0) < 100) {
      return {
        category: 'MILESTONE_100',
        text: interpolate(pickRandom(COMMENTARY_TEMPLATES.MILESTONE_100), {
          batsman: batsmanName,
          balls: String(batsmanData.balls),
          fours: String(batsmanData.fours),
          sixes: String(batsmanData.sixes),
        }),
        timestamp: Date.now(),
      };
    }
    if (batsmanData && batsmanData.runs >= 50 && (previousBatsmanRuns ?? 0) < 50) {
      return {
        category: 'MILESTONE_50',
        text: interpolate(pickRandom(COMMENTARY_TEMPLATES.MILESTONE_50), {
          batsman: batsmanName,
          balls: String(batsmanData.balls),
          fours: String(batsmanData.fours),
          sixes: String(batsmanData.sixes),
        }),
        timestamp: Date.now(),
      };
    }

    return {
      category: 'FOUR',
      text: interpolate(pickRandom(COMMENTARY_TEMPLATES.FOUR), templateVars),
      timestamp: Date.now(),
    };
  }

  // ── Milestone detection for any runs ──
  const batsmanData = innings.batting.find((b) => b.playerId === ball.batsmanId);
  if (batsmanData && previousBatsmanRuns !== undefined) {
    if (batsmanData.runs >= 100 && previousBatsmanRuns < 100) {
      return {
        category: 'MILESTONE_100',
        text: interpolate(pickRandom(COMMENTARY_TEMPLATES.MILESTONE_100), {
          batsman: batsmanName,
          balls: String(batsmanData.balls),
          fours: String(batsmanData.fours),
          sixes: String(batsmanData.sixes),
        }),
        timestamp: Date.now(),
      };
    }
    if (batsmanData.runs >= 50 && previousBatsmanRuns < 50) {
      return {
        category: 'MILESTONE_50',
        text: interpolate(pickRandom(COMMENTARY_TEMPLATES.MILESTONE_50), {
          batsman: batsmanName,
          balls: String(batsmanData.balls),
          fours: String(batsmanData.fours),
          sixes: String(batsmanData.sixes),
        }),
        timestamp: Date.now(),
      };
    }
  }

  // ── DOT SEQUENCE ──
  if (ball.runs === 0 && !ball.isWicket && ball.isLegalDelivery) {
    if (hasDotSequence(innings.balls, ball.bowlerId, innings.completedOvers, innings.currentBalls)) {
      return {
        category: 'DOT_SEQUENCE',
        text: interpolate(pickRandom(COMMENTARY_TEMPLATES.DOT_SEQUENCE), {
          bowler: bowlerName,
        }),
        timestamp: Date.now(),
      };
    }
  }

  // ── OVER COMPLETE ──
  if (ball.isLegalDelivery && innings.currentBalls === 0 && innings.completedOvers > 0) {
    const prevOverNumber = innings.completedOvers - 1;
    const overStats = getOverStats(innings.balls, prevOverNumber);
    return {
      category: 'OVER_COMPLETE',
      text: interpolate(pickRandom(COMMENTARY_TEMPLATES.OVER_COMPLETE), {
        over: String(prevOverNumber + 1),
        bowler: bowlerName,
        overRuns: String(overStats.runs),
        overWickets: String(overStats.wickets),
        innings_runs: String(innings.runs),
        innings_wickets: String(innings.wickets),
      }),
      timestamp: Date.now(),
    };
  }

  // ── CHASE CLOSE ──
  if (innings.inningsNumber === 2 && innings.target) {
    const needed = innings.target - innings.runs;
    if (needed > 0 && needed <= 10) {
      return {
        category: 'CHASE_CLOSE',
        text: interpolate(pickRandom(COMMENTARY_TEMPLATES.CHASE_CLOSE), {
          needed: String(needed),
        }),
        timestamp: Date.now(),
      };
    }
  }

  // ── Extras commentary ──
  if (ball.extraType) {
    return {
      category: 'EXTRA',
      text: interpolate(pickRandom(COMMENTARY_TEMPLATES.EXTRA), {
        extraType: ball.extraType === 'WIDE' ? 'Wide' : ball.extraType === 'NO_BALL' ? 'No Ball' : ball.extraType,
      }),
      timestamp: Date.now(),
    };
  }

  return null;
}

/**
 * Simple template interpolation: replaces {key} with value.
 */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

/**
 * Check if a batsman just crossed a milestone with the latest ball.
 * Returns the milestone number (50, 100) or null.
 */
export function getBatsmanMilestone(
  batsmanId: string,
  previousRuns: number,
  currentRuns: number,
): number | null {
  const milestones = [25, 50, 75, 100];
  for (const m of milestones) {
    if (previousRuns < m && currentRuns >= m) {
      return m;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// v2 §13 — ANALYTICS & INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════
//
// Everything in this section is PURE: plain rows in, numbers out. It runs
// identically in the browser (spectator/scoring UI), in API routes, in the
// offline replay engine and in the bun test suite. DB access never happens
// here — routes feed rows in.
//
// The one engine dependency is fold() (zero-dependency, §11.2), so the
// win-probability timeline sees EXACTLY the same over/wicket semantics as
// the scoring write path.

// ─────────────────────────────────────────────────────────────
// §13.5 / v1 §10 seam — TUNABLE STAT WEIGHTS (single object)
// ─────────────────────────────────────────────────────────────

/**
 * Every magic number in the §13 analytics lives here so a future tuning pass
 * (v1 §10) changes ONE object. The §13.1/§13.5 spec formulas are the defaults.
 */
export const STAT_WEIGHTS = {
  /** §13.1 win probability. */
  wp: {
    /** Chase: sigmoid(1.8·margin + 2.2·(WH − 0.5)) — spec constants. */
    marginScale: 1.8,
    wicketScale: 2.2,
    /** margin = clamp((currRR − reqRR) / max(reqRR, 1), −2, 2). */
    marginClamp: 2,
    /** WP clamp bounds. */
    min: 0.02,
    max: 0.98,
    /** §13.1 1st-innings heuristic: par run rate for the format (gully T10-ish). */
    parPerOver: 8,
    /** 1st innings: 0.5 + wicketScale·(WH−0.5) + rateScale·clamp((CRR−par)/par). */
    firstInningsWicketScale: 0.6,
    firstInningsRateScale: 0.3,
    firstInningsRateClamp: 1.5,
  },
  /** §13.5 MVP index — exact spec weights. */
  mvp: {
    runs: 1,
    fours: 2,
    sixes: 3,
    wickets: 20,
    maidens: 10,
    dots: 1,
    catches: 12,
    runouts: 15,
    stumpings: 12,
    /** Economy penalty: −max(0, econ − 7)·4, only for ≥ 2 overs bowled. */
    economyPar: 7,
    economyPenalty: 4,
    economyMinOvers: 2,
  },
  /** §13.9 turning-point detection. */
  turningPoint: {
    /** An over qualifies as a "moment" when |ΔWP| exceeds this. */
    swingThreshold: 0.15,
  },
  /** §13.8 partnership analytics. */
  partnership: {
    /** "Fastest stand" only counts stands with at least this many runs. */
    fastestMinRuns: 30,
  },
} as const;

// ─────────────────────────────────────────────────────────────
// §13.1 — WIN PROBABILITY
// ─────────────────────────────────────────────────────────────

/** Match context needed to compute WP (all derivable from Match + rules). */
export interface WinProbabilityContext {
  inningsNumber: number;
  totalOvers: number;
  maxWickets: number;
  target: number | null;
  ballsPerOver: number;
}

/** Minimal innings shape WP needs — satisfied by fold() InningsState rows. */
export interface WinProbabilityInnings {
  runs: number;
  wickets: number;
  completedOvers: number;
  currentBalls: number;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * §13.1 — win probability for the BATTING team, [0.02, 0.98].
 *
 * Chase (2nd innings with a target):
 *   margin = clamp((currRR − reqRR) / max(reqRR, 1), −2, 2)
 *   WH     = wicketsInHand / maxWickets
 *   WP     = clamp(sigmoid(1.8·margin + 2.2·(WH − 0.5)), 0.02, 0.98)
 *
 * 1st innings: 50% ± wickets-in-hand / run-rate-vs-par heuristic.
 *
 * Terminal states are hard-set (target reached → 0.98, chase over → 0.02)
 * so the live line pins at the result instead of asymptoting.
 */
export function winProbability(
  innings: WinProbabilityInnings,
  ctx: WinProbabilityContext,
): number {
  const w = STAT_WEIGHTS.wp;
  const oversBowled =
    innings.completedOvers + innings.currentBalls / Math.max(1, ctx.ballsPerOver);
  const wicketsInHand = Math.max(0, ctx.maxWickets - innings.wickets);
  const wh = ctx.maxWickets > 0 ? wicketsInHand / ctx.maxWickets : 1;

  if (ctx.inningsNumber === 2 && ctx.target != null) {
    const runsNeeded = ctx.target - innings.runs;
    if (runsNeeded <= 0) return w.max; // target reached — batting side has won
    if (innings.wickets >= ctx.maxWickets) return w.min; // all out
    const oversRemaining = ctx.totalOvers - oversBowled;
    if (oversRemaining <= 0) return w.min; // overs exhausted

    const currRR = oversBowled > 0 ? innings.runs / oversBowled : 0;
    const reqRR = runsNeeded / oversRemaining;
    const margin = clamp(
      (currRR - reqRR) / Math.max(reqRR, 1),
      -w.marginClamp,
      w.marginClamp,
    );
    return clamp(
      sigmoid(w.marginScale * margin + w.wicketScale * (wh - 0.5)),
      w.min,
      w.max,
    );
  }

  // 1st innings heuristic — 50% ± wickets-in-hand and pace-vs-par.
  // Zero balls bowled = zero information: exactly 50%.
  if (oversBowled <= 0) return 0.5;
  const currRR = innings.runs / oversBowled;
  const pace = clamp(
    (currRR - w.parPerOver) / Math.max(w.parPerOver, 1),
    -w.firstInningsRateClamp,
    w.firstInningsRateClamp,
  );
  return clamp(
    0.5 + w.firstInningsWicketScale * (wh - 0.5) + w.firstInningsRateScale * pace,
    w.min,
    w.max,
  );
}

// ─────────────────────────────────────────────────────────────
// §13.9 — TURNING-POINT DETECTION (WP swing > 15% per over)
// ─────────────────────────────────────────────────────────────

/** WP sampled at one point of the innings (over boundaries + "now"). */
export interface WpSnapshot {
  /** Completed overs at this snapshot (0-based over just finished). */
  overNumber: number;
  /** WP for the batting team at this point. */
  wp: number;
  /** Events consumed (deliveryNumber of the last live event included). */
  deliveryNumber: number;
  /** Runs / wickets at this point (for over deltas). */
  runs: number;
  wickets: number;
}

function isLiveEvent(e: BallEvent): boolean {
  return e.deletedAt == null;
}

/** Is this event a legal delivery (consumes a ball)? Mirrors engine legality. */
function isLegalEvent(e: BallEvent): boolean {
  return e.extraType !== 'WIDE' && e.extraType !== 'NO_BALL' && e.extraType !== 'PENALTY';
}

/**
 * WP timeline: one snapshot at each completed-over boundary plus the current
 * partial-over state. Snapshots come from fold() over event prefixes, so the
 * timeline is byte-identical to what the SSE `wp` broadcast will produce.
 */
export function wpTimeline(events: BallEvent[], rules: MatchRules): WpSnapshot[] {
  const bpo = Math.max(1, rules.ballsPerOver);
  const snapshots: WpSnapshot[] = [];
  let legalBalls = 0;

  // Opening state (before any ball) — 0.5 / formula at rest.
  snapshots.push(mkSnapshot(0, 0, fold(events.slice(0, 0), rules), 0));

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!isLiveEvent(e)) continue;
    if (!isLegalEvent(e)) continue;
    legalBalls++;
    if (legalBalls % bpo === 0) {
      const prefix = events.slice(0, i + 1);
      const state = fold(prefix, rules);
      snapshots.push(mkSnapshot(state.completedOvers, i + 1, state, i + 1));
    }
  }

  // Current partial state ("now" point) if it is beyond the last boundary.
  const state = fold(events, rules);
  const last = snapshots[snapshots.length - 1];
  if (state.legalBalls > 0 && (last == null || last.deliveryNumber < events.length)) {
    snapshots.push(mkSnapshot(state.completedOvers, events.length, state, events.length));
  }
  return snapshots;

  function mkSnapshot(
    overNumber: number,
    deliveryNumber: number,
    s: { runs: number; wickets: number; completedOvers: number; currentBalls: number },
    dn: number,
  ): WpSnapshot {
    return {
      overNumber,
      deliveryNumber: dn,
      wp: winProbability(s, {
        inningsNumber: rules.inningsNumber,
        totalOvers: rules.totalOvers,
        maxWickets: rules.maxWickets,
        target: rules.target,
        ballsPerOver: rules.ballsPerOver,
      }),
      runs: s.runs,
      wickets: s.wickets,
    };
  }
}

/** One detected "moment" — an over where WP swung more than the threshold. */
export interface TurningPoint {
  /** 1-based over number for display ("15th over"). */
  overNumber: number;
  runsInOver: number;
  wicketsInOver: number;
  /** Signed swing (wpAfter − wpBefore), batting-team perspective. */
  swing: number;
  wpBefore: number;
  wpAfter: number;
  /** e.g. "15th over: 2 wickets, WP 68%→31%" (§13.9 example format). */
  label: string;
}

/**
 * §13.9 — overs where WP swung > 15% become "moments". Feeds the live
 * "Catch me up" digest and the AI/template match report.
 */
export function detectTurningPoints(events: BallEvent[], rules: MatchRules): TurningPoint[] {
  const timeline = wpTimeline(events, rules).filter((s) => s.deliveryNumber > 0);
  const out: TurningPoint[] = [];
  const th = STAT_WEIGHTS.turningPoint.swingThreshold;

  for (let i = 1; i < timeline.length; i++) {
    const prev = timeline[i - 1];
    const cur = timeline[i];
    const swing = cur.wp - prev.wp;
    if (Math.abs(swing) <= th) continue;

    // Only over-boundary transitions count as "overs"; the partial "now"
    // snapshot shares overNumber with its boundary — skip it (it can't be a
    // full-over swing anyway because it extends, not starts, an over).
    if (cur.overNumber === prev.overNumber) continue;

    const runsInOver = cur.runs - prev.runs;
    const wicketsInOver = cur.wickets - prev.wickets;
    out.push({
      overNumber: cur.overNumber, // completedOvers after this over = 1-based number
      runsInOver,
      wicketsInOver,
      swing,
      wpBefore: prev.wp,
      wpAfter: cur.wp,
      label: formatTurningPoint({
        overNumber: cur.overNumber,
        runsInOver,
        wicketsInOver,
        wpBefore: prev.wp,
        wpAfter: cur.wp,
      }),
    });
  }
  return out;
}

function formatTurningPoint(tp: {
  overNumber: number;
  runsInOver: number;
  wicketsInOver: number;
  wpBefore: number;
  wpAfter: number;
}): string {
  const bits: string[] = [];
  if (tp.wicketsInOver > 0) bits.push(`${tp.wicketsInOver} wicket${tp.wicketsInOver > 1 ? 's' : ''}`);
  bits.push(`${tp.runsInOver} run${tp.runsInOver === 1 ? '' : 's'}`);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return `${ordinal(tp.overNumber)} over: ${bits.join(', ')}, WP ${pct(
    tp.wpBefore,
  )}→${pct(tp.wpAfter)}`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

// ─────────────────────────────────────────────────────────────
// §13.4 — BATTER × BOWLER MATCHUP MATRIX
// ─────────────────────────────────────────────────────────────

/** Minimal ball shape matchup counting needs (API BallRecord satisfies it). */
export interface MatchupBall {
  batsmanId: string;
  bowlerId: string;
  runs: number; // off the bat
  extraType?: string | null;
  extraRuns?: number;
  isWicket?: boolean;
  wicketType?: string | null;
  dismissedPlayerId?: string | null;
  fielderPlayerId?: string | null;
  deletedAt?: string | number | Date | null;
}

export interface MatchupCell {
  batsmanId: string;
  bowlerId: string;
  runs: number;
  /** Balls faced: every delivery except wides (no-balls count — §12.11). */
  balls: number;
  /** Deliveries faced where nothing at all was scored (no bat runs, no extras). */
  dots: number;
  fours: number;
  sixes: number;
  /** Times this batsman was DISMISSED by this bowler (bowler-credit or not). */
  dismissals: number;
}

/**
 * §13.4 — runs / balls / dots / dismissals grid, computed from Ball rows
 * (batsmanId × bowlerId). Works per match and aggregates across seasons —
 * feed it whichever ball list you want to summarize.
 */
export function matchupMatrix(balls: MatchupBall[]): MatchupCell[] {
  const cells = new Map<string, MatchupCell>();
  for (const b of balls) {
    if (b.deletedAt != null) continue;
    if (b.extraType === 'PENALTY') continue; // not a delivery
    const key = `${b.batsmanId}|${b.bowlerId}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = {
        batsmanId: b.batsmanId,
        bowlerId: b.bowlerId,
        runs: 0,
        balls: 0,
        dots: 0,
        fours: 0,
        sixes: 0,
        dismissals: 0,
      };
      cells.set(key, cell);
    }
    // Wides are not balls faced; no-balls ARE (§12.11 correctness fix).
    if (b.extraType !== 'WIDE') cell.balls++;
    cell.runs += b.runs;
    if (b.extraType == null && b.runs === 0) {
      // dot = ball faced, no runs off bat, no extras (NB carries a penalty run)
      cell.dots++;
    }
    if (b.runs === 4) cell.fours++;
    if (b.runs === 6) cell.sixes++;
    if (b.isWicket && b.dismissedPlayerId === b.batsmanId) cell.dismissals++;
  }
  return [...cells.values()];
}

// ─────────────────────────────────────────────────────────────
// §13.5 — MVP INDEX (exact, weights in STAT_WEIGHTS)
// ─────────────────────────────────────────────────────────────

/** Per-player inputs for the MVP formula. */
export interface MvpInput {
  playerId: string;
  runs: number;
  fours: number;
  sixes: number;
  wickets: number;
  maidens: number;
  /** Dot balls BOWLED (pressure deliveries). */
  dots: number;
  catches: number;
  runouts: number;
  stumpings: number;
  /** Economy (runs conceded per over); null/undefined = did not bowl. */
  economy?: number | null;
  /** Decimal overs bowled (economy penalty only applies at ≥ 2 overs). */
  oversBowled: number;
}

export interface MvpEntry {
  playerId: string;
  mvp: number;
  /** Weighted contributions, biggest first — powers the breakdown card. */
  breakdown: { key: string; label: string; value: number; points: number }[];
}

/**
 * §13.5 — the exact spec formula:
 *   MVP = runs·1 + fours·2 + sixes·3 + wickets·20 + maidens·10 + dots·1
 *         + catches·12 + runouts·15 + stumpings·12
 *         − max(0, econ − 7)·4     (only when ≥ 2 overs bowled)
 */
export function mvpIndex(stats: MvpInput): number {
  const w = STAT_WEIGHTS.mvp;
  let mvp =
    stats.runs * w.runs +
    stats.fours * w.fours +
    stats.sixes * w.sixes +
    stats.wickets * w.wickets +
    stats.maidens * w.maidens +
    stats.dots * w.dots +
    stats.catches * w.catches +
    stats.runouts * w.runouts +
    stats.stumpings * w.stumpings;

  if (stats.economy != null && stats.oversBowled >= w.economyMinOvers) {
    mvp -= Math.max(0, stats.economy - w.economyPar) * w.economyPenalty;
  }
  // MVP is an index — floor at 0 so the leaderboard never shows negatives.
  return Math.round(Math.max(0, mvp) * 100) / 100;
}

/** MVP table for a match/season — sorted desc, each with a display breakdown. */
export function mvpTable(stats: MvpInput[]): MvpEntry[] {
  const w = STAT_WEIGHTS.mvp;
  return stats
    .map((s) => ({
      playerId: s.playerId,
      mvp: mvpIndex(s),
      breakdown: (
        [
          ['runs', 'Runs', s.runs * w.runs],
          ['fours', 'Fours', s.fours * w.fours],
          ['sixes', 'Sixes', s.sixes * w.sixes],
          ['wickets', 'Wickets', s.wickets * w.wickets],
          ['maidens', 'Maidens', s.maidens * w.maidens],
          ['dots', 'Dots', s.dots * w.dots],
          ['catches', 'Catches', s.catches * w.catches],
          ['runouts', 'Run-outs', s.runouts * w.runouts],
          ['stumpings', 'Stumpings', s.stumpings * w.stumpings],
        ] as [string, string, number][]
      )
        .filter(([, , pts]) => pts > 0)
        .map(([key, label, points]) => ({
          key,
          label,
          value:
            key === 'runs' ? s.runs
            : key === 'fours' ? s.fours
            : key === 'sixes' ? s.sixes
            : key === 'wickets' ? s.wickets
            : key === 'maidens' ? s.maidens
            : key === 'dots' ? s.dots
            : key === 'catches' ? s.catches
            : key === 'runouts' ? s.runouts
            : s.stumpings,
          points: Math.round(points * 100) / 100,
        }))
        .concat(
          s.economy != null && s.oversBowled >= w.economyMinOvers && s.economy! > w.economyPar
            ? [{
                key: 'economy',
                label: `Economy ${s.economy!.toFixed(1)}`,
                value: 0,
                points: -Math.round(Math.max(0, s.economy! - w.economyPar) * w.economyPenalty * 100) / 100,
              }]
            : [],
        )
        .sort((a, b) => Math.abs(b.points) - Math.abs(a.points)),
    }))
    .sort((a, b) => b.mvp - a.mvp);
}

// ─────────────────────────────────────────────────────────────
// §13.7 — FORM GUIDES
// ─────────────────────────────────────────────────────────────

/** One completed batting innings for a player (match + runs context). */
export interface FormInning {
  runs: number;
  isOut: boolean;
  balls: number;
  matchId?: string;
  date?: string | number | Date;
  opposition?: string;
}

/** "34, 12*, 0, 78, 9" — not-out innings carry the asterisk. */
export function formatFormChip(f: FormInning): string {
  return `${f.runs}${f.isOut ? '' : '*'}`;
}

/** Last N batting innings, chronological (oldest → newest). */
export function lastFiveBatting(innings: FormInning[], count = 5): FormInning[] {
  const dated = [...innings].sort((a, b) => {
    const ta = a.date != null ? new Date(a.date).getTime() : 0;
    const tb = b.date != null ? new Date(b.date).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return (a.matchId ?? '').localeCompare(b.matchId ?? '');
  });
  return dated.slice(-count);
}

/** Batting form summary: total + average + best of the last N chips. */
export function formSummary(innings: FormInning[], count = 5): { total: number; average: number; best: number; notOuts: number } {
  const last = lastFiveBatting(innings, count);
  const total = last.reduce((a, f) => a + f.runs, 0);
  const outs = last.filter((f) => f.isOut).length;
  const best = last.reduce((a, f) => Math.max(a, f.runs), 0);
  return {
    total,
    average: outs > 0 ? Math.round((total / outs) * 10) / 10 : total,
    best,
    notOuts: last.length - outs,
  };
}

export type TeamFormResult = 'W' | 'L' | 'T' | 'Q';

/** One finished match relevant to a team's form strip. */
export interface TeamFormMatch {
  winnerId: string | null;
  status: string; // MatchStatus
  completed?: boolean;
}

/**
 * W/Q form strip for teams — last 5 results (§13.7).
 *   W won · L lost · T tied · Q no result (abandoned/incomplete)
 */
export function teamFormStrip(matches: TeamFormMatch[], teamId: string, count = 5): TeamFormResult[] {
  const played = matches.filter(
    (m) => m.status === 'COMPLETED' || m.status === 'ABANDONED',
  );
  return played
    .slice(-count)
    .map((m): TeamFormResult => {
      if (m.status !== 'COMPLETED' || m.winnerId == null) {
        return m.status === 'ABANDONED' ? 'Q' : 'T';
      }
      if (m.winnerId === teamId) return 'W';
      return 'L';
    });
}

// ─────────────────────────────────────────────────────────────
// §13.8 — PARTNERSHIP ANALYTICS
// ─────────────────────────────────────────────────────────────

export interface PartnershipLike {
  batsman1Id: string;
  batsman2Id: string;
  runs: number;
  balls: number;
  wicketNumber: number;
  isOpen: boolean;
  batsman1Name?: string;
  batsman2Name?: string;
}

export interface PartnershipAnalytics {
  /** Per-wicket-number graph data: avg stand by wicket number. */
  perWicket: { wicketNumber: number; count: number; totalRuns: number; avgRuns: number; avgBalls: number }[];
  /** Largest stand by runs. */
  biggest: PartnershipLike | null;
  /** Highest run-rate stand with ≥ STAT_WEIGHTS.partnership.fastestMinRuns. */
  fastest: PartnershipLike | null;
  fastestRunRate: number | null;
  /** Overall average stand (closed stands only). */
  avgStand: number;
  /** Every stand with its run rate, sorted by wicket number. */
  stands: (PartnershipLike & { runRate: number })[];
}

/** §13.8 — per-wicket stand graph, biggest/fastest, averages, run rates. */
export function partnershipAnalytics(stands: PartnershipLike[]): PartnershipAnalytics {
  const withRates = stands.map((p) => ({
    ...p,
    runRate: p.balls > 0 ? Math.round(((p.runs / p.balls) * 6) * 100) / 100 : 0, // runs per over
  }));

  const byWicket = new Map<number, PartnershipLike[]>();
  for (const p of stands) {
    if (p.wicketNumber <= 0 && p.isOpen) continue; // unclosed opening stand has no wicket number yet
    const list = byWicket.get(p.wicketNumber) ?? [];
    list.push(p);
    byWicket.set(p.wicketNumber, list);
  }

  const perWicket = [...byWicket.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([wicketNumber, list]) => {
      const totalRuns = list.reduce((a, p) => a + p.runs, 0);
      const totalBalls = list.reduce((a, p) => a + p.balls, 0);
      return {
        wicketNumber,
        count: list.length,
        totalRuns,
        avgRuns: Math.round((totalRuns / list.length) * 10) / 10,
        avgBalls: Math.round(totalBalls / list.length),
      };
    });

  const biggest = stands.reduce<PartnershipLike | null>(
    (best, p) => (best == null || p.runs > best.runs ? p : best),
    null,
  );

  const minRuns = STAT_WEIGHTS.partnership.fastestMinRuns;
  const eligible = stands.filter((p) => p.runs >= minRuns && p.balls > 0);
  const fastest = eligible.reduce<PartnershipLike | null>(
    (best, p) => {
      if (best == null) return p;
      const rr = p.runs / p.balls;
      const bestRr = best.runs / best.balls;
      return rr > bestRr ? p : best;
    },
    null,
  );

  const closed = stands.filter((p) => !p.isOpen);
  const avgStand = closed.length > 0
    ? Math.round((closed.reduce((a, p) => a + p.runs, 0) / closed.length) * 10) / 10
    : 0;

  return {
    perWicket,
    biggest,
    fastest,
    fastestRunRate: fastest ? Math.round((fastest.runs / fastest.balls) * 6 * 100) / 100 : null,
    avgStand,
    stands: withRates.sort((a, b) => a.wicketNumber - b.wicketNumber),
  };
}

// ─────────────────────────────────────────────────────────────
// §13.6 — PLAYER CAREER AGGREGATES
// ─────────────────────────────────────────────────────────────

/** One BatsmanInnings row with match context for a career list. */
export interface CareerBattingRow {
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  isOut: boolean;
  matchId?: string;
  date?: string | number | Date;
  opposition?: string;
}

/** One BowlerInnings row with match context for a career list. */
export interface CareerBowlingRow {
  completedOvers: number;
  balls: number; // balls in the current (partial) over
  runs: number;
  wickets: number;
  maidens?: number;
  matchId?: string;
  date?: string | number | Date;
  opposition?: string;
}

export interface CareerBattingSummary {
  innings: number;
  runs: number;
  highest: number;
  highestNotOut: boolean;
  /** Runs per dismissal — null when never dismissed (conventionally ∞). */
  average: number | null;
  strikeRate: number;
  fifties: number;
  hundreds: number;
  ducks: number;
  fours: number;
  sixes: number;
  notOuts: number;
}

export interface CareerBowlingSummary {
  innings: number;
  balls: number;
  runs: number;
  wickets: number;
  average: number | null;
  economy: number;
  strikeRate: number | null;
  /** Best figures by wickets, then fewest runs (e.g. "3/12"). */
  best: { wickets: number; runs: number } | null;
  fiveWicketHauls: number;
}

/** Aggregate a player's batting across every match (§13.6). */
export function careerBatting(rows: CareerBattingRow[]): CareerBattingSummary {
  const innings = rows.length;
  const runs = rows.reduce((a, r) => a + r.runs, 0);
  const balls = rows.reduce((a, r) => a + r.balls, 0);
  const outs = rows.filter((r) => r.isOut).length;
  const best = rows.reduce<{ runs: number; isOut: boolean } | null>(
    (b, r) => {
      if (b == null) return { runs: r.runs, isOut: r.isOut };
      if (r.runs > b.runs) return { runs: r.runs, isOut: r.isOut };
      if (r.runs === b.runs && !r.isOut && b.isOut) return { runs: r.runs, isOut: r.isOut };
      return b;
    },
    null,
  );
  return {
    innings,
    runs,
    highest: best?.runs ?? 0,
    highestNotOut: best ? !best.isOut : false,
    average: outs > 0 ? Math.round((runs / outs) * 100) / 100 : null,
    strikeRate: balls > 0 ? Math.round((runs / balls) * 1000) / 10 : 0,
    fifties: rows.filter((r) => r.runs >= 50 && r.runs < 100).length,
    hundreds: rows.filter((r) => r.runs >= 100).length,
    ducks: rows.filter((r) => r.isOut && r.runs === 0).length,
    fours: rows.reduce((a, r) => a + r.fours, 0),
    sixes: rows.reduce((a, r) => a + r.sixes, 0),
    notOuts: innings - outs,
  };
}

/** Aggregate a player's bowling across every match (§13.6). */
export function careerBowling(rows: CareerBowlingRow[]): CareerBowlingSummary {
  const balls = rows.reduce((a, r) => a + r.completedOvers * 6 + r.balls, 0);
  const runs = rows.reduce((a, r) => a + r.runs, 0);
  const wickets = rows.reduce((a, r) => a + r.wickets, 0);
  const best = rows.reduce<{ wickets: number; runs: number } | null>(
    (b, r) => {
      if (r.wickets === 0) return b;
      if (b == null) return { wickets: r.wickets, runs: r.runs };
      if (
        r.wickets > b.wickets ||
        (r.wickets === b.wickets && r.runs < b.runs)
      ) {
        return { wickets: r.wickets, runs: r.runs };
      }
      return b;
    },
    null,
  );
  return {
    innings: rows.length,
    balls,
    runs,
    wickets,
    average: wickets > 0 ? Math.round((runs / wickets) * 100) / 100 : null,
    economy: balls > 0 ? Math.round((runs / (balls / 6)) * 100) / 100 : 0,
    strikeRate: wickets > 0 ? Math.round((balls / wickets) * 10) / 10 : null,
    best,
    fiveWicketHauls: rows.filter((r) => r.wickets >= 5).length,
  };
}

/** Career milestone feed — 50s, 100s, 5WI hauls, best figures. */
export interface CareerMilestone {
  type: 'FIFTY' | 'HUNDRED' | 'FIVE_WICKETS' | 'BEST_FIGURES';
  label: string;
  matchId?: string;
  date?: string | number | Date;
}

export function careerMilestones(
  batting: CareerBattingRow[],
  bowling: CareerBowlingRow[],
): CareerMilestone[] {
  const out: CareerMilestone[] = [];
  for (const r of batting) {
    if (r.runs >= 100) {
      out.push({ type: 'HUNDRED', label: `${r.runs} (${r.balls}b)`, matchId: r.matchId, date: r.date });
    } else if (r.runs >= 50) {
      out.push({ type: 'FIFTY', label: `${r.runs}${r.isOut ? '' : '*'} (${r.balls}b)`, matchId: r.matchId, date: r.date });
    }
  }
  for (const r of bowling) {
    if (r.wickets >= 5) {
      out.push({ type: 'FIVE_WICKETS', label: `${r.wickets}/${r.runs}`, matchId: r.matchId, date: r.date });
    }
  }
  const best = careerBowling(bowling).best;
  if (best) {
    out.push({ type: 'BEST_FIGURES', label: `${best.wickets}/${best.runs}` });
  }
  return out.sort((a, b) => {
    const ta = a.date != null ? new Date(a.date).getTime() : 0;
    const tb = b.date != null ? new Date(b.date).getTime() : 0;
    return tb - ta;
  });
}

// ─────────────────────────────────────────────────────────────
// §13.2 — WAGON WHEEL (8-sector compass)
// ─────────────────────────────────────────────────────────────

export type WagonDirection =
  | 'V'
  | 'MID_WICKET'
  | 'SQUARE_LEG'
  | 'FINE_LEG'
  | 'THIRD_MAN'
  | 'POINT'
  | 'COVER'
  | 'MID_OFF';

export const WAGON_DIRECTIONS: readonly WagonDirection[] = [
  'V',
  'MID_OFF',
  'COVER',
  'POINT',
  'THIRD_MAN',
  'FINE_LEG',
  'SQUARE_LEG',
  'MID_WICKET',
] as const;

export const WAGON_LABELS: Record<WagonDirection, string> = {
  V: 'V (straight)',
  MID_OFF: 'Mid-off',
  COVER: 'Cover',
  POINT: 'Point',
  THIRD_MAN: 'Third man',
  FINE_LEG: 'Fine leg',
  SQUARE_LEG: 'Square leg',
  MID_WICKET: 'Mid-wicket',
};

/**
 * Sector angles in DEGREES CLOCKWISE FROM NORTH on the wagon wheel (batsman
 * at the centre, bowler at the top). Off side sits EAST for a right-hander —
 * matching how a right-hander stands (chest to the off side, slips to the
 * keeper's right). Left-handers are mirrored by reflecting E↔W.
 */
const WAGON_ANGLES_RIGHT: Record<WagonDirection, number> = {
  V: 0,
  MID_OFF: 45,
  COVER: 70,
  POINT: 100,
  THIRD_MAN: 145,
  FINE_LEG: 215,
  SQUARE_LEG: 268,
  MID_WICKET: 300,
};

/** §13.2 — compass angle for a sector; mirrored for left-handers. */
export function wagonAngle(dir: WagonDirection, leftHand = false): number {
  const a = WAGON_ANGLES_RIGHT[dir] ?? 0;
  if (!leftHand) return a;
  return (360 - a) % 360;
}

/** Convert a compass angle to an (x, y) unit vector (SVG coords, y down). */
export function compassToXY(angleDegrees: number, radius: number): { x: number; y: number } {
  const rad = (angleDegrees * Math.PI) / 180;
  return { x: Math.sin(rad) * radius, y: -Math.cos(rad) * radius };
}

/** Line radius by runs scored: 1–3 partial, 4 boundary, 6 maximum. */
export function wagonRadiusForRuns(runs: number): number {
  if (runs >= 6) return 1.0;
  if (runs === 4) return 0.93;
  if (runs === 3) return 0.8;
  if (runs === 2) return 0.66;
  if (runs === 1) return 0.5;
  return 0.35;
}

// ─────────────────────────────────────────────────────────────
// §13.3 — PITCH MAP
// ─────────────────────────────────────────────────────────────

export type PitchLength = 'yorker' | 'full' | 'good' | 'short' | 'bouncer';
export type PitchLine = 'wide-off' | 'off' | 'stumps' | 'middle' | 'leg';

export const PITCH_LENGTHS: readonly PitchLength[] = ['yorker', 'full', 'good', 'short', 'bouncer'] as const;
export const PITCH_LINES: readonly PitchLine[] = ['wide-off', 'off', 'stumps', 'middle', 'leg'] as const;

export const PITCH_LENGTH_LABELS: Record<PitchLength, string> = {
  yorker: 'Yorker',
  full: 'Full',
  good: 'Good',
  short: 'Short',
  bouncer: 'Bouncer',
};

export const PITCH_LINE_LABELS: Record<PitchLine, string> = {
  'wide-off': 'Wide off',
  off: 'Off',
  stumps: 'Stumps',
  middle: 'Middle',
  leg: 'Leg',
};

export interface PitchMapBall {
  bowlerId: string;
  pitchLength?: string | null;
  pitchLine?: string | null;
  runs?: number;
  extraType?: string | null;
  isWicket?: boolean;
  deletedAt?: string | number | Date | null;
}

export interface PitchHeatmap {
  /** grid[lengthIndex][lineIndex] = deliveries landing there. */
  grid: number[][];
  lengthTotals: number[];
  lineTotals: number[];
  /** Deliveries with a length+line recorded. */
  total: number;
  /** Wickets landed per cell (same orientation as grid). */
  wicketGrid: number[][];
}

/** §13.3 — per-bowler heatmap grid + length/line distribution bars. */
export function pitchHeatmap(balls: PitchMapBall[]): PitchHeatmap {
  const grid = PITCH_LENGTHS.map(() => PITCH_LINES.map(() => 0));
  const wicketGrid = PITCH_LENGTHS.map(() => PITCH_LINES.map(() => 0));
  let total = 0;
  for (const b of balls) {
    if (b.deletedAt != null) continue;
    const li = PITCH_LENGTHS.indexOf(b.pitchLength as PitchLength);
    const ci = PITCH_LINES.indexOf(b.pitchLine as PitchLine);
    if (li < 0 || ci < 0) continue;
    grid[li][ci]++;
    if (b.isWicket) wicketGrid[li][ci]++;
    total++;
  }
  return {
    grid,
    wicketGrid,
    lengthTotals: grid.map((row) => row.reduce((a, v) => a + v, 0)),
    lineTotals: PITCH_LINES.map((_, ci) => grid.reduce((a, row) => a + row[ci], 0)),
    total,
  };
}

// ─────────────────────────────────────────────────────────────
// §13.10 — MATCH REPORT PROMPT (structured, for z-ai-web-dev-sdk)
// ─────────────────────────────────────────────────────────────

/** Structured facts the report writer (LLM or template) receives. */
export interface MatchReportFacts {
  team1: string;
  team2: string;
  venue?: string | null;
  result?: string | null;
  innings: {
    battingTeam: string;
    runs: number;
    wickets: number;
    overs: string;
    topScore?: { name: string; runs: number; balls: number } | null;
    bestBowling?: { name: string; wickets: number; runs: number; overs: string } | null;
  }[];
  turningPoints?: TurningPoint[];
  mvp?: { name: string; mvp: number } | null;
  biggestPartnership?: { names: string; runs: number; balls: number } | null;
}

/** Build the structured LLM prompt from the folded scorecard + turning points. */
export function buildMatchReportPrompt(facts: MatchReportFacts): string {
  const lines: string[] = [];
  lines.push(`Write a compelling 300-450 word match report for a gully cricket match.`);
  lines.push('');
  lines.push(`MATCH FACTS (all numbers are authoritative — do not invent others):`);
  lines.push(`Teams: ${facts.team1} vs ${facts.team2}${facts.venue ? ` at ${facts.venue}` : ''}`);
  if (facts.result) lines.push(`Result: ${facts.result}`);
  for (const inn of facts.innings) {
    lines.push(
      `${inn.battingTeam}: ${inn.runs}/${inn.wickets} in ${inn.overs} overs` +
        (inn.topScore ? `; top score ${inn.topScore.name} ${inn.topScore.runs} (${inn.topScore.balls}b)` : '') +
        (inn.bestBowling ? `; best bowling ${inn.bestBowling.name} ${inn.bestBowling.wickets}/${inn.bestBowling.runs} (${inn.bestBowling.overs} ov)` : ''),
    );
  }
  if (facts.biggestPartnership) {
    lines.push(
      `Biggest partnership: ${facts.biggestPartnership.names} — ${facts.biggestPartnership.runs} runs off ${facts.biggestPartnership.balls} balls`,
    );
  }
  if (facts.turningPoints && facts.turningPoints.length > 0) {
    lines.push(`Turning points (win-probability swings):`);
    for (const tp of facts.turningPoints.slice(0, 6)) lines.push(`- ${tp.label}`);
  }
  if (facts.mvp) {
    lines.push(`Player of the match (MVP index): ${facts.mvp.name} (${facts.mvp.mvp} points)`);
  }
  lines.push('');
  lines.push(`STYLE:`);
  lines.push(`- Section headings: "The Setup", "The Turning Point", "The Finish".`);
  lines.push(`- Energetic gully-cricket commentary voice; short punchy paragraphs.`);
  lines.push(`- Use ONLY the facts above; you may describe momentum, not invent events.`);
  lines.push(`- End with a one-line verdict.`);
  return lines.join('\n');
}
