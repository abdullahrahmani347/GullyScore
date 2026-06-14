---
Task ID: 1
Agent: Main
Task: Verify and fix Partnership Tracking features in GullyScore

Work Log:
- Explored entire codebase for partnership-related code — found 11 files
- Partnership backend was architecturally complete (Prisma model, scoring engine integration, rebuild on undo)
- Frontend was partially complete (scorecard display worked, but not live scoring or spectator)
- Main match API did NOT include partnerships — only scorecard API had them
- InningsState type was missing partnerships field
- WhatsApp share used `as any` type casting
- Identified two scoring bugs from previous session

Stage Summary:
- Added partnerships to ALL API routes: main match API, live code API, SSE stream API, PATCH responses
- Added `partnerships?: PartnershipData[]` to InningsState type
- Created CurrentPartnership component for live scoring screen
- Added SpectatorPartnership component for live spectator page
- Fixed WhatsApp share to use proper types instead of `as any` casts
- Added `refreshInningsData` store method to update innings data without resetting striker/bowler IDs
- Fixed second effect in scoring page to use `refreshInningsData` during NEW_BATSMAN/OVER_COMPLETE states
- This fixes Bug 1 (batsman list not refreshing) and Bug 2 (bowler should persist after wicket)
- All tests pass: partnership tracking verified with full scoring flow including wickets and undo
