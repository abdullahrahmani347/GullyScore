'use client';

import { useEffect } from 'react';
import useSWR from 'swr';
import { useParams } from 'next/navigation';
import { Trophy, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { safeDeviceFetcher } from '@/lib/device';
import type { TournamentTeamStat } from '@/types';

/**
 * v2 §17.6 — brand-styled PDF tournament report.
 *
 * Opens in a new tab from the tournament page ("PDF report"). Renders a
 * print-optimised report (points table, fixtures/results, batting & bowling
 * leaderboards) using the app's brand palette; the browser's print pipeline
 * (window.print → Save as PDF) produces the final document — this keeps the
 * report pixel-faithful to the brand without shipping a server PDF stack.
 */

interface ReportData {
  tournamentId: string;
  tournamentName: string;
  format: string;
  pointsTable: TournamentTeamStat[];
}

interface ScheduleItem {
  id: string;
  team1: { shortName: string; name: string };
  team2: { shortName: string; name: string };
  status: string;
  result?: string | null;
  scheduledAt?: string | null;
  venue?: string | null;
}

export default function TournamentReportPage() {
  const params = useParams();
  const tournamentId = params.id as string;

  const { data: points } = useSWR<ReportData>(
    `/api/tournaments/${tournamentId}/points-table`,
    safeDeviceFetcher,
  );
  const { data: schedule } = useSWR<{ schedule: ScheduleItem[] }>(
    `/api/tournaments/${tournamentId}/schedule`,
    safeDeviceFetcher,
  );
  const { data: boards } = useSWR<{
    runGetters: { playerId: string; name: string; runs: number; teamShortName: string }[];
    wicketTakers: { playerId: string; name: string; wickets: number; teamShortName: string }[];
    mvp: { playerId: string; name: string; mvp: number; teamShortName: string }[];
  }>(`/api/tournaments/${tournamentId}/leaderboards`, safeDeviceFetcher);

  // Auto-open the print dialog once data lands (user can cancel to view HTML)
  useEffect(() => {
    if (points && schedule && boards) {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [points, schedule, boards]);

  return (
    <div className="min-h-screen bg-white text-black">
      {/* Print toolbar (hidden in print) */}
      <div className="print:hidden sticky top-0 z-10 bg-bg-app border-b border-border px-4 py-2 flex items-center justify-between">
        <span className="text-xs text-t3">Report ready — use your browser&apos;s &quot;Save as PDF&quot;</span>
        <Button size="sm" className="rounded-lg bg-accent text-bg-app text-xs" onClick={() => window.print()}>
          <Printer size={13} className="mr-1" /> Print / Save PDF
        </Button>
      </div>

      <div className="max-w-[820px] mx-auto px-10 py-10 print:p-6">
        {/* Brand header */}
        <header className="flex items-center justify-between border-b-2 border-black pb-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Gully<span className="text-[#00B394]">Score</span>
            </h1>
            <p className="text-xs text-neutral-500 mt-0.5">Tournament report — made for the matches nobody else scores</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">{points?.tournamentName ?? '…'}</p>
            <p className="text-xs text-neutral-500">
              {points?.format ?? ''} · generated {new Date().toLocaleDateString()}
            </p>
          </div>
        </header>

        {/* Points table */}
        <section className="mb-8">
          <h2 className="text-sm font-bold uppercase tracking-wider mb-2">Points Table</h2>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-black/40 text-left">
                <th className="py-1.5 pr-2">#</th>
                <th className="py-1.5 pr-2">Team</th>
                <th className="py-1.5 pr-2 text-center">P</th>
                <th className="py-1.5 pr-2 text-center">W</th>
                <th className="py-1.5 pr-2 text-center">L</th>
                <th className="py-1.5 pr-2 text-center">Pts</th>
                <th className="py-1.5 text-right">NRR</th>
              </tr>
            </thead>
            <tbody>
              {(points?.pointsTable ?? []).map((row, i) => (
                <tr key={row.teamId} className="border-b border-black/10">
                  <td className="py-1.5 pr-2 font-bold">{i + 1}</td>
                  <td className="py-1.5 pr-2">{row.team.shortName || row.team.name}</td>
                  <td className="py-1.5 pr-2 text-center">{row.played}</td>
                  <td className="py-1.5 pr-2 text-center">{row.won}</td>
                  <td className="py-1.5 pr-2 text-center">{row.lost}</td>
                  <td className="py-1.5 pr-2 text-center font-bold">{row.points}</td>
                  <td className="py-1.5 text-right font-mono">
                    {row.nrr > 0 ? '+' : ''}
                    {row.nrr.toFixed(3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Leaderboards */}
        <section className="grid grid-cols-3 gap-6 mb-8">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider mb-2">Most runs</h2>
            <ol className="text-xs space-y-1">
              {(boards?.runGetters ?? []).slice(0, 5).map((r) => (
                <li key={r.playerId} className="flex justify-between gap-2 border-b border-black/10 pb-0.5">
                  <span className="truncate">{r.name} <span className="text-neutral-400">({r.teamShortName})</span></span>
                  <span className="font-bold">{r.runs}</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider mb-2">Most wickets</h2>
            <ol className="text-xs space-y-1">
              {(boards?.wicketTakers ?? []).slice(0, 5).map((r) => (
                <li key={r.playerId} className="flex justify-between gap-2 border-b border-black/10 pb-0.5">
                  <span className="truncate">{r.name} <span className="text-neutral-400">({r.teamShortName})</span></span>
                  <span className="font-bold">{r.wickets}</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
              <Trophy size={11} /> MVP
            </h2>
            <ol className="text-xs space-y-1">
              {(boards?.mvp ?? []).slice(0, 5).map((r) => (
                <li key={r.playerId} className="flex justify-between gap-2 border-b border-black/10 pb-0.5">
                  <span className="truncate">{r.name} <span className="text-neutral-400">({r.teamShortName})</span></span>
                  <span className="font-bold">{r.mvp}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Fixtures & results */}
        <section className="mb-8">
          <h2 className="text-sm font-bold uppercase tracking-wider mb-2">Fixtures &amp; Results</h2>
          <table className="w-full text-xs border-collapse">
            <tbody>
              {(schedule?.schedule ?? []).map((m) => (
                <tr key={m.id} className="border-b border-black/10">
                  <td className="py-1.5 pr-3 font-semibold whitespace-nowrap">
                    {m.team1.shortName} v {m.team2.shortName}
                  </td>
                  <td className="py-1.5 pr-3 text-neutral-500 whitespace-nowrap">
                    {m.scheduledAt ? new Date(m.scheduledAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="py-1.5 pr-3 text-neutral-500 truncate">{m.venue ?? ''}</td>
                  <td className="py-1.5 text-right">{m.result ?? m.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <footer className="border-t border-black/20 pt-3 text-[10px] text-neutral-400 flex items-center justify-between">
          <span>GullyScore — cricket scoring, simplified</span>
          <span>gullyscore.app</span>
        </footer>
      </div>
    </div>
  );
}
