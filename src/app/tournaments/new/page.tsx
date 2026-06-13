'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { ArrowLeft, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { toast } from 'sonner';
import type { Team, TournamentFormat } from '@/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function NewTournamentPage() {
  const router = useRouter();
  const { data: teams, isLoading } = useSWR<Team[]>('/api/teams', fetcher);

  const [name, setName] = useState('');
  const [format, setFormat] = useState<TournamentFormat>('ROUND_ROBIN');
  const [totalOvers, setTotalOvers] = useState(10);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleTeam = (teamId: string) => {
    setSelectedTeamIds((prev) =>
      prev.includes(teamId)
        ? prev.filter((id) => id !== teamId)
        : [...prev, teamId]
    );
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Please enter a tournament name');
      return;
    }
    if (selectedTeamIds.length < 2) {
      toast.error('Select at least 2 teams');
      return;
    }
    if (totalOvers < 2 || totalOvers > 20) {
      toast.error('Overs must be between 2 and 20');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          format,
          totalOvers,
          teamIds: selectedTeamIds,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create tournament');
      }

      const tournament = await res.json();
      toast.success('Tournament created!');
      router.push(`/tournaments/${tournament.id}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create tournament');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageWrapper>
      {/* Header */}
      <div className="sticky top-0 z-40 flex items-center gap-3 px-4 h-14 border-b border-border bg-bg-app/90 backdrop-blur-xl">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-t2 hover:text-t1 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold text-t1">Create League</h1>
      </div>

      <div className="px-4 py-6 space-y-6">
        {/* Name */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-t2">League Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Colony Premier League"
            className="bg-bg-input border-border text-t1 placeholder:text-t3 h-11 rounded-xl"
          />
        </div>

        {/* Format */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-t2">Format</Label>
          <div className="flex gap-2">
            <button
              onClick={() => setFormat('ROUND_ROBIN')}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-colors border ${
                format === 'ROUND_ROBIN'
                  ? 'bg-accent text-bg-app border-accent'
                  : 'bg-bg-card text-t3 border-border hover:border-border-act'
              }`}
            >
              Round Robin
            </button>
            <button
              onClick={() => setFormat('KNOCKOUT')}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-colors border ${
                format === 'KNOCKOUT'
                  ? 'bg-accent text-bg-app border-accent'
                  : 'bg-bg-card text-t3 border-border hover:border-border-act'
              }`}
            >
              Knockout
            </button>
          </div>
        </div>

        {/* Total Overs */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-t2">
            Total Overs ({totalOvers})
          </Label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={2}
              max={20}
              value={totalOvers}
              onChange={(e) => setTotalOvers(parseInt(e.target.value))}
              className="flex-1 accent-accent"
            />
            <span className="text-sm font-bold text-accent font-[family-name:var(--font-mono)] w-6 text-center">
              {totalOvers}
            </span>
          </div>
        </div>

        {/* Team Selection */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-t2">
            Select Teams ({selectedTeamIds.length} selected)
          </Label>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-xl bg-bg-card" />
              ))}
            </div>
          ) : teams && teams.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {teams.map((team) => {
                const isSelected = selectedTeamIds.includes(team.id);
                return (
                  <button
                    key={team.id}
                    onClick={() => toggleTeam(team.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                      isSelected
                        ? 'border-accent/40 bg-accent-dim/20'
                        : 'border-border bg-bg-card hover:border-border-act'
                    }`}
                  >
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: team.color }}
                    />
                    <span
                      className={`text-sm font-medium flex-1 text-left ${
                        isSelected ? 'text-t1' : 'text-t2'
                      }`}
                    >
                      {team.name}
                    </span>
                    <span className="text-xs text-t3">
                      {team.players.length} players
                    </span>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                        >
                          <path
                            d="M2 6L5 9L10 3"
                            stroke="#070710"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-bg-card p-6 text-center">
              <p className="text-sm text-t3">
                No teams available. Create teams first.
              </p>
            </div>
          )}
        </div>

        {/* Match count preview */}
        {selectedTeamIds.length >= 2 && format === 'ROUND_ROBIN' && (
          <div className="rounded-xl border border-border bg-bg-card p-3 text-center">
            <p className="text-xs text-t3">
              This will create{' '}
              <span className="font-bold text-t1">
                {(selectedTeamIds.length * (selectedTeamIds.length - 1)) / 2}
              </span>{' '}
              matches
            </p>
          </div>
        )}

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full h-12 rounded-xl bg-accent text-bg-app hover:bg-accent/90 font-semibold text-base"
        >
          {isSubmitting ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-bg-app border-t-transparent rounded-full animate-spin" />
              Creating...
            </div>
          ) : (
            <>
              <Plus size={18} className="mr-2" />
              Create League
            </>
          )}
        </Button>
      </div>
    </PageWrapper>
  );
}
