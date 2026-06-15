/**
 * Device Identity Utility for GullyScore
 *
 * Generates and persists a unique device ID in localStorage.
 * This ID is used to scope all data (matches, teams, tournaments) to the device
 * that created them, ensuring privacy and data isolation.
 *
 * The deviceId is a UUID v4 that is generated once on first visit and persists
 * across sessions via localStorage. It's sent as a custom `X-Device-Id` header
 * on all API requests.
 */

const DEVICE_ID_KEY = 'gullyscore-device-id';

/**
 * Generates a UUID v4
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Gets or creates a persistent device ID.
 * On first call, generates a new UUID and stores it in localStorage.
 * On subsequent calls, returns the existing ID.
 *
 * This is safe to call from client components only (uses localStorage).
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') {
    // Server-side: return empty string (shouldn't be used for API calls from server)
    return '';
  }

  let deviceId = localStorage.getItem(DEVICE_ID_KEY);

  if (!deviceId) {
    deviceId = generateUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }

  return deviceId;
}

/**
 * Creates fetch headers that include the device ID.
 * Use this when making API calls to ensure the device ID is always included.
 */
export function getDeviceHeaders(): HeadersInit {
  const deviceId = getDeviceId();
  return {
    'Content-Type': 'application/json',
    'X-Device-Id': deviceId,
  };
}

/**
 * Creates a fetch wrapper that automatically includes the device ID header.
 * Use this instead of raw fetch for all API calls.
 */
export function deviceFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const deviceId = getDeviceId();
  const headers = new Headers(options.headers || {});

  // Set Content-Type if not already set and body is present
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Always include device ID
  headers.set('X-Device-Id', deviceId);

  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * SWR fetcher that includes the device ID header.
 * Use this as the fetcher for all SWR hooks.
 */
export function deviceFetcher<T = unknown>(url: string): Promise<T> {
  const deviceId = getDeviceId();
  return fetch(url, {
    headers: {
      'X-Device-Id': deviceId,
    },
  }).then((r) => {
    if (!r.ok) throw new Error('Failed to fetch');
    return r.json();
  });
}

/**
 * Safe SWR fetcher that doesn't throw on non-ok responses.
 * Returns the error JSON for handling downstream.
 */
export function safeDeviceFetcher<T = unknown>(url: string): Promise<T> {
  const deviceId = getDeviceId();
  return fetch(url, {
    headers: {
      'X-Device-Id': deviceId,
    },
  }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}: Failed to fetch`);
    return r.json();
  });
}
