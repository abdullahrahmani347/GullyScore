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
 *
 * v2 §16.1 — Background Sync: the SW wakes a hidden client via the
 * { type: 'RUN_SYNC' } message (tag 'gullyscore-queue'). Dexie/the sync
 * engine cannot run inside the SW context (device id from localStorage,
 * page-side IndexedDB queue), so the SW only nudges; this component runs
 * the actual syncAll(). The foreground 'online' path remains primary.
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

    // v2 §16.1 — Background Sync wake-up from the service worker
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'RUN_SYNC') {
        console.log('[GullyScore] SW background-sync wake-up — running syncAll()');
        try {
          void getSyncEngine().syncAll();
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener('online', handleOnline);
    navigator.serviceWorker?.addEventListener('message', handleSWMessage);

    return () => {
      window.removeEventListener('online', handleOnline);
      navigator.serviceWorker?.removeEventListener('message', handleSWMessage);
    };
  }, []);

  return null;
}
