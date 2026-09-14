/**
 * GULLYSCORE v2 §14 — SCORING UX PURE LOGIC
 * ---------------------------------------------------------------------------
 * Pure helpers powering the Scoring UX v2 surfaces:
 *   §14.0  teamTint()               — batting-team tint, contrast-guarded
 *   §14.4  rankBowlerSuggestions()  — new-bowler sheet smart ordering
 *          nextBatterSuggestion()   — new-batter sheet default (next XI slot)
 *   §14.6  detectHatTrick()         — 3 consecutive dismissals, one bowler
 *          detectFiveFor()          — bowler crossing 5 wickets on the last ball
 *   §14.7  overRateFromBalls()      — per-ball timestamp → over-rate stats
 *   §14.10 undoableBallCount()      — undo count badge
 *          liveBallsInOver()        — "undo to start of over" target set
 *   §14.11 parseVoiceCommand()      — ~20-phrase voice grammar
 *
 * Everything here is deterministic and framework-free (bun-testable).
 */

import type {
  BallRecord,
  BowlerInningsData,
  ExtraType,
  InningsState,
  Player,
  WicketType,
} from '@/types';

// ─── §14.4 — Smart suggestions ───────────────────────────────────────────

export interface BowlerSuggestion {
  playerId: string;
  /** Why the engine surfaced this bowler first (shown as a hint chip). */
  reason: 'rested' | 'fewest-overs' | 'only-option';
  /** ms timestamp of the last ball this bowler bowled (null = hasn't bowled). */
  lastBowledAt: number | null;
  /** overs bowled so far this innings. */
  overs: number;
}

/**
 * Rank the eligible next bowlers:
 *   1. engine filter — the bowler of the over just completed is EXCLUDED
 *      (can't bowl consecutive overs);
 *   2. least recently bowled first (never-bowled = freshest);
 *   3. fewest overs bowled as the tiebreak.
 * Pre-select #1 in the sheet; every row accepts in one tap.
 */
export function rankBowlerSuggestions(
  fieldingPlayers: Player[],
  innings: Pick<InningsState, 'balls' | 'bowling' | 'currentBowlerId'>
): BowlerSuggestion[] {
  const liveBalls = (innings.balls ?? []).filter((b) => b.deletedAt == null);
  const lastBowled = new Map<string, number>();
  for (const b of liveBalls) {
    const t = typeof b.timestamp === 'string' ? Date.parse(b.timestamp) : NaN;
    if (!Number.isNaN(t)) {
      const prev = lastBowled.get(b.bowlerId);
      if (prev == null || t > prev) lastBowled.set(b.bowlerId, t);
    }
  }
  const overs = new Map<string, number>();
  for (const row of innings.bowling ?? []) {
    overs.set(row.playerId, row.completedOvers + (row.balls > 0 ? 0.5 : 0));
  }

  const eligible = fieldingPlayers.filter((p) => p.id !== innings.currentBowlerId);

  return eligible
    .map((p) => ({
      playerId: p.id,
      reason: 'fewest-overs' as const,
      lastBowledAt: lastBowled.get(p.id) ?? null,
      overs: overs.get(p.id) ?? 0,
    }))
    .sort((a, b) => {
      // Never bowled (null) sorts first — "least recently bowled".
      if (a.lastBowledAt == null && b.lastBowledAt != null) return -1;
      if (b.lastBowledAt == null && a.lastBowledAt != null) return 1;
      if (a.lastBowledAt != null && b.lastBowledAt != null && a.lastBowledAt !== b.lastBowledAt) {
        return a.lastBowledAt - b.lastBowledAt;
      }
      return a.overs - b.overs;
    })
    .map((s) => ({
      ...s,
      reason:
        eligible.length === 1
          ? ('only-option' as const)
          : s.lastBowledAt == null && s.overs === 0
            ? ('rested' as const)
            : ('fewest-overs' as const),
    }));
}

/**
 * The new-batter sheet defaults to the next lineup slot: the highest-priority
 * XI entry who is (a) not out, (b) not one of the two currently-creditable
 * batters. Falls back to `null` when nobody is left (all out).
 */
export function nextBatterSuggestion(
  innings: Pick<InningsState, 'batting' | 'team'>,
  strikerId: string | null,
  nonStrikerId: string | null,
  xiOrder?: string[] | null
): string | null {
  const dismissed = new Set(
    (innings.batting ?? []).filter((b) => b.isOut).map((b) => b.playerId)
  );
  const active = new Set([strikerId, nonStrikerId].filter(Boolean) as string[]);

  const order =
    xiOrder && xiOrder.length > 0
      ? xiOrder
      : (innings.team?.players ?? []).map((p) => p.id);

  for (const id of order) {
    if (!id) continue;
    if (dismissed.has(id) || active.has(id)) continue;
    // XI entries may name players that exist in the squad
    const exists = (innings.team?.players ?? []).some((p) => p.id === id);
    if (!exists) continue;
    return id;
  }
  return null;
}

// ─── §14.6 — Celebration detection ───────────────────────────────────────

/** Balls that count as events, in delivery order. */
function liveBalls(balls: BallRecord[]): BallRecord[] {
  return (balls ?? []).filter((b) => b.deletedAt == null);
}

function isDismissal(b: BallRecord): boolean {
  // RETIRED_HURT is a withdrawal, not a dismissal — no hat-trick credit.
  return b.isWicket === true && b.wicketType != null && b.wicketType !== 'RETIRED_HURT';
}

/**
 * Hat-trick: three consecutive LIVE deliveries (by delivery order) that are
 * all dismissals AND share the same bowler, ending on the LAST live ball.
 * Returns the bowler's id, or null.
 */
export function detectHatTrick(balls: BallRecord[]): string | null {
  const live = liveBalls(balls);
  if (live.length < 3) return null;
  const last3 = live.slice(-3);
  const bowler = last3[0].bowlerId;
  for (let i = 0; i < 3; i++) {
    if (last3[i].bowlerId !== bowler) return null;
    if (!isDismissal(last3[i])) return null;
  }
  // The sequence must END on the latest ball — otherwise it's old news.
  const lastBall = live[live.length - 1];
  if (!isDismissal(lastBall)) return null;
  return bowler;
}

export interface FiveFor {
  playerId: string;
  wickets: number;
}

/**
 * Five-for: the bowler who took the LAST live dismissal just crossed
 * 5 wickets for the innings. (Exactly-crossing keeps the banner a
 * one-time event rather than firing on every later wicket.)
 */
export function detectFiveFor(
  balls: BallRecord[],
  bowling: BowlerInningsData[]
): FiveFor | null {
  const live = liveBalls(balls);
  const last = live[live.length - 1];
  if (!last || !isDismissal(last)) return null;
  const row = (bowling ?? []).find((b) => b.playerId === last.bowlerId);
  if (!row) return null;
  if (row.wickets < 5) return null;
  // Crossed 5 exactly on this ball: wickets-1 would be the pre-ball tally.
  return { playerId: row.playerId, wickets: row.wickets };
}

// ─── §14.7 — Over-rate from per-ball timestamps ──────────────────────────

export interface OverRateStats {
  /** Mean seconds between the last N live balls (null when < 2 stamped). */
  avgIntervalSec: number | null;
  /** Overs per hour across the stamped window (null when < 2 balls). */
  oversPerHour: number | null;
  /** How many balls contributed to the window. */
  sampled: number;
  /** True when the average interval exceeds the 90s gully pace budget. */
  slow: boolean;
}

const OVER_RATE_WINDOW = 12; // balls — two overs of context
const SLOW_INTERVAL_SEC = 90;

export function overRateFromBalls(balls: BallRecord[]): OverRateStats {
  const stamped = liveBalls(balls)
    .map((b) => (typeof b.timestamp === 'string' ? Date.parse(b.timestamp) : NaN))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b)
    .slice(-OVER_RATE_WINDOW);

  if (stamped.length < 2) {
    return { avgIntervalSec: null, oversPerHour: null, sampled: stamped.length, slow: false };
  }

  let total = 0;
  for (let i = 1; i < stamped.length; i++) total += stamped[i] - stamped[i - 1];
  const avgMs = total / (stamped.length - 1);
  const avgIntervalSec = avgMs / 1000;
  const elapsedHr = (stamped[stamped.length - 1] - stamped[0]) / 3_600_000;
  const legalIsh = stamped.length - 1; // intervals ≈ deliveries
  const oversPerHour = elapsedHr > 0 ? legalIsh / 6 / elapsedHr : null;

  return {
    avgIntervalSec,
    oversPerHour,
    sampled: stamped.length,
    slow: avgIntervalSec > SLOW_INTERVAL_SEC,
  };
}

// ─── §14.10 — Undo everywhere ─────────────────────────────────────────────

/** How many events a single-tap undo could remove (live balls only). */
export function undoableBallCount(balls: BallRecord[]): number {
  return liveBalls(balls).length;
}

/** Live events of a given over (for "undo to start of over"). */
export function liveBallsInOver(balls: BallRecord[], overNumber: number): BallRecord[] {
  return liveBalls(balls).filter((b) => b.overNumber === overNumber);
}

// ─── §14.0 — Team tint (batting colour at 20%, contrast-guarded) ─────────

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function srgbChannel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relLum(rgb: [number, number, number]): number {
  return 0.2126 * srgbChannel(rgb[0]) + 0.7152 * srgbChannel(rgb[1]) + 0.0722 * srgbChannel(rgb[2]);
}

export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = relLum(a);
  const lb = relLum(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const DARK_BG: [number, number, number] = [7, 7, 16]; // #070710 (dark + amoled-safe base)
const LIGHT_BG: [number, number, number] = [245, 245, 250]; // #F5F5FA
const DARK_T1: [number, number, number] = [240, 240, 245]; // #F0F0F5
const LIGHT_T1: [number, number, number] = [26, 26, 46]; // #1A1A2E

/**
 * Batting-team colour mixed at 20% into the theme background, contrast-guarded
 * for BOTH requirements: the tint must still read against the background
 * (ratio ≥ 1.12) AND primary text must stay readable on the tint (ratio ≥ 4.5).
 * When 20% fails text contrast the mix is eased toward the background in steps;
 * if it can't be satisfied the tint degrades to transparent.
 */
export function teamTint(teamColor: string, mode: 'dark' | 'light'): string {
  const rgb = hexToRgb(teamColor);
  if (!rgb) return 'transparent';
  const bg = mode === 'dark' ? DARK_BG : LIGHT_BG;
  const text = mode === 'dark' ? DARK_T1 : LIGHT_T1;

  const mixes = [0.2, 0.14, 0.09, 0.05, 0];
  for (const mix of mixes) {
    if (mix === 0) return 'transparent';
    const tint: [number, number, number] = [
      Math.round(rgb[0] * mix + bg[0] * (1 - mix)),
      Math.round(rgb[1] * mix + bg[1] * (1 - mix)),
      Math.round(rgb[2] * mix + bg[2] * (1 - mix)),
    ];
    const vsBg = contrastRatio(tint, bg);
    const vsText = contrastRatio(tint, text);
    if (vsBg >= 1.12 && vsText >= 4.5) {
      return `rgb(${tint[0]}, ${tint[1]}, ${tint[2]})`;
    }
  }
  return 'transparent';
}

// ─── §14.11 — Voice scoring grammar (~20 phrases) ─────────────────────────

export type VoiceEvent =
  | { kind: 'runs'; runs: number; label: string }
  | { kind: 'extra'; extraType: ExtraType; extraRuns: number; label: string }
  | { kind: 'wicket'; wicketType: WicketType; label: string }
  | { kind: 'undo'; label: string };

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9,
};

const WORD_TO_WICKET: Record<string, WicketType> = {
  'caught': 'CAUGHT',
  'bowled': 'BOWLED',
  'run out': 'RUN_OUT',
  'runout': 'RUN_OUT',
  'run out.': 'RUN_OUT',
  'lbw': 'LBW',
  'l b w': 'LBW',
  'stumped': 'STUMPED',
  'hit wicket': 'HIT_WICKET',
  'mankad': 'RUN_OUT',
};

/**
 * Parse a recognised phrase into a scoring event. Returns null for anything
 * outside the grammar (the recognizer stays in listening mode).
 *
 * Grammar: "dot ball" · "no run" · "one…six" · "four runs" · "wide" ·
 * "two wides" · "no ball" · "no ball and four" · "bye" · "two byes" ·
 * "leg bye" · "wicket" · "wicket caught" · "caught" · "bowled" ·
 * "run out" · "stumped" · "lbw" · "hit wicket" · "undo".
 */
export function parseVoiceCommand(raw: string): VoiceEvent | null {
  const t = raw.toLowerCase().trim().replace(/[.!?,]+$/g, '');
  if (!t) return null;

  // Undo
  if (t === 'undo' || t === 'undo that' || t === 'cancel' || t === 'take it back') {
    return { kind: 'undo', label: 'Undo' };
  }

  // Extras with counts: "two wides", "three byes", "two leg byes"
  const countWord = t.match(/^(one|two|three|four|five|six|seven)\s+(wides?|byes?|leg byes?)$/);
  if (countWord) {
    const n = NUMBER_WORDS[countWord[1]];
    const what = countWord[2];
    if (what.startsWith('wide')) return { kind: 'extra', extraType: 'WIDE', extraRuns: n, label: `Wide +${n}` };
    if (what.startsWith('bye')) return { kind: 'extra', extraType: 'BYE', extraRuns: n, label: `Bye ${n}` };
    return { kind: 'extra', extraType: 'LEG_BYE', extraRuns: n, label: `Leg bye ${n}` };
  }

  // Wicket phrases
  if (t === 'wicket' || t.startsWith('wicket ') || t.startsWith('thats out') || t.startsWith("that's out") || t === 'out') {
    const detail = t.replace(/^wicket /, '').replace(/^thats out /, '').replace(/^that's out /, '').trim();
    if (detail === '' || detail === 'taken' || detail === 'fall') {
      return { kind: 'wicket', wicketType: 'CAUGHT', label: 'Wicket' };
    }
    const wt = WORD_TO_WICKET[detail];
    if (wt) return { kind: 'wicket', wicketType: wt, label: detail.replace(/\b\w/g, (c) => c.toUpperCase()) };
    return { kind: 'wicket', wicketType: 'CAUGHT', label: 'Wicket' };
  }
  for (const [phrase, wt] of Object.entries(WORD_TO_WICKET)) {
    if (t === phrase || t === `wicket ${phrase}`) {
      return { kind: 'wicket', wicketType: wt, label: phrase.replace(/\b\w/g, (c) => c.toUpperCase()) };
    }
  }

  // "no ball and four" — no-ball with runs off the bat.
  // NOTE: for NO_BALL, extraRuns means RUNS OFF THE BAT on the commit path
  // (commitExtra → handleScore(batRuns, NO_BALL, 1)); the +1 penalty is
  // baked in by the engine, NOT here. Returning the total here would
  // double-count the penalty (a plain voice "no ball" scoring 2 runs).
  const nbAnd = t.match(/^no ball (?:and )?(one|two|three|four|five|six|seven)$/);
  if (nbAnd) {
    const n = NUMBER_WORDS[nbAnd[1]];
    return { kind: 'extra', extraType: 'NO_BALL', extraRuns: n, label: `No ball +${n}` };
  }
  if (t === 'no ball' || t === 'no-ball' || t === 'no ball free hit') {
    return { kind: 'extra', extraType: 'NO_BALL', extraRuns: 0, label: 'No ball' };
  }

  // Plain extras
  if (t === 'wide' || t === 'wide ball') return { kind: 'extra', extraType: 'WIDE', extraRuns: 1, label: 'Wide' };
  if (t === 'bye' || t === 'one bye') return { kind: 'extra', extraType: 'BYE', extraRuns: 1, label: 'Bye' };
  if (t === 'leg bye' || t === 'one leg bye' || t === 'legby') {
    return { kind: 'extra', extraType: 'LEG_BYE', extraRuns: 1, label: 'Leg bye' };
  }

  // Dot ball
  if (t === 'dot ball' || t === 'dotball' || t === 'no run' || t === 'nothing' || t === 'good ball') {
    return { kind: 'runs', runs: 0, label: 'Dot ball' };
  }

  // Plain runs: "four", "four runs", "single", "couple", "two", "six"…
  const runWord = t.match(/^(one|two|three|four|five|six|seven)(?: runs?)?$/);
  if (runWord) {
    return { kind: 'runs', runs: NUMBER_WORDS[runWord[1]], label: `${NUMBER_WORDS[runWord[1]]} run${NUMBER_WORDS[runWord[1]] === 1 ? '' : 's'}` };
  }
  if (t === 'single') return { kind: 'runs', runs: 1, label: '1 run' };
  if (t === 'couple') return { kind: 'runs', runs: 2, label: '2 runs' };
  if (t === 'boundary') return { kind: 'runs', runs: 4, label: '4 runs' };

  // Digits: "4"
  const digit = t.match(/^([0-7])$/);
  if (digit) {
    const n = parseInt(digit[1], 10);
    return { kind: 'runs', runs: n, label: `${n} run${n === 1 ? '' : 's'}` };
  }

  return null;
}
