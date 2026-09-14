/**
 * GULLYSCORE v2 §14 — SCORING UX E2E VERIFICATION (live server, API level)
 * ---------------------------------------------------------------------------
 * Verifies the server-side surfaces the §14 UX builds on:
 *   §14.0  buildinfo exposes the feature flags; `voice` defaults OFF
 *   §14.7  per-ball timestamps are stored (over-rate data source)
 *   §14.8  wizard-shaped start flow: PATCH toss (status LIVE) → innings →
 *          striker → bowler → LIVE scoring works in one sequence;
 *          guest players (§17.7) are created via the teams API with
 *          isGuest, appear in MATCH views, and NEVER pollute team rosters
 *   §14.10 undo + redo survive the wizard-shaped flow (event-sourced)
 *
 * Run: bun scripts/verify-v14-e2e.ts   (server on :3000)
 */

export {};
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const DEVICE = 'e2e-v14-device';

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

async function main() {
  console.log('→ GullyScore v2 §14 E2E verification\n');

  // ── §14.0/§14.11 — feature flags surface + voice default OFF ────────────
  const bi = await api('/api/buildinfo', 'GET');
  const flags = bi.data?.features ?? null;
  ok(bi.status === 200 && flags != null, 'buildinfo returns the flag set');
  ok(flags?.voice === false, '§14.11 voice flag defaults OFF', flags);

  // ── Setup ───────────────────────────────────────────────────────────────
  const stamp = Date.now().toString(36).slice(-5);
  const mkTeam = async (suffix: string, prefix: string, count: number) => {
    const res = await api('/api/teams', 'POST', {
      name: `E2E14 ${suffix} ${stamp}`,
      shortName: suffix.slice(0, 3).toUpperCase(),
      color: '#3B82F6',
      emoji: '🏏',
      players: Array.from({ length: count }, (_, i) => ({
        name: `${prefix}${i + 1}`,
        jerseyNumber: i + 1,
      })),
    });
    return res.data;
  };
  const batTeam = await mkTeam('BAT', 'Bat', 6);
  const bowlTeam = await mkTeam('BWL', 'Bowl', 3);
  ok(batTeam?.id && bowlTeam?.id, 'teams created');

  // ── §14.8/§17.7 — guest player lifecycle ────────────────────────────────
  const guestRes = await api(`/api/teams/${batTeam.id}/players`, 'POST', {
    name: `Guest ${stamp}`,
    isGuest: true,
  });
  ok(guestRes.status === 201 && guestRes.data?.isGuest === true, 'guest created with isGuest=true', guestRes.data);
  const guestId = guestRes.data?.id;

  const rosterRes = await api(`/api/teams/${batTeam.id}`, 'GET');
  const rosterIds = (rosterRes.data?.players ?? []).map((p: any) => p.id);
  ok(!rosterIds.includes(guestId), 'guest is filtered OUT of the team roster view', rosterIds.length);

  // ── §14.8 — the wizard-shaped start sequence (toss → XI → LIVE) ─────────
  const matchRes = await api('/api/matches', 'POST', {
    team1Id: batTeam.id,
    team2Id: bowlTeam.id,
    totalOvers: 8,
    maxWickets: 10,
    rules: { freeHitOnNoBall: true, ballsPerOver: 6, lastManStands: false },
  });
  const match = matchRes.data;
  ok(matchRes.status === 201 && match?.id, 'match created');

  // The match view INCLUDES the guest (scoring needs them, rosters don't)
  const matchGet = await api(`/api/matches/${match.id}`, 'GET');
  const matchPlayerIds = [
    ...((matchGet.data?.team1?.players ?? []).map((p: any) => p.id)),
  ];
  ok(matchPlayerIds.includes(guestId), 'guest is visible in the MATCH view (selectable in the XI)');

  // Step 1: the toss (wizard pickDecision does exactly this PATCH)
  const tossRes = await api(`/api/matches/${match.id}`, 'PATCH', {
    tossWinnerId: batTeam.id,
    tossDecision: 'BAT',
    status: 'LIVE',
  });
  ok(tossRes.status === 200 && tossRes.data?.status === 'LIVE', 'toss saved + match LIVE (wizard step 1)');

  // Step 2: create innings (wizard startLive step 1)
  const innRes = await api(`/api/matches/${match.id}/innings`, 'POST', {
    teamId: batTeam.id,
    inningsNumber: 1,
  });
  const innings = innRes.data;
  ok(innRes.status === 201 && innings?.id, 'innings created (wizard startLive)');

  // Step 3: openers from the XI top-two (guest opener — proves §17.7 flow)
  const batters: any[] = batTeam.players ?? [];
  const strikerRes = await api(`/api/matches/${match.id}/innings/${innings.id}/striker`, 'POST', {
    strikerId: batters[0].id,
    nonStrikerId: guestId,
  });
  ok(strikerRes.status === 200, 'openers set (guest at the non-striker end)', strikerRes.data);

  // Step 4: first bowler
  const bowlers: any[] = bowlTeam.players ?? [];
  const bowlerRes = await api(`/api/matches/${match.id}/innings/${innings.id}/bowler`, 'POST', {
    bowlerId: bowlers[0].id,
  });
  ok(bowlerRes.status === 200, 'first bowler set (wizard startLive)');

  // ── §14.7 — per-ball timestamp (over-rate data source) ──────────────────
  const ball1 = await api(`/api/matches/${match.id}/innings/${innings.id}/balls`, 'POST', {
    batsmanId: batters[0].id,
    bowlerId: bowlers[0].id,
    runs: 1,
    isWicket: false,
    extraType: null,
    extraRuns: 0,
  });
  ok(
    (ball1.status === 200 || ball1.status === 201) && ball1.data?.ball?.id != null,
    'ball recorded through the live flow'
  );
  ok(
    typeof ball1.data?.ball?.timestamp === 'string' && !Number.isNaN(Date.parse(ball1.data.ball.timestamp)),
    '§14.7 ball carries a parseable timestamp (over-rate source)',
    ball1.data?.ball?.timestamp
  );

  // Odd runs rotate strike: the guest must now be the striker (proves the
  // wizard-set pair flows through the v2 rotation engine)
  const innAfter = await api(`/api/matches/${match.id}`, 'GET');
  const liveInn = (innAfter.data?.innings ?? []).find((i: any) => i.inningsNumber === 1);
  ok(liveInn?.strikerId === guestId, 'strike rotated to the guest after an odd run', {
    strikerId: liveInn?.strikerId,
  });

  // ── §14.10 — undo + redo (event-sourced, available everywhere) ──────────
  const undoRes = await api(`/api/matches/${match.id}/innings/${innings.id}/balls/last`, 'DELETE');
  ok(undoRes.status === 200, 'undo works in the wizard-started match');

  const redoRes = await api(`/api/matches/${match.id}/innings/${innings.id}/balls/redo`, 'POST', {});
  ok(redoRes.status === 200, 'redo restores the ball (§14.10 redo until navigation)');

  // ── verdict ─────────────────────────────────────────────────────────────
  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('E2E crashed:', e);
  process.exit(1);
});
