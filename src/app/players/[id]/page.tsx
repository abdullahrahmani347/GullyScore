'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Trophy,
  Zap,
  Target,
  Activity,
  Swords,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { deviceFetcher } from '@/lib/device';
import { FormChips } from '@/components/analytics/FormChips';
import { formatFormChip, type CareerBattingSummary, CareerBowlingSummary, CareerMilestone, FormInning, MatchupCell } from '@/lib/intelligence';
import { format } from 'date-fns';

const fetcher = deviceFetcher;

interface PlayerCareerResponse {
  player: {
    id: string;
    name: string;
    battingHand: string;
    team: { id: string; name: string; shortName: string; color: string; emoji: string };
  };
  batting: CareerBattingSummary;
  bowling: CareerBowlingSummary;
  fielding: { catches: number; runouts: number; stumpings: number };
  milestones: CareerMilestone[];
  innings: {
    index: number;
    matchId: string;
    date: string;
    opposition: string;
    runs: number;
    balls: number;
    isOut: boolean;
    fours: number;
    sixes: number;
  }[];
  worm: { index: number; opposition: string; points: number[] }[];
  matchups: MatchupCell[];
  matchupBowlers: { id: string; name: string }[];
  form: FormInning[];
}

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-bg-card border border-border px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-t3">{icon}</span>
        <span className="text-[9px] text-t3 uppercase tracking-wider font-medium">{label}</span>
      </div>
      <p className="text-lg font-bold text-t1 font-[family-name:var(--font-mono)] leading-none">{value}</p>
      {sub && <p className="text-[10px] text-t3 mt-1">{sub}</p>}
    </div>
  );
}

export default function PlayerCareerPage() {
  const params = useParams();
  const router = useRouter();
  const playerId = params.id as string;
  const { data, isLoading, error } = useSWR<PlayerCareerResponse>(
    `/api/players/${playerId}`,
    fetcher
  );

  // Worm chart data: join the per-innings point arrays by ball index
  const wormData = useMemo(() => {
    if (!data || data.worm.length === 0) return null;
    const maxLen = Math.max(...data.worm.map((w) => w.points.length));
    const rows: Record<string, number | string>[] = [];
    for (let i = 0; i < maxLen; i++) {
      const row: Record<string, number | string> = { ball: i };
      for (const w of data.worm) {
        row[`inn${w.index}`] = w.points[i];
      }
      rows.push(row);
    }
    return rows;
  }, [data]);

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-bg-app flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-dvh bg-bg-app flex items-center justify-center p-4">
        <div className="rounded-2xl border border-border bg-bg-card p-8 text-center max-w-sm w-full">
          <p className="text-sm text-t2 mb-4">Player not found</p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 rounded-lg bg-accent-dim text-accent text-sm font-medium"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  const { player, batting, bowling, fielding, milestones, innings, matchups, matchupBowlers, form } = data;

  return (
    <div className="min-h-dvh bg-bg-app pb-8">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-xs text-t3 hover:text-t1 mb-3 transition-colors"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <div className="rounded-2xl bg-bg-card border border-border p-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0"
              style={{ backgroundColor: `${player.team.color}22` }}
            >
              {player.team.emoji}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-t1 truncate">{player.name}</h1>
              <p className="text-xs text-t3">
                <span style={{ color: player.team.color }}>{player.team.name}</span>
                {player.battingHand === 'L' && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded bg-bg-elevated text-[9px] font-mono">
                    LEFT-HAND
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Form chips (§13.7) */}
          {form.length > 0 && (
            <div className="mt-3 pt-2.5 border-t border-border flex items-center gap-2 flex-wrap">
              <span className="text-[9px] text-t3 uppercase tracking-wider">Form</span>
              <FormChips innings={form} playerId={player.id} />
            </div>
          )}
        </div>
      </div>

      {/* Career stat cards */}
      <div className="px-4 grid grid-cols-2 lg:grid-cols-4 gap-2">
        <StatCard
          label="Runs"
          value={String(batting.runs)}
          sub={`${batting.innings} inns · HS ${batting.highest}${batting.highestNotOut ? '*' : ''}`}
          icon={<Activity size={11} />}
        />
        <StatCard
          label="Average"
          value={batting.average != null ? batting.average.toFixed(1) : '∞'}
          sub={`SR ${batting.strikeRate.toFixed(0)} · ${batting.fifties}×50 ${batting.hundreds}×100`}
          icon={<Target size={11} />}
        />
        <StatCard
          label="Wickets"
          value={String(bowling.wickets)}
          sub={bowling.best ? `best ${bowling.best.wickets}/${bowling.best.runs}` : '—'}
          icon={<Zap size={11} />}
        />
        <StatCard
          label="Economy"
          value={bowling.economy > 0 ? bowling.economy.toFixed(2) : '—'}
          sub={bowling.average != null ? `avg ${bowling.average.toFixed(1)}` : '—'}
          icon={<Trophy size={11} />}
        />
      </div>

      {/* Fielding row */}
      <div className="px-4 mt-2">
        <div className="rounded-xl bg-bg-card border border-border px-3 py-2 flex items-center gap-4">
          <span className="text-[9px] text-t3 uppercase tracking-wider">Fielding</span>
          <span className="text-[10px] font-mono text-t2">
            {fielding.catches} ct · {fielding.runouts} ro · {fielding.stumpings} st
          </span>
        </div>
      </div>

      {/* Run worm (§13.6) */}
      {wormData && (
        <div className="px-4 mt-3">
          <div className="rounded-xl bg-bg-card border border-border px-3 py-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-t3 uppercase tracking-wider font-medium">
                Run worm — last {data.worm.length} innings
              </span>
            </div>
            <div style={{ height: 160, width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={wormData} margin={{ top: 4, right: 6, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="ball" tick={{ fontSize: 9, fill: '#4A4A62' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#4A4A62' }} axisLine={false} tickLine={false} width={26} />
                  <Tooltip
                    contentStyle={{
                      background: '#191A23',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                    labelFormatter={(v) => `ball ${v}`}
                  />
                  {data.worm.map((w, i) => (
                    <Line
                      key={w.index}
                      type="monotone"
                      dataKey={`inn${w.index}`}
                      name={`${w.index}. ${w.opposition}`}
                      stroke={['#00D4AA', '#FFB020', '#7C7CF0', '#FF6B81', '#5AD1FF', '#C0F06B', '#FF9F55', '#B48CF2'][i % 8]}
                      strokeWidth={1.6}
                      dot={false}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Milestones (§13.6) */}
      {milestones.length > 0 && (
        <div className="px-4 mt-3">
          <div className="rounded-xl bg-bg-card border border-border px-3 py-2.5">
            <span className="text-[10px] text-t3 uppercase tracking-wider font-medium">Milestones</span>
            <div className="mt-1.5 space-y-1">
              {milestones.slice(0, 8).map((m, i) => (
                <div key={i} className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <Trophy size={10} className={m.type === 'HUNDRED' || m.type === 'FIVE_WICKETS' ? 'text-gold' : 'text-accent'} />
                    <span className="text-t2">
                      {m.type === 'HUNDRED' ? 'Century' : m.type === 'FIFTY' ? 'Fifty' : m.type === 'FIVE_WICKETS' ? '5-wicket haul' : 'Best figures'}
                    </span>
                  </span>
                  <span className="font-mono text-t1">{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Matchup table (§13.4/§13.6) */}
      {matchups.length > 0 && (
        <div className="px-4 mt-3">
          <div className="rounded-xl bg-bg-card border border-border px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-2">
              <Swords size={12} className="text-accent" />
              <span className="text-[10px] text-t3 uppercase tracking-wider font-medium">
                vs bowlers faced — career aggregate
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-t3 border-b border-border/60">
                    <th className="text-left font-normal pb-1">Bowler</th>
                    <th className="text-right font-normal pb-1">Runs</th>
                    <th className="text-right font-normal pb-1">Balls</th>
                    <th className="text-right font-normal pb-1">Dots</th>
                    <th className="text-right font-normal pb-1">4s/6s</th>
                    <th className="text-right font-normal pb-1">Out</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {matchups
                    .slice()
                    .sort((a, b) => b.balls - a.balls)
                    .slice(0, 10)
                    .map((m) => (
                      <tr key={m.bowlerId} className="border-b border-border/30">
                        <td className="text-t2 py-1 truncate max-w-[110px]">
                          {matchupBowlers.find((b) => b.id === m.bowlerId)?.name ?? '?'}
                        </td>
                        <td className="text-right text-t1">{m.runs}</td>
                        <td className="text-right text-t3">{m.balls}</td>
                        <td className="text-right text-t3">{m.dots}</td>
                        <td className="text-right text-t3">
                          {m.fours}/{m.sixes}
                        </td>
                        <td className={`text-right ${m.dismissals > 0 ? 'text-wicket' : 'text-t3'}`}>
                          {m.dismissals > 0 ? `${m.dismissals}×` : '—'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Recent innings */}
      {innings.length > 0 && (
        <div className="px-4 mt-3">
          <div className="rounded-xl bg-bg-card border border-border px-3 py-2.5">
            <span className="text-[10px] text-t3 uppercase tracking-wider font-medium">Recent innings</span>
            <div className="mt-1.5 space-y-1">
              {innings.slice(0, 10).map((inn) => (
                <Link
                  key={`${inn.matchId}-${inn.index}`}
                  href={`/matches/${inn.matchId}`}
                  className="flex items-center justify-between text-[11px] rounded-lg px-1.5 py-1 hover:bg-bg-elevated transition-colors"
                >
                  <span className="text-t3 truncate flex-1">
                    <span className="text-t3/60 font-mono mr-1.5">{inn.index}.</span>vs {inn.opposition}
                  </span>
                  <span className="text-t3 w-16 text-right shrink-0">
                    {inn.date ? format(new Date(inn.date), 'd MMM') : ''}
                  </span>
                  <span className="font-mono font-semibold text-t1 w-16 text-right shrink-0">
                    {formatFormChip({ runs: inn.runs, isOut: inn.isOut, balls: inn.balls })}
                    <span className="text-t3 font-normal"> ({inn.balls})</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
