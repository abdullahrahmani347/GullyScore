'use client';

import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatBowlingFigures } from '@/lib/scoring-utils';
import { useMatchStore } from '@/store/matchStore';
import { rankBowlerSuggestions } from '@/lib/scoring-ux';
import type { MatchData, InningsState, Player, BowlerInningsData } from '@/types';

interface OverCompleteModalProps {
  open: boolean;
  match: MatchData;
  currentInnings: InningsState;
  onSelectBowler: (bowlerId: string) => void;
}

const REASON_LABEL: Record<string, string> = {
  rested: 'freshest arm',
  'fewest-overs': 'fewest overs',
  'only-option': 'only option',
};

/**
 * v2 §14.4 — the new-bowler sheet is smart-sorted:
 *   engine filter (can't bowl consecutive overs) → least recently bowled →
 *   fewest overs. The #1 is pre-selected and EVERY row accepts in one tap
 * (no separate confirm step — speed first).
 */
export function OverCompleteModal({ open, match, currentInnings, onSelectBowler }: OverCompleteModalProps) {
  const [search, setSearch] = useState('');
  const isSubmitting = useMatchStore((s) => s.isSubmitting);

  // Get the fielding team (opposite of batting team)
  const fieldingTeamId = match.team1Id === currentInnings.teamId ? match.team2Id : match.team1Id;
  const fieldingTeam = fieldingTeamId === match.team1Id ? match.team1 : match.team2;

  // The last bowler (who just finished the over) can't bowl the next over
  const lastBowlerId = currentInnings.currentBowlerId;

  // Calculate over summary
  const justCompletedOverNumber = currentInnings.completedOvers - 1;
  const overBalls = currentInnings.balls.filter((b) => b.overNumber === justCompletedOverNumber);
  const overRuns = overBalls.reduce((acc, b) => acc + b.runs + b.extraRuns, 0);
  const overWickets = overBalls.filter((b) => b.isWicket).length;

  // §14.4 — engine ranking: consecutive-over filter → recency → workload
  const ranking = useMemo(
    () => rankBowlerSuggestions(fieldingTeam.players, currentInnings),
    [fieldingTeam.players, currentInnings]
  );
  const rankOf = (playerId: string) => ranking.findIndex((r) => r.playerId === playerId);

  const visibleBowlers = useMemo(() => {
    const sorted = [...fieldingTeam.players].sort((a, b) => rankOf(a.id) - rankOf(b.id));
    if (!search.trim()) return sorted;
    const q = search.toLowerCase();
    return sorted.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.jerseyNumber && String(p.jerseyNumber).includes(q))
    );
  }, [fieldingTeam.players, ranking, search]);

  const getBowlerStats = (playerId: string): BowlerInningsData | undefined => {
    return currentInnings.bowling.find((b) => b.playerId === playerId);
  };

  // One tap = confirmed (the suggested row first, engine-ranked order)
  const handlePick = (playerId: string) => {
    if (isSubmitting) return;
    onSelectBowler(playerId);
    setSearch('');
  };

  return (
    <Dialog open={open} onOpenChange={() => { /* Non-dismissable */ }}>
      <DialogContent showCloseButton={false} className="bg-bg-card border-border max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-t1 text-base">Over Complete</DialogTitle>
          <DialogDescription className="text-t3 text-xs">
            {overRuns} runs{overWickets > 0 ? `, ${overWickets} wicket${overWickets > 1 ? 's' : ''}` : ''} in over{' '}
            {justCompletedOverNumber + 1}. Tap a bowler — one tap starts the over.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative px-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-t3" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search bowler..."
            className="pl-9 h-10 bg-bg-input border-border text-t1 placeholder:text-t3"
          />
        </div>

        {/* Bowler list — engine-ranked, tap = confirmed */}
        <div className="flex-1 overflow-y-auto max-h-[40vh] -mx-1 px-1 space-y-1">
          {visibleBowlers.length === 0 && (
            <div className="py-8 text-center text-t3 text-sm">No available bowlers</div>
          )}
          {visibleBowlers.map((player, idx) => {
            const stats = getBowlerStats(player.id);
            const suggestion = rankOf(player.id) === 0 ? ranking[0] : null;
            const isSuggested = idx === 0 && suggestion != null;

            return (
              <motion.button
                key={player.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => handlePick(player.id)}
                disabled={isSubmitting}
                className={`w-full flex items-center justify-between px-3 py-3 rounded-xl transition-colors text-left ${
                  isSuggested
                    ? 'bg-accent/15 border border-accent/40'
                    : 'hover:bg-bg-elevated active:bg-bg-elevated/80 border border-transparent'
                } ${isSubmitting ? 'opacity-60 pointer-events-none' : ''}`}
              >
                <div className="flex items-center gap-3">
                  {player.jerseyNumber && (
                    <span className="w-8 h-8 rounded-full bg-bg-elevated flex items-center justify-center text-xs font-bold text-t2 font-mono">
                      {player.jerseyNumber}
                    </span>
                  )}
                  <span className="text-sm font-medium text-t1">
                    {player.name}
                  </span>
                  {isSuggested && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-accent/20 text-accent border border-accent/30 uppercase">
                      <Sparkles size={9} />
                      {REASON_LABEL[suggestion.reason] ?? 'suggested'}
                    </span>
                  )}
                </div>

                {stats && (
                  <span className="text-xs font-mono text-t3">
                    {formatBowlingFigures(stats.completedOvers, stats.balls, stats.runs, stats.wickets)}
                  </span>
                )}
              </motion.button>
            );
          })}

          {/* Show disabled last bowler */}
          {lastBowlerId && (() => {
            const lastBowler = fieldingTeam.players.find((p) => p.id === lastBowlerId);
            if (!lastBowler) return null;
            return (
              <div className="flex items-center justify-between px-3 py-3 rounded-xl opacity-30">
                <div className="flex items-center gap-3">
                  {lastBowler.jerseyNumber && (
                    <span className="w-8 h-8 rounded-full bg-bg-elevated flex items-center justify-center text-xs font-bold text-t2 font-mono">
                      {lastBowler.jerseyNumber}
                    </span>
                  )}
                  <span className="text-sm text-t3">{lastBowler.name}</span>
                </div>
                <span className="text-[10px] text-t3">Bowled last over</span>
              </div>
            );
          })()}
        </div>

        {isSubmitting && (
          <p className="text-center text-xs text-t3 pb-1">Setting bowler…</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
