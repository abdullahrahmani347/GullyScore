'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { deviceFetch } from '@/lib/device';
import type { Team, MatchData, TossDecision } from '@/types';

interface MatchCreateFormProps {
  teams: Team[];
}

type Step = 'teams' | 'config' | 'toss' | 'openers';

export function MatchCreateForm({ teams }: MatchCreateFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('teams');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Teams
  const [team1Id, setTeam1Id] = useState('');
  const [team2Id, setTeam2Id] = useState('');

  // Step 2: Config
  const [totalOvers, setTotalOvers] = useState('10');
  const [maxWickets, setMaxWickets] = useState('10');
  const [venue, setVenue] = useState('');

  // Step 3: Toss
  const [tossWinnerId, setTossWinnerId] = useState('');
  const [tossDecision, setTossDecision] = useState<TossDecision>('BAT');

  // Step 4: Openers
  const [strikerId, setStrikerId] = useState('');
  const [nonStrikerId, setNonStrikerId] = useState('');
  const [openingBowlerId, setOpeningBowlerId] = useState('');

  const team1 = teams.find((t) => t.id === team1Id);
  const team2 = teams.find((t) => t.id === team2Id);

  // Determine who bats first based on toss
  const battingTeamId = useMemo(() => {
    if (!tossWinnerId) return '';
    if (tossDecision === 'BAT') return tossWinnerId;
    // The other team bats first
    if (tossWinnerId === team1Id) return team2Id;
    return team1Id;
  }, [tossWinnerId, tossDecision, team1Id, team2Id]);

  const bowlingTeamId = useMemo(() => {
    if (!battingTeamId) return '';
    return battingTeamId === team1Id ? team2Id : team1Id;
  }, [battingTeamId, team1Id, team2Id]);

  const battingTeam = teams.find((t) => t.id === battingTeamId);
  const bowlingTeam = teams.find((t) => t.id === bowlingTeamId);

  const battingPlayers = battingTeam?.players ?? [];
  const bowlingPlayers = bowlingTeam?.players ?? [];

  const steps: { key: Step; label: string; num: number }[] = [
    { key: 'teams', label: 'Teams', num: 1 },
    { key: 'config', label: 'Config', num: 2 },
    { key: 'toss', label: 'Toss', num: 3 },
    { key: 'openers', label: 'Openers', num: 4 },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  const canProceed = () => {
    switch (step) {
      case 'teams':
        return team1Id && team2Id && team1Id !== team2Id;
      case 'config':
        return parseInt(totalOvers) >= 2 && parseInt(totalOvers) <= 20 && parseInt(maxWickets) >= 2 && parseInt(maxWickets) <= 11;
      case 'toss':
        return tossWinnerId && tossDecision;
      case 'openers':
        return strikerId && nonStrikerId && strikerId !== nonStrikerId && openingBowlerId;
      default:
        return false;
    }
  };

  const handleNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setStep(steps[nextIndex].key);
    }
  };

  const handlePrev = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setStep(steps[prevIndex].key);
    }
  };

  const handleSubmit = async () => {
    if (!team1Id || !team2Id || !tossWinnerId) return;
    setIsSubmitting(true);

    try {
      // 1. Create the match
      const matchRes = await deviceFetch('/api/matches', {
        method: 'POST',
        body: JSON.stringify({
          team1Id,
          team2Id,
          totalOvers: parseInt(totalOvers),
          maxWickets: parseInt(maxWickets),
          venue: venue.trim() || null,
        }),
      });

      if (!matchRes.ok) {
        const err = await matchRes.json();
        throw new Error(err.error || 'Failed to create match');
      }

      const match: MatchData = await matchRes.json();

      // 2. Update toss
      const tossRes = await deviceFetch(`/api/matches/${match.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'TOSS',
          tossWinnerId,
          tossDecision,
        }),
      });

      if (!tossRes.ok) {
        const err = await tossRes.json();
        throw new Error(err.error || 'Failed to update toss');
      }

      // 3. Create first innings
      const inningsRes = await deviceFetch(`/api/matches/${match.id}/innings`, {
        method: 'POST',
        body: JSON.stringify({
          teamId: battingTeamId,
          inningsNumber: 1,
        }),
      });

      if (!inningsRes.ok) {
        const err = await inningsRes.json();
        throw new Error(err.error || 'Failed to create innings');
      }

      const innings = await inningsRes.json();

      // 4. Set openers (striker/non-striker)
      const strikerRes = await deviceFetch(`/api/matches/${match.id}/innings/${innings.id}/striker`, {
        method: 'POST',
        body: JSON.stringify({
          strikerId,
          nonStrikerId,
        }),
      });

      if (!strikerRes.ok) {
        const err = await strikerRes.json();
        throw new Error(err.error || 'Failed to set openers');
      }

      // 5. Set opening bowler
      const bowlerRes = await deviceFetch(`/api/matches/${match.id}/innings/${innings.id}/bowler`, {
        method: 'POST',
        body: JSON.stringify({
          bowlerId: openingBowlerId,
        }),
      });

      if (!bowlerRes.ok) {
        const err = await bowlerRes.json();
        throw new Error(err.error || 'Failed to set bowler');
      }

      toast.success('Match created! Let\'s start scoring!');
      router.push(`/matches/${match.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create match');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {/* Step Indicator */}
      <div className="flex items-center gap-1 mb-6">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1 flex-1">
            <div
              className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors ${
                i < currentStepIndex
                  ? 'bg-accent text-bg-app'
                  : i === currentStepIndex
                  ? 'bg-accent-dim text-accent border border-accent/40'
                  : 'bg-bg-elevated text-t3'
              }`}
            >
              {i < currentStepIndex ? <Check size={14} /> : s.num}
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 rounded-full ${i < currentStepIndex ? 'bg-accent' : 'bg-bg-elevated'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="min-h-[400px]">
        {step === 'teams' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-t1">Select Teams</h2>
            <p className="text-sm text-t2">Choose the two teams playing</p>

            <div>
              <Label className="text-sm text-t2 mb-2">Team A</Label>
              <TeamSelector
                teams={teams}
                selectedId={team1Id}
                onSelect={setTeam1Id}
                excludeId={team2Id}
                placeholder="Select first team"
              />
            </div>

            <div>
              <Label className="text-sm text-t2 mb-2">Team B</Label>
              <TeamSelector
                teams={teams}
                selectedId={team2Id}
                onSelect={setTeam2Id}
                excludeId={team1Id}
                placeholder="Select second team"
              />
            </div>

            {teams.length < 2 && (
              <p className="text-xs text-gold">You need at least 2 teams to create a match. Create teams first.</p>
            )}
          </div>
        )}

        {step === 'config' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-t1">Match Configuration</h2>
            <p className="text-sm text-t2">Set up the match rules</p>

            <div>
              <Label className="text-sm text-t2 mb-2">Total Overs (2-20)</Label>
              <Input
                type="number"
                min={2}
                max={20}
                value={totalOvers}
                onChange={(e) => setTotalOvers(e.target.value)}
                className="h-11 bg-bg-input border-border text-t1 font-[family-name:var(--font-mono)]"
              />
            </div>

            <div>
              <Label className="text-sm text-t2 mb-2">Max Wickets (2-11)</Label>
              <Input
                type="number"
                min={2}
                max={11}
                value={maxWickets}
                onChange={(e) => setMaxWickets(e.target.value)}
                className="h-11 bg-bg-input border-border text-t1 font-[family-name:var(--font-mono)]"
              />
            </div>

            <div>
              <Label className="text-sm text-t2 mb-2">Venue (optional)</Label>
              <Input
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="e.g. Central Park Ground"
                className="h-11 bg-bg-input border-border text-t1 placeholder:text-t3"
              />
            </div>

            <div className="rounded-xl border border-border bg-bg-card p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-t2">Match</span>
                <span className="text-sm text-t1 font-medium">{team1?.shortName} vs {team2?.shortName}</span>
              </div>
            </div>
          </div>
        )}

        {step === 'toss' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-t1">Toss</h2>
            <p className="text-sm text-t2">Who won the toss?</p>

            <div>
              <Label className="text-sm text-t2 mb-2">Toss Winner</Label>
              <TeamSelector
                teams={[team1!, team2!]}
                selectedId={tossWinnerId}
                onSelect={setTossWinnerId}
                placeholder="Who won the toss?"
              />
            </div>

            {tossWinnerId && (
              <div>
                <Label className="text-sm text-t2 mb-3">Elected to</Label>
                <RadioGroup
                  value={tossDecision}
                  onValueChange={(v) => setTossDecision(v as TossDecision)}
                  className="flex gap-3"
                >
                  <label
                    className={`flex-1 flex items-center justify-center gap-2 rounded-xl border p-4 cursor-pointer transition-colors ${
                      tossDecision === 'BAT'
                        ? 'border-accent bg-accent-dim text-accent'
                        : 'border-border bg-bg-card text-t2 hover:border-border-act'
                    }`}
                  >
                    <RadioGroupItem value="BAT" className="sr-only" />
                    <span className="font-semibold text-sm">🏏 Bat</span>
                  </label>
                  <label
                    className={`flex-1 flex items-center justify-center gap-2 rounded-xl border p-4 cursor-pointer transition-colors ${
                      tossDecision === 'FIELD'
                        ? 'border-accent bg-accent-dim text-accent'
                        : 'border-border bg-bg-card text-t2 hover:border-border-act'
                    }`}
                  >
                    <RadioGroupItem value="FIELD" className="sr-only" />
                    <span className="font-semibold text-sm">🥎 Field</span>
                  </label>
                </RadioGroup>
              </div>
            )}

            {tossWinnerId && tossDecision && battingTeam && bowlingTeam && (
              <div className="rounded-xl border border-border bg-bg-card p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-t2">Batting first</span>
                  <span className="text-sm text-accent font-semibold">{battingTeam.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-t2">Bowling first</span>
                  <span className="text-sm text-run-6 font-semibold">{bowlingTeam.name}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'openers' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-t1">Opening Players</h2>
            <p className="text-sm text-t2">Select the openers and opening bowler</p>

            <div>
              <Label className="text-sm text-t2 mb-2">
                Striker ({battingTeam?.shortName})
              </Label>
              <PlayerSelector
                players={battingPlayers}
                selectedId={strikerId}
                onSelect={setStrikerId}
                excludeIds={[nonStrikerId]}
                placeholder="Select striker"
              />
            </div>

            <div>
              <Label className="text-sm text-t2 mb-2">
                Non-Striker ({battingTeam?.shortName})
              </Label>
              <PlayerSelector
                players={battingPlayers}
                selectedId={nonStrikerId}
                onSelect={setNonStrikerId}
                excludeIds={[strikerId]}
                placeholder="Select non-striker"
              />
            </div>

            <div>
              <Label className="text-sm text-t2 mb-2">
                Opening Bowler ({bowlingTeam?.shortName})
              </Label>
              <PlayerSelector
                players={bowlingPlayers}
                selectedId={openingBowlerId}
                onSelect={setOpeningBowlerId}
                placeholder="Select opening bowler"
              />
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 mt-6">
        {currentStepIndex > 0 && (
          <Button
            type="button"
            variant="ghost"
            onClick={handlePrev}
            className="flex-1 h-11 rounded-xl border border-border text-t2 hover:text-t1"
          >
            <ChevronLeft size={16} className="mr-1" />
            Back
          </Button>
        )}
        {currentStepIndex < steps.length - 1 ? (
          <Button
            type="button"
            onClick={handleNext}
            disabled={!canProceed()}
            className="flex-1 h-11 bg-accent text-bg-app hover:bg-accent/90 font-semibold rounded-xl disabled:opacity-50"
          >
            Next
            <ChevronRight size={16} className="ml-1" />
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canProceed() || isSubmitting}
            className="flex-1 h-11 bg-accent text-bg-app hover:bg-accent/90 font-semibold rounded-xl disabled:opacity-50"
          >
            {isSubmitting ? 'Creating...' : 'Start Match 🏏'}
          </Button>
        )}
      </div>
    </div>
  );
}

// Sub-components

function TeamSelector({
  teams,
  selectedId,
  onSelect,
  excludeId,
  placeholder,
}: {
  teams: Team[];
  selectedId: string;
  onSelect: (id: string) => void;
  excludeId?: string;
  placeholder: string;
}) {
  const available = teams.filter((t) => t.id !== excludeId);
  const selected = teams.find((t) => t.id === selectedId);

  return (
    <div className="space-y-2">
      {selected && (
        <div
          className="flex items-center gap-3 rounded-xl border border-accent/40 bg-accent-dim p-3"
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
            style={{ backgroundColor: selected.color + '22' }}
          >
            {selected.emoji}
          </div>
          <div className="flex-1">
            <span className="text-sm font-semibold text-t1">{selected.name}</span>
            <span className="text-xs text-t2 ml-2">({selected.players?.length ?? 0} players)</span>
          </div>
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selected.color }} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {available.map((team) => (
          <button
            key={team.id}
            type="button"
            onClick={() => onSelect(team.id)}
            className={`flex items-center gap-2 rounded-xl border p-3 transition-colors text-left ${
              team.id === selectedId
                ? 'border-accent/40 bg-accent-dim'
                : 'border-border bg-bg-card hover:border-border-act'
            }`}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
              style={{ backgroundColor: team.color + '22' }}
            >
              {team.emoji}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-t1 truncate">{team.shortName}</p>
              <p className="text-[10px] text-t3">{team.players?.length ?? 0} players</p>
            </div>
          </button>
        ))}
      </div>
      {available.length === 0 && (
        <p className="text-xs text-t3 text-center py-4">{placeholder}</p>
      )}
    </div>
  );
}

function PlayerSelector({
  players,
  selectedId,
  onSelect,
  excludeIds,
  placeholder,
}: {
  players: { id: string; name: string; jerseyNumber?: number | null }[];
  selectedId: string;
  onSelect: (id: string) => void;
  excludeIds?: string[];
  placeholder: string;
}) {
  const available = players.filter((p) => !excludeIds?.includes(p.id));
  const selected = players.find((p) => p.id === selectedId);

  return (
    <div className="space-y-2">
      {selected && (
        <div className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent-dim p-3">
          <div className="w-7 h-7 rounded-full bg-bg-elevated flex items-center justify-center text-xs text-accent font-[family-name:var(--font-mono)]">
            {selected.jerseyNumber ?? '#'}
          </div>
          <span className="text-sm font-medium text-t1">{selected.name}</span>
        </div>
      )}
      <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border border-border bg-bg-card p-2">
        {available.length === 0 ? (
          <p className="text-xs text-t3 text-center py-4">{placeholder}</p>
        ) : (
          available.map((player) => (
            <button
              key={player.id}
              type="button"
              onClick={() => onSelect(player.id)}
              className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                player.id === selectedId
                  ? 'bg-accent-dim text-accent'
                  : 'hover:bg-bg-elevated text-t2'
              }`}
            >
              <div className="w-6 h-6 rounded-full bg-bg-elevated flex items-center justify-center text-[10px] text-t3 font-[family-name:var(--font-mono)]">
                {player.jerseyNumber ?? '#'}
              </div>
              <span className="text-sm">{player.name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
