'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { MvpCard } from './MvpCard';
import { TurningPointsList } from './TurningPointsList';
import { MatchupMatrix } from './MatchupMatrix';
import { PartnershipAnalyticsCard } from './PartnershipAnalyticsCard';
import { WagonWheel } from './WagonWheel';
import { PitchMapChart } from './PitchMapChart';
import { liveBalls } from '@/lib/analytics-data';
import { parseHouseRules } from '@/lib/scoring-context';
import type { MatchData, Player } from '@/types';

interface InsightsSectionProps {
  match: MatchData & {
    innings?: (MatchData['innings'][number] & { extras?: Record<string, number> })[];
  };
  innings: MatchData['innings'][number];
}

/**
 * v2 §13 — scorecard insights: MVP, turning points, matchups, partnership
 * analytics, wagon wheel (per batter / innings-wide) and pitch map, all
 * computed client-side from the same ball rows the server folded.
 */
export function InsightsSection({ match, innings }: InsightsSectionProps) {
  const [open, setOpen] = useState(false);
  const [wagonBatter, setWagonBatter] = useState<string | 'ALL'>('ALL');

  const balls = useMemo(() => liveBalls(innings), [innings]);
  const allPlayers = useMemo(
    () => [...(match.team1?.players ?? []), ...(match.team2?.players ?? [])],
    [match]
  );
  // Batting team of this innings (teamId with a team.id fallback for shapes
  // that strip it) → the OTHER side is the bowling team.
  const battingTeamId = innings.teamId ?? innings.team?.id ?? match.team1Id;
  const battingPlayers = innings.team?.players ?? [];
  const bowlingPlayers =
    battingTeamId === match.team1Id ? match.team2?.players ?? [] : match.team1?.players ?? [];

  const houseRules = parseHouseRules(match.rules);
  const hasWagon = balls.some((b) => b.wagonDirection != null);
  const hasPitch = balls.some((b) => b.pitchLength != null && b.pitchLine != null);

  const wagonBatters = useMemo(() => {
    const ids = new Set(balls.filter((b) => b.wagonDirection != null).map((b) => b.batsmanId));
    return battingPlayers.filter((p: Player) => ids.has(p.id));
  }, [balls, battingPlayers]);

  // Nothing to show until there is a ball
  if (balls.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-bg-card/50 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-bg-card transition-colors"
      >
        <Sparkles size={13} className="text-accent" />
        <span className="text-xs font-semibold text-t2">Match insights</span>
        <span className="text-[9px] text-t3 font-mono ml-1">
          MVP · turning points · matchups{hasWagon ? ' · wagon' : ''}{hasPitch ? ' · pitch' : ''}
        </span>
        <ChevronDown
          size={14}
          className={`text-t3 ml-auto transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">
          <MvpCard match={match} />
          <TurningPointsList match={match} balls={balls} />
          <MatchupMatrix balls={balls} battingPlayers={battingPlayers} bowlingPlayers={bowlingPlayers} />
          <PartnershipAnalyticsCard
            partnerships={innings.partnerships ?? []}
            players={allPlayers}
          />
          {(hasWagon || houseRules?.wagonCapture !== 'off') && (
            <div className="rounded-xl bg-bg-card border border-border px-3 py-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-t3 uppercase tracking-wider font-medium">
                  Wagon wheel
                  {houseRules ? '' : ' (capture off by default for legacy matches)'}
                </span>
                {wagonBatters.length > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setWagonBatter('ALL')}
                      className={`text-[9px] px-1.5 py-0.5 rounded-full border ${
                        wagonBatter === 'ALL' ? 'border-accent/40 text-accent bg-accent/10' : 'border-border text-t3'
                      }`}
                    >
                      All
                    </button>
                    {wagonBatters.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setWagonBatter(p.id)}
                        className={`text-[9px] px-1.5 py-0.5 rounded-full border max-w-[70px] truncate ${
                          wagonBatter === p.id ? 'border-accent/40 text-accent bg-accent/10' : 'border-border text-t3'
                        }`}
                      >
                        {p.name.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-center">
                <WagonWheel
                  balls={balls}
                  players={battingPlayers}
                  batterId={wagonBatter === 'ALL' ? undefined : wagonBatter}
                  size={210}
                />
              </div>
              {hasWagon === false && (
                <p className="text-[9px] text-t3 text-center pt-1">
                  Turn on wagon capture in house rules to map shots as you score
                </p>
              )}
            </div>
          )}
          {hasPitch && <PitchMapChart balls={balls} players={bowlingPlayers} />}
        </div>
      )}
    </div>
  );
}
