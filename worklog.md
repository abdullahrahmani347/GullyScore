---
Task ID: 1
Agent: Main Agent
Task: Audit and implement full CRUD, real-time data, error handling, optimistic updates across GullyScore

Work Log:
- Conducted comprehensive codebase audit identifying all hardcoded data, missing CRUD, missing error handling, missing optimistic updates
- Updated Prisma schema: added `maidens` field to BowlerInnings model
- Updated scoring engine (scoring-engine.ts): added maiden over tracking logic
- Updated BowlingTable component: replaced hardcoded `0` with actual `{b.maidens}` data
- Added RETIRED_HURT to WicketModal wicket type options
- Created tournament PUT/DELETE API endpoints with status transition validation and live match protection
- Created match DELETE endpoint with live match protection
- Enhanced match PATCH endpoint to support ABANDONED status
- Fixed team PUT endpoint: now properly handles player array with create/update/delete operations
- Fixed team GET endpoint: now includes `hasMatchHistory` per player for safe deletion
- Updated player DELETE endpoint: now checks match history before allowing deletion
- Replaced placeholder /api/route.ts with proper health check endpoint
- Fixed share.ts: replaced `any` types with proper MatchData type
- Rewrote team detail page: full inline player CRUD (add/edit/delete), optimistic updates, error handling, loading states
- Rewrote matches list page: added UPCOMING/ABANDONED filters, match delete/abandon with AlertDialogs, optimistic delete, error handling
- Rewrote scoring page: added error boundary, abandon match button, abandoned match detection
- Updated MatchListCard: added dropdown menu with abandon/delete options, ABANDONED status badge
- Rewrote tournaments list page: added error handling with retry, delete with confirmation
- Rewrote tournament detail page: added edit form in Sheet, delete with confirmation, status management (UPCOMING→ONGOING→COMPLETED), error handling
- Updated TournamentCard: added delete button, abandoned match counts
- Updated ScheduleList: proper navigation based on match status, ABANDONED status display
- Updated dashboard page: added error handling with retry state
- Updated teams list page: added error handling, optimistic create
- Created global ErrorBoundary component wrapping the entire app
- Added optimistic updates to scoring handlers (handleScore, handleWicket, handleSetStriker, handleSetBowler)
- Updated PlayerForm type: added optional `id` field for edit mode
- Updated TeamForm: passes player IDs in submit payload
- Updated BowlerInningsData type: added `maidens` field
- Re-seeded database with updated schema

Stage Summary:
- All entities now have full CRUD support (Teams, Players, Matches, Tournaments)
- All SWR hooks have error handling with retry buttons
- All mutations have loading states and proper error handling via toast
- Optimistic updates implemented for scoring, player add, match delete, team create
- Global ErrorBoundary wraps the entire app
- No more hardcoded/placeholder data — all data flows through live API
- No page refresh needed for any CRUD operation
- Confirmation dialogs for all destructive actions (delete team, delete player, delete match, abandon match, delete tournament)
- Maiden overs now properly tracked in bowling stats
- RETIRED_HURT wicket type now available in scoring UI
