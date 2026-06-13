'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Share2, MessageCircle, Home, Trophy } from 'lucide-react';
import { formatOvers, calculateCRR, getManOfMatch } from '@/lib/scoring-utils';
import { exportScorecardImage, generateWhatsAppSummary } from '@/lib/share';
import { toast } from 'sonner';
import type { MatchData } from '@/types';

interface MatchResultScreenProps {
  match: MatchData;
  onCompleteMatch: () => Promise<void>;
}

export function MatchResultScreen({ match, onCompleteMatch }: MatchResultScreenProps) {
  const router = useRouter();
  const [isSharing, setIsSharing] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const inn1 = match.innings[0];
  const inn2 = match.innings[1];

  // Complete the match if not already completed
  const handleComplete = async () => {
    if (match.status === 'COMPLETED') return;
    setIsCompleting(true);
    try {
      await onCompleteMatch();
    } catch {
      toast.error('Failed to complete match');
    }
    setIsCompleting(false);
  };

  // Auto-complete if needed
  if (match.status !== 'COMPLETED' && inn2?.isCompleted && !isCompleting) {
    handleComplete();
  }

  const result = match.result || 'Match completed';
  const manOfMatch = inn1 && inn2
    ? getManOfMatch(
        [...inn1.batting, ...inn2.batting],
        [...inn1.bowling, ...inn2.bowling]
      )
    : null;

  const handleShareImage = async () => {
    setIsSharing(true);
    try {
      await exportScorecardImage('match-result-card');
      toast.success('Scorecard exported!');
    } catch {
      toast.error('Failed to export scorecard');
    }
    setIsSharing(false);
  };

  const handleWhatsApp = async () => {
    try {
      const summary = generateWhatsAppSummary(match);
      if (navigator.share) {
        await navigator.share({ text: summary, title: 'GullyScore Match Report' });
      } else {
        await navigator.clipboard.writeText(summary);
        toast.success('Summary copied to clipboard!');
      }
    } catch {
      toast.error('Failed to share');
    }
  };

  return (
    <div className="min-h-dvh bg-bg-app flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-6"
        id="match-result-card"
      >
        {/* Trophy icon */}
        <motion.div
          initial={{ scale: 0.5 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
          className="text-center"
        >
          <div className="w-20 h-20 rounded-full bg-gold/15 mx-auto flex items-center justify-center mb-3">
            <Trophy size={40} className="text-gold" />
          </div>
          <h2 className="text-xl font-bold text-t1">Match Over!</h2>
        </motion.div>

        {/* Result string */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl bg-accent/10 border border-accent/20 p-5 text-center"
        >
          <p className="text-base font-semibold text-accent">{result}</p>
        </motion.div>

        {/* Both innings scores */}
        <div className="space-y-2">
          {inn1 && (
            <div className="rounded-xl bg-bg-card border border-border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: inn1.team.color }} />
                  <span className="text-sm font-semibold text-t1">{inn1.team.name}</span>
                  <span className="text-[10px] text-t3">1st inn</span>
                </div>
                <span className="text-lg font-bold text-t1 font-mono">
                  {inn1.runs}/{inn1.wickets}
                  <span className="text-xs text-t3 ml-1">
                    ({formatOvers(inn1.completedOvers, inn1.currentBalls)})
                  </span>
                </span>
              </div>
            </div>
          )}
          {inn2 && (
            <div className="rounded-xl bg-bg-card border border-border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: inn2.team.color }} />
                  <span className="text-sm font-semibold text-t1">{inn2.team.name}</span>
                  <span className="text-[10px] text-t3">2nd inn</span>
                </div>
                <span className="text-lg font-bold text-t1 font-mono">
                  {inn2.runs}/{inn2.wickets}
                  <span className="text-xs text-t3 ml-1">
                    ({formatOvers(inn2.completedOvers, inn2.currentBalls)})
                  </span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Man of the Match */}
        {manOfMatch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="rounded-xl bg-gold-dim border border-gold/20 p-3 text-center"
          >
            <p className="text-[10px] text-gold uppercase tracking-wider font-medium">Player of the Match</p>
            <p className="text-sm font-bold text-gold mt-0.5">{manOfMatch}</p>
          </motion.div>
        )}

        {/* Share buttons */}
        <div className="grid grid-cols-2 gap-2">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleShareImage}
            disabled={isSharing}
            className="flex items-center justify-center gap-2 h-12 rounded-xl bg-bg-card border border-border text-t2 hover:text-t1 transition-colors disabled:opacity-50"
          >
            <Share2 size={16} />
            <span className="text-sm font-medium">{isSharing ? 'Exporting...' : 'Share Image'}</span>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleWhatsApp}
            className="flex items-center justify-center gap-2 h-12 rounded-xl bg-green-600/20 border border-green-600/30 text-green-400 hover:bg-green-600/30 transition-colors"
          >
            <MessageCircle size={16} />
            <span className="text-sm font-medium">WhatsApp</span>
          </motion.button>
        </div>

        {/* Back to home */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => router.push('/')}
          className="flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-bg-card border border-border text-t2 hover:text-t1 transition-colors"
        >
          <Home size={16} />
          <span className="text-sm font-medium">Back to Home</span>
        </motion.button>
      </motion.div>
    </div>
  );
}
