/*
 * Retires the service worker the previous LeadOS app installed at /sw.js. That worker served
 * pages cache-first, so returning visitors saw the old site. Browsers re-check /sw.js on each
 * visit; this version clears every cache, unregisters itself and reloads open tabs, after which
 * the site is served straight from the network. Keep this file until old visitors have moved on.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const windows = await self.clients.matchAll({ type: 'window' });
      await Promise.all(windows.map((client) => client.navigate(client.url).catch(() => {})));
    })(),
  );
});
