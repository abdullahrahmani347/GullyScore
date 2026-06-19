
---
Task ID: 8
Agent: Main Agent
Task: Pivot from blind fix-and-pray to ground-truth diagnostic instrumentation (per user's methodology critique)

Work Log:
- User correctly called out that six rounds of fixes to start.sh/Caddyfile/prune-standalone.mjs/db.ts were "correlation-shopping" — varying the hypothesis space without ever constraining it with a single bit of ground truth from the deploy target.
- Executed the user's recommended diagnostic ladder in order:

  STEP 0: Grep repo for deploy contract files (Dockerfile, fly.toml, render.yaml, railway.toml, nixpacks.toml, Procfile, app.json, .platform.app.yaml, devcontainer.json, vercel.json, netlify.toml)
    Result: NEGATIVE — no deploy contract files exist in the repo. The platform uses its own pre-baked image and invokes one of the .zscripts/ files. Cannot determine which one from the repo alone.

  STEP 2: /proc introspection on the dev container (zero-cost, immediate)
    - PID 1 = tini -- /start.sh (the BASE IMAGE's /start.sh, root-owned, NOT my .zscripts/start.sh)
    - PID 2 = caddy run --config /app/Caddyfile — this is what /start.sh exec'd into at the end. It reads /app/Caddyfile, which I cannot read (drwx--x--x root:root).
    - PID 845 = [start.sh] <defunct> — a zombie start.sh as a child of Caddy. Suspicious.
    - The dev container runs `bun run dev` (Next.js dev on :3000) — NOT my production build. The dev container is structurally different from the deploy target.
    - /app/Caddyfile is unreadable — I can't diff it against mine. The hash comparison has to happen on the deploy target itself.

  STEP 1: Added GULLYSCORE_V5 markers as LITERAL first lines of .zscripts/start.sh, before set -e:
    - tee to /tmp/marker.log — survives process crashes
    - write /tmp/marker_exists — survives stdout redirection
    - Plus env dump and Caddyfile diagnostic dump
    - If neither marker exists on the deploy target after a failed deploy, that is CONCLUSIVE evidence that this script is NOT what the platform invokes.

  STEP 1b: Instrumented Caddyfile comparison in start.sh:
    - Build-time MD5 of my Caddyfile is substituted into start.sh via sed (placeholder __GULLYSCORE_CADDYFILE_HASH__ becomes actual hash d82ebe3dd18e5962013df77fcfb0eaf9)
    - At runtime, start.sh logs both my hash AND md5sum of /app/Caddyfile (if readable), enabling direct comparison on the deploy target.

  STEP 3: Created /api/buildinfo HTTP endpoint with build-time diagnostics:
    - Initially named /api/__buildinfo — discovered Next.js silently 404s routes with __-prefixed path segments (treats them as private/internal). Renamed to /api/buildinfo.
    - Endpoint reports: GULLYSCORE_BUILD_MARKER (v5), BUILD_TIMESTAMP, GIT_SHA, NODE_ENV, runtime (bun/node), pid/ppid, cwd, port, DATABASE_URL scheme.
    - Build.sh bakes these vars into next-service-dist/.env at build time (after prune-standalone runs, so they survive).
    - In dev, vars are unset → endpoint returns "dev-no-marker" (visible now on dev server).

- Verified end-to-end:
  * Clean rebuild succeeds, tarball 26MB
  * start.sh in tarball has marker as literal first line
  * Caddyfile hash substitution works (d82ebe3dd18e5962013df77fcfb0eaf9 baked in)
  * .env in tarball has all 3 diagnostic vars (BUILD_TIMESTAMP, GIT_SHA, GULLYSCORE_BUILD_MARKER=v5)
  * /api/buildinfo route compiled into standalone server bundle
  * /api/buildinfo returns valid JSON on dev server
  * Dev server still healthy on :3000 and :81

Stage Summary:
- Three independent ground-truth channels now exist:
  1. /tmp/marker.log and /tmp/marker_exists on deploy target → confirms whether start.sh runs at all
  2. Caddyfile hash comparison in /tmp/marker.log → confirms whether platform's Caddyfile is mine or theirs
  3. /api/buildinfo HTTP endpoint → confirms whether deploy target is running my build (works without shell access)
- Next user action: click redeploy, then:
  (a) Curl https://<deploy-url>/api/buildinfo — interpretation guide in route.ts
  (b) If they have any way to check /tmp/marker_exists on the deploy target, that's the second independent confirmation
  (c) Share either result — that single bit of ground truth will collapse the hypothesis space
