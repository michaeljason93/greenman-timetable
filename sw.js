const CACHE_NAME = 'gm-schedule-v2';

// Static assets (App Shell)
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './vendors/bootstrap.min.css',
  './vendors/bootstrap.bundle.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

// Fetch Interceptor
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // 📡 Network-First Strategy for JSON data
  if (requestUrl.pathname.endsWith('.json')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // If network fetch succeeds, cache a clone of the response
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // 📶 OFFLINE FALLBACK: Return cached JSON if available
          return caches.match(event.request);
        })
    );
    return;
  }

  // 📦 Cache-First Strategy for static assets (HTML, CSS, JS)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});