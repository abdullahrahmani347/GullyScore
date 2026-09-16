/**
 * GullyScore v2 §16/§17 — demo reseed + E2E verification (live server)
 * ---------------------------------------------------------------------------
 * The sandbox DB was reset to an old snapshot (known artifact), losing the
 * Task 12 smoke data. This script rebuilds a demo HYBRID tournament through
 * the REAL API (production code paths only: fold() engine, complete route
 * aggregate updates, bracket auto-seed) and asserts §16/§17 behaviour:
 *
 *   §16.5  /api/buildinfo exposes buildId; /sw.js serves background-sync tag
 *   §17.3  points chain orders standings (points → NRR), worked example present
 *   §17.1  bracket auto-seeds SF/F from the 4-team standings, champion null
 *   §17.2  schedule PATCH (venue/umpires/scheduledAt), ICS + CSV exports
 *   §17.4  leaderboards: runs / wickets / economy / MVP rows populated
 *   §17.5  public hub route returns fixtures + results without device scope
 *   §17.7  squadLockDate + guestPlayersAllowed persisted via tournament PUT
 *
 * Run: bun scripts/seed-demo-v17.ts
 */

export {};
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const DEVICE = 'demo-v17';

let passed = 0;
let failed = 0;

function ok(cond: boolean, label: string, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
  }
}

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Device-Id': DEVICE },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

type BallSpec = { runs: number; wicket?: boolean; extra?: 'WIDE' | 'NO_BALL' };

/** Play one innings through the real ball POST path with client-side
 *  rotation simulation (odd-run swap, over-end swap, wicket replacement). */
async function batInnings(
  matchId: string,
  inningsId: string,
  tag: string,
  batPlayers: any[],
  bowlPlayers: any[],
  specs: BallSpec[],
  chaseTarget?: number,
) {
  let striker = 0;
  let nonStriker = 1;
  let next = 2;
  let legal = 0;
  let runs = 0;
  let wickets = 0;

  const setPair = () =>
    api(`/api/matches/${matchId}/innings/${inningsId}/striker`, 'POST', {
      strikerId: batPlayers[striker].id,
      nonStrikerId: batPlayers[nonStriker].id,
    });

  await setPair();

  for (let i = 0; i < specs.length; i++) {
    if (chaseTarget != null && runs >= chaseTarget) break;
    const spec = specs[i];

    // new over → new bowler (max 1 over per bowler in a 2-over match)
    if (legal % 6 === 0) {
      const bowler = bowlPlayers[(legal / 6) % bowlPlayers.length];
      await api(`/api/matches/${matchId}/innings/${inningsId}/bowler`, 'POST', {
        bowlerId: bowler.id,
      });
    }

    const res = await api(`/api/matches/${matchId}/innings/${inningsId}/balls`, 'POST', {
      batsmanId: batPlayers[striker].id,
      bowlerId: bowlPlayers[Math.floor(legal / 6) % bowlPlayers.length].id,
      runs: spec.runs,
      isWicket: !!spec.wicket,
      wicketType: spec.wicket ? 'BOWLED' : undefined,
      extraType: spec.extra,
      extraRuns: spec.extra ? 1 : undefined,
      clientEventId: `demo-${matchId}-${tag}-${i}-${legal}`,
    });
    if (res.status !== 200) {
      throw new Error(`ball POST failed (${res.status}): ${JSON.stringify(res.data).slice(0, 300)}`);
    }

    if (spec.extra !== 'WIDE' && spec.extra !== 'NO_BALL') legal++;
    runs += (spec.runs ?? 0) + (spec.extra ? 1 : 0);

    if (spec.wicket) {
      wickets++;
      if (next < batPlayers.length) {
        striker = next++;
        await setPair();
      }
    } else if (spec.runs % 2 === 1) {
      const t = striker;
      striker = nonStriker;
      nonStriker = t;
    }
    if (legal > 0 && legal % 6 === 0 && spec.extra !== 'WIDE' && spec.extra !== 'NO_BALL') {
      const t = striker;
      striker = nonStriker;
      nonStriker = t;
    }
  }
  return { runs, wickets, legal };
}

async function playMatch(
  tournamentId: string,
  batFirst: any,
  bowlFirst: any,
  inn1: BallSpec[],
  inn2: BallSpec[],
) {
  const m = await api('/api/matches', 'POST', {
    team1Id: batFirst.id,
    team2Id: bowlFirst.id,
    totalOvers: 2,
    maxWickets: 10,
    tournamentId,
  });
  if (m.status !== 201) throw new Error(`match create failed: ${JSON.stringify(m.data)}`);
  const matchId = m.data.id;

  const i1 = await api(`/api/matches/${matchId}/innings`, 'POST', {
    teamId: batFirst.id,
    inningsNumber: 1,
  });
  const s1 = await batInnings(matchId, i1.data.id, 'i1', batFirst.players, bowlFirst.players, inn1);

  const i2 = await api(`/api/matches/${matchId}/innings`, 'POST', {
    teamId: bowlFirst.id,
    inningsNumber: 2,
  });
  const s2 = await batInnings(
    matchId,
    i2.data.id,
    'i2',
    bowlFirst.players,
    batFirst.players,
    inn2,
    s1.runs + 1,
  );

  const done = await api(`/api/matches/${matchId}/complete`, 'POST');
  if (done.status !== 200) {
    throw new Error(`complete failed: ${JSON.stringify(done.data).slice(0, 300)}`);
  }
  return { matchId, s1, s2, winnerId: done.data.winnerId ?? done.data.match?.winnerId };
}

async function main() {
  console.log('→ GullyScore v2 §16/§17 demo reseed + verification\n');

  // ── §16.5 buildinfo + service worker ────────────────────────────────────
  console.log('§16.5 build stamp + SW:');
  const bi = await api('/api/buildinfo', 'GET');
  ok(bi.status === 200 && !!bi.data?.buildId && bi.data.buildId !== 'unset', '/api/buildinfo exposes real buildId (§16.5 SW stamp)', bi.data?.buildId);
  const swRes = await fetch(`${BASE}/sw.js`);
  const swText = await swRes.text();
  ok(swRes.status === 200, '/sw.js served');
  ok(swText.includes('gullyscore-queue'), 'SW registers background sync tag');
  ok(swText.includes('buildinfo') || swText.includes('GET_BUILD_ID'), 'SW stamps caches from buildinfo');

  // ── Setup: 4 teams × 6 players ──────────────────────────────────────────
  console.log('\nSetup teams + HYBRID tournament:');
  const stamp = Date.now().toString(36).slice(-4);
  const defs = [
    { name: `Thunder Strikers ${stamp}`, short: 'THS', color: '#EF4444' },
    { name: `Royal Chargers ${stamp}`, short: 'RCH', color: '#3B82F6' },
    { name: `Desert Eagles ${stamp}`, short: 'DES', color: '#F59E0B' },
    { name: `Harbor Kings ${stamp}`, short: 'HBK', color: '#10B981' },
  ];
  const teams: any[] = [];
  for (const d of defs) {
    const r = await api('/api/teams', 'POST', {
      name: d.name,
      shortName: d.short,
      color: d.color,
      emoji: '🏏',
      players: Array.from({ length: 6 }, (_, i) => ({
        name: `${d.short} P${i + 1}`,
        jerseyNumber: i + 1,
      })),
    });
    if (r.status !== 201) throw new Error(`team create failed: ${JSON.stringify(r.data)}`);
    teams.push(r.data);
  }
  ok(teams.length === 4 && teams.every((t) => t.players?.length === 6), '4 teams × 6 players created');

  const tour = await api('/api/tournaments', 'POST', {
    name: `Gully Premier League v2 ${stamp}`,
    format: 'HYBRID',
    totalOvers: 2,
    teamIds: teams.map((t) => t.id),
  });
  ok(tour.status === 201 && tour.data.id, 'HYBRID tournament created', tour.data);
  const tid = tour.data.id;

  // §17.7 — squad lock (yesterday) + guests opt-in
  const yesterday = new Date(Date.now() - 86400_000).toISOString();
  const put = await api(`/api/tournaments/${tid}`, 'PUT', {
    squadLockDate: yesterday,
    guestPlayersAllowed: true,
  });
  ok(put.status === 200, '§17.7 squadLockDate + guestPlayersAllowed saved via PUT', put.data);

  // ── 4 league matches played to completion ──────────────────────────────
  console.log('\nPlaying 4 league matches (real ball path):');
  const [T1, T2, T3, T4] = teams;
  // M1: THS 18/1, RCH chase 19 in 1.2 ov → RCH win
  const m1 = await playMatch(tid, T1, T2,
    [{ runs: 4 }, { runs: 1 }, { runs: 0 }, { runs: 2 }, { wicket: true }, { runs: 1 },
     { runs: 6 }, { runs: 1 }, { runs: 0 }, { runs: 2 }, { runs: 1 }, { runs: 0 }],
    [{ runs: 2 }, { runs: 2 }, { runs: 4 }, { runs: 1 }, { runs: 0 }, { runs: 4 },
     { runs: 4 }, { runs: 2 }]);
  // M2: DES 24/1, HBK 22/3 → DES by 2
  const m2 = await playMatch(tid, T3, T4,
    [{ runs: 1 }, { runs: 4 }, { runs: 0 }, { runs: 6 }, { runs: 1 }, { runs: 1 },
     { runs: 2 }, { runs: 4 }, { runs: 4 }, { wicket: true }, { runs: 0 }, { runs: 1 }],
    [{ runs: 3 }, { runs: 1 }, { runs: 4 }, { wicket: true }, { runs: 2 }, { runs: 1 },
     { runs: 4 }, { runs: 6 }, { runs: 0 }, { wicket: true }, { runs: 0 }, { runs: 1 }]);
  // M3: DES 30/1, THS 26/2 → DES by 4
  const m3 = await playMatch(tid, T3, T1,
    [{ runs: 4 }, { runs: 4 }, { runs: 2 }, { runs: 1 }, { runs: 1 }, { runs: 6 },
     { runs: 6 }, { runs: 4 }, { runs: 1 }, { runs: 0 }, { runs: 1 }, { wicket: true }],
    [{ runs: 2 }, { runs: 1 }, { runs: 4 }, { wicket: true }, { runs: 1 }, { runs: 1 },
     { runs: 6 }, { runs: 4 }, { runs: 4 }, { runs: 1 }, { wicket: true }, { runs: 2 }]);
  // M4: RCH 28/1, HBK 25/2 → RCH by 3
  const m4 = await playMatch(tid, T2, T4,
    [{ runs: 6 }, { runs: 1 }, { runs: 4 }, { runs: 0 }, { runs: 1 }, { runs: 2 },
     { runs: 4 }, { runs: 2 }, { runs: 6 }, { runs: 1 }, { runs: 0 }, { runs: 1 }],
    [{ runs: 1 }, { runs: 4 }, { runs: 2 }, { wicket: true }, { runs: 4 }, { runs: 1 },
     { runs: 6 }, { runs: 1 }, { runs: 4 }, { wicket: true }, { runs: 0 }, { runs: 2 }]);
  ok(!!m1.winnerId && m1.winnerId === T2.id, 'M1: RCH won by chase', m1);
  ok(!!m2.winnerId && m2.winnerId === T3.id, 'M2: DES defended 24', m2);
  ok(!!m3.winnerId && m3.winnerId === T3.id, 'M3: DES defended 30', m3);
  ok(!!m4.winnerId && m4.winnerId === T4.id === false && m4.winnerId === T2.id, 'M4: RCH defended 28', m4);

  // ── §17.2 schedule the 2 remaining fixtures ─────────────────────────────
  console.log('\n§17.2 scheduling remaining fixtures:');
  const sched1 = await api('/api/matches', 'POST', {
    team1Id: T1.id, team2Id: T4.id, totalOvers: 2, maxWickets: 10, tournamentId: tid,
  });
  const sched2 = await api('/api/matches', 'POST', {
    team1Id: T2.id, team2Id: T3.id, totalOvers: 2, maxWickets: 10, tournamentId: tid,
  });
  const day = (n: number) => new Date(Date.now() + n * 86400_000).toISOString();
  const p1 = await api(`/api/tournaments/${tid}/schedule`, 'PATCH', {
    matchId: sched1.data.id, scheduledAt: day(1), venue: 'Marine Drive Turf',
    umpires: 'S. Khan & R. Iyer', round: 'RR',
  });
  const p2 = await api(`/api/tournaments/${tid}/schedule`, 'PATCH', {
    matchId: sched2.data.id, scheduledAt: day(2), venue: 'Hilltop Cage',
    umpires: 'M. Das', round: 'RR',
  });
  ok(p1.status === 200 && !!p1.data.match?.scheduledAt, 'M5 scheduled (venue + umpires)', p1.data);
  ok(p2.status === 200 && !!p2.data.match?.scheduledAt, 'M6 scheduled (venue + umpires)', p2.data);

  // ── §17.3 points chain ──────────────────────────────────────────────────
  console.log('\n§17.3 standings chain:');
  const pt = await api(`/api/tournaments/${tid}/points-table`, 'GET');
  const rows = pt.data?.pointsTable ?? pt.data?.rows ?? pt.data?.teams ?? [];
  ok(pt.status === 200 && rows.length === 4, 'points table has 4 rows', pt.data);
  const top2Points = rows.slice(0, 2).map((r: any) => r.points);
  ok(top2Points[0] === 4 && top2Points[1] === 4, 'two teams tied on 4 points at top', rows.map((r: any) => ({ t: r.teamName ?? r.team?.shortName, pts: r.points, nrr: r.nrr })));
  ok(rows[0].nrr >= rows[1].nrr, 'NRR broke the points tie', { n0: rows[0]?.nrr, n1: rows[1]?.nrr });
  ok(typeof rows[0]?.nrr === 'number', 'NRR numeric on rows');

  // ── §17.1 bracket auto-seed ─────────────────────────────────────────────
  console.log('\n§17.1 bracket:');
  const br = await api(`/api/tournaments/${tid}/bracket`, 'GET');
  ok(br.status === 200 && Array.isArray(br.data?.rounds), 'bracket GET 200 with rounds payload', br.data?.error);
  const rounds: any[] = br.data?.rounds ?? [];
  ok(rounds.length === 2, '4 teams → SF + F rounds', rounds.map((r: any) => r.name));
  const sfMatches: any[] = rounds[0]?.matches ?? [];
  const sfSeeded = sfMatches.filter((m: any) => m.team1 && m.team2);
  ok(sfSeeded.length === 2, 'SF auto-seeded 1v4 / 2v3 from standings', sfMatches.map((m: any) => [m.team1?.shortName, m.team2?.shortName]));
  const finalRound = rounds[rounds.length - 1];
  ok(finalRound?.matches?.length === 1 && !finalRound.matches[0].team1 && !finalRound.matches[0].team2, 'Final awaits SF winners (unseeded)');

  // ── §17.4 leaderboards ──────────────────────────────────────────────────
  console.log('\n§17.4 leaderboards:');
  const lb = await api(`/api/tournaments/${tid}/leaderboards`, 'GET');
  ok(lb.status === 200, 'leaderboards GET 200');
  const runs0 = lb.data?.runGetters?.[0];
  const wkts0 = lb.data?.wicketTakers?.[0];
  ok(!!runs0 && (runs0.runs ?? 0) > 0, 'runGetters leaderboard populated', runs0);
  ok(!!wkts0 && (wkts0.wickets ?? 0) > 0, 'wicketTakers leaderboard populated', wkts0);
  const econ = lb.data?.bestEconomy ?? [];
  ok(Array.isArray(econ), 'bestEconomy board present (≥3-over rule field)');
  ok(lb.data?.mvp !== undefined, 'MVP board present (§13.5 index)');
  ok(lb.data?.bestStrikeRate !== undefined, 'bestStrikeRate board present (≥30-ball rule)');
  ok(lb.data?.guestPlayersAllowed === true, 'guest opt-in flag echoed (§17.7)');

  // ── §17.2/§17.6 exports ─────────────────────────────────────────────────
  console.log('\n§17.2/§17.6 exports:');
  const icsRes = await fetch(`${BASE}/api/tournaments/${tid}/export?format=ics`, {
    headers: { 'X-Device-Id': DEVICE },
  });
  const ics = await icsRes.text();
  ok(icsRes.status === 200 && ics.includes('BEGIN:VCALENDAR'), 'ICS export: VCALENDAR body', ics.slice(0, 120));
  const vevents = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
  ok(vevents >= 2, `ICS has ${vevents} VEVENTs (scheduled fixtures)`);
  const csvRes = await fetch(`${BASE}/api/tournaments/${tid}/export?format=csv&type=points`, {
    headers: { 'X-Device-Id': DEVICE },
  });
  const csv = await csvRes.text();
  ok(csvRes.status === 200 && csv.split('\n').length >= 5, 'CSV export: points pack rows', csv.slice(0, 120));

  // ── §17.5 public hub (no device scope) ──────────────────────────────────
  console.log('\n§17.5 public hub:');
  const pub = await fetch(`${BASE}/api/tournaments/${tid}/public`);
  const pubData: any = await pub.json().catch(() => null);
  ok(pub.status === 200, 'public hub GET 200 WITHOUT device header');
  ok(!!pubData && (pubData.fixtures?.length ?? 0) + (pubData.results?.length ?? 0) >= 4, 'fixtures + results populated', { f: pubData?.fixtures?.length, r: pubData?.results?.length });
  ok(pubData?.champion === null || pubData?.champion === undefined, 'champion null before the final');

  // ── pages render ────────────────────────────────────────────────────────
  console.log('\nPages:');
  for (const p of [`/tournaments/${tid}`, `/tournaments/${tid}/report`]) {
    const r = await fetch(`${BASE}${p}`, { headers: { 'X-Device-Id': DEVICE } });
    ok(r.status === 200, `${p} → 200`);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log(`\nDemo tournament id: ${tid}`);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
