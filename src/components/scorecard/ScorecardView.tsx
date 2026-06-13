'use client';

import { useState } from 'react';
import { Trophy, MessageCircle, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BattingTable } from './BattingTable';
import { BowlingTable } from './BowlingTable';
import { FallOfWickets } from './FallOfWickets';
import { BallByBallLog } from './BallByBallLog';
import { PartnershipsTable } from './PartnershipsTable';
import { exportScorecardImage, generateWhatsAppSummary } from '@/lib/share';
import { toast } from 'sonner';
import { formatOvers } from '@/lib/scoring-utils';
import { format } from 'date-fns';

interface ScorecardViewProps {
  match: any;
}

function ScorecardView({ match }: ScorecardViewProps) {
  const [activeTab, setActiveTab] = useState<'innings1' | 'innings2'>('innings1');
  const [showBallByBall, setShowBallByBall] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const innings = match.innings || [];
  const inn1 = innings[0];
  const inn2 = innings[1];

  // Get all players from both teams for dismissal lookup
  const allPlayers = [
    ...(match.team1?.players || []),
    ...(match.team2?.players || []),
  ];

  const handleShareImage = async () => {
    setIsExporting(true);
    try {
      await exportScorecardImage('scorecard-export');
      toast.success('Scorecard image saved!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to export image');
    } finally {
      setIsExporting(false);
    }
  };

  const handleShareWhatsApp = async () => {
    const summary = generateWhatsAppSummary(match);
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'GullyScore Match Report',
          text: summary,
        });
      } else {
        await navigator.clipboard.writeText(summary);
        toast.success('Match summary copied to clipboard!');
      }
    } catch (err) {
      try {
        await navigator.clipboard.writeText(summary);
        toast.success('Match summary copied to clipboard!');
      } catch {
        toast.error('Failed to share');
      }
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'dd MMM yyyy');
    } catch {
      return '';
    }
  };

  // Determine which innings to show based on tab
  const activeInnings = activeTab === 'innings1' ? inn1 : inn2;

  return (
    <div id="scorecard-export" className="bg-bg-app">
      {/* Match Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="rounded-2xl border border-border bg-bg-card p-4">
          {/* Teams */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 flex-1">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: match.team1?.color || '#888' }}
              />
              <span className="text-sm font-bold text-t1 truncate">
                {match.team1?.name || 'Team 1'}
              </span>
            </div>
            <span className="text-xs text-t3 px-2 flex-shrink-0">vs</span>
            <div className="flex items-center gap-2 flex-1 justify-end">
              <span className="text-sm font-bold text-t1 truncate">
                {match.team2?.name || 'Team 2'}
              </span>
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: match.team2?.color || '#888' }}
              />
            </div>
          </div>

          {/* Scores summary */}
          <div className="flex items-center justify-between mb-3">
            {inn1 && (
              <div className="text-center flex-1">
                <div className="text-xl font-bold text-t1 font-[family-name:var(--font-mono)]">
                  {inn1.runs}/{inn1.wickets}
                </div>
                <div className="text-xs text-t3">
                  {inn1.team?.name || '1st'} • {formatOvers(inn1.completedOvers, inn1.currentBalls)} ov
                </div>
              </div>
            )}
            {inn2 && (
              <div className="text-center flex-1">
                <div className="text-xl font-bold text-t1 font-[family-name:var(--font-mono)]">
                  {inn2.runs}/{inn2.wickets}
                </div>
                <div className="text-xs text-t3">
                  {inn2.team?.name || '2nd'} • {formatOvers(inn2.completedOvers, inn2.currentBalls)} ov
                </div>
              </div>
            )}
          </div>

          {/* Result */}
          {match.result && (
            <div className="rounded-lg bg-accent-dim/30 border border-accent/20 px-3 py-2 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <Trophy size={14} className="text-gold" />
                <span className="text-xs font-semibold text-accent">
                  {match.result}
                </span>
              </div>
            </div>
          )}

          {/* Match info */}
          <div className="flex items-center justify-center gap-3 mt-2 text-t3">
            <span className="text-[10px]">{formatDate(match.createdAt)}</span>
            {match.venue && (
              <>
                <span className="text-[10px]">•</span>
                <span className="text-[10px]">{match.venue}</span>
              </>
            )}
            <span className="text-[10px]">•</span>
            <span className="text-[10px]">{match.totalOvers} overs</span>
          </div>

          {/* Toss info */}
          {match.tossWinnerId && (
            <div className="text-center mt-1">
              <span className="text-[10px] text-t3">
                Toss: {match.tossWinnerId === match.team1?.id ? match.team1?.name : match.team2?.name}, elected to {match.tossDecision?.toLowerCase()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Innings tabs */}
      {inn1 && inn2 && (
        <div className="px-4 mb-3">
          <div className="flex rounded-xl bg-bg-card border border-border p-1">
            <button
              onClick={() => setActiveTab('innings1')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'innings1'
                  ? 'bg-accent text-bg-app'
                  : 'text-t3 hover:text-t1'
              }`}
            >
              1st Innings
            </button>
            <button
              onClick={() => setActiveTab('innings2')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'innings2'
                  ? 'bg-accent text-bg-app'
                  : 'text-t3 hover:text-t1'
              }`}
            >
              2nd Innings
            </button>
          </div>
        </div>
      )}

      {/* Innings detail */}
      {activeInnings && (
        <div className="px-4 space-y-3">
          {/* Batting table */}
          <BattingTable
            batting={activeInnings.batting}
            teamName={activeInnings.team?.name || 'Batting'}
            totalRuns={activeInnings.runs}
            totalWickets={activeInnings.wickets}
            completedOvers={activeInnings.completedOvers}
            currentBalls={activeInnings.currentBalls}
            extras={activeInnings.extras || { wides: 0, noBalls: 0, byes: 0, legByes: 0, total: 0 }}
            allPlayers={allPlayers}
          />

          {/* Bowling table */}
          <BowlingTable bowling={activeInnings.bowling} />

          {/* Fall of wickets */}
          <FallOfWickets
            balls={activeInnings.balls}
            allPlayers={allPlayers}
            battingTeamPlayers={activeInnings.team?.players || []}
          />

          {/* Partnerships */}
          <PartnershipsTable partnerships={activeInnings.partnerships || []} />

          {/* Ball by ball toggle */}
          <button
            onClick={() => setShowBallByBall(!showBallByBall)}
            className="w-full text-xs text-t3 hover:text-t2 transition-colors py-2"
          >
            {showBallByBall ? 'Hide' : 'Show'} Ball by Ball
          </button>

          {showBallByBall && <BallByBallLog balls={activeInnings.balls} />}
        </div>
      )}

      {/* Only 1 innings */}
      {inn1 && !inn2 && (
        <div className="px-4 space-y-3">
          <BattingTable
            batting={inn1.batting}
            teamName={inn1.team?.name || 'Batting'}
            totalRuns={inn1.runs}
            totalWickets={inn1.wickets}
            completedOvers={inn1.completedOvers}
            currentBalls={inn1.currentBalls}
            extras={inn1.extras || { wides: 0, noBalls: 0, byes: 0, legByes: 0, total: 0 }}
            allPlayers={allPlayers}
          />
          <BowlingTable bowling={inn1.bowling} />
          <FallOfWickets
            balls={inn1.balls}
            allPlayers={allPlayers}
            battingTeamPlayers={inn1.team?.players || []}
          />
          <PartnershipsTable partnerships={inn1.partnerships || []} />
          <button
            onClick={() => setShowBallByBall(!showBallByBall)}
            className="w-full text-xs text-t3 hover:text-t2 transition-colors py-2"
          >
            {showBallByBall ? 'Hide' : 'Show'} Ball by Ball
          </button>
          {showBallByBall && <BallByBallLog balls={inn1.balls} />}
        </div>
      )}

      {/* No innings data */}
      {innings.length === 0 && (
        <div className="px-4">
          <div className="rounded-xl border border-border bg-bg-card p-8 text-center">
            <p className="text-sm text-t3">No innings data available</p>
          </div>
        </div>
      )}

      {/* Share buttons */}
      <div className="px-4 py-6 space-y-2">
        <Button
          onClick={handleShareImage}
          disabled={isExporting}
          className="w-full h-11 rounded-xl bg-accent text-bg-app hover:bg-accent/90 font-semibold"
        >
          <ImageIcon size={16} className="mr-2" />
          {isExporting ? 'Exporting...' : 'Share as Image'}
        </Button>
        <Button
          onClick={handleShareWhatsApp}
          variant="ghost"
          className="w-full h-11 rounded-xl border border-border text-t2 hover:text-t1"
        >
          <MessageCircle size={16} className="mr-2" />
          Copy WhatsApp Summary
        </Button>
      </div>
    </div>
  );
}

export { ScorecardView };
