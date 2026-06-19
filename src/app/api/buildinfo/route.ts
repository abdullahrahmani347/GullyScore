import { NextResponse } from "next/server";

/**
 * GULLYSCORE DIAGNOSTIC ENDPOINT — /api/buildinfo
 *
 * NOTE: Originally named /api/__buildinfo but Next.js silently 404s routes
 * whose path segment starts with a double underscore (it treats them as
 * private/internal). Using /api/buildinfo instead — same diagnostic purpose,
 * actually reachable.
 *
 * Purpose: definitively answer "is the deploy target running my build?" without
 * needing logs, SSH, or platform docs. Works as long as the deploy target
 * serves HTTP at all.
 *
 * Interpretation guide (for the human reading the response):
 *
 *   1. 200 + { marker: "v5", builtAt: "<timestamp>", ... }
 *      → The deploy IS running my build. The deploy failure is happening
 *        AFTER Next.js starts (e.g. health check timeout, Caddy misconfig,
 *        port conflict). Look at /tmp/marker.log on the deploy target.
 *
 *   2. 200 + { marker: "<something else>" or missing }
 *      → The deploy is running a DIFFERENT build (stale cache, wrong branch,
 *        platform's own default app). My fixes are irrelevant until the
 *        platform actually ships my build.
 *
 *   3. 404
 *      → Either the deploy target isn't running my build at all, OR my build
 *        is so old it predates this endpoint. Either way: my latest code
 *        isn't on the deploy target.
 *
 *   4. 502 / 503 / connection refused / timeout
 *      → The deploy target's Next.js isn't even starting. This points at a
 *        startup crash (DB path, missing env, syntax error) rather than a
 *        post-start health check issue.
 *
 * The build.sh script bakes BUILD_TIMESTAMP, GIT_SHA, and
 * GULLYSCORE_BUILD_MARKER into next-service-dist/.env at build time. In dev,
 * these vars are unset — the endpoint reports "dev" mode instead.
 */
export async function GET() {
  return NextResponse.json({
    marker: process.env.GULLYSCORE_BUILD_MARKER ?? "dev-no-marker",
    builtAt: process.env.BUILD_TIMESTAMP ?? "unset",
    gitSha: process.env.GIT_SHA ?? "unset",
    mode: process.env.NODE_ENV ?? "unset",
    runtime: (() => {
      // Detect runtime without referencing Bun/Node globals that TypeScript
      // doesn't know about. Using typeof with a string check avoids
      // "Cannot find name 'Bun'" compile errors.
      const g = globalThis as unknown as { Bun?: unknown };
      if (typeof g.Bun !== "undefined") return "bun";
      return "node";
    })(),
    pid: process.pid,
    ppid: process.ppid,
    cwd: process.cwd(),
    port: process.env.PORT ?? "unset",
    databaseUrl: process.env.DATABASE_URL
      ? // Only show whether it's set + the scheme, never the full path
        // (which could leak internal layout).
        `set (${process.env.DATABASE_URL.split(":")[0]}:...)`
      : "unset",
    timestamp: new Date().toISOString(),
  });
}
