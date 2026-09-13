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
