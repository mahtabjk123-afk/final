const CACHE_PREFIX = 'bolmizan-app-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v31`;
const APP_SHELL = ['/', '/index.html', '/manifest.json'];
const API_PATH = /^\/api(?:\/|$)/;

function isCacheableResponse(request, response) {
  if (!response || !response.ok || response.type !== 'basic') return false;
  if (request.headers.has('authorization') || request.headers.has('range')) return false;
  const cacheControl = response.headers.get('Cache-Control') || '';
  return !/\b(?:no-store|private)\b/i.test(cacheControl) && !response.headers.has('Set-Cookie');
}

async function cacheResponse(cache, request, response) {
  if (isCacheableResponse(request, response)) {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    API_PATH.test(url.pathname) ||
    request.headers.has('authorization') ||
    request.headers.has('range')
  ) {
    return;
  }

  const isNavigation = request.mode === 'navigate';
  const isStaticAsset = url.pathname.startsWith('/assets/') || Boolean(request.destination);
  if (!isNavigation && !isStaticAsset) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      if (!isNavigation) {
        const cached = await cache.match(request);
        if (cached) return cached;
      }

      try {
        const response = await fetch(request);
        return await cacheResponse(cache, isNavigation ? '/index.html' : request, response);
      } catch {
        const cached = await cache.match(isNavigation ? '/index.html' : request);
        if (cached) return cached;
        return new Response('This resource is not available offline.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    }),
  );
});
