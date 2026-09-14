'use client';

import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface PlayerEntry {
  id?: string;
  name: string;
  jerseyNumber: string;
  /** v2 §13.2 — 'R' (default) | 'L' — wagon wheel mirroring */
  battingHand?: 'R' | 'L';
}

interface PlayerFormProps {
  players: PlayerEntry[];
  onChange: (players: PlayerEntry[]) => void;
}

export function PlayerForm({ players, onChange }: PlayerFormProps) {
  const addPlayer = () => {
    onChange([...players, { name: '', jerseyNumber: '', id: undefined }]);
  };

  const removePlayer = (index: number) => {
    onChange(players.filter((_, i) => i !== index));
  };

  const updatePlayer = (index: number, field: keyof PlayerEntry, value: string) => {
    const updated = [...players];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const toggleHand = (index: number) => {
    const updated = [...players];
    const current = updated[index].battingHand ?? 'R';
    updated[index] = { ...updated[index], battingHand: current === 'R' ? 'L' : 'R' };
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-t2">Players</label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 text-accent hover:text-accent"
          onClick={addPlayer}
        >
          <Plus size={14} className="mr-1" />
          Add
        </Button>
      </div>

      {players.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-bg-elevated/50 p-4 text-center">
          <p className="text-xs text-t3">No players added. Tap &quot;Add&quot; to add players.</p>
        </div>
      )}

      {players.map((player, index) => (
        <div key={index} className="flex items-center gap-2">
          <GripVertical size={14} className="text-t3 flex-shrink-0" />
          <span className="text-xs text-t3 w-5 text-center flex-shrink-0">{index + 1}</span>
          <Input
            value={player.name}
            onChange={(e) => updatePlayer(index, 'name', e.target.value)}
            placeholder="Player name"
            className="h-9 bg-bg-input border-border text-t1 text-sm placeholder:text-t3 flex-1"
          />
          <Input
            value={player.jerseyNumber}
            onChange={(e) => updatePlayer(index, 'jerseyNumber', e.target.value)}
            placeholder="#"
            type="number"
            className="h-9 bg-bg-input border-border text-t1 text-sm placeholder:text-t3 w-16"
          />
          {/* v2 §13.2 — batting hand toggle (R/L, mirrors the wagon wheel) */}
          <button
            type="button"
            onClick={() => toggleHand(index)}
            className={`h-9 w-9 rounded-md border text-[11px] font-mono font-semibold flex-shrink-0 transition-colors ${
              (player.battingHand ?? 'R') === 'L'
                ? 'border-accent/50 text-accent bg-accent/10'
                : 'border-border text-t3 bg-bg-input hover:text-t2'
            }`}
            title="Batting hand — tap to switch (mirrors the wagon wheel)"
            aria-label={`Batting hand for ${player.name || 'player'}: ${(player.battingHand ?? 'R') === 'L' ? 'left' : 'right'}-hand`}
          >
            {(player.battingHand ?? 'R') === 'L' ? 'L' : 'R'}
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-t3 hover:text-wicket flex-shrink-0"
            onClick={() => removePlayer(index)}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ))}
    </div>
  );
}
