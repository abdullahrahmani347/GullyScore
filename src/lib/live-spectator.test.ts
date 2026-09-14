/**
 * GULLYSCORE v2 §15 — LIVE SPECTATOR unit tests (pure layer)
 * ---------------------------------------------------------------------------
 * Covers:
 *   §15.1  live-hub: mini cards (teams/score/overs/striker/RRR/last-6/PP),
 *           completed rail, tournament filter list, ballChipLabel
 *   §15.5  catch-me-up: 5-bullet template summary (state/turns/fillers/star)
 *   §15.3  og-card: SVG structure + XML-escaping of user strings
 *   §15.2  push-payload: ≤ 512 B clamp
 *   §15.6  embed snapshot: compact shape from a match row
 *   §15.7  sse-events registry: families, persistence, shouldRefetch,
 *           reconnect backoff curve 1 s → 30 s
 */

import { describe, test, expect } from 'bun:test';
import {
  liveHubFeed,
  liveHubCard,
  ballChipLabel,
  embedSnapshot,
  type HubMatchLike,
} from './live-hub';
import { catchMeUpSummary } from './catch-me-up';
import { buildOgSvg, safeColor } from './og-card';
import { clampPayload } from './push-payload';
import {
  isPersistedSseType,
  sseFamilyOf,
  shouldRefetch,
  reconnectDelay,
  SSE_EVENT_TYPES,
} from './sse-events';
import type { MatchData, InningsState, BallRecord } from '@/types';

/* ── fixtures ── */

function hubMatch(overrides: Partial<HubMatchLike> = {}): HubMatchLike {
  return {
    id: 'm1',
    status: 'LIVE',
    totalOvers: 10,
    liveCode: 'X7KP2',
    tournament: { id: 't1', name: 'Gully Premier League' },
    team1: { id: 'T1', name: 'Eagles', shortName: 'EAG', color: '#FFD700' },
    team2: { id: 'T2', name: 'Tigers', shortName: 'TIG', color: '#4ECDC4' },
    innings: [
      {
        id: 'i1',
        inningsNumber: 1,
        teamId: 'T1',
        runs: 45,
        wickets: 1,
        completedOvers: 4,
        currentBalls: 2,
        strikerId: 'P1',
        nonStrikerId: 'P2',
        currentBowlerId: 'B1',
        isCompleted: false,
        balls: [
          { id: 'b1', overNumber: 0, ballInOver: 0, deliveryNumber: 1, batsmanId: 'P1', runs: 4, isWicket: false, extraType: null, extraRuns: 0, isLegalDelivery: true },
          { id: 'b2', overNumber: 0, ballInOver: 1, deliveryNumber: 2, batsmanId: 'P1', runs: 0, isWicket: false, extraType: null, extraRuns: 0, isLegalDelivery: true },
          { id: 'b3', overNumber: 1, ballInOver: 0, deliveryNumber: 3, batsmanId: 'P2', runs: 6, isWicket: false, extraType: null, extraRuns: 0, isLegalDelivery: true },
          { id: 'b4', overNumber: 2, ballInOver: 0, deliveryNumber: 4, batsmanId: 'P2', runs: 0, isWicket: true, wicketType: 'BOWLED', extraType: null, extraRuns: 0, isLegalDelivery: true },
          { id: 'b5', overNumber: 3, ballInOver: 0, deliveryNumber: 5, batsmanId: 'P1', runs: 0, isWicket: false, extraType: 'WIDE', extraRuns: 1, isLegalDelivery: false },
          { id: 'b6', overNumber: 3, ballInOver: 1, deliveryNumber: 6, batsmanId: 'P1', runs: 1, isWicket: false, extraType: null, extraRuns: 0, isLegalDelivery: true },
          { id: 'b7', overNumber: 4, ballInOver: 0, deliveryNumber: 7, batsmanId: 'P1', runs: 0, isWicket: false, extraType: 'NO_BALL', extraRuns: 1, isLegalDelivery: false, isFreeHit: false },
        ],
        batting: [
          { playerId: 'P1', runs: 32, balls: 14, player: { name: 'RAVI' } },
          { playerId: 'P2', runs: 13, balls: 9, player: { name: 'SINGH' } },
        ],
      },
    ],
    createdAt: '2026-01-01T10:00:00Z',
    ...overrides,
  };
}

function matchData(overrides: Partial<MatchData> = {}): MatchData {
  const hub = hubMatch();
  const innings = hub.innings!.map((inn) => ({
    ...inn,
    team: inn.teamId === 'T1' ? hub.team1 : hub.team2,
  })) as unknown as InningsState[];
  return {
    id: hub.id,
    team1Id: 'T1',
    team2Id: 'T2',
    team1: { ...hub.team1, players: [] } as MatchData['team1'],
    team2: { ...hub.team2, players: [] } as MatchData['team2'],
    totalOvers: 10,
    maxWickets: 10,
    status: 'LIVE',
    currentInnings: 1,
    createdAt: '2026-01-01T10:00:00Z',
    liveCode: 'X7KP2',
    innings,
    ...overrides,
  };
}

/* ── §15.1 live hub ── */

describe('§15.1 liveHubFeed / liveHubCard', () => {
  test('mini card carries teams, score, overs, striker, last-6, PP, RRR=null in 1st innings', () => {
    const card = liveHubCard(hubMatch())!;
    expect(card.matchId).toBe('m1');
    expect(card.liveCode).toBe('X7KP2');
    expect(card.battingTeam.name).toBe('Eagles');
    expect(card.bowlingTeam.shortName).toBe('TIG');
    expect(card.runs).toBe(45);
    expect(card.wickets).toBe(1);
    expect(card.overs).toBe('4.2');
    expect(card.striker).toEqual({ name: 'RAVI', runs: 32, balls: 14 });
    expect(card.rrr).toBeNull(); // 1st innings — no RRR
    expect(card.tournamentName).toBe('Gully Premier League');
    // last-6 chips over the live ball log (7 balls → last 6)
    expect(card.last6.map((c) => c.label)).toEqual(['•', '6', 'W', 'wd', '1', 'nb']);
  });

  test('PP badge active inside powerplay (auto 30% of 10 ov = 3 overs)', () => {
    const card = liveHubCard(hubMatch())!;
    // v2 rules default (rules JSON present? null → v1 parity, no PP).
    // With rules JSON {powerplayOvers: 4}: completedOvers 4 < 4? no → inactive
    expect(card.powerplay).toBeNull(); // v1 parity match (no rules JSON)
    const withRules = hubMatch({ rules: JSON.stringify({ powerplayOvers: 'auto' }) });
    const card2 = liveHubCard(withRules)!;
    expect(card2.powerplay).not.toBeNull();
    // auto for 10 overs = 3; completedOvers = 4 → not active
    expect(card2.powerplay!.overs).toBe(3);
    expect(card2.powerplay!.active).toBe(false);
    const early = hubMatch({ rules: JSON.stringify({ powerplayOvers: 'auto' }) });
    (early.innings![0] as { completedOvers: number }).completedOvers = 1;
    const card3 = liveHubCard(early)!;
    expect(card3.powerplay!.active).toBe(true);
  });

  test('RRR computed for 2nd innings with target', () => {
    const chase = hubMatch({
      innings: [
        {
          id: 'i1', inningsNumber: 1, teamId: 'T1', runs: 80, wickets: 5,
          completedOvers: 10, currentBalls: 0, isCompleted: true, balls: [], batting: [],
        },
        {
          id: 'i2', inningsNumber: 2, teamId: 'T2', runs: 45, wickets: 2,
          completedOvers: 5, currentBalls: 0, target: 81, strikerId: 'P1',
          isCompleted: false, balls: [], batting: [{ playerId: 'P1', runs: 30, balls: 20, player: { name: 'KUMAR' } }],
        },
      ],
    });
    const card = liveHubCard(chase)!;
    expect(card.inningsNumber).toBe(2);
    expect(card.target).toBe(81);
    // need 36 off 30 balls → 7.2
    expect(card.rrr).toBe(7.2);
  });

  test('feed: live sorted by last ball timestamp, completed rail capped at 10, tournaments listed', () => {
    const older = hubMatch({ id: 'm0', liveCode: 'AAAAAA', createdAt: '2026-01-01T09:00:00Z' });
    const completed = hubMatch({
      id: 'm9',
      status: 'COMPLETED',
      result: 'Eagles won by 20 runs',
      completedAt: '2026-01-02T12:00:00Z',
      innings: [
        { id: 'c1', inningsNumber: 1, teamId: 'T1', runs: 100, wickets: 5, completedOvers: 10, currentBalls: 0, isCompleted: true },
        { id: 'c2', inningsNumber: 2, teamId: 'T2', runs: 80, wickets: 8, completedOvers: 10, currentBalls: 0, isCompleted: true },
      ],
    });
    const feed = liveHubFeed([completed, hubMatch(), older]);
    expect(feed.live.map((c) => c.matchId)).toEqual(['m1', 'm0']);
    expect(feed.completed).toHaveLength(1);
    expect(feed.completed[0].result).toBe('Eagles won by 20 runs');
    expect(feed.completed[0].innings[0].score).toBe('100/5 (10.0)');
    expect(feed.tournaments).toEqual([{ id: 't1', name: 'Gully Premier League' }]);
  });

  test('ballChipLabel truth table', () => {
    expect(ballChipLabel({ overNumber: 0, ballInOver: 0, deliveryNumber: 1, runs: 0, isWicket: true, extraType: null, extraRuns: 0, isLegalDelivery: true }).label).toBe('W');
    expect(ballChipLabel({ overNumber: 0, ballInOver: 0, deliveryNumber: 1, runs: 4, isWicket: false, extraType: null, extraRuns: 0, isLegalDelivery: true }).label).toBe('4');
    expect(ballChipLabel({ overNumber: 0, ballInOver: 0, deliveryNumber: 1, runs: 6, isWicket: false, extraType: null, extraRuns: 0, isLegalDelivery: true }).label).toBe('6');
    expect(ballChipLabel({ overNumber: 0, ballInOver: 0, deliveryNumber: 1, runs: 0, isWicket: false, extraType: null, extraRuns: 0, isLegalDelivery: true }).label).toBe('•');
    expect(ballChipLabel({ overNumber: 0, ballInOver: 0, deliveryNumber: 1, runs: 0, isWicket: false, extraType: 'WIDE', extraRuns: 1, isLegalDelivery: false }).label).toBe('wd');
    expect(ballChipLabel({ overNumber: 0, ballInOver: 0, deliveryNumber: 1, runs: 0, isWicket: false, extraType: 'WIDE', extraRuns: 3, isLegalDelivery: false }).label).toBe('wd3');
    expect(ballChipLabel({ overNumber: 0, ballInOver: 0, deliveryNumber: 1, runs: 2, isWicket: false, extraType: 'NO_BALL', extraRuns: 1, isLegalDelivery: false }).label).toBe('nb2');
    expect(ballChipLabel({ overNumber: 0, ballInOver: 0, deliveryNumber: 1, runs: 4, isWicket: false, extraType: 'BYE', extraRuns: 0, isLegalDelivery: true }).label).toBe('b4');
    expect(ballChipLabel({ overNumber: 0, ballInOver: 0, deliveryNumber: 1, runs: 1, isWicket: false, extraType: 'LEG_BYE', extraRuns: 0, isLegalDelivery: true }).label).toBe('lb1');
  });

  test('free-hit heuristic: last ball NO_BALL → pending', () => {
    const card = liveHubCard(hubMatch({ rules: JSON.stringify({}) }))!;
    expect(card.freeHitPending).toBe(true); // last delivery was a NB
    const consumed = hubMatch({ rules: JSON.stringify({}) });
    (consumed.innings![0].balls as HubMatchLike['innings'] extends (infer I)[] ? I[] : never)!.push(
      { overNumber: 4, ballInOver: 1, deliveryNumber: 8, runs: 4, isWicket: false, extraType: null, extraRuns: 0, isLegalDelivery: true, isFreeHit: true } as never
    );
    const card2 = liveHubCard(consumed)!;
    expect(card2.freeHitPending).toBe(false);
  });
});

/* ── §15.6 embed snapshot ── */

describe('§15.6 embedSnapshot', () => {
  test('compact snapshot: score, overs, striker pair, bowler, chips, PP', () => {
    const snap = embedSnapshot(hubMatch({ rules: JSON.stringify({ powerplayOvers: 'auto' }) }));
    expect(snap.ok).toBe(true);
    expect(snap.st).toBe('LIVE');
    expect(snap.code).toBe('X7KP2');
    expect(snap.t).toEqual([
      { n: 'Eagles', c: '#FFD700' },
      { n: 'Tigers', c: '#4ECDC4' },
    ]);
    expect(snap.bat.s).toBe('45/1');
    expect(snap.bat.o).toBe('4.2');
    expect(snap.s1).toEqual({ n: 'RAVI', r: '32(14)' });
    expect(snap.s2).toEqual({ n: 'SINGH', r: '13(9)' });
    expect(snap.bw).toBeNull(); // no bowling rows in the fixture
    expect(snap.l6).toEqual(['•', '6', 'W', 'wd', '1', 'nb']);
    expect(snap.pp).toBe(false); // completedOvers 4 ≥ auto 3
  });

  test('no open innings → result-shaped snapshot', () => {
    const snap = embedSnapshot(hubMatch({
      status: 'COMPLETED',
      result: 'Eagles won by 20 runs',
      innings: [
        { id: 'c1', inningsNumber: 1, teamId: 'T1', runs: 100, wickets: 5, completedOvers: 10, currentBalls: 0, isCompleted: true },
        { id: 'c2', inningsNumber: 2, teamId: 'T2', runs: 80, wickets: 8, completedOvers: 10, currentBalls: 0, isCompleted: true },
      ],
    }));
    expect(snap.r).toBe('Eagles won by 20 runs');
    expect(snap.fi).toEqual({ n: 'Eagles', s: '100/5' });
    expect(snap.s1).toBeNull();
  });
});

/* ── §15.5 catch-me-up ── */

describe('§15.5 catchMeUpSummary', () => {
  test('5 bullets: state + up-to-3 turns + star; exact template', () => {
    const match = matchData({ rules: JSON.stringify({ powerplayOvers: 'auto' }) });
    const innings = match.innings[0];
    const bullets = catchMeUpSummary(match, innings);
    expect(bullets.length).toBeLessThanOrEqual(5);
    expect(bullets.length).toBeGreaterThanOrEqual(1);
    // 1. state bullet
    expect(bullets[0].kind).toBe('state');
    expect(bullets[0].text).toContain('Eagles 45/1');
    expect(bullets[0].text).toContain('CRR');
    // last: in-form bullet
    const star = bullets.find((b) => b.kind === 'star');
    expect(star).toBeDefined();
    expect(star!.text).toContain('RAVI 32(14)');
  });

  test('chase context: need N off M + RRR in the state bullet', () => {
    const match = matchData({
      innings: [
        { id: 'i1', inningsNumber: 1, teamId: 'T1', runs: 80, wickets: 5, completedOvers: 10, currentBalls: 0, isCompleted: true, balls: [], batting: [], team: { ...hubMatch().team1, players: [] } } as unknown as InningsState,
        {
          id: 'i2', inningsNumber: 2, teamId: 'T2', runs: 45, wickets: 2, completedOvers: 5,
          currentBalls: 0, target: 81, strikerId: 'P1', isCompleted: false, balls: [],
          batting: [{ playerId: 'P1', runs: 30, balls: 20, player: { name: 'KUMAR' }, isOut: false }],
          team: { ...hubMatch().team2, players: [] },
        } as unknown as InningsState,
      ],
    });
    const bullets = catchMeUpSummary(match, match.innings[1]);
    expect(bullets[0].text).toContain('chasing 81');
    expect(bullets[0].text).toContain('need 36');
    expect(bullets[0].text).toContain('RRR');
  });

  test('completed match with no open innings → result + innings bullets', () => {
    const match = matchData({
      status: 'COMPLETED',
      result: 'Eagles won by 20 runs',
      innings: [
        { id: 'c1', inningsNumber: 1, teamId: 'T1', runs: 100, wickets: 5, completedOvers: 10, currentBalls: 0, isCompleted: true, team: { ...hubMatch().team1, players: [] } } as unknown as InningsState,
        { id: 'c2', inningsNumber: 2, teamId: 'T2', runs: 80, wickets: 8, completedOvers: 10, currentBalls: 0, isCompleted: true, team: { ...hubMatch().team2, players: [] } } as unknown as InningsState,
      ],
    });
    const bullets = catchMeUpSummary(match, null);
    expect(bullets[0].text).toBe('Eagles won by 20 runs');
    expect(bullets).toHaveLength(3);
  });
});

/* ── §15.3 OG card SVG ── */

describe('§15.3 buildOgSvg / safeColor', () => {
  test('SVG structure: 1200×630, LIVE badge, scores, QR slot, code', () => {
    const svg = buildOgSvg({
      status: 'LIVE',
      team1: { name: 'Eagles', shortName: 'EAG', color: '#FFD700' },
      team2: { name: 'Tigers', shortName: 'TIG', color: '#4ECDC4' },
      innings: [
        { teamName: 'Eagles', shortName: 'EAG', color: '#FFD700', runs: 45, wickets: 1, completedOvers: 4, currentBalls: 2, inningsNumber: 1, isCurrent: true },
      ],
      liveCode: 'X7KP2',
      siteUrl: 'http://localhost:3000',
      qrSvg: '<rect width="10" height="10"/>',
    });
    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="630"');
    expect(svg).toContain('● LIVE');
    expect(svg).toContain('>Eagles<');
    expect(svg).toContain('>45/1<');
    expect(svg).toContain('GS-X7KP2');
    expect(svg).toContain('Scan to watch live');
  });

  test('user strings are XML-escaped; colors validated', () => {
    const svg = buildOgSvg({
      status: 'COMPLETED',
      team1: { name: '<script>alert("x")</script>', shortName: 'X', color: 'javascript:alert(1)' },
      team2: { name: 'A&B', shortName: 'Y', color: '#4ECDC4' },
      innings: [],
      liveCode: 'X7KP2',
      siteUrl: 'http://x',
      qrSvg: '',
    });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('A&amp;B');
    expect(safeColor('javascript:alert(1)')).toBe('#00D4AA');
    expect(safeColor('#ABC')).toBe('#AABBCC');
    expect(safeColor('#00D4AA')).toBe('#00D4AA');
  });
});

/* ── §15.2 push payload clamp ── */

describe('§15.2 clampPayload', () => {
  test('small payloads pass through unchanged', () => {
    const p = { title: 'WICKET!', body: 'Eagles v Tigers — Eagles 45/1', tag: 'wicket-m1', code: 'X7KP2' };
    expect(clampPayload(p)).toEqual(p);
  });

  test('huge body truncates until the serialized payload is ≤ 512 B', () => {
    const p = { title: 'WICKET!', body: 'x'.repeat(2000), tag: 'w-m1', code: 'X7KP2' };
    const out = clampPayload(p);
    expect(Buffer.byteLength(JSON.stringify(out), 'utf8')).toBeLessThanOrEqual(512);
    expect(out.title).toBe('WICKET!');
    expect(out.body.endsWith('…')).toBe(true);
  });
});

/* ── §15.7 SSE event registry ── */

describe('§15.7 sse-events registry', () => {
  test('every registered type has a family', () => {
    for (const t of SSE_EVENT_TYPES) {
      expect(sseFamilyOf(t)).toBeTruthy();
    }
  });

  test('reactions and heartbeats are ephemeral — everything else persists', () => {
    expect(isPersistedSseType('reaction')).toBe(false);
    expect(isPersistedSseType('heartbeat')).toBe(false);
    for (const t of ['ball', 'wicket', 'over_complete', 'undo', 'redo', 'ball_edited', 'innings_break', 'match_complete', 'target_adjusted', 'status_change']) {
      expect(isPersistedSseType(t)).toBe(true);
    }
  });

  test('shouldRefetch: ephemeral families never refetch; state/ball families do', () => {
    expect(shouldRefetch('ball')).toBe(true);
    expect(shouldRefetch('undo')).toBe(true);
    expect(shouldRefetch('innings_break')).toBe(true);
    expect(shouldRefetch('reaction')).toBe(false);
    expect(shouldRefetch('heartbeat')).toBe(false);
  });

  test('reconnect backoff: 1 s doubling, capped at 30 s', () => {
    expect(reconnectDelay(1)).toBe(1000);
    expect(reconnectDelay(2)).toBe(2000);
    expect(reconnectDelay(3)).toBe(4000);
    expect(reconnectDelay(4)).toBe(8000);
    expect(reconnectDelay(5)).toBe(16000);
    expect(reconnectDelay(6)).toBe(30000); // 32 s capped to 30 s
    expect(reconnectDelay(20)).toBe(30000);
  });
});
