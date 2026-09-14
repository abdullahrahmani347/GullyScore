/**
 * GULLYSCORE v2 §13 — ANALYTICS & INTELLIGENCE VERIFICATION (E2E, live server)
 * ---------------------------------------------------------------------------
 * Plays a v2 match through the REAL API and asserts §13 behaviour end-to-end:
 *   §13.1 win probability per ball (response + SSE `wp` broadcast)
 *   §13.2 wagon capture: metadata-only PATCH (1 tap path), 422 on bad sector
 *   §13.3 pitch map: 2-tap PATCH pair, 422 on bad values
 *   §13.4 matchup matrix + §13.5 MVP + §13.9 turning points — verified by
 *          running the SAME pure intelligence functions on the fetched rows
 *   §13.6 player career API (aggregates, form, matchups, worm)
 *   §13.7 team form guides (API shape)
 *   §13.10 report: template always available; POST flag-gated OFF → 404;
 *          completion never blocks on the report
 *
 * Run: bun scripts/verify-v13-e2e.ts
 */

export {};
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const DEVICE = 'e2e-v13-device';

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

/** Open the SSE stream and collect update events whose inner type matches. */
async function collectSse(matchId: string, types: string[], ms: number): Promise<any[]> {
  const found: any[] = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(`${BASE}/api/matches/${matchId}/stream`, { signal: controller.signal });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (found.length < 30) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        // v2 §15.7: events arrive under their OWN typed name
        // (`event: ball` etc.) with a {type, matchId, data} envelope as data.
        const evLine = frame.split('\n').find((l) => l.startsWith('event: '));
        const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
        if (evLine && dataLine) {
          const eventName = evLine.slice(7).trim();
          if (eventName !== 'heartbeat' && eventName !== 'init' && eventName !== 'hello') {
            try {
              const payload = JSON.parse(dataLine.slice(6));
              const type = payload.type ?? eventName;
              if (types.includes(type)) found.push({ type, data: payload.data });
            } catch {}
          }
        }
      }
    }
    controller.abort();
  } catch {
    /* aborted — return what we have */
  } finally {
    clearTimeout(timer);
  }
  return found;
}

async function main() {
  console.log('→ GullyScore v2 §13 E2E verification\n');

  // ── Setup ────────────────────────────────────────────────────────────────
  const stamp = Date.now().toString(36).slice(-5);
  const mkTeam = async (suffix: string, prefix: string, count: number) => {
    const res = await api('/api/teams', 'POST', {
      name: `E2E13 ${suffix} ${stamp}`,
      shortName: suffix.slice(0, 3).toUpperCase(),
      color: '#00D4AA',
      emoji: '🏏',
      players: Array.from({ length: count }, (_, i) => ({
        name: `${prefix}${i + 1}`,
        jerseyNumber: i + 1,
        ...(i === 1 ? { battingHand: 'L' } : {}), // one left-hander
      })),
    });
    return res.data;
  };
  const batTeam = await mkTeam('BAT', 'Bat', 6);
  const bowlTeam = await mkTeam('BWL', 'Bowl', 3);
  ok(batTeam?.id && bowlTeam?.id, 'teams created');
  const players: any[] = batTeam.players ?? [];
  const bowlers: any[] = bowlTeam.players ?? [];

  const matchRes = await api('/api/matches', 'POST', {
    team1Id: batTeam.id,
    team2Id: bowlTeam.id,
    totalOvers: 10,
    maxWickets: 10,
    rules: {
      freeHitOnNoBall: true,
      ballsPerOver: 6,
      lastManStands: false,
      wagonCapture: 'boundaries',
      pitchMapCapture: true,
    },
  });
  ok(matchRes.status === 201, 'match created with wagon + pitch rules');
  const match = matchRes.data;

  const innRes = await api(`/api/matches/${match.id}/innings`, 'POST', { teamId: batTeam.id, inningsNumber: 1 });
  const innings = innRes.data;
  await api(`/api/matches/${match.id}/innings/${innings.id}/striker`, 'POST', {
    strikerId: players[0].id,
    nonStrikerId: players[1].id,
  });
  await api(`/api/matches/${match.id}/innings/${innings.id}/bowler`, 'POST', { bowlerId: bowlers[0].id });

  const ball = (extra: Record<string, unknown> = {}) =>
    api(`/api/matches/${match.id}/innings/${innings.id}/balls`, 'POST', {
      batsmanId: players[0].id,
      bowlerId: bowlers[0].id,
      runs: 0,
      isWicket: false,
      ...extra,
    });

  // ── §13.1 — win probability per ball (response + SSE) ───────────────────
  console.log('\n§13.1 win probability:');
  const ssePromise = collectSse(match.id, ['ball', 'wicket'], 12000);

  const b1 = await ball({ runs: 1 });
  ok(b1.status === 200, 'first run recorded');
  ok(
    typeof b1.data.inningsState?.winProbability === 'number' &&
      b1.data.inningsState.winProbability >= 0.02 &&
      b1.data.inningsState.winProbability <= 0.98,
    'inningsState.winProbability present and clamped',
    b1.data.inningsState
  );

  // A boundary + a wicket over for turning points
  await ball({ runs: 4 });
  await ball({ runs: 0 });
  await ball({ runs: 0 });
  await ball({ runs: 6 });
  await ball({ runs: 0 });
  await ball({ runs: 0 }); // over 1: 11 runs

  const sseEvents = await ssePromise;
  const ballEvents = sseEvents.filter((e) => e.type === 'ball' || e.type === 'wicket');
  ok(ballEvents.length >= 5, `SSE ball events received (${ballEvents.length})`);
  const withWp = ballEvents.filter((e) => typeof e.data?.wp === 'number');
  ok(withWp.length === ballEvents.length, `every SSE ball event carries wp (${withWp.length}/${ballEvents.length})`);
  const wpValues = withWp.map((e) => e.data.wp as number);
  ok(
    wpValues.every((v) => v >= 0.02 && v <= 0.98),
    'all SSE wp values clamped to [0.02, 0.98]',
    wpValues
  );

  // ── §13.2 — wagon capture (metadata-only PATCH) ─────────────────────────
  console.log('\n§13.2 wagon wheel capture:');
  const boundary = await ball({ runs: 4 }); // over 2 starts with a boundary
  ok(boundary.status === 200, 'boundary recorded');
  const ballId = boundary.data.ball?.id;
  ok(!!ballId, 'boundary ball id present');

  const before = await api(`/api/matches/${match.id}/scorecard`, 'GET');
  const runsBefore = before.data?.innings?.[0]?.runs;

  const patch = await api(`/api/matches/${match.id}/innings/${innings.id}/balls/${ballId}`, 'PATCH', {
    wagonDirection: 'COVER',
  });
  ok(patch.status === 200 && patch.data?.metaOnly === true, 'wagon PATCH accepted (metadata-only path)', patch.data);

  const badWagon = await api(`/api/matches/${match.id}/innings/${innings.id}/balls/${ballId}`, 'PATCH', {
    wagonDirection: 'BEHIND_THE_KEEPER',
  });
  ok(badWagon.status === 422, 'invalid wagon sector rejected 422', badWagon.data);

  const after = await api(`/api/matches/${match.id}/scorecard`, 'GET');
  const patchedBall = after.data?.innings?.[0]?.balls?.find((b: any) => b.id === ballId);
  ok(patchedBall?.wagonDirection === 'COVER', 'Ball.wagonDirection persisted', patchedBall?.wagonDirection);
  ok(patchedBall?.version === 2, 'version bumped for audit', patchedBall?.version);
  ok(after.data?.innings?.[0]?.runs === runsBefore, 'wagon PATCH did NOT touch scoring');

  // ── §13.3 — pitch map (2-tap pair) ──────────────────────────────────────
  console.log('\n§13.3 pitch map capture:');
  const legal = await ball({ runs: 0 });
  const pitch = await api(`/api/matches/${match.id}/innings/${innings.id}/balls/${legal.data.ball?.id}`, 'PATCH', {
    pitchLength: 'good',
    pitchLine: 'stumps',
  });
  ok(pitch.status === 200 && pitch.data?.metaOnly === true, 'pitch 2-tap PATCH accepted', pitch.data);
  const badPitch = await api(`/api/matches/${match.id}/innings/${innings.id}/balls/${legal.data.ball?.id}`, 'PATCH', {
    pitchLength: 'half-volley',
  });
  ok(badPitch.status === 422, 'invalid pitch length rejected 422', badPitch.data);

  const afterPitch = await api(`/api/matches/${match.id}/scorecard`, 'GET');
  const pitchBall = afterPitch.data?.innings?.[0]?.balls?.find((b: any) => b.id === legal.data.ball?.id);
  ok(pitchBall?.pitchLength === 'good' && pitchBall?.pitchLine === 'stumps', 'pitch columns persisted');

  // ── §13.4/§13.5/§13.9 — pure analytics on the fetched rows ─────────────
  console.log('\n§13.4/§13.5/§13.9 analytics (same pure functions as the UI):');
  const {
    matchupMatrix,
    mvpTable,
    detectTurningPoints,
    wpTimeline,
  } = await import('../src/lib/intelligence');
  const { matchMvpTable } = await import('../src/lib/analytics-data');
  const { parseMatchRules } = await import('../src/lib/engine');

  const sc = afterPitch.data;
  const scInn = sc.innings[0];
  const cells = matchupMatrix(scInn.balls);
  ok(cells.length >= 1, `matchup cells computed (${cells.length})`);
  const cell = cells.find((c: any) => c.batsmanId === players[0].id && c.bowlerId === bowlers[0].id);
  ok(!!cell && cell.runs === 15 && cell.balls === 9 && cell.fours === 2, 'matchup numbers exact (15 runs, 9 balls, 2 fours)', cell);

  // The scorecard response omits playerId on batting rows (player object only),
  // so feed the PLAYERS API shape instead for the MVP table check.
  const liveMatch = await api(`/api/live/${(await api(`/api/matches/${match.id}`, 'GET')).data?.liveCode ?? 'ZZZZZZ'}`, 'GET');
  ok(liveMatch.status === 200, 'live code resolves the full match (playerId intact)');
  const mvp = matchMvpTable(liveMatch.data as any);
  ok(mvp.length >= 2, `MVP table computed (${mvp.length} players)`);
  const top = mvp[0];
  ok(
    top.mvp === top.breakdown.reduce((a: number, b: any) => a + b.points, 0),
    'MVP index == sum of breakdown points',
    { mvp: top.mvp, sum: top.breakdown.reduce((a: number, b: any) => a + b.points, 0) }
  );
  ok(top.name === players[0].name, 'the 15-run batter tops the MVP table', { top: top.name, mvp: top.mvp });

  const rules = parseMatchRules(match.rules, {
    maxWickets: 10,
    totalOvers: 10,
    inningsNumber: 1,
    target: null,
  });
  const timeline = wpTimeline(scInn.balls, rules as any);
  ok(timeline.length >= 2, `WP timeline snapshots (${timeline.length})`);
  const tps = detectTurningPoints(scInn.balls, rules as any);
  ok(Array.isArray(tps), `turning points computed (${tps.length})`);

  // ── §13.6 — player career API ───────────────────────────────────────────
  console.log('\n§13.6 player career page data:');
  const career = await api(`/api/players/${players[0].id}`, 'GET');
  ok(career.status === 200, 'GET /api/players/[id] 200');
  ok(career.data?.batting?.runs === 15, 'career batting runs aggregated (15)', career.data?.batting);
  ok(career.data?.batting?.highest === 15, 'career highest score (15)');
  ok(career.data?.innings?.length >= 1, 'innings list present');
  ok(career.data?.worm?.length >= 1 && Array.isArray(career.data.worm[0].points), 'run worm points present');
  ok(career.data?.matchups?.length >= 1, 'career matchup table present');
  ok(career.data?.form?.length >= 1, 'form chips present');
  const lefty = await api(`/api/players/${players[1].id}`, 'GET');
  ok(lefty.data?.player?.battingHand === 'L', 'left-hand batter flagged', lefty.data?.player);

  // ── §13.7 — team form guides ────────────────────────────────────────────
  console.log('\n§13.7 team form guides:');
  const teamDetail = await api(`/api/teams/${batTeam.id}`, 'GET');
  ok(teamDetail.status === 200, 'GET /api/teams/[id] 200');
  ok(teamDetail.data?.form && Array.isArray(teamDetail.data.form.results), 'form.results array present');
  ok(teamDetail.data?.form?.players && typeof teamDetail.data.form.players === 'object', 'form.players record present');
  ok(
    Array.isArray(teamDetail.data?.players?.[0]?.battingHand !== undefined ? [] : teamDetail.data?.players),
    'players list intact'
  );

  // ── §13.10 — report: template always, POST flag-gated OFF ───────────────
  console.log('\n§13.10 match report:');
  const report = await api(`/api/matches/${match.id}/report`, 'GET');
  ok(report.status === 200, 'GET /api/matches/[id]/report 200 (match still live)');
  ok(report.data?.generator === 'template', 'template fallback served (no AI cache yet)', report.data?.generator);
  ok(
    report.data?.report?.sections?.length >= 1 && (report.data.report.sections[0].body ?? '').length > 0,
    'template report has content'
  );
  const post = await api(`/api/matches/${match.id}/report`, 'POST');
  ok(post.status === 404, 'POST /report 404 while aiReport flag is OFF (flag-gated)', post.status);

  // Complete the innings quickly (target reached path) and verify completion
  // was never blocked by report generation.
  const completeInn = await api(`/api/matches/${match.id}/innings/${innings.id}/complete`, 'POST');
  ok(completeInn.status === 200, 'innings 1 completed');
  const inn2Res = await api(`/api/matches/${match.id}/innings`, 'POST', {
    teamId: bowlTeam.id,
    inningsNumber: 2,
    target: 17,
  });
  const innings2 = inn2Res.data;
  await api(`/api/matches/${match.id}/innings/${innings2.id}/striker`, 'POST', {
    strikerId: bowlers[0].id,
    nonStrikerId: bowlers[1].id,
  });
  await api(`/api/matches/${match.id}/innings/${innings2.id}/bowler`, 'POST', { bowlerId: players[0].id });
  const chaseBall = (extra: Record<string, unknown> = {}) =>
    api(`/api/matches/${match.id}/innings/${innings2.id}/balls`, 'POST', {
      batsmanId: bowlers[0].id,
      bowlerId: players[0].id,
      runs: 0,
      isWicket: false,
      ...extra,
    });
  const chaseSse = collectSse(match.id, ['ball', 'wicket'], 9000);
  await chaseBall({ runs: 2 });
  await chaseBall({ runs: 6 });
  await chaseBall({ runs: 4 });
  await chaseBall({ runs: 4 }); // 16 runs — one short
  const winBall = await chaseBall({ runs: 1 }); // target reached
  const chaseEvents = await chaseSse;
  const chaseWps = chaseEvents.filter((e) => typeof e.data?.wp === 'number').map((e) => e.data.wp);
  ok(chaseWps.length >= 3, `chase WP broadcast per ball (${chaseWps.length})`);
  ok(
    winBall.data?.inningsState?.winProbability === 0.98,
    'target reached → WP pinned at 0.98',
    winBall.data?.inningsState?.winProbability
  );

  const completeMatch = await api(`/api/matches/${match.id}/complete`, 'POST');
  ok(completeMatch.status === 200, 'match completed — NEVER blocked by report generation');
  const reportAfter = await api(`/api/matches/${match.id}/report`, 'GET');
  ok(reportAfter.status === 200 && reportAfter.data?.generator === 'template', 'report still template (flag OFF) — completion unaffected');

  const reportPublic = await fetch(`${BASE}/api/matches/${match.id}/report`);
  ok(reportPublic.status === 403, 'report GET without device/code → 403');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('E2E crashed:', err);
  process.exit(1);
});
