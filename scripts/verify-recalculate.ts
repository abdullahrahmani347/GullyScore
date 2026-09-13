/**
 * §11.2 verification — recalculate() IDEMPOTENCE check.
 * Runs the refactored thin-writer recalculate() on the golden match's
 * innings and asserts every stored aggregate is byte-identical before and
 * after (proving the fold-based rewrite preserves v1 state exactly).
 *
 * Run: bun scripts/verify-recalculate.ts
 */

import { db, ensureDbSchema } from '../src/lib/db';
import { recalculate } from '../src/lib/recalculate';

async function snapshot(inningsId: string) {
  const inn = await db.innings.findUniqueOrThrow({ where: { id: inningsId } });
  const batting = await db.batsmanInnings.findMany({
    where: { inningsId },
    orderBy: { playerId: 'asc' },
    select: { playerId: true, runs: true, balls: true, fours: true, sixes: true, isOut: true, dismissalType: true, dismissedByBowlerId: true, fielderPlayerId: true },
  });
  const bowling = await db.bowlerInnings.findMany({
    where: { inningsId },
    orderBy: { playerId: 'asc' },
    select: { playerId: true, completedOvers: true, balls: true, maidens: true, runs: true, wickets: true, wides: true, noBalls: true },
  });
  const partnerships = await db.partnership.findMany({
    where: { inningsId },
    orderBy: { id: 'asc' },
    select: { batsman1Id: true, batsman2Id: true, runs: true, balls: true, wicketNumber: true, isOpen: true },
  });
  return JSON.stringify({ inn, batting, bowling, partnerships }, null, 2);
}

async function main() {
  await ensureDbSchema();
  const teams = await db.team.findMany({ where: { deviceId: 'engine-fixtures' } });
  if (teams.length === 0) {
    console.log('No fixture teams found — run `bun run fixtures:golden` first.');
    return;
  }
  const match = await db.match.findFirst({ where: { deviceId: 'engine-fixtures' }, orderBy: { createdAt: 'desc' } });
  if (!match) {
    console.log('No fixture match found.');
    return;
  }
  const innings = await db.innings.findMany({ where: { matchId: match.id }, orderBy: { inningsNumber: 'asc' } });

  let allIdentical = true;
  for (const inn of innings) {
    const before = await snapshot(inn.id);
    await recalculate(inn.id);
    const after = await snapshot(inn.id);
    const identical = before === after;
    allIdentical = allIdentical && identical;
    console.log(
      `Innings ${inn.inningsNumber}: recalculate() ${identical ? 'IDEMPOTENT ✓' : 'CHANGED STATE ✗'} ` +
        `(${inn.runs}/${inn.wickets}, ${inn.completedOvers}.${inn.currentBalls})`
    );
    if (!identical) {
      // Show the first differing line pair for debugging.
      const bLines = before.split('\n');
      const aLines = after.split('\n');
      for (let i = 0; i < Math.max(bLines.length, aLines.length); i++) {
        if (bLines[i] !== aLines[i]) {
          console.log(`  first diff at line ${i + 1}:\n    before: ${bLines[i]}\n    after:  ${aLines[i]}`);
          break;
        }
      }
    }
  }
  process.exitCode = allIdentical ? 0 : 1;
  if (!allIdentical) console.log('\n✗ FAILURE: recalculate is not idempotent');
  else console.log('\n✓ SUCCESS: fold-based recalculate preserves v1 state exactly (incl. maidens & partnerships)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
