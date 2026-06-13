# GullyScore — Product Requirements Document
## Version 1.0 | June 2026 | Status: Ready for Development

---

## 1. EXECUTIVE SUMMARY

GullyScore is a mobile-first progressive web application for tracking informal cricket matches — gully games, colony tournaments, university grounds, terrace cricket — at a level of fidelity that paper scorecards and WhatsApp groups cannot match.

**Core thesis:** Every serious gully match eventually produces a score dispute. The current tools are either too casual (manually typing into a group chat) or too complex (full-blown sports management platforms). GullyScore is purpose-built for the middle — fast to start, cricket-accurate in logic, beautiful on a phone screen, and persistent across sessions.

**Target geography:** South Asia (India, Pakistan, Sri Lanka, Bangladesh) and diaspora communities globally. The app should feel culturally native — names, examples, and aesthetic sensibility should match this context.

---

## 2. PROBLEM STATEMENT

| Current Solution | Critical Failures |
|-----------------|-------------------|
| Paper scorecard | Disputes, illegible handwriting, water/weather damage, no searchable history, cannot be shared digitally |
| WhatsApp manual updates | Unstructured, tedious, prone to miscounts, no ball-by-ball granularity |
| ESPNcricinfo/Cricbuzz apps | Require registration, designed for broadcast cricket not informal games, overkill UI |
| Generic sports trackers | No cricket-specific scoring rules (extras, strike rotation, over completion) |
| Excel spreadsheets | Completely unusable on mobile, requires expertise to build |

GullyScore eliminates all five failure modes simultaneously.

---

## 3. USER PERSONAS

### Primary: The Colony Organizer (Rakesh, 28, Pune)
Organizes the annual apartment building tournament every winter. Manages 6-8 teams, 20-30 players, 10-15 matches over 3 weeks. Currently drowning in WhatsApp groups with disputed scorecards and a hand-drawn points table on a whiteboard.
**Needs:** Tournament creation, auto-generated schedule, live points table, shareable scorecards, match history.
**Frustration peak:** When two teams argue about yesterday's score and nobody has a clear record.

### Secondary: The Sunday Scorer (Ahmed, 19, Lahore)
Scores for weekend matches between friend groups on the street or a local maidan. No tournament, just a match. Wants to start quickly, score accurately, show off the final scorecard on WhatsApp.
**Needs:** Fast match start, large scoring buttons usable with one thumb, share result.
**Frustration peak:** Losing count of extras. Forgetting which over they're on.

### Tertiary: The Stats Nerd (Priya, 24, Chennai)
Plays regularly with the same friend group. Cares about career statistics across matches. Wants to know who the top scorer is across all their Sunday games this year.
**Needs:** Player career stats, persistent history, individual performance tracking.
**Frustration peak:** No record of anything except memories.

---

## 4. SUCCESS METRICS

- **P0:** Time from app open to first ball recorded < 90 seconds
- **P0:** Scoring a ball takes < 2 taps
- **P0:** Zero data loss on page refresh
- **P1:** Scorecard sharable to WhatsApp in < 3 taps
- **P1:** Tournament points table auto-updates after each match
- **P2:** 5+ completed matches visible in history with search

---

## 5. FEATURE MATRIX

### Priority 0 — MVP Core (Build First)
- Team CRUD with player management
- Match creation with toss + over config
- Ball-by-ball scoring engine (all run types)
- Extras: wide, no ball, bye, leg bye
- Wicket recording with dismissal types
- Auto-calculated runs, overs, run rate, required run rate
- Current batsmen + bowler display
- Over ball strip display (current over)
- Undo last ball
- Local persistence (survive refresh)
- Match history list
- Historical scorecard view
- Mobile-first responsive UI, dark mode

### Priority 1 — Should Have (Build in Initial Release)
- Player-level statistics tracking (runs, wickets, economy, avg, SR)
- Tournament module (round robin, points table, schedule)
- Share scorecard as PNG image
- Edit any ball in current innings
- Over complete modal (bowler change prompt)
- Dashboard with live match banner, recent matches, quick stats

### Priority 2 — Nice to Have (Post-Launch)
- Export match summary as copy-able text (WhatsApp format)
- Knockout tournament format
- NRR on points table
- PWA installable offline
- Match scheduling with date/time
- "Free Hit" indicator after no ball
- Dark/Light/System theme toggle

### Out of Scope — v1
- Real-time multiplayer (two scorers on same match simultaneously)
- User authentication / cloud sync
- Video/photo uploads
- Fantasy points or betting integrations
- Push notifications
- Public shareable match links (no backend auth)
- Super over handling
- DLS calculations

---

## 6. DETAILED FEATURE SPECIFICATIONS

### 6.1 Dashboard

The home screen. Serves as the command center for everything in progress.

**Section 1 — Live Match Banner**
- Condition: any match with status = LIVE
- Full-width card with pulsing green "LIVE" badge
- Displays: Team 1 score/wickets, Team 2 score/wickets (or "yet to bat"), overs, current run rate, required run rate (2nd innings only), runs needed in N overs
- Background: team color gradient (team batting first's color on left, team fielding's on right)
- Tap target: entire card → navigate to scoring screen
- If no live match: show "▶ Start New Match" CTA button in its place

**Section 2 — Recent Matches (horizontal scroll)**
- Last 6 completed matches
- Each card: team names + scores, result summary ("Strikers won by 23 runs"), date, top scorer
- Tap → historical scorecard

**Section 3 — Active Tournaments**
- Cards for each tournament with status ONGOING
- Shows: tournament name, current leader, matches left, date
- Points table mini-preview (top 3 teams)
- Tap → tournament detail

**Section 4 — Quick Stats Row (top of page)**
- Total matches played, teams registered, active tournaments
- Displayed as icon + number chips

---

### 6.2 Team Management

#### 6.2.1 Team List
- 2-column card grid on mobile, 3-column on tablet
- Each card: team color swatch, team emoji, name, short name, player count, win-loss record
- Sort toggle: Newest / Alphabetical / Most Wins
- Search bar (filters by team name or player name)
- Floating "+" button → create team

#### 6.2.2 Create / Edit Team Form

**Fields:**
| Field | Type | Validation | Notes |
|-------|------|------------|-------|
| Team Name | Text input | Required, 2-30 chars | e.g., "Colony Strikers" |
| Short Name | Text input | Required, 2-5 chars | Auto-suggest from initials. e.g., "CS" |
| Team Color | Color picker | Required | 12 preset swatches + custom hex input |
| Team Emoji | Emoji selector | Optional | Grid of 20 cricket-themed emojis as defaults: 🏏⚡🔥🦁🦅🐯💎🌟🚀🌙 |

**Player Builder (inline list below form):**
- Each player row: name input + optional jersey # input + delete button
- Add player button appends a new row
- Minimum: 1 player (validation)
- Maximum: 15 players
- Drag handle on each row for reordering (sets batting order for match)
- Auto-focus on newly added player name field
- Validation: no two players with identical names on same team

**Save behavior:**
- Optimistic update (show immediately, sync to DB in background)
- Toast notification on success/failure
- Edit form pre-populates all fields

#### 6.2.3 Team Detail

Header: Full-width banner in team color. Team emoji (large, 64px). Team name + short name. "Edit" button (top right).

**Career Stats Section:**
- Matches played, Won, Lost, Win %
- Highest team total scored
- Lowest team total conceded
- Displayed as stat cards in a 2x2 grid

**Player Roster Section:**
- Each player: name, jersey # (if set)
- Player stats (collapsed by default, expand on tap):
  - **Batting:** Innings, Runs, Average (runs/dismissals), SR (runs/balls×100), HS, 4s, 6s
  - **Bowling:** Wickets, Overs, Economy (runs/overs), Best figures (e.g., 3/14)
- Jersey number badge on player avatar circle

**Delete Team:** Bottom of page, destructive red button. Confirmation dialog warns: "This team has N matches in history. Match history will be retained but team cannot be edited." If team has no match history, deletion is clean.

---

### 6.3 Match Creation (Multi-Step Flow)

The match creation must be fast. Target: match started in under 60 seconds from this screen.

#### Step 1 — Team Selection
- Two large dropdown/searchable selectors side-by-side
- Label: "Team A (batting first)" and "Team B (fielding first)"
- After toss step, these labels update automatically
- Shows team color, emoji, name, and player count in dropdown option
- Validation: Team A ≠ Team B

#### Step 2 — Match Configuration
| Config | Options |
|--------|---------|
| Overs | Quick buttons: [2] [5] [10] [20] + [Custom] (number input, 1-50) |
| Venue | Text input, optional, 50 char max |
| Tournament | Dropdown showing active tournaments (optional) |
| Max Wickets | Number input, default: all players - 1. Min 1, max 10. |
| Date | Date picker, default: today |

#### Step 3 — Toss
- Large animated coin flip (cosmetic)
- "Who won the toss?" → Team A / Team B buttons
- "They chose to..." → Bat / Field buttons
- Visual: shows which team bats first (in batting team's color)

#### Step 4 — Select Playing XI (Optional but Recommended)
- Shows both team's squads
- Toggle each player in/out for this match
- Reorder batting order via drag handle
- Default: all registered players play
- "Skip this step" button

**Start Match button (bottom, sticky, full-width):**
- Disabled until Step 1-3 are valid
- On tap: creates Match record, creates Innings 1 record, navigates to scoring screen

---

### 6.4 Ball-by-Ball Scoring Engine

**This is the most critical screen. Optimize for speed, accuracy, and zero-friction input.**

#### 6.4.1 Layout Specification (Mobile Portrait, 390px wide)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ← Colony Strikers vs Gali Warriors    ⋯
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 [INNINGS 1 OF 2]        [Overs: 10]

 ┌────────────────────────────────────┐
 │       127 / 3                      │ ← Score (72px, JetBrains Mono)
 │    8.4 Overs | CRR: 8.12          │
 │    Need: 47 in 1.2 ovs | RRR:19.7 │ ← Only in 2nd innings
 └────────────────────────────────────┘

 ┌────────────────────────────────────┐
 │ * Ahmed R      54 (38) SR:142.1   │ ← Striker (asterisk, teal)
 │   Khalid M     12 (10) SR:120.0   │ ← Non-striker
 └────────────────────────────────────┘

 ┌────────────────────────────────────┐
 │   Zain A  |  3-0-28-1  Eco:9.33  │ ← Current bowler
 └────────────────────────────────────┘

 This over:  [4][1][W][0][·][ ]     ← Ball strip (6 slots)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       SCORING BUTTONS (large, 2 rows)
  ┌────────┬────────┬────────┐
  │   0    │   1    │   2    │  ← 96×64px each
  ├────────┼────────┼────────┤
  │   3    │  [4]   │  [6]   │  ← 4 is teal, 6 is orange
  └────────┴────────┴────────┘

  ┌──────────────┬──────────────┐
  │  🔴 WICKET  │  ↕ EXTRA     │  ← Full-width buttons
  └──────────────┴──────────────┘
  
  [↩ UNDO]  ← Small, bottom left. Disabled if no balls recorded.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### 6.4.2 Ball Strip Display

Shows 6 slots for current over. Each slot contains:
- Empty slot: hollow circle outline
- Dot ball (0): filled grey circle
- Run (1-3): circle with number
- Four (4): circle, teal background, "4"
- Six (6): circle, orange background, "6"
- Wicket: circle, red background, "W"
- Wide: small badge "Wd" (orange)
- No Ball: small badge "NB" (yellow)
- Bye: "B+n" label
- Leg Bye: "LB+n" label

#### 6.4.3 Extras Panel (bottom sheet, slides up on "EXTRA" button tap)

```
╔═══════════════════════════════════════╗
║  EXTRAS                               ║
║  ─────────────────────────────────── ║
║  [WIDE +1]  [NO BALL +1]             ║
║  [BYE]      [LEG BYE]               ║
║  ─────────────────────────────────── ║
║  Additional runs (if any):           ║
║  [ 0 ][ 1 ][ 2 ][ 3 ][ 4 ]         ║
║  ─────────────────────────────────── ║
║              [Cancel]                ║
╚═══════════════════════════════════════╝
```

Logic for Extras panel:
- Select type first, then additional runs
- Wide: isLegalDelivery=false, 1 run auto-added, any additional runs (e.g., 4 wides = 5 total)
- No Ball: isLegalDelivery=false, 1 run auto-added, additional runs go to batsman
- Bye: isLegalDelivery=true, runs go to extras (not batsman, not bowler)
- Leg Bye: same as Bye but legByes counter

#### 6.4.4 Wicket Flow

On "WICKET" button press → Wicket Modal opens:

**Step 1 — Dismissal Type:**
Grid of 6 buttons:
- BOWLED (ball → stumps icon)
- CAUGHT (hands icon)
- RUN OUT (running figure icon)
- LBW (leg icon)
- STUMPED (gloves icon)
- HIT WICKET (bat-stumps icon)
- RETIRED HURT (+ icon, rare)

**Step 2 — Conditional fields based on type:**
- CAUGHT: "Caught by?" → dropdown of fielding team players
- STUMPED: "Stumped by?" → dropdown (usually wicketkeeper, but allow any)
- RUN OUT: "Which batsman out?" → Striker / Non-Striker selector + "Who fielded?" optional dropdown
- BOWLED/LBW/HIT WICKET: No additional info needed

**Step 3 — Runs on same delivery:**
- Small input: "Runs scored before/during wicket ball?" (default 0)
- This handles: run out where runs were taken, caught where byes were run, etc.

**Confirmation:** "Confirm Wicket" button → processes ball + opens New Batsman modal

**New Batsman Modal:**
- Title: "[Dismissed Player] is out. Select new batsman:"
- List of available batsmen (not dismissed, not currently batting)
- Sorted by pre-set batting order
- "Did not bat" indicator for players not yet come in
- Last man: show "Last wicket — innings ends after this batsman"
- If no batsmen left: auto-complete innings

#### 6.4.5 Scoring Logic (Canonical)

```
DEFINITIONS:
  batsmanRuns  = runs credited to striker (0 for byes/leg-byes)
  extraRuns    = runs to extras column (1 for wide/NB penalty + any bye/LB runs)
  totalRuns    = batsmanRuns + extraRuns
  isLegal      = delivery counts toward the 6-ball over (NOT wide, NOT no-ball)

BALL RECORDING SEQUENCE:
  1. Insert Ball record (persist immediately)
  2. Update BatsmanInnings (striker):
       balls += (isWide ? 0 : 1)
       runs += batsmanRuns
       fours += (batsmanRuns == 4 ? 1 : 0)
       sixes += (batsmanRuns == 6 ? 1 : 0)
       If isWicket AND dismissedPlayer == striker:
         isOut = true, set dismissalType, bowler, fielder
  3. If RUN_OUT of non-striker: update non-striker BatsmanInnings similarly
  4. Update BowlerInnings (current bowler):
       If isLegal: balls += 1; if balls == 6: completedOvers += 1, balls = 0
       runsAgainstBowler = (isBye || isLegBye) ? 0 : totalRuns
       runs += runsAgainstBowler
       If isWide: wides += 1
       If isNoBall: noBalls += 1
       If isWicket AND wicketType NOT IN [RUN_OUT, RETIRED_HURT]: wickets += 1
  5. Update Innings:
       runs += totalRuns
       wickets += (isWicket ? 1 : 0)
       If isLegal:
         currentBalls += 1
         If currentBalls == 6: completedOvers += 1, currentBalls = 0 (over complete)
       wideBalls += (isWide ? 1 : 0)
       noBalls += (isNoBall ? 1 : 0)
       byes += (isBye ? extraRuns : 0)
       legByes += (isLegBye ? extraRuns : 0)
  6. Strike rotation:
       If isLegal AND batsmanRuns % 2 == 1: swap striker/non-striker
       If isLegal AND currentBalls just became 0 (end of over):
         If batsmanRuns % 2 == 0: swap striker/non-striker
         (If odd: already swapped in step above, non-striker now faces next over ✓)
  7. Check innings completion:
       wickets >= maxWickets → complete
       completedOvers >= totalOvers AND currentBalls == 0 → complete
       inningsNumber == 2 AND runs >= target → complete (chasing team wins)
  8. Return updated state + flags: isOverComplete, needsNewBatsman, needsNewBowler, isInningsComplete

WICKET ON NO-BALL RULE:
  No-ball dismissals allowed: RUN_OUT only
  All other dismissal types are disabled in the wicket modal when isNoBall=true
  Show notice: "No Ball — only Run Out possible"

SPECIAL CASE: Wide + Wicket (Stumped or Run Out only off a wide)
  Implementation: Allow STUMPED and RUN_OUT off a wide. Other types disabled.
```

#### 6.4.6 Undo Last Ball

```
UNDO SEQUENCE:
  1. Fetch last Ball record for this innings (ordered by deliveryNumber DESC)
  2. If no balls: disable undo button
  3. Reverse BatsmanInnings: subtract runs, balls, fours, sixes. If isOut: restore to active.
  4. If non-striker was run out: restore non-striker too.
  5. Reverse BowlerInnings: subtract runs, balls, over adjustments, wickets.
  6. Reverse Innings: subtract totalRuns, wickets. Reverse over/ball counter.
  7. Restore striker/non-striker to the stored pre-ball strikerId/nonStrikerId in Ball record.
  8. If this was the first ball of a new over: undo also restores previous over state.
  9. If this ball prompted a new batsman selection: remove that batsman from BatsmanInnings.
  10. Delete Ball record.
  11. Re-render UI with restored state.
  12. Show toast: "Last ball undone"
```

Note: Store strikerId and nonStrikerId BEFORE the delivery in the Ball record to make undo O(1).

#### 6.4.7 Edit Ball

- Access: long-press any ball in the current over strip, OR "Edit" button in full ball log
- Edit modal: shows ball's recorded values (runs, extras, wicket, batsman, bowler)
- On save: trigger `recalculate(inningsId)` — full recompute of all stats from ball log (O(n) but n is small for gully matches)
- Recalculate function: iterate all Ball records in order, apply scoring logic fresh, overwrite BatsmanInnings, BowlerInnings, Innings totals
- Show loading state during recalculation

#### 6.4.8 Over Complete Modal

Appears after the 6th legal ball of every over.

```
╔══════════════════════════════════╗
║  OVER 8 COMPLETE                 ║
║  ────────────────────────────── ║
║  Zain A: 2-0-14-1               ║
║  This over: 1•W4•1 = 6 runs     ║
║                                  ║
║  SELECT NEXT BOWLER:             ║
║  ┌─────────────┬──────────────┐  ║
║  │ Ali B       │ 0-0-0-0      │  ║
║  │ Hamid K     │ 2-0-18-0     │  ║
║  │ [Zain A]    │ DISABLED     │  ║ ← Can't bowl consecutive overs
║  └─────────────┴──────────────┘  ║
╚══════════════════════════════════╝
```

- Non-dismissable: user must select a bowler to continue
- If only 1 bowler available (small teams), allow same bowler (show warning)

#### 6.4.9 Innings Break Screen

Full screen, replaces scoring UI between innings.

```
INNINGS BREAK
─────────────────────────────────────
Colony Strikers set a target of 128
─────────────────────────────────────
  1st Innings Total:  127/3 (10 ov)
  Top Scorer:         Ahmed R — 54(38)
  Best Bowling:       Zain A — 1/14(3)
─────────────────────────────────────
Gali Warriors need 128 to win
Required Rate: 12.80 per over
─────────────────────────────────────
[ SELECT OPENING BATSMEN ]
[ SELECT OPENING BOWLER  ]

  [ ▶ START 2ND INNINGS  ]
─────────────────────────────────────
```

#### 6.4.10 Match Result Screen

```
╔══════════════════════════════════════╗
║   🏆  COLONY STRIKERS WIN!           ║
║   ──────────────────────────────── ║
║   Won by 23 runs                    ║
║                                      ║
║   1st: Colony Strikers 127/3 (10)   ║
║   2nd: Gali Warriors   104/7 (10)   ║
║                                      ║
║   ⭐ Man of the Match               ║
║   Ahmed R — 54(38), 142 SR          ║
║                                      ║
║   [📤 Share Scorecard]               ║
║   [📋 View Full Scorecard]           ║
║   [🏠 Back to Dashboard]             ║
╚══════════════════════════════════════╝
```

**Result string generation logic:**
- Team 2 wins (chasing): "[Team] won by [10 - wickets_fallen] wickets (and [balls_remaining] balls remaining)"
- Team 1 wins (defending): "[Team] won by [inn1_runs - inn2_runs] runs"
- Tie: "Match tied — both teams scored [N]"
- Man of the Match: highest run scorer OR highest wicket-taker (wickets first if ≥ 3, else runs)

---

### 6.5 Scorecard View

Two rendering contexts: live (polling every 5 seconds) and historical (static).

#### Batting Table

| Batsman | Dismissal Info | R | B | 4s | 6s | SR |
|---------|---------------|---|---|----|----|-----|
| Ahmed R* | not out | 54 | 38 | 5 | 2 | 142.1 |
| Khalid M | c Raza b Zain | 12 | 10 | 1 | 0 | 120.0 |
| Usman K | b Ali | 34 | 20 | 3 | 2 | 170.0 |
| ... | | | | | | |
| Extras | W:3, NB:1, B:0, LB:2 | **6** | | | | |
| **TOTAL** | **(3 wkts, 8.4 ov)** | **127** | | | | |

Batting cells: monospace font for numbers, left-align for names/dismissals.
Not-out batsmen: name in green, asterisk appended.
DNB (did not bat): show in greyed-out row below the table.

#### Bowling Table

| Bowler | O | M | R | W | Econ |
|--------|---|---|---|---|------|
| Zain A | 3 | 0 | 28 | 1 | 9.33 |
| Ali B | 2 | 0 | 18 | 1 | 9.00 |
| Hamid K | 2 | 0 | 24 | 0 | 12.00 |
| Raza M | 1.4 | 0 | 14 | 1 | 8.40 |

Maidens: count overs where 0 runs were scored (no extras, no runs).

#### Fall of Wickets

`12-1 (Usman, 2.3) · 45-2 (Hamid, 5.1) · 89-3 (Tariq, 11.4)`

Format: [team_total_when_wicket]-[wicket_number] ([dismissed_player], [over.ball])

#### Ball-by-Ball Log (Collapsible)

Each over is one collapsible row. Expanded view:

```
Over 1 — Zain A (7 runs, 1 wkt)
  B1: 0  B2: 1  B3: 4  B4: W(Bowled Usman)  B5: .  B6: 2
Over 2 — Ali B (9 runs, 0 wkt)
  B1: 6  B2: 1  B3: Wd  B4: 1  B5: 0  B6: 1
```

---

### 6.6 Match History

#### List View
- Tabs: All | Friendly | Tournament
- Filter chips: by team (multiselect), by date range
- Search input: searches team names
- Sort: Newest first (default), by result, by highest score
- Infinite scroll / pagination (20 per page)
- Empty state: "No matches yet. Start your first match!"

#### Match Card

```
┌─────────────────────────────────────────────┐
│ [CS] Colony Strikers  127/3 (10 ov)        │
│ [GW] Gali Warriors    104/7 (10 ov)        │
│ Colony Strikers won by 23 runs              │
│ 🏆 Ahmed R — 54(38)        📅 Jun 8, 2026  │
└─────────────────────────────────────────────┘
```

---

### 6.7 Tournament Module

#### Create Tournament

**Fields:**
| Field | Detail |
|-------|--------|
| Name | Text, required, e.g., "Colony Premier League" |
| Format | Round Robin (all teams play each other) / Knockout |
| Teams | Multi-select from team list, min 2, max 16 |
| Overs per match | Number input (applies to all matches) |
| Start Date | Date picker |

**Schedule generation (Round Robin):**
Algorithm: `n*(n-1)/2` matches for n teams. Use round-robin scheduling (Berger tables or rotating pair algorithm). Assign dates sequentially starting from tournament start date.

#### Points Table

| # | Team | P | W | L | T | Pts | NRR |
|---|------|---|---|---|---|-----|-----|
| 1 | Colony Strikers | 4 | 3 | 1 | 0 | 6 | +1.250 |
| 2 | Gali Warriors | 4 | 2 | 1 | 1 | 5 | +0.875 |

**Points:** Win=2, Loss=0, Tie=1
**NRR:** `(∑ runs_scored / ∑ overs_faced) - (∑ runs_conceded / ∑ overs_bowled)`
**Tiebreaker:** NRR (highest wins first), then H2H result.
**Over conversion:** 8.4 overs = 8 + 4/6 = 8.667 decimal overs.
**All-out rule:** If a team is all out before their overs, use their FULL ALLOCATED overs in the NRR denominator (standard in most domestic tournaments).

**Highlighted row:** Tournament leader gets gold left border. Qualification zone (top 2 for knockout) gets green background.

#### Tournament Schedule View

Matches grouped by round. Each match shows:
- Teams + date/time
- Status: UPCOMING / LIVE / COMPLETED
- If completed: scores and result
- If upcoming and both teams exist: "Start Match" button (inline)

---

### 6.8 Sharing & Export

#### 6.8.1 Share as Image (html2canvas)

Capture the `#scorecard-export` DOM element:
- Styled card (1200×630px, good for WhatsApp/Instagram)
- Match result headline (large, team colors)
- Both innings batting + bowling tables (condensed)
- Match date, venue, tournament name
- GullyScore branding watermark (bottom right)
- Background: dark gradient
- Export via Web Share API (navigator.share) → fallback to PNG download

#### 6.8.2 Export as Text (WhatsApp Summary)

```
🏏 GullyScore Match Report
📅 8 June 2026 | Colony Maidan

Colony Strikers vs Gali Warriors

🏏 1st Innings: Colony Strikers
Score: 127/3 (10 overs)
Top bat: Ahmed R — 54(38) ⭐
Best bowl: Zain A — 1/14(3)

🏏 2nd Innings: Gali Warriors
Score: 104/7 (10 overs)
Top bat: Bilal M — 38(22)
Best bowl: Ali B — 2/18(2)

🏆 Result: Colony Strikers won by 23 runs
⭐ Player of the Match: Ahmed R

Scored with GullyScore 🏏
```

Copy to clipboard button. Full-width, one tap.

---

### 6.9 Settings

| Setting | Type | Default |
|---------|------|---------|
| Default overs | Number | 10 |
| Theme | Toggle: Dark / Light / System | Dark |
| Max wickets | Number | Squad size - 1 |
| Free hit on no ball | Toggle | ON |
| Consecutive overs rule | Toggle | ON (same bowler can't bowl back-to-back) |
| Export/Import data | Button | — |
| Clear all data | Destructive button | — |

---

## 7. DATA ARCHITECTURE

### 7.1 Prisma Schema (Complete)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Team {
  id        String   @id @default(cuid())
  name      String
  shortName String
  color     String   @default("#00D4AA")
  emoji     String   @default("🏏")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  players         Player[]
  matchesAsTeam1  Match[]          @relation("MatchTeam1")
  matchesAsTeam2  Match[]          @relation("MatchTeam2")
  battingInnings  Innings[]
  tournamentTeams TournamentTeam[]
}

model Player {
  id           String  @id @default(cuid())
  name         String
  teamId       String
  jerseyNumber Int?
  createdAt    DateTime @default(now())

  team           Team             @relation(fields: [teamId], references: [id], onDelete: Cascade)
  battingPerf    BatsmanInnings[]
  bowlingPerf    BowlerInnings[]
  ballsAsBatsman Ball[]           @relation("BallBatsman")
  ballsAsBowler  Ball[]           @relation("BallBowler")
}

model Match {
  id             String        @id @default(cuid())
  team1Id        String
  team2Id        String
  totalOvers     Int
  maxWickets     Int           @default(10)
  status         MatchStatus   @default(UPCOMING)
  tossWinnerId   String?
  tossDecision   TossDecision?
  currentInnings Int           @default(1)
  result         String?
  winnerId       String?
  venue          String?
  tournamentId   String?
  createdAt      DateTime      @default(now())
  completedAt    DateTime?

  team1      Team        @relation("MatchTeam1", fields: [team1Id], references: [id])
  team2      Team        @relation("MatchTeam2", fields: [team2Id], references: [id])
  innings    Innings[]
  tournament Tournament? @relation(fields: [tournamentId], references: [id])
}

enum MatchStatus {
  UPCOMING
  TOSS
  LIVE
  INNINGS_BREAK
  COMPLETED
  ABANDONED
}

enum TossDecision {
  BAT
  FIELD
}

model Innings {
  id             String  @id @default(cuid())
  matchId        String
  teamId         String
  inningsNumber  Int
  runs           Int     @default(0)
  wickets        Int     @default(0)
  completedOvers Int     @default(0)
  currentBalls   Int     @default(0)
  wideBalls      Int     @default(0)
  noBalls        Int     @default(0)
  byes           Int     @default(0)
  legByes        Int     @default(0)
  target         Int?
  strikerId      String?
  nonStrikerId   String?
  currentBowlerId String?
  isCompleted    Boolean @default(false)

  match      Match          @relation(fields: [matchId], references: [id], onDelete: Cascade)
  team       Team           @relation(fields: [teamId], references: [id])
  balls      Ball[]
  batting    BatsmanInnings[]
  bowling    BowlerInnings[]
}

model Ball {
  id               String      @id @default(cuid())
  inningsId        String
  overNumber       Int
  ballInOver       Int
  deliveryNumber   Int
  batsmanId        String
  bowlerId         String
  runs             Int         @default(0)
  isWicket         Boolean     @default(false)
  wicketType       WicketType?
  dismissedPlayerId String?
  fielderPlayerId  String?
  extraType        ExtraType?
  extraRuns        Int         @default(0)
  isLegalDelivery  Boolean     @default(true)
  strikerIdBefore  String
  nonStrikerIdBefore String
  timestamp        DateTime    @default(now())

  innings  Innings @relation(fields: [inningsId], references: [id], onDelete: Cascade)
  batsman  Player  @relation("BallBatsman", fields: [batsmanId], references: [id])
  bowler   Player  @relation("BallBowler", fields: [bowlerId], references: [id])
}

enum WicketType {
  BOWLED
  CAUGHT
  RUN_OUT
  LBW
  STUMPED
  HIT_WICKET
  RETIRED_HURT
}

enum ExtraType {
  WIDE
  NO_BALL
  BYE
  LEG_BYE
}

model BatsmanInnings {
  id              String      @id @default(cuid())
  inningsId       String
  playerId        String
  runs            Int         @default(0)
  balls           Int         @default(0)
  fours           Int         @default(0)
  sixes           Int         @default(0)
  isOut           Boolean     @default(false)
  dismissalType   WicketType?
  dismissedByBowlerId String?
  fielderPlayerId String?
  battingOrder    Int         @default(99)

  innings Innings @relation(fields: [inningsId], references: [id], onDelete: Cascade)
  player  Player  @relation(fields: [playerId], references: [id])

  @@unique([inningsId, playerId])
}

model BowlerInnings {
  id             String @id @default(cuid())
  inningsId      String
  playerId       String
  completedOvers Int    @default(0)
  balls          Int    @default(0)
  runs           Int    @default(0)
  wickets        Int    @default(0)
  wides          Int    @default(0)
  noBalls        Int    @default(0)

  innings Innings @relation(fields: [inningsId], references: [id], onDelete: Cascade)
  player  Player  @relation(fields: [playerId], references: [id])

  @@unique([inningsId, playerId])
}

model Tournament {
  id         String           @id @default(cuid())
  name       String
  format     TournamentFormat @default(ROUND_ROBIN)
  totalOvers Int              @default(10)
  status     TournamentStatus @default(UPCOMING)
  createdAt  DateTime         @default(now())

  teams   TournamentTeam[]
  matches Match[]
}

enum TournamentFormat {
  ROUND_ROBIN
  KNOCKOUT
}

enum TournamentStatus {
  UPCOMING
  ONGOING
  COMPLETED
}

model TournamentTeam {
  id           String @id @default(cuid())
  tournamentId String
  teamId       String
  played       Int    @default(0)
  won          Int    @default(0)
  lost         Int    @default(0)
  tied         Int    @default(0)
  points       Int    @default(0)
  runsScored   Int    @default(0)
  runsConceded Int    @default(0)
  oversFaced   Float  @default(0.0)
  oversBowled  Float  @default(0.0)
  nrr          Float  @default(0.0)

  tournament Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  team       Team       @relation(fields: [teamId], references: [id])

  @@unique([tournamentId, teamId])
}
```

---

## 8. API SPECIFICATION

### Base: `/api`

| Method | Route | Purpose |
|--------|-------|---------|
| GET | /teams | List all teams |
| POST | /teams | Create team |
| GET | /teams/[id] | Team detail with career stats |
| PUT | /teams/[id] | Update team |
| DELETE | /teams/[id] | Delete team |
| POST | /teams/[id]/players | Add player |
| PUT | /teams/[id]/players/[pid] | Update player |
| DELETE | /teams/[id]/players/[pid] | Remove player |
| GET | /matches | List matches (?status=&teamId=&tournamentId=) |
| POST | /matches | Create match |
| GET | /matches/[id] | Match state (full) |
| PATCH | /matches/[id] | Update status/toss/complete |
| GET | /matches/[id]/scorecard | Full scorecard data |
| POST | /matches/[id]/innings/[iid]/balls | **Record a ball** |
| DELETE | /matches/[id]/innings/[iid]/balls/last | **Undo last ball** |
| PATCH | /matches/[id]/innings/[iid]/balls/[bid] | Edit a ball |
| POST | /matches/[id]/innings/[iid]/complete | Complete innings |
| POST | /matches/[id]/complete | Complete match |
| POST | /matches/[id]/innings/[iid]/set-striker | Update striker |
| POST | /matches/[id]/innings/[iid]/set-bowler | Set current bowler |
| GET | /tournaments | List tournaments |
| POST | /tournaments | Create tournament |
| GET | /tournaments/[id] | Tournament detail |
| GET | /tournaments/[id]/points-table | Points table |
| GET | /tournaments/[id]/schedule | Full schedule |
| POST | /tournaments/[id]/generate-schedule | Create round robin schedule |

### Critical Endpoint Shapes

**POST /api/matches/[id]/innings/[iid]/balls**
```typescript
// Request body
{
  batsmanId: string;       // striker player ID
  bowlerId: string;        // current bowler player ID
  runs: number;            // runs off bat (0 for byes/leg-byes)
  isWicket: boolean;
  wicketType?: WicketType | null;
  dismissedPlayerId?: string | null;
  fielderPlayerId?: string | null;
  extraType?: ExtraType | null;
  extraRuns: number;       // 1 for wide/NB penalty + bye/LB runs
}

// Response
{
  ball: Ball;
  inningsState: {
    runs: number;
    wickets: number;
    completedOvers: number;
    currentBalls: number;
    currentRunRate: number;
    requiredRunRate: number | null;
    runsNeeded: number | null;
    ballsRemaining: number | null;
    isCompleted: boolean;
    isOverComplete: boolean;
  };
  strikerUpdate: {
    strikerId: string;
    nonStrikerId: string;
  };
  needsNewBatsman: boolean;
  needsNewBowler: boolean;
  needsInningsBreak: boolean;
  isMatchComplete: boolean;
}
```

---

## 9. UI/UX DESIGN SYSTEM

### 9.1 Color Tokens (CSS Variables)

```css
/* globals.css — Dark Mode (default) */
:root {
  /* Backgrounds */
  --bg-app:          #070710;
  --bg-card:         #111120;
  --bg-elevated:     #1A1A2E;
  --bg-input:        #1E1E30;
  --bg-glass:        rgba(255,255,255,0.035);

  /* Brand */
  --accent:          #00D4AA;
  --accent-dim:      rgba(0,212,170,0.15);
  --gold:            #FFD700;
  --gold-dim:        rgba(255,215,0,0.15);

  /* Scoring */
  --run-4:           #4ECDC4;
  --run-4-bg:        rgba(78,205,196,0.12);
  --run-6:           #FF6B35;
  --run-6-bg:        rgba(255,107,53,0.12);
  --wicket:          #FF4444;
  --wicket-bg:       rgba(255,68,68,0.12);
  --dot:             #4A5568;
  --dot-bg:          rgba(74,85,104,0.20);

  /* Text */
  --text-primary:    #F0F0F5;
  --text-secondary:  #9090A8;
  --text-muted:      #4A4A62;

  /* Borders */
  --border:          rgba(255,255,255,0.07);
  --border-active:   rgba(0,212,170,0.35);

  /* Feedback */
  --success:         #22C55E;
  --warning:         #F59E0B;
  --error:           #EF4444;

  /* Shadows */
  --shadow-card:     0 4px 24px rgba(0,0,0,0.6);
  --shadow-glow:     0 0 24px rgba(0,212,170,0.25);
  --shadow-red:      0 0 24px rgba(255,68,68,0.3);
}

/* Light mode override */
[data-theme="light"] {
  --bg-app:       #F2F4F8;
  --bg-card:      #FFFFFF;
  --bg-elevated:  #FFFFFF;
  --bg-input:     #F0F2F6;
  --text-primary: #0A0A1A;
  --text-secondary: #4A5568;
  --text-muted:   #9CA3AF;
  --border:       rgba(0,0,0,0.08);
}
```

### 9.2 Typography Scale

```css
/* Font loading in layout.tsx */
Inter: weights 400, 500, 600, 700
JetBrains Mono: weights 400, 700 (for all score numbers)

.score-hero      { font: 700 72px/1 'JetBrains Mono'; }   /* Main score */
.score-sub       { font: 600 20px/1 'JetBrains Mono'; }   /* Overs, CRR */
.h1              { font: 700 28px/1.2 Inter; }
.h2              { font: 700 22px/1.3 Inter; }
.h3              { font: 600 18px/1.4 Inter; }
.body-lg         { font: 400 16px/1.5 Inter; }
.body-sm         { font: 400 14px/1.5 Inter; }
.label           { font: 600 12px/1 Inter; letter-spacing: 0.08em; text-transform: uppercase; }
.stat-number     { font: 700 24px/1 'JetBrains Mono'; }
.table-mono      { font: 400 13px/1 'JetBrains Mono'; }
```

### 9.3 Component Specifications

**Score Button (Scoring Screen):**
- Minimum size: 88px × 60px (comfortable thumb target)
- Border radius: 16px
- Font: 26px bold, JetBrains Mono
- Tap animation: scale(0.92) on press → scale(1.04) → scale(1.0) via spring
- State: disabled (while API call in flight — prevent double-tap)
- Colors per run value:
  - 0: bg-input, text-muted, no border
  - 1,2,3: bg-glass, text-primary, border
  - 4: run-4-bg, run-4 text, run-4 border 40%
  - 6: run-6-bg, run-6 text, run-6 border 40%
  - WICKET: wicket-bg, wicket text, wicket border, subtle pulsing ring

**Team Color Swatch:**
- 32×32px circle with team color
- Used in: team cards, match cards, scorecard headers
- Drop shadow in that color at 30% opacity

**Live Badge:**
- Pulsing green dot + "LIVE" text
- Animation: dot pulses every 2s (scale 1→1.5→1, opacity 1→0.5→1)

**Bottom Navigation:**
- Height: 64px + safe-area-inset-bottom
- 4 tabs: Home 🏠, Matches 📊, Teams 👥, Tournaments 🏆
- Active: tab text + icon in accent color, 2px teal bar on top
- Inactive: text-muted
- Backdrop blur + semi-transparent bg on scroll

### 9.4 Animation Specifications

| Event | Animation | Duration | Library |
|-------|-----------|----------|---------|
| Page transition | Slide up (from 20px below) + fade | 220ms ease-out | Framer Motion |
| Score update | Number flip (scale Y 0→1) | 300ms spring | Framer Motion |
| 6 scored | Gold shimmer + score pulse | 500ms | Framer Motion |
| 4 scored | Teal flash on score | 300ms | Framer Motion |
| WICKET | Shake (keyframe) + red flash | 400ms | Framer Motion |
| Over complete | Brief confetti burst (CSS) | 800ms | Pure CSS |
| Undo | Score ticks backward | 200ms | Framer Motion |
| Modal slide up | Spring, translateY 100%→0 | 350ms | Framer Motion |
| Button press | scale 0.94 | 100ms | Framer Motion |

Honor `prefers-reduced-motion`: skip all non-essential animations if set.

### 9.5 Scoring Screen State Machine

```
STATES:
  SETUP_OPENER_1      → Modal: Select striker
  SETUP_OPENER_2      → Modal: Select non-striker
  SETUP_OPENING_BOWLER → Modal: Select bowler
  SCORING             → Main scoring UI
  PROCESSING          → Buttons disabled, spinner (while API responds)
  WICKET_MODAL        → Dismissal type + fielder selection
  NEW_BATSMAN         → Select next batsman
  OVER_COMPLETE       → Over summary + new bowler selection
  INNINGS_BREAK       → Innings break screen
  MATCH_RESULT        → Result screen

TRANSITIONS:
  SETUP_OPENER_1 → SETUP_OPENER_2 (player selected)
  SETUP_OPENER_2 → SETUP_OPENING_BOWLER (player selected)
  SETUP_OPENING_BOWLER → SCORING (bowler selected)
  SCORING → PROCESSING (button tapped)
  PROCESSING → SCORING (normal delivery)
  PROCESSING → WICKET_MODAL (wicket flagged)
  PROCESSING → OVER_COMPLETE (isOverComplete=true)
  WICKET_MODAL → NEW_BATSMAN (dismissal confirmed)
  NEW_BATSMAN → SCORING (new batsman selected)
  NEW_BATSMAN → OVER_COMPLETE (if over also complete)
  OVER_COMPLETE → SCORING (new bowler selected)
  PROCESSING → INNINGS_BREAK (isInningsComplete=true, innings 1)
  INNINGS_BREAK → SETUP_OPENER_1 (start 2nd innings)
  PROCESSING → MATCH_RESULT (isMatchComplete=true)
```

---

## 10. SAMPLE DATA SPECIFICATION

Seed with `prisma/seed.ts`. All data must be realistic and complete.

### Teams (6)

| Name | Short | Color | Emoji | Players |
|------|-------|-------|-------|---------|
| Colony Strikers | CS | #EF4444 | 🔥 | Rahul, Vikas, Deepak, Sanjay, Ravi, Mohit, Ajay, Pradeep, Suresh, Karan, Dev |
| Gali Warriors | GW | #3B82F6 | ⚡ | Ahmed, Bilal, Usman, Zain, Raza, Khalid, Ali, Tariq, Hamid, Waseem, Fawad |
| Roof Rockets | RR | #F97316 | 🚀 | Rohit, Hardik, Jasprit, KL, Rishabh, Shubman, Axar, Kuldeep, Jadeja, Bumrah, Siraj |
| Midnight Snipers | MS | #8B5CF6 | 🌙 | Imran, Babar, Fakhar, Azam, Hasan, Shaheen, Naseem, Mohammad, Shadab, Iftikhar, Sarfaraz |
| Dusty Dynamos | DD | #EAB308 | 💎 | Yusuf, Irfan, Zaheer, Harbhajan, Sreesanth, Ashish, Munaf, RP, VVS, Dravid, Saurav |
| Alley Aces | AA | #10B981 | 🦅 | Shoaib, Waqar, Wasim, Inzamam, Yousuf, Saeed, Misbah, Younis, Razzaq, Afridi, Amir |

### Completed Matches (3 — fully seeded with ball-by-ball data)

**Match 1:** Colony Strikers vs Gali Warriors, 10 overs
- Innings 1 (CS): 127/3 in 10 overs
  - Rahul: 54(38), Vikas: 34(22), Deepak: 23(18), Sanjay: 12*(9)
  - Bowling: Ahmed 2/28, Bilal 1/24, Usman 0/18, Zain 0/21, Raza 0/23 (extras 13)
- Innings 2 (GW): 104/7 in 10 overs
  - Ahmed: 38(22), Bilal: 28(20), Usman: 18(15), Zain: 12(8)
  - Bowling: Rahul 3/18, Vikas 2/22, Deepak 1/24, Sanjay 1/19
- Result: Colony Strikers won by 23 runs
- 50 balls seeded for each innings with realistic run distributions

**Match 2:** Roof Rockets vs Midnight Snipers, 5 overs
- RR: 78/2 in 5 overs, MS: 56/5 in 5 overs. RR won by 22 runs.

**Match 3:** Dusty Dynamos vs Alley Aces, 10 overs
- DD: 95/8 in 10 overs, AA: 97/4 in 9.3 overs. AA won by 6 wickets.

### Live Match (1)

Colony Strikers vs Roof Rockets, 10 overs
- Status: LIVE
- Innings 1 mid-match: CS at 67/2 in 5.3 overs
- Ahmed: 34*(22), Khalid: 12*(8) batting
- Current bowler: Rohit, 2nd over

### Tournament (1 — Colony Premier League)

Round Robin, 4 teams (CS, GW, RR, MS), 10 overs each
- 3 completed matches: CS beat GW, RR beat MS, CS beat MS
- 3 upcoming: GW vs RR, CS vs RR, GW vs MS
- Points: CS 4pts (+1.25 NRR), RR 2pts (+0.8), GW 0pts (-0.5), MS 0pts (-1.55)

---

## 11. NON-FUNCTIONAL REQUIREMENTS

### Performance
- FCP (First Contentful Paint): < 1.5s on 4G
- Ball recording end-to-end (tap → UI update): < 300ms (target < 150ms)
- Optimistic updates: UI updates immediately, API call in background
- Bundle: JS < 250KB gzipped

### Persistence
- Every ball: persisted to SQLite immediately
- No data loss on tab close, refresh, or navigation
- Zustand store synced with DB on each operation

### Accessibility
- All tap targets: minimum 48×48px
- Never color as sole indicator (always paired with icon/text)
- Dark mode WCAG AA contrast minimum
- Screen reader labels on all action buttons

### Mobile
- Designed for 390px wide (iPhone 14) as canonical viewport
- No horizontal scroll at any breakpoint
- Bottom navigation bar safe for one-handed use
- Thumb reach zone: all scoring buttons in lower 60% of screen

---

## 12. OUT OF SCOPE — VERSION 1

- Real-time multiplayer (two people scoring same match)
- User auth / cloud accounts
- Public shareable URLs
- Video/photo attachments
- DLS (Duckworth-Lewis) calculations
- Super overs
- Fantasy cricket integration
- Notifications
- Multiple languages
- White-label / multi-org mode
