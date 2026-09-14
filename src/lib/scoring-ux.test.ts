/**
 * GULLYSCORE v2 §14 — Scoring UX pure-logic tests (§23.1 DoD).
 * Covers every export of lib/scoring-ux.ts:
 *   rankBowlerSuggestions · nextBatterSuggestion · detectHatTrick ·
 *   detectFiveFor · overRateFromBalls · undoableBallCount ·
 *   liveBallsInOver · contrastRatio · teamTint · parseVoiceCommand
 */

import { describe, test, expect } from 'bun:test';
import {
  rankBowlerSuggestions,
  nextBatterSuggestion,
  detectHatTrick,
  detectFiveFor,
  overRateFromBalls,
  undoableBallCount,
  liveBallsInOver,
  contrastRatio,
  teamTint,
  parseVoiceCommand,
} from './scoring-ux';
import type { BallRecord, BowlerInningsData, InningsState, Player } from '@/types';

/* ─── fixtures ─────────────────────────────────────────────────────────── */

const P = (id: string, name = id): Player => ({
  id,
  name,
  teamId: 't1',
  battingHand: 'R',
});

let seq = 0;
const B = (over: number, partial: Partial<BallRecord> = {}): BallRecord => ({
  id: `b${++seq}`,
  inningsId: 'inn1',
  overNumber: over,
  ballInOver: 0,
  deliveryNumber: seq,
  batsmanId: 'bat1',
  bowlerId: 'bw1',
  runs: 0,
  isWicket: false,
  extraType: null,
  extraRuns: 0,
  isLegalDelivery: true,
  strikerIdBefore: 'bat1',
  nonStrikerIdBefore: 'bat2',
  timestamp: null,
  ...partial,
});

const WICKET_BALL = (over: number, bowlerId: string, type: BallRecord['wicketType'] = 'BOWLED'): BallRecord =>
  B(over, { isWicket: true, wicketType: type, bowlerId, dismissedPlayerId: 'bat1' });

/* ─── §14.4 rankBowlerSuggestions ──────────────────────────────────────── */

describe('§14.4 rankBowlerSuggestions', () => {
  const players = [P('a'), P('b'), P('c'), P('d')];

  test('excludes the bowler of the over just completed', () => {
    const out = rankBowlerSuggestions(players, {
      balls: [B(0, { bowlerId: 'b' })],
      bowling: [],
      currentBowlerId: 'b',
    });
    expect(out.map((s) => s.playerId)).not.toContain('b');
    expect(out).toHaveLength(3);
  });

  test('never-bowled bowlers rank first (least recently bowled)', () => {
    const out = rankBowlerSuggestions(players, {
      balls: [
        B(0, { bowlerId: 'a', timestamp: '2026-01-01T10:00:00Z' }),
        B(0, { bowlerId: 'a', timestamp: '2026-01-01T10:00:30Z' }),
        B(1, { bowlerId: 'c', timestamp: '2026-01-01T10:01:00Z' }),
      ],
      bowling: [],
      currentBowlerId: 'c',
    });
    // b and d never bowled → first (stable input order), then a (older), c excluded
    expect(out[0].playerId).toBe('b');
    expect(out[1].playerId).toBe('d');
    expect(out[2].playerId).toBe('a');
    expect(out[0].reason).toBe('rested');
  });

  test('fewest overs breaks the tie between two never-bowled? no — LRU tiebreak', () => {
    // a bowled at t=10:00, b at t=10:01 → a (older) ranks before b
    const out = rankBowlerSuggestions([P('a'), P('b')], {
      balls: [
        B(0, { bowlerId: 'a', timestamp: '2026-01-01T10:00:00Z' }),
        B(0, { bowlerId: 'b', timestamp: '2026-01-01T10:01:00Z' }),
      ],
      bowling: [],
      currentBowlerId: null,
    });
    expect(out[0].playerId).toBe('a');
    expect(out[0].lastBowledAt).toBe(Date.parse('2026-01-01T10:00:00Z'));
  });

  test('overs come from bowling rows (completedOvers + in-progress half)', () => {
    const out = rankBowlerSuggestions([P('a'), P('b')], {
      balls: [],
      bowling: [
        { playerId: 'a', completedOvers: 2, balls: 0 },
        { playerId: 'b', completedOvers: 0, balls: 3 },
      ] as BowlerInningsData[],
      currentBowlerId: null,
    });
    // both never-bowled (no stamped balls) → tiebreak on overs: b (0.5) < a (2)
    expect(out[0].playerId).toBe('b');
    expect(out[0].overs).toBe(0.5);
  });

  test('deleted balls do not count as recent bowling', () => {
    const out = rankBowlerSuggestions([P('a'), P('b')], {
      balls: [B(0, { bowlerId: 'a', timestamp: '2026-01-01T10:00:00Z', deletedAt: '2026-01-01T10:05:00Z' })],
      bowling: [],
      currentBowlerId: null,
    });
    expect(out[0].lastBowledAt).toBeNull(); // a's only ball was deleted
  });

  test('single eligible bowler gets the only-option reason', () => {
    const out = rankBowlerSuggestions([P('a'), P('b')], { balls: [], bowling: [], currentBowlerId: 'a' });
    expect(out).toHaveLength(1);
    expect(out[0].reason).toBe('only-option');
    expect(out[0].playerId).toBe('b');
  });
});

/* ─── §14.4 nextBatterSuggestion ───────────────────────────────────────── */

describe('§14.4 nextBatterSuggestion', () => {
  const team = { players: [P('p1'), P('p2'), P('p3'), P('p4'), P('p5')] };
  const batting = (rows: { playerId: string; isOut: boolean }[]) => rows;
  const inn = (rows: { playerId: string; isOut: boolean }[]) =>
    ({ team, batting: batting(rows) }) as unknown as Pick<InningsState, 'batting' | 'team'>;

  test('defaults to the next XI slot after the active pair', () => {
    // p1 out, p2 + p3 at the crease → p4 is next
    const id = nextBatterSuggestion(inn([{ playerId: 'p1', isOut: true }, { playerId: 'p2', isOut: false }]), 'p2', 'p3');
    expect(id).toBe('p4');
  });

  test('honours a wizard XI order over squad order', () => {
    const id = nextBatterSuggestion(
      inn([{ playerId: 'p1', isOut: true }, { playerId: 'p2', isOut: false }]),
      'p2',
      'p3',
      ['p5', 'p4', 'p1', 'p2', 'p3']
    );
    expect(id).toBe('p5');
  });

  test('skips dismissed and active batters in the XI order', () => {
    const id = nextBatterSuggestion(
      inn([{ playerId: 'p1', isOut: true }, { playerId: 'p2', isOut: false }]),
      'p2',
      'p3',
      ['p1', 'p2', 'p3', 'p4']
    );
    expect(id).toBe('p4'); // p1 out, p2/p3 active → p4
  });

  test('all out → null', () => {
    const id = nextBatterSuggestion(
      inn([P('p1'), P('p2'), P('p3'), P('p4'), P('p5')].map((p) => ({ playerId: p.id, isOut: true }))),
      null,
      null
    );
    expect(id).toBeNull();
  });

  test('XI entries that are not in the squad are ignored', () => {
    const id = nextBatterSuggestion(
      inn([{ playerId: 'p1', isOut: true }, { playerId: 'p2', isOut: false }]),
      'p2',
      'p3',
      ['ghost', 'p4']
    );
    expect(id).toBe('p4');
  });
});

/* ─── §14.6 detectHatTrick / detectFiveFor ─────────────────────────────── */

describe('§14.6 detectHatTrick', () => {
  test('three consecutive dismissals by one bowler', () => {
    const balls = [
      B(0, { runs: 1 }),
      WICKET_BALL(0, 'bw1'),
      WICKET_BALL(0, 'bw1'),
      WICKET_BALL(0, 'bw1'),
    ];
    expect(detectHatTrick(balls)).toBe('bw1');
  });

  test('mixed bowlers break the sequence', () => {
    const balls = [
      WICKET_BALL(0, 'bw1'),
      WICKET_BALL(0, 'bw1'),
      WICKET_BALL(0, 'bw2'),
    ];
    expect(detectHatTrick(balls)).toBeNull();
  });

  test('a non-dismissal between wickets breaks it', () => {
    const balls = [
      WICKET_BALL(0, 'bw1'),
      B(0, { runs: 1 }),
      WICKET_BALL(0, 'bw1'),
      WICKET_BALL(0, 'bw1'),
    ];
    expect(detectHatTrick(balls)).toBeNull();
  });

  test('does not fire when the sequence is not the LATEST three balls', () => {
    const balls = [
      WICKET_BALL(0, 'bw1'),
      WICKET_BALL(0, 'bw1'),
      WICKET_BALL(0, 'bw1'),
      B(0, { runs: 2 }), // the hat-trick already happened — old news
    ];
    expect(detectHatTrick(balls)).toBeNull();
  });

  test('deleted balls are skipped (an undone wicket cannot complete it)', () => {
    const balls = [
      WICKET_BALL(0, 'bw1'),
      WICKET_BALL(0, 'bw1'),
      { ...WICKET_BALL(0, 'bw1'), deletedAt: '2026-01-01T10:00:00Z' },
      WICKET_BALL(1, 'bw1'),
    ];
    // live tail: w, w, w (over boundary — still consecutive deliveries)
    expect(detectHatTrick(balls)).toBe('bw1');
  });

  test('retired hurt is not a dismissal for hat-trick credit', () => {
    const balls = [
      WICKET_BALL(0, 'bw1'),
      WICKET_BALL(0, 'bw1', 'RETIRED_HURT'),
      WICKET_BALL(0, 'bw1'),
    ];
    expect(detectHatTrick(balls)).toBeNull();
  });

  test('fewer than 3 balls → null', () => {
    expect(detectHatTrick([WICKET_BALL(0, 'bw1'), WICKET_BALL(0, 'bw1')])).toBeNull();
  });
});

describe('§14.6 detectFiveFor', () => {
  const bowling = (w: number): BowlerInningsData[] =>
    [{ playerId: 'bw1', wickets: w }] as unknown as BowlerInningsData[];

  test('fires when the last live dismissal crosses 5', () => {
    const balls = [B(0, { runs: 1 }), WICKET_BALL(0, 'bw1')];
    expect(detectFiveFor(balls, bowling(5))).toEqual({ playerId: 'bw1', wickets: 5 });
  });

  test('no fire when the last ball was not a dismissal', () => {
    const balls = [WICKET_BALL(0, 'bw1'), B(0, { runs: 1 })];
    expect(detectFiveFor(balls, bowling(5))).toBeNull();
  });

  test('no fire below 5 wickets', () => {
    const balls = [WICKET_BALL(0, 'bw1')];
    expect(detectFiveFor(balls, bowling(4))).toBeNull();
  });

  test('missing bowling row → null', () => {
    const balls = [WICKET_BALL(0, 'bw9')];
    expect(detectFiveFor(balls, bowling(5))).toBeNull();
  });
});

/* ─── §14.7 overRateFromBalls ──────────────────────────────────────────── */

describe('§14.7 overRateFromBalls', () => {
  const T0 = Date.parse('2026-01-01T10:00:00Z');

  const stamped = (intervalsSec: number[]): BallRecord[] => {
    let t = T0;
    return intervalsSec.map((d) => {
      t += d * 1000;
      return B(0, { timestamp: new Date(t).toISOString() });
    });
  };

  test('null stats with fewer than 2 stamped balls', () => {
    const s = overRateFromBalls([B(0), B(1)]);
    expect(s.avgIntervalSec).toBeNull();
    expect(s.oversPerHour).toBeNull();
    expect(s.slow).toBe(false);
    expect(s.sampled).toBe(0);
  });

  test('mean interval and overs/hour from a 60s-per-ball window', () => {
    const s = overRateFromBalls(stamped([60, 60, 60, 60, 60]));
    expect(s.avgIntervalSec).toBeCloseTo(60);
    // 5 stamped balls → 4 intervals ≈ 4 deliveries in 4 minutes → 10 overs/hour
    expect(s.oversPerHour).toBeCloseTo(10, 0);
    expect(s.slow).toBe(false);
  });

  test('slow flag when the average interval exceeds 90s', () => {
    const s = overRateFromBalls(stamped([120, 120, 120]));
    expect(s.avgIntervalSec).toBeCloseTo(120);
    expect(s.slow).toBe(true);
  });

  test('only the last 12 stamped balls form the window', () => {
    const s = overRateFromBalls(stamped([600, 600, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60]));
    // 14 balls: 2 slow + 12 fast — the window is the fast tail
    expect(s.sampled).toBe(12);
    expect(s.avgIntervalSec).toBeCloseTo(60);
    expect(s.slow).toBe(false);
  });

  test('balls with unparseable timestamps are ignored', () => {
    const s = overRateFromBalls([
      B(0, { timestamp: null }),
      B(0, { timestamp: 'not-a-date' }),
      ...stamped([0, 45]),
    ]);
    expect(s.sampled).toBe(2);
    expect(s.avgIntervalSec).toBeCloseTo(45);
  });
});

/* ─── §14.10 undoableBallCount / liveBallsInOver ───────────────────────── */

describe('§14.10 undo helpers', () => {
  test('undoableBallCount counts live balls only', () => {
    const balls = [B(0), B(0), { ...B(0), deletedAt: 'x' }, B(1)];
    expect(undoableBallCount(balls)).toBe(3);
  });

  test('liveBallsInOver filters by over and skips deleted', () => {
    const balls = [
      B(0),
      B(0),
      B(1),
      B(1),
      { ...B(1), deletedAt: 'x' },
      B(2),
    ];
    const inOver1 = liveBallsInOver(balls, 1);
    expect(inOver1).toHaveLength(2);
    expect(inOver1.every((b) => b.overNumber === 1 && b.deletedAt == null)).toBe(true);
  });

  test('liveBallsInOver on an empty over → empty (undo-to-over-start is a no-op)', () => {
    expect(liveBallsInOver([B(0), B(0)], 3)).toHaveLength(0);
  });
});

/* ─── §14.0 contrastRatio / teamTint ───────────────────────────────────── */

describe('§14.0 contrastRatio', () => {
  test('black vs white = 21', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 0);
  });

  test('identical colours = 1', () => {
    expect(contrastRatio([10, 20, 30], [10, 20, 30])).toBeCloseTo(1);
  });

  test('order-independent', () => {
    expect(contrastRatio([255, 0, 0], [0, 0, 255])).toBeCloseTo(contrastRatio([0, 0, 255], [255, 0, 0]));
  });
});

describe('§14.0 teamTint', () => {
  test('returns a valid rgb() string for a normal team colour (dark)', () => {
    const tint = teamTint('#3B82F6', 'dark');
    expect(tint).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
  });

  test('both themes produce a tint for a mid-saturation colour', () => {
    expect(teamTint('#00A651', 'dark')).toMatch(/^rgb\(/);
    expect(teamTint('#00A651', 'light')).toMatch(/^rgb\(/);
  });

  test('invalid hex degrades to transparent', () => {
    expect(teamTint('nope', 'dark')).toBe('transparent');
    expect(teamTint('', 'light')).toBe('transparent');
    expect(teamTint('#12', 'dark')).toBe('transparent');
  });

  test('3-digit hex (#F00) is accepted like #FF0000', () => {
    expect(teamTint('#F00', 'dark')).toBe(teamTint('#FF0000', 'dark'));
  });

  test('a pure-background colour cannot satisfy vs-bg contrast → transparent', () => {
    // dark bg #070710 — a near-black team colour is indistinguishable
    expect(teamTint('#070710', 'dark')).toBe('transparent');
  });
});

/* ─── §14.11 parseVoiceCommand ─────────────────────────────────────────── */

describe('§14.11 parseVoiceCommand', () => {
  const run = (s: string) => parseVoiceCommand(s);
  // Union-safe accessors (tsc can't narrow through expect(x?.y))
  const runsOf = (s: string) => {
    const ev = run(s);
    return ev != null && ev.kind === 'runs' ? ev.runs : null;
  };
  const extraOf = (s: string) => {
    const ev = run(s);
    return ev != null && ev.kind === 'extra' ? ev : null;
  };
  const wicketOf = (s: string) => {
    const ev = run(s);
    return ev != null && ev.kind === 'wicket' ? ev : null;
  };

  test('plain run words', () => {
    expect(run('four')).toEqual({ kind: 'runs', runs: 4, label: '4 runs' });
    expect(run('six')).toEqual({ kind: 'runs', runs: 6, label: '6 runs' });
    expect(run('one')).toEqual({ kind: 'runs', runs: 1, label: '1 run' });
    expect(run('two runs')).toEqual({ kind: 'runs', runs: 2, label: '2 runs' });
  });

  test('single / couple / boundary aliases', () => {
    expect(runsOf('single')).toBe(1);
    expect(runsOf('couple')).toBe(2);
    expect(runsOf('boundary')).toBe(4);
  });

  test('digits and dot-ball phrasing', () => {
    expect(runsOf('4')).toBe(4);
    expect(runsOf('0')).toBe(0);
    expect(run('dot ball')).toEqual({ kind: 'runs', runs: 0, label: 'Dot ball' });
    expect(runsOf('no run')).toBe(0);
    expect(runsOf('Dot ball!')).toBe(0); // trailing punctuation stripped
  });

  test('extras with counts', () => {
    expect(run('wide')).toEqual({ kind: 'extra', extraType: 'WIDE', extraRuns: 1, label: 'Wide' });
    expect(run('two wides')).toEqual({ kind: 'extra', extraType: 'WIDE', extraRuns: 2, label: 'Wide +2' });
    expect(run('three byes')).toEqual({ kind: 'extra', extraType: 'BYE', extraRuns: 3, label: 'Bye 3' });
    expect(extraOf('two leg byes')?.extraType).toBe('LEG_BYE');
    expect(extraOf('leg bye')?.extraRuns).toBe(1);
  });

  test('no-ball variants (extraRuns = runs off the bat; +1 penalty is engine-side)', () => {
    expect(run('no ball')).toEqual({ kind: 'extra', extraType: 'NO_BALL', extraRuns: 0, label: 'No ball' });
    expect(extraOf('no-ball')?.extraType).toBe('NO_BALL');
    expect(run('no ball and four')).toEqual({
      kind: 'extra',
      extraType: 'NO_BALL',
      extraRuns: 4,
      label: 'No ball +4',
    });
    // A plain voice "no ball" must total 1 run (0 off the bat + 1 penalty),
    // not 2 — the parser must NOT bake the penalty into extraRuns.
    expect(extraOf('no ball')?.extraRuns).toBe(0);
  });

  test('wicket phrases map to types', () => {
    expect(run('wicket')).toEqual({ kind: 'wicket', wicketType: 'CAUGHT', label: 'Wicket' });
    expect(run('wicket bowled')).toEqual({ kind: 'wicket', wicketType: 'BOWLED', label: 'Bowled' });
    expect(run('caught')).toEqual({ kind: 'wicket', wicketType: 'CAUGHT', label: 'Caught' });
    expect(run('run out')).toEqual({ kind: 'wicket', wicketType: 'RUN_OUT', label: 'Run Out' });
    expect(wicketOf('lbw')?.wicketType).toBe('LBW');
    expect(wicketOf('stumped')?.wicketType).toBe('STUMPED');
    expect(wicketOf('hit wicket')?.wicketType).toBe('HIT_WICKET');
    expect(run("that's out")?.kind).toBe('wicket');
  });

  test('undo phrases', () => {
    expect(run('undo')).toEqual({ kind: 'undo', label: 'Undo' });
    expect(run('undo that')?.kind).toBe('undo');
    expect(run('take it back')?.kind).toBe('undo');
    expect(run('cancel')?.kind).toBe('undo');
  });

  test('out-of-grammar phrases return null', () => {
    expect(run('hello there')).toBeNull();
    expect(run('')).toBeNull();
    expect(run('what a shot')).toBeNull();
  });

  test('case-insensitive', () => {
    expect(runsOf('FOUR')).toBe(4);
    expect(extraOf('Wide Ball')?.extraType).toBe('WIDE');
  });
});
