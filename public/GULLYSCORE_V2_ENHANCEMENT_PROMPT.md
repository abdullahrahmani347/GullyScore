# GullyScore v2 — "Championship Edition" Master Enhancement Prompt

> **Companion to the v1 Master Build Prompt (§1–§10).** v1 is already implemented and deployed — including device-level data isolation (`X-Device-Id` on all routes), standalone-output deployment hardening, the CSS/SVG stadium landing page, light/dark theming, the partnership system, achievements, and the custom GullyIcons/Logo brand set. This prompt upgrades the **existing codebase in place**. Section numbering continues from v1 so the two documents form one contract. Everything below is **additive**: no removals, no renames, no breaking route or schema changes. Ship in the three phases defined in §24; a feature counts as done only when it passes its Acceptance Criteria (AC) and the Definition of Done (§11.3).

---

## §11 Ground Rules for v2

### 11.1 Additive-only
- New Prisma fields must be nullable or carry defaults; `bun run db:push` on the live v1 database must never lose data. Never drop a column, enum value, or route in v2.
- If a v2 rule changes a v1 computed value (§12.11 correctness fixes), the change ships with a test that documents old-vs-new output, and the fix is listed in the release notes.

### 11.2 Pure-engine doctrine
All cricket rules live in one pure, React-free TypeScript module — formalize the existing `src/lib/scoring-engine.ts` + `src/lib/recalculate.ts` pair into `src/lib/engine.ts` with this shape:

```ts
type BallEvent = Ball & { deletedAt?: string | null; version?: number }
type InningsState = { runs, wickets, legalBalls, batting: Record<playerId, BatsmanStat>,
                      bowling: Record<playerId, BowlerStat>, fow: FowEntry[],
                      partnerships: PartnershipState[], strikerId, nonStrikerId, nextBallContext }
fold(events: BallEvent[], rules: MatchRules): InningsState   // deterministic, pure
validateNext(state, rules, proposed: BallEvent): Result<BallEvent, EngineError>
```

UI, API routes, the offline sync engine, and the test suite all import this single source of truth. `recalculate.ts` becomes a thin DB writer around `fold()`. Before any v2 rule lands, the engine suite must first reproduce current v1 behavior on golden fixtures (§23.2).

### 11.3 Definition of Done (per feature)
Engine rule + UI + API + unit/property tests + a11y check (§21) + route JS budget respected (§23.5) + feature flag wired (§11.4). A feature failing any item is not merged, even if it "works".

### 11.4 Feature flags
`/api/buildinfo` (already exists) returns `features: { push, reactions, voice, dls, embed, aiReport }`. Client gates UI; server gates routes (flag off → route returns 404). Hardened features default ON; experimental (voice, aiReport) default OFF. Flags are env-overridable (`FEATURES=`) for local dev.

### 11.5 Existing assets this prompt builds on
| Already in repo | v2 uses it for |
|---|---|
| `src/lib/scoring-engine.ts`, `recalculate.ts` | folded into pure `engine.ts` (§12.7) |
| `Ball.deliveryNumber`, `strikerIdBefore`, `nonStrikerIdBefore`, `isLegalDelivery`, `timestamp` | undo/edit + free hit + wagon wheel (§12.1, §12.7, §13.2) |
| `BatsmanInnings`/`BowlerInnings`/`Partnership` denormalized tables | stay; recomputed from `fold()` after every write |
| `src/lib/device.ts`, `api-auth.ts` (X-Device-Id everywhere) | keeps v2 auth model; adds transfer/backup codes (§19.4) |
| `src/lib/achievements.ts`, `AchievementCelebration.tsx`, `haptics.ts` | celebration + sound layer (§14.1, §14.6) |
| `sharp`, `html2canvas`, `qrcode` (installed) | OG share cards + story cards (§15.3) |
| `next-intl`, `@dnd-kit` (installed) | localization (§22), XI drag-reorder (§14.8) |
| `src/lib/live-emitter.ts` + SSE stream route | SSE v2 event registry + replay (§15.7) |
| `src/lib/match-story.ts` | template fallback for AI match report (§13.10) |
| `public/sw.js`, `src/lib/offline/*` (Dexie queue) | Background Sync, locks, idempotency (§16) |
| Light/dark `ThemeProvider` | both themes stay; v2 hardens tokens for both (§14.0) |

### 11.6 Standing guardrails
- **Offline guarantee extends**: every new mutation path declares its offline behavior — score-affecting mutations queue-first in Dexie; cosmetic ones (reactions) drop silently.
- **Silent updates preserved**: no "update available" UI ever (v1 §7.7).
- **Single scorer per match** stays the model (§16.2 adds a lock so two tabs can't fight).
- **Budgets**: scoring route ≤ 200 KB first-load JS gz; live route ≤ 150 KB; SSE ball event ≤ 1.5 KB; LCP ≤ 2.5 s on mid-tier Android (§23.5).

---

## §12 Advanced Cricket Engine v2 (extends v1 §6)

### 12.1 Free-hit state machine
- Trigger: any no-ball when `rules.freeHitOnNoBall` (default `true`).
- The delivery immediately following a no-ball is flagged `isFreeHit`. If that delivery is itself a wide or no-ball, the free hit **persists** to the next delivery. A free hit ends only when a legal delivery completes.
- Dismissal legality on a free hit: only RUN_OUT and OBSTRUCTING_FIELD (§12.6). Attempting a bowler-credited dismissal returns `EngineError("FREE_HIT_NO_DISMISSAL")` — blocked client-side in WicketModal (caught/lbw/etc. disabled with hint "Free hit — not out") and enforced again server-side.
- UI: amber `FREE HIT` pill beside the over counter in ScoreDisplay; amber ring on the OverStrip chip; commentary prefixed `[FH]`.
- Data: `Ball.causedFreeHit Boolean @default(false)`, `Ball.isFreeHit Boolean @default(false)`.
- **AC**: table-driven test with ≥ 12 transition cases (NB→FH hit; NB→FH wide→FH persists; NB→FH NB→FH persists; FH legal ends FH; run-out allowed on FH; caught on FH rejected). E2E: tap NB, tap 4 → FH chip appears then disappears after the legal ball.

### 12.2 Powerplay phases
- `rules.powerplayOvers`: default `max(1, round(totalOvers × 0.3))`, applies only when `totalOvers ≥ 5`.
- Phase is derived from over number (no new storage). Scorecard summary gains PP vs non-PP split (runs, wickets, RR, boundaries); ScoreDisplay shows a `PP` badge and OverStrip headers get a gold tint while active.
- **AC**: PP + non-PP splits reconcile exactly with innings totals for a golden fixture.

### 12.3 Gully-DLS interruption management
- New organizer action "Reduce overs" (match settings sheet): pick new total overs + reason → engine recomputes the chase target.
- Method: DLS **Standard Edition** resource-percentage method — `target = floor(runsFirst × R2 / R1) + 1`, with a static 10-wicket × overs resource table (`src/lib/dls-table.json`, linearly scaled from the published 50-over table to the match's `totalOvers`; the scaling is documented as an approximation). Flag `dls` off or table missing → fallback `floor(runs × ballsRemaining2 / ballsTotal1) + 1` labeled "approx".
- Reduce-only (no mid-match increases). Every adjustment appends to `Match.adjustments` (audit log: `{at, from, to, reason, method, newTarget}`); live page shows a "Target adjusted: 87 (DLS)" banner; manual override allowed with organizer PIN (§19.4).
- **AC**: fixture asserts the exact recomputed target for a 20→15-over interruption with 0 wickets down; a second interruption recomputes from the **full log**, never incrementally.

### 12.4 Retired hurt & return
- `RETIRED_HURT` stays not-out in `BatsmanInnings` (`isOut: false`) and the batter remains in the eligible list with an "RH" badge.
- Return paths: overflow menu on BatsmenCard ("Return retired batter", any dead ball) and the new-batter sheet after a later wicket. Returning batter **resumes existing stats** (same `BatsmanInnings` row).
- **AC**: batter retires on 23 (14), returns, scores 10 more → 33 (…) shown as not out; partnership logic treats return as a new stand.

### 12.5 Penalty runs
- ScoreButtons overflow → "Penalty +5" with side picker (batting/bowling) and optional reason text.
- Five runs to the non-offending team, credited to team extras — **not** to any batter or bowler; consumes no ball; logged as a Ball row with `extraType: PENALTY`, `extraRuns: 5`.
- Extras breakdown gains a "pen" row; commentary includes the reason.
- **AC**: penalty +5 to batting side → total +5, no over progress, batter/bowler tables unchanged.

### 12.6 Dismissal expansion
- Run-out target selector defaults to striker but can select the **non-striker** ("mankad" is a labeled run-out subtype). Modal asks "runs completed before dismissal: 0/1/2"; engine applies runs, then normal odd-run strike logic.
- New `WicketType` value `OBSTRUCTING_FIELD` (wicket, no bowler credit).
- Wicket-on-extras truth table (engine-enforced): run out on a wide → wide stands (+1), wicket recorded, no legal ball, **not** re-bowled; catch on a no-ball → blocked with hint "No-ball — not out" (run out still allowed).
- **AC**: each dismissal type tested for bowler credit, legal-ball count, and re-bowl behavior; mankad leaves the non-striker slot to be filled.

### 12.7 Event-sourced undo, redo, and ball editing
- Innings state = deterministic `fold()` over ordered, non-deleted Ball events. This formalizes what `recalculate.ts` already does — one code path for scoring, syncing, undo, and edit.
- **Undo** (scorer): soft-deletes the last non-deleted event (`deletedAt`), recomputes, broadcasts SSE `state`. Works offline (same local event list; tombstone syncs later). Undo history = 1 tap per event; long-press shows a count and "undo to over start" shortcut.
- **Edit**: long-press any OverStrip chip or CommentaryTicker row → Ball Editor sheet (runs, extras, wicket type, dismissed player, fielder, wagon direction). Save → server re-validates the **entire sequence** with `fold()` (e.g., removing the no-ball that caused a free hit), bumps `Ball.version`, writes a `MatchEditLog` row, rebroadcasts.
- Guard rails: edits allowed while `status IN (LIVE, INNINGS_BREAK)`; editing a COMPLETED match requires the organizer PIN and flips it back to LIVE under an "edited" banner until re-completed.
- Idempotency: every event carries `clientEventId` (UUID, unique index) — replayed queue items are deduped server-side, never double-counted.
- **AC**: property test — random 300-event sequences with 50 random undos must equal the brute-force state; E2E — undo works offline and the tombstone syncs on reconnect.

### 12.8 Over variants & bowler substitution
- `rules.ballsPerOver` (6 default, 8 option) — all over math uses this value.
- Bowler mid-over injury: BatsmenCard/BowlerCard overflow → "Replace bowler" — a new bowler finishes the over; both get true partial figures; OverStrip marks the split with a divider chip.
- **AC**: 8-ball-over math correct end-to-end; injury split produces correct two-row bowling figures that sum to the over.

### 12.9 Rich extras entry
- Wide: after tap, quick additional-runs prompt (0–4, default 0). No-ball: prompt for runs off bat (0–6) + wicket allowed only as run out. Byes/leg-byes: 1–4 chooser. Prompts are large-target sheets, one extra tap maximum, remembered last choice per session.
- **AC**: NB + 4 → 5 runs total, no legal ball, strike unchanged; wide + 2 additional → 3 runs, re-bowl.

### 12.10 Per-match rules JSON
`Match.rules` (nullable JSON, defaults below) — surfaced in a "House rules" sheet at match creation:

| key | default | meaning |
|---|---|---|
| `freeHitOnNoBall` | `true` | free-hit state machine on |
| `ballsPerOver` | `6` | 8-ball-over option |
| `powerplayOvers` | auto 30% | PP overs count |
| `lastManStands` | `false` | at 9 down (10-wicket match) innings continues while ≥ 1 not-out batter; odd runs don't swap (no partner); ends when last batter dismissed or overs exhausted |
| `wideLimitAdditional` | `4` | cap additional wide runs in UI |
| `wagonCapture` | `"boundaries"` | `off \| boundaries \| all` |
| `pitchMapCapture` | `false` | optional length/line capture (§13.3) |
| `guestPlayersAllowed` | `2` | per-match XI guests (§17.7) |

### 12.11 Cricket correctness fixes (ship as flagged fixes, tests document old→new)
1. **Bowler analysis**: byes/leg-byes no longer count against the bowler's runs or maidens (bowler charged = runs off bat + wide/no-ball penalties). Economy excludes byes/leg-byes.
2. **Balls faced** counts all deliveries except **wides** (no-balls count, per official scoring) — v1 counted legal balls only.
3. **Maiden** = over with zero bowler-conceded runs (byes/leg-byes permitted), matching fix 1.
4. **Last-ball strike parity**: model run-parity swap and end-of-over swap as two explicit swaps — a single off the last ball leaves the scorer **on strike** for the next over (two swaps cancel). Property test asserts the truth table.

### 12.12 Engine invariants v2 (extend v1 §6 list; all property-tested)
12. No bowler-credited dismissal on a free hit. 13. Penalties consume no ball. 14. Determinism: identical event lists always fold to identical state. 15. `undo × n` = state before those n events. 16. `clientEventId` dedupe: replays never alter state. 17. DLS targets always recomputed from the full adjustments log. 18. Wicket-on-wide: wide stands, no legal ball, no re-bowl. 19. Strike = XOR of delivery-parity swap and over-end swap (§12.11.4). 20. Retired-return preserves batter aggregate continuity. 21. 8-ball overs: every over boundary at `ballsPerOver` legal balls.

---

## §13 Analytics & Intelligence v2 (extends v1 §7.6, all in `lib/intelligence.ts` unless noted)

### 13.1 Win probability
Chase: `margin = clamp((currRR − reqRR) / max(reqRR, 1), −2, 2)`, `WH = wicketsInHand / maxWickets`, `WP = clamp(sigmoid(1.8·margin + 2.2·(WH − 0.5)), 0.02, 0.98)`. 1st innings: 50% ± wickets-in-hand/run-rate-vs-par heuristic. Broadcast on SSE as `wp` per ball; rendered as a live line on the spectator page and a small meter on the scoring screen. Constants live in a tunable `STAT_WEIGHTS` object (v1 §10 seam).

### 13.2 Wagon wheel
Optional 8-sector compass (V, mid-wicket, square leg, fine leg, third man, point, cover, mid-off) appearing per `rules.wagonCapture`; mirrored display for left-handers. Polar SVG per batter + innings-wide; stored as `Ball.wagonDirection`. Entry is post-boundary, ≤ 1 tap, skippable with "don't ask again".

### 13.3 Pitch map (optional)
`Ball.pitchLength` (yorker/full/good/short/bouncer) + `Ball.pitchLine` (wide-off/off/stumps/middle/leg) via a 2-tap capture sheet when `rules.pitchMapCapture`; per-bowler heatmap grid + length-line distribution bars.

### 13.4 Batter × bowler matchup matrix
Runs / balls / dots / dismissals grid per match, aggregatable per season — computed from Ball rows (`batsmanId` × `bowlerId`), surfaced on scorecard and player pages.

### 13.5 MVP index (exact, weights in `STAT_WEIGHTS`)
`MVP = runs·1 + fours·2 + sixes·3 + wickets·20 + maidens·10 + dots·1 + catches·12 + runouts·15 + stumpings·12 − max(0, econ − 7)·4` (economy penalty only for ≥ 2 overs bowled). Per-match MVP card + season/tournament leaderboard.

### 13.6 Player career pages — `/players/[id]`
Aggregates across matches (runs, HS, avg, SR, wickets, best, econ, catches), per-innings run worm (Recharts), milestones list, matchup table. API: `/api/players/[id]`.

### 13.7 Form guides
Last-5-innings chips per player (e.g. `34, 12*, 0, 78, 9`) on team detail + player pages; W/Q form strip for teams (last 5 results).

### 13.8 Partnership analytics
Builds on the `Partnership` model: per-wicket stand graph, biggest/fastest stands, average stand per wicket number, run-rate per partnership — scorecard tab.

### 13.9 Turning-point detection
Overs where WP swung > 15% become "moments" (e.g., "15th over: 2 wickets, WP 68%→31%"). Feeds the live "Catch me up" (§15.5) and the match report (§13.10).

### 13.10 AI match report (flag `aiReport`, default OFF)
On completion, `/api/matches/[id]/report` calls the LLM via `z-ai-web-dev-sdk` with a structured prompt built from the folded scorecard + turning points; output is cached on the match (`Match.reportJson`) and rendered as a shareable article page. `match-story.ts` template remains the always-available fallback; UI labels which generator produced the text. Never blocks completion; generates async with a toast when ready.

---

## §14 Scoring UX v2 (extends v1 §7.1)

### 14.0 Design tokens (both themes)
Add: `--free-hit #FFB300`, `--pp-gold`, `--danger #FF4D6A`, `--warn #FFC24B`, team-tint (batting team color at 20% mix, contrast-guarded). All tokens get light-theme values too — light mode now exists in the app and every v2 surface must honor it.

### 14.1 Feel: haptics, sound, speech
Extend `haptics.ts` into a `Feedback` layer: vibrate patterns (run 10 ms · four 20-40-20 · six 30-50-30-50 · wicket 80-60-80 · milestone 20-20-20-80); WebAudio synth blips (zero audio assets); optional TTS commentary via `speechSynthesis` — all individually toggleable in Settings, default off except basic run tap.

### 14.2 Landscape Pro Mode
Orientation-driven two-thumb layout: runs grid (0-6) under the right thumb at 64 px targets, extras/wicket cluster under the left, header compressed to a single score strip. Persisted override in settings.

### 14.3 Ball Editor
Long-press any chip or commentary row → vaul bottom sheet with all editable fields (§12.7). Edited chips carry a small pencil dot; every edit is one audit row + SSE rebroadcast.

### 14.4 Smart suggestions
New-bowler sheet sorts by: can't bowl consecutive overs (engine filter) → least recently bowled → fewest overs; pre-selects #1. New-batter sheet defaults to next lineup slot. Both accept in one tap. XI order is drag-reorderable pre-match (@dnd-kit).

### 14.5 Keyboard scoring (desktop)
`0–6` runs · `W` wicket · `⇧W` wide · `N` no-ball · `B` bye · `L` leg-bye · `U` undo · `Esc` closes modals. Cheat-sheet popover on `?`.

### 14.6 Celebrations
Extend `AchievementCelebration`: canvas confetti (≤ 3 s, `prefers-reduced-motion` respected), hat-trick sequence banner, five-for banner, milestone odometer roll on the score number.

### 14.7 Context footer + over-rate
Persistent strip: "3.4 · Kohli 41(24) · Bumrah 2-0-14-1 · need 43 off 28". Per-ball timestamps (already stored) drive over-rate stats; toast warns if average interval exceeds 90 s.

### 14.8 Setup wizard (toss → XI → LIVE in ≤ 4 taps)
Animated 3D coin flip (CSS, reduced-motion-safe), winner picks bat/field, XI drag-reorder with openers marked, first bowler pre-suggested, optional keeper tag. Guest players (§17.7) enter here as one-off names — never polluting the team roster.

### 14.9 Offline queue inspector
Header pill "⇅ n queued" → sheet listing pending events, retry-all, discard-with-confirm, storage quota meter (`navigator.storage.estimate()`).

### 14.10 Undo everywhere
Single-tap undo button always visible in ScoreButtons with a count badge; long-press → "undo to start of over". No confirmation dialog for single undo (speed first); redo available until navigation.

### 14.11 Voice scoring (flag `voice`, default OFF)
Web Speech API with a ~20-phrase grammar ("four", "dot ball", "wide", "no ball", "wicket caught"…); recognized event shows as a 1.5 s confirm toast (tap to override) before commit.

---

## §15 Live Spectator v2 (extends v1 §7.5)

### 15.1 Live hub — `/live`
Public grid of LIVE matches: mini cards (teams, score, overs, striker, RRR, last-6-balls chips, PP badge), tournament filter, "recently completed" rail. Server-rendered + streamed.

### 15.2 Web Push (flag `push`)
Spectator opts in per match or "all" via bell icon; `web-push` + VAPID (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` env); events: wicket, 50/100, result — payload ≤ 512 B. `Subscription` model (§18). Queue fanout, never block scoring.

### 15.3 Share cards
- `/api/og/match/[id]`: 1200×630 PNG via `sharp` (already installed) — score, team colors, LIVE badge, QR to `/live/[code]`; `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.
- Story card: 9:16 canvas export on the live page via `html2canvas` (already installed) → PNG download.

### 15.4 Reactions (flag `reactions`)
Six floating emoji reactions; POST debounced 1 s client-side, server coalesces 1 s, broadcast as SSE `reaction` events; anonymous, ephemeral, never persisted.

### 15.5 Ball timeline + "Catch me up"
Vertical timeline (chips + commentary, PP/FH/edited markers). "Catch me up" renders turning points (§13.9) as a 5-bullet template summary — joinable late without reading every ball.

### 15.6 Embeddable widget — `/embed/match/[id]`
Self-contained ≤ 15 KB JS; SSE when available else 10 s polling; `frame-ancestors *` **only** on this route; `?theme=dark|light` param. League sites and group chats get a live scoreboard.

### 15.7 SSE v2 event registry + replay
Typed events: `ball` (ball + delta aggregates), `state` (after undo/edit), `innings`, `wp`, `reaction`, `heartbeat` (25 s). Server assigns monotonic SSE ids = `deliveryNumber`-anchored sequence; client reconnect (backoff 1 s→30 s) sends `Last-Event-ID` and the server **replays missed events** from the DB event log — no missed balls during a subway ride.

### 15.8 Team-color theming + follow
Live page accents tint with the batting team's color (auto-lightened for contrast); "follow" persists last-watched matches in localStorage; spectator gets an install prompt on 2nd visit.

---

## §16 Offline & Sync v2 (extends v1 §7.7)

### 16.1 Background Sync
Register `sync: 'gullyscore-queue'`; the SW messages hidden clients to run `syncAll()` (Dexie isn't SW-context friendly — document the limitation; the foreground `online` path remains primary). Optional `periodicSync` for live-match cache refresh where supported.

### 16.2 Multi-tab safety + scorer lock
`BroadcastChannel('gullyscore')` mirrors store events across tabs. The scoring screen acquires a Web Locks (`navigator.locks`) soft lock; a second tab opens read-only with a "Take over" button that requests the lock.

### 16.3 Idempotency & conflict policy
`clientEventId` unique index dedupes replays (§12.7). Server detects sequence gaps via `deliveryNumber`; on divergence, SSE `state` resync + a conflict sheet lists divergent events with "apply server" default (last-write-wins stays documented for v2).

### 16.4 Storage hygiene
Cap 50 cached matches; LRU-evict completed > 90 days; quota meter in the queue inspector (§14.9); request `navigator.storage.persist()` after the first scored match.

### 16.5 Service worker v2
App-shell precache stamped with the build id from `/api/buildinfo`; integrity check on activate; `skipWaiting()` + `clients.claim()` retained — silent updates, always.

---

## §17 Tournaments v2 (extends v1 §7.4)

### 17.1 Knockout bracket
SVG bracket renderer (QF/SF/F auto-seeded from standings for HYBRID; byes handled), nodes link to live/scorecard; champion banner on completion.

### 17.2 Schedule editor + ICS
List/calendar view with drag-to-reslot, venue/time/umpire fields, double-booking conflict detection; `/api/tournaments/[id]/export?format=ics` (also `csv`).

### 17.3 Points-table tiebreakers + NRR transparency
Chain: points → NRR → head-to-head → most wins → organizer "drawing of lots" tool. NRR tooltip shows the formula (`(runs/oversFaced) − (runsConceded/oversBowled)`, all-out = full quota, overs in 0.1 notation = balls/6) with a worked example.

### 17.4 Leaderboards
Per tournament: run-getters, wicket-takers, MVP (§13.5), best economy (≥ 3 overs), best SR (≥ 30 balls). Tabs on the tournament page.

### 17.5 Public tournament hub
`/tournaments/[id]` gains a "live now" rail, follow button, fixtures/results filter, and a champion banner; shareable like a match.

### 17.6 Exports
CSV (points table, fixtures, batting/bowling) and a brand-styled PDF tournament report via the pdf pipeline — organizer action.

### 17.7 Squads, XI, guests
Squad lock date; per-match XI (from §14.8) with `rules.guestPlayersAllowed` one-off guest names (stored on the match XI, not the team roster); guest stats still count on the match but are flagged in leaderboards (opt-in per tournament).

---

## §18 Data Model v2 (additive Prisma diff)

```prisma
model Match {
  rules            Json?      // house rules (§12.10)
  adjustments       Json?      // overs/target change audit log (§12.3)
  organizerPinHash  String?    // optional 6-digit PIN (§19.4)
  reportJson        Json?      // cached AI/template match report (§13.10)
}

model Ball {
  clientEventId  String    @unique    // idempotency key, client-generated UUID
  isFreeHit      Boolean   @default(false)
  causedFreeHit  Boolean   @default(false)
  wagonDirection String?   // 8-sector enum value (§13.2)
  pitchLength    String?   // yorker|full|good|short|bouncer (§13.3)
  pitchLine      String?   // wide-off|off|stumps|middle|leg (§13.3)
  completedRuns  Int?      // runs completed before a run-out (§12.6)
  deletedAt      DateTime? // undo tombstone (§12.7)
  editedAt       DateTime?
  version        Int       @default(1)

  @@index([inningsId, deliveryNumber])
  @@index([inningsId, deletedAt])
}

enum WicketType { …existing… OBSTRUCTING_FIELD }
enum ExtraType  { …existing… PENALTY }

model Subscription {          // web push (§15.2)
  id        String   @id @default(cuid())
  endpoint  String   @unique
  p256dh    String
  auth      String
  matchId   String?            // null = follow all
  deviceId  String   @default("")
  createdAt DateTime @default(now())
}

model MatchEditLog {          // audit for ball edits (§12.7)
  id        String   @id @default(cuid())
  matchId   String
  ballId    String?
  before    Json
  after     Json
  reason    String?
  deviceId  String   @default("")
  createdAt DateTime @default(now())
}

model DeviceTransfer {        // identity portability (§19.4)
  deviceId    String   @id            // the device being backed up
  backupCode  String   @unique        // 12-char restore code
  label       String?
  createdAt   DateTime @default(now())
  lastUsedAt  DateTime?
}
```

**Migration**: `bun run db:push` is additive-safe. Backfill script `scripts/backfill-v2.ts`: generate `clientEventId` for legacy balls, set defaults, then **fold every legacy innings and assert the result equals the stored denormalized totals** — abort loudly on any mismatch before touching data.

---

## §19 API v2 (extends v1 §8; all JSON unless noted)

### 19.1 New routes
| Route | Method | Purpose |
|---|---|---|
| `/api/matches/[id]/undo` | POST | soft-delete last event, recompute, rebroadcast |
| `/api/matches/[id]/balls/[bid]/edit` | POST | patch a historical ball, re-validate sequence |
| `/api/matches/[id]/adjust-overs` | POST | Gully-DLS reduction (§12.3) |
| `/api/matches/[id]/report` | GET/POST | match report (AI or template, cached) |
| `/api/matches/[id]/reactions` | POST | SSE-fanout reaction |
| `/api/live` | GET | live hub list (public) |
| `/api/players/[id]` | GET | career aggregates |
| `/api/push/subscribe` `/unsubscribe` | POST | web push management |
| `/api/og/match/[id]` | GET | 1200×630 share PNG |
| `/api/tournaments/[id]/export` | GET | `?format=ics\|csv` |
| `/api/health` | GET | liveness + `SELECT 1` db ping + version |
| `/api/metrics` | GET | Prometheus text (SSE gauge, queue depth, write latency) |

### 19.2 Cross-cutting middleware (all routes)
- **Zod validation** on every body/query; schemas co-located in `src/lib/schemas/`.
- **Error envelope**: `{ error: { code, message, details? } }` with codes `VALIDATION_ERROR · NOT_FOUND · RATE_LIMITED · FORBIDDEN_DEVICE · ENGINE_RULE_VIOLATION · CONFLICT`. Client toast mapping table for each code.
- **Rate limits** (in-memory token bucket, per deviceId + IP): mutations 120/min, reads 600/min, SSE ≤ 6 concurrent, OG 60/min. 429 + `Retry-After`.
- **Device auth stays**: `X-Device-Id` continues to gate mutations (spectator reads public). PIN only unlocks cross-device actions (§19.4).

### 19.3 SSE contract
Implements the §15.7 registry; every write path (ball, undo, edit, innings state, adjustment) emits through the existing `live-emitter.ts`; heartbeat 25 s; `Last-Event-ID` replay.

### 19.4 Identity portability (fixes the real one-device lock-in)
Today all data is keyed to one phone — a lost phone loses every match. Three additions, no full auth system:
1. **Backup code**: settings sheet generates a 12-char `DeviceTransfer` code; on a new phone, entering the code re-maps the old deviceId to the new device (one-time, old code invalidated, rate-limited).
2. **Organizer PIN** (optional, per match): allows editing completed matches (§12.7) and manual DLS overrides (§12.3). Hashed (bcrypt), 6 digits.
3. **Full data export**: `GET /api/export` streams the device's matches/teams/tournaments as one JSON — import endpoint mirrors it for migrations.

---

## §20 Production Hardening & Observability

- **Security headers** via middleware: CSP with nonces (documented fallback if a dependency forces `unsafe-inline`), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`; frame-ancestors `*` **only** on `/embed/*`; no PII anywhere (names are the only user data).
- **Logging**: pino with async-storage request ids; mutations at `info` (matchId + deliveryNumber), SSE connect/disconnect, sync conflicts at `warn`; never log ball payloads.
- **Health & metrics**: `/api/health` (db ping, uptime, version), `/api/metrics` (Prometheus text: SSE connections, queue depth, ball-write latency histogram, route 5xx rate).
- **Backups**: `scripts/backup-db.sh` — `sqlite3 VACUUM INTO` timestamped copies, 14-day retention, sample cron entry, restore doc in README.
- **Graceful shutdown**: SIGTERM → close SSE streams, flush logs, stop accepting balls (in-flight queue drains client-side by design).
- **Error handling**: `error.tsx` per route + global `global-error.tsx`; offline write failures stay silent (queue owns them) — toasts only for user-correctable states.

---

## §21 Accessibility (WCAG 2.1 AA, both themes)

- Contrast ≥ 4.5:1 for all token pairs (incl. new §14.0 colors), verified in tests.
- Live page: `aria-live="polite"` score region, `aria-live="assertive"` wicket/milestone announcements (scorer screen stays silent — the scorer's eyes are on it).
- Focus-visible rings (2 px accent) everywhere; modal focus traps (Radix); 48 px minimum targets in the score grid; no color-only meaning — every run chip keeps its numeral, FH/PP badges include text.
- `prefers-reduced-motion`: kills aurora/spotlight/confetti/coin-flip, keeps function.
- VoiceOver/speech labels on every score button ("six runs", "wide, re-bowl"); keyboard-complete scoring (§14.5) is the a11y smoke test.

---

## §22 Localization — en / hi / ur (flag `i18n`)

`next-intl` is already installed: `src/locales/{en,hi,ur}.json`, cookie `gs_lang`, server picks the dictionary. Urdu sets `dir="rtl"` with layout mirroring via logical CSS properties (`ms-*`/`me-*` etc.). Numerals stay Western digits (scoreboard convention). Cricket glossary file keeps terms consistent across locales. Switcher on dashboard + live page. All v2 strings land in dictionaries from day one — no hardcoded prose.

---

## §23 Testing & Quality Gates (introduces the first real suite)

### 23.1 Unit + property tests (Vitest + fast-check, `bun run test`)
- Engine invariants v1 §6 (1–11) + v2 §12.12 (12–21) as table tests, ≥ 200 cases.
- Property suite: 10 k random 500-event sequences — over counting, strike parity (§12.11.4), free-hit legality, and fold-determinism must hold; fold must equal a brute-force reference implementation.
- Correctness-fix tests: each §12.11 fix asserts old vs new outputs.

### 23.2 Golden fixtures
Three full-match event logs (JSON, in `__fixtures__/`) — a 10-over gully sprint with free hits and a mankad, a rain-interrupted chase (DLS), an 8-ball-over match. Replay through `fold()`, snapshot scorecards + analytics; legacy v1 matches must reproduce their stored denormalized totals exactly (backfill uses the same assertion).

### 23.3 E2E (Playwright, `bun run test:e2e`)
1. Full match: create → toss wizard → score with FH/undo/edit → innings break → chase → result screen → scorecard reconciles.
2. Offline: kill network mid-over → score 8 balls → reconnect → queue drains → server state matches local.
3. Two-tab lock: second tab read-only + takeover.
4. Spectator: SSE updates arrive without refresh; `Last-Event-ID` replay after a forced reconnect.
5. axe scan on scoring + live pages: zero critical violations.

### 23.4 Performance gates (Lighthouse CI, mobile emulation)
PWA 100 (installable + offline 200) · Performance ≥ 90 · A11y ≥ 95.

### 23.5 Budgets (CI-enforced)
Scoring route ≤ 200 KB first-load JS gz · live ≤ 150 KB · SSE ball event ≤ 1.5 KB · LCP ≤ 2.5 s. GSAP/Recharts stay lazy-loaded on the routes that need them; the embed bundle ≤ 15 KB.

### 23.6 CI
`test`, `test:e2e`, `test:a11y`, `lighthouse`, `build` — engine-suite failure blocks merge, full stop.

---

## §24 Rollout, Migration & Definition of Done

### Phases
| Phase | Ships | Exit criteria |
|---|---|---|
| **1 — Correctness core** | §12 engine v2 + pure `engine.ts` extraction + undo/edit + §16.3 idempotency + §23.1–23.2 | All invariants green; golden fixtures reproduce; legacy backfill asserts clean |
| **2 — Experience** | §14 + §15.1/15.4/15.5/15.7/15.8 + §13.1–13.9 + SSE v2 | E2E suite passes; budgets hold |
| **3 — Scale & reach** | push, embed, OG cards, AI report, tournaments v2, i18n, exports, §19.4 portability, §20 ops | Flags default-on per matrix; Lighthouse + a11y gates green |

### Migration checklist (run on a copy first)
1. `scripts/backup-db.sh` → 2. `bun run db:push` (additive) → 3. `scripts/backfill-v2.ts` (with fold assertion) → 4. deploy → 5. verify `/api/health` + replay one legacy match scorecard → 6. flip flags per phase matrix.

### Feature-flag matrix
`push · reactions · voice(off) · dls · embed · aiReport(off) · i18n` — flag off = route 404s and UI hides with no dangling imports (dynamic-import gating).

### v2 is done when
A scorer completes a full rain-interrupted, free-hit-laden gully match offline on a bus, undoes a mis-tap, edits a ball at the break, and 40 spectators on three continents see every ball, react, get the wicket push, and read the AI-written report — while the engine's test suite proves the scorecard was right all along.

