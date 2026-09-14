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

export type ExtraType = 'WIDE' | 'NO_BALL' | 'BYE' | 'LEG_BYE' | 'PENALTY';
export type WicketType =
  | 'BOWLED'
  | 'CAUGHT'
  | 'RUN_OUT'
  | 'LBW'
  | 'STUMPED'
  | 'HIT_WICKET'
  | 'RETIRED_HURT'
  | 'OBSTRUCTING_FIELD';

/** Dismissals the bowler is NOT credited for (v2 §12.6). */
export const NON_BOWLER_CREDITED: readonly WicketType[] = [
  'RUN_OUT',
  'RETIRED_HURT',
  'OBSTRUCTING_FIELD',
];

/** Dismissals legal on a free-hit delivery (v2 §12.1). */
export const FREE_HIT_DISMISSALS: readonly WicketType[] = ['RUN_OUT', 'OBSTRUCTING_FIELD'];

/** Dismissals legal on a NO-BALL delivery (v2 §12.6 truth table). */
export const NO_BALL_DISMISSALS: readonly WicketType[] = ['RUN_OUT', 'OBSTRUCTING_FIELD'];

/** Dismissals legal on a WIDE delivery (stumped off a wide is legal cricket). */
export const WIDE_DISMISSALS: readonly WicketType[] = ['RUN_OUT', 'STUMPED', 'OBSTRUCTING_FIELD'];

export type WagonCapture = 'off' | 'boundaries' | 'all';

/**
 * Per-match house rules (v2 §12.10). Defaults = exact v1 behaviour.
 * `maxWickets`, `totalOvers`, `inningsNumber` and `target` come from the
 * Match/Innings rows and are required for completion checks.
 *
 * IMPORTANT — two layers of defaults:
 *   - `defaultRules()` (below) reproduces V1 PARITY for every knob. It is
 *     used when Match.rules is null (all pre-v2 matches) and by the golden
 *     fixtures.
 *   - `parseMatchRules()` overlays a stored Match.rules JSON on top of the
 *     v1-parity base. New matches are created with the v2 defaults
 *     (`v2HouseRules()`) — freeHitOnNoBall true, retiredHurtNotOut true,
 *     strikeRotationV2 true, auto powerplay.
 */
export interface MatchRules {
  ballsPerOver: number; // v1: 6 (§12.8 — 8-ball overs)
  maxWickets: number; // v1: Match.maxWickets
  totalOvers: number; // v1: Match.totalOvers
  inningsNumber: number; // 1 | 2
  target: number | null; // 2nd innings only
  // §12.10 house-rule knobs — ALL default to v1 behaviour under defaultRules()
  freeHitOnNoBall: boolean; // v1: false — v2 matches: true (§12.1)
  powerplayOvers: number; // v1: 0 — v2 matches: auto 30% (§12.2)
  lastManStands: boolean; // v1: false (§12.10)
  // --- v2 additions -------------------------------------------------------
  wideLimitAdditional: number; // UI cap for additional wide runs (§12.9)
  wagonCapture: WagonCapture; // §12.10 / §13
  pitchMapCapture: boolean; // §12.10 / §13.3
  guestPlayersAllowed: number; // §12.10 / §17.7
  retiredHurtNotOut: boolean; // v1: false — v2: true (§12.4 — RH stays not-out)
  strikeRotationV2: boolean; // v1: false — v2: true (§12.11.4 two-swap model)
  /** Size of the batting side for lastManStands completion (null = unknown). */
  battingPlayers: number | null;
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
  // v2 §12.7/§18 — absent in v1 data. Prisma returns Date; fixtures use
  // ISO strings — fold() only checks null-ness, so both are accepted.
  deletedAt?: string | number | Date | null;
  version?: number;
  // v2 §12.7 — idempotency key for offline replay (unique index on Ball)
  clientEventId?: string | null;
  // v2 §12.5 — PENALTY events only: which side the runs are credited to.
  //   'batting'  → runs go to the batting team (fielding side infringed)
  //   'bowling'  → runs are banked for the fielding team (added to the chase
  //                target at the innings break), NOT to this innings total.
  penaltySide?: 'batting' | 'bowling' | null;
  // v2 §12.5 — free-text reason, surfaced in commentary/audit log
  reason?: string | null;
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
  // §12.5 — penalty runs credited to the batting side (in `runs`), and
  // penalty runs banked for the fielding side (chase target bump).
  penaltyRunsBatting: number;
  penaltyRunsBowling: number;
  // §12.2 — per-over summaries (powerplay split derivation)
  overs: OverSummary[];
}

/** §12.2 — per-over aggregate used for PP vs non-PP splits. */
export interface OverSummary {
  overNumber: number;
  runs: number;
  wickets: number;
  legalBalls: number;
  boundaries: number; // 4s + 6s off the bat
  bowlerIds: string[];
}

/** §12.2 — powerplay phase split of an innings. */
export interface PhaseSplit {
  runs: number;
  wickets: number;
  legalBalls: number;
  boundaries: number;
}

export interface PowerplaySplit {
  powerplayOvers: number;
  powerplay: PhaseSplit;
  nonPowerplay: PhaseSplit;
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
  | 'FREE_HIT_NO_DISMISSAL' // §12.1 — enforced when the rule is on
  | 'NO_BALL_NO_DISMISSAL' // §12.6 — catch off a no-ball is not out
  | 'WIDE_NO_DISMISSAL' // §12.6 — only run-out/stumped/obstructing off a wide
  | 'PENALTY_INVALID' // §12.5 — penalty events have a strict shape
  | 'EDIT_REVALIDATION'; // §12.7 — an edit broke a downstream event

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

/** v1-parity defaults for every house-rule knob. */
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
    wideLimitAdditional: input.wideLimitAdditional ?? 4,
    wagonCapture: input.wagonCapture ?? 'boundaries',
    pitchMapCapture: input.pitchMapCapture ?? false,
    guestPlayersAllowed: input.guestPlayersAllowed ?? 2,
    retiredHurtNotOut: input.retiredHurtNotOut ?? false,
    strikeRotationV2: input.strikeRotationV2 ?? false,
    battingPlayers: input.battingPlayers ?? null,
  };
}

// ---------------------------------------------------------------------------
// §12.10 — per-match rules JSON
// ---------------------------------------------------------------------------

/** Keys accepted in a stored Match.rules JSON (§12.10 table). */
const RULES_JSON_KEYS = [
  'freeHitOnNoBall',
  'ballsPerOver',
  'powerplayOvers',
  'lastManStands',
  'wideLimitAdditional',
  'wagonCapture',
  'pitchMapCapture',
  'guestPlayersAllowed',
  'retiredHurtNotOut',
  'strikeRotationV2',
] as const;

/**
 * §12.2 auto powerplay: max(1, round(totalOvers × 0.3)) when totalOvers ≥ 5,
 * else 0.
 */
export function autoPowerplayOvers(totalOvers: number): number {
  if (totalOvers < 5) return 0;
  return Math.max(1, Math.round(totalOvers * 0.3));
}

/**
 * v2 house-rules defaults for NEW matches (§12.10 table). Serialized as
 * Match.rules at creation; read back through parseMatchRules().
 */
export function v2HouseRules(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const defaults: Record<string, unknown> = {
    freeHitOnNoBall: true,
    ballsPerOver: 6,
    lastManStands: false,
    wideLimitAdditional: 4,
    wagonCapture: 'boundaries',
    pitchMapCapture: false,
    guestPlayersAllowed: 2,
    retiredHurtNotOut: true,
    strikeRotationV2: true,
  };
  const out: Record<string, unknown> = { ...defaults };
  for (const [k, v] of Object.entries(overrides)) {
    if (RULES_JSON_KEYS.includes(k as (typeof RULES_JSON_KEYS)[number]) && v !== undefined && v !== null) {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Parse a stored Match.rules JSON (String column on SQLite) into full rules.
 * - null / malformed JSON → v1-parity defaults (legacy matches behave exactly
 *   as v1 — golden-fixture guaranteed).
 * - powerplayOvers == 'auto' → autoPowerplayOvers(totalOvers) (§12.2).
 * Unknown keys are ignored; known keys are type-coerced defensively.
 */
export function parseMatchRules(
  json: string | null | undefined,
  base: MatchRulesInput,
  extras?: { battingPlayers?: number | null }
): MatchRules {
  const rules = defaultRules(base);
  if (json == null || json.trim() === '') return withExtras(rules, extras);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json);
  } catch {
    return withExtras(rules, extras); // malformed → v1 parity (fail safe)
  }
  if (typeof parsed !== 'object' || parsed === null) return withExtras(rules, extras);

  const b = parsed.ballsPerOver;
  if (b === 6 || b === 8) rules.ballsPerOver = b;
  if (typeof parsed.freeHitOnNoBall === 'boolean') rules.freeHitOnNoBall = parsed.freeHitOnNoBall;
  if (typeof parsed.lastManStands === 'boolean') rules.lastManStands = parsed.lastManStands;
  if (typeof parsed.retiredHurtNotOut === 'boolean') rules.retiredHurtNotOut = parsed.retiredHurtNotOut;
  if (typeof parsed.strikeRotationV2 === 'boolean') rules.strikeRotationV2 = parsed.strikeRotationV2;
  if (typeof parsed.pitchMapCapture === 'boolean') rules.pitchMapCapture = parsed.pitchMapCapture;
  if (parsed.wagonCapture === 'off' || parsed.wagonCapture === 'boundaries' || parsed.wagonCapture === 'all') {
    rules.wagonCapture = parsed.wagonCapture;
  }
  if (typeof parsed.powerplayOvers === 'number' && Number.isInteger(parsed.powerplayOvers) && parsed.powerplayOvers >= 0) {
    rules.powerplayOvers = parsed.powerplayOvers;
  } else if (parsed.powerplayOvers === 'auto') {
    rules.powerplayOvers = autoPowerplayOvers(base.totalOvers);
  } else if (parsed.powerplayOvers === undefined && parsed.freeHitOnNoBall === true) {
    // v2-defaults rules blob without an explicit PP value → auto PP
    rules.powerplayOvers = autoPowerplayOvers(base.totalOvers);
  }
  if (typeof parsed.wideLimitAdditional === 'number' && parsed.wideLimitAdditional >= 0) {
    rules.wideLimitAdditional = Math.floor(parsed.wideLimitAdditional);
  }
  if (typeof parsed.guestPlayersAllowed === 'number' && parsed.guestPlayersAllowed >= 0) {
    rules.guestPlayersAllowed = Math.floor(parsed.guestPlayersAllowed);
  }
  return withExtras(rules, extras);
}

function withExtras(rules: MatchRules, extras?: { battingPlayers?: number | null }): MatchRules {
  if (extras?.battingPlayers != null) rules.battingPlayers = extras.battingPlayers;
  return rules;
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
 *        the over-end swap gated on EVEN runs) — §12.11.4 / rules.strikeRotationV2
 *        is the two-swap fix, ON for v2 matches, OFF for legacy.
 *   [P3] Balls faced: +1 for every delivery except wides (no-balls count).
 *   [P4] Bowler analysis excludes byes/leg-byes (charged = off bat +
 *        wide/no-ball extras).
 *   [P5] Maiden = completed over with zero bowler-conceded runs
 *        (a bye/leg-bye-only over IS a maiden).
 *   [P6] All wicket types (incl. RETIRED_HURT) increment innings.wickets —
 *        v2 matches (rules.retiredHurtNotOut) do NOT count RH as a wicket and
 *        keep the batter not-out (§12.4).
 *   [P7] Wicket on the striker: survivor takes strike, non-striker slot
 *        cleared to null (new-batter modal owns refilling it).
 *   [P8] Non-striker run-out: striker KEEPS strike, non-striker slot cleared.
 *
 * v2 §12 ADDITIONS (all rules-gated, inert under v1-parity rules):
 *   - PENALTY events (§12.5): consume no ball, touch no batter/bowler stats.
 *   - OBSTRUCTING_FIELD (§12.6): wicket without bowler credit.
 *   - RETIRED_HURT under rules.retiredHurtNotOut (§12.4): not-out, no wicket,
 *     no FOW entry, batter stays eligible to return (same BatsmanInnings row
 *     continues on return — aggregate continuity, invariant 20).
 *   - rules.strikeRotationV2 (§12.11.4): delivery-parity swap XOR over-end
 *     swap, incl. bye/leg-bye and additional-wide parity (invariant 19).
 *   - Per-over summaries (§12.2) for powerplay splits.
 *   - lastManStands (§12.10): innings may continue with a lone batter; no
 *     strike swaps without a partner; ends at maxWickets or when the side is
 *     exhausted (battingPlayers).
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
    penaltyRunsBatting: 0,
    penaltyRunsBowling: 0,
    overs: [],
  };

  // Per-(bowler, over) conceded-runs accumulator → maiden detection [P5].
  const concededInOver = new Map<string, number>();
  // Open partnership tracking (unordered pair).
  let openStand: PartnershipState | null = null;

  /** Per-over summary accumulator (§12.2). */
  const overSummary = (idx: number): OverSummary => {
    let o = state.overs[idx];
    if (!o) {
      o = { overNumber: idx, runs: 0, wickets: 0, legalBalls: 0, boundaries: 0, bowlerIds: [] };
      state.overs[idx] = o;
    }
    return o;
  };

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

    // --- §12.5 PENALTY events --------------------------------------------
    // Consume no ball, touch no batter/bowler stats, rotate no strike. Runs
    // to the batting side join the team total (extras); runs to the bowling
    // side are banked for the chase target (invariant 13).
    if (ev.extraType === 'PENALTY') {
      const toBatting = (ev.penaltySide ?? 'batting') === 'batting';
      if (toBatting) {
        state.runs += ev.extraRuns;
        state.penaltyRunsBatting += ev.extraRuns;
        overSummary(state.completedOvers).runs += ev.extraRuns; // attributed to the current over for PP splits
      } else {
        state.penaltyRunsBowling += ev.extraRuns;
      }
      state.lastEffects = {
        deliveryNumber: ev.deliveryNumber,
        isLegalDelivery: false,
        overNumber: state.completedOvers,
        ballInOver: 0,
        isOverComplete: false,
        newStrikerId: state.strikerId,
        newNonStrikerId: state.nonStrikerId,
        needsNewBatsman: false,
        needsNewBowler: false,
        needsInningsBreak: false,
        isMatchComplete: false,
        inningsComplete: state.inningsComplete,
        isFreeHit: false,
        causedFreeHit: false,
      };
      continue;
    }

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

    // --- §12.1 free-hit bookkeeping (inert under v1 rules) ---------------
    const isFreeHit = rules.freeHitOnNoBall && state.freeHitPending;
    const causedFreeHit = rules.freeHitOnNoBall && isNoBall;

    // --- §12.4 retired-hurt semantics ------------------------------------
    const retiredHurtV2 = rules.retiredHurtNotOut && ev.isWicket && ev.wicketType === 'RETIRED_HURT';
    // The player who leaves the field: RUN_OUT and RETIRED_HURT name them
    // explicitly (dismissedPlayerId — the UI already sends this); every other
    // dismissal is the striker (batsmanId). A retirement may therefore be the
    // striker or the non-striker (dead-ball retirement).
    const leavingPlayerId =
      ev.wicketType === 'RUN_OUT' || ev.wicketType === 'RETIRED_HURT'
        ? ev.dismissedPlayerId ?? ev.batsmanId
        : ev.batsmanId;
    const dismissedIsNonStriker =
      ev.isWicket &&
      leavingPlayerId != null &&
      leavingPlayerId === ev.nonStrikerIdBefore &&
      leavingPlayerId !== ev.strikerIdBefore;

    // --- Batting stats -------------------------------------------------
    const batsmanDismissed =
      ev.isWicket && (ev.wicketType !== 'RUN_OUT' ? true : ev.dismissedPlayerId === ev.batsmanId);

    const bat = (state.batting[ev.batsmanId] ??= emptyBatsman());
    bat.runs += ev.runs;
    bat.balls += isWide ? 0 : 1; // [P3]
    if (ev.runs === 4 && !isBye && !isLegBye) bat.fours += 1;
    if (ev.runs === 6 && !isBye && !isLegBye) bat.sixes += 1;
    if (batsmanDismissed) {
      // The dismissal marks go on the LEAVING player's row: for RETIRED_HURT
      // that is dismissedPlayerId (== batsmanId for the striker-retirement UI
      // path); for every other dismissal it is the striker.
      const target = ev.wicketType === 'RETIRED_HURT' ? leavingPlayerId! : ev.batsmanId;
      const t = target === ev.batsmanId ? bat : (state.batting[target] ??= emptyBatsman());
      // §12.4: retired hurt keeps dismissalType (RH badge) but isOut stays
      // false — the batter is eligible to return and resumes this same row.
      t.dismissalType = ev.wicketType ?? null;
      if (!retiredHurtV2) {
        t.isOut = true;
        t.dismissedByBowlerId =
          ev.wicketType && !NON_BOWLER_CREDITED.includes(ev.wicketType) ? ev.bowlerId : null;
        t.fielderPlayerId = ev.fielderPlayerId ?? null;
      }
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
    if (ev.isWicket && ev.wicketType && !NON_BOWLER_CREDITED.includes(ev.wicketType)) {
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
    state.wickets += ev.isWicket && !retiredHurtV2 ? 1 : 0; // [P6] / §12.4
    state.currentBalls = isOverComplete ? 0 : isLegal ? currentLegalBalls + 1 : currentLegalBalls;
    state.completedOvers += isOverComplete ? 1 : 0;
    if (isWide) state.wideBalls += 1;
    if (isNoBall) state.noBalls += 1;
    if (isBye) state.byes += ev.extraRuns;
    if (isLegBye) state.legByes += ev.extraRuns;
    state.legalBalls = state.completedOvers * rules.ballsPerOver + state.currentBalls;

    // --- Per-over summary (§12.2) ----------------------------------------
    const osum = overSummary(overIndex);
    osum.runs += totalRuns;
    osum.wickets += ev.isWicket && !retiredHurtV2 ? 1 : 0;
    osum.legalBalls += isLegal ? 1 : 0;
    if ((ev.runs === 4 || ev.runs === 6) && !isBye && !isLegBye) osum.boundaries += 1;
    if (!osum.bowlerIds.includes(ev.bowlerId)) osum.bowlerIds.push(ev.bowlerId);

    // --- Strike rotation [P1][P2][P7][P8] / §12.11.4 ---------------------
    let strikerId = state.strikerId;
    let nonStrikerId = state.nonStrikerId;
    const canSwap = strikerId != null && nonStrikerId != null; // §12.10 lone batter
    if (rules.strikeRotationV2) {
      // §12.11.4 — TWO explicit swaps: XOR of delivery-parity swap and
      // over-end swap (invariant 19). Parity counts runs COMPLETED by the
      // batters: off the bat (legal or no-ball), byes/leg-byes, and the
      // additional runs on a wide (beyond the 1-run penalty).
      const parityRuns = isWide
        ? ev.extraRuns - 1
        : isBye || isLegBye
          ? ev.runs + ev.extraRuns
          : ev.runs;
      if (canSwap && parityRuns % 2 === 1) {
        [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
      }
      if (canSwap && isOverComplete) {
        [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
      }
    } else if (isLegal) {
      // v1 parity [P1][P2]
      if (canSwap && ev.runs % 2 === 1) {
        [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
      }
      if (canSwap && isOverComplete && ev.runs % 2 === 0) {
        [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
      }
    }
    if (batsmanDismissed) {
      // A non-striker retirement leaves the striker on strike (like [P8]).
      if (dismissedIsNonStriker) {
        nonStrikerId = null;
      } else if (rules.strikeRotationV2) {
        // v2 [P7]: the SURVIVOR takes strike — the non-striker BEFORE this
        // delivery (state.nonStrikerId, pre-rotation; the local pair above
        // only rotates at the very end). Reading the POST-rotation slot
        // handed strike back to the OUT batter whenever this delivery itself
        // rotated the pair (odd runs completed, or the over's last ball) —
        // leaving a dismissed player "on strike" and corrupting every
        // subsequent new-batter flow.
        strikerId = state.nonStrikerId;
        nonStrikerId = null; // [P7]
      } else {
        // v1 [P9] parity quirk (pinned): the odd-run swap is applied FIRST,
        // then the survivor is read from the POST-swap non-striker — which
        // is the dismissed batter. The striker label is corrected by the UI
        // new-batter flow (onNewBatsmanSelect derives the survivor from the
        // wicket ball's Before pair), not the engine.
        strikerId = nonStrikerId;
        nonStrikerId = null; // [P7]/[P9]
      }
    }
    if (nonStrikerRunOut) {
      strikerId = state.strikerId; // [P8] striker keeps strike
      nonStrikerId = null;
    }
    state.strikerId = strikerId;
    state.nonStrikerId = nonStrikerId;

    // --- Fall of wickets -------------------------------------------------
    // §12.4: a retirement is not a wicket — no FOW entry under v2 semantics.
    if (ev.isWicket && !retiredHurtV2) {
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
      // §12.4: a retirement closes the stand (the batter left) but is not a
      // dismissal — record the current wicket tally as the stand's close.
      openStand.isOpen = false;
      openStand.wicketNumber = retiredHurtV2 ? 0 : state.wickets;
    }

    // --- Innings completion + per-ball effects ---------------------------
    // §12.10 lastManStands: the innings continues while ≥ 1 not-out batter
    // remains even past the point where a short side has no new batter to
    // send in; it ends at maxWickets (last batter dismissed) or when the
    // side is exhausted (wickets ≥ battingPlayers).
    const wicketsEnd =
      state.wickets >= rules.maxWickets ||
      (rules.lastManStands && rules.battingPlayers != null && state.wickets >= rules.battingPlayers);
    const inningsComplete =
      wicketsEnd ||
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
 *
 * v2 §12 enforcement:
 *   - §12.1 free hit: only RUN_OUT / OBSTRUCTING_FIELD (FREE_HIT_NO_DISMISSAL)
 *   - §12.6 no-ball:  only RUN_OUT / OBSTRUCTING_FIELD (NO_BALL_NO_DISMISSAL)
 *   - §12.6 wide:     only RUN_OUT / STUMPED / OBSTRUCTING_FIELD
 *                     (a wicket on a wide keeps the wide: +1, no legal ball,
 *                     not re-bowled — invariant 18)
 *   - §12.5 PENALTY:  strict event shape (no runs, no wicket, 1–10 extra runs)
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

  // --- §12.5 PENALTY events ----------------------------------------------
  if (proposed.extraType === 'PENALTY') {
    if (proposed.runs !== 0) {
      return fail('PENALTY_INVALID', 'Penalties carry no runs off the bat — use extraRuns.');
    }
    if (proposed.isWicket) {
      return fail('PENALTY_INVALID', 'Penalties cannot be wicket events.');
    }
    if (!Number.isInteger(proposed.extraRuns) || proposed.extraRuns < 1 || proposed.extraRuns > 10) {
      return fail('PENALTY_INVALID', `Penalty extraRuns must be an integer 1–10 (got ${proposed.extraRuns}).`);
    }
    if (proposed.penaltySide !== 'batting' && proposed.penaltySide !== 'bowling') {
      return fail('PENALTY_INVALID', 'Penalties require penaltySide: "batting" | "bowling".');
    }
    return { ok: true, value: proposed };
  }

  // --- Extra-run shape (per type) -----------------------------------------
  if (proposed.extraType == null && proposed.extraRuns !== 0) {
    return fail('EXTRA_RUNS_WITHOUT_TYPE', 'extraRuns > 0 requires an extraType.');
  }
  const extraMax =
    proposed.extraType === 'WIDE' ? 1 + Math.max(0, rules.wideLimitAdditional) :
    proposed.extraType === 'NO_BALL' ? 1 :
    proposed.extraType === 'BYE' || proposed.extraType === 'LEG_BYE' ? 4 : 0;
  if (!Number.isInteger(proposed.extraRuns) || proposed.extraRuns < 0 || proposed.extraRuns > extraMax) {
    return fail('VALIDATION', `extraRuns must be an integer 0–${extraMax} for ${proposed.extraType ?? 'a legal delivery'} (got ${proposed.extraRuns}).`);
  }
  if (proposed.extraType === 'WIDE' && proposed.runs !== 0) {
    return fail('VALIDATION', 'Wides cannot carry runs off the bat — use extraRuns for additional wide runs.');
  }
  if (proposed.extraType === 'NO_BALL' && proposed.extraRuns !== 1) {
    return fail('VALIDATION', 'A no-ball carries exactly 1 penalty run; runs off the bat go in runs.');
  }
  if (proposed.isWicket && !proposed.wicketType) {
    return fail('WICKET_TYPE_REQUIRED', 'A wicket event must specify wicketType.');
  }
  if (proposed.isWicket && proposed.wicketType === 'RUN_OUT' && !proposed.dismissedPlayerId) {
    return fail('RUN_OUT_TARGET_REQUIRED', 'RUN_OUT requires dismissedPlayerId (striker or non-striker).');
  }
  if (
    proposed.isWicket &&
    proposed.wicketType === 'RUN_OUT' &&
    proposed.dismissedPlayerId &&
    state.strikerId != null &&
    state.nonStrikerId != null &&
    proposed.dismissedPlayerId !== state.strikerId &&
    proposed.dismissedPlayerId !== state.nonStrikerId
  ) {
    return fail('RUN_OUT_TARGET_REQUIRED', 'RUN_OUT must dismiss the striker or the non-striker.');
  }

  if (proposed.isWicket && proposed.wicketType) {
    // --- §12.6 wicket-on-extras truth table (checked FIRST so the hint
    // names the delivery: "No-ball — not out" beats the free-hit message) --
    if (proposed.extraType === 'NO_BALL' && !NO_BALL_DISMISSALS.includes(proposed.wicketType)) {
      return fail('NO_BALL_NO_DISMISSAL', 'No-ball — not out. Only run-outs are legal off a no-ball.');
    }
    if (proposed.extraType === 'WIDE' && !WIDE_DISMISSALS.includes(proposed.wicketType)) {
      return fail('WIDE_NO_DISMISSAL', 'Only run-outs and stumpings are legal off a wide.');
    }
    // --- §12.1 free-hit dismissal legality -------------------------------
    if (rules.freeHitOnNoBall && state.freeHitPending) {
      if (!FREE_HIT_DISMISSALS.includes(proposed.wicketType)) {
        return fail('FREE_HIT_NO_DISMISSAL', 'Free hit — not out. Only run-outs are legal on a free-hit delivery.');
      }
    }
  }

  return { ok: true, value: proposed };
}

// ---------------------------------------------------------------------------
// Small pure helpers shared by consumers of the engine
// ---------------------------------------------------------------------------

/** §12.8 — overs as a decimal honouring ballsPerOver (8-ball overs: 2.3 = 2 overs + 3 balls = 2.375). */
export function decimalOvers(state: InningsState, ballsPerOver = 6): number {
  return state.completedOvers + state.currentBalls / ballsPerOver;
}

export function currentRunRate(state: InningsState, ballsPerOver = 6): number {
  const ov = decimalOvers(state, ballsPerOver);
  if (ov === 0) return 0;
  return Math.round((state.runs / ov) * 100) / 100;
}

export function requiredRunRate(state: InningsState, rules: MatchRules): number | null {
  if (rules.target == null) return null;
  const ballsTotal = rules.totalOvers * rules.ballsPerOver;
  const ballsLeft = ballsTotal - state.legalBalls;
  const runsNeeded = rules.target - state.runs;
  if (ballsLeft <= 0) return runsNeeded > 0 ? 99.99 : 0;
  return Math.round((runsNeeded / (ballsLeft / rules.ballsPerOver)) * 100) / 100;
}

/** §12.2 — powerplay vs non-powerplay split; reconciles with innings totals. */
export function powerplaySplit(state: InningsState, rules: MatchRules): PowerplaySplit {
  const ppOvers = Math.min(rules.powerplayOvers, state.overs.length);
  const powerplay: PhaseSplit = { runs: 0, wickets: 0, legalBalls: 0, boundaries: 0 };
  const nonPowerplay: PhaseSplit = { runs: 0, wickets: 0, legalBalls: 0, boundaries: 0 };
  for (const o of state.overs) {
    const bucket = o.overNumber < ppOvers ? powerplay : nonPowerplay;
    bucket.runs += o.runs;
    bucket.wickets += o.wickets;
    bucket.legalBalls += o.legalBalls;
    bucket.boundaries += o.boundaries;
  }
  return { powerplayOvers: ppOvers, powerplay, nonPowerplay };
}

/** True when the bowler is credited for this dismissal type (§12.6). */
export function isBowlerCredited(type: WicketType): boolean {
  return !NON_BOWLER_CREDITED.includes(type);
}

/**
 * §12.7 write path — the striker pair "Before" a ball, derived from the
 * INNINGS ROW (the authoritative pair at write time), not from a fold of the
 * event log.
 *
 * Why the row: the striker route (openers setup, new batter after a wicket,
 * manual swap) patches innings.strikerId / nonStrikerId BETWEEN balls, and
 * recalculate() re-writes the pair after every ball. The fold of an empty or
 * mid-innings history cannot supply this — before the first ball its pair is
 * null, and a `?? batsmanId` fallback would record the striker as his own
 * non-striker (a degenerate (A, A) pair). Because fold() resyncs
 * state.nonStrikerId from every event's nonStrikerIdBefore, that single bad
 * value freezes strike rotation for the rest of the innings: every swap
 * exchanges A with A, the non-striker never comes on strike, and every ball
 * is credited to the opening striker.
 *
 * Fallbacks:
 *   - row striker null (row never initialised) → the client's batsmanId,
 *     which IS the striker for this delivery.
 *   - row non-striker null → null (§12.10 lone batter: no rotation).
 */
export function beforePairFor(
  rowStriker: string | null,
  rowNonStriker: string | null,
  batsmanId: string
): { strikerIdBefore: string; nonStrikerIdBefore: string | null } {
  return {
    strikerIdBefore: rowStriker ?? batsmanId,
    nonStrikerIdBefore: rowNonStriker ?? null,
  };
}

/**
 * §12.7 invariant 16 — dedupe an event list by clientEventId (first
 * occurrence wins). Events without a clientEventId pass through untouched.
 * The Ball.clientEventId UNIQUE index enforces this at write time; this
 * helper exists for offline-sync replays and repair paths.
 */
export function dedupeEvents(events: BallEvent[]): BallEvent[] {
  const seen = new Set<string>();
  const out: BallEvent[] = [];
  for (const e of events) {
    if (e.clientEventId == null || e.deletedAt != null) {
      out.push(e);
      continue;
    }
    if (seen.has(e.clientEventId)) continue;
    seen.add(e.clientEventId);
    out.push(e);
  }
  return out;
}

/**
 * §12.7 full-sequence re-validation: fold every event in order, validating
 * each against the running state. Used by the ball-editor write path so an
 * edit that would invalidate a DOWNSTREAM event (e.g. removing the no-ball
 * that legalised a free-hit dismissal) is rejected atomically.
 */
export function replayValidate(events: BallEvent[], rules: MatchRules): Result<InningsState> {
  const live = events
    .filter((e) => e.deletedAt == null)
    .slice()
    .sort((a, b) => a.deliveryNumber - b.deliveryNumber);

  // Fold incrementally so each event is validated against the exact state
  // the scorer saw when it was recorded.
  for (let i = 0; i < live.length; i++) {
    const prefix = live.slice(0, i + 1);
    const state = fold(prefix, rules);
    if (state.inningsComplete && i < live.length - 1) {
      return {
        ok: false,
        error: {
          code: 'EDIT_REVALIDATION',
          message: `Event #${live[i].deliveryNumber} completes the innings — no later events may follow.`,
        },
      };
    }
    const next = live[i + 1];
    if (!next) break;
    const check = validateNext(state, rules, next);
    if (!check.ok) {
      return {
        ok: false,
        error: {
          code: 'EDIT_REVALIDATION',
          message: `Event #${next.deliveryNumber} is illegal after the edit: ${check.error.message}`,
        },
      };
    }
  }
  return { ok: true, value: fold(live, rules) };
}
