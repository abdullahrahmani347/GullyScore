/**
 * GULLYSCORE v2 §11.2 — PURE CRICKET ENGINE
 * ---------------------------------------------------------------------------
 * Single source of truth for every ball-event → innings-state derivation.
 *
 * DOCTRINE (v2 §11.2):
 *   - This module has ZERO imports (no React, no Prisma, no Next, no SWR).
 *     It runs identically in the browser, in API routes, in the offline sync
 *     engine, in the test suite, and in standalone scripts.
 *   - `fold(events, rules)` is deterministic and pure: the same event list
 *     always folds to the same state (invariant 14, §12.12).
 *   - V1 PARITY IS MANDATORY: until the §12 rules land, this engine must
 *     reproduce the EXACT behaviour of v1's `scoring-engine.ts` /
 *     `recalculate.ts` — including its documented quirks (see "V1 PARITY"
 *     comments below). Every quirk is pinned by golden-fixture tests
 *     (`engine.test.ts` + `__fixtures__/golden/`). Changing a quirk requires
 *     a §12.11 correctness fix + release-note entry + old-vs-new test.
 *   - `recalculate.ts` is a thin DB writer around this module.
 *
 * FORWARD COMPATIBILITY (v2 §12/§18):
 *   - BallEvent carries optional `deletedAt` / `version` — soft-deleted
 *     events are skipped by fold() (undo tombstones, §12.7).
 *   - MatchRules carries the §12.10 house-rule knobs. Defaults reproduce v1.
 *     New rules (e.g. freeHitOnNoBall) are gated OFF by default and are only
 *     active when a caller passes them explicitly.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExtraType = 'WIDE' | 'NO_BALL' | 'BYE' | 'LEG_BYE';
export type WicketType =
  | 'BOWLED'
  | 'CAUGHT'
  | 'RUN_OUT'
  | 'LBW'
  | 'STUMPED'
  | 'HIT_WICKET'
  | 'RETIRED_HURT';

/**
 * Per-match house rules (v2 §12.10). Defaults = exact v1 behaviour.
 * `maxWickets`, `totalOvers`, `inningsNumber` and `target` come from the
 * Match/Innings rows and are required for completion checks.
 */
export interface MatchRules {
  ballsPerOver: number; // v1: 6
  maxWickets: number; // v1: Match.maxWickets
  totalOvers: number; // v1: Match.totalOvers
  inningsNumber: number; // 1 | 2
  target: number | null; // 2nd innings only
  // §12.10 house-rule knobs — ALL default to v1 behaviour
  freeHitOnNoBall: boolean; // v1: false (§12.1 lands later)
  powerplayOvers: number; // v1: 0 (§12.2 lands later)
  lastManStands: boolean; // v1: false (§12.10)
}

/** A recorded (or proposed) ball event. Persisted Ball rows are a superset. */
export interface BallEvent {
  id?: string;
  inningsId?: string;
  deliveryNumber: number; // monotonic per innings — drives ordering
  batsmanId: string; // striker at time of ball
  bowlerId: string;
  runs: number; // runs OFF THE BAT
  extraRuns: number; // wide/no-ball penalty + additional, or bye/leg-bye runs
  extraType: ExtraType | null;
  isWicket: boolean;
  wicketType?: WicketType | null;
  dismissedPlayerId?: string | null;
  fielderPlayerId?: string | null;
  strikerIdBefore: string | null;
  nonStrikerIdBefore: string | null;
  timestamp?: string | number | Date;
  // v2 §12.7/§18 forward-compat — absent in v1 data
  deletedAt?: string | null;
  version?: number;
}

export interface BatsmanStat {
  runs: number;
  balls: number; // balls faced: all deliveries except wides (V1 PARITY: no-balls DO count)
  fours: number;
  sixes: number;
  isOut: boolean;
  dismissalType: WicketType | null;
  dismissedByBowlerId: string | null;
  fielderPlayerId: string | null;
}

export interface BowlerStat {
  completedOvers: number;
  balls: number; // partial balls in current over
  maidens: number;
  runs: number; // charged = off bat + wide/no-ball penalties (V1 PARITY: byes/leg-byes excluded)
  wickets: number; // bowler-credited dismissals only
  wides: number;
  noBalls: number;
}

export interface FowEntry {
  wicketNumber: number;
  runs: number; // team total at the fall
  over: string; // "overs.balls" display, e.g. "4.3"
  playerId: string | null; // dismissed player
}

export interface PartnershipState {
  batsman1Id: string;
  batsman2Id: string;
  runs: number;
  balls: number; // legal deliveries
  wicketNumber: number; // 0 = open stand never closed
  isOpen: boolean;
  fromDelivery: number;
  toDelivery: number;
}

/** Per-ball derived effects (mirrors v1 recordBall's response semantics). */
export interface BallEffects {
  deliveryNumber: number;
  isLegalDelivery: boolean;
  overNumber: number;
  ballInOver: number;
  isOverComplete: boolean;
  newStrikerId: string | null;
  newNonStrikerId: string | null;
  needsNewBatsman: boolean;
  needsNewBowler: boolean;
  needsInningsBreak: boolean;
  isMatchComplete: boolean;
  inningsComplete: boolean;
  // §12.1 forward-compat (only populated when rules.freeHitOnNoBall)
  isFreeHit: boolean;
  causedFreeHit: boolean;
}

export interface NextBallContext {
  overNumber: number; // over the next ball belongs to
  ballInOver: number; // index of the next legal ball within the over
  needsNewBowler: boolean;
  needsNewBatsman: boolean;
  inningsComplete: boolean;
  // §12.1 forward-compat
  freeHitPending: boolean;
}

export interface InningsState {
  runs: number;
  wickets: number;
  completedOvers: number;
  currentBalls: number;
  legalBalls: number; // completedOvers * ballsPerOver + currentBalls
  wideBalls: number;
  noBalls: number;
  byes: number;
  legByes: number;
  strikerId: string | null;
  nonStrikerId: string | null;
  batting: Record<string, BatsmanStat>;
  bowling: Record<string, BowlerStat>;
  fow: FowEntry[];
  partnerships: PartnershipState[];
  inningsComplete: boolean;
  lastEffects: BallEffects | null;
  nextBallContext: NextBallContext;
  // §12.1 forward-compat (always false under default rules)
  freeHitPending: boolean;
}

// ---------------------------------------------------------------------------
// Errors / Result
// ---------------------------------------------------------------------------

export type EngineErrorCode =
  | 'VALIDATION'
  | 'WICKET_TYPE_REQUIRED'
  | 'RUN_OUT_TARGET_REQUIRED'
  | 'EXTRA_RUNS_WITHOUT_TYPE'
  | 'INNINGS_COMPLETE'
  | 'FREE_HIT_NO_DISMISSAL'; // §12.1 — reserved, enforced only when the rule is on

export interface EngineError {
  code: EngineErrorCode;
  message: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: EngineError };

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export type MatchRulesInput = Partial<MatchRules> &
  Pick<MatchRules, 'maxWickets' | 'totalOvers' | 'inningsNumber'>;

/** v1-parity defaults for every §12.10 house-rule knob. */
export function defaultRules(input: MatchRulesInput): MatchRules {
  return {
    ballsPerOver: input.ballsPerOver ?? 6,
    maxWickets: input.maxWickets,
    totalOvers: input.totalOvers,
    inningsNumber: input.inningsNumber,
    target: input.target ?? null,
    freeHitOnNoBall: input.freeHitOnNoBall ?? false,
    powerplayOvers: input.powerplayOvers ?? 0,
    lastManStands: input.lastManStands ?? false,
  };
}

// ---------------------------------------------------------------------------
// fold() — the deterministic event-sourced derivation
// ---------------------------------------------------------------------------

function emptyBatsman(): BatsmanStat {
  return {
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    isOut: false,
    dismissalType: null,
    dismissedByBowlerId: null,
    fielderPlayerId: null,
  };
}

function emptyBowler(): BowlerStat {
  return { completedOvers: 0, balls: 0, maidens: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0 };
}

/**
 * Fold an ordered ball-event list into the complete innings state.
 *
 * Determinism guarantees (invariant 14, §12.12):
 *   - events are sorted by `deliveryNumber` (input order is irrelevant)
 *   - soft-deleted events (deletedAt set) are skipped (§12.7 tombstones)
 *   - the initial striker pair is derived from the FIRST event's
 *     strikerIdBefore/nonStrikerIdBefore, so fold() is self-contained
 *
 * V1 PARITY NOTES (each pinned by a test — do not "fix" without §12.11):
 *   [P1] Strike rotation uses ONLY off-bat runs parity; odd byes/leg-byes do
 *        NOT swap strike in v1 (spec said they should; code wins for parity).
 *   [P2] Odd runs off the LAST ball of an over: single swap only (v1 keeps
 *        the over-end swap gated on EVEN runs) — see §12.11.4 for the
 *        upcoming correctness fix.
 *   [P3] Balls faced: +1 for every delivery except wides (no-balls count).
 *   [P4] Bowler analysis excludes byes/leg-byes (charged = off bat +
 *        wide/no-ball extras).
 *   [P5] Maiden = completed over with zero bowler-conceded runs
 *        (a bye/leg-bye-only over IS a maiden).
 *   [P6] All wicket types (incl. RETIRED_HURT) increment innings.wickets.
 *   [P7] Wicket on the striker: survivor takes strike, non-striker slot
 *        cleared to null (new-batter modal owns refilling it).
 *   [P8] Non-striker run-out: striker KEEPS strike, non-striker slot cleared.
 */
export function fold(events: BallEvent[], rules: MatchRules): InningsState {
  const live = events
    .filter((e) => e.deletedAt == null)
    .slice()
    .sort((a, b) => a.deliveryNumber - b.deliveryNumber);

  const state: InningsState = {
    runs: 0,
    wickets: 0,
    completedOvers: 0,
    currentBalls: 0,
    legalBalls: 0,
    wideBalls: 0,
    noBalls: 0,
    byes: 0,
    legByes: 0,
    strikerId: live[0]?.strikerIdBefore ?? null,
    nonStrikerId: live[0]?.nonStrikerIdBefore ?? null,
    batting: {},
    bowling: {},
    fow: [],
    partnerships: [],
    inningsComplete: false,
    lastEffects: null,
    nextBallContext: {
      overNumber: 0,
      ballInOver: 1,
      needsNewBowler: false,
      needsNewBatsman: false,
      inningsComplete: false,
      freeHitPending: false,
    },
    freeHitPending: false,
  };

  // Per-(bowler, over) conceded-runs accumulator → maiden detection [P5].
  const concededInOver = new Map<string, number>();
  // Open partnership tracking (unordered pair).
  let openStand: PartnershipState | null = null;

  let prevDeliveryNumber = 0;

  for (const ev of live) {
    // deliveryNumbers must be monotonic; v1 rows guarantee this.
    prevDeliveryNumber = Math.max(prevDeliveryNumber, ev.deliveryNumber);

    // RESYNC the striker pair from the event's authoritative Before values.
    // Rationale (v1 parity): recordBall reads innings.strikerId /
    // innings.nonStrikerId at every call, and the striker route may replace
    // the pair BETWEEN balls (new batter after a wicket). Every event
    // therefore captures the true pair at write time via strikerIdBefore /
    // nonStrikerIdBefore — the fold must trust them, not carry running
    // labels across a wicket (which would leave a stale null slot).
    if (ev.strikerIdBefore != null) state.strikerId = ev.strikerIdBefore;
    if (ev.nonStrikerIdBefore != null) state.nonStrikerId = ev.nonStrikerIdBefore;

    const isWide = ev.extraType === 'WIDE';
    const isNoBall = ev.extraType === 'NO_BALL';
    const isBye = ev.extraType === 'BYE';
    const isLegBye = ev.extraType === 'LEG_BYE';
    const isLegal = !isWide && !isNoBall;
    const totalRuns = ev.runs + ev.extraRuns;
    const runsAgainstBowler = isBye || isLegBye ? 0 : totalRuns;

    const currentLegalBalls = state.currentBalls;
    const newBallInOver = isLegal ? currentLegalBalls + 1 : 0;
    const isOverComplete = isLegal && newBallInOver === rules.ballsPerOver;
    const overIndex = state.completedOvers; // over this ball belongs to [P: v1 uses same]

    // --- §12.1 forward-compat: free-hit bookkeeping (inert under v1 rules)
    const isFreeHit = rules.freeHitOnNoBall && state.freeHitPending;
    const causedFreeHit = rules.freeHitOnNoBall && isNoBall;

    // --- Batting stats -------------------------------------------------
    const batsmanDismissed =
      ev.isWicket && (ev.wicketType !== 'RUN_OUT' ? true : ev.dismissedPlayerId === ev.batsmanId);

    const bat = (state.batting[ev.batsmanId] ??= emptyBatsman());
    bat.runs += ev.runs;
    bat.balls += isWide ? 0 : 1; // [P3]
    if (ev.runs === 4 && !isBye && !isLegBye) bat.fours += 1;
    if (ev.runs === 6 && !isBye && !isLegBye) bat.sixes += 1;
    if (batsmanDismissed) {
      bat.isOut = true;
      bat.dismissalType = ev.wicketType ?? null;
      bat.dismissedByBowlerId =
        ev.wicketType && !['RUN_OUT', 'RETIRED_HURT'].includes(ev.wicketType) ? ev.bowlerId : null;
      bat.fielderPlayerId = ev.fielderPlayerId ?? null;
    }

    // Non-striker run-out → own (mostly empty) batting row [P8]
    const nonStrikerRunOut =
      ev.isWicket && ev.wicketType === 'RUN_OUT' && ev.dismissedPlayerId === ev.nonStrikerIdBefore;
    if (nonStrikerRunOut && ev.nonStrikerIdBefore) {
      const ns = (state.batting[ev.nonStrikerIdBefore] ??= emptyBatsman());
      ns.isOut = true;
      ns.dismissalType = 'RUN_OUT';
    }

    // --- Bowling stats -------------------------------------------------
    const bowl = (state.bowling[ev.bowlerId] ??= emptyBowler());
    const bowlerBallsBefore = bowl.balls;
    const bowlerOverComplete = isLegal && bowlerBallsBefore + 1 === rules.ballsPerOver;
    bowl.runs += runsAgainstBowler; // [P4]
    if (isWide) bowl.wides += 1;
    if (isNoBall) bowl.noBalls += 1;
    if (ev.isWicket && ev.wicketType && !['RUN_OUT', 'RETIRED_HURT'].includes(ev.wicketType)) {
      bowl.wickets += 1;
    }
    if (isLegal) bowl.balls = (bowlerBallsBefore + 1) % rules.ballsPerOver;
    // Accumulate this ball's concession BEFORE the maiden check — v1's
    // over-balls query includes the ball that just completed the over.
    if (runsAgainstBowler > 0) {
      const key = `${ev.bowlerId}|${overIndex}`;
      concededInOver.set(key, (concededInOver.get(key) ?? 0) + runsAgainstBowler);
    }
    if (bowlerOverComplete) {
      bowl.completedOvers += 1;
      // [P5] maiden check — v1 sums bowler-conceded runs across the over's
      // balls (incl. extras), which equals this accumulator.
      const conceded = concededInOver.get(`${ev.bowlerId}|${overIndex}`) ?? 0;
      if (conceded === 0) bowl.maidens += 1;
    }

    // --- Innings counters ------------------------------------------------
    state.runs += totalRuns;
    state.wickets += ev.isWicket ? 1 : 0; // [P6] all wicket types count
    state.currentBalls = isOverComplete ? 0 : isLegal ? currentLegalBalls + 1 : currentLegalBalls;
    state.completedOvers += isOverComplete ? 1 : 0;
    if (isWide) state.wideBalls += 1;
    if (isNoBall) state.noBalls += 1;
    if (isBye) state.byes += ev.extraRuns;
    if (isLegBye) state.legByes += ev.extraRuns;
    state.legalBalls = state.completedOvers * rules.ballsPerOver + state.currentBalls;

    // --- Strike rotation [P1][P2][P7][P8] -------------------------------
    let strikerId = state.strikerId;
    let nonStrikerId = state.nonStrikerId;
    if (isLegal) {
      if (ev.runs % 2 === 1) {
        [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
      }
      if (isOverComplete && ev.runs % 2 === 0) {
        [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
      }
    }
    if (batsmanDismissed) {
      strikerId = nonStrikerId;
      nonStrikerId = null; // [P7]
    }
    if (nonStrikerRunOut) {
      strikerId = state.strikerId; // [P8] striker keeps strike
      nonStrikerId = null;
    }
    state.strikerId = strikerId;
    state.nonStrikerId = nonStrikerId;

    // --- Fall of wickets ------------------------------------------------
    if (ev.isWicket) {
      state.fow.push({
        wicketNumber: state.wickets,
        runs: state.runs,
        over: `${state.completedOvers}.${state.currentBalls}`,
        playerId: ev.dismissedPlayerId ?? ev.batsmanId,
      });
    }

    // --- Partnerships (derived; DB rows still written by partnerships.ts) -
    const pairA = ev.strikerIdBefore ?? '';
    const pairB = ev.nonStrikerIdBefore ?? '';
    const samePair =
      openStand != null &&
      ((openStand.batsman1Id === pairA && openStand.batsman2Id === pairB) ||
        (openStand.batsman1Id === pairB && openStand.batsman2Id === pairA));
    if (openStand == null || !samePair) {
      if (openStand != null && openStand.isOpen) {
        openStand.isOpen = false; // pair changed without a wicket (e.g. new batter)
        openStand.toDelivery = prevDeliveryNumber;
      }
      openStand = {
        batsman1Id: pairA,
        batsman2Id: pairB,
        runs: 0,
        balls: 0,
        wicketNumber: 0,
        isOpen: true,
        fromDelivery: ev.deliveryNumber,
        toDelivery: ev.deliveryNumber,
      };
      state.partnerships.push(openStand);
    }
    openStand.runs += totalRuns;
    openStand.balls += isLegal ? 1 : 0;
    openStand.toDelivery = ev.deliveryNumber;
    if (ev.isWicket && openStand.isOpen) {
      openStand.isOpen = false;
      openStand.wicketNumber = state.wickets;
    }

    // --- Innings completion + per-ball effects ---------------------------
    const inningsComplete =
      state.wickets >= rules.maxWickets ||
      (state.completedOvers >= rules.totalOvers && state.currentBalls === 0) ||
      (rules.inningsNumber === 2 && rules.target != null && state.runs >= rules.target);
    state.inningsComplete = inningsComplete;

    state.freeHitPending = rules.freeHitOnNoBall ? (causedFreeHit || (isFreeHit && !isLegal)) : false;

    state.lastEffects = {
      deliveryNumber: ev.deliveryNumber,
      isLegalDelivery: isLegal,
      overNumber: overIndex,
      ballInOver: isLegal ? newBallInOver : 0,
      isOverComplete,
      newStrikerId: strikerId,
      newNonStrikerId: nonStrikerId,
      needsNewBatsman: ev.isWicket && !inningsComplete,
      needsNewBowler: isOverComplete && !inningsComplete,
      needsInningsBreak: inningsComplete && rules.inningsNumber === 1,
      isMatchComplete: inningsComplete && rules.inningsNumber === 2,
      inningsComplete,
      isFreeHit,
      causedFreeHit,
    };
  }

  // Next-ball context for the UI / validateNext.
  const last = state.lastEffects;
  state.nextBallContext = {
    overNumber: state.completedOvers,
    ballInOver: state.currentBalls + 1,
    needsNewBowler: last?.needsNewBowler ?? false,
    needsNewBatsman: last?.needsNewBatsman ?? false,
    inningsComplete: state.inningsComplete,
    freeHitPending: state.freeHitPending,
  };

  return state;
}

// ---------------------------------------------------------------------------
// validateNext() — pre-write gate for a proposed ball event
// ---------------------------------------------------------------------------

/**
 * Validate a PROPOSED ball event against the current folded state before it
 * is persisted. Returns { ok: true, value } when the event may be recorded.
 * The API layer and the scoring UI both call this BEFORE writing, so illegal
 * events are blocked at the earliest possible layer.
 */
export function validateNext(
  state: InningsState,
  rules: MatchRules,
  proposed: BallEvent
): Result<BallEvent> {
  const fail = (code: EngineErrorCode, message: string): Result<BallEvent> => ({
    ok: false,
    error: { code, message },
  });

  if (state.inningsComplete) {
    return fail('INNINGS_COMPLETE', 'This innings is already complete — no more balls can be recorded.');
  }
  if (!Number.isInteger(proposed.runs) || proposed.runs < 0 || proposed.runs > 6) {
    return fail('VALIDATION', `runs must be an integer 0–6 (got ${proposed.runs}).`);
  }
  if (!Number.isInteger(proposed.extraRuns) || proposed.extraRuns < 0 || proposed.extraRuns > 4) {
    return fail('VALIDATION', `extraRuns must be an integer 0–4 (got ${proposed.extraRuns}).`);
  }
  if (proposed.extraType == null && proposed.extraRuns !== 0) {
    return fail('EXTRA_RUNS_WITHOUT_TYPE', 'extraRuns > 0 requires an extraType.');
  }
  if (proposed.extraType === 'WIDE' && proposed.runs !== 0) {
    return fail('VALIDATION', 'Wides cannot carry runs off the bat — use extraRuns for additional wide runs.');
  }
  if (proposed.isWicket && !proposed.wicketType) {
    return fail('WICKET_TYPE_REQUIRED', 'A wicket event must specify wicketType.');
  }
  if (proposed.isWicket && proposed.wicketType === 'RUN_OUT' && !proposed.dismissedPlayerId) {
    return fail('RUN_OUT_TARGET_REQUIRED', 'RUN_OUT requires dismissedPlayerId (striker or non-striker).');
  }

  // §12.1 — free-hit dismissal legality. Inert while freeHitOnNoBall is off
  // (default). When the rule ships, this is the enforcement point for
  // FREE_HIT_NO_DISMISSAL: only RUN_OUT is legal on a free-hit delivery.
  if (rules.freeHitOnNoBall && state.freeHitPending && proposed.isWicket && proposed.wicketType) {
    if (proposed.wicketType !== 'RUN_OUT') {
      return fail('FREE_HIT_NO_DISMISSAL', 'Only run-outs are legal on a free-hit delivery.');
    }
  }

  return { ok: true, value: proposed };
}

// ---------------------------------------------------------------------------
// Small pure helpers shared by consumers of the engine
// ---------------------------------------------------------------------------

export function decimalOvers(state: InningsState): number {
  return state.completedOvers + state.currentBalls / 6;
}

export function currentRunRate(state: InningsState): number {
  const ov = decimalOvers(state);
  if (ov === 0) return 0;
  return Math.round((state.runs / ov) * 100) / 100;
}

export function requiredRunRate(state: InningsState, rules: MatchRules): number | null {
  if (rules.target == null) return null;
  const ballsTotal = rules.totalOvers * rules.ballsPerOver;
  const ballsLeft = ballsTotal - state.legalBalls;
  const runsNeeded = rules.target - state.runs;
  if (ballsLeft <= 0) return runsNeeded > 0 ? 99.99 : 0;
  return Math.round((runsNeeded / (ballsLeft / 6)) * 100) / 100;
}
