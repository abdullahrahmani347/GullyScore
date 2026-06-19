/**
 * GullyScore Achievement System
 *
 * Auto-computed achievement badges triggered by Ball data.
 * Zero admin, zero coach — the app detects achievements from existing data.
 *
 * Each badge has a trigger condition checked after every ball / innings / match.
 */

import type {
  InningsState,
  MatchData,
  BatsmanInningsData,
  BowlerInningsData,
  BallRecord,
  Tournament,
} from '@/types';

// ─────────────────────────────────────────────────────
// BADGE DEFINITIONS
// ─────────────────────────────────────────────────────

export interface AchievementBadge {
  id: string;
  name: string;
  emoji: string;
  description: string;
  category: 'batting' | 'bowling' | 'all-round' | 'team' | 'tournament';
  color: string;     // Tailwind color class for the chip
  bgColor: string;   // Tailwind bg class
}

export const BADGES: Record<string, AchievementBadge> = {
  CENTURY: {
    id: 'CENTURY',
    name: 'Century Club',
    emoji: '\uD83D\uDD25',
    description: '100+ runs in a single innings',
    category: 'batting',
    color: 'text-amber-300',
    bgColor: 'bg-amber-500/15',
  },
  HALF_CENTURY: {
    id: 'HALF_CENTURY',
    name: 'Half-Century',
    emoji: '\u2B50',
    description: '50+ runs in a single innings',
    category: 'batting',
    color: 'text-blue-300',
    bgColor: 'bg-blue-500/15',
  },
  SIX_MACHINE: {
    id: 'SIX_MACHINE',
    name: 'Six Machine',
    emoji: '\uD83D\uDCA5',
    description: '3+ sixes in a single innings',
    category: 'batting',
    color: 'text-orange-300',
    bgColor: 'bg-orange-500/15',
  },
  ECONOMY_KING: {
    id: 'ECONOMY_KING',
    name: 'Economy King',
    emoji: '\uD83C\uDFAF',
    description: '< 5.0 RPO over a full match (min 2 overs)',
    category: 'bowling',
    color: 'text-green-300',
    bgColor: 'bg-green-500/15',
  },
  FIVE_FOR: {
    id: 'FIVE_FOR',
    name: 'Five-For',
    emoji: '\uD83C\uDFC6',
    description: '5+ wickets in a single innings',
    category: 'bowling',
    color: 'text-purple-300',
    bgColor: 'bg-purple-500/15',
  },
  HAT_TRICK: {
    id: 'HAT_TRICK',
    name: 'Hat Trick Hero',
    emoji: '\uD83C\uDFA9',
    description: '3 wickets in 3 consecutive legal balls',
    category: 'bowling',
    color: 'text-red-300',
    bgColor: 'bg-red-500/15',
  },
  CAPTAINS_KNOCK: {
    id: 'CAPTAINS_KNOCK',
    name: "Captain's Knock",
    emoji: '\uD83E\uDD81',
    description: 'Top scorer in a losing team\'s innings',
    category: 'batting',
    color: 'text-yellow-300',
    bgColor: 'bg-yellow-500/15',
  },
  FINISHER: {
    id: 'FINISHER',
    name: 'Finisher',
    emoji: '\u26A1',
    description: 'Won a match in the final over chasing',
    category: 'all-round',
    color: 'text-cyan-300',
    bgColor: 'bg-cyan-500/15',
  },
  TOURNAMENT_WINNER: {
    id: 'TOURNAMENT_WINNER',
    name: 'Tournament Winner',
    emoji: '\uD83E\uDD47',
    description: 'Won a tournament',
    category: 'team',
    color: 'text-gold',
    bgColor: 'bg-gold/15',
  },
  MAN_OF_SERIES: {
    id: 'MAN_OF_SERIES',
    name: 'Man of the Series',
    emoji: '\uD83D\uDC51',
    description: 'Most matches as Player of the Match in a tournament',
    category: 'tournament',
    color: 'text-gold',
    bgColor: 'bg-gold/15',
  },
};

// ─────────────────────────────────────────────────────
// ACHIEVEMENT DETECTION
// ─────────────────────────────────────────────────────

export interface EarnedAchievement {
  badgeId: string;
  playerId: string;
  playerName: string;
  matchId?: string;
  timestamp: number;
}

/**
 * Detect new achievements earned in the current innings.
 * Called after each ball to check if a new badge was just earned.
 */
export function detectInningsAchievements(
  innings: InningsState,
  previousBatsmanRuns: Record<string, number>,
  previousBowlerWickets: Record<string, number>,
  previousBatsmanSixes?: Record<string, number>,
): EarnedAchievement[] {
  const earned: EarnedAchievement[] = [];

  for (const bat of innings.batting) {
    const prevRuns = previousBatsmanRuns[bat.playerId] ?? 0;
    const prevSixes = previousBatsmanSixes?.[bat.playerId] ?? 0;

    // Century Club: 100+ runs (just crossed)
    if (bat.runs >= 100 && prevRuns < 100) {
      earned.push({
        badgeId: 'CENTURY',
        playerId: bat.playerId,
        playerName: bat.player.name,
        timestamp: Date.now(),
      });
    }

    // Half-Century: 50+ runs (just crossed)
    if (bat.runs >= 50 && prevRuns < 50) {
      earned.push({
        badgeId: 'HALF_CENTURY',
        playerId: bat.playerId,
        playerName: bat.player.name,
        timestamp: Date.now(),
      });
    }

    // Six Machine: 3+ sixes (just crossed threshold) — uses >= 3 && prev < 3
    // so it fires even if sixes jump from 2 to 4+
    if (bat.sixes >= 3 && prevSixes < 3) {
      earned.push({
        badgeId: 'SIX_MACHINE',
        playerId: bat.playerId,
        playerName: bat.player.name,
        timestamp: Date.now(),
      });
    }
  }

  // Bowler achievements
  for (const bowl of innings.bowling) {
    const prevWickets = previousBowlerWickets[bowl.playerId] ?? 0;

    // Five-For: 5+ wickets (just crossed)
    if (bowl.wickets >= 5 && prevWickets < 5) {
      earned.push({
        badgeId: 'FIVE_FOR',
        playerId: bowl.playerId,
        playerName: bowl.player.name,
        timestamp: Date.now(),
      });
    }
  }

  // Hat Trick detection — check ball records for 3 consecutive wicket balls by same bowler
  const hatTrickPlayer = detectHatTrick(innings.balls);
  if (hatTrickPlayer) {
    const bowler = innings.bowling.find((b) => b.playerId === hatTrickPlayer);
    if (bowler) {
      earned.push({
        badgeId: 'HAT_TRICK',
        playerId: hatTrickPlayer,
        playerName: bowler.player.name,
        timestamp: Date.now(),
      });
    }
  }

  return earned;
}

/**
 * Detect match-level achievements (called when a match completes).
 */
export function detectMatchAchievements(match: MatchData): EarnedAchievement[] {
  const earned: EarnedAchievement[] = [];
  const inn1 = match.innings?.[0];
  const inn2 = match.innings?.[1];
  if (!inn1) return earned;

  // Captain's Knock: top scorer in a losing team
  if (inn2 && match.winnerId && match.status === 'COMPLETED') {
    const losingInnings = match.winnerId === inn1.teamId ? inn2 : inn1;
    const topScorer = [...losingInnings.batting].sort((a, b) => b.runs - a.runs)[0];
    if (topScorer && topScorer.runs >= 20) {
      earned.push({
        badgeId: 'CAPTAINS_KNOCK',
        playerId: topScorer.playerId,
        playerName: topScorer.player.name,
        matchId: match.id,
        timestamp: Date.now(),
      });
    }

    // Finisher: won in the final over chasing
    if (inn2.runs >= (inn2.target ?? 0) && match.winnerId === inn2.teamId) {
      const ballsUsed = inn1.runs > 0 ? inn2.completedOvers * 6 + inn2.currentBalls : 0;
      const totalBalls = match.totalOvers * 6;
      const ballsRemaining = totalBalls - ballsUsed;
      if (ballsRemaining >= 0 && ballsRemaining <= 6) {
        // Won in final over
        const topScorer = [...inn2.batting].sort((a, b) => b.runs - a.runs)[0];
        if (topScorer) {
          earned.push({
            badgeId: 'FINISHER',
            playerId: topScorer.playerId,
            playerName: topScorer.player.name,
            matchId: match.id,
            timestamp: Date.now(),
          });
        }
      }
    }

    // Economy King: < 5.0 RPO over the full match (min 2 overs = 12 balls)
    const allBowling = [...inn1.bowling, ...inn2.bowling];
    for (const bowl of allBowling) {
      const totalBalls = bowl.completedOvers * 6 + bowl.balls;
      if (totalBalls >= 12) {
        const overs = totalBalls / 6;
        const economy = bowl.runs / overs;
        if (economy < 5.0 && bowl.wickets >= 1) {
          earned.push({
            badgeId: 'ECONOMY_KING',
            playerId: bowl.playerId,
            playerName: bowl.player.name,
            matchId: match.id,
            timestamp: Date.now(),
          });
        }
      }
    }
  }

  return earned;
}

/**
 * Detect tournament-level achievements (called when a tournament completes).
 * - Tournament Winner: awarded to all players of the winning team
 * - Man of the Series: player with the highest total runs across all matches
 */
export function detectTournamentAchievements(tournament: Tournament): EarnedAchievement[] {
  const earned: EarnedAchievement[] = [];

  if (tournament.status !== 'COMPLETED') return earned;

  // ── Tournament Winner ──
  // The team with the most points wins. In case of a tie on points,
  // Net Run Rate (NRR) breaks the tie (already sorted in the points table).
  const sortedTeams = [...tournament.teams].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.nrr - a.nrr; // NRR tiebreaker
  });

  if (sortedTeams.length > 0 && sortedTeams[0].points > 0) {
    const winnerTeam = sortedTeams[0];
    // Award the badge to the team's top contributor (captain/leading player)
    // Since we don't track "team as a whole" badges per-player easily,
    // we award it to the player with the most runs in the winning team's matches
    const winnerMatches = tournament.matches.filter(
      (m) => m.status === 'COMPLETED' && m.winnerId === winnerTeam.teamId
    );

    if (winnerMatches.length > 0) {
      // Find the top run-scorer for the winning team across all their matches
      const playerRuns: Record<string, { name: string; runs: number }> = {};
      for (const match of winnerMatches) {
        for (const inn of match.innings) {
          if (inn.teamId === winnerTeam.teamId) {
            for (const bat of inn.batting) {
              if (!playerRuns[bat.playerId] || bat.runs > playerRuns[bat.playerId].runs) {
                playerRuns[bat.playerId] = { name: bat.player.name, runs: bat.runs };
              }
            }
          }
        }
      }

      // Award to the top run-scorer (representing the team)
      const topPlayer = Object.entries(playerRuns).sort((a, b) => b[1].runs - a[1].runs)[0];
      if (topPlayer) {
        earned.push({
          badgeId: 'TOURNAMENT_WINNER',
          playerId: topPlayer[0],
          playerName: topPlayer[1].name,
          matchId: tournament.id,
          timestamp: Date.now(),
        });
      }
    }
  }

  // ── Man of the Series ──
  // Player with the highest aggregate runs across ALL tournament matches
  const seriesPlayerStats: Record<string, { name: string; runs: number; wickets: number; matches: Set<string> }> = {};

  for (const match of tournament.matches) {
    if (match.status !== 'COMPLETED') continue;
    for (const inn of match.innings) {
      for (const bat of inn.batting) {
        if (!seriesPlayerStats[bat.playerId]) {
          seriesPlayerStats[bat.playerId] = { name: bat.player.name, runs: 0, wickets: 0, matches: new Set() };
        }
        seriesPlayerStats[bat.playerId].runs += bat.runs;
        seriesPlayerStats[bat.playerId].matches.add(match.id);
      }
      for (const bowl of inn.bowling) {
        if (!seriesPlayerStats[bowl.playerId]) {
          seriesPlayerStats[bowl.playerId] = { name: bowl.player.name, runs: 0, wickets: 0, matches: new Set() };
        }
        seriesPlayerStats[bowl.playerId].wickets += bowl.wickets;
        seriesPlayerStats[bowl.playerId].matches.add(match.id);
      }
    }
  }

  // Score = runs + (wickets * 25) — all-round contribution weighted
  const seriesEntries = Object.entries(seriesPlayerStats)
    .map(([playerId, stats]) => ({
      playerId,
      playerName: stats.name,
      score: stats.runs + stats.wickets * 25,
      matchesPlayed: stats.matches.size,
    }))
    .filter((p) => p.matchesPlayed >= 2) // Must have played at least 2 matches
    .sort((a, b) => b.score - a.score);

  if (seriesEntries.length > 0) {
    const motm = seriesEntries[0];
    // Don't duplicate if same player already got Tournament Winner
    const alreadyHasWinner = earned.some((a) => a.badgeId === 'TOURNAMENT_WINNER' && a.playerId === motm.playerId);
    if (!alreadyHasWinner || seriesEntries.length > 1) {
      earned.push({
        badgeId: 'MAN_OF_SERIES',
        playerId: motm.playerId,
        playerName: motm.playerName,
        matchId: tournament.id,
        timestamp: Date.now(),
      });
    }
  }

  return earned;
}

/**
 * Detect a hat trick in the ball records.
 * 3 wickets in 3 consecutive legal deliveries by the same bowler.
 */
function detectHatTrick(balls: BallRecord[]): string | null {
  const legalDeliveries = balls
    .filter((b) => b.isLegalDelivery)
    .sort((a, b) => a.deliveryNumber - b.deliveryNumber);

  for (let i = 2; i < legalDeliveries.length; i++) {
    const b1 = legalDeliveries[i - 2];
    const b2 = legalDeliveries[i - 1];
    const b3 = legalDeliveries[i];

    if (
      b1.isWicket && b2.isWicket && b3.isWicket &&
      b1.bowlerId === b2.bowlerId && b2.bowlerId === b3.bowlerId
    ) {
      return b1.bowlerId;
    }
  }

  return null;
}

/**
 * Get all achievements a player has earned across all innings of a match.
 * Used for displaying badges on player profiles.
 */
export function getPlayerAchievements(
  playerId: string,
  match: MatchData,
): EarnedAchievement[] {
  const allAchievements: EarnedAchievement[] = [];

  for (const inn of match.innings) {
    // Batting achievements
    const bat = inn.batting.find((b) => b.playerId === playerId);
    if (bat) {
      if (bat.runs >= 100) {
        allAchievements.push({
          badgeId: 'CENTURY',
          playerId,
          playerName: bat.player.name,
          matchId: match.id,
          timestamp: Date.now(),
        });
      }
      if (bat.runs >= 50) {
        allAchievements.push({
          badgeId: 'HALF_CENTURY',
          playerId,
          playerName: bat.player.name,
          matchId: match.id,
          timestamp: Date.now(),
        });
      }
      if (bat.sixes >= 3) {
        allAchievements.push({
          badgeId: 'SIX_MACHINE',
          playerId,
          playerName: bat.player.name,
          matchId: match.id,
          timestamp: Date.now(),
        });
      }
    }

    // Bowling achievements
    const bowl = inn.bowling.find((b) => b.playerId === playerId);
    if (bowl) {
      if (bowl.wickets >= 5) {
        allAchievements.push({
          badgeId: 'FIVE_FOR',
          playerId,
          playerName: bowl.player.name,
          matchId: match.id,
          timestamp: Date.now(),
        });
      }

      // Economy King
      const totalBalls = bowl.completedOvers * 6 + bowl.balls;
      if (totalBalls >= 12) {
        const economy = bowl.runs / (totalBalls / 6);
        if (economy < 5.0 && bowl.wickets >= 1) {
          allAchievements.push({
            badgeId: 'ECONOMY_KING',
            playerId,
            playerName: bowl.player.name,
            matchId: match.id,
            timestamp: Date.now(),
          });
        }
      }
    }
  }

  // Hat trick check
  for (const inn of match.innings) {
    const hatTrickBowler = detectHatTrick(inn.balls);
    if (hatTrickBowler === playerId) {
      const bowler = inn.bowling.find((b) => b.playerId === playerId);
      allAchievements.push({
        badgeId: 'HAT_TRICK',
        playerId,
        playerName: bowler?.player.name ?? 'Player',
        matchId: match.id,
        timestamp: Date.now(),
      });
    }
  }

  // Deduplicate by badgeId
  const seen = new Set<string>();
  return allAchievements.filter((a) => {
    const key = a.badgeId;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
