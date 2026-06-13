'use client';

import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatBowlingFigures } from '@/lib/scoring-utils';
import { useMatchStore } from '@/store/matchStore';
import type { MatchData, InningsState, Player, BowlerInningsData } from '@/types';

interface OverCompleteModalProps {
  open: boolean;
  match: MatchData;
  currentInnings: InningsState;
  onSelectBowler: (bowlerId: string) => void;
}

export function OverCompleteModal({ open, match, currentInnings, onSelectBowler }: OverCompleteModalProps) {
  const [search, setSearch] = useState('');
  const [selectedBowlerId, setSelectedBowlerId] = useState<string | null>(null);
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

  const availableBowlers = useMemo(() => {
    const bowlers = fieldingTeam.players.filter((p) => p.id !== lastBowlerId);
    if (!search.trim()) return bowlers;
    const q = search.toLowerCase();
    return bowlers.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.jerseyNumber && String(p.jerseyNumber).includes(q))
    );
  }, [fieldingTeam.players, lastBowlerId, search]);

  const getBowlerStats = (playerId: string): BowlerInningsData | undefined => {
    return currentInnings.bowling.find((b) => b.playerId === playerId);
  };

  const handleConfirm = () => {
    if (!selectedBowlerId) return;
    onSelectBowler(selectedBowlerId);
    setSearch('');
    setSelectedBowlerId(null);
  };

  return (
    <Dialog open={open} onOpenChange={() => { /* Non-dismissable */ }}>
      <DialogContent showCloseButton={false} className="bg-bg-card border-border max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-t1 text-base">Over Complete</DialogTitle>
          <DialogDescription className="text-t3 text-xs">
            {overRuns} runs{overWickets > 0 ? `, ${overWickets} wicket${overWickets > 1 ? 's' : ''}` : ''} in over {justCompletedOverNumber + 1}. Select next bowler.
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

        {/* Bowler list */}
        <div className="flex-1 overflow-y-auto max-h-[40vh] -mx-1 px-1 space-y-1">
          {availableBowlers.length === 0 && (
            <div className="py-8 text-center text-t3 text-sm">No available bowlers</div>
          )}
          {availableBowlers.map((player) => {
            const stats = getBowlerStats(player.id);
            const isSelected = selectedBowlerId === player.id;

            return (
              <motion.button
                key={player.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => setSelectedBowlerId(player.id)}
                className={`w-full flex items-center justify-between px-3 py-3 rounded-xl transition-colors text-left ${
                  isSelected
                    ? 'bg-accent/15 border border-accent/30'
                    : 'hover:bg-bg-elevated active:bg-bg-elevated/80'
                }`}
              >
                <div className="flex items-center gap-3">
                  {player.jerseyNumber && (
                    <span className="w-8 h-8 rounded-full bg-bg-elevated flex items-center justify-center text-xs font-bold text-t2 font-mono">
                      {player.jerseyNumber}
                    </span>
                  )}
                  <span className={`text-sm font-medium ${isSelected ? 'text-accent' : 'text-t1'}`}>
                    {player.name}
                  </span>
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

        {/* Confirm button */}
        <button
          onClick={handleConfirm}
          disabled={!selectedBowlerId || isSubmitting}
          className={`w-full h-12 rounded-xl font-semibold text-sm transition-colors ${
            selectedBowlerId
              ? 'bg-accent text-bg-app hover:bg-accent/90'
              : 'bg-bg-elevated text-t3 cursor-not-allowed'
          }`}
        >
          {isSubmitting ? 'Setting bowler...' : 'Confirm Bowler'}
        </button>
      </DialogContent>
    </Dialog>
  );
}
