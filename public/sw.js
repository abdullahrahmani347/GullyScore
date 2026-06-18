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

var CACHE_VERSION = 'gullyscore-v3-deploy-fix';
var STATIC_CACHE = CACHE_VERSION + '-static';
var API_CACHE = CACHE_VERSION + '-api';

// Static asset patterns — CacheFirst
var STATIC_PATTERNS = [
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
var API_PATTERNS = [
  /\/api\//i,
];

// SSE stream routes — NetworkOnly (never cache)
var SSE_PATTERNS = [
  /\/api\/matches\/[^/]+\/stream/i,
  /\/api\/live\//i,
];

// Install event — pre-cache critical assets and app pages
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(function(cache) {
      // Pre-cache the app shell and critical pages for offline use
      return cache.addAll([
        '/',
        '/matches',
        '/teams',
        '/tournaments',
        '/matches/new',
        '/manifest.json',
        '/icons/icon-192.png',
        '/icons/icon-512.png',
        '/logo.svg',
      ]).catch(function() {
        // Silently fail if assets aren't available yet (first build)
        console.log('[SW] Some pre-cache assets not available yet');
      });
    })
  );
  // Activate immediately without waiting
  self.skipWaiting();
});

// Activate event — clean up ALL old caches (aggressive cleanup for deploy fixes)
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(name) {
            // Delete any cache that doesn't match the current version exactly.
            // This is intentionally broad — old broken deploys may have left
            // stale caches with different version suffixes that we want gone.
            return name !== STATIC_CACHE && name !== API_CACHE;
          })
          .map(function(name) {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(function() {
      // Take control of all clients immediately so the new SW applies
      // to the current page without requiring a reload.
      return self.clients.claim();
    })
  );
});

// Fetch event — route requests to appropriate caching strategy
self.addEventListener('fetch', function(event) {
  var request = event.request;
  var url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Skip non-GET requests for caching (mutations are handled by the app's offline queue)
  if (request.method !== 'GET') {
    return;
  }

  // SSE streams — NetworkOnly, never cache
  if (SSE_PATTERNS.some(function(pattern) { return pattern.test(url.pathname); })) {
    return;
  }

  // Static assets — CacheFirst
  if (STATIC_PATTERNS.some(function(pattern) { return pattern.test(url.pathname) || pattern.test(url.href); })) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // API GET requests — NetworkFirst with cache fallback
  if (API_PATTERNS.some(function(pattern) { return pattern.test(url.pathname); })) {
    event.respondWith(networkFirstWithCache(request));
    return;
  }

  // Navigation requests (HTML pages) — NetworkFirst with cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
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
function cacheFirst(request) {
  return caches.match(request).then(function(cached) {
    if (cached) {
      return cached;
    }

    return fetch(request).then(function(response) {
      if (response.ok) {
        var cachePromise = caches.open(STATIC_CACHE).then(function(cache) {
          cache.put(request, response.clone());
        });
      }
      return response;
    }).catch(function(error) {
      // Network failed and no cache — return offline fallback for navigation
      if (request.mode === 'navigate') {
        return caches.match('/').then(function(cachedRoot) {
          if (cachedRoot) return cachedRoot;
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        });
      }
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    });
  });
}

/**
 * NetworkFirst for navigation — always prefer fresh HTML from network.
 * Only fall back to cached app shell if network is genuinely unreachable.
 * This prevents the SW from serving a stale broken HTML page when a new
 * deploy has shipped.
 */
function networkFirstNavigation(request) {
  return fetch(request).then(function(response) {
    if (response.ok) {
      // Cache the fresh app shell for offline use later
      caches.open(STATIC_CACHE).then(function(cache) {
        cache.put(request, response.clone());
      });
    }
    return response;
  }).catch(function() {
    // Network genuinely failed — try cache
    return caches.match(request).then(function(cached) {
      if (cached) return cached;
      return caches.match('/').then(function(cachedRoot) {
        if (cachedRoot) return cachedRoot;
        return new Response(
          '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;text-align:center">' +
          '<h2>You are offline</h2><p>Connect to the internet and refresh.</p></body></html>',
          { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/html' } }
        );
      });
    });
  });
}

/**
 * NetworkFirst with cache fallback strategy:
 * 1. Try network
 * 2. If successful, cache the response and return it
 * 3. If network fails, return cached response
 * 4. If no cache either, return offline response
 */
function networkFirstWithCache(request) {
  return fetch(request).then(function(response) {
    if (response.ok) {
      // Cache successful responses
      var cacheName = API_CACHE;
      caches.open(cacheName).then(function(cache) {
        cache.put(request, response.clone());
      });
    }
    return response;
  }).catch(function(error) {
    // Network failed — try cache
    return caches.match(request).then(function(cached) {
      if (cached) {
        return cached;
      }

      // No cache either — for navigation, try the app shell
      if (request.mode === 'navigate') {
        return caches.match('/').then(function(cachedRoot) {
          if (cachedRoot) return cachedRoot;
          return new Response(
            JSON.stringify({ error: 'You are offline and this data is not cached' }),
            {
              status: 503,
              statusText: 'Offline',
              headers: { 'Content-Type': 'application/json' },
            }
          );
        });
      }

      return new Response(
        JSON.stringify({ error: 'You are offline and this data is not cached' }),
        {
          status: 503,
          statusText: 'Offline',
          headers: { 'Content-Type': 'application/json' },
        }
      );
    });
  });
}

// Listen for messages from the app
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHES') {
    caches.keys().then(function(names) {
      for (var i = 0; i < names.length; i++) {
        caches.delete(names[i]);
      }
    });
  }
});
