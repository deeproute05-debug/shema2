// OrgCanvas service worker — network-first for navigations, cache-first for
// hashed /assets/. Old caches are deleted on activate. When a new SW takes
// over, it skips waiting only after the user accepts the "Update available"
// banner (via postMessage 'SKIP_WAITING').

const SW_VERSION = 'v1.1.0';
const SHELL_CACHE = `orgcanvas-shell-${SW_VERSION}`;
const ASSET_CACHE = `orgcanvas-assets-${SW_VERSION}`;
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  // Do NOT call self.skipWaiting() here — the new SW stays in the waiting
  // state until the user accepts the "Update available" banner, which sends
  // 'SKIP_WAITING' via postMessage. This matches the banner design.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('orgcanvas-') && key !== SHELL_CACHE && key !== ASSET_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isApiRequest(url) {
  return (
    url.pathname.startsWith('/rest/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/realtime/') ||
    url.pathname.startsWith('/functions/') ||
    url.pathname.startsWith('/storage/')
  );
}

function isHashedAsset(url) {
  // Vite emits assets as /assets/<name>-<hash>.js and .css
  return url.pathname.startsWith('/assets/');
}

function isNavigationRequest(req) {
  return (
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html')
  );
}

// Network-first: always fetch from network, fall back to cache on failure.
// This ensures index.html is always fresh so it points to current hashed chunks.
function networkFirst(event, cacheName) {
  const req = event.request;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(cacheName).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => cached || new Response('Offline', { status: 503 }))
      )
  );
}

// Cache-first: serve from cache if available, otherwise fetch and cache.
// Safe for hashed assets because the filename changes when content changes.
function cacheFirst(event, cacheName) {
  const req = event.request;
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(cacheName).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!isSameOrigin(url) || isApiRequest(url)) return;

  // Navigations and index.html: network-first so users always get fresh
  // chunk references (prevents stale index.html pointing to deleted chunks)
  if (isNavigationRequest(req) || url.pathname === '/' || url.pathname === '/index.html') {
    networkFirst(event, SHELL_CACHE);
    return;
  }

  // Hashed /assets/: cache-first (filenames are content-hashed, so stale
  // entries are harmless — a new build produces new filenames)
  if (isHashedAsset(url)) {
    cacheFirst(event, ASSET_CACHE);
    return;
  }

  // Other same-origin static resources (icons, manifest, etc.):
  // stale-while-revalidate — serve cache, update in background
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
