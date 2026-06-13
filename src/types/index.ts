export type WicketType = 'BOWLED' | 'CAUGHT' | 'RUN_OUT' | 'LBW' | 'STUMPED' | 'HIT_WICKET' | 'RETIRED_HURT';
export type ExtraType = 'WIDE' | 'NO_BALL' | 'BYE' | 'LEG_BYE';
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
  createdAt: string;
  completedAt?: string | null;
  innings: InningsState[];
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
  };
  strikerUpdate: { strikerId: string; nonStrikerId: string };
  needsNewBatsman: boolean;
  needsNewBowler: boolean;
  needsInningsBreak: boolean;
  isMatchComplete: boolean;
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

  setMatch: (match: MatchData) => void;
  setCurrentInnings: (innings: InningsState) => void;
  setStrike: (strikerId: string, nonStrikerId: string) => void;
  setBowler: (bowlerId: string) => void;
  setState: (state: ScoringState) => void;
  setSubmitting: (v: boolean) => void;
  setLastBallResult: (result: RecordBallResponse) => void;
  reset: () => void;
}
