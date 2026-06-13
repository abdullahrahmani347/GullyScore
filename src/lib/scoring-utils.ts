export function decimalOvers(completedOvers: number, balls: number): number {
  return completedOvers + balls / 6;
}

export function calculateCRR(runs: number, completedOvers: number, balls: number): number {
  const ov = decimalOvers(completedOvers, balls);
  if (ov === 0) return 0;
  return Math.round((runs / ov) * 100) / 100;
}

export function calculateRRR(
  runsNeeded: number,
  totalOvers: number,
  completedOvers: number,
  balls: number
): number {
  const ballsTotal = totalOvers * 6;
  const ballsUsed = completedOvers * 6 + balls;
  const ballsLeft = ballsTotal - ballsUsed;
  if (ballsLeft <= 0) return runsNeeded > 0 ? 99.99 : 0;
  const oversLeft = ballsLeft / 6;
  return Math.round((runsNeeded / oversLeft) * 100) / 100;
}

export function formatOvers(completedOvers: number, balls: number): string {
  return `${completedOvers}.${balls}`;
}

export function formatBowlingFigures(completedOvers: number, balls: number, runs: number, wickets: number): string {
  return `${completedOvers}.${balls}-${runs}-${wickets}`;
}

export function formatStrikeRate(runs: number, balls: number): string {
  if (balls === 0) return '0.00';
  return ((runs / balls) * 100).toFixed(1);
}

export function formatEconomy(runs: number, completedOvers: number, balls: number): string {
  const ov = decimalOvers(completedOvers, balls);
  if (ov === 0) return '0.00';
  return (runs / ov).toFixed(2);
}

export function formatBattingAverage(runs: number, dismissals: number): string {
  if (dismissals === 0) return runs > 0 ? '∞' : '0.00';
  return (runs / dismissals).toFixed(2);
}

export function calculateNRR(
  runsScored: number,
  oversFaced: number,
  runsConceded: number,
  oversBowled: number
): number {
  const rpo_scored = oversFaced > 0 ? runsScored / oversFaced : 0;
  const rpo_conceded = oversBowled > 0 ? runsConceded / oversBowled : 0;
  return Math.round((rpo_scored - rpo_conceded) * 1000) / 1000;
}

export function generateResultString(
  battingFirstTeamName: string,
  chasingTeamName: string,
  inn1Runs: number,
  inn2Runs: number,
  inn2Wickets: number,
  inn2Completed: boolean,
  inn2Overs: number,
  inn2CurrentBalls: number,
  totalOvers: number,
  maxWickets: number
): string {
  if (inn2Runs >= inn1Runs + 1) {
    const wicketsRemaining = maxWickets - inn2Wickets;
    const ballsUsed = inn2Overs * 6 + inn2CurrentBalls;
    const ballsTotal = totalOvers * 6;
    const ballsRemaining = ballsTotal - ballsUsed;
    if (ballsRemaining > 0) {
      return `${chasingTeamName} won by ${wicketsRemaining} wicket${wicketsRemaining !== 1 ? 's' : ''} (${ballsRemaining} balls remaining)`;
    }
    return `${chasingTeamName} won by ${wicketsRemaining} wicket${wicketsRemaining !== 1 ? 's' : ''}`;
  }
  if (inn2Runs < inn1Runs + 1) {
    return `${battingFirstTeamName} won by ${inn1Runs - inn2Runs} run${inn1Runs - inn2Runs !== 1 ? 's' : ''}`;
  }
  return `Match tied — both teams scored ${inn1Runs}`;
}

export function getManOfMatch(batting: { player: { name: string }; runs: number; balls: number }[], bowling: { player: { name: string }; wickets: number; runs: number }[]): string {
  const topBowler = [...bowling].sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)[0];
  if (topBowler && topBowler.wickets >= 3) return topBowler.player.name;
  const topBatsman = [...batting].sort((a, b) => b.runs - a.runs)[0];
  return topBatsman?.player?.name ?? 'N/A';
}

export function generateRoundRobinSchedule(teamIds: string[]): [string, string][] {
  const n = teamIds.length;
  const teams = n % 2 === 0 ? [...teamIds] : [...teamIds, 'BYE'];
  const rounds: [string, string][] = [];
  const t = teams.length;
  const pivot = teams[0];
  const rotatable = teams.slice(1);
  for (let round = 0; round < t - 1; round++) {
    const current = [pivot, ...rotatable];
    for (let i = 0; i < t / 2; i++) {
      if (current[i] !== 'BYE' && current[t - 1 - i] !== 'BYE') {
        rounds.push([current[i], current[t - 1 - i]]);
      }
    }
    rotatable.unshift(rotatable.pop()!);
  }
  return rounds;
}
