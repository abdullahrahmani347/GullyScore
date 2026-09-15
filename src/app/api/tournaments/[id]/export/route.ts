import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDbSchema } from '@/lib/db-bootstrap';
import { verifyOwnership, isAuthorized } from '@/lib/api-auth';

/**
 * v2 §17.2/§17.6 — GET /api/tournaments/[id]/export?format=ics|csv[&type=…]
 *
 *   format=ics                    → calendar of scheduled fixtures (VCALENDAR
 *                                   with VEVENT per match; venue, umpires)
 *   format=csv&type=points        → points table CSV (default)
 *   format=csv&type=fixtures      → fixtures + results CSV
 *   format=csv&type=batting       → per-innings batting CSV
 *   format=csv&type=bowling       → per-innings bowling CSV
 */
function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function icsFold(line: string): string {
  // RFC 5545 §3.1 — lines ≤ 75 octets, continuation with CRLF + space
  if (line.length <= 75) return line;
  let out = '';
  let rest = line;
  while (rest.length > 0) {
    out += (out === '' ? '' : '\r\n ') + rest.slice(0, 75);
    rest = rest.slice(75);
  }
  return out;
}

function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = cell == null ? '' : String(cell);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\r\n');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbSchema();
    const { id } = await params;
    const url = new URL(request.url);
    const format = (url.searchParams.get('format') ?? 'csv').toLowerCase();
    const type = (url.searchParams.get('type') ?? 'points').toLowerCase();

    const tournament = await db.tournament.findUnique({
      where: { id },
      include: { teams: { include: { team: true } } },
    });
    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const ownership = verifyOwnership(request, tournament.deviceId);
    if (!isAuthorized(ownership)) {
      return ownership;
    }

    const matches = await db.match.findMany({
      where: { tournamentId: id },
      include: {
        team1: true,
        team2: true,
        innings: {
          include: {
            team: { select: { id: true, name: true, shortName: true } },
          },
          orderBy: { inningsNumber: 'asc' },
        },
      },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
    });

    const slug = tournament.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tournament';

    // ── ICS (§17.2) ───────────────────────────────────────────────────────
    if (format === 'ics') {
      const lines: string[] = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//GullyScore//Tournament Schedule//EN',
        'CALSCALE:GREGORIAN',
        `X-WR-CALNAME:${icsEscape(tournament.name)}`,
      ];
      const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      matches.forEach((m, idx) => {
        const start = m.scheduledAt ?? m.createdAt;
        const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // default 2 h slot
        const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
        lines.push(
          'BEGIN:VEVENT',
          `UID:${m.id}@gullyscore`,
          `DTSTAMP:${now}`,
          `DTSTART:${fmt(start)}`,
          `DTEND:${fmt(end)}`,
          `SUMMARY:${icsEscape(`${m.team1.shortName} v ${m.team2.shortName} — ${tournament.name}`)}`,
          `LOCATION:${icsEscape(m.venue ?? 'Venue TBD')}`,
          `DESCRIPTION:${icsEscape(
            [
              `${tournament.name} (${tournament.format} · ${tournament.totalOvers} overs)`,
              m.umpires ? `Umpires: ${m.umpires}` : null,
              m.round ? `Round: ${m.round}` : null,
            ]
              .filter(Boolean)
              .join('\n'),
          )}`,
          'END:VEVENT',
        );
      });
      lines.push('END:VCALENDAR');
      return new NextResponse(icsFoldLines(lines).join('\r\n') + '\r\n', {
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': `attachment; filename="${slug}.ics"`,
        },
      });
    }

    // ── CSV pack (§17.6) ──────────────────────────────────────────────────
    let csv: string;
    let filename: string;

    if (type === 'fixtures') {
      csv = toCsv([
        ['Round', 'Team 1', 'Team 2', 'Scheduled', 'Venue', 'Umpires', 'Status', 'Result'],
        ...matches.map((m) => [
          m.round ?? '',
          m.team1.name,
          m.team2.name,
          m.scheduledAt ? m.scheduledAt.toISOString() : '',
          m.venue ?? '',
          m.umpires ?? '',
          m.status,
          m.result ?? '',
        ]),
      ]);
      filename = `${slug}-fixtures.csv`;
    } else if (type === 'batting' || type === 'bowling') {
      const rows: (string | number | null)[][] =
        type === 'batting'
          ? [['Match', 'Innings', 'Team', 'Batter', 'Runs', 'Balls', '4s', '6s', 'Out']]
          : [['Match', 'Innings', 'Team', 'Bowler', 'Overs', 'Balls', 'Runs', 'Wickets', 'Wides', 'No balls']];
      for (const m of matches) {
        for (const inn of m.innings) {
          if (type === 'batting') {
            const bats = await db.batsmanInnings.findMany({
              where: { inningsId: inn.id },
              include: { player: { select: { name: true, isGuest: true } } },
              orderBy: { battingOrder: 'asc' },
            });
            for (const b of bats) {
              rows.push([
                `${m.team1.shortName} v ${m.team2.shortName}`,
                inn.inningsNumber,
                inn.team.shortName,
                b.player.name,
                b.runs,
                b.balls,
                b.fours,
                b.sixes,
                b.isOut ? 'out' : 'not out',
              ]);
            }
          } else {
            const bowls = await db.bowlerInnings.findMany({
              where: { inningsId: inn.id },
              include: { player: { select: { name: true, isGuest: true } } },
            });
            for (const b of bowls) {
              rows.push([
                `${m.team1.shortName} v ${m.team2.shortName}`,
                inn.inningsNumber,
                inn.team.shortName,
                b.player.name,
                b.completedOvers,
                b.balls,
                b.runs,
                b.wickets,
                b.wides,
                b.noBalls,
              ]);
            }
          }
        }
      }
      csv = toCsv(rows);
      filename = `${slug}-${type}.csv`;
    } else {
      // points (default)
      csv = toCsv([
        ['Team', 'Played', 'Won', 'Lost', 'Tied', 'Points', 'NRR', 'Runs For', 'Runs Against', 'Overs Faced', 'Overs Bowled'],
        ...[...tournament.teams]
          .sort((a, b) => b.points - a.points || b.nrr - a.nrr)
          .map((tt) => [
            tt.team.name,
            tt.played,
            tt.won,
            tt.lost,
            tt.tied,
            tt.points,
            tt.nrr.toFixed(3),
            tt.runsScored,
            tt.runsConceded,
            tt.oversFaced,
            tt.oversBowled,
          ]),
      ]);
      filename = `${slug}-points.csv`;
    }

    return new NextResponse('\ufeff' + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting tournament:', error);
    return NextResponse.json({ error: 'Failed to export' }, { status: 500 });
  }
}

function icsFoldLines(lines: string[]): string[] {
  return lines.map((l) => icsFold(l));
}
