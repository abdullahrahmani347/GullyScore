'use client';

import { motion, AnimatePresence } from 'framer-motion';
import type { MilestoneAlert } from '@/lib/intelligence';

interface MilestoneAlertStripProps {
  alerts: MilestoneAlert[];
}

/**
 * Displays milestone proximity alerts as animated badges on the scoring screen.
 * Shows the most relevant alert(s) with urgency-based styling.
 */
export function MilestoneAlertStrip({ alerts }: MilestoneAlertStripProps) {
  if (alerts.length === 0) return null;

  // Show up to 2 most urgent alerts
  const sortedAlerts = [...alerts].sort((a, b) => {
    const urgencyOrder = { critical: 0, warning: 1, info: 2 };
    return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
  });
  const displayAlerts = sortedAlerts.slice(0, 2);

  return (
    <div className="flex flex-col gap-1">
      <AnimatePresence mode="popLayout">
        {displayAlerts.map((alert, i) => (
          <motion.div
            key={`${alert.type}-${alert.message}`}
            initial={{ opacity: 0, x: -20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25, delay: i * 0.05 }}
            className={`
              flex items-center gap-2 rounded-lg px-3 py-1.5 border
              ${alert.urgency === 'critical'
                ? 'bg-gradient-to-r from-amber-500/15 to-orange-500/10 border-amber-500/40'
                : alert.urgency === 'warning'
                  ? 'bg-amber-500/8 border-amber-500/25'
                  : 'bg-accent/5 border-accent/20'
              }
            `}
          >
            {/* Icon/badge */}
            <span
              className={`
                text-[10px] font-bold font-mono px-1.5 py-0.5 rounded
                ${alert.urgency === 'critical'
                  ? 'bg-amber-500/30 text-amber-300'
                  : alert.urgency === 'warning'
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-accent/15 text-accent'
                }
              `}
            >
              {alert.icon}
            </span>

            {/* Message */}
            <span
              className={`
                text-[11px] font-medium truncate
                ${alert.urgency === 'critical'
                  ? 'text-amber-200'
                  : alert.urgency === 'warning'
                    ? 'text-amber-300/80'
                    : 'text-t2'
                }
              `}
            >
              {alert.message}
            </span>

            {/* Pulse indicator for critical */}
            {alert.urgency === 'critical' && (
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
              </span>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
