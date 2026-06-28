/* =============================================
   BURGER STREET POS — SERVICE WORKER
   Caches all app files for offline use
   ============================================= */

const CACHE_NAME = 'burger-pos-v12';

// IMPORTANT: paths are RELATIVE (no leading "/"). This app is hosted on
// GitHub Pages as a PROJECT site (https://<user>.github.io/burger-street-pos/),
// not at the domain root. A leading "/" resolves against the *origin*
// (https://<user>.github.io/pos.css) instead of the app's real folder
// (https://<user>.github.io/burger-street-pos/pos.css), so every one of
// these used to 404. That silently breaks/aborts the precache on install
// and means the runtime fetch handler's caches.match() fallback can never
// find a match either — which is what was actually causing phones (slower/
// flakier first loads, more likely to hit the offline-fallback branch) to
// get stuck on missing or stale assets, while desktops on a fast reliable
// connection almost always succeeded over the network and never noticed.
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  // Must match the exact URL (including the ?v=4 cache-busting query string)
  // that index.html actually requests — the Cache API matches by full URL,
  // so a precached entry without the query string would never be found by
  // caches.match() for this request, leaving the app unable to load its
  // own styles on a first-ever offline launch.
  './pos.css?v=4',
  './js/firebase-config.js?v=1',
  './js/cloud-storage.js?v=1',
  './pos-part1.js?v=2',
  './pos-part2.js?v=3',
  './pos-part3.js?v=3',
  './pos-part4.js?v=1',
  './manifest.json',
  // Dexie.js from CDN — cache it so app works fully offline
  'https://cdnjs.cloudflare.com/ajax/libs/dexie/3.2.4/dexie.min.js',
  // jsPDF + autotable — used to export the Daily Inventory Report as a PDF;
  // cached so the export still works with no internet connection.
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  // Firebase SDK — cached so the app shell still loads with no connection.
  // Firestore's own offline persistence (enabled in firebase-config.js)
  // handles reads/writes while offline and re-syncs once back online.
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'
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
        // Use new URL(...).href rather than a bare './index.html' string —
        // self.registration.scope gives the correct absolute base
        // (https://<user>.github.io/burger-street-pos/) regardless of
        // which sub-path of the app this request came from.
        return cached || (event.request.mode === 'navigate'
          ? caches.match(new URL('index.html', self.registration.scope).href)
          : undefined);
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
        return caches.match(new URL('index.html', self.registration.scope).href);
      }
    })
  );
});
