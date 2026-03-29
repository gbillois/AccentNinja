/* AccentNinja Service Worker
 * Cache-first for app assets, network-first for Azure API calls.
 */

const CACHE_NAME = 'accentninja-v1';
const AZURE_HOST = '.microsoft.com';
const SPEECH_SDK_URL = 'https://cdn.jsdelivr.net/npm/microsoft-cognitiveservices-speech-sdk';

const APP_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './engines.js',
  './corpus.js',
  './i18n.js',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
];

// --- Install: pre-cache app assets ---
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_ASSETS))
  );
  self.skipWaiting();
});

// --- Activate: remove old caches ---
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// --- Fetch strategy ---
self.addEventListener('fetch', event => {
  const { url } = event.request;

  // Network-first for Azure API calls (require live network)
  if (url.includes(AZURE_HOST) || url.includes('cognitiveservices')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Cache-first for the Speech SDK CDN
  if (url.includes(SPEECH_SDK_URL) || url.includes('aka.ms/csspeech')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Cache-first for all other requests (app assets)
  event.respondWith(cacheFirst(event.request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}
