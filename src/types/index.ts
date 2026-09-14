export type WicketType =
  | 'BOWLED'
  | 'CAUGHT'
  | 'RUN_OUT'
  | 'LBW'
  | 'STUMPED'
  | 'HIT_WICKET'
  | 'RETIRED_HURT'
  | 'OBSTRUCTING_FIELD';
export type ExtraType = 'WIDE' | 'NO_BALL' | 'BYE' | 'LEG_BYE' | 'PENALTY';
export type MatchStatus = 'UPCOMING' | 'TOSS' | 'LIVE' | 'INNINGS_BREAK' | 'COMPLETED' | 'ABANDONED';
export type TossDecision = 'BAT' | 'FIELD';
export type TournamentFormat = 'ROUND_ROBIN' | 'KNOCKOUT';
export type TournamentStatus = 'UPCOMING' | 'ONGOING' | 'COMPLETED';

export type ScoringState =
  | 'SETUP_OPENER_1'
  | 'SETUP_OPENER_2'
  | 'SETUP_OPENING_BOWLER'
  | 'SCORING'
  | 'PROCESSING'
  | 'WICKET_MODAL'
  | 'NEW_BATSMAN'
  | 'OVER_COMPLETE'
  | 'INNINGS_BREAK'
  | 'MATCH_RESULT';

export interface Player {
  id: string;
  name: string;
  teamId: string;
  jerseyNumber?: number | null;
  /** v2 §13.2 — 'R' | 'L' (wagon wheel mirroring); undefined = right-hand. */
  battingHand?: string | null;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  color: string;
  emoji: string;
  players: Player[];
  createdAt: string;
}

export interface BatsmanInningsData {
  id: string;
  inningsId: string;
  playerId: string;
  player: Player;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  isOut: boolean;
  dismissalType?: WicketType | null;
  dismissedByBowlerId?: string | null;
  fielderPlayerId?: string | null;
  battingOrder: number;
}

export interface BowlerInningsData {
  id: string;
  inningsId: string;
  playerId: string;
  player: Player;
  completedOvers: number;
  balls: number;
  maidens: number;
  runs: number;
  wickets: number;
  wides: number;
  noBalls: number;
}

export interface InningsState {
  id: string;
  matchId: string;
  teamId: string;
  team: Team;
  inningsNumber: number;
  runs: number;
  wickets: number;
  completedOvers: number;
  currentBalls: number;
  wideBalls: number;
  noBalls: number;
  byes: number;
  legByes: number;
  target?: number | null;
  strikerId?: string | null;
  nonStrikerId?: string | null;
  currentBowlerId?: string | null;
  isCompleted: boolean;
  batting: BatsmanInningsData[];
  bowling: BowlerInningsData[];
  balls: BallRecord[];
  partnerships?: PartnershipData[];
}

export interface BallRecord {
  id: string;
  inningsId: string;
  overNumber: number;
  ballInOver: number;
  deliveryNumber: number;
  batsmanId: string;
  bowlerId: string;
  runs: number;
  isWicket: boolean;
  wicketType?: WicketType | null;
  dismissedPlayerId?: string | null;
  fielderPlayerId?: string | null;
  extraType?: ExtraType | null;
  extraRuns: number;
  isLegalDelivery: boolean;
  strikerIdBefore: string;
  nonStrikerIdBefore: string;
  // v2 §12.1/§12.5/§12.7
  causedFreeHit?: boolean;
  isFreeHit?: boolean;
  deletedAt?: string | null;
  version?: number;
  clientEventId?: string | null;
  meta?: string | null;
  // v2 §13.2/§13.3 — wagon wheel + pitch map capture
  wagonDirection?: string | null;
  pitchLength?: string | null;
  pitchLine?: string | null;
  // v2 §14.7 — per-ball timestamp (ISO string from the server) for over-rate
  timestamp?: string | null;
}

export interface MatchData {
  id: string;
  team1Id: string;
  team2Id: string;
  team1: Team;
  team2: Team;
  totalOvers: number;
  maxWickets: number;
  status: MatchStatus;
  tossWinnerId?: string | null;
  tossDecision?: TossDecision | null;
  currentInnings: number;
  result?: string | null;
  winnerId?: string | null;
  venue?: string | null;
  tournamentId?: string | null;
  liveCode?: string | null;
  createdAt: string;
  completedAt?: string | null;
  // v2 §12.10/§12.3 — house rules JSON + overs-adjustment audit log (JSON strings)
  rules?: string | null;
  adjustments?: string | null;
  // v2 §13.10 — cached AI match report JSON (null = not generated)
  reportJson?: string | null;
  innings: InningsState[];
}

/** v2 §12.10 — parsed house rules for the UI. */
export interface HouseRules {
  freeHitOnNoBall: boolean;
  ballsPerOver: number;
  powerplayOvers: number | 'auto';
  lastManStands: boolean;
  wideLimitAdditional: number;
  wagonCapture: 'off' | 'boundaries' | 'all';
  pitchMapCapture: boolean;
  guestPlayersAllowed: number;
  retiredHurtNotOut: boolean;
  strikeRotationV2: boolean;
}

/** v2 §12.3 — one Match.adjustments log entry. */
export interface MatchAdjustment {
  at: string;
  innings: 1 | 2;
  from: number;
  to: number;
  oversUsed: number;
  wickets: number;
  reason: string;
  method: 'dls' | 'approx' | 'manual';
  newTarget?: number | null;
}

export interface RecordBallInput {
  batsmanId: string;
  bowlerId: string;
  runs: number;
  isWicket: boolean;
  wicketType?: WicketType | null;
  dismissedPlayerId?: string | null;
  fielderPlayerId?: string | null;
  extraType?: ExtraType | null;
  extraRuns: number;
  // v2 §12.5/§12.7
  clientEventId?: string | null;
  penaltySide?: 'batting' | 'bowling' | null;
  reason?: string | null;
}

export interface RecordBallResponse {
  ball: BallRecord;
  inningsState: {
    runs: number;
    wickets: number;
    completedOvers: number;
    currentBalls: number;
    currentRunRate: number;
    requiredRunRate: number | null;
    runsNeeded: number | null;
    ballsRemaining: number | null;
    isCompleted: boolean;
    isOverComplete: boolean;
    /** v2 §13.1 — win probability for the batting team (null before any context). */
    winProbability?: number | null;
  };
  strikerUpdate: { strikerId: string; nonStrikerId: string };
  needsNewBatsman: boolean;
  needsNewBowler: boolean;
  needsInningsBreak: boolean;
  isMatchComplete: boolean;
}

export interface PartnershipData {
  id: string;
  batsman1: Player;
  batsman2: Player;
  runs: number;
  balls: number;
  wicketNumber: number;
  isOpen: boolean;
}

/** Auto-commentary event generated after significant balls */
export interface CommentaryEvent {
  category: 'SIX' | 'FOUR' | 'WICKET_BOWLED' | 'WICKET_CAUGHT' | 'WICKET_OTHER' | 'MILESTONE_50' | 'MILESTONE_100' | 'OVER_COMPLETE' | 'DOT_SEQUENCE' | 'CHASE_CLOSE' | 'EXTRA';
  text: string;
  timestamp: number;
}

export interface TournamentTeamStat {
  teamId: string;
  team: Team;
  played: number;
  won: number;
  lost: number;
  tied: number;
  points: number;
  nrr: number;
  runsScored: number;
  runsConceded: number;
  oversFaced: number;
  oversBowled: number;
}

export interface Tournament {
  id: string;
  name: string;
  format: TournamentFormat;
  totalOvers: number;
  status: TournamentStatus;
  createdAt: string;
  teams: TournamentTeamStat[];
  matches: MatchData[];
}

export interface MatchStoreState {
  currentState: ScoringState;
  match: MatchData | null;
  currentInnings: InningsState | null;
  strikerId: string | null;
  nonStrikerId: string | null;
  currentBowlerId: string | null;
  lastBallResult: RecordBallResponse | null;
  isSubmitting: boolean;
  // v2 §14.8 — setup wizard XI order (player ids, batting order) and the
  // optional keeper tag. Client-side only; the engine reads batting order
  // from the order batters enter, so this just powers smart defaults.
  xiOrder: string[] | null;
  keeperId: string | null;

  setMatch: (match: MatchData) => void;
  setCurrentInnings: (innings: InningsState) => void;
  /** Update innings data without resetting striker/bowler IDs */
  refreshInningsData: (innings: InningsState) => void;
  setStrike: (strikerId: string, nonStrikerId: string) => void;
  setBowler: (bowlerId: string) => void;
  setState: (state: ScoringState) => void;
  setSubmitting: (v: boolean) => void;
  setLastBallResult: (result: RecordBallResponse | null) => void;
  setXiOrder: (ids: string[]) => void;
  setKeeperId: (id: string | null) => void;
  reset: () => void;
}
