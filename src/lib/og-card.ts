/**
 * GULLYSCORE v2 §15.3 — OG SHARE CARD (pure SVG builder)
 * ---------------------------------------------------------------------------
 * Builds the 1200×630 SVG for /api/og/match/[id]: teams, scores, team
 * colors, LIVE badge, QR panel pointing at /live/[code]. Rendered to PNG
 * by sharp in the API route. Pure — unit-testable without a server.
 */

import { formatOvers } from './scoring-utils';

export interface OgInningsSummary {
  teamName: string;
  shortName: string;
  color: string;
  runs: number;
  wickets: number;
  completedOvers: number;
  currentBalls: number;
  inningsNumber: number;
  isCurrent: boolean;
}

export interface OgCardData {
  status: 'LIVE' | 'INNINGS_BREAK' | 'COMPLETED' | 'ABANDONED' | string;
  team1: { name: string; shortName: string; color: string };
  team2: { name: string; shortName: string; color: string };
  innings: OgInningsSummary[];
  venue?: string | null;
  result?: string | null;
  liveCode?: string | null;
  siteUrl: string; // origin for the QR target
  /** Inline QR SVG markup (from the `qrcode` pkg, type: 'svg'). */
  qrSvg: string;
}

/** Escape XML-unsafe characters in user strings (team/venue names). */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Validate a hex color (SVG-injection safe) or fall back. */
export function safeColor(raw: string | null | undefined, fallback = '#00D4AA'): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  return fallback;
}

const W = 1200;
const H = 630;

export function buildOgSvg(data: OgCardData): string {
  const t1 = data.team1;
  const t2 = data.team2;
  const isLive = data.status === 'LIVE' || data.status === 'INNINGS_BREAK';
  const badgeColor = isLive ? '#00D4AA' : data.status === 'COMPLETED' ? '#FFD700' : '#8888A0';
  const badgeText =
    data.status === 'INNINGS_BREAK'
      ? 'LIVE · INNINGS BREAK'
      : isLive
        ? '● LIVE'
        : data.status === 'COMPLETED'
          ? 'COMPLETED'
          : data.status === 'ABANDONED'
            ? 'ABANDONED'
            : 'UPCOMING';

  const inn1 = data.innings.find((i) => i.inningsNumber === 1);
  const inn2 = data.innings.find((i) => i.inningsNumber === 2);

  const scoreLine = (inn: OgInningsSummary | undefined) =>
    inn ? `${inn.runs}/${inn.wickets}` : '—';

  const oversLine = (inn: OgInningsSummary | undefined) =>
    inn ? `(${formatOvers(inn.completedOvers, inn.currentBalls)} ov)` : '';

  const resultLine = data.result ? esc(data.result) : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0B0B18"/>
      <stop offset="1" stop-color="#070710"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="10" height="${H}" fill="${safeColor(t1.color)}"/>
  <rect x="${W - 10}" y="0" width="10" height="${H}" fill="${safeColor(t2.color)}"/>

  <!-- Status badge -->
  <rect x="60" y="52" width="230" height="44" rx="22" fill="${badgeColor}" opacity="0.16"/>
  <circle cx="86" cy="74" r="6" fill="${badgeColor}"/>
  <text x="104" y="80" font-family="DejaVu Sans, sans-serif" font-size="20" font-weight="bold" fill="${badgeColor}" letter-spacing="2">${esc(badgeText)}</text>

  <!-- GullyScore mark -->
  <text x="${W - 60}" y="80" font-family="DejaVu Sans, sans-serif" font-size="24" font-weight="bold" fill="#F0F0F5" text-anchor="end">GullyScore</text>

  <!-- Team 1 -->
  <circle cx="92" cy="190" r="14" fill="${safeColor(t1.color)}"/>
  <text x="120" y="200" font-family="DejaVu Sans, sans-serif" font-size="34" font-weight="bold" fill="#F0F0F5">${esc(t1.name)}</text>
  <text x="120" y="252" font-family="DejaVu Sans Mono, monospace" font-size="56" font-weight="bold" fill="${safeColor(t1.color)}">${scoreLine(inn1)}</text>
  <text x="330" y="252" font-family="DejaVu Sans Mono, monospace" font-size="26" fill="#8888A0">${oversLine(inn1)}</text>

  <!-- Team 2 -->
  <circle cx="92" cy="330" r="14" fill="${safeColor(t2.color)}"/>
  <text x="120" y="340" font-family="DejaVu Sans, sans-serif" font-size="34" font-weight="bold" fill="#F0F0F5">${esc(t2.name)}</text>
  <text x="120" y="392" font-family="DejaVu Sans Mono, monospace" font-size="56" font-weight="bold" fill="${safeColor(t2.color)}">${scoreLine(inn2)}</text>
  <text x="330" y="392" font-family="DejaVu Sans Mono, monospace" font-size="26" fill="#8888A0">${oversLine(inn2)}</text>

  ${resultLine ? `<text x="120" y="460" font-family="DejaVu Sans, sans-serif" font-size="26" font-weight="bold" fill="#FFD700">${resultLine}</text>` : ''}
  ${data.venue ? `<text x="120" y="${resultLine ? 500 : 460}" font-family="DejaVu Sans, sans-serif" font-size="22" fill="#8888A0">${esc(data.venue)}</text>` : ''}

  <!-- QR panel -->
  <rect x="920" y="330" width="220" height="220" rx="16" fill="#F0F0F5"/>
  <g transform="translate(938, 348) scale(1.84)">
    ${data.qrSvg}
  </g>
  <text x="1030" y="575" font-family="DejaVu Sans, sans-serif" font-size="18" font-weight="bold" fill="#F0F0F5" text-anchor="middle">Scan to watch live</text>
  ${data.liveCode ? `<text x="1030" y="600" font-family="DejaVu Sans Mono, monospace" font-size="16" fill="#00D4AA" text-anchor="middle">GS-${esc(data.liveCode)}</text>` : ''}
</svg>`;
}

/**
 * Build the 9:16 STORY CARD SVG (§15.3) — 1080×1920. Used by the live
 * page's html2canvas export fallback path and tests; the interactive
 * export renders a DOM card, this is the pure sibling for tests.
 */
export function buildStorySvg(data: OgCardData): string {
  const t1 = data.team1;
  const t2 = data.team2;
  const inn1 = data.innings.find((i) => i.inningsNumber === 1);
  const inn2 = data.innings.find((i) => i.inningsNumber === 2);
  const isLive = data.status === 'LIVE' || data.status === 'INNINGS_BREAK';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="sbg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${safeColor(t1.color)}" stop-opacity="0.22"/>
      <stop offset="0.5" stop-color="#0B0B18"/>
      <stop offset="1" stop-color="#070710"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#sbg)"/>
  <text x="90" y="160" font-family="DejaVu Sans, sans-serif" font-size="40" font-weight="bold" fill="#F0F0F5">GullyScore</text>
  ${isLive ? '<circle cx="140" cy="260" r="10" fill="#00D4AA"/><text x="166" y="272" font-family="DejaVu Sans, sans-serif" font-size="34" font-weight="bold" fill="#00D4AA">LIVE</text>' : ''}
  <text x="90" y="560" font-family="DejaVu Sans, sans-serif" font-size="54" font-weight="bold" fill="#F0F0F5">${esc(t1.name)}</text>
  <text x="90" y="680" font-family="DejaVu Sans Mono, monospace" font-size="120" font-weight="bold" fill="${safeColor(t1.color)}">${inn1 ? `${inn1.runs}/${inn1.wickets}` : '—'}</text>
  <text x="90" y="740" font-family="DejaVu Sans Mono, monospace" font-size="36" fill="#8888A0">${inn1 ? oversLineText(inn1) : ''}</text>
  <text x="90" y="900" font-family="DejaVu Sans, sans-serif" font-size="54" font-weight="bold" fill="#F0F0F5">${esc(t2.name)}</text>
  <text x="90" y="1020" font-family="DejaVu Sans Mono, monospace" font-size="120" font-weight="bold" fill="${safeColor(t2.color)}">${inn2 ? `${inn2.runs}/${inn2.wickets}` : '—'}</text>
  <text x="90" y="1080" font-family="DejaVu Sans Mono, monospace" font-size="36" fill="#8888A0">${inn2 ? oversLineText(inn2) : ''}</text>
  <rect x="90" y="1520" width="300" height="300" rx="24" fill="#F0F0F5"/>
  <g transform="translate(114, 1544) scale(2.52)">
    ${data.qrSvg}
  </g>
  <text x="90" y="1900" font-family="DejaVu Sans, sans-serif" font-size="38" font-weight="bold" fill="#F0F0F5">Scan to follow the match</text>
  ${data.liveCode ? `<text x="780" y="1900" font-family="DejaVu Sans Mono, monospace" font-size="38" fill="#00D4AA">GS-${esc(data.liveCode)}</text>` : ''}
</svg>`;
}

function oversLineText(inn: OgInningsSummary): string {
  return `(${formatOvers(inn.completedOvers, inn.currentBalls)} ov)`;
}
