'use client';

import { useEffect, useState } from 'react';
import { registerServiceWorker, onSWStateChange, applyUpdate, type SWRegistrationState } from '@/lib/offline/sw-register';
import { getSyncEngine } from '@/lib/offline/sync-engine';
import { RefreshCw, Download } from 'lucide-react';

/**
 * ServiceWorkerRegistration — Initializes the service worker and handles
 * update notifications. Mount this once in the root layout.
 */
export function ServiceWorkerRegistration() {
  const [swState, setSwState] = useState<SWRegistrationState>({
    isRegistered: false,
    isUpdateAvailable: false,
    isOfflineReady: false,
    registration: null,
  });

  useEffect(() => {
    // Register the service worker
    registerServiceWorker();

    // Subscribe to state changes
    const unsubscribe = onSWStateChange(setSwState);

    // When coming online, trigger sync of offline queue
    const handleOnline = async () => {
      console.log('[GullyScore] Back online — syncing offline queue');
      try {
        const engine = getSyncEngine();
        await engine.syncAll();
      } catch {
        // Sync engine not available (shouldn't happen client-side)
      }
    };

    window.addEventListener('online', handleOnline);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // Show update available banner
  if (swState.isUpdateAvailable) {
    return (
      <div className="fixed bottom-20 left-3 right-3 z-50 flex items-center justify-between gap-3 p-3 rounded-xl bg-bg-card border border-border shadow-lg animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center gap-2">
          <Download size={16} className="text-accent" />
          <div>
            <p className="text-xs font-medium text-t1">Update available</p>
            <p className="text-[10px] text-t3">A new version of GullyScore is ready</p>
          </div>
        </div>
        <button
          onClick={applyUpdate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-dim text-accent text-xs font-medium hover:bg-accent/20 transition-colors"
        >
          <RefreshCw size={12} />
          Update
        </button>
      </div>
    );
  }

  return null;
}
