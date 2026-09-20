const CACHE_NAME = 'ethos-v3.2.6'; // Increment for cache busting
const DEEP_LINK_STASH_CACHE = 'ethos-deeplink-v1';
const DEEP_LINK_STASH_URL = './__ethos_pending_deeplink';
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
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_NAME && key !== DEEP_LINK_STASH_CACHE).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
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

async function stashNotificationDeepLink(data) {
  if (!data?.peerId || !data?.messageId) return;
  try {
    const cache = await caches.open(DEEP_LINK_STASH_CACHE);
    await cache.put(
      DEEP_LINK_STASH_URL,
      new Response(
        JSON.stringify({ peerId: data.peerId, messageId: data.messageId, ts: Date.now() }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    );
  } catch (_) {
    // Best-effort; openWindow / postMessage remain the primary paths.
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  let targetUrl = self.registration.scope;
  try {
    if (data.url) {
      targetUrl = new URL(data.url, self.registration.scope).href;
    } else if (data.peerId && data.messageId) {
      targetUrl = new URL(`./#/chat/${data.peerId}/${data.messageId}`, self.registration.scope).href;
    }
  } catch (_) {
    targetUrl = self.registration.scope;
  }

  event.waitUntil((async () => {
    await stashNotificationDeepLink(data);
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if (!('focus' in client)) continue;
      await client.focus();
      // Always postMessage — navigate can no-op on PWAs and must not skip the deep link.
      client.postMessage({
        type: 'ethos_notification_open',
        peerId: data.peerId,
        messageId: data.messageId,
        url: data.url || targetUrl,
      });
      if (typeof client.navigate === 'function') {
        try {
          await client.navigate(targetUrl);
        } catch (_) {
          /* hash/postMessage still applied above */
        }
      }
      return;
    }
    if (clients.openWindow) return clients.openWindow(targetUrl);
  })());
});

self.addEventListener('push', (event) => {
  let data = { title: 'New Message', body: 'You received a new E2EE message in ETHOS.', data: { url: './' } };
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data.body = event.data.text();
    }
  }

  const icon = new URL('./ethos-icon.svg', self.registration.scope).href;
  const options = {
    body: data.body || 'New message in ETHOS',
    icon,
    badge: icon,
    data: data.data || { url: './' },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'ETHOS', options)
  );
});
