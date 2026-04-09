/* AccentNinja Service Worker
 * No caching — always fetch from network.
 */

const CACHE_NAME = 'accentninja-v1';

// --- Install: skip waiting immediately, no pre-caching ---
self.addEventListener('install', () => {
  self.skipWaiting();
});

// --- Activate: delete all existing caches ---
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// --- Fetch: always go to network, no caching ---
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(
      () => new Response('Offline', { status: 503 })
    )
  );
});
