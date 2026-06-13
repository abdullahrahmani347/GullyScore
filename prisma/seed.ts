import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Simple seeded PRNG
function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SeedBall {
  runs: number;
  extraType?: 'WIDE' | 'NO_BALL' | 'BYE' | 'LEG_BYE';
  extraRuns?: number;
  isWicket?: boolean;
  wicketType?: 'BOWLED' | 'CAUGHT' | 'LBW' | 'RUN_OUT' | 'STUMPED';
  batsmanIdx: number;
  bowlerIdx: number;
}

// Build a realistic innings by constructing it over-by-over
function buildInnings(
  totalRuns: number,
  totalWickets: number,
  totalOvers: number,
  numBatsmen: number,
  numBowlers: number,
  seed: number,
  chaseTarget?: number
): SeedBall[] {
  const rand = mulberry32(seed);
  const balls: SeedBall[] = [];

  // Decide wicket positions (at which legal delivery each wicket falls)
  const wicketPositions: number[] = [];
  const maxLegal = totalOvers * 6;
  if (totalWickets > 0) {
    // Spread wickets roughly evenly with some randomness
    const spacing = maxLegal / (totalWickets + 1);
    for (let i = 0; i < totalWickets; i++) {
      const base = spacing * (i + 1);
      const jitter = (rand() - 0.5) * spacing * 0.6;
      const pos = Math.max(1, Math.min(maxLegal - 2, Math.round(base + jitter)));
      wicketPositions.push(pos);
    }
    wicketPositions.sort((a, b) => a - b);
  }

  // Decide extras: about 5-10% of deliveries are extras
  const extraPositions = new Set<number>();
  const numExtras = Math.floor(maxLegal * (0.04 + rand() * 0.06));
  for (let i = 0; i < numExtras; i++) {
    extraPositions.add(Math.floor(rand() * maxLegal));
  }

  // Build ball sequence
  let runsRemaining = totalRuns;
  let wicketsSoFar = 0;
  let strikerIdx = 0;
  let nonStrikerIdx = 1;
  let nextBatIdx = 2;
  let bowlerIdx = 0;
  let ballInOver = 0;

  for (let legalDelivery = 1; legalDelivery <= maxLegal; legalDelivery++) {
    // Check chase target
    if (chaseTarget) {
      const currentScore = totalRuns - runsRemaining;
      if (currentScore >= chaseTarget) break;
    }

    const isWicketBall = wicketPositions[wicketsSoFar] === legalDelivery;
    const isExtra = extraPositions.has(legalDelivery);

    if (isExtra && !isWicketBall) {
      // Extra ball
      const extraType = rand() < 0.5 ? 'WIDE' as const : rand() < 0.5 ? 'NO_BALL' as const : rand() < 0.5 ? 'BYE' as const : 'LEG_BYE' as const;
      if (extraType === 'WIDE') {
        const wideRuns = rand() < 0.8 ? 1 : 2;
        balls.push({ runs: 0, extraType: 'WIDE', extraRuns: wideRuns, batsmanIdx: strikerIdx, bowlerIdx });
        runsRemaining = Math.max(0, runsRemaining - wideRuns);
        // Don't increment legal delivery counter for wide - we'll skip the increment at the end
        legalDelivery--; // This means we still need to fill this legal delivery slot
        // Actually, let me handle this differently. Wides don't count as legal deliveries,
        // so they should be inserted BETWEEN legal deliveries. Let me just add the wide and continue
        // the loop without incrementing the legal delivery counter.
        legalDelivery++; // Undo the decrement
        // Actually, simpler: just add the extra ball and continue to next iteration.
        // The legalDelivery counter will still increment at the end of this loop iteration.
        // But extras shouldn't increment legalDelivery. Let me restructure.
      } else if (extraType === 'NO_BALL') {
        balls.push({ runs: 0, extraType: 'NO_BALL', extraRuns: 1, batsmanIdx: strikerIdx, bowlerIdx });
        runsRemaining = Math.max(0, runsRemaining - 1);
      } else {
        // Bye or Leg Bye - these ARE legal deliveries
        const byeRuns = Math.floor(rand() * 2) + 1;
        balls.push({ runs: 0, extraType, extraRuns: byeRuns, batsmanIdx: strikerIdx, bowlerIdx });
        runsRemaining = Math.max(0, runsRemaining - byeRuns);
        ballInOver++;
        if (ballInOver >= 6) {
          ballInOver = 0;
          [strikerIdx, nonStrikerIdx] = [nonStrikerIdx, strikerIdx];
          bowlerIdx = (bowlerIdx + 1) % numBowlers;
        }
      }
      // For wides and no-balls, we need to still deliver a legal ball at this position
      // So we just add the extra and fall through to the legal delivery
      if (extraType === 'WIDE' || extraType === 'NO_BALL') {
        // These don't count as legal, so we still need the legal ball
        // Fall through to regular ball logic
      } else {
        // Bye/Leg bye counts as legal delivery
        continue;
      }
    }

    // Regular ball or wicket
    if (isWicketBall && wicketsSoFar < totalWickets) {
      const wicketTypes = ['BOWLED', 'CAUGHT', 'LBW', 'RUN_OUT', 'STUMPED'] as const;
      const wt = wicketTypes[Math.floor(rand() * wicketTypes.length)];
      const wkRuns = wt === 'RUN_OUT' ? Math.floor(rand() * 2) : 0;
      balls.push({
        runs: wkRuns,
        isWicket: true,
        wicketType: wt,
        batsmanIdx: strikerIdx,
        bowlerIdx,
      });
      runsRemaining = Math.max(0, runsRemaining - wkRuns);
      wicketsSoFar++;
      if (nextBatIdx < numBatsmen) {
        strikerIdx = nextBatIdx;
        nextBatIdx++;
      }
    } else {
      // Normal ball - distribute runs based on remaining runs and balls
      const ballsLeft = maxLegal - legalDelivery + 1;
      const avgRunsPerBall = runsRemaining / ballsLeft;

      let runs: number;
      const r = rand();
      if (avgRunsPerBall < 0.5) {
        // Need fewer runs - more dots
        if (r < 0.55) runs = 0;
        else if (r < 0.80) runs = 1;
        else if (r < 0.88) runs = 2;
        else if (r < 0.94) runs = 4;
        else runs = 6;
      } else if (avgRunsPerBall < 1.0) {
        // Moderate scoring
        if (r < 0.35) runs = 0;
        else if (r < 0.60) runs = 1;
        else if (r < 0.72) runs = 2;
        else if (r < 0.85) runs = 4;
        else runs = 6;
      } else {
        // Need lots of runs - aggressive
        if (r < 0.20) runs = 0;
        else if (r < 0.40) runs = 1;
        else if (r < 0.55) runs = 2;
        else if (r < 0.78) runs = 4;
        else runs = 6;
      }

      // Cap runs to not exceed target
      runs = Math.min(runs, runsRemaining);

      balls.push({ runs, batsmanIdx: strikerIdx, bowlerIdx });
      runsRemaining = Math.max(0, runsRemaining - runs);

      // Rotate strike on odd runs
      if (runs % 2 === 1) {
        [strikerIdx, nonStrikerIdx] = [nonStrikerIdx, strikerIdx];
      }
    }

    // Over complete
    ballInOver++;
    if (ballInOver >= 6) {
      ballInOver = 0;
      [strikerIdx, nonStrikerIdx] = [nonStrikerIdx, strikerIdx];
      bowlerIdx = (bowlerIdx + 1) % numBowlers;
    }
  }

  // Final adjustment: ensure total runs match
  let actualRuns = 0;
  for (const b of balls) {
    actualRuns += b.runs + (b.extraRuns || 0);
  }
  let diff = totalRuns - actualRuns;
  if (diff !== 0) {
    for (let i = balls.length - 1; i >= 0 && diff !== 0; i--) {
      const b = balls[i];
      if (!b.isWicket && !b.extraType) {
        if (diff > 0) {
          const add = Math.min(diff, 6 - b.runs);
          b.runs += add;
          diff -= add;
        } else {
          const sub = Math.min(-diff, b.runs);
          b.runs -= sub;
          diff += sub;
        }
      }
    }
  }

  return balls;
}

// Seed an innings into the database
async function seedInnings(
  matchId: string,
  inningsNumber: number,
  teamBattingId: string,
  batsmen: string[],
  bowlers: string[],
  balls: SeedBall[],
  isCompleted: boolean = true,
  target?: number
) {
  const innings = await prisma.innings.create({
    data: { matchId, teamId: teamBattingId, inningsNumber, target: target || null },
  });

  let totalRuns = 0, totalWickets = 0, legalDeliveries = 0;
  let overNumber = 0, ballInOver = 0, deliveryNumber = 0;
  let strikerIdx = 0, nonStrikerIdx = 1, nextBatIdx = 2;
  const batsmanInningsMap = new Map<string, string>();
  const bowlerInningsMap = new Map<string, string>();

  async function ensureBI(playerId: string, order: number) {
    if (!batsmanInningsMap.has(playerId)) {
      const bi = await prisma.batsmanInnings.create({ data: { inningsId: innings.id, playerId, battingOrder: order } });
      batsmanInningsMap.set(playerId, bi.id);
    }
    return batsmanInningsMap.get(playerId)!;
  }

  async function ensureBoI(playerId: string) {
    if (!bowlerInningsMap.has(playerId)) {
      const boi = await prisma.bowlerInnings.create({ data: { inningsId: innings.id, playerId } });
      bowlerInningsMap.set(playerId, boi.id);
    }
    return bowlerInningsMap.get(playerId)!;
  }

  await ensureBI(batsmen[0], 0);
  await ensureBI(batsmen[1], 1);

  for (const ball of balls) {
    const batsmanId = batsmen[ball.batsmanIdx] || batsmen[strikerIdx];
    const bowlerId = bowlers[ball.bowlerIdx] || bowlers[0];
    const isLegal = ball.extraType !== 'WIDE' && ball.extraType !== 'NO_BALL';

    await ensureBI(batsmanId, ball.batsmanIdx);
    await ensureBoI(bowlerId);
    deliveryNumber++;

    await prisma.ball.create({
      data: {
        inningsId: innings.id, overNumber, ballInOver, deliveryNumber,
        batsmanId, bowlerId,
        runs: ball.runs,
        isWicket: ball.isWicket || false,
        wicketType: ball.wicketType || null,
        dismissedPlayerId: ball.isWicket ? batsmanId : null,
        fielderPlayerId: ball.isWicket && ball.wicketType === 'CAUGHT'
          ? bowlers[(ball.bowlerIdx + 1) % bowlers.length]
          : ball.isWicket && ball.wicketType === 'RUN_OUT' ? batsmen[nonStrikerIdx] : null,
        extraType: ball.extraType || null,
        extraRuns: ball.extraRuns || 0,
        isLegalDelivery: isLegal,
        strikerIdBefore: batsmen[strikerIdx],
        nonStrikerIdBefore: batsmen[nonStrikerIdx],
      },
    });

    // Update batsman
    const biId = batsmanInningsMap.get(batsmanId)!;
    if (isLegal && ball.extraType !== 'BYE' && ball.extraType !== 'LEG_BYE') {
      await prisma.batsmanInnings.update({ where: { id: biId }, data: {
        runs: { increment: ball.runs }, balls: { increment: 1 },
        fours: { increment: ball.runs === 4 ? 1 : 0 }, sixes: { increment: ball.runs === 6 ? 1 : 0 },
      }});
    } else if (ball.extraType === 'BYE' || ball.extraType === 'LEG_BYE') {
      await prisma.batsmanInnings.update({ where: { id: biId }, data: { balls: { increment: 1 } }});
    }

    // Wicket
    if (ball.isWicket) {
      totalWickets++;
      await prisma.batsmanInnings.update({ where: { id: biId }, data: {
        isOut: true, dismissalType: ball.wicketType || 'BOWLED',
        dismissedByBowlerId: ball.wicketType !== 'RUN_OUT' ? bowlerId : null,
        fielderPlayerId: ball.wicketType === 'CAUGHT' ? bowlers[(ball.bowlerIdx + 1) % bowlers.length]
          : ball.wicketType === 'RUN_OUT' ? batsmen[nonStrikerIdx] : null,
      }});
      if (nextBatIdx < batsmen.length) {
        strikerIdx = nextBatIdx;
        nextBatIdx++;
        await ensureBI(batsmen[strikerIdx], strikerIdx);
      }
    }

    // Update bowler
    const boiId = bowlerInningsMap.get(bowlerId)!;
    const currentBowler = await prisma.bowlerInnings.findUniqueOrThrow({ where: { id: boiId } });
    const bUpdate: any = {};
    if (ball.extraType === 'WIDE') { bUpdate.wides = { increment: 1 }; bUpdate.runs = { increment: ball.extraRuns || 1 }; }
    else if (ball.extraType === 'NO_BALL') { bUpdate.noBalls = { increment: 1 }; bUpdate.runs = { increment: (ball.extraRuns || 1) + ball.runs }; }
    else { bUpdate.runs = { increment: ball.runs + (ball.extraRuns || 0) }; }
    if (ball.isWicket && ball.wicketType !== 'RUN_OUT') bUpdate.wickets = { increment: 1 };

    // Handle over completion for bowler
    if (isLegal) {
      const newBowlerBalls = currentBowler.balls + 1;
      if (newBowlerBalls >= 6) {
        // Over complete for this bowler
        bUpdate.completedOvers = { increment: 1 };
        bUpdate.balls = 0;
      } else {
        bUpdate.balls = newBowlerBalls;
      }
    }
    await prisma.bowlerInnings.update({ where: { id: boiId }, data: bUpdate });

    totalRuns += ball.runs + (ball.extraRuns || 0);

    if (isLegal) {
      legalDeliveries++;
      ballInOver++;
      if (!ball.isWicket && ball.runs % 2 === 1) [strikerIdx, nonStrikerIdx] = [nonStrikerIdx, strikerIdx];
      if (ballInOver >= 6) {
        ballInOver = 0; overNumber++;
        [strikerIdx, nonStrikerIdx] = [nonStrikerIdx, strikerIdx];
      }
    }
  }

  const cOvers = Math.floor(legalDeliveries / 6);
  const cBalls = legalDeliveries % 6;
  const wides = balls.filter(b => b.extraType === 'WIDE').reduce((s, b) => s + (b.extraRuns || 1), 0);
  const noBalls = balls.filter(b => b.extraType === 'NO_BALL').reduce((s, b) => s + (b.extraRuns || 1), 0);
  const byes = balls.filter(b => b.extraType === 'BYE').reduce((s, b) => s + (b.extraRuns || 0), 0);
  const legByes = balls.filter(b => b.extraType === 'LEG_BYE').reduce((s, b) => s + (b.extraRuns || 0), 0);

  await prisma.innings.update({
    where: { id: innings.id },
    data: {
      runs: totalRuns, wickets: totalWickets,
      completedOvers: cOvers, currentBalls: cBalls,
      wideBalls: wides, noBalls: noBalls, byes, legByes,
      strikerId: batsmen[strikerIdx] || null,
      nonStrikerId: batsmen[nonStrikerIdx] || null,
      currentBowlerId: bowlers[0] || null,
      isCompleted,
    },
  });

  return { totalRuns, totalWickets, completedOvers: cOvers, currentBalls: cBalls, inningsId: innings.id, oversDecimal: cOvers + cBalls / 6 };
}

async function updateTournamentStats(
  tournamentId: string, t1Id: string, t2Id: string,
  t1Runs: number, t1Overs: number, t2Runs: number, t2Overs: number, winnerId: string | null
) {
  for (const { teamId, rs, of, rc, ob, won } of [
    { teamId: t1Id, rs: t1Runs, of: t1Overs, rc: t2Runs, ob: t2Overs, won: winnerId === t1Id },
    { teamId: t2Id, rs: t2Runs, of: t2Overs, rc: t1Runs, ob: t1Overs, won: winnerId === t2Id },
  ]) {
    const ex = await prisma.tournamentTeam.findUnique({ where: { tournamentId_teamId: { tournamentId, teamId } } });
    if (!ex) continue;
    const nrr = ((ex.runsScored + rs) / Math.max(ex.oversFaced + of, 0.1)) - ((ex.runsConceded + rc) / Math.max(ex.oversBowled + ob, 0.1));
    await prisma.tournamentTeam.update({
      where: { tournamentId_teamId: { tournamentId, teamId } },
      data: {
        played: { increment: 1 }, won: { increment: won ? 1 : 0 }, lost: { increment: won ? 0 : 1 },
        points: { increment: won ? 2 : 0 },
        runsScored: { increment: rs }, runsConceded: { increment: rc },
        oversFaced: { increment: of }, oversBowled: { increment: ob },
        nrr: Math.round(nrr * 1000) / 1000,
      },
    });
  }
}

async function main() {
  console.log('🌱 Seeding database...');

  const tables = ['Ball', 'BatsmanInnings', 'BowlerInnings', 'Innings', 'Match', 'TournamentTeam', 'Tournament', 'Player', 'Team'];
  for (const t of tables) { try { await (prisma as any).$executeRawUnsafe(`DELETE FROM "${t}";`); } catch {} }
  console.log('  ✅ Cleared existing data');

  // ===== 1. Create teams =====
  const teamSpecs = [
    { name: 'Colony Strikers', shortName: 'CS', color: '#00D4AA', emoji: '🏏' },
    { name: 'Gali Warriors', shortName: 'GW', color: '#FF6B35', emoji: '⚔️' },
    { name: 'Roof Rockets', shortName: 'RR', color: '#4ECDC4', emoji: '🚀' },
    { name: 'Midnight Snipers', shortName: 'MS', color: '#9B59B6', emoji: '🌙' },
    { name: 'Dusty Dynamos', shortName: 'DD', color: '#FFD700', emoji: '⚡' },
    { name: 'Alley Aces', shortName: 'AA', color: '#FF4444', emoji: '🃏' },
  ];

  const playerNames: Record<string, string[]> = {
    CS: ['Rahul Sharma', 'Amit Patel', 'Vikram Singh', 'Deepak Yadav', 'Suresh Kumar', 'Nitin Joshi', 'Arjun Mehta', 'Karan Gupta', 'Prashant Rao', 'Manish Tiwari', 'Saurabh Verma'],
    GW: ['Rohan Agarwal', 'Siddharth Malhotra', 'Rajesh Bansal', 'Hardik Desai', 'Kunal Naik', 'Ishaan Kishore', 'Surya Reddy', 'Jatin Shah', 'Bhuvan Lal', 'Yuvraj Chahal', 'Pawan Singh'],
    RR: ['Sanju Nair', 'Joshi Thomas', 'Devdutt Menon', 'Ravindra Pillai', 'Shreyas Iyer', 'Prithvi Hegde', 'Ravi Subramanian', 'Kuldeep Yadav', 'Navdeep Saini', 'T Natarajan', 'Washington Sundar'],
    MS: ['Babar Raza', 'Mohammad Asif', 'Shoaib Malik', 'Fakhar Zaman', 'Imad Wasim', 'Shadab Khan', 'Haris Rauf', 'Shaheen Afridi', 'Rizwan Ahmed', 'Sarfaraz Ali', 'Hasan Mir'],
    DD: ['Kane Williams', 'Martin Gupta', 'Trent Bolt', 'Tim Southee', 'Devon Conway', 'Glenn Phillips', 'Mitchell Santner', 'Ish Sodhi', 'Lockie Ferguson', 'Matt Henry', 'Daryl Mitchell'],
    AA: ['Shakib Hasan', 'Tamim Iqbal', 'Mushfiq Rahim', 'Mahmudullah', 'Mustafiz Rahman', 'Liton Das', 'Taskin Ahmed', 'Mehidy Hasan', 'Afif Hossain', 'Nasum Ahmed', 'Shoriful Islam'],
  };

  const teamIds: Record<string, string> = {};
  const playerIds: Record<string, string[]> = {};

  for (const spec of teamSpecs) {
    const team = await prisma.team.create({
      data: {
        name: spec.name, shortName: spec.shortName, color: spec.color, emoji: spec.emoji,
        players: { create: playerNames[spec.shortName].map((name, i) => ({ name, jerseyNumber: i + 1 })) },
      },
      include: { players: true },
    });
    teamIds[spec.shortName] = team.id;
    playerIds[spec.shortName] = team.players.map((p) => p.id);
  }
  console.log('  ✅ Created 6 teams with 66 players');

  // ===== 2. Create tournament =====
  const tournament = await prisma.tournament.create({
    data: {
      name: 'Colony Premier League', format: 'ROUND_ROBIN', totalOvers: 10, status: 'ONGOING',
      teams: { create: ['CS', 'GW', 'RR', 'MS'].map(sn => ({ teamId: teamIds[sn] })) },
    },
  });
  console.log('  ✅ Created Colony Premier League');

  // Schedule: round-robin for CS, GW, RR, MS
  const schedule: [string, string][] = [
    ['CS', 'MS'], ['GW', 'RR'],
    ['CS', 'RR'], ['GW', 'MS'],
    ['CS', 'GW'], ['RR', 'MS'],
  ];

  const matchIds: string[] = [];
  for (const [t1, t2] of schedule) {
    const m = await prisma.match.create({
      data: { team1Id: teamIds[t1], team2Id: teamIds[t2], totalOvers: 10, maxWickets: 10, tournamentId: tournament.id, status: 'UPCOMING' },
    });
    matchIds.push(m.id);
  }
  console.log('  ✅ Created 6 tournament matches');

  // ===== 3. Seed COMPLETED matches =====

  // Match 5 (index 4): CS vs GW — CS scores 87/5, GW scores 78/8 → CS won by 9 runs
  await prisma.match.update({
    where: { id: matchIds[4] },
    data: { status: 'COMPLETED', currentInnings: 2, result: 'Colony Strikers won by 9 runs', winnerId: teamIds['CS'], tossWinnerId: teamIds['CS'], tossDecision: 'BAT', completedAt: new Date(Date.now() - 2 * 86400000) },
  });
  const m1i1 = await seedInnings(matchIds[4], 1, teamIds['CS'], playerIds['CS'].slice(0, 8), playerIds['GW'].slice(6, 9), buildInnings(87, 5, 10, 8, 3, 101), true);
  const m1i2 = await seedInnings(matchIds[4], 2, teamIds['GW'], playerIds['GW'].slice(0, 10), playerIds['CS'].slice(6, 9), buildInnings(78, 8, 10, 10, 3, 102), true, 88);
  await updateTournamentStats(tournament.id, teamIds['CS'], teamIds['GW'], m1i1.totalRuns, m1i1.oversDecimal, m1i2.totalRuns, m1i2.oversDecimal, teamIds['CS']);
  console.log('  ✅ CS 87/5 vs GW 78/8 — CS won by 9 runs');

  // Match 2 (index 1): GW vs RR — RR scores 65/7, GW scores 66/4 → GW won by 6 wickets
  await prisma.match.update({
    where: { id: matchIds[1] },
    data: { status: 'COMPLETED', currentInnings: 2, result: 'Gali Warriors won by 6 wickets', winnerId: teamIds['GW'], tossWinnerId: teamIds['RR'], tossDecision: 'BAT', completedAt: new Date(Date.now() - 1.5 * 86400000) },
  });
  const m2i1 = await seedInnings(matchIds[1], 1, teamIds['RR'], playerIds['RR'].slice(0, 10), playerIds['GW'].slice(6, 9), buildInnings(65, 7, 10, 10, 3, 201), true);
  const m2i2 = await seedInnings(matchIds[1], 2, teamIds['GW'], playerIds['GW'].slice(0, 7), playerIds['RR'].slice(6, 9), buildInnings(66, 4, 10, 7, 3, 202), true, 66);
  // Fix result based on actual data
  const m2wicketsRemaining = 10 - m2i2.totalWickets;
  const m2result = m2i2.totalRuns >= 66 ? `Gali Warriors won by ${m2wicketsRemaining} wicket${m2wicketsRemaining !== 1 ? 's' : ''}` : 'Match tied';
  await prisma.match.update({ where: { id: matchIds[1] }, data: { result: m2result } });
  await updateTournamentStats(tournament.id, teamIds['GW'], teamIds['RR'], m2i2.totalRuns, m2i2.oversDecimal, m2i1.totalRuns, m2i1.oversDecimal, teamIds['GW']);
  console.log('  ✅ RR 65/7 vs GW 66/4 — GW won by 6 wickets');

  // Match 3 (index 2): CS vs RR — CS scores 92/3, RR scores 75/9 → CS won by 17 runs
  await prisma.match.update({
    where: { id: matchIds[2] },
    data: { status: 'COMPLETED', currentInnings: 2, result: 'Colony Strikers won by 17 runs', winnerId: teamIds['CS'], tossWinnerId: teamIds['CS'], tossDecision: 'BAT', completedAt: new Date(Date.now() - 86400000) },
  });
  const m3i1 = await seedInnings(matchIds[2], 1, teamIds['CS'], playerIds['CS'].slice(0, 6), playerIds['RR'].slice(6, 9), buildInnings(92, 3, 10, 6, 3, 301), true);
  const m3i2 = await seedInnings(matchIds[2], 2, teamIds['RR'], playerIds['RR'].slice(0, 10), playerIds['CS'].slice(6, 9), buildInnings(75, 9, 10, 10, 3, 302), true, 93);
  await updateTournamentStats(tournament.id, teamIds['CS'], teamIds['RR'], m3i1.totalRuns, m3i1.oversDecimal, m3i2.totalRuns, m3i2.oversDecimal, teamIds['CS']);
  console.log('  ✅ CS 92/3 vs RR 75/9 — CS won by 17 runs');

  // Match 1 (index 0): CS vs MS — LIVE (CS batting, ~5 overs done)
  await prisma.match.update({
    where: { id: matchIds[0] },
    data: { status: 'LIVE', currentInnings: 1, tossWinnerId: teamIds['MS'], tossDecision: 'FIELD' },
  });
  const liveBalls = buildInnings(42, 2, 5, 6, 3, 401);
  await seedInnings(matchIds[0], 1, teamIds['CS'], playerIds['CS'].slice(0, 6), playerIds['MS'].slice(6, 9), liveBalls, false);
  console.log('  ✅ CS vs MS — LIVE (CS batting, ~5 overs)');

  console.log('\n🎉 Seeding complete!');
  console.log('  📊 Colony Premier League: 4 teams, 6 matches');
  console.log('  ✅ 3 completed matches with ball-by-ball data');
  console.log('  🔴 1 live match in progress');
  console.log('  📋 2 upcoming matches');
  console.log('  👥 6 teams, 66 players');
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
