# GullyScore Phase 1 — Backend Foundation

## Task ID: gullyscore-phase1
## Agent: backend-foundation
## Status: COMPLETED

## Summary

Built the complete backend foundation for GullyScore, a cricket scoring web app. All Prisma schema, TypeScript types, core library files, and 17 API route files have been implemented and tested.

## Files Created/Modified

### Prisma Schema
- `prisma/schema.prisma` — Complete cricket data model with Teams, Players, Matches, Innings, Balls, BatsmanInnings, BowlerInnings, Tournaments, TournamentTeams. Enums for MatchStatus, TossDecision, WicketType, ExtraType, TournamentFormat, TournamentStatus.

### TypeScript Types
- `src/types/index.ts` — Full type definitions including WicketType, ExtraType, MatchStatus, ScoringState, Player, Team, BatsmanInningsData, BowlerInningsData, InningsState, BallRecord, MatchData, RecordBallInput, RecordBallResponse, TournamentTeamStat, Tournament, MatchStoreState.

### Core Library Files
- `src/lib/scoring-utils.ts` — Utility functions: decimalOvers, calculateCRR, calculateRRR, formatOvers, formatBowlingFigures, formatStrikeRate, formatEconomy, formatBattingAverage, calculateNRR, generateResultString, getManOfMatch, generateRoundRobinSchedule.
- `src/lib/scoring-engine.ts` — Core scoring logic: recordBall() and undoLastBall() functions with full state management.
- `src/lib/recalculate.ts` — Full innings recalculation from ball history.
- `src/lib/share.ts` — Export scorecard image (html2canvas) and WhatsApp summary generation.

### API Routes (17 files)

#### Teams
- `src/app/api/teams/route.ts` — GET (list), POST (create with players)
- `src/app/api/teams/[id]/route.ts` — GET (with career stats), PUT, DELETE
- `src/app/api/teams/[id]/players/route.ts` — POST (add player)
- `src/app/api/teams/[id]/players/[pid]/route.ts` — PUT, DELETE

#### Matches
- `src/app/api/matches/route.ts` — GET (list with filtering), POST (create)
- `src/app/api/matches/[id]/route.ts` — GET (full nested data), PATCH (update)
- `src/app/api/matches/[id]/scorecard/route.ts` — GET (structured scorecard)
- `src/app/api/matches/[id]/complete/route.ts` — POST (complete with result calculation + tournament stats update)
- `src/app/api/matches/[id]/innings/route.ts` — POST (create innings, sets match to LIVE)
- `src/app/api/matches/[id]/innings/[iid]/balls/route.ts` — POST (record ball via scoring engine)
- `src/app/api/matches/[id]/innings/[iid]/balls/last/route.ts` — DELETE (undo last ball)
- `src/app/api/matches/[id]/innings/[iid]/complete/route.ts` — POST (complete innings, auto-create 2nd innings with target)
- `src/app/api/matches/[id]/innings/[iid]/striker/route.ts` — POST (set striker/non-striker)
- `src/app/api/matches/[id]/innings/[iid]/bowler/route.ts` — POST (set current bowler)

#### Tournaments
- `src/app/api/tournaments/route.ts` — GET (list), POST (create with auto round-robin schedule)
- `src/app/api/tournaments/[id]/route.ts` — GET (full details)
- `src/app/api/tournaments/[id]/points-table/route.ts` — GET (sorted by points/NRR)
- `src/app/api/tournaments/[id]/schedule/route.ts` — GET (match schedule)

## Testing Results

All API endpoints tested successfully:
- ✅ Team CRUD operations
- ✅ Player management
- ✅ Match creation and updates
- ✅ Innings creation (sets match to LIVE)
- ✅ Striker/bowler assignment
- ✅ Ball recording (regular, wides)
- ✅ Undo last ball
- ✅ Scorecard endpoint
- ✅ Tournament creation with round-robin schedule
- ✅ ESLint passes with zero errors
- ✅ Dev server running on port 3000

## Key Implementation Notes

1. Route params use `Promise<{ id: string }>` pattern as required by Next.js 16
2. All routes use try/catch with proper error responses
3. Scoring engine handles: legal deliveries, wides, no-balls, byes, leg-byes, wickets (including run-outs of non-striker), over completion, innings completion detection
4. Innings completion auto-creates 2nd innings with target and sets match to INNINGS_BREAK
5. Match completion calculates result string, determines winner, updates tournament stats (NRR calculation)
6. The `innings` creation endpoint (not in original spec) was added to properly support the match flow: create match → toss → create 1st innings → set striker/bowler → record balls
