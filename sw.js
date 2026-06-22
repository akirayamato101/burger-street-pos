/* =============================================
   BURGER STREET POS — SERVICE WORKER
   Caches all app files for offline use
   ============================================= */

const CACHE_NAME = 'burger-pos-v4';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/pos.css',
  '/pos.js',
  '/manifest.json',
  // Dexie.js from CDN — cache it so app works fully offline
  'https://cdnjs.cloudflare.com/ajax/libs/dexie/3.2.4/dexie.min.js'
];

// Install: cache all assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// App code (HTML/JS/CSS) that affects business logic — e.g. pos.js, where the
// inventory carry-over bug lives — must use NETWORK-FIRST. A pure cache-first
// strategy here was the real reason past logic fixes never reached the app:
// once pos.js was cached once, the service worker kept serving that exact
// cached copy forever and never checked the network again, even after the
// file on the server was corrected. Network-first always tries to fetch the
// latest file first, only falling back to cache when offline.
const NETWORK_FIRST_PATTERNS = [/\.html$/, /\.js$/, /\.css$/];

function isNetworkFirst(request) {
  const url = new URL(request.url);
  return NETWORK_FIRST_PATTERNS.some(re => re.test(url.pathname));
}

self.addEventListener('fetch', event => {
  if (isNetworkFirst(event.request)) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request).then(cached => {
        return cached || (event.request.mode === 'navigate' ? caches.match('/index.html') : undefined);
      }))
    );
    return;
  }

  // Static assets (icons, images, fonts, third-party libs): cache-first is
  // fine here since they rarely change and don't affect business logic.
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => {
      if (event.request.mode === 'navigate') {
        return caches.match('/index.html');
      }
    })
  );
});
