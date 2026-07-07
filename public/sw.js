const CACHE_NAME = 'ethos-v3.1.61'; // Increment for cache busting
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './ethos-icon.svg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass service worker for WebSocket connections, navigations, and non-GET
  if (event.request.method !== 'GET' || 
      event.request.headers.get('upgrade')?.toLowerCase() === 'websocket' ||
      url.protocol === 'ws:' || url.protocol === 'wss:') {
    return;
  }

  // Network first for HTML pages and manifest
  if (event.request.mode === 'navigate' || 
      url.pathname.endsWith('/') || 
      url.pathname.endsWith('index.html') || 
      url.pathname.endsWith('manifest.webmanifest')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

   // Bypass cache for relay & signaling hosts and CORS proxies
   const bypassHosts = ['nostr', 'relay', 'damus', 'mom', 'nos', 'l', 'pkarr', 'iroh', 'dht', 'corsproxy', 'allorigins'];
   if (bypassHosts.some(host => url.hostname.includes(host))) {
     return;
   }

  // Cache first for static assets
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
