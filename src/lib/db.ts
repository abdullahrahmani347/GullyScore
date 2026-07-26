import { PrismaClient } from '@prisma/client'

/**
 * Default DATABASE_URL when the deploy environment doesn't inject one.
 *
 * The Z.ai preview / Function Compute runtime does NOT pass DATABASE_URL
 * through to the function (confirmed via /api/buildinfo: databaseUrl="unset").
 * Prisma's `env("DATABASE_URL")` in schema.prisma then resolves to undefined
 * and every query throws "Schema Validation Error: env DATABASE_URL not found".
 *
 * /tmp is writable on virtually all Linux serverless runtimes (FC, Lambda,
 * Cloud Run). SQLite needs a writable filesystem for its journal files, so
 * /tmp is the correct target.
 *
 * Data persistence caveat: /tmp on serverless is typically EPHEMERAL — data
 * is wiped on cold start. The schema-bootstrap recreates the tables on every
 * cold start so the dashboard always renders; user-created data does NOT
 * survive instance recycling. For production, set DATABASE_URL to a
 * persistent volume.
 *
 * NOTE: This MUST run before `new PrismaClient()` below. Prisma reads the env
 * var at client construction time, not at query time.
 */
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:/tmp/gullyscore.db';
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = basePrisma

// ---------------------------------------------------------------------------
// Auto-bootstrap SQLite schema on cold start.
//
// Why: Prisma opens an empty SQLite file when DATABASE_URL points at a
// non-existent path. It does NOT create tables. The first query then fails
// with `no such table: Match`. The DDL below is the exact output of
// `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`,
// wrapped in `IF NOT EXISTS` so re-runs are no-ops.
//
// Concurrency: bootstrapPromise caches the in-flight bootstrap so concurrent
// requests await the same Promise instead of racing DDL.
//
// NOTE: We previously tried wiring this through a Prisma `$extends` client
// extension with `$allOperations`. That breaks nested writes (e.g.
// `db.team.create({ data: { players: { create: [...] } } })`) with a Prisma
// internal "Cannot convert undefined or null to object" error — a known
// Prisma 6 issue. The extension approach was removed; routes must call
// `await ensureDbSchema()` explicitly. The 4 top-level routes (stats, teams,
// matches, tournaments) are patched manually; dynamic routes are patched by
// scripts/patch-routes-bootstrap.mjs.
// ---------------------------------------------------------------------------

const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS "Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#00D4AA',
    "emoji" TEXT NOT NULL DEFAULT '🏏',
    "deviceId" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "Player" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "jerseyNumber" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Player_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "team1Id" TEXT NOT NULL,
    "team2Id" TEXT NOT NULL,
    "totalOvers" INTEGER NOT NULL,
    "maxWickets" INTEGER NOT NULL DEFAULT 10,
    "status" TEXT NOT NULL DEFAULT 'UPCOMING',
    "tossWinnerId" TEXT,
    "tossDecision" TEXT,
    "currentInnings" INTEGER NOT NULL DEFAULT 1,
    "result" TEXT,
    "winnerId" TEXT,
    "venue" TEXT,
    "tournamentId" TEXT,
    "liveCode" TEXT,
    "deviceId" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "Match_team1Id_fkey" FOREIGN KEY ("team1Id") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_team2Id_fkey" FOREIGN KEY ("team2Id") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Innings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "inningsNumber" INTEGER NOT NULL,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "wickets" INTEGER NOT NULL DEFAULT 0,
    "completedOvers" INTEGER NOT NULL DEFAULT 0,
    "currentBalls" INTEGER NOT NULL DEFAULT 0,
    "wideBalls" INTEGER NOT NULL DEFAULT 0,
    "noBalls" INTEGER NOT NULL DEFAULT 0,
    "byes" INTEGER NOT NULL DEFAULT 0,
    "legByes" INTEGER NOT NULL DEFAULT 0,
    "target" INTEGER,
    "strikerId" TEXT,
    "nonStrikerId" TEXT,
    "currentBowlerId" TEXT,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Innings_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Innings_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Partnership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inningsId" TEXT NOT NULL,
    "batsman1Id" TEXT NOT NULL,
    "batsman2Id" TEXT NOT NULL,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "balls" INTEGER NOT NULL DEFAULT 0,
    "wicketNumber" INTEGER NOT NULL DEFAULT 0,
    "openingBallId" TEXT,
    "closingBallId" TEXT,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Partnership_inningsId_fkey" FOREIGN KEY ("inningsId") REFERENCES "Innings" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Partnership_batsman1Id_fkey" FOREIGN KEY ("batsman1Id") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Partnership_batsman2Id_fkey" FOREIGN KEY ("batsman2Id") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Ball" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inningsId" TEXT NOT NULL,
    "overNumber" INTEGER NOT NULL,
    "ballInOver" INTEGER NOT NULL,
    "deliveryNumber" INTEGER NOT NULL,
    "batsmanId" TEXT NOT NULL,
    "bowlerId" TEXT NOT NULL,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "isWicket" BOOLEAN NOT NULL DEFAULT false,
    "wicketType" TEXT,
    "dismissedPlayerId" TEXT,
    "fielderPlayerId" TEXT,
    "extraType" TEXT,
    "extraRuns" INTEGER NOT NULL DEFAULT 0,
    "isLegalDelivery" BOOLEAN NOT NULL DEFAULT true,
    "strikerIdBefore" TEXT NOT NULL,
    "nonStrikerIdBefore" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Ball_inningsId_fkey" FOREIGN KEY ("inningsId") REFERENCES "Innings" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Ball_batsmanId_fkey" FOREIGN KEY ("batsmanId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Ball_bowlerId_fkey" FOREIGN KEY ("bowlerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "BatsmanInnings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inningsId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "balls" INTEGER NOT NULL DEFAULT 0,
    "fours" INTEGER NOT NULL DEFAULT 0,
    "sixes" INTEGER NOT NULL DEFAULT 0,
    "isOut" BOOLEAN NOT NULL DEFAULT false,
    "dismissalType" TEXT,
    "dismissedByBowlerId" TEXT,
    "fielderPlayerId" TEXT,
    "battingOrder" INTEGER NOT NULL DEFAULT 99,
    CONSTRAINT "BatsmanInnings_inningsId_fkey" FOREIGN KEY ("inningsId") REFERENCES "Innings" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BatsmanInnings_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "BowlerInnings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inningsId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "completedOvers" INTEGER NOT NULL DEFAULT 0,
    "balls" INTEGER NOT NULL DEFAULT 0,
    "maidens" INTEGER NOT NULL DEFAULT 0,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "wickets" INTEGER NOT NULL DEFAULT 0,
    "wides" INTEGER NOT NULL DEFAULT 0,
    "noBalls" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "BowlerInnings_inningsId_fkey" FOREIGN KEY ("inningsId") REFERENCES "Innings" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BowlerInnings_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Tournament" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'ROUND_ROBIN',
    "totalOvers" INTEGER NOT NULL DEFAULT 10,
    "status" TEXT NOT NULL DEFAULT 'UPCOMING',
    "deviceId" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "TournamentTeam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tournamentId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "played" INTEGER NOT NULL DEFAULT 0,
    "won" INTEGER NOT NULL DEFAULT 0,
    "lost" INTEGER NOT NULL DEFAULT 0,
    "tied" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "runsScored" INTEGER NOT NULL DEFAULT 0,
    "runsConceded" INTEGER NOT NULL DEFAULT 0,
    "oversFaced" REAL NOT NULL DEFAULT 0.0,
    "oversBowled" REAL NOT NULL DEFAULT 0.0,
    "nrr" REAL NOT NULL DEFAULT 0.0,
    CONSTRAINT "TournamentTeam_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TournamentTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Match_liveCode_key" ON "Match"("liveCode");
CREATE UNIQUE INDEX IF NOT EXISTS "BatsmanInnings_inningsId_playerId_key" ON "BatsmanInnings"("inningsId", "playerId");
CREATE UNIQUE INDEX IF NOT EXISTS "BowlerInnings_inningsId_playerId_key" ON "BowlerInnings"("inningsId", "playerId");
CREATE UNIQUE INDEX IF NOT EXISTS "TournamentTeam_tournamentId_teamId_key" ON "TournamentTeam"("tournamentId", "teamId");
`;

let bootstrapPromise: Promise<void> | null = null;

/**
 * Ensure the SQLite schema exists. Safe to call on every request — the actual
 * DDL only runs once per process (cached via `bootstrapPromise`). Subsequent
 * calls return the resolved promise instantly.
 *
 * MUST be called at the top of every API route handler that touches `db`,
 * BEFORE the first query. The 4 top-level routes (stats, teams, matches,
 * tournaments) are patched manually; dynamic routes are patched by
 * scripts/patch-routes-bootstrap.mjs.
 */
export async function ensureDbSchema(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    // Prisma does not natively support executing multiple statements in a
    // single $executeRawUnsafe call. Split on `;` and run each non-empty
    // statement individually. This is the documented workaround.
    const statements = SCHEMA_DDL
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));
    for (const stmt of statements) {
      await basePrisma.$executeRawUnsafe(stmt);
    }
  })().catch((err) => {
    // Reset the cache so a subsequent request can retry. A transient failure
    // (e.g. /tmp not yet mounted) should not permanently break the instance.
    bootstrapPromise = null;
    throw err;
  });
  return bootstrapPromise;
}

// Plain PrismaClient export. Do NOT wrap with $extends — see comment above.
export const db = basePrisma;
