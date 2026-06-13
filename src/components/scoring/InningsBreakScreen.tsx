'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Separator } from '@/components/ui/separator';
import { useMatchStore } from '@/store/matchStore';
import { formatOvers, calculateCRR } from '@/lib/scoring-utils';
import type { MatchData, InningsState, Player } from '@/types';

interface InningsBreakScreenProps {
  match: MatchData;
  firstInnings: InningsState;
  onCreateInnings: (teamId: string, inningsNumber: number, target: number) => Promise<InningsState | null>;
  onSetStriker: (strikerId: string, nonStrikerId: string) => Promise<void>;
  onSetBowler: (bowlerId: string) => Promise<void>;
  onCompleteInnings: () => Promise<void>;
  onStateChange: (state: 'SETUP_OPENER_1') => void;
}

export function InningsBreakScreen({
  match,
  firstInnings,
  onCreateInnings,
  onSetStriker,
  onSetBowler,
  onCompleteInnings,
  onStateChange,
}: InningsBreakScreenProps) {
  const [step, setStep] = useState<'summary' | 'openers' | 'bowler'>('summary');
  const [opener1Id, setOpener1Id] = useState<string | null>(null);
  const [opener2Id, setOpener2Id] = useState<string | null>(null);
  const [bowlerId, setBowlerId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // The chasing team is the one that wasn't batting in 1st innings
  const chasingTeamId = match.team1Id === firstInnings.teamId ? match.team2Id : match.team1Id;
  const chasingTeam = chasingTeamId === match.team1Id ? match.team1 : match.team2;
  const fieldingTeam = chasingTeamId === match.team1Id ? match.team2 : match.team1;

  const target = firstInnings.runs + 1;

  const handleStartSecondInnings = async () => {
    setIsProcessing(true);
    try {
      // Complete 1st innings first
      await onCompleteInnings();

      // Create 2nd innings
      const innings = await onCreateInnings(chasingTeamId, 2, target);
      if (!innings) {
        setIsProcessing(false);
        return;
      }

      setStep('openers');
    } catch {
      setIsProcessing(false);
    }
    setIsProcessing(false);
  };

  const handleConfirmOpeners = async () => {
    if (!opener1Id || !opener2Id) return;
    setIsProcessing(true);
    try {
      await onSetStriker(opener1Id, opener2Id);
      setStep('bowler');
    } catch {
      // error handled in hook
    }
    setIsProcessing(false);
  };

  const handleConfirmBowler = async () => {
    if (!bowlerId) return;
    setIsProcessing(true);
    try {
      await onSetBowler(bowlerId);
      onStateChange('SETUP_OPENER_1'); // Will transition to SCORING
    } catch {
      // error handled in hook
    }
    setIsProcessing(false);
  };

  return (
    <div className="min-h-dvh bg-bg-app flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-6"
      >
        {/* Header */}
        <div className="text-center">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200 }}
            className="text-3xl mb-2"
          >
            🏏
          </motion.div>
          <h2 className="text-xl font-bold text-t1">Innings Break</h2>
        </div>

        {step === 'summary' && (
          <>
            {/* 1st innings score */}
            <div className="rounded-2xl bg-bg-card border border-border p-5 text-center">
              <p className="text-xs text-t3 uppercase tracking-wider mb-2">1st Innings</p>
              <p className="text-sm text-t2 mb-1">{firstInnings.team.name}</p>
              <p className="text-4xl font-bold text-t1 font-mono">
                {firstInnings.runs}/{firstInnings.wickets}
              </p>
              <p className="text-sm text-t3 font-mono mt-1">
                ({formatOvers(firstInnings.completedOvers, firstInnings.currentBalls)} ov)
              </p>
              <p className="text-xs text-t3 mt-1">
                CRR: {calculateCRR(firstInnings.runs, firstInnings.completedOvers, firstInnings.currentBalls).toFixed(2)}
              </p>
            </div>

            {/* Target */}
            <div className="rounded-2xl bg-accent/10 border border-accent/20 p-4 text-center">
              <p className="text-xs text-accent uppercase tracking-wider mb-1">Target</p>
              <p className="text-3xl font-bold text-accent font-mono">{target}</p>
              <p className="text-sm text-t2 mt-1">{chasingTeam.name} need {target} runs in {match.totalOvers} overs</p>
            </div>

            <button
              onClick={handleStartSecondInnings}
              disabled={isProcessing}
              className="w-full h-12 rounded-xl bg-accent text-bg-app font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {isProcessing ? 'Setting up...' : 'Start 2nd Innings'}
            </button>
          </>
        )}

        {step === 'openers' && (
          <>
            <div className="text-center">
              <p className="text-sm text-t2">Select opening batsmen for {chasingTeam.name}</p>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-t3 uppercase tracking-wider font-medium">Opener 1 (Striker)</p>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {chasingTeam.players.map((player) => (
                  <motion.button
                    key={player.id}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setOpener1Id(player.id)}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors ${
                      opener1Id === player.id
                        ? 'bg-accent/15 border border-accent/30'
                        : 'bg-bg-elevated hover:bg-bg-elevated/80'
                    } ${opener2Id === player.id ? 'opacity-30 pointer-events-none' : ''}`}
                  >
                    {player.jerseyNumber && (
                      <span className="w-8 h-8 rounded-full bg-bg-elevated flex items-center justify-center text-xs font-bold text-t2 font-mono">
                        {player.jerseyNumber}
                      </span>
                    )}
                    <span className={`text-sm font-medium ${opener1Id === player.id ? 'text-accent' : 'text-t1'}`}>
                      {player.name}
                    </span>
                  </motion.button>
                ))}
              </div>

              <Separator className="bg-border" />

              <p className="text-xs text-t3 uppercase tracking-wider font-medium">Opener 2 (Non-striker)</p>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {chasingTeam.players.map((player) => (
                  <motion.button
                    key={player.id}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setOpener2Id(player.id)}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors ${
                      opener2Id === player.id
                        ? 'bg-accent/15 border border-accent/30'
                        : 'bg-bg-elevated hover:bg-bg-elevated/80'
                    } ${opener1Id === player.id ? 'opacity-30 pointer-events-none' : ''}`}
                  >
                    {player.jerseyNumber && (
                      <span className="w-8 h-8 rounded-full bg-bg-elevated flex items-center justify-center text-xs font-bold text-t2 font-mono">
                        {player.jerseyNumber}
                      </span>
                    )}
                    <span className={`text-sm font-medium ${opener2Id === player.id ? 'text-accent' : 'text-t1'}`}>
                      {player.name}
                    </span>
                  </motion.button>
                ))}
              </div>
            </div>

            <button
              onClick={handleConfirmOpeners}
              disabled={!opener1Id || !opener2Id || isProcessing}
              className={`w-full h-12 rounded-xl font-semibold transition-colors ${
                opener1Id && opener2Id
                  ? 'bg-accent text-bg-app hover:bg-accent/90'
                  : 'bg-bg-elevated text-t3 cursor-not-allowed'
              }`}
            >
              {isProcessing ? 'Setting...' : 'Confirm Openers'}
            </button>
          </>
        )}

        {step === 'bowler' && (
          <>
            <div className="text-center">
              <p className="text-sm text-t2">Select opening bowler for {fieldingTeam.name}</p>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-1">
              {fieldingTeam.players.map((player) => (
                <motion.button
                  key={player.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setBowlerId(player.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors ${
                    bowlerId === player.id
                      ? 'bg-accent/15 border border-accent/30'
                      : 'bg-bg-elevated hover:bg-bg-elevated/80'
                  }`}
                >
                  {player.jerseyNumber && (
                    <span className="w-8 h-8 rounded-full bg-bg-elevated flex items-center justify-center text-xs font-bold text-t2 font-mono">
                      {player.jerseyNumber}
                    </span>
                  )}
                  <span className={`text-sm font-medium ${bowlerId === player.id ? 'text-accent' : 'text-t1'}`}>
                    {player.name}
                  </span>
                </motion.button>
              ))}
            </div>

            <button
              onClick={handleConfirmBowler}
              disabled={!bowlerId || isProcessing}
              className={`w-full h-12 rounded-xl font-semibold transition-colors ${
                bowlerId
                  ? 'bg-accent text-bg-app hover:bg-accent/90'
                  : 'bg-bg-elevated text-t3 cursor-not-allowed'
              }`}
            >
              {isProcessing ? 'Setting...' : 'Confirm Bowler'}
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}
