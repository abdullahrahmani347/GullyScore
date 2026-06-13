'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useMatchStore } from '@/store/matchStore';
import type { WicketType, MatchData, InningsState, Player } from '@/types';

interface WicketModalProps {
  open: boolean;
  match: MatchData;
  currentInnings: InningsState;
  onConfirm: (data: { wicketType: WicketType; dismissedPlayerId: string; fielderPlayerId?: string }) => void;
  onCancel: () => void;
}

const wicketTypes: { type: WicketType; label: string; icon: string }[] = [
  { type: 'BOWLED', label: 'Bowled', icon: '🏏' },
  { type: 'CAUGHT', label: 'Caught', icon: '✋' },
  { type: 'RUN_OUT', label: 'Run Out', icon: '🏃' },
  { type: 'LBW', label: 'LBW', icon: '🦵' },
  { type: 'STUMPED', label: 'Stumped', icon: '🧤' },
  { type: 'HIT_WICKET', label: 'Hit Wicket', icon: '💥' },
  { type: 'RETIRED_HURT', label: 'Retired Hurt', icon: '🏥' },
];

export function WicketModal({ open, match, currentInnings, onConfirm, onCancel }: WicketModalProps) {
  const strikerId = useMatchStore((s) => s.strikerId);
  const nonStrikerId = useMatchStore((s) => s.nonStrikerId);
  const isSubmitting = useMatchStore((s) => s.isSubmitting);

  const [selectedWicketType, setSelectedWicketType] = useState<WicketType | null>(null);
  const [dismissedPlayerId, setDismissedPlayerId] = useState<string | null>(null);
  const [fielderPlayerId, setFielderPlayerId] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);

  // Fielding team players
  const fieldingTeamId = match.team1Id === currentInnings.teamId ? match.team2Id : match.team1Id;
  const fieldingTeam = fieldingTeamId === match.team1Id ? match.team1 : match.team2;
  const fieldingPlayers = fieldingTeam.players;

  // Striker and non-striker info
  const striker = currentInnings.batting.find((b) => b.playerId === strikerId);
  const nonStriker = currentInnings.batting.find((b) => b.playerId === nonStrikerId);

  // For caught/stumped/hit_wicket, the dismissed player is always the striker
  // For run out, user selects which batsman
  const needsBatsmanSelect = selectedWicketType === 'RUN_OUT';
  const needsFielderSelect = selectedWicketType === 'CAUGHT' || selectedWicketType === 'RUN_OUT' || selectedWicketType === 'STUMPED';

  const canConfirm = useMemo(() => {
    if (!selectedWicketType) return false;
    if (!dismissedPlayerId) return false;
    if (needsFielderSelect && !fielderPlayerId) return false;
    return true;
  }, [selectedWicketType, dismissedPlayerId, needsFielderSelect, fielderPlayerId]);

  const handleWicketTypeSelect = (type: WicketType) => {
    setSelectedWicketType(type);

    // For non-RUN_OUT types, the dismissed player is the striker
    if (type !== 'RUN_OUT') {
      setDismissedPlayerId(strikerId);
      if (!needsFielderSelect) {
        // No fielder needed for BOWLED, LBW, HIT_WICKET
        onConfirm({ wicketType: type, dismissedPlayerId: strikerId! });
        resetState();
      } else {
        setStep(2);
      }
    } else {
      // For RUN_OUT, need to select which batsman
      setStep(2);
    }
  };

  const handleConfirm = () => {
    if (!canConfirm || !selectedWicketType || !dismissedPlayerId) return;

    onConfirm({
      wicketType: selectedWicketType,
      dismissedPlayerId,
      ...(fielderPlayerId ? { fielderPlayerId } : {}),
    });
    resetState();
  };

  const handleCancel = () => {
    resetState();
    onCancel();
  };

  const resetState = () => {
    setSelectedWicketType(null);
    setDismissedPlayerId(null);
    setFielderPlayerId(null);
    setStep(1);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleCancel(); }}>
      <DialogContent showCloseButton={false} className="bg-bg-card border-border max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="text-t1 text-base">
            {step === 1 ? 'Wicket Type' : 'Wicket Details'}
          </DialogTitle>
          <DialogDescription className="text-t3 text-xs">
            {step === 1
              ? 'How was the batsman dismissed?'
              : selectedWicketType === 'RUN_OUT'
              ? 'Which batsman was run out?'
              : 'Select the fielder involved'}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="grid grid-cols-3 gap-2">
            {wicketTypes.map((wt) => (
              <motion.button
                key={wt.type}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleWicketTypeSelect(wt.type)}
                disabled={isSubmitting}
                className="flex flex-col items-center justify-center h-20 rounded-xl bg-wicket/10 hover:bg-wicket/20 border border-wicket/20 transition-colors"
              >
                <span className="text-lg mb-1">{wt.icon}</span>
                <span className="text-xs font-medium text-t1">{wt.label}</span>
              </motion.button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            {/* Batsman selection for RUN_OUT */}
            {needsBatsmanSelect && (
              <div className="space-y-1.5">
                <p className="text-xs text-t3 uppercase tracking-wider font-medium">Who was run out?</p>
                <div className="grid grid-cols-2 gap-2">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setDismissedPlayerId(strikerId)}
                    className={`flex items-center justify-center h-12 rounded-xl text-sm font-medium transition-colors ${
                      dismissedPlayerId === strikerId
                        ? 'bg-wicket/30 text-wicket border border-wicket/40'
                        : 'bg-bg-elevated text-t2 hover:bg-bg-elevated/80'
                    }`}
                  >
                    {striker?.player.name ?? 'Striker'}
                    <span className="text-accent text-xs ml-1">*</span>
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setDismissedPlayerId(nonStrikerId)}
                    className={`flex items-center justify-center h-12 rounded-xl text-sm font-medium transition-colors ${
                      dismissedPlayerId === nonStrikerId
                        ? 'bg-wicket/30 text-wicket border border-wicket/40'
                        : 'bg-bg-elevated text-t2 hover:bg-bg-elevated/80'
                    }`}
                  >
                    {nonStriker?.player.name ?? 'Non-striker'}
                  </motion.button>
                </div>
              </div>
            )}

            {/* Fielder selection */}
            {needsFielderSelect && (
              <div className="space-y-1.5">
                <p className="text-xs text-t3 uppercase tracking-wider font-medium">
                  {selectedWicketType === 'STUMPED' ? 'Wicket keeper' : 'Fielder'}
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {fieldingPlayers.map((player) => (
                    <motion.button
                      key={player.id}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setFielderPlayerId(player.id)}
                      className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        fielderPlayerId === player.id
                          ? 'bg-accent/20 text-accent border border-accent/30'
                          : 'bg-bg-elevated text-t2 hover:bg-bg-elevated/80'
                      }`}
                    >
                      {player.name}
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* Confirm / Back */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setStep(1);
                  setDismissedPlayerId(null);
                  setFielderPlayerId(null);
                }}
                className="flex-1 h-11 rounded-xl border border-border text-t2 hover:text-t1"
              >
                Back
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!canConfirm || isSubmitting}
                className="flex-1 h-11 rounded-xl bg-wicket text-white hover:bg-wicket/80 font-semibold"
              >
                {isSubmitting ? 'Recording...' : 'Confirm Wicket'}
              </Button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="pt-1">
            <Button
              variant="ghost"
              onClick={handleCancel}
              className="w-full h-11 rounded-xl border border-border text-t2 hover:text-t1"
            >
              Cancel
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
