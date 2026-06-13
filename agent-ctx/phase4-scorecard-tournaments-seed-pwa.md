# Phase 4: Scorecard, Tournaments, Seed Data, PWA

## Summary
Implemented the full scorecard view, tournament pages, realistic seed data, and PWA manifest for the GullyScore cricket scoring app.

## Files Created

### Scorecard Components
- `/src/components/scorecard/BattingTable.tsx` — Full batting table with dismissal descriptions, extras row, total row, top-scorer highlighting
- `/src/components/scorecard/BowlingTable.tsx` — Bowling figures table with economy rates, best bowler highlighting
- `/src/components/scorecard/FallOfWickets.tsx` — Fall of wickets timeline with score, batsman name, and over
- `/src/components/scorecard/BallByBallLog.tsx` — Ball-by-ball log grouped by over with color-coded ball displays
- `/src/components/scorecard/ScorecardView.tsx` — Main scorecard wrapper with innings tabs, match header, share functionality

### Scorecard Page
- `/src/app/matches/[id]/scorecard/page.tsx` — Scorecard page with SWR data fetching, skeleton loading, back navigation

### Tournament Components
- `/src/components/tournaments/TournamentCard.tsx` — Card for tournament list with status badge and progress bar
- `/src/components/tournaments/PointsTable.tsx` — Sortable points table with NRR color coding and gold leader highlight
- `/src/components/tournaments/ScheduleList.tsx` — Match schedule list with scores and status badges

### Tournament Pages
- `/src/app/tournaments/page.tsx` — Tournament list with "Create" button, uses TournamentCard component
- `/src/app/tournaments/new/page.tsx` — Create tournament form with name, format, overs, team selection
- `/src/app/tournaments/[id]/page.tsx` — Tournament detail with tabs (Points/Schedule/Teams)

### PWA
- `/public/manifest.json` — PWA manifest with app name, theme, icons
- `/public/icons/icon-192.png` — Generated PWA icon (192x192)
- `/public/icons/icon-512.png` — Generated PWA icon (512x512)

### Seed Data
- `/prisma/seed.ts` — Full seed script creating 6 teams, 66 players, 1 tournament, 6 matches (3 completed, 1 live, 2 upcoming)

## Files Modified
- `/src/app/layout.tsx` — Added manifest link, apple-touch-icon, PWA metadata
- `/src/components/matches/MatchListCard.tsx` — Completed matches now link to scorecard
- `/src/components/dashboard/RecentMatchCard.tsx` — Completed matches link to scorecard
- `/package.json` — Added seed script

## Key Decisions
- Completed matches link to `/matches/[id]/scorecard` instead of the scoring page
- Live/upcoming matches still link to `/matches/[id]` (scoring screen)
- Scorecard has innings tab switching for 2-innings matches
- Share functionality: image export (html2canvas) + WhatsApp summary (clipboard/share API)
- Seed data uses programmatic ball generation with target-based wicket distribution
- Tournament detail page uses tabs for Points/Schedule/Teams instead of showing all at once
