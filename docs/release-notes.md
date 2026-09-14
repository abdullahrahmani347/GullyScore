# GullyScore Release Notes

This file is the v2 §11.1 ledger: every change that alters a **computed
cricket value** (scorecard numbers, stats, targets) must appear here with an
old-vs-new example, and must ship with a test pinning the new behaviour.
Refactors that provably preserve all computed values are noted as such.

---

## v2 Milestone 1 — §11 Ground Rules (engine extraction + flags + guards)

**Scope**: v2 prompt §11.1 (additive-only), §11.2 (pure-engine doctrine),
§11.4 (feature flags), §11.6 (budget tooling). No v2 §12 cricket rules have
landed yet — the engine reproduces v1 exactly.

### Computed-value changes: NONE (guaranteed by golden fixtures)

- `src/lib/engine.ts` (new) — pure `fold()` / `validateNext()`. Reproduces
  v1's `scoring-engine.ts` incremental behaviour **exactly**, including the
  v1 quirks listed in its header ([P1]–[P9]):
  - [P1] odd byes/leg-byes do not swap strike
  - [P2] last-ball single: one swap (not the real-cricket two-swap cancel)
  - [P3] balls faced counts no-balls, excludes wides
  - [P4] bowler analysis excludes byes/leg-byes
  - [P5] bye/leg-bye-only over is a maiden
  - [P6] RETIRED_HURT counts toward innings wickets
  - [P9] odd-runs striker run-out leaves the dismissed batter as the striker
    label until the new-batter flow replaces it
  These quirks are **intentionally preserved** and pinned by tests. Fixing
  them is deferred to §12.11 with old-vs-new tests + release-note entries.

- **Golden fixtures** (`__fixtures__/golden/`): a scripted full match was
  played through the REAL v1 write path (`recordBall`) covering every
  wicket type, every extra type, and both innings-completion modes.
  `bun run test` asserts `fold()` reproduces the stored aggregates exactly.

- `src/lib/recalculate.ts` — rewritten as a thin DB writer around `fold()`.
  All counters identical to v1's `recordBall` output (proven above). Two
  v1 defects fixed as a side effect:
  1. **Maidens**: v1's recalculation never reset or recomputed maidens,
     leaving stale values after an undo-driven recalc. Now derived from the
     event log like every other stat.
  2. **Striker state**: v1's recalculation re-applied balls starting from
     the CURRENT striker pair instead of the opening pair; it now folds
     from the event log, which carries the true pair per ball
     (`strikerIdBefore`/`nonStrikerIdBefore`).

### New infrastructure (no behaviour change)

- §11.4 feature flags: `src/lib/features.ts` (pure), `src/lib/api-flag.ts`
  (route gating — 404 when off), `src/hooks/useFeatures.ts` (client UI
  gating), `/api/buildinfo` now returns `features`. Env override:
  `FEATURES="push,-voice"` (unknown names fail loudly). Defaults: hardened
  flags ON; `voice`, `aiReport` OFF.
- §11.1 `bun run db:push` now routes through `scripts/db-push-guard.mjs`:
  automatic SQLite backup (10 retained) + `prisma db push` without
  `--accept-data-loss`, so destructive schema changes are mechanically
  refused.
- §11.6/§23.5 `bun run check:budgets` measures real first-load JS (gz) per
  route against the §11.6 budgets (scoring ≤ 200 KB, live ≤ 150 KB).
- §23.2 fixture tooling: `bun run fixtures:golden` replays the scripted
  golden match and regenerates fixtures.

### How to verify

```bash
bun run test           # 49 tests: golden parity + v1 invariants + properties
curl localhost:3000/api/buildinfo   # "features" object present
```

---

## v2 Milestone 2 — §12 Advanced Cricket Engine

**Scope**: v2 prompt §12.1–§12.12 (free hits, powerplays, Gully-DLS,
retired hurt return, penalties, dismissal expansion, event-sourced
undo/edit, 8-ball overs, house rules JSON, correctness fixes, invariants).
131 unit/property tests + 45 live-server E2E assertions + browser ACs.

### Computed-value changes (flagged, old→new tests pin each)

**Every change below is scoped to NEW matches only.** New matches store a
`Match.rules` JSON (§12.10 defaults). Legacy matches (rules NULL) fold with
v1-parity semantics — the golden fixtures prove byte-identical numbers for
them (49 tests, unchanged).

| Rule (Match.rules key) | v1 (legacy) | v2 (new matches) | Test |
|---|---|---|---|
| `freeHitOnNoBall` (§12.1) | no free hits | free-hit state machine; only RUN_OUT / OBSTRUCTING_FIELD on a free hit | 14-case transition table |
| `retiredHurtNotOut` (§12.4) | RETIRED_HURT = wicket + batter out | not-out, RH badge, no wicket, no FOW entry, batter can return and resume the same BatsmanInnings row | AC: retire on 23, return, 33* not out |
| `strikeRotationV2` (§12.11.4) | [P1]+[P2]: odd byes don't rotate; last-ball single swaps once | official two-swap model (XOR); odd byes/leg-byes/additional wides rotate; last-ball single keeps strike | invariant 19 truth table (old vs new both pinned) |
| `ballsPerOver` (§12.8) | 6 only | 6 or 8; every over boundary at ballsPerOver legal balls | invariant 21 |
| `powerplayOvers` (§12.2) | none | auto 30% overs; PP vs non-PP split reconciles exactly with innings totals | reconciliation test on golden fixture |
| `lastManStands` (§12.10) | short side = innings over when no new batter | last batter bats on alone, no strike rotation without a partner, ends at maxWickets or side exhaustion | LMS test |

**Unconditional engine changes (affect new writes only, never stored data):**

- §12.5 PENALTY events (new ExtraType): +N runs to the batting side as team
  extras — consume no ball, charge no batter or bowler. Bowling-side
  penalties are banked and added to the chase target at the innings break.
- §12.6 OBSTRUCTING_FIELD (new WicketType): wicket without bowler credit.
- §12.6 wicket-on-extras truth table, engine-enforced on new writes:
  catch/bowled/lbw/stumped/hit-wicket off a **no-ball** are rejected
  (`NO_BALL_NO_DISMISSAL`, 422); off a **wide** only RUN_OUT / STUMPED /
  OBSTRUCTING_FIELD are accepted (`WIDE_NO_DISMISSAL`). Run-out off a wide
  stands: wide +1, wicket recorded, no legal ball, not re-bowled (invariant 18).

### One code path (§12.7)

`scoring-engine.recordBall` no longer updates aggregates incrementally: it
validates the proposed event (`validateNext`), appends it, and recomputes
every aggregate through `recalculate()` → `fold()`. Undo = tombstone
(`deletedAt`) + recompute; redo = un-tombstone the log tail. Ball edits
re-validate the ENTIRE sequence (`replayValidate`), bump `Ball.version`,
and write a `MatchEditLog` audit row. Every event may carry `clientEventId`
(unique index): replayed offline-queue items return the current state
without writing (invariant 16). The UI's optimistic updates are computed by
the SAME engine (`predictAfterBall`), including the appended ball event.

### Gully-DLS (§12.3)

`src/lib/dls.ts` + the published 50-over × 10-wicket Standard Edition table
(`src/lib/dls-table.json`), linearly scaled to the match length (documented
approximation). `POST /api/matches/:id/overs` (reduce-only) recomputes the
chase target from the FULL adjustments log (invariant 17 — never
incrementally), appends an audit entry, and emits a `target_adjusted` SSE
event that renders as a live "Target adjusted: 87 (DLS)" banner. Flag `dls`
off (or table missing) → proportional "approx" fallback. Manual override
(`POST /api/matches/:id/target`) requires the organizer PIN (SHA-256 stored,
never returned). The 2nd-innings target at the break is DLS-computed when
innings 1 was shortened, and includes banked bowling-side penalties.

### How to verify

```bash
bun test                              # 131 tests (49 golden v1-parity + 66 v2 + 16 DLS)
bun scripts/verify-v2-e2e.ts          # 45 live-server assertions
# Browser AC: tap NB → FH pill appears; tap 4 → FH pill disappears;
# WicketModal disables Bowled/Caught with "Free hit — not out" hint.
```
