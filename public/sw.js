// Both lines are rewritten by the sw-manifest plugin in vite.config.js at build time:
// the version is a hash of the built files, the asset list is Vite's hashed JS/CSS.
const BUILD_VERSION = 'dev';
const BUILD_ASSETS = [];

const CACHE_NAME = `seferiyat-hanetzach-${BUILD_VERSION}`;

const PRECACHE_URLS = [
  ...BUILD_ASSETS,
  './',
  './index.html',
  './manifest.webmanifest',
  './dl-splash.js',
  './dl-watermark.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/screenshot-wide.png',
  './icons/screenshot-narrow.png',
  'https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500;700;900&family=IBM+Plex+Sans+Hebrew:wght@400;500;600&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin && !url.hostname.includes('fonts.googleapis.com') && !url.hostname.includes('fonts.gstatic.com')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Never replace the offline shell with an error page
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
