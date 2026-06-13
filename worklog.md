---
Task ID: 2
Agent: Main Agent
Task: Implement Partnership Tracking for GullyScore

Work Log:
- Added Partnership model to Prisma schema with fields: inningsId, batsman1Id, batsman2Id, runs, balls, wicketNumber, openingBallId, closingBallId, isOpen
- Added reverse relations on Player model (partnerships1, partnerships2)
- Ran prisma db push to update database schema
- Created partnership computation engine (src/lib/partnerships.ts) with two modes:
  - updatePartnershipOnBall: Incremental updates during live scoring
  - rebuildPartnerships: Full rebuild from Ball log (for undo, recalculate, migration)
- Updated scoring-engine.ts to call updatePartnershipOnBall after each ball recording
- Updated scoring-engine.ts undoLastBall to rebuild partnerships after undo
- Updated recalculate.ts to rebuild partnerships after recalculation
- Added PartnershipData type to types/index.ts
- Updated scorecard API endpoint to include partnerships with batsman names
- Created PartnershipsTable component with:
  - Sorted display (closed by wicket number desc, open last)
  - Top stand highlighted with accent border
  - 50+ and 100 partnership badges
  - Current partnership shown with green dot indicator
  - Ball count display
- Wired PartnershipsTable into ScorecardView (both single and dual innings views)
- Updated WhatsApp share summary to include best partnership info
- Created migration script (src/lib/migrate-partnerships.ts) for existing match data
- End-to-end tested with Node.js: verified 3 balls → partnership tracking → wicket closes partnership → new batsman opens new partnership
- Tested undo: partnerships correctly updated after undoing last ball
- Tested rebuild: produces identical results to incremental tracking

Stage Summary:
- Complete partnership tracking implemented with zero additional scorer input
- Partnerships computed entirely from Ball log data
- Surfaces on scorecard: "PARTNERSHIPS" section with runs/balls/wicket info
- Best partnership highlighted, 50+/100 badges
- WhatsApp summary includes best stand info
- Build passes cleanly, all tests pass
