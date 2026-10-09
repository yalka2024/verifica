// Minimal service worker for Verifica. Two jobs: make the app
// installable as a PWA, and best-effort Background Sync registration for
// browsers that support it. The RELIABLE queue-flush path is the page's own
// `online` event listener (src/lib/offlineQueue.js) — Background Sync has no
// support in Safari/iOS, which matters when the intended user is a field
// technician on a phone, so nothing here depends on it firing.
//
// Deliberately does NOT cache the app shell or API responses: a dispatcher
// looking at a stale job list because of an old cached response is a worse
// failure mode than a network error, so every request just passes through.
const VERSION = 'verifica-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(
      () => new Response('Offline', { status: 503, statusText: 'Offline' })
    )
  );
});

// Best-effort: tells any open tab to flush its queue. Most of the time the
// page's own `online` listener gets there first; this only matters for the
// (currently rare, Chromium-only) case of a closed tab waking the SW.
self.addEventListener('sync', (event) => {
  if (event.tag !== 'offline-queue-flush') return;
  event.waitUntil(
    self.clients.matchAll().then((clients) => {
      for (const client of clients) client.postMessage({ type: 'offline-queue-flush' });
    })
  );
});

