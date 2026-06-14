/**
 * Migration script: Build partnerships for all existing innings.
 *
 * Run once after adding the Partnership model to backfill
 * partnerships for matches scored before the feature existed.
 */

import { db } from './db';
import { rebuildPartnerships } from './partnerships';

async function migratePartnerships() {
  console.log('🔄 Building partnerships for existing innings...');

  const innings = await db.innings.findMany({
    select: { id: true, inningsNumber: true, matchId: true },
  });

  console.log(`Found ${innings.length} innings to process`);

  for (const inn of innings) {
    try {
      await rebuildPartnerships(inn.id);
      console.log(`  ✅ Innings ${inn.inningsNumber} of match ${inn.matchId}`);
    } catch (error) {
      console.error(`  ❌ Failed for innings ${inn.id}:`, error);
    }
  }

  console.log('🎉 Partnership migration complete!');
}

migratePartnerships()
  .catch(console.error)
  .finally(() => db.$disconnect());
