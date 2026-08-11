const CACHE_NAME = 'gm2026-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/data.json',
  '/vendors/bootstrap.min.css',
  '/vendors/bootstrap.bundle.min.js'
];

// Install Event - Pre-cache everything
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Fetch Event - Serve Cache First, fallback to Network
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            return fetch(event.request).catch(() => {
                // If navigation request fails, fallback to cached index.html (app shell)
                if (event.request.mode === 'navigate') return caches.match('/index.html');
            });
        })
  );
});