const CACHE_NAME    = 'atmos-sovereign-cache-v1';
const RUNTIME_CACHE = 'atmos-runtime-cache-v1';
const API_CACHE     = 'atmos-api-cache-v1';

const urlsToCache = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) =>
        cache.addAll(urlsToCache).catch((err) => console.warn('Cache addAll partial fail:', err))
      ),
      caches.open(RUNTIME_CACHE),
      caches.open(API_CACHE),
    ])
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n !== CACHE_NAME && n !== RUNTIME_CACHE && n !== API_CACHE)
          .map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;

  if (['document','style','script'].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res && res.status === 200) {
            const key = (request.destination === 'document') ? CACHE_NAME : RUNTIME_CACHE;
            caches.open(key).then((c) => c.put(request, res.clone()));
          }
          return res;
        }).catch(() => caches.match(request));
      })
    );
  } else if (request.destination === 'image') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.status === 200)
            caches.open(RUNTIME_CACHE).then((c) => c.put(request, res.clone()));
          return res;
        })
        .catch(() => caches.match(request))
    );
  } else {
    event.respondWith(
      caches.match(request)
        .then((r) => r || fetch(request))
        .catch(() => new Response('Service unavailable', { status: 503 }))
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_CACHE')
    caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))));
});
