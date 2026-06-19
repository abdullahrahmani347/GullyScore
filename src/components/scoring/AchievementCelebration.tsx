'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { BADGES, type EarnedAchievement } from '@/lib/achievements';

interface AchievementCelebrationProps {
  achievement: EarnedAchievement | null;
  onDismiss: () => void;
}

/**
 * Full-screen celebration animation when a player earns a badge for the first time.
 * Shows badge name, emoji, and player name with a dramatic entrance.
 * Auto-dismisses after 4 seconds.
 */
export function AchievementCelebration({ achievement, onDismiss }: AchievementCelebrationProps) {
  const badge = achievement ? BADGES[achievement.badgeId] : null;

  return (
    <AnimatePresence>
      {achievement && badge && (
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
          {/* Badge emoji */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 12, delay: 0.3 }}
            className="text-7xl mb-4"
          >
            {badge.emoji}
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

          {/* Confetti dots */}
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={i}
              initial={{
                x: 0,
                y: 0,
                scale: 0,
                opacity: 1,
              }}
              animate={{
                x: (Math.random() - 0.5) * 300,
                y: (Math.random() - 0.5) * 300,
                scale: [0, 1.5, 0],
                opacity: [1, 1, 0],
              }}
              transition={{
                duration: 1.2,
                delay: 0.4 + i * 0.05,
                ease: 'easeOut',
              }}
              className="absolute w-2 h-2 rounded-full"
              style={{
                backgroundColor: ['#FFD700', '#00D4AA', '#FF6B35', '#4ECDC4', '#FF4444'][i % 5],
              }}
            />
          ))}

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

  return (
    <span
      className={`
        inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded
        ${badge.bgColor} ${badge.color} border border-current/20
      `}
      title={badge.description}
    >
      <span className="text-[10px]">{badge.emoji}</span>
      {badge.name}
    </span>
  );
}
