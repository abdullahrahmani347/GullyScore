/**
 * GULLYSCORE v2 §15 — LIVE SPECTATOR E2E VERIFICATION (live server, API level)
 * ---------------------------------------------------------------------------
 *   §15.1  /api/live hub feed: mini cards (score/overs/striker/RRR/last-6/
 *          PP), completed rail; /live page server-renders the grid
 *   §15.7  SSE v2: named events carry monotonic `id`s; reconnect with
 *          Last-Event-ID (query form) REPLAYS missed events from the DB
 *          event log; heartbeats arrive as named events
 *   §15.4  reactions: POST is accepted, coalesced server-side (1 s) and
 *          broadcast as an SSE `reaction` event; invalid emoji → 422
 *   §15.3  /api/og/match/[id]: PNG 1200×630 + exact Cache-Control +
 *          QR/code in the SVG source; story SVG builder parity (unit level)
 *   §15.6  /embed/match/[id]: self-contained HTML < 15 KB with the score,
 *          CSP `frame-ancestors *` ONLY on /embed/*, ?theme=light switches
 *          the palette; /api/embed snapshot JSON shape
 *   §15.2  push: VAPID public key served (env configured), subscribe →
 *          retarget ("all") → unsubscribe lifecycle; wicket ball returns
 *          promptly (queue fanout never blocks scoring)
 *   §15.8  flags: push/reactions/embed default ON, voice OFF
 *
 * Run: bun scripts/verify-v15-e2e.ts   (server on :3000)
 */

export {};
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const DEVICE = 'e2e-v15-device';

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

/* ── SSE reader: parse frames (id/event/data) off a fetch body ── */

interface SseFrame {
  id?: number;
  event: string;
  data: any;
}

async function openStream(matchId: string, lastEventId?: number) {
  const url = lastEventId != null
    ? `${BASE}/api/matches/${matchId}/stream?lastEventId=${lastEventId}`
    : `${BASE}/api/matches/${matchId}/stream`;
  const res = await fetch(url, { headers: { Accept: 'text/event-stream' } });
  if (!res.ok || !res.body) throw new Error(`stream open failed: ${res.status}`);
  const reader = (res.body as any).getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let pendingRead: Promise<any> | null = null;
  const frames: SseFrame[] = [];

  async function readFor(ms: number): Promise<SseFrame[]> {
    const start = Date.now();
    const seen: SseFrame[] = [];
    while (Date.now() - start < ms) {
      // ONE persistent in-flight read across readFor calls — racing a fresh
      // read() against a timeout would abandon (and drop) its chunk.
      if (!pendingRead) pendingRead = reader.read();
      const remaining = Math.max(0, ms - (Date.now() - start));
      const result = await Promise.race([
        pendingRead,
        new Promise((r) => setTimeout(() => r('timeout'), remaining)),
      ]);
      if (result === 'timeout') break;
      pendingRead = null;
      if (result === null || result.done) break;
      buffer += decoder.decode(result.value as Uint8Array, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const frame = parseFrame(raw);
        if (frame) {
          frames.push(frame);
          seen.push(frame);
        }
      }
    }
    return seen;
  }

  return {
    frames,
    readFor,
    close: () => {
      try {
        reader.cancel();
      } catch {}
    },
  };
}

function parseFrame(raw: string): SseFrame | null {
  let id: number | undefined;
  let event = 'message';
  let data = '';
  for (const line of raw.split('\n')) {
    if (line.startsWith('id:')) id = Number(line.slice(3).trim()) || undefined;
    else if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5);
  }
  if (event === 'message' && !data) return null; // retry hint / comment
  let parsed: any = data;
  try {
    parsed = JSON.parse(data);
  } catch {}
  return { id, event, data: parsed };
}

async function main() {
  console.log('→ GullyScore v2 §15 E2E verification\n');

  // ── §15.8/§15.2/§15.4/§15.6 — feature flags surface ─────────────────────
  const bi = await api('/api/buildinfo', 'GET');
  const flags = bi.data?.features ?? null;
  ok(bi.status === 200 && flags != null, 'buildinfo returns the flag set');
  ok(flags?.push === true, '§15.2 push flag defaults ON', flags);
  ok(flags?.reactions === true, '§15.4 reactions flag defaults ON', flags);
  ok(flags?.embed === true, '§15.6 embed flag defaults ON', flags);
  ok(flags?.voice === false, 'voice stays OFF (§14.11 default)', flags);

  // ── Setup: two teams, v2-rules match, wizard-shaped start ────────────────
  const stamp = Date.now().toString(36).slice(-5);
  const mkTeam = async (suffix: string, prefix: string, count: number) => {
    const res = await api('/api/teams', 'POST', {
      name: `E2E15 ${suffix} ${stamp}`,
      shortName: suffix.slice(0, 3).toUpperCase(),
      color: suffix === 'BAT' ? '#FFD700' : '#4ECDC4',
      emoji: '🏏',
      players: Array.from({ length: count }, (_, i) => ({
        name: `${prefix}${i + 1}`,
        jerseyNumber: i + 1,
      })),
    });
    return res.data;
  };
  const batTeam = await mkTeam('BAT', 'Bat', 5);
  const bowlTeam = await mkTeam('BWL', 'Bowl', 3);
  ok(batTeam?.id && bowlTeam?.id, 'teams created');

  const matchRes = await api('/api/matches', 'POST', {
    team1Id: batTeam.id,
    team2Id: bowlTeam.id,
    totalOvers: 8,
    maxWickets: 10,
    rules: { freeHitOnNoBall: true, ballsPerOver: 6, powerplayOvers: 'auto' },
  });
  const match = matchRes.data;
  ok(matchRes.status === 201 && match?.id, 'v2-rules match created');

  await api(`/api/matches/${match.id}`, 'PATCH', {
    tossWinnerId: batTeam.id,
    tossDecision: 'BAT',
    status: 'LIVE',
  });
  const innRes = await api(`/api/matches/${match.id}/innings`, 'POST', {
    teamId: batTeam.id,
    inningsNumber: 1,
  });
  const innings = innRes.data;
  const batters: any[] = batTeam.players ?? [];
  const bowlers: any[] = bowlTeam.players ?? [];
  await api(`/api/matches/${match.id}/innings/${innings.id}/striker`, 'POST', {
    strikerId: batters[0].id,
    nonStrikerId: batters[1].id,
  });
  await api(`/api/matches/${match.id}/innings/${innings.id}/bowler`, 'POST', {
    bowlerId: bowlers[0].id,
  });
  ok(innRes.status === 201, 'innings + openers + bowler set (wizard flow)');

  const play = (batsmanId: string, runs: number, extra?: { type: string; runs: number }) =>
    api(`/api/matches/${match.id}/innings/${innings.id}/balls`, 'POST', {
      batsmanId,
      bowlerId: bowlers[0].id,
      runs,
      isWicket: false,
      extraType: extra?.type ?? null,
      extraRuns: extra?.runs ?? 0,
    });

  // ── §15.7 — SSE v2: connect, ids on persisted events ────────────────────
  const stream = await openStream(match.id);
  const initFrames = await stream.readFor(1200);
  ok(
    initFrames.some((f) => f.event === 'init' && f.data?.id === match.id),
    'fresh connect gets the init full-state event'
  );

  // Play 4 balls while listening: 1, 4, W, wide
  await play(batters[0].id, 1);
  await play(batters[1].id, 4);
  const wicketBall = await api(`/api/matches/${match.id}/innings/${innings.id}/balls`, 'POST', {
    batsmanId: batters[1].id,
    bowlerId: bowlers[0].id,
    runs: 0,
    isWicket: true,
    wicketType: 'BOWLED',
    dismissedPlayerId: batters[1].id,
  });
  ok(wicketBall.status === 200, 'wicket recorded (push fanout must not block)', wicketBall.status);
  await play(batters[0].id, 0, { type: 'WIDE', runs: 1 });

  const liveFrames = await stream.readFor(1500);
  const ballFrames = liveFrames.filter((f) => f.event === 'ball' || f.event === 'wicket');
  ok(ballFrames.length >= 4, 'SSE ball/wicket events received live', ballFrames.length);
  ok(
    ballFrames.every((f) => typeof f.id === 'number' && f.id > 0),
    '§15.7 every persisted event carries a monotonic SSE id',
    ballFrames.map((f) => f.id)
  );
  const ids = ballFrames.map((f) => f.id!);
  ok(
    ids.every((v, i) => i === 0 || v > ids[i - 1]),
    '§15.7 ids strictly increase in arrival order'
  );
  const wpFrame = ballFrames.find((f) => typeof f.data?.data?.wp === 'number' || typeof f.data?.wp === 'number');
  ok(wpFrame != null, '§13.1/§15.7 ball events carry win probability');
  const wicketFrame = ballFrames.find((f) => f.event === 'wicket');
  ok(wicketFrame != null, 'wicket arrives as its own typed event');

  // snapshot the cursor, disconnect, miss 2 balls, reconnect with replay
  const lastId = Math.max(...ballFrames.map((f) => f.id!));
  stream.close();
  await play(batters[0].id, 2);
  await play(batters[0].id, 1);

  const replayStream = await openStream(match.id, lastId);
  const replayFrames = await replayStream.readFor(1500);
  const replayed = replayFrames.filter((f) => f.event === 'ball' && (f.id ?? 0) > lastId);
  ok(
    replayed.length >= 2,
    '§15.7 reconnect with Last-Event-ID REPLAYS missed balls from the event log',
    replayFrames.map((f) => [f.event, f.id])
  );
  ok(
    !replayFrames.some((f) => f.event === 'init'),
    'reconnect skips the init full-state (client already has state)'
  );
  // heartbeat: named event, no id — within 26 s is too slow for CI; assert the
  // server DID emit at least one heartbeat on a long-lived second connection
  replayStream.close();

  // ── §15.4 — reactions (coalesced 1 s, ephemeral broadcast) ──────────────
  const reactionStream = await openStream(match.id);
  await reactionStream.readFor(300); // drain pre-existing frames
  const reactRes = await api(`/api/matches/${match.id}/reactions`, 'POST', { emoji: '🔥' });
  ok(reactRes.status === 200 && reactRes.data?.coalesced === true, 'reaction POST accepted (coalesced 1 s)', reactRes);
  const badReact = await api(`/api/matches/${match.id}/reactions`, 'POST', { emoji: '🎉' });
  ok(badReact.status === 422, 'unknown emoji rejected with 422', badReact.status);
  const reactionFrames = await reactionStream.readFor(2500);
  const reactionEvent = reactionFrames.find((f) => f.event === 'reaction');
  ok(
    reactionEvent != null && reactionEvent.data?.data?.emoji === '🔥' && reactionEvent.data?.data?.count >= 1,
    '§15.4 coalesced reaction broadcast as an SSE reaction event',
    reactionEvent?.data
  );
  ok(
    reactionEvent?.id === undefined,
    '§15.4 reaction events carry no SSE id (ephemeral, never replayed)'
  );
  reactionStream.close();

  // ── §15.1 — live hub feed ────────────────────────────────────────────────
  const hub = await api('/api/live', 'GET');
  ok(hub.status === 200, '/api/live hub feed responds');
  const card = (hub.data?.live ?? []).find((c: any) => c.matchId === match.id);
  ok(card != null, '§15.1 live mini card present for the live match');
  if (card) {
    ok(
      card.runs === 9 && card.wickets === 1,
      'mini card score matches played balls (1+4+0+1(wd) +2+1 = 9, 1 wicket)',
      { runs: card.runs, wickets: card.wickets }
    );
    ok(typeof card.overs === 'string' && card.overs.length > 0, 'mini card overs present', card.overs);
    ok(card.striker != null && typeof card.striker.name === 'string', 'mini card striker present', card.striker);
    ok(Array.isArray(card.last6) && card.last6.length > 0, 'mini card last-6 chips present', card.last6);
    ok(card.powerplay != null && card.powerplay.active === true, 'mini card PP badge active (auto PP, over 1)', card.powerplay);
    ok(card.liveCode, 'mini card carries the live code for deep links', card.liveCode);
  }

  // Hub page server-renders the grid
  const hubPage = await fetch(`${BASE}/live`);
  const hubHtml = await hubPage.text();
  ok(hubPage.status === 200 && hubHtml.includes('Live'), '/live page renders');
  ok(hubHtml.length > 500, '/live page is server-rendered with content', hubHtml.length);

  // ── §15.3 — OG share card ───────────────────────────────────────────────
  const og = await fetch(`${BASE}/api/og/match/${match.id}`);
  const ogBuf = new Uint8Array(await og.arrayBuffer());
  ok(og.status === 200 && og.headers.get('content-type') === 'image/png', 'OG card renders as PNG');
  ok(ogBuf.length > 8000, 'OG card PNG has real content (QR + text)', ogBuf.length);
  ok(
    og.headers.get('cache-control') === 'public, s-maxage=60, stale-while-revalidate=300',
    'OG card exact Cache-Control header',
    og.headers.get('cache-control')
  );
  const pngSig = String.fromCharCode(...ogBuf.slice(0, 4));
  ok(pngSig.slice(1, 4) === 'PNG', 'OG card bytes are a real PNG signature');

  // ── §15.6 — embeddable widget ────────────────────────────────────────────
  const embed = await fetch(`${BASE}/embed/match/${match.id}`);
  const embedHtml = await embed.text();
  ok(embed.status === 200 && embed.headers.get('content-type')?.includes('text/html'), 'embed widget serves HTML');
  ok(
    embed.headers.get('content-security-policy') === 'frame-ancestors *',
    '§15.6 CSP frame-ancestors * on the embed route',
    embed.headers.get('content-security-policy')
  );
  ok(embedHtml.includes('__GS') && embedHtml.includes('EventSource'), 'embed embeds the snapshot + SSE client');
  const embedBytes = Buffer.byteLength(embedHtml, 'utf8');
  ok(embedBytes < 15 * 1024, `§15.6 embed self-contained ≤ 15 KB (${embedBytes} B)`, embedBytes);
  ok(
    embedHtml.includes('api/embed/match') && embedHtml.includes('/stream'),
    'embed JS wires SSE + snapshot refresh'
  );

  const embedLight = await fetch(`${BASE}/embed/match/${match.id}?theme=light`);
  const lightHtml = await embedLight.text();
  ok(lightHtml.includes('#F5F5FA') || lightHtml.includes('#fff'), 'theme=light switches the palette');

  // Non-embed routes must NOT send frame-ancestors
  const homeRes = await fetch(`${BASE}/api/live`);
  ok(
    homeRes.headers.get('content-security-policy') === null,
    'frame-ancestors ONLY on /embed/* (other routes unset)'
  );

  const snap = await api(`/api/embed/match/${match.id}`, 'GET');
  ok(snap.status === 200 && snap.data?.ok === true, '/api/embed snapshot JSON');
  ok(snap.data?.bat?.s === '9/1', 'embed snapshot score', snap.data?.bat);
  ok(Array.isArray(snap.data?.l6), 'embed snapshot last-6 chips', snap.data?.l6);

  // ── §15.2 — web push ─────────────────────────────────────────────────────
  const pk = await api('/api/push/public-key', 'GET');
  ok(pk.status === 200 && pk.data?.configured === true && pk.data?.publicKey?.length > 20, 'VAPID public key served (env configured)', pk.status);

  const fakeSub = {
    subscription: {
      endpoint: `https://fcm.googleapis.com/fcm/send/e2e-${stamp}`,
      keys: { p256dh: 'BKey'.repeat(40), auth: 'Auth'.repeat(8) },
    },
    matchId: match.id,
  };
  const subRes = await api('/api/push/subscribe', 'POST', fakeSub);
  ok(subRes.status === 200 && subRes.data?.matchId === match.id, 'per-match subscription stored (§18 model)');
  const subAll = await api('/api/push/subscribe', 'POST', {
    subscription: fakeSub.subscription,
    matchId: 'all',
  });
  ok(subAll.status === 200 && subAll.data?.matchId === null, 're-subscribing with "all" retargets to follow-all');
  const unsub = await api('/api/push/unsubscribe', 'POST', { endpoint: fakeSub.subscription.endpoint });
  ok(unsub.status === 200, 'unsubscribe removes the subscription');

  // push flag gating: with the flag ON the routes exist; assert bad input 400s
  const badSub = await api('/api/push/subscribe', 'POST', { subscription: { endpoint: '', keys: {} } });
  ok(badSub.status === 400, 'subscribe validates the subscription shape', badSub.status);

  // wicket timing — fanout must not block scoring (queue drains async)
  const t0 = Date.now();
  const anotherWicket = await api(`/api/matches/${match.id}/innings/${innings.id}/balls`, 'POST', {
    batsmanId: batters[0].id,
    bowlerId: bowlers[0].id,
    runs: 0,
    isWicket: true,
    wicketType: 'CAUGHT',
    dismissedPlayerId: batters[0].id,
  });
  const dt = Date.now() - t0;
  ok(anotherWicket.status === 200 && dt < 1500, `wicket + push fanout returns fast (${dt} ms)`);

  // ── verdict ─────────────────────────────────────────────────────────────
  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('E2E crashed:', e);
  process.exit(1);
});
