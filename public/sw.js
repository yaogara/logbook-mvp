// Derive a build-specific cache key from the registered script URL
const BUILD_ID = (() => {
  try {
    const u = new URL(self.location.href);
    return u.searchParams.get('build') || String(Date.now());
  } catch (e) {
    return String(Date.now());
  }
})();
const CACHE_KEY = `logbook-mvp-${self.registration.scope}-${BUILD_ID}`;

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

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
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
