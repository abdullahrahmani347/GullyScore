'use client';

import { useEffect } from 'react';
import { registerServiceWorker } from '@/lib/offline/sw-register';
import { getSyncEngine } from '@/lib/offline/sync-engine';

/**
 * ServiceWorkerRegistration — Initializes the service worker and triggers
 * offline-queue sync when connectivity is restored.
 *
 * Mount this once in the root layout. It renders nothing visible.
 *
 * Note: We intentionally do NOT show an "update available" banner. The
 * service worker (public/sw.js) already calls `self.skipWaiting()` on
 * install and `clients.claim()` on activate, so new versions are picked
 * up silently on the next navigation without interrupting the user
 * (which was especially disruptive on mobile during live scoring).
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    // Register the service worker for offline support
    registerServiceWorker();

    // When coming back online, sync any queued offline mutations
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
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return null;
}
