'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlayerForm, type PlayerEntry } from '@/components/teams/PlayerForm';
import type { Team } from '@/types';

const COLOR_SWATCHES = [
  '#00D4AA', '#FF6B35', '#4ECDC4', '#FFD700', '#FF4444',
  '#9B59B6', '#3498DB', '#E74C3C', '#2ECC71', '#F39C12',
  '#1ABC9C', '#E91E63',
];

const EMOJI_OPTIONS = ['🏏', '⚡', '🔥', '🦁', '🐯', '🦅', '👑', '🌟', '💪', '🎯', '🏆', '🏴'];

interface TeamFormProps {
  initialData?: Team;
  onSubmit: (data: {
    name: string;
    shortName: string;
    color: string;
    emoji: string;
    players: { id?: string; name: string; jerseyNumber?: number }[];
  }) => Promise<void>;
  isLoading: boolean;
}

export function TeamForm({ initialData, onSubmit, isLoading }: TeamFormProps) {
  const [name, setName] = useState(initialData?.name ?? '');
  const [shortName, setShortName] = useState(initialData?.shortName ?? '');
  const [color, setColor] = useState(initialData?.color ?? '#00D4AA');
  const [emoji, setEmoji] = useState(initialData?.emoji ?? '🏏');
  const [players, setPlayers] = useState<PlayerEntry[]>(
    initialData?.players?.map((p) => ({
      id: p.id,
      name: p.name,
      jerseyNumber: p.jerseyNumber?.toString() ?? '',
    })) ?? []
  );
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !shortName.trim()) return;

    await onSubmit({
      name: name.trim(),
      shortName: shortName.trim().toUpperCase(),
      color,
      emoji,
      players: players
        .filter((p) => p.name.trim())
        .map((p) => ({
          ...(p.id ? { id: p.id } : {}),
          name: p.name.trim(),
          jerseyNumber: p.jerseyNumber ? parseInt(p.jerseyNumber, 10) : undefined,
        })),
    });
  };

  const isValid = name.trim() && shortName.trim();

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Team identity */}
      <div className="flex items-start gap-4">
        {/* Emoji selector */}
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="w-14 h-14 rounded-xl border border-border bg-bg-elevated flex items-center justify-center text-2xl hover:border-border-act transition-colors"
          >
            {emoji}
          </button>
          {showEmojiPicker && (
            <div className="absolute mt-16 z-10 grid grid-cols-6 gap-1 p-2 rounded-xl border border-border bg-bg-elevated shadow-lg">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    setEmoji(e);
                    setShowEmojiPicker(false);
                  }}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg hover:bg-bg-input transition-colors ${
                    emoji === e ? 'bg-accent-dim' : ''
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 space-y-3">
          <div>
            <Label className="text-sm text-t2 mb-1.5">Team Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mumbai Strikers"
              className="h-10 bg-bg-input border-border text-t1 placeholder:text-t3"
              maxLength={40}
            />
          </div>
          <div>
            <Label className="text-sm text-t2 mb-1.5">Short Name</Label>
            <Input
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              placeholder="e.g. MUM"
              className="h-10 bg-bg-input border-border text-t1 placeholder:text-t3 uppercase"
              maxLength={5}
            />
          </div>
        </div>
      </div>

      {/* Color swatches */}
      <div>
        <Label className="text-sm text-t2 mb-2">Team Color</Label>
        <div className="flex flex-wrap gap-2">
          {COLOR_SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`w-9 h-9 rounded-lg border-2 transition-all ${
                color === c ? 'border-t1 scale-110' : 'border-transparent'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {/* Players */}
      <PlayerForm players={players} onChange={setPlayers} />

      {/* Submit */}
      <Button
        type="submit"
        disabled={!isValid || isLoading}
        className="w-full h-11 bg-accent text-bg-app hover:bg-accent/90 font-semibold rounded-xl disabled:opacity-50"
      >
        {isLoading ? 'Saving...' : initialData ? 'Update Team' : 'Create Team'}
      </Button>
    </form>
  );
}
