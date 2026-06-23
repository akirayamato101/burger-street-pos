/* =============================================
   BURGER STREET POS — SERVICE WORKER
   Caches all app files for offline use
   ============================================= */

const CACHE_NAME = 'burger-pos-v8';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/pos.css',
  '/pos-core.js',
  '/pos-auth.js',
  '/pos-helpers.js',
  '/pos-products.js',
  '/pos-receipt.js',
  '/pos-orders.js',
  '/pos-movements.js',
  '/pos-cashadvance.js',
  '/pos-cashiers.js',
  '/pos-inventory.js',
  '/pos-reports.js',
  '/manifest.json',
  // jsPDF + autotable — used to export the Daily Inventory Report as a PDF;
  // cached so the export still works with no internet connection.
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'
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

// App code (HTML/JS/CSS) that affects business logic must use NETWORK-FIRST.
// A pure cache-first strategy was the real reason past logic fixes never
// reached the app: once a file was cached, the service worker kept serving
// that exact cached copy forever and never checked the network again, even
// after the file on the server was corrected. Network-first always tries to
// fetch the latest file first, only falling back to cache when offline.
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
