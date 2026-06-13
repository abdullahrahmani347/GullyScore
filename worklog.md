---
Task ID: 1
Agent: Main Agent
Task: Implement Offline-First Architecture for GullyScore

Work Log:
- Explored existing codebase structure, understood scoring flow and API endpoints
- Installed dexie@4.4.3 for IndexedDB offline queue
- Created IndexedDB database module (src/lib/offline/db.ts) with OfflineQueueItem and SyncEvent tables, queue operations (enqueue, getPending, markSyncing, markSynced, markFailed, retryFailed, dismissFailed)
- Created sync engine (src/lib/offline/sync-engine.ts) with ordered queue processing, retry logic (max 5 retries), and event subscription system
- Created offline-aware fetch utility (src/lib/offline/fetch.ts) with offlineFetch() that queues mutations when offline and returns synthetic success responses
- Created convenience methods: recordBallOffline, undoBallOffline, setStrikerOffline, setBowlerOffline, completeInningsOffline, completeMatchOffline, createInningsOffline
- Created Service Worker (public/sw.js) with CacheFirst for static assets, NetworkFirst with cache fallback for API GETs, NetworkOnly for SSE streams
- Created SW registration utility (src/lib/offline/sw-register.ts) with update detection and applyUpdate()
- Created connectivity hooks (src/hooks/useConnectivity.ts) with useConnectivity, useOfflineSync, useUnsyncedBalls
- Modified matchStore (src/store/matchStore.ts) to use zustand persist middleware for offline state persistence
- Modified scoring handlers (src/hooks/useScoringHandlers.ts) to use offline-aware fetch for all mutations
- Created UI components: OfflineIndicator, OfflineBadge, RecoveryScreen, GlobalOfflineBanner, ServiceWorkerRegistration
- Wired everything into root layout (GlobalOfflineBanner + ServiceWorkerRegistration) and scoring page (OfflineIndicator + RecoveryScreen)
- Updated scoring page to: disable SWR polling when offline, use persisted store data when offline, revalidate on reconnect, custom onErrorRetry for SWR
- Updated manifest.json with improved PWA metadata

Stage Summary:
- Complete offline-first architecture implemented
- All scoring mutations (ball recording, wickets, undo, striker/bowler changes, innings/match completion) are queued in IndexedDB when offline
- Service Worker caches static assets and API GET responses
- Zustand matchStore is now persisted to localStorage
- Recovery screen for permanently failed sync items (5 retries max)
- Auto-sync triggers when connectivity is restored
- Build passes cleanly, dev server verified working
