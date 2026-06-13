'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { formatBowlingFigures } from '@/lib/scoring-utils';
import type { Player, BowlerInningsData } from '@/types';

interface PlayerSelectModalProps {
  open: boolean;
  players: Player[];
  title: string;
  description?: string;
  onSelect: (playerId: string) => void;
  disabledPlayerIds?: string[];
  mode: 'batsman' | 'bowler';
  bowlingStats?: BowlerInningsData[];
}

export function PlayerSelectModal({
  open,
  players,
  title,
  description,
  onSelect,
  disabledPlayerIds = [],
  mode,
  bowlingStats = [],
}: PlayerSelectModalProps) {
  const [search, setSearch] = useState('');

  const filteredPlayers = useMemo(() => {
    if (!search.trim()) return players;
    const q = search.toLowerCase();
    return players.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.jerseyNumber && String(p.jerseyNumber).includes(q))
    );
  }, [players, search]);

  const getBowlerStats = (playerId: string): BowlerInningsData | undefined => {
    return bowlingStats.find((b) => b.playerId === playerId);
  };

  return (
    <Dialog open={open} onOpenChange={() => { /* Non-dismissable */ }}>
      <DialogContent
        showCloseButton={false}
        className="bg-bg-card border-border max-h-[85vh] flex flex-col"
      >
        <DialogHeader>
          <DialogTitle className="text-t1 text-base">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-t3 text-xs">{description}</DialogDescription>
          )}
        </DialogHeader>

        {/* Search */}
        <div className="relative px-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-t3" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search player..."
            className="pl-9 h-10 bg-bg-input border-border text-t1 placeholder:text-t3"
          />
        </div>

        {/* Player list */}
        <div className="flex-1 overflow-y-auto max-h-[50vh] -mx-1 px-1 space-y-1">
          {filteredPlayers.length === 0 && (
            <div className="py-8 text-center text-t3 text-sm">No players found</div>
          )}
          {filteredPlayers.map((player) => {
            const isDisabled = disabledPlayerIds.includes(player.id);
            const stats = mode === 'bowler' ? getBowlerStats(player.id) : undefined;

            return (
              <motion.button
                key={player.id}
                whileTap={!isDisabled ? { scale: 0.97 } : {}}
                onClick={() => !isDisabled && onSelect(player.id)}
                disabled={isDisabled}
                className={`
                  w-full flex items-center justify-between px-3 py-3 rounded-xl
                  transition-colors text-left
                  ${isDisabled
                    ? 'opacity-40 cursor-not-allowed bg-transparent'
                    : 'hover:bg-bg-elevated active:bg-bg-elevated/80'
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  {player.jerseyNumber && (
                    <span className="w-8 h-8 rounded-full bg-bg-elevated flex items-center justify-center text-xs font-bold text-t2 font-mono">
                      {player.jerseyNumber}
                    </span>
                  )}
                  <span className={`text-sm font-medium ${isDisabled ? 'text-t3' : 'text-t1'}`}>
                    {player.name}
                  </span>
                </div>

                {mode === 'bowler' && stats && (
                  <span className="text-xs font-mono text-t3">
                    {formatBowlingFigures(stats.completedOvers, stats.balls, stats.runs, stats.wickets)}
                  </span>
                )}

                {isDisabled && mode === 'bowler' && (
                  <span className="text-[10px] text-t3">Bowled last over</span>
                )}
              </motion.button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
