'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { BADGES, type EarnedAchievement } from '@/lib/achievements';
import { ACHIEVEMENT_ICONS } from '@/components/icons/GullyIcons';
import { ConfettiCanvas } from './Celebrations';
import { feedback } from '@/lib/feedback';
import { useEffect } from 'react';

interface AchievementCelebrationProps {
  achievement: EarnedAchievement | null;
  onDismiss: () => void;
}

/**
 * Full-screen celebration animation when a player earns a badge for the first
 * time. v2 §14.6: canvas confetti (≤ 3 s, reduced-motion respected) + the
 * milestone haptic/sound from the feedback layer.
 */
export function AchievementCelebration({ achievement, onDismiss }: AchievementCelebrationProps) {
  const badge = achievement ? BADGES[achievement.badgeId] : null;
  const Icon = badge ? ACHIEVEMENT_ICONS[badge.iconKey as keyof typeof ACHIEVEMENT_ICONS] : null;

  // Fire the feel layer when the celebration appears
  useEffect(() => {
    if (achievement && badge) feedback.milestone();
  }, [achievement, badge]);

  return (
    <AnimatePresence>
      {achievement && badge && Icon && (
      <>
      {/* v2 §14.6 — canvas confetti replaces the 8 motion dots */}
      <ConfettiCanvas active={achievement.badgeId} duration={2600} />
      <motion.div
        key={achievement.badgeId}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
        onClick={onDismiss}
      >
        <motion.div
          initial={{ scale: 0.3, opacity: 0, rotate: -10 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 0.5, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
          className="flex flex-col items-center text-center px-8"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Badge icon — custom SVG inside a glowing disc */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 12, delay: 0.3 }}
            className={`mb-4 flex items-center justify-center w-28 h-28 rounded-full ${badge.bgColor} border-2 border-current/30 shadow-[0_0_60px_rgba(0,212,170,0.3)]`}
          >
            <Icon size={64} className={badge.color} />
          </motion.div>

          {/* Badge name */}
          <motion.h2
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-2xl font-bold text-t1 mb-2"
          >
            {badge.name}
          </motion.h2>

          {/* Player name */}
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.65 }}
            className={`text-lg font-medium ${badge.color} mb-1`}
          >
            {achievement.playerName}
          </motion.p>

          {/* Description */}
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="text-sm text-t3"
          >
            {badge.description}
          </motion.p>

          {/* Dismiss hint */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2 }}
            className="text-[10px] text-t3 mt-6"
          >
            Tap to dismiss
          </motion.p>
        </motion.div>
      </motion.div>
      </>
      )}
    </AnimatePresence>
  );
}

/**
 * Small colored chip for displaying earned badges on player profiles.
 */
export function AchievementChip({ badgeId }: { badgeId: string }) {
  const badge = BADGES[badgeId];
  if (!badge) return null;
  const Icon = ACHIEVEMENT_ICONS[badge.iconKey as keyof typeof ACHIEVEMENT_ICONS];
  if (!Icon) return null;

  return (
    <span
      className={`
        inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded
        ${badge.bgColor} ${badge.color} border border-current/20
      `}
      title={badge.description}
    >
      <Icon size={11} />
      {badge.name}
    </span>
  );
}
