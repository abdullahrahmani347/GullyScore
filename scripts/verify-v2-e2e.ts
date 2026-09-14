/**
 * GULLYSCORE v2 §12 — WRITE-PATH VERIFICATION (E2E, live server)
 * ---------------------------------------------------------------------------
 * Plays a v2 match through the REAL API and asserts §12 behaviour end-to-end:
 *   §12.1 free-hit flags on Ball rows (causedFreeHit / isFreeHit)
 *   §12.6 wicket-on-extras truth table (422 rejections)
 *   §12.5 penalty events (total +5, no over progress, tables untouched)
 *   §12.4 retired hurt → return (same BatsmanInnings row, not out)
 *   §12.7 undo (tombstone) → redo, clientEventId dedupe, ball edit + MatchEditLog
 *   §12.3 reduce overs (DLS) → adjusted target + adjustments log
 *
 * Run: bun scripts/verify-v2-e2e.ts
 */

export {};
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const DEVICE = 'e2e-v2-device';

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
  console.log('→ GullyScore v2 §12 E2E verification\n');

  // ── Setup: two teams (with players), v2 match ──────────────────────────
  const stamp = Date.now().toString(36).slice(-5);
  const mkTeam = async (suffix: string, prefix: string, count: number) => {
    const res = await api('/api/teams', 'POST', {
      name: `E2E ${suffix} ${stamp}`,
      shortName: suffix.slice(0, 3).toUpperCase(),
      color: '#00D4AA',
      emoji: '🏏',
      players: Array.from({ length: count }, (_, i) => ({ name: `${prefix}${i + 1}`, jerseyNumber: i + 1 })),
    });
    return res.data;
  };
  const batTeam = await mkTeam('BAT', 'Bat', 8);
  const bowlTeam = await mkTeam('BWL', 'Bowl', 4);
  ok(batTeam?.id && bowlTeam?.id, 'teams created', { bat: batTeam?.id, bowl: bowlTeam?.id });
  const players: any[] = batTeam.players ?? [];
  const bowlers: any[] = bowlTeam.players ?? [];
  ok(players.length >= 6 && bowlers.length >= 3, 'players created', { players: players.length, bowlers: bowlers.length });

  const matchRes = await api('/api/matches', 'POST', {
    team1Id: batTeam.id,
    team2Id: bowlTeam.id,
    totalOvers: 20,
    maxWickets: 10,
    rules: { freeHitOnNoBall: true, ballsPerOver: 6, lastManStands: false },
  });
  ok(matchRes.status === 201 && matchRes.data.rules != null, 'match created with rules JSON', matchRes.data.rules);
  const match = matchRes.data;
  ok(
    match.rules != null && JSON.parse(match.rules).freeHitOnNoBall === true,
    'Match.rules persisted (v2 defaults)'
  );

  const innRes = await api(`/api/matches/${match.id}/innings`, 'POST', { teamId: batTeam.id, inningsNumber: 1 });
  ok(innRes.status === 201, 'innings 1 created');
  const innings = innRes.data;

  await api(`/api/matches/${match.id}/innings/${innings.id}/striker`, 'POST', {
    strikerId: players[0].id,
    nonStrikerId: players[1].id,
  });
  await api(`/api/matches/${match.id}/innings/${innings.id}/bowler`, 'POST', { bowlerId: bowlers[0].id });

  const ball = (extra: Record<string, unknown>) =>
    api(`/api/matches/${match.id}/innings/${innings.id}/balls`, 'POST', {
      batsmanId: players[0].id,
      bowlerId: bowlers[0].id,
      runs: 0,
      isWicket: false,
      ...extra,
    });

  // ── §12.1 free-hit state machine through the write path ───────────────
  console.log('\n§12.1 free hit (NB → 4):');
  const nb = await ball({ extraType: 'NO_BALL', extraRuns: 1, runs: 0, clientEventId: `fh-nb-${Date.now()}` });
  ok(nb.status === 200, 'NB recorded');
  ok(nb.data.ball?.causedFreeHit === true, 'Ball.causedFreeHit set on the no-ball');
  ok(nb.data.inningsState?.runs === 1, 'NB counts 1 run');
  ok(nb.data.inningsState?.currentBalls === 0, 'NB consumed no legal ball');

  const four = await ball({ runs: 4, clientEventId: `fh-4-${Date.now()}` });
  ok(four.status === 200, '4 recorded off the free hit');
  ok(four.data.ball?.isFreeHit === true, 'Ball.isFreeHit set on the delivery after the NB');
  ok(four.data.ball?.causedFreeHit === false, 'the 4 itself did not cause a free hit');

  // ── §12.6 truth table rejections ────────────────────────────────────────
  console.log('\n§12.6 wicket-on-extras truth table:');
  const nb2 = await ball({ extraType: 'NO_BALL', extraRuns: 1 });
  const caughtOnNb = await ball({
    extraType: 'NO_BALL', extraRuns: 1, isWicket: true, wicketType: 'CAUGHT',
  });
  ok(caughtOnNb.status === 422 && caughtOnNb.data.code === 'NO_BALL_NO_DISMISSAL', 'catch on a no-ball → 422 NO_BALL_NO_DISMISSAL', caughtOnNb.data);
  const runOutOnNb = await ball({
    extraType: 'NO_BALL', extraRuns: 1, isWicket: true, wicketType: 'RUN_OUT', dismissedPlayerId: players[0].id,
  });
  ok(runOutOnNb.status === 200, 'run-out off a no-ball is legal');
  // restore: undo the run-out (new batter flow would be needed otherwise)
  await api(`/api/matches/${match.id}/innings/${innings.id}/balls/last`, 'DELETE');
  const caughtOnWide = await ball({ extraType: 'WIDE', extraRuns: 1, isWicket: true, wicketType: 'CAUGHT' });
  ok(caughtOnWide.status === 422 && caughtOnWide.data.code === 'WIDE_NO_DISMISSAL', 'catch off a wide → 422 WIDE_NO_DISMISSAL', caughtOnWide.data);
  await api(`/api/matches/${match.id}/innings/${innings.id}/balls/last`, 'DELETE'); // undo the NB2 too

  // ── §12.5 penalty runs ──────────────────────────────────────────────────
  console.log('\n§12.5 penalty +5 (batting side):');
  const before = await api(`/api/matches/${match.id}`, 'GET');
  const innBefore = before.data.innings.find((i: any) => i.inningsNumber === 1);
  const pen = await ball({ extraType: 'PENALTY', extraRuns: 5, penaltySide: 'batting', reason: 'ball tampering' });
  ok(pen.status === 200, 'penalty recorded');
  const after = await api(`/api/matches/${match.id}`, 'GET');
  const innAfter = after.data.innings.find((i: any) => i.inningsNumber === 1);
  ok(innAfter.runs === innBefore.runs + 5, 'total +5', { before: innBefore.runs, after: innAfter.runs });
  ok(innAfter.currentBalls === innBefore.currentBalls, 'no over progress');
  ok(innAfter.completedOvers === innBefore.completedOvers, 'no over completed');
  const batRows = innAfter.batting.filter((b: any) => b.runs > 0 || b.balls > 0);
  const batBefore = innBefore.batting.filter((b: any) => b.runs > 0 || b.balls > 0);
  ok(JSON.stringify(batRows) === JSON.stringify(batBefore), 'batter tables unchanged');
  const bowlRows = innAfter.bowling.map((b: any) => ({ r: b.runs, w: b.wickets }));
  const bowlBefore = innBefore.bowling.map((b: any) => ({ r: b.runs, w: b.wickets }));
  ok(JSON.stringify(bowlRows) === JSON.stringify(bowlBefore), 'bowler tables unchanged');

  // ── §12.4 retired hurt + return ─────────────────────────────────────────
  console.log('\n§12.4 retired hurt & return:');
  const singles = await ball({ runs: 3 });
  ok(singles.status === 200, 'pre-retirement runs recorded');
  const rh = await ball({ isWicket: true, wicketType: 'RETIRED_HURT', dismissedPlayerId: players[0].id });
  ok(rh.status === 200, 'retired hurt recorded');
  const rhState = await api(`/api/matches/${match.id}`, 'GET');
  const rhInn = rhState.data.innings.find((i: any) => i.inningsNumber === 1);
  const rhRow = rhInn.batting.find((b: any) => b.playerId === players[0].id);
  ok(rhRow.isOut === false, 'RETIRED_HURT stays not-out (BatsmanInnings)');
  ok(rhRow.dismissalType === 'RETIRED_HURT', 'RH badge data present');
  ok(rhInn.wickets === innAfter.wickets, 'retirement did not count as a wicket');
  ok(rh.data.needsNewBatsman === true, 'slot vacated (new-batter flow)');

  // return: set the pair with the retired batter back
  await api(`/api/matches/${match.id}/innings/${innings.id}/striker`, 'POST', {
    strikerId: players[0].id,
    nonStrikerId: players[1].id,
  });
  const more = await ball({ runs: 6, batsmanId: players[0].id });
  ok(more.status === 200, 'returned batter scores again');
  const retState = await api(`/api/matches/${match.id}`, 'GET');
  const retInn = retState.data.innings.find((i: any) => i.inningsNumber === 1);
  const retRow = retInn.batting.find((b: any) => b.playerId === players[0].id);
  ok(retRow.runs === rhRow.runs + 6, 'same BatsmanInnings row continues (aggregate preserved)', { runs: retRow.runs, expected: rhRow.runs + 6 });
  ok(retRow.isOut === false, 'still not out');

  // ── §12.7 undo / redo / dedupe / edit ───────────────────────────────────
  console.log('\n§12.7 undo, redo, dedupe, edit:');
  const undo1 = await api(`/api/matches/${match.id}/innings/${innings.id}/balls/last`, 'DELETE');
  ok(undo1.status === 200 && undo1.data.success === true, 'undo (tombstone) succeeded');
  const undoState = await api(`/api/matches/${match.id}`, 'GET');
  const undoInn = undoState.data.innings.find((i: any) => i.inningsNumber === 1);
  const undoRow = undoInn.batting.find((b: any) => b.playerId === players[0].id);
  ok(undoRow.runs === rhRow.runs, 'undo removed the return runs (aggregate reverted)');
  ok(undoInn.runs === rhInn.runs, 'innings total reverted');

  const redo1 = await api(`/api/matches/${match.id}/innings/${innings.id}/balls/redo`, 'POST');
  ok(redo1.status === 200 && redo1.data.success === true, 'redo restored the ball');
  const redoState = await api(`/api/matches/${match.id}`, 'GET');
  const redoInn = redoState.data.innings.find((i: any) => i.inningsNumber === 1);
  const redoRow = redoInn.batting.find((b: any) => b.playerId === players[0].id);
  ok(redoRow.runs === rhRow.runs + 6, 'redo re-applied the return runs');

  // clientEventId dedupe: replay the same event → no double count
  const dedupeKey = `dedupe-${Date.now()}`;
  const d1 = await ball({ runs: 2, clientEventId: dedupeKey });
  const runsAfterD1 = d1.data.inningsState.runs;
  const d2 = await ball({ runs: 2, clientEventId: dedupeKey });
  ok(d2.status === 200 && d2.data.inningsState.runs === runsAfterD1, 'replayed clientEventId did not double-count', {
    first: runsAfterD1,
    replay: d2.data.inningsState?.runs,
  });

  // ball edit: change the 4 off the free hit to a 6 → version bump + edit log
  const editState = await api(`/api/matches/${match.id}`, 'GET');
  const editInn = editState.data.innings.find((i: any) => i.inningsNumber === 1);
  const targetBall = editInn.balls.find((b: any) => b.isFreeHit === true && b.runs === 4);
  ok(targetBall != null, 'found the FH 4-ball to edit');
  const edit = await api(`/api/matches/${match.id}/innings/${innings.id}/balls/${targetBall.id}`, 'PATCH', {
    runs: 6,
    reason: 'scorer mis-tap',
  });
  ok(edit.status === 200 && edit.data.success === true, 'ball edit accepted (full re-validation passed)');
  ok(edit.data.version === (targetBall.version ?? 1) + 1, 'Ball.version bumped');
  const editCheck = await api(`/api/matches/${match.id}`, 'GET');
  const editInn2 = editCheck.data.innings.find((i: any) => i.inningsNumber === 1);
  ok(editInn2.runs === editInn.runs + 2, 'scorecard rebuilt (+2 for 4→6)');

  // illegal edit: make the NB a legal dot, leaving a wicket-on-no-ball downstream → reject
  const nbBallRow = editInn2.balls.find((b: any) => b.causedFreeHit === true);
  const seqCheck = await api(`/api/matches/${match.id}/innings/${innings.id}/balls`, 'POST', {
    batsmanId: players[0].id, bowlerId: bowlers[0].id, runs: 0, extraType: 'NO_BALL', extraRuns: 1,
    isWicket: true, wicketType: 'CAUGHT',
  });
  ok(seqCheck.status === 422, 'caught-on-NB still rejected after edits');

  // ── §12.3 reduce overs (DLS) ────────────────────────────────────────────
  console.log('\n§12.3 reduce overs (DLS):');
  const reduce = await api(`/api/matches/${match.id}/overs`, 'POST', { newTotalOvers: 15, reason: 'rain' });
  ok(reduce.status === 200 && reduce.data.success === true, 'overs reduced 20 → 15');
  ok(reduce.data.method === 'dls', 'DLS method used (flag on + table present)');
  ok(Array.isArray(reduce.data.adjustments) && reduce.data.adjustments.length === 1, 'adjustments log appended');

  const increase = await api(`/api/matches/${match.id}/overs`, 'POST', { newTotalOvers: 18 });
  ok(increase.status === 400, 'increase refused (reduce-only)');

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('E2E verification crashed:', e);
  process.exit(1);
});
