/**
 * GullyScore Match Story Generator
 *
 * Generates a narrative match report — a WhatsApp-ready wall of text
 * that reads like a local newspaper cricket column. Not a raw scorecard,
 * but a story. Readable. Shareable.
 *
 * Entirely template-driven + data-injected. Zero AI required.
 */

import type { MatchData, InningsState, BatsmanInningsData, BowlerInningsData, PartnershipData } from '@/types';

/**
 * Generate a full narrative match report string.
 */
export function generateMatchStory(match: MatchData): string {
  const inn1 = match.innings?.[0];
  const inn2 = match.innings?.[1];
  if (!inn1) return '';

  const date = new Date(match.createdAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const venue = match.venue ?? '';

  // Determine winner and result context
  const resultLine = match.result ?? 'Match completed';
  const winner = match.winnerId
    ? match.team1Id === match.winnerId ? match.team1 : match.team2
    : null;
  const loser = winner
    ? match.team1Id === winner.id ? match.team2 : match.team1
    : null;

  // ── 1st Innings narrative ──
  const inn1Narrative = buildInningsNarrative(inn1, '1st', match.totalOvers);

  // ── 2nd Innings narrative (chase) ──
  let inn2Narrative = '';
  if (inn2) {
    inn2Narrative = buildChaseNarrative(inn2, inn1, match.totalOvers);
  }

  // ── Player of the Match ──
  const potm = buildPlayerOfTheMatch(inn1, inn2);

  // ── Best bowling ──
  const bestBowling = buildBestBowling(inn1, inn2);

  // ── Best partnership ──
  const bestPartnership = buildBestPartnership(inn1, inn2);

  // ── Assemble ──
  const lines: string[] = [];

  // Header
  lines.push(`🏏 GullyScore Match Report | ${date}`);
  lines.push('');

  // Result line
  lines.push(resultLine.toUpperCase());
  if (venue) {
    lines.push(`at ${venue}`);
  }
  lines.push('');

  // 1st innings
  lines.push(`BATTING: ${inn1Narrative}`);
  lines.push('');

  // 2nd innings (chase)
  if (inn2Narrative) {
    lines.push(`CHASE: ${inn2Narrative}`);
    lines.push('');
  }

  // Stars section
  if (potm) lines.push(potm);
  if (bestBowling) lines.push(bestBowling);
  if (bestPartnership) lines.push(bestPartnership);

  lines.push('');
  lines.push('Scored with GullyScore 🏏');

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────
// INNINGS NARRATIVE BUILDERS
// ─────────────────────────────────────────────────────

function buildInningsNarrative(inn: InningsState, label: string, totalOvers: number): string {
  const teamName = inn.team.name;
  const score = `${inn.runs}/${inn.wickets}`;
  const oversStr = `${inn.completedOvers}.${inn.currentBalls}`;

  // Top batsman
  const topBat = getTopBatsman(inn.batting);
  // Best partnership
  const bestStand = getBestPartnership(inn.partnerships);
  // Best bowler (from bowling side perspective — most economical + wickets)
  const disciplinedBowler = getDisciplinedBowler(inn.bowling);
  // Death overs analysis
  const deathAnalysis = getDeathAnalysis(inn, totalOvers);

  let narrative = `${teamName} posted ${score} in ${oversStr} overs.`;

  if (topBat) {
    narrative += ` ${topBat.player.name} was the standout, scoring ${topBat.runs} off ${topBat.balls} balls`;
    if (topBat.fours > 0 || topBat.sixes > 0) {
      const boundaries: string[] = [];
      if (topBat.fours > 0) boundaries.push(`${topBat.fours}\u00D74`);
      if (topBat.sixes > 0) boundaries.push(`${topBat.sixes}\u00D76`);
      narrative += ` (${boundaries.join(', ')})`;
    }
    narrative += '.';
  }

  if (bestStand) {
    const standRuns = bestStand.runs;
    const standBalls = bestStand.balls;
    const wicketLabel = getWicketLabel(bestStand.wicketNumber);
    narrative += ` A crucial ${standRuns}-run ${wicketLabel} between ${bestStand.batsman1.name} and ${bestStand.batsman2.name} (${standBalls} balls)`;
    if (standRuns >= 50) {
      narrative += ` powered ${teamName} past the ${getMilestoneCrossed(inn.runs)}-run mark`;
    }
    narrative += '.';
  }

  if (disciplinedBowler) {
    const economy = disciplinaryEconomy(disciplinedBowler);
    narrative += ` ${getOppositionTeamHint(inn)} were disciplined early \u2014 ${disciplinedBowler.player.name} conceded just ${disciplinedBowler.runs} in ${formatBowlingOvers(disciplinedBowler)}`;
    if (disciplinedBowler.wickets > 0) {
      narrative += ` with ${disciplinedBowler.wickets} wicket${disciplinedBowler.wickets > 1 ? 's' : ''}`;
    }
    narrative += '.';
  }

  if (deathAnalysis) {
    narrative += ` ${deathAnalysis}`;
  }

  return narrative;
}

function buildChaseNarrative(inn2: InningsState, inn1: InningsState, totalOvers: number): string {
  const teamName = inn2.team.name;
  const target = inn2.target ?? (inn1.runs + 1);
  const score = `${inn2.runs}/${inn2.wickets}`;
  const oversStr = `${inn2.completedOvers}.${inn2.currentBalls}`;

  const topBat = getTopBatsman(inn2.batting);
  const bestBowler = getBestBowler(inn2.bowling);
  const keyMoments = getKeyMoments(inn2);

  let narrative = `${teamName} needed ${target} and `;

  if (inn2.runs >= target) {
    // Chase successful
    narrative += `${teamName} got there with ${score} in ${oversStr} overs.`;
  } else if (inn2.isCompleted) {
    // Chase failed
    const shortBy = target - inn2.runs;
    narrative += `${teamName} fell short by ${shortBy} run${shortBy !== 1 ? 's' : ''}, finishing on ${score} in ${oversStr} overs.`;
  } else {
    narrative += `${teamName} are ${score} in ${oversStr} overs.`;
  }

  if (topBat && topBat.runs >= 15) {
    narrative += ` ${topBat.player.name} showed intent with ${topBat.runs} off ${topBat.balls}`;
    if (topBat.fours > 0 || topBat.sixes > 0) {
      const boundaries: string[] = [];
      if (topBat.fours > 0) boundaries.push(`${topBat.fours}\u00D74`);
      if (topBat.sixes > 0) boundaries.push(`${topBat.sixes}\u00D76`);
      narrative += ` (${boundaries.join(', ')})`;
    }
    narrative += '.';
  }

  if (keyMoments) {
    narrative += ` ${keyMoments}`;
  }

  if (bestBowler && bestBowler.wickets >= 2) {
    narrative += ` ${bestBowler.player.name} delivered the knockout blow with ${formatBowlingFigures(bestBowler)} from ${formatBowlingOvers(bestBowler)}`;
    if (inn2.isCompleted && inn2.runs < target) {
      narrative += ` as ${teamName} were bowled out for ${inn2.runs}`;
      if (inn2.completedOvers === totalOvers) {
        narrative += ` in the final over`;
      }
      narrative += '.';
    } else {
      narrative += '.';
    }
  }

  return narrative;
}

// ─────────────────────────────────────────────────────
// PLAYER OF THE MATCH
// ─────────────────────────────────────────────────────

function buildPlayerOfTheMatch(inn1: InningsState, inn2?: InningsState): string {
  // Find the best overall performer
  const allBatting = [...inn1.batting, ...(inn2?.batting ?? [])];
  const allBowling = [...inn1.bowling, ...(inn2?.bowling ?? [])];

  // Priority: 3+ wickets > 50+ runs > 3+ wickets with low economy
  const bestBowler = [...allBowling].sort((a, b) =>
    b.wickets - a.wickets || a.runs - b.runs
  )[0];

  if (bestBowler && bestBowler.wickets >= 3) {
    const stats = [];
    stats.push(`${formatBowlingFigures(bestBowler)} (${formatBowlingOvers(bestBowler)})`);
    // Check if they also batted
    const battingInn = allBatting.find((b) => b.playerId === bestBowler.playerId);
    if (battingInn && battingInn.runs > 0) {
      stats.push(`${battingInn.runs}(${battingInn.balls}) batting`);
    }
    // Check for catches
    const catches = countCatches(bestBowler.playerId, inn1, inn2);
    if (catches > 0) stats.push(`${catches} catch${catches > 1 ? 'es' : ''}`);
    return `\u2B50 Player of the Match: ${bestBowler.player.name} \u2014 ${stats.join(', ')}`;
  }

  const bestBat = [...allBatting].sort((a, b) => b.runs - a.runs)[0];
  if (bestBat && bestBat.runs >= 20) {
    const stats = [];
    const sr = bestBat.balls > 0 ? Math.round((bestBat.runs / bestBat.balls) * 100) : 0;
    stats.push(`${bestBat.runs}(${bestBat.balls})`);
    stats.push(`${sr} SR`);
    const catches = countCatches(bestBat.playerId, inn1, inn2);
    if (catches > 0) stats.push(`${catches} catch${catches > 1 ? 'es' : ''}`);
    return `\u2B50 Player of the Match: ${bestBat.player.name} \u2014 ${stats.join(', ')}`;
  }

  return '';
}

function buildBestBowling(inn1: InningsState, inn2?: InningsState): string {
  const allBowling = [...inn1.bowling, ...(inn2?.bowling ?? [])];
  const best = [...allBowling].sort((a, b) =>
    b.wickets - a.wickets || a.runs - b.runs
  )[0];

  if (!best || best.wickets === 0) return '';

  return `\uD83D\uDCCA Best bowling: ${best.player.name} \u2014 ${formatBowlingFigures(best)} (${formatBowlingOvers(best)})`;
}

function buildBestPartnership(inn1: InningsState, inn2?: InningsState): string {
  const allPartnerships = [
    ...(inn1.partnerships ?? []),
    ...(inn2?.partnerships ?? []),
  ].filter((p) => p.runs > 0);

  if (allPartnerships.length === 0) return '';

  const best = [...allPartnerships].sort((a, b) => b.runs - a.runs)[0];
  return `\uD83E\uDD1D Best partnership: ${best.batsman1.name} + ${best.batsman2.name} \u2014 ${best.runs} runs (${best.balls} balls)`;
}

// ─────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────

function getTopBatsman(batting: BatsmanInningsData[]): BatsmanInningsData | null {
  const eligible = batting.filter((b) => b.runs > 0);
  if (eligible.length === 0) return null;
  return [...eligible].sort((a, b) => b.runs - a.runs)[0];
}

function getBestBowler(bowling: BowlerInningsData[]): BowlerInningsData | null {
  const eligible = bowling.filter((b) => b.wickets > 0);
  if (eligible.length === 0) return null;
  return [...eligible].sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)[0];
}

function getDisciplinedBowler(bowling: BowlerInningsData[]): BowlerInningsData | null {
  // Bowler with lowest economy (min 2 overs bowled)
  const eligible = bowling.filter((b) => {
    const totalBalls = b.completedOvers * 6 + b.balls;
    return totalBalls >= 12; // At least 2 overs
  });
  if (eligible.length === 0) return null;
  return [...eligible].sort((a, b) => {
    const econA = a.runs / (a.completedOvers + a.balls / 6);
    const econB = b.runs / (b.completedOvers + b.balls / 6);
    return econA - econB;
  })[0];
}

function getBestPartnership(partnerships?: PartnershipData[]): PartnershipData | null {
  if (!partnerships || partnerships.length === 0) return null;
  return [...partnerships].sort((a, b) => b.runs - a.runs)[0];
}

function getWicketLabel(wicketNumber: number): string {
  if (wicketNumber <= 2) return 'opening stand';
  if (wicketNumber <= 4) return `${ordinal(wicketNumber - 1)}-wicket stand`;
  return `${ordinal(wicketNumber - 1)}-wicket stand`;
}

function getMilestoneCrossed(runs: number): number {
  if (runs >= 200) return 200;
  if (runs >= 150) return 150;
  if (runs >= 100) return 100;
  if (runs >= 50) return 50;
  return runs;
}

function getOppositionTeamHint(inn: InningsState): string {
  // In the bowling section context, we refer to the fielding team's bowling
  return 'The bowling attack';
}

function getDeathAnalysis(inn: InningsState, totalOvers: number): string | null {
  // Analyze the last 2 overs if they exist
  if (inn.completedOvers < totalOvers - 1) return null;

  const deathOverStart = Math.max(totalOvers - 2, 0);
  const deathBalls = inn.balls.filter((b) => b.overNumber >= deathOverStart);
  if (deathBalls.length === 0) return null;

  const deathRuns = deathBalls.reduce((acc, b) => acc + b.runs + b.extraRuns, 0);
  const deathWickets = deathBalls.filter((b) => b.isWicket).length;

  if (deathRuns >= 20) {
    return `${deathRuns} runs came in the last 2 overs as the batters exploded in the death.`;
  }
  if (deathWickets >= 2) {
    return `But ${deathWickets} wickets tumbled in the death overs to pull things back.`;
  }
  return null;
}

function getKeyMoments(inn: InningsState): string | null {
  // Identify when key wickets fell
  const wicketBalls = inn.balls.filter((b) => b.isWicket).sort((a, b) => a.deliveryNumber - b.deliveryNumber);
  if (wicketBalls.length < 2) return null;

  // Were wickets falling at regular intervals?
  const intervals: number[] = [];
  for (let i = 1; i < wicketBalls.length; i++) {
    intervals.push(wicketBalls[i].deliveryNumber - wicketBalls[i - 1].deliveryNumber);
  }

  // Check for a collapse: 2+ wickets in quick succession (within 6 balls)
  for (let i = 0; i < wicketBalls.length - 1; i++) {
    const overNum = wicketBalls[i].overNumber;
    const nextOverNum = wicketBalls[i + 1].overNumber;
    if (nextOverNum - overNum <= 1) {
      const firstDismissed = inn.batting.find((b) => b.playerId === wicketBalls[i].dismissedPlayerId);
      const name = firstDismissed?.player.name ?? 'A batter';
      return `Wickets fell at key moments \u2014 ${name}'s dismissal triggered a collapse.`;
    }
  }

  return 'But wickets fell at key moments to derail the chase.';
}

function countCatches(playerId: string, inn1: InningsState, inn2?: InningsState): number {
  let catches = 0;
  const innings = [inn1, ...(inn2 ? [inn2] : [])];
  for (const inn of innings) {
    catches += inn.balls.filter(
      (b) => b.fielderPlayerId === playerId && b.wicketType === 'CAUGHT',
    ).length;
  }
  return catches;
}

function disciplinaryEconomy(bowler: BowlerInningsData): number {
  const overs = bowler.completedOvers + bowler.balls / 6;
  if (overs === 0) return 0;
  return Math.round((bowler.runs / overs) * 100) / 100;
}

function formatBowlingOvers(bowler: BowlerInningsData): string {
  return `${bowler.completedOvers}.${bowler.balls} ov`;
}

function formatBowlingFigures(bowler: BowlerInningsData): string {
  return `${bowler.wickets}/${bowler.runs}`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
