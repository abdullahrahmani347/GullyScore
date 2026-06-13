/**
 * GullyScore Service Worker — Offline-First Architecture
 *
 * Caching Strategy:
 * - Static assets (JS, CSS, fonts, images): CacheFirst
 * - API GET requests: NetworkFirst with cached fallback
 * - API mutations (POST/PUT/PATCH/DELETE): NetworkOnly (handled by offlineFetch in the app layer)
 *
 * The mutation queue is managed by the application using IndexedDB (Dexie),
 * not by the service worker. This gives us fine-grained control over ordering,
 * retry logic, and recovery UI.
 */

const CACHE_VERSION = 'gullyscore-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Static asset patterns — CacheFirst
const STATIC_PATTERNS = [
  /\.js$/i,
  /\.css$/i,
  /\.woff2?$/i,
  /\.ttf$/i,
  /\.eot$/i,
  /\.otf$/i,
  /\.svg$/i,
  /\.png$/i,
  /\.jpg$/i,
  /\.jpeg$/i,
  /\.webp$/i,
  /\.ico$/i,
  /\/_next\/static\//i,
  /\/icons\//i,
  /\/fonts\//i,
];

// API routes — NetworkFirst with cache fallback
const API_PATTERNS = [
  /\/api\//i,
];

// SSE stream routes — NetworkOnly (never cache)
const SSE_PATTERNS = [
  /\/api\/matches\/[^/]+\/stream/i,
  /\/api\/live\//i,
];

// Install event — pre-cache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      // Pre-cache the app shell
      return cache.addAll([
        '/',
        '/manifest.json',
        '/icons/icon-192.png',
        '/icons/icon-512.png',
      ]).catch(() => {
        // Silently fail if assets aren't available yet (first build)
        console.log('[SW] Some pre-cache assets not available yet');
      });
    })
  );
  // Activate immediately without waiting
  self.skipWaiting();
});

// Activate event — clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('gullyscore-') && name !== STATIC_CACHE && name !== API_CACHE)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// Fetch event — route requests to appropriate caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Skip non-GET requests for caching (mutations are handled by the app's offline queue)
  if (request.method !== 'GET') {
    return;
  }

  // SSE streams — NetworkOnly, never cache
  if (SSE_PATTERNS.some(pattern => pattern.test(url.pathname))) {
    return;
  }

  // Static assets — CacheFirst
  if (STATIC_PATTERNS.some(pattern => pattern.test(url.pathname) || pattern.test(url.href))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // API GET requests — NetworkFirst with cache fallback
  if (API_PATTERNS.some(pattern => pattern.test(url.pathname))) {
    event.respondWith(networkFirstWithCache(request));
    return;
  }

  // Navigation requests (HTML pages) — NetworkFirst with cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithCache(request));
    return;
  }

  // Default: try network, fall back to cache
  event.respondWith(networkFirstWithCache(request));
});

/**
 * CacheFirst strategy:
 * 1. Check cache
 * 2. If found, return cached response
 * 3. If not found, fetch from network and cache it
 */
async function cacheFirst(request: Request): Promise<Response> {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Network failed and no cache — return offline fallback for navigation
    if (request.mode === 'navigate') {
      const cached = await caches.match('/');
      if (cached) return cached;
    }
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

/**
 * NetworkFirst with cache fallback strategy:
 * 1. Try network
 * 2. If successful, cache the response and return it
 * 3. If network fails, return cached response
 * 4. If no cache either, return offline response
 */
async function networkFirstWithCache(request: Request): Promise<Response> {
  try {
    const response = await fetch(request);

    if (response.ok) {
      // Cache successful responses
      const cache = await caches.open(API_CACHE);
      // Only cache API responses for a limited time
      if (request.url.includes('/api/')) {
        const responseToCache = response.clone();
        cache.put(request, responseToCache);
      } else {
        cache.put(request, response.clone());
      }
    }

    return response;
  } catch (error) {
    // Network failed — try cache
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }

    // No cache either — for navigation, try the app shell
    if (request.mode === 'navigate') {
      const appShell = await caches.match('/');
      if (appShell) return appShell;
    }

    return new Response(JSON.stringify({ error: 'You are offline and this data is not cached' }), {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Listen for messages from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHES') {
    caches.keys().then((names) => {
      for (const name of names) {
        caches.delete(name);
      }
    });
  }
});
