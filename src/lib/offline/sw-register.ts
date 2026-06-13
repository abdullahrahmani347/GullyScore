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
