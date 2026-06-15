'use client';

import { useState } from 'react';
import { AlertTriangle, RefreshCw, Trash2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useOfflineSync } from '@/hooks/useConnectivity';
import type { OfflineQueueItem } from '@/lib/offline/db';

/** Maximum manual retries before disabling the retry button */
const MAX_MANUAL_RETRIES = 5;
/** Cooldown in ms after a failed retry before allowing another */
const RETRY_COOLDOWN_MS = 3000;

/**
 * RecoveryScreen — Shown when permanently failed items exist in the queue.
 *
 * This handles the edge case where sync fails permanently
 * (e.g., session expired on a shared device). The scorer can:
 * 1. Retry the failed items (with cooldown and max retries)
 * 2. Dismiss individual items
 * 3. See exactly which balls were recorded offline
 *
 * The psychological safety of knowing no ball is truly lost
 * makes the scorer a fierce evangelist.
 */
export function RecoveryScreen({ matchId }: { matchId: string }) {
  const { failedItems, triggerSync, dismissFailed, retryFailed, queueStats } = useOfflineSync(matchId);
  const [expanded, setExpanded] = useState(false);
  const [retryCooldownUntil, setRetryCooldownUntil] = useState<number>(0);
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetryAll = async () => {
    if (isRetrying || Date.now() < retryCooldownUntil) return;
    setIsRetrying(true);
    try {
      await triggerSync();
    } finally {
      setIsRetrying(false);
      setRetryCooldownUntil(Date.now() + RETRY_COOLDOWN_MS);
    }
  };

  const handleRetryItem = async (id: number, retryCount: number) => {
    if (retryCount >= MAX_MANUAL_RETRIES || isRetrying || Date.now() < retryCooldownUntil) return;
    setIsRetrying(true);
    try {
      await retryFailed(id);
    } finally {
      setIsRetrying(false);
      setRetryCooldownUntil(Date.now() + RETRY_COOLDOWN_MS);
    }
  };

  if (failedItems.length === 0) return null;

  const isCooldown = Date.now() < retryCooldownUntil;

  return (
    <div className="border border-red-500/30 bg-red-500/5 rounded-xl p-4 mx-3 mb-3">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
          <AlertTriangle size={16} className="text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-red-300">
            Some balls failed to sync
          </h3>
          <p className="text-xs text-red-300/70 mt-0.5">
            {failedItems.length} item{failedItems.length !== 1 ? 's' : ''} couldn't be saved to the server.
            You can retry or dismiss them below.
          </p>

          {/* Toggle details */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 mt-2 text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? 'Hide details' : 'Show details'}
          </button>

          {expanded && (
            <div className="mt-3 space-y-2">
              {failedItems.map((item) => (
                <FailedItemRow
                  key={item.id}
                  item={item}
                  onRetry={() => handleRetryItem(item.id!, item.retryCount)}
                  onDismiss={() => dismissFailed(item.id!)}
                  isRetrying={isRetrying || isCooldown}
                  maxRetriesReached={item.retryCount >= MAX_MANUAL_RETRIES}
                />
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleRetryAll}
              disabled={isRetrying || isCooldown}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-300 text-xs font-medium hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw size={12} className={isRetrying ? 'animate-spin' : ''} />
              Retry all
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FailedItemRow({
  item,
  onRetry,
  onDismiss,
  isRetrying,
  maxRetriesReached,
}: {
  item: OfflineQueueItem;
  onRetry: () => void;
  onDismiss: () => void;
  isRetrying: boolean;
  maxRetriesReached: boolean;
}) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-red-200 truncate">
          {item.ballSummary || item.description}
        </div>
        <div className="text-[10px] text-red-300/50 mt-0.5">
          {new Date(item.timestamp).toLocaleTimeString()} • {item.lastError || 'Unknown error'}
          {item.retryCount > 0 && ` • ${item.retryCount}/${MAX_MANUAL_RETRIES} retries`}
          {maxRetriesReached && ' • Max retries reached'}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onRetry}
          disabled={isRetrying || maxRetriesReached}
          className="p-1 rounded hover:bg-red-500/20 text-red-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title={maxRetriesReached ? 'Max retries reached' : 'Retry'}
        >
          <RefreshCw size={12} className={isRetrying ? 'animate-spin' : ''} />
        </button>
        <button
          onClick={onDismiss}
          className="p-1 rounded hover:bg-red-500/20 text-red-300/50 transition-colors"
          title="Dismiss"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
