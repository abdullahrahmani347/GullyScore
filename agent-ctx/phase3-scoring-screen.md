# Phase 3: Scoring Screen & State Machine — Work Record

## Summary
Implemented the complete live scoring screen with all components and state machine for GullyScore.

## Files Created

### Stores
- `/src/store/matchStore.ts` — Zustand store for match scoring state (currentState, striker, nonStriker, bowler, etc.)
- `/src/store/settingsStore.ts` — Persisted settings store (theme, confirmUndoWicket)

### Hooks
- `/src/hooks/useScoringHandlers.ts` — Central scoring logic hook with handlers for:
  - `handleScore` — Record normal scoring balls
  - `handleWicket` — Record wickets
  - `handleUndo` — Undo last ball with confirmation
  - `handleSetStriker` — Set batsmen via API
  - `handleSetBowler` — Set bowler via API
  - `handleCompleteInnings` — Complete innings via API
  - `handleCompleteMatch` — Complete match via API
  - `handleCreateInnings` — Create new innings via API

### Scoring Components
- `/src/components/scoring/ScoringScreen.tsx` — Main orchestrator rendering correct view based on state
- `/src/components/scoring/ScoreDisplay.tsx` — Hero score display with CRR, RRR, target info, and flash animations
- `/src/components/scoring/ScoreButtons.tsx` — 3x2 scoring grid + Extras/Wicket/Undo buttons
- `/src/components/scoring/OverStrip.tsx` — Current over ball display with colored badges
- `/src/components/scoring/BatsmenCard.tsx` — Striker/non-striker info with stats
- `/src/components/scoring/BowlerCard.tsx` — Current bowler figures and economy
- `/src/components/scoring/ExtrasPanel.tsx` — Bottom sheet for Wide/NoBall/Bye/LegBye with run input
- `/src/components/scoring/WicketModal.tsx` — Two-step wicket modal (type → fielder/batsman)
- `/src/components/scoring/PlayerSelectModal.tsx` — Generic player selector with search
- `/src/components/scoring/OverCompleteModal.tsx` — Over complete summary + next bowler selection
- `/src/components/scoring/InningsBreakScreen.tsx` — Full-screen innings break with opener/bowler selection
- `/src/components/scoring/MatchResultScreen.tsx` — Match result display with share/export
- `/src/components/scoring/index.ts` — Barrel exports

### Pages
- `/src/app/matches/[id]/page.tsx` — Replaced match detail page with live scoring screen

### CSS
- `/src/app/globals.css` — Added scoring animations (wicket-flash, four-flash, six-flash, score-pulse) and dark theme dialog/sheet overrides

## State Machine States
- `SETUP_OPENER_1` → Select first opening batsman
- `SETUP_OPENER_2` → Select second opening batsman
- `SETUP_OPENING_BOWLER` → Select opening bowler
- `SCORING` → Main scoring UI (normal state)
- `PROCESSING` → Ball is being recorded (buttons disabled)
- `WICKET_MODAL` → Wicket type selection
- `NEW_BATSMAN` → Select new batsman after wicket
- `OVER_COMPLETE` → Select next bowler
- `INNINGS_BREAK` → Innings break flow
- `MATCH_RESULT` → Match result display

## Key Design Decisions
1. All scoring buttons disabled during PROCESSING state (prevent double-tap)
2. Touch targets ≥56px for scoring buttons
3. Framer Motion animations for score changes, ball additions, flash effects
4. Non-dismissable modals for mandatory selections (opener, bowler, new batsman)
5. Undo with confirmation dialog for wicket balls
6. RRR shown in red when > CRR*1.3 (difficult chase indicator)
7. Extras flow: select type → select runs → auto-calculate penalty runs
8. BottomNav already hides on `/matches/[id]` route (existing logic)
