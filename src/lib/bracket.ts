/**
 * v2 §17.1 — KNOCKOUT BRACKET BUILDER
 * ---------------------------------------------------------------------------
 * Builds a QF/SF/F bracket for KNOCKOUT and HYBRID tournaments:
 *   - Auto-seeded from the standings (ranked 1..N) when knockout matches
 *     don't exist yet. Standard seed pairing: seed i plays seed B+1-i in a
 *     bracket of size B (next power of two ≥ N).
 *   - Byes: seeds ranked above (B − N) draw a bye and auto-advance.
 *   - Existing Match rows (round QF/SF/F, bracketSlot) override the
 *     auto-seeding so organizer-made fixtures win.
 *   - Champion = winner of the Final once completed.
 */

export const ROUND_ORDER = ['QF', 'SF', 'F'] as const;
export type BracketRound = (typeof ROUND_ORDER)[number];

export interface BracketTeam {
  id: string;
  name: string;
  shortName: string;
  color: string;
  emoji: string;
}

export interface BracketMatch {
  /** DB match id when a real fixture exists (null for not-yet-created nodes) */
  id: string | null;
  round: BracketRound;
  /** slot index within the round (0-based, feeds the pairing below) */
  slot: number;
  team1: BracketTeam | null;
  team2: BracketTeam | null;
  /** "BYE" marker — team1 auto-advances */
  isBye: boolean;
  status: 'PENDING' | 'READY' | 'TOSS' | 'LIVE' | 'INNINGS_BREAK' | 'COMPLETED' | 'ABANDONED';
  winnerId: string | null;
  liveCode: string | null;
  /** advance source description for the UI when teams aren't decided yet */
  feed?: string;
}

export interface BracketRoundNode {
  name: string;
  matches: BracketMatch[];
}

export interface BracketData {
  rounds: BracketRoundNode[];
  champion: BracketTeam | null;
  /** true when auto-seeding produced fixtures that are not persisted yet */
  needsGeneration: boolean;
}

function nextPowerOfTwo(n: number): number {
  let b = 1;
  while (b < n) b *= 2;
  return b;
}

const ROUND_LABELS: Record<BracketRound, string> = {
  QF: 'Quarter-finals',
  SF: 'Semi-finals',
  F: 'Final',
};

/** How many first-round slots a bracket of size B produces per round name. */
function roundsForSize(bracketSize: number): BracketRound[] {
  // bracketSize 2 → [F]; 4 → [SF, F]; 8 → [QF, SF, F]; 16 → [QF, SF, F] (QF has 8 slots)
  if (bracketSize <= 2) return ['F'];
  if (bracketSize <= 4) return ['SF', 'F'];
  return ['QF', 'SF', 'F'];
}

function slotsForRound(bracketSize: number, round: BracketRound): number {
  const rounds = roundsForSize(bracketSize);
  const idx = rounds.indexOf(round);
  // first round has bracketSize/2 slots; each later round halves
  return bracketSize / Math.pow(2, idx + 1);
}

interface SeededTeam {
  seed: number;
  team: BracketTeam | null; // null = bye placeholder
}

/**
 * Standard single-elimination seed order for a bracket of size B:
 * [1, B, 4, B-3, 2, B-1, 3, B-2, ...] pairs (i, B+1-i).
 */
function seedPairings(bracketSize: number): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 1; i <= bracketSize / 2; i++) {
    pairs.push([i, bracketSize + 1 - i]);
  }
  return pairs;
}

export interface BracketInputMatch {
  id: string;
  round: string | null;
  bracketSlot: number | null;
  status: string;
  winnerId: string | null;
  liveCode: string | null;
  team1: BracketTeam | null;
  team2: BracketTeam | null;
}

/**
 * Build the bracket.
 *
 * @param rankedTeams teams in standings order (seed 1 first)
 * @param matches     the tournament's knockout-stage match rows
 */
/** Advance state carried between bracket rounds while building. */
interface SlotState {
  team1: BracketTeam | null;
  team2: BracketTeam | null;
  feed?: string;
  winnerId: string | null;
  isBye: boolean;
}

export function buildBracket(
  rankedTeams: BracketTeam[],
  matches: BracketInputMatch[],
): BracketData {
  const n = rankedTeams.length;
  const rounds: BracketRoundNode[] = [];
  let champion: BracketTeam | null = null;
  let needsGeneration = false;

  if (n < 2) {
    return { rounds, champion, needsGeneration };
  }

  const bracketSize = nextPowerOfTwo(n);
  const roundNames = roundsForSize(bracketSize);
  const byes = bracketSize - n;

  // First-round pairings: seed i vs seed B+1-i (seed > n ⇒ bye)
  const firstRoundPairs: SeededTeam[][] = seedPairings(bracketSize).map(([a, b]) => [
    { seed: a, team: rankedTeams[a - 1] ?? null },
    { seed: b, team: rankedTeams[b - 1] ?? null },
  ]);

  // Index real fixtures by round+slot
  const fixtureKey = (round: string, slot: number) => `${round}:${slot}`;
  const fixtures = new Map<string, BracketInputMatch>();
  for (const m of matches) {
    if (m.round && ROUND_ORDER.includes(m.round as BracketRound)) {
      fixtures.set(fixtureKey(m.round, m.bracketSlot ?? 0), m);
    }
  }

  // Advance map: for later rounds, winners propagate. We materialize round by
  // round; a slot's teams come from the previous round's winners (or its
  // auto-advanced bye teams / feed labels).
  // (SlotState interface is module-level now)
  let currentSlots: SlotState[] = [];

  // ── Round 1 ──
  const round1 = roundNames[0];
  const round1Slots: SlotState[] = firstRoundPairs.map(([a, b], slot) => {
    const fixture = fixtures.get(fixtureKey(round1, slot));
    const isBye = !fixture && (a.team === null || b.team === null);
    if (fixture) {
      return {
        team1: fixture.team1,
        team2: fixture.team2,
        winnerId: fixture.status === 'COMPLETED' ? fixture.winnerId : null,
        isBye: false,
      };
    }
    if (isBye) {
      const adv = a.team ?? b.team!;
      return { team1: a.team, team2: b.team, isBye: true, winnerId: adv.id };
    }
    return { team1: a.team, team2: b.team, isBye: false, winnerId: null };
  });

  const pushRound = (round: BracketRound, slots: SlotState[]) => {
    rounds.push({
      name: ROUND_LABELS[round],
      matches: slots.map((s, slot) => {
        const fixture = fixtures.get(fixtureKey(round, slot));
        const status = fixture
          ? (['TOSS', 'LIVE', 'INNINGS_BREAK', 'COMPLETED', 'ABANDONED'].includes(fixture.status)
              ? (fixture.status as BracketMatch['status'])
              : 'READY')
          : s.isBye
            ? 'COMPLETED'
            : s.team1 && s.team2
              ? 'READY'
              : 'PENDING';
        return {
          id: fixture?.id ?? null,
          round,
          slot,
          team1: fixture?.team1 ?? s.team1,
          team2: fixture?.team2 ?? s.team2,
          isBye: s.isBye && !fixture,
          status: fixture?.status === 'COMPLETED' || s.isBye ? (fixture?.winnerId || s.winnerId ? 'COMPLETED' : status) : status,
          winnerId: fixture?.status === 'COMPLETED' ? fixture.winnerId : s.winnerId,
          liveCode: fixture?.liveCode ?? null,
          feed:
            fixture || (s.team1 && s.team2)
              ? undefined
              : `Winner ${ROUND_LABELS[round].toLowerCase().replace(/s$/, '')} of previous round`,
        };
      }),
    });
  };

  pushRound(round1, round1Slots);
  currentSlots = round1Slots;

  // ── Later rounds: pair slots 0&1, 2&3, ... ──
  for (let r = 1; r < roundNames.length; r++) {
    const round = roundNames[r];
    const nextSlots: SlotState[] = [];
    for (let i = 0; i < currentSlots.length; i += 2) {
      const a = currentSlots[i];
      const b = currentSlots[i + 1];
      const advA = a.winnerId ? resolveWinner(a, rankedTeams) : null;
      const advB = b.winnerId ? resolveWinner(b, rankedTeams) : null;
      nextSlots.push({
        team1: advA,
        team2: advB,
        winnerId: null,
        isBye: false,
        feed: !advA || !advB ? 'To be decided' : undefined,
      });
    }
    pushRound(round, nextSlots);
    currentSlots = nextSlots;
  }

  // ── Champion: final completed ──
  const finalRound = rounds[rounds.length - 1];
  const finalMatch = finalRound?.matches[0];
  if (finalMatch && finalMatch.status === 'COMPLETED' && finalMatch.winnerId) {
    champion =
      rankedTeams.find((t) => t.id === finalMatch.winnerId) ??
      [finalMatch.team1, finalMatch.team2].find((t) => t?.id === finalMatch.winnerId) ??
      null;
  }

  // needsGeneration: any READY/PENDING first-round node without a persisted fixture
  needsGeneration = rounds[0].matches.some((m) => m.id === null && !m.isBye);

  return { rounds, champion, needsGeneration };
}

/** Resolve the advancing team of a slot (winner or bye-advantage team). */
function resolveWinner(slot: SlotState, rankedTeams: BracketTeam[]): BracketTeam | null {
  if (!slot.winnerId) return null;
  const direct = [slot.team1, slot.team2].find((t) => t?.id === slot.winnerId);
  if (direct) return direct;
  // bye slot — winner is the seeded team that advanced
  return rankedTeams.find((t) => t.id === slot.winnerId) ?? null;
}

/** Map DB matches into BracketInputMatch (teams resolved client-side shape). */
export function matchesToBracketInput(
  rows: Array<{
    id: string;
    round: string | null;
    bracketSlot: number | null;
    status: string;
    winnerId: string | null;
    liveCode: string | null;
    team1: BracketTeam | null;
    team2: BracketTeam | null;
  }>,
): BracketInputMatch[] {
  return rows;
}
