/**
 * GullyScore Service Worker — Offline-First Architecture (v2 §16.5)
 *
 * Caching Strategy:
 * - Static assets (JS, CSS, fonts, images): CacheFirst
 * - API GET requests: NetworkFirst with cached fallback
 * - API mutations (POST/PUT/PATCH/DELETE): NetworkOnly (handled by offlineFetch in the app layer)
 *
 * The mutation queue is managed by the application using IndexedDB (Dexie),
 * not by the service worker. This gives us fine-grained control over ordering,
 * retry logic, and recovery UI.
 *
 * ── v2 §16.5 — APP-SHELL PRECACHE STAMPED WITH THE BUILD ID ───────────────
 * Cache names are stamped with the build id served by /api/buildinfo. The SW
 * fetches buildinfo at activate time; if the id changed, old caches are
 * purged and the shell re-precached. If buildinfo is unreachable (first
 * offline install), we fall back to a stable name so the shell still works.
 *
 * ── v2 §16.5 — INTEGRITY CHECK ON ACTIVATE ────────────────────────────────
 * After cleanup, every precache manifest entry is verified to exist in the
 * cache; missing entries are re-fetched best-effort. A shell that fails
 * integrity still works (runtime caching covers the gaps).
 *
 * ── v2 §16.1 — BACKGROUND SYNC ────────────────────────────────────────────
 * The 'sync' event (tag 'gullyscore-queue') cannot run the queue itself:
 * Dexie/the sync engine reads the device id from localStorage and keeps its
 * queue in the page's IndexedDB, and retry/mutation semantics live in the
 * app layer — this limitation is documented on purpose. Instead the SW
 * wakes a hidden client and the client runs syncAll(). The foreground
 * 'online' path remains primary; background sync is a safety net.
 *
 * 'periodicSync' (tag 'gullyscore-live-refresh', where supported) refreshes
 * the cached /api/live hub feed directly — this is SW-context-safe because
 * it is a plain fetch+cache with no Dexie involvement.
 *
 * Updates stay silent: skipWaiting() on install + clients.claim() on activate.
 */

var FALLBACK_BUILD_ID = 'legacy';
var STATIC_CACHE = null;
var API_CACHE = null;

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

// App-shell precache manifest — integrity-checked on activate (§16.5)
var PRECACHE_MANIFEST = [
  '/',
  '/dashboard',
  '/matches',
  '/teams',
  '/tournaments',
  '/players',
  '/live',
  '/matches/new',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/logo.svg',
];

function cachesReady() {
  return STATIC_CACHE !== null && API_CACHE !== null;
}

/** Fetch the build id from /api/buildinfo; null when offline/broken. */
function fetchBuildId() {
  return fetch('/api/buildinfo', { credentials: 'omit' })
    .then(function(res) {
      if (!res.ok) return null;
      return res.json().then(function(info) {
        var id = info && (info.buildId || info.gitSha || info.builtAt);
        return id ? String(id) : null;
      });
    })
    .catch(function() { return null; });
}

function setCacheNames(buildId) {
  var stamp = String(buildId || FALLBACK_BUILD_ID).slice(-12);
  STATIC_CACHE = 'gullyscore-' + stamp + '-static';
  API_CACHE = 'gullyscore-' + stamp + '-api';
}

function precacheShell() {
  return caches.open(STATIC_CACHE).then(function(cache) {
    return Promise.all(
      PRECACHE_MANIFEST.map(function(url) {
        return cache.add(url).catch(function() {
          // Individual failures are fine — integrity check retries on activate
        });
      })
    );
  });
}

/**
 * §16.5 integrity check — every manifest entry must exist in the static
 * cache. Missing entries are re-fetched (network) and re-cached; still
 * missing after that just logs (runtime NetworkFirst covers them).
 */
function integrityCheck() {
  return caches.open(STATIC_CACHE).then(function(cache) {
    return Promise.all(
      PRECACHE_MANIFEST.map(function(url) {
        return cache.match(url).then(function(hit) {
          if (hit) return null;
          return cache.add(url).catch(function() {
            console.log('[SW] integrity: still missing', url);
          });
        });
      })
    );
  });
}

function purgeOldCaches() {
  return caches.keys().then(function(names) {
    return Promise.all(
      names
        .filter(function(name) {
          return name !== STATIC_CACHE && name !== API_CACHE;
        })
        .map(function(name) {
          console.log('[SW] Deleting old cache:', name);
          return caches.delete(name);
        })
    );
  });
}

// Install event — pre-cache the app shell under a temporary name; the
// build-id-stamped caches take over on activate.
self.addEventListener('install', function(event) {
  event.waitUntil(
    (async function() {
      var buildId = await fetchBuildId();
      if (!cachesReady()) setCacheNames(buildId || FALLBACK_BUILD_ID);
      await precacheShell();
    })()
  );
  // Activate immediately without waiting (§16.5 — silent updates, always)
  self.skipWaiting();
});

// Activate event — stamp with build id, purge stale, integrity-check, claim.
self.addEventListener('activate', function(event) {
  event.waitUntil(
    (async function() {
      var buildId = await fetchBuildId();
      setCacheNames(buildId || FALLBACK_BUILD_ID);
      await purgeOldCaches();
      await integrityCheck();
      await self.clients.claim();
    })()
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
    if (!cachesReady()) return; // let the browser handle it before activate finishes
    event.respondWith(cacheFirst(request));
    return;
  }

  // API GET requests — NetworkFirst with cache fallback
  if (API_PATTERNS.some(function(pattern) { return pattern.test(url.pathname); })) {
    if (!cachesReady()) return;
    event.respondWith(networkFirstWithCache(request));
    return;
  }

  // Navigation requests (HTML pages) — NetworkFirst with cache fallback
  if (request.mode === 'navigate') {
    if (!cachesReady()) return;
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (!cachesReady()) return;
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
        // Clone SYNCHRONOUSLY before the response is returned — the browser
        // starts consuming the original body the moment respondWith resolves,
        // and a clone() called later races with it ("body already used").
        var resClone = response.clone();
        caches.open(STATIC_CACHE).then(function(cache) {
          cache.put(request, resClone);
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
      // Cache the fresh app shell for offline use later (clone BEFORE return)
      var resClone = response.clone();
      caches.open(STATIC_CACHE).then(function(cache) {
        cache.put(request, resClone);
      });
    }
    return response;
  }).catch(function() {
    // Network genuinely failed — try cache
    return caches.match(request).then(function(cached) {
      if (cached) return cached;
      return caches.match('/').then(function(cachedRoot) {
        if (cachedRoot) return cachedRoot;
        return caches.match('/dashboard').then(function(cachedDash) {
          if (cachedDash) return cachedDash;
          return new Response(
            '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;text-align:center">' +
            '<h2>You are offline</h2><p>Connect to the internet and refresh.</p></body></html>',
            { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/html' } }
          );
        });
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
      // Cache successful responses (clone BEFORE the body is consumed)
      var resClone = response.clone();
      var cacheName = API_CACHE;
      caches.open(cacheName).then(function(cache) {
        cache.put(request, resClone);
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

  // §16.5 — respond with the active build id (diagnostics)
  if (event.data && event.data.type === 'GET_BUILD_ID') {
    fetchBuildId().then(function(id) {
      event.source && event.source.postMessage({
        type: 'BUILD_ID',
        buildId: id,
        staticCache: STATIC_CACHE,
        apiCache: API_CACHE,
      });
    });
  }
});

/* ── v2 §16.1 — BACKGROUND SYNC ────────────────────────────────────────────
 * Dexie/SW limitation (documented): the offline queue lives in the page's
 * IndexedDB via Dexie, and the sync engine decorates requests with the
 * device id from localStorage — neither is reliably reachable/mutable from
 * the SW context. So the SW's job is only to WAKE a client; the client
 * runs syncAll() with full ordering/retry semantics. The foreground
 * 'online' listener remains the primary sync trigger. */

function wakeClientsForSync(reason) {
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
    if (clientList.length === 0) {
      // No open window — open one; the app boots, sees its queue and syncs.
      self.clients.openWindow('/dashboard').catch(function() {});
      return;
    }
    clientList.forEach(function(client) {
      client.postMessage({ type: 'RUN_SYNC', reason: reason });
    });
  });
}

if ('sync' in self.registration) {
  self.addEventListener('sync', function(event) {
    if (event.tag === 'gullyscore-queue') {
      event.waitUntil(Promise.resolve(wakeClientsForSync('background-sync')));
    }
  });
}

if ('periodicSync' in self.registration) {
  self.addEventListener('periodicsync', function(event) {
    if (event.tag === 'gullyscore-live-refresh') {
      event.waitUntil(
        fetch('/api/live', { credentials: 'omit' })
          .then(function(res) {
            if (!res.ok) return;
            return caches.open(API_CACHE).then(function(cache) {
              cache.put('/api/live', res);
            });
          })
          .catch(function() { /* offline — next cycle */ })
      );
    }
  });
}

/* ── v2 §15.2 — WEB PUSH ───────────────────────────────────────────────────
 * Notification display lives here (the subscription lives in the app:
 * /api/push/subscribe). Payload: { title, body, tag?, code? } — ≤ 512 B. */

self.addEventListener('push', function(event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'GullyScore', body: event.data ? event.data.text() : '' };
  }
  var title = data.title || 'GullyScore';
  var url = data.code ? ('/live/' + data.code) : '/live';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag || 'gullyscore',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: url }
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/live';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.indexOf(url) >= 0 && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
