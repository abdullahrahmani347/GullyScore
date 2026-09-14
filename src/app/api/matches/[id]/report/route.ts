import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyOwnership, isAuthorized } from '@/lib/api-auth';
import { ensureDbSchema } from '@/lib/db-bootstrap';
import { withFeatureFlag } from '@/lib/api-flag';
import {
  cachedReport,
  generateAiReport,
  templateReport,
  type MatchReportJson,
} from '@/lib/match-report';
import { isFeatureEnabled } from '@/lib/features';
import type { MatchData } from '@/types';

/**
 * v2 §13.10 — MATCH REPORT.
 *
 * GET  — always available: the cached AI report when present, else the
 *        match-story.ts template (labelled). Public via ?code=GS-XXXX.
 * POST — (re)generate the AI report (flag-gated aiReport, scorer-only).
 *        On LLM failure the template is served with a note — never an error
 *        that blocks anything.
 */

async function loadMatch(matchId: string): Promise<MatchData | null> {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: {
      team1: { include: { players: true } },
      team2: { include: { players: true } },
      innings: {
        include: {
          team: { include: { players: true } },
          batting: { include: { player: true }, orderBy: { battingOrder: 'asc' } },
          bowling: { include: { player: true } },
          balls: { orderBy: { deliveryNumber: 'asc' } },
          partnerships: { include: { batsman1: true, batsman2: true } },
        },
        orderBy: { inningsNumber: 'asc' },
      },
    },
  });
  if (!match) return null;
  return JSON.parse(JSON.stringify(match)) as MatchData;
}

/** Ownership OR public live-code read (?code=). */
async function canRead(request: NextRequest, match: { deviceId: string; liveCode: string | null }): Promise<boolean> {
  const ownership = verifyOwnership(request, match.deviceId);
  if (isAuthorized(ownership)) return true;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (code) {
    const normalized = code.replace(/^GS-/i, '').toUpperCase();
    return match.liveCode === normalized;
  }
  return false;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbSchema();
    const { id } = await params;

    const row = await db.match.findUnique({
      where: { id },
      select: { deviceId: true, liveCode: true },
    });
    if (!row) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }
    if (!(await canRead(request, row))) {
      return NextResponse.json({ error: 'No access to this match.' }, { status: 403 });
    }

    const cached: MatchReportJson | null = await cachedReport(id);
    if (cached) {
      return NextResponse.json({ report: cached, generator: 'ai', features: { aiReport: isFeatureEnabled('aiReport') } });
    }

    // Fallback: the always-available template
    const match = await loadMatch(id);
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }
    const report = templateReport(match);
    return NextResponse.json({
      report,
      generator: 'template',
      features: { aiReport: isFeatureEnabled('aiReport') },
    });
  } catch (error) {
    console.error('Error fetching report:', error);
    return NextResponse.json({ error: 'Failed to fetch report' }, { status: 500 });
  }
}

export const POST = withFeatureFlag(
  'aiReport',
  async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
    try {
      await ensureDbSchema();
      const { id } = await ctx.params;

      const row = await db.match.findUnique({
        where: { id },
        select: { deviceId: true, status: true },
      });
      if (!row) {
        return NextResponse.json({ error: 'Match not found' }, { status: 404 });
      }
      const ownership = verifyOwnership(request, row.deviceId);
      if (!isAuthorized(ownership)) {
        return ownership;
      }
      if (row.status !== 'COMPLETED') {
        return NextResponse.json(
          { error: 'Reports generate after the match completes.', code: 'INVALID_STATUS' },
          { status: 409 }
        );
      }

      const report = await generateAiReport(id);
      if (!report) {
        // LLM failed — serve the template with a note (never a hard error)
        const match = await loadMatch(id);
        const fallback = match ? templateReport(match) : null;
        return NextResponse.json({
          report: fallback,
          generator: 'template',
          note: 'AI generation failed — served the template. Try regenerating.',
          features: { aiReport: true },
        });
      }
      return NextResponse.json({ report, generator: 'ai', features: { aiReport: true } });
    } catch (error) {
      console.error('Error generating report:', error);
      return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
    }
  }
);
