// Derive a build-specific cache key from the registered script URL
const BUILD_ID = (() => {
  try {
    const u = new URL(self.location.href);
    return u.searchParams.get('build') || String(Date.now());
  } catch (e) {
    return String(Date.now());
  }
})();
const CACHE_VERSION = 'logbook-mvp-v4';
const CACHE_KEY = `${CACHE_VERSION}-${BUILD_ID}`;

const ASSETS = [
  '/',
  '/index.html',
  '/vite.svg',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_KEY).then((cache) => cache.addAll(ASSETS)).catch(() => null)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_KEY).map((k) => caches.delete(k)));

      // Remove any cached requests containing "/api/trpc/" to clear stale API cache
      const cache = await caches.open(CACHE_KEY);
      const requests = await cache.keys();
      await Promise.all(
        requests
          .filter(request => request.url.includes('/api/trpc/'))
          .map(request => cache.delete(request))
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  // Skip caching any requests whose URL includes "/api/"
  if (url.pathname.includes('/api/')) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) {
        // Stale-while-revalidate: return cache immediately, update in background
        event.waitUntil(
          (async () => {
            try {
              const fresh = await fetch(request);
              const cache = await caches.open(CACHE_KEY);
              await cache.put(request, fresh.clone());
            } catch (_) {
              // ignore network update failure
            }
          })()
        );
        return cached;
      }
      try {
        const response = await fetch(request);
        const cache = await caches.open(CACHE_KEY);
        cache.put(request, response.clone());
        return response;
      } catch (err) {
        return cached || Response.error();
      }
    })()
  );
});
