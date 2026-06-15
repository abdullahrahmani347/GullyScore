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
