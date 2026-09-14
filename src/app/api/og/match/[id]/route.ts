import { NextResponse } from 'next/server';
import sharp from 'sharp';
import QRCode from 'qrcode';
import { db } from '@/lib/db';
import { ensureDbSchema } from '@/lib/db-bootstrap';
import { buildOgSvg, safeColor, type OgCardData, type OgInningsSummary } from '@/lib/og-card';

export const dynamic = 'force-dynamic';

/**
 * v2 §15.3 — GET /api/og/match/[id]  (also ?code=GS-XXXX)
 * 1200×630 share PNG (teams, scores, team colors, LIVE badge, QR to
 * /live/[code]) rendered via sharp. Public read; browser-cacheable:
 *   Cache-Control: public, s-maxage=60, stale-while-revalidate=300
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbSchema();
    const { id } = await params;
    const url = new URL(request.url);
    const code = url.searchParams.get('code')?.replace(/^GS-/i, '').toUpperCase();

    const match = await db.match.findFirst({
      where: code ? { liveCode: code } : { id },
      include: {
        team1: true,
        team2: true,
        innings: {
          include: { team: true },
          orderBy: { inningsNumber: 'asc' },
        },
      },
    });

    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const origin = url.origin;
    const watchUrl = match.liveCode ? `${origin}/live/${match.liveCode}` : origin;

    const qrSvg = await QRCode.toString(watchUrl, {
      type: 'svg',
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: '#070710', light: '#F0F0F5' },
    });

    const innings: OgInningsSummary[] = match.innings.map((inn) => {
      const team = inn.teamId === match.team1Id ? match.team1 : match.team2;
      return {
        teamName: team.name,
        shortName: team.shortName,
        color: safeColor(team.color),
        runs: inn.runs,
        wickets: inn.wickets,
        completedOvers: inn.completedOvers,
        currentBalls: inn.currentBalls,
        inningsNumber: inn.inningsNumber,
        isCurrent: !inn.isCompleted,
      };
    });

    const data: OgCardData = {
      status: match.status,
      team1: {
        name: match.team1.name,
        shortName: match.team1.shortName,
        color: safeColor(match.team1.color),
      },
      team2: {
        name: match.team2.name,
        shortName: match.team2.shortName,
        color: safeColor(match.team2.color),
      },
      innings,
      venue: match.venue,
      result: match.result,
      liveCode: match.liveCode,
      siteUrl: origin,
      qrSvg,
    };

    const svg = buildOgSvg(data);
    const png = await sharp(Buffer.from(svg), { density: 96 })
      .resize(1200, 630)
      .png()
      .toBuffer();

    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'Content-Length': String(png.length),
      },
    });
  } catch (error) {
    console.error('Error rendering OG card:', error);
    return NextResponse.json({ error: 'Failed to render card' }, { status: 500 });
  }
}
