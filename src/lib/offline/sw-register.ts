/**
 * Service Worker Registration and Update Management
 *
 * Registers the service worker on first load, handles updates,
 * and provides lifecycle callbacks for the UI.
 */

export interface SWRegistrationState {
  isRegistered: boolean;
  isUpdateAvailable: boolean;
  isOfflineReady: boolean;
  registration: ServiceWorkerRegistration | null;
}

let registrationState: SWRegistrationState = {
  isRegistered: false,
  isUpdateAvailable: false,
  isOfflineReady: false,
  registration: null,
};

type SWStateListener = (state: SWRegistrationState) => void;
const listeners = new Set<SWStateListener>();

function notifyListeners() {
  listeners.forEach(fn => fn({ ...registrationState }));
}

/**
 * Subscribe to SW registration state changes.
 */
export function onSWStateChange(listener: SWStateListener): () => void {
  listeners.add(listener);
  listener({ ...registrationState });
  return () => listeners.delete(listener);
}

/**
 * Register the GullyScore service worker.
 * Call this from a client component on mount.
 */
export async function registerServiceWorker(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) {
    console.log('[GullyScore] Service Worker not supported');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    registrationState.isRegistered = true;
    registrationState.registration = registration;
    notifyListeners();

    // Check for updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed') {
          if (navigator.serviceWorker.controller) {
            // New version available
            registrationState.isUpdateAvailable = true;
            notifyListeners();
          } else {
            // First install — offline ready
            registrationState.isOfflineReady = true;
            notifyListeners();
          }
        }
      });
    });

    // Check for updates periodically (every 30 minutes)
    setInterval(() => {
      registration.update().catch(() => {});
    }, 30 * 60 * 1000);

    // v2 §16.1 — periodic live-hub cache refresh where supported
    registerPeriodicLiveRefresh();

    console.log('[GullyScore] Service Worker registered');
  } catch (error) {
    console.error('[GullyScore] Service Worker registration failed:', error);
  }
}

/**
 * Apply a waiting service worker update (activate the new version).
 */
export async function applyUpdate(): Promise<void> {
  if (!registrationState.registration) return;

  const newWorker = registrationState.registration.waiting;
  if (newWorker) {
    newWorker.postMessage({ type: 'SKIP_WAITING' });
    // Reload after the new SW takes control
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    }, { once: true });
  }
}

/**
 * v2 §16.1 — register a Background Sync tag so the browser wakes the app
 * when connectivity returns (even if the tab is hidden). Safe no-op where
 * the API is unsupported (Safari). Called after enqueueing offline work.
 */
export async function requestQueueSync(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const syncManager = (reg as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync;
    await syncManager?.register('gullyscore-queue');
  } catch {
    // Not supported / already registered / feature flagged off — fine.
  }
}

/**
 * v2 §16.1 — register periodic background sync for the live-hub cache
 * refresh where supported (Chromium, installed PWA). minInterval is a
 * lower bound; the browser decides the real cadence.
 */
export async function registerPeriodicLiveRefresh(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const periodic = (reg as ServiceWorkerRegistration & { periodicSync?: { register: (tag: string, opts: { minInterval: number }) => Promise<void> } }).periodicSync;
    const status = await (navigator.permissions as Permissions | undefined)?.query?.({ name: 'periodic-background-sync' as PermissionName }).catch(() => null);
    if (status && status.state !== 'granted') return;
    await periodic?.register('gullyscore-live-refresh', { minInterval: 12 * 60 * 60 * 1000 });
  } catch {
    // Not supported — the foreground polling path covers live refresh.
  }
}

/**
 * Unregister the service worker (for debugging).
 */
export async function unregisterServiceWorker(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  for (const registration of registrations) {
    await registration.unregister();
  }
  registrationState = {
    isRegistered: false,
    isUpdateAvailable: false,
    isOfflineReady: false,
    registration: null,
  };
  notifyListeners();
}
