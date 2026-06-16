---
Task ID: 1
Agent: Main Agent
Task: Implement device-level data isolation for GullyScore

Work Log:
- Created `/src/lib/device.ts` — Device ID utility with `getDeviceId()`, `deviceFetch()`, `safeDeviceFetcher()`, `deviceFetcher()` helpers
- Created `/src/lib/api-auth.ts` — Server-side helpers: `getDeviceIdFromRequest()`, `requireDeviceId()`, `verifyOwnership()`, `isAuthorized()`
- Updated Prisma schema — Added `deviceId String @default("")` to Team, Match, and Tournament models
- Ran `npx prisma db push` — Database schema updated successfully
- Updated ALL API routes (16 files) with deviceId filtering and ownership enforcement:
  - GET routes: filter by deviceId from X-Device-Id header
  - POST routes: require deviceId, set on new records, verify team ownership
  - PATCH/PUT/DELETE routes: verify ownership before allowing modifications
  - Spectator routes (/api/live/[code], /api/matches/[id]/stream): remain public for read-only access
- Updated ALL frontend pages/components to use device-aware fetching:
  - Replaced all raw `fetch()` calls with `deviceFetch()`
  - Replaced all SWR fetchers with `safeDeviceFetcher` or `deviceFetcher`
  - Updated offline fetch utility to include X-Device-Id header
  - Updated sync engine to include X-Device-Id header when replaying queued requests
- Added Theme Toggle button (Sun/Moon) to home page header
- Fixed home screen responsiveness: compact button layout with flex-shrink-0, gap controls, responsive text
- Updated settingsStore to properly apply theme on change and rehydration

Stage Summary:
- Device-level data isolation fully implemented across entire application
- Each device gets a unique UUID stored in localStorage
- Device ID is sent as X-Device-Id header on all API requests
- API routes filter data by deviceId (GET) and enforce ownership (mutations)
- Spectator/live viewing remains accessible via share codes (no deviceId required)
- Theme toggle added to home screen header
- Home screen header is now responsive with compact buttons on mobile
- Build passes successfully with zero errors

---
Task ID: 2
Agent: Main Agent
Task: Fix deployment failure ("Sorry, there was a problem deploying the code")

Work Log:
- Diagnosed root cause: absolute DATABASE_URL path in .env breaks Prisma on deploy target
- Discovered db/ directory and .prisma client were NOT being copied into standalone build
- Discovered start script used `bun` which may not be available on deploy platform
- Refactored src/lib/db.ts to resolve database URL portably:
  - Dev: honours DATABASE_URL from .env as before
  - Production: resolves path relative to process.cwd() (set by standalone server.js)
  - Auto-creates db/ dir if missing
  - Auto-copies seed DB from custom.db.seed on first run if available
  - Reduced Prisma log verbosity in production (only error/warn, not query)
- Updated package.json:
  - build script now copies db/custom.db -> .next/standalone/db/custom.db.seed
  - build script now copies node_modules/.prisma -> .next/standalone/node_modules/.prisma
  - start script switched from `bun` -> `node` for broader platform compatibility
- Added allowedDevOrigins to next.config.ts for *.space-z.ai preview domain
- Verified end-to-end: clean rebuild, standalone server starts on port 3456, HTTP 200 for / and /api/stats

Stage Summary:
- Standalone production build now self-contained: includes seed DB, prisma client, prisma engine binary
- Database path resolves portably on any deploy target (no more hard-coded /home/z/my-project absolute path)
- Platform should now be able to deploy the code without "problem deploying" error
- All build + runtime checks pass locally
