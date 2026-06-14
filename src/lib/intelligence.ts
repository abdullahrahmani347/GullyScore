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

  // Batsman milestones (both striker and non-striker)
  alerts.push(...checkBatsmanMilestones(innings.batting));

  // Hat-trick chance
  alerts.push(...checkHatTrick(currentBowlerId, innings.bowling, innings.balls, innings.completedOvers));

  // Team milestones
  alerts.push(...checkTeamMilestones(innings.runs, innings.team.name));

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

  const oversBowled = innings.completedOvers + innings.currentBalls / 6;
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
