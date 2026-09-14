/**
 * GULLYSCORE v2 §23.2 — GOLDEN FIXTURE GENERATOR
 * ---------------------------------------------------------------------------
 * Dumps every innings that has recorded balls from the live database into
 * `__fixtures__/golden/*.json`. Each fixture contains:
 *
 *   - `rules`      — the MatchRules inputs fold() needs
 *   - `events`     — the persisted Ball rows (engine-shaped)
 *   - `expected`   — the STORED denormalized aggregates (Innings counters,
 *                    BatsmanInnings rows, BowlerInnings rows, striker pair)
 *
 * The engine test suite then asserts `fold(events, rules)` reproduces
 * `expected` EXACTLY — proving the pure engine has v1 parity on real data
 * (v2 §11.2: "Before any v2 rule lands, the engine suite must first
 * reproduce current v1 behavior on golden fixtures").
 *
 * Run:  bun scripts/generate-golden-fixtures.ts
 * Regenerate whenever the seed data or v1 scoring logic changes.
 */

import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { db, ensureDbSchema } from '../src/lib/db';

const OUT_DIR = join(process.cwd(), '__fixtures__', 'golden');

async function main() {
  await ensureDbSchema();

  const inningsList = await db.innings.findMany({
    include: {
      match: true,
      balls: { orderBy: { deliveryNumber: 'asc' } },
      batting: { orderBy: { battingOrder: 'asc' } },
      bowling: { orderBy: { runs: 'desc' } },
    },
  });

  mkdirSync(OUT_DIR, { recursive: true });
  // Clear previous fixtures so deleted matches don't linger.
  for (const f of readdirSync(OUT_DIR)) {
    if (f.endsWith('.json')) unlinkSync(join(OUT_DIR, f));
  }

  const manifest: Array<{
    file: string;
    matchId: string;
    inningsNumber: number;
    balls: number;
    runs: number;
    wickets: number;
    label: string;
  }> = [];

  let fixtureCount = 0;

  for (const inn of inningsList) {
    if (inn.balls.length === 0) continue;

    const fixture = {
      $schema: 'gullyscore-golden-fixture/1',
      label: `match ${inn.match.id.slice(-6)} · innings ${inn.inningsNumber} · ${inn.runs}/${inn.wickets} (${inn.completedOvers}.${inn.currentBalls})`,
      matchId: inn.match.id,
      inningsId: inn.id,
      rules: {
        ballsPerOver: 6, // v1 hard-codes 6
        maxWickets: inn.match.maxWickets,
        totalOvers: inn.match.totalOvers,
        inningsNumber: inn.inningsNumber,
        target: inn.target,
        freeHitOnNoBall: false, // v1 parity
        powerplayOvers: 0,
        lastManStands: false,
      },
      events: inn.balls.map((b) => ({
        id: b.id,
        inningsId: b.inningsId,
        deliveryNumber: b.deliveryNumber,
        batsmanId: b.batsmanId,
        bowlerId: b.bowlerId,
        runs: b.runs,
        extraRuns: b.extraRuns,
        extraType: b.extraType,
        isWicket: b.isWicket,
        wicketType: b.wicketType,
        dismissedPlayerId: b.dismissedPlayerId,
        fielderPlayerId: b.fielderPlayerId,
        strikerIdBefore: b.strikerIdBefore,
        nonStrikerIdBefore: b.nonStrikerIdBefore,
        timestamp: b.timestamp instanceof Date ? b.timestamp.toISOString() : b.timestamp,
      })),
      expected: {
        runs: inn.runs,
        wickets: inn.wickets,
        completedOvers: inn.completedOvers,
        currentBalls: inn.currentBalls,
        legalBalls: inn.completedOvers * 6 + inn.currentBalls,
        wideBalls: inn.wideBalls,
        noBalls: inn.noBalls,
        byes: inn.byes,
        legByes: inn.legByes,
        strikerId: inn.strikerId,
        nonStrikerId: inn.nonStrikerId,
        isCompleted: inn.isCompleted,
        batting: inn.batting.map((r) => ({
          playerId: r.playerId,
          runs: r.runs,
          balls: r.balls,
          fours: r.fours,
          sixes: r.sixes,
          isOut: r.isOut,
          dismissalType: r.dismissalType,
          dismissedByBowlerId: r.dismissedByBowlerId,
          fielderPlayerId: r.fielderPlayerId,
        })),
        bowling: inn.bowling.map((r) => ({
          playerId: r.playerId,
          completedOvers: r.completedOvers,
          balls: r.balls,
          maidens: r.maidens,
          runs: r.runs,
          wickets: r.wickets,
          wides: r.wides,
          noBalls: r.noBalls,
        })),
      },
    };

    const file = `${inn.match.id}-i${inn.inningsNumber}.json`;
    writeFileSync(join(OUT_DIR, file), JSON.stringify(fixture, null, 2));
    fixtureCount += 1;
    manifest.push({
      file,
      matchId: inn.match.id,
      inningsNumber: inn.inningsNumber,
      balls: inn.balls.length,
      runs: inn.runs,
      wickets: inn.wickets,
      label: fixture.label,
    });
  }

  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), fixtures: manifest }, null, 2));

  console.log(`✓ Generated ${fixtureCount} golden fixture(s) in ${OUT_DIR}`);
  for (const m of manifest) {
    console.log(`  - ${m.file}: ${m.balls} balls, ${m.runs}/${m.wickets}`);
  }
  if (fixtureCount === 0) {
    console.log('  (no innings with balls found — run `bun run seed` first)');
  }
}

main()
  .catch((e) => {
    console.error('Fixture generation failed:', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
