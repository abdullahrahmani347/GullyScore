/**
 * GULLYSCORE v2 §23.2 — GOLDEN MATCH DRIVER
 * ---------------------------------------------------------------------------
 * Plays a scripted full match through the REAL v1 write path
 * (`recordBall` + the same striker/bowler updates the UI flow performs)
 * against the live dev database, using a synthetic deviceId so the user's
 * own data is never touched.
 *
 * The resulting innings are then dumped by generate-golden-fixtures.ts.
 * Because the "expected" side of each fixture comes from the actual v1
 * incremental writer, the fixtures are a true golden master: fold() must
 * reproduce them EXACTLY (v2 §11.2).
 *
 * Coverage of the scripted match:
 *   - every wicket type: BOWLED, CAUGHT (with fielder), RUN_OUT striker,
 *     RUN_OUT non-striker (mankad-style), LBW, STUMPED, RETIRED_HURT
 *   - every extra: WIDE, WIDE + additional runs, NO_BALL, NO_BALL with runs
 *     off the bat, BYE, LEG_BYE
 *   - innings 1 completes via overs exhausted; innings 2 completes via
 *     target reached mid-chase
 *
 * Run:  bun scripts/play-golden-match.ts
 */

import { db, ensureDbSchema } from '../src/lib/db';
import { recordBall } from '../src/lib/scoring-engine';
import type { WicketType, ExtraType } from '../src/types';

const DEVICE = 'engine-fixtures';

interface BallSpec {
  runs: number;
  extraType?: ExtraType | null;
  extraRuns?: number;
  isWicket?: boolean;
  wicketType?: WicketType;
  dismissed?: 'striker' | 'nonStriker';
  fielderName?: string;
}

async function main() {
  await ensureDbSchema();

  // --- Clean any previous fixture-run data --------------------------------
  const oldTeams = await db.team.findMany({ where: { deviceId: DEVICE } });
  for (const t of oldTeams) {
    await db.team.delete({ where: { id: t.id } }).catch(() => {});
  }

  // --- Create teams + players ----------------------------------------------
  const mk = (name: string, shortName: string, playerNames: string[]) =>
    db.team.create({
      data: { name, shortName, color: '#00D4AA', deviceId: DEVICE, players: { create: playerNames.map((n) => ({ name: n })) } },
      include: { players: true },
    });

  const bat = await mk('Golden Sluggers', 'GS', [
    'Aarav', 'Bilal', 'Chirag', 'Dev', 'Ehsan', 'Faris', 'Gopal', 'Haris',
  ]);
  const bwl = await mk('Fixture Falcons', 'FF', [
    'Imran', 'Jalal', 'Kabir', 'Luqman', 'Musa', 'Nadeem', 'Omar', 'Parvez',
  ]);
  const gs = bat.players;
  const ff = bwl.players;
  // Fielder lookup for CAUGHT dismissals (name → playerId):
  const fielderMap: Record<string, string> = Object.fromEntries(
    [...gs, ...ff].map((p) => [p.name, p.id])
  );

  const match = await db.match.create({
    data: {
      team1Id: bat.id,
      team2Id: bwl.id,
      totalOvers: 6,
      maxWickets: 10, // innings 1 will end via overs, not all-out
      status: 'LIVE',
      currentInnings: 1,
      deviceId: DEVICE,
    },
  });

  // --- Innings 1: GS bats, FF bowls ---------------------------------------
  let innings = await db.innings.create({
    data: {
      matchId: match.id,
      teamId: bat.id,
      inningsNumber: 1,
      strikerId: gs[0].id,
      nonStrikerId: gs[1].id,
      currentBowlerId: ff[0].id,
    },
  });

  // Over-by-over scripted specs. Extras add deliveries; each over below
  // contains exactly 6 legal balls.
  const overs1: BallSpec[][] = [
    // Over 1 (Imran): wide, singles, a four
    [
      { runs: 1 }, { runs: 0 }, { runs: 4 }, { runs: 1 },
      { runs: 0, extraType: 'WIDE', extraRuns: 1 },
      { runs: 1 }, { runs: 0 },
    ],
    // Over 2 (Jalal): no-ball with 4 off the bat, caught wicket
    [
      { runs: 0 }, { runs: 2 },
      { runs: 4, extraType: 'NO_BALL', extraRuns: 1 },
      { runs: 0 }, { runs: 1 },
      { runs: 0, isWicket: true, wicketType: 'CAUGHT', fielderName: 'Musa' },
      { runs: 0 },
    ],
    // Over 3 (Kabir): byes, leg-bye, six
    [
      { runs: 4 }, { runs: 0, extraType: 'BYE', extraRuns: 2 }, { runs: 0 },
      { runs: 1 }, { runs: 0, extraType: 'LEG_BYE', extraRuns: 1 }, { runs: 6 }, { runs: 0 },
    ],
    // Over 4 (Imran): striker run-out with a completed single
    [
      { runs: 0 },
      { runs: 1, isWicket: true, wicketType: 'RUN_OUT', dismissed: 'striker' },
      { runs: 1 }, { runs: 0 }, { runs: 2 }, { runs: 0 },
    ],
    // Over 5 (Jalal): non-striker run-out (mankad-style, no bowler credit)
    [
      { runs: 0 }, { runs: 0 },
      { runs: 0, isWicket: true, wicketType: 'RUN_OUT', dismissed: 'nonStriker' },
      { runs: 1 }, { runs: 4 }, { runs: 0 },
    ],
    // Over 6 (Kabir): retired hurt, then runs to close out the overs
    [
      { runs: 0 },
      { runs: 0, isWicket: true, wicketType: 'RETIRED_HURT', dismissed: 'striker' },
      { runs: 1 }, { runs: 0 }, { runs: 3 }, { runs: 1 },
    ],
  ];
  const bowlers1 = [ff[0].id, ff[1].id, ff[2].id, ff[0].id, ff[1].id, ff[2].id];

  const state1 = await playInnings(innings, match.id, overs1, bowlers1, gs.slice(2), fielderMap);

  // --- Innings 2: FF chases (target = inn1 runs + 1) ----------------------
  const target = state1.runs + 1;
  innings = await db.innings.create({
    data: {
      matchId: match.id,
      teamId: bwl.id,
      inningsNumber: 2,
      strikerId: ff[0].id,
      nonStrikerId: ff[1].id,
      currentBowlerId: gs[7].id,
      target,
    },
  });
  await db.match.update({ where: { id: match.id }, data: { currentInnings: 2 } });

  // Chase script: repeats until target reached mid-pattern. Contains the
  // remaining wicket types (BOWLED, LBW, STUMPED) + wide-with-additional.
  const chasePattern: BallSpec[] = [
    { runs: 1 }, { runs: 4 }, { runs: 0 }, { runs: 6 },
    { runs: 0, extraType: 'WIDE', extraRuns: 2 },
    { runs: 2 },
    { runs: 0, isWicket: true, wicketType: 'BOWLED' },
    { runs: 1 }, { runs: 4 },
    { runs: 0, isWicket: true, wicketType: 'LBW' },
    { runs: 1 }, { runs: 2 },
    { runs: 0, isWicket: true, wicketType: 'STUMPED' },
    { runs: 6 }, { runs: 1 }, { runs: 4 }, { runs: 4 }, { runs: 2 },
  ];
  const chaseOvers: BallSpec[][] = [];
  while (chaseOvers.length < 6) chaseOvers.push(chasePattern.slice());
  const bowlers2 = [gs[7].id, gs[6].id, gs[0].id, gs[7].id, gs[6].id, gs[0].id];

  await playInnings(innings, match.id, chaseOvers, bowlers2, ff.slice(2), fielderMap, target);

  const final = await db.innings.findMany({ where: { matchId: match.id }, orderBy: { inningsNumber: 'asc' } });
  for (const inn of final) {
    console.log(`Innings ${inn.inningsNumber}: ${inn.runs}/${inn.wickets} (${inn.completedOvers}.${inn.currentBalls})`);
  }
  console.log('✓ Golden match played. Now run: bun scripts/generate-golden-fixtures.ts');
}

/**
 * Plays scripted overs through recordBall, mirroring the UI flow:
 *  - batsmanId = current striker (kept in sync via the striker route's update)
 *  - after a wicket → next lineup batter fills the empty slot (striker route)
 *  - after over completion → next bowler (bowler route)
 */
async function playInnings(
  innings: { id: string },
  matchId: string,
  overs: BallSpec[][],
  bowlerRotation: string[],
  lineupQueue: { id: string }[],
  fielderMap: Record<string, string>,
  stopAtTarget?: number
) {
  let queue = lineupQueue.slice();
  let summary = { runs: 0, wickets: 0 };

  for (let o = 0; o < overs.length; o++) {
    // Bowler for this over (mirrors the bowler route update)
    await db.innings.update({ where: { id: innings.id }, data: { currentBowlerId: bowlerRotation[o] } });

    for (const spec of overs[o]) {
      const inn = await db.innings.findUniqueOrThrow({ where: { id: innings.id } });
      if (inn.isCompleted) return summary;
      const strikerId = inn.strikerId!;
      const nonStrikerId = inn.nonStrikerId!;

      const dismissedPlayerId =
        spec.isWicket && spec.dismissed === 'nonStriker'
          ? nonStrikerId
          : spec.isWicket
            ? strikerId
            : null;

      const res = await recordBall(innings.id, {
        batsmanId: strikerId,
        bowlerId: bowlerRotation[o],
        runs: spec.runs,
        isWicket: spec.isWicket ?? false,
        wicketType: spec.wicketType ?? null,
        dismissedPlayerId,
        fielderPlayerId: spec.fielderName ? (fielderMap[spec.fielderName] ?? null) : null,
        extraType: spec.extraType ?? null,
        extraRuns: spec.extraRuns ?? 0,
      });

      summary.runs = res.inningsState.runs;
      summary.wickets = res.inningsState.wickets;

      if (res.inningsState.isCompleted) {
        return summary;
      }

      // New batter after a wicket (mirrors the striker route update)
      if (res.needsNewBatsman) {
        const nextBatter = queue.shift();
        if (!nextBatter) {
          // lineup exhausted — let the innings end on wickets naturally
          continue;
        }
        const newStriker = res.strikerUpdate.strikerId || strikerId;
        const newNonStriker = res.strikerUpdate.nonStrikerId || nextBatter.id;
        await db.innings.update({
          where: { id: innings.id },
          data: { strikerId: newStriker, nonStrikerId: newNonStriker },
        });
      }

      // Chase stop safety (target reached check is inside recordBall)
      if (stopAtTarget != null && summary.runs >= stopAtTarget) return summary;
    }
  }
  return summary;
}

main()
  .catch((e) => {
    console.error('Golden match driver failed:', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
