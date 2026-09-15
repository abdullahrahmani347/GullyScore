import { describe, test, expect } from 'bun:test';
import {
  rankStandings,
  drawLots,
  formatOvers,
  nrrWorkedExample,
  type StandingsRow,
  type MinimalMatch,
} from '../standings';
import { buildBracket, type BracketTeam, type BracketInputMatch } from '../bracket';

// ── §17.3 standings helpers ──────────────────────────────────────────────

function row(id: string, over: Partial<StandingsRow>): StandingsRow {
  return {
    teamId: id,
    team: { id, name: `Team ${id}`, shortName: id, color: '#000', emoji: '🏏' },
    played: 0, won: 0, lost: 0, tied: 0, points: 0, nrr: 0,
    runsScored: 0, runsConceded: 0, oversFaced: 0, oversBowled: 0,
    ...over,
  };
}

describe('v2 §17.3 — standings tiebreaker chain', () => {
  test('sorts by points first', () => {
    const rows = [row('A', { points: 4 }), row('B', { points: 9 })];
    const ranked = rankStandings(rows, []);
    expect(ranked[0].teamId).toBe('B');
    expect(ranked[1].teamId).toBe('A');
  });

  test('NRR breaks points ties', () => {
    const rows = [row('A', { points: 9, nrr: 0.1 }), row('B', { points: 9, nrr: 1.5 })];
    expect(rankStandings(rows, [])[0].teamId).toBe('B');
  });

  test('head-to-head breaks NRR ties (§17.3 chain order)', () => {
    // A and B tied on points + NRR; A beat B head-to-head despite equal wins here
    const matches: MinimalMatch[] = [
      { id: 'm1', team1Id: 'A', team2Id: 'B', status: 'COMPLETED', winnerId: 'A' },
      { id: 'm2', team1Id: 'A', team2Id: 'C', status: 'COMPLETED', winnerId: 'C' },
      { id: 'm3', team1Id: 'B', team2Id: 'C', status: 'COMPLETED', winnerId: 'B' },
    ];
    const rows = [row('A', { points: 9, nrr: 0.5, won: 1 }), row('B', { points: 9, nrr: 0.5, won: 1 })];
    expect(rankStandings(rows, matches)[0].teamId).toBe('A');
  });

  test('most wins breaks head-to-head-neutral ties', () => {
    const rows = [row('A', { points: 9, nrr: 0.5, won: 1 }), row('B', { points: 9, nrr: 0.5, won: 3 })];
    expect(rankStandings(rows, [])[0].teamId).toBe('B');
  });

  test('full tie is flagged needsLots, and lotsOrder resolves it', () => {
    const rows = [row('A', { points: 9, nrr: 0.5, won: 2 }), row('B', { points: 9, nrr: 0.5, won: 2 })];
    const flagged = rankStandings(rows, []);
    expect(flagged.every((r) => r.needsLots)).toBe(true);
    const withLots = rankStandings(rows, [], ['B', 'A']);
    expect(withLots[0].teamId).toBe('B');
    expect(withLots.every((r) => !r.needsLots)).toBe(true);
  });

  test('drawLots returns a permutation', () => {
    const input = ['A', 'B', 'C', 'D'];
    const out = drawLots(input);
    expect(out).toHaveLength(4);
    expect([...out].sort()).toEqual([...input].sort());
  });

  test('formatOvers + worked example (§17.3 NRR transparency)', () => {
    expect(formatOvers(9.4)).toBe('9.4');
    const lines = nrrWorkedExample({ runsScored: 500, oversFaced: 50, runsConceded: 450, oversBowled: 50 });
    expect(lines[2]).toContain('+1.000');
  });
});

// ── §17.1 bracket builder ────────────────────────────────────────────────

function team(id: string): BracketTeam {
  return { id, name: `Team ${id}`, shortName: id, color: '#000', emoji: '🏏' };
}

function fixture(id: string, round: string, slot: number, overrides: Partial<BracketInputMatch> = {}): BracketInputMatch {
  return {
    id, round, bracketSlot: slot, status: 'UPCOMING', winnerId: null, liveCode: null,
    team1: null, team2: null, ...overrides,
  };
}

describe('v2 §17.1 — knockout bracket builder', () => {
  test('4 teams → SF + F, no byes, standard 1v4/2v3 seeding', () => {
    const b = buildBracket([team('A'), team('B'), team('C'), team('D')], []);
    expect(b.rounds.map((r) => r.name)).toEqual(['Semi-finals', 'Final']);
    expect(b.rounds[0].matches).toHaveLength(2);
    expect(b.rounds[0].matches[0].team1?.id).toBe('A');
    expect(b.rounds[0].matches[0].team2?.id).toBe('D');
    expect(b.rounds[0].matches[1].team1?.id).toBe('B');
    expect(b.rounds[0].matches[1].team2?.id).toBe('C');
    expect(b.needsGeneration).toBe(true);
  });

  test('byes auto-advance: 3 teams → seed 1 sits out round 1', () => {
    const b = buildBracket([team('A'), team('B'), team('C')], []);
    const sf = b.rounds[0].matches;
    expect(sf).toHaveLength(2);
    const byeMatch = sf.find((m) => m.isBye);
    expect(byeMatch).toBeDefined();
    expect(byeMatch!.winnerId).toBe('A'); // seed 1 auto-advances
    expect(byeMatch!.status).toBe('COMPLETED');
  });

  test('real fixtures override auto-seeding; completed final yields champion', () => {
    const matches: BracketInputMatch[] = [
      fixture('f1', 'SF', 0, { status: 'COMPLETED', winnerId: 'A', team1: team('A'), team2: team('D') }),
      fixture('f2', 'SF', 1, { status: 'COMPLETED', winnerId: 'C', team1: team('B'), team2: team('C') }),
      fixture('f3', 'F', 0, { status: 'COMPLETED', winnerId: 'A', team1: team('A'), team2: team('C') }),
    ];
    const b = buildBracket([team('A'), team('B'), team('C'), team('D')], matches);
    expect(b.needsGeneration).toBe(false);
    expect(b.champion?.id).toBe('A');
    expect(b.rounds[1].matches[0].winnerId).toBe('A');
  });

  test('pending feed shows when previous round is undecided', () => {
    const b = buildBracket([team('A'), team('B'), team('C'), team('D')], []);
    const finalMatch = b.rounds[1].matches[0];
    expect(finalMatch.team1).toBeNull();
    expect(finalMatch.feed).toBeDefined();
    expect(finalMatch.status).toBe('PENDING');
  });
});
