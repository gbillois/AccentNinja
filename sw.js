// AccentNinja Service Worker
const CACHE_NAME = 'accentninja-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './engines.js',
  './corpus.js',
  './i18n.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=Noto+Sans:wght@400;600&family=Noto+Sans+Mono:wght@400&display=swap',
  'https://aka.ms/csspeech/jsbrowserpackageraw'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache local assets strictly; external assets best-effort
      const localAssets = ASSETS.filter(a => !a.startsWith('http'));
      const externalAssets = ASSETS.filter(a => a.startsWith('http'));
      return cache.addAll(localAssets).then(() => {
        return Promise.allSettled(
          externalAssets.map(url =>
            fetch(url).then(r => r.ok ? cache.put(url, r) : null).catch(() => null)
          )
        );
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Network-only for Azure API calls
  if (url.hostname.includes('azure.com') || url.hostname.includes('microsoft.com') && url.pathname.includes('sts')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first for everything else
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // Return offline fallback for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
