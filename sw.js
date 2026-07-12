/* =============================================
   BURGER STREET POS — SERVICE WORKER
   Caches all app files for offline use
   ============================================= */

const CACHE_NAME = 'burger-pos-v14';

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
//
// NOTE ON VERSIONING: index.html and this file used to each track their own
// "?v=N" cache-busting number per script tag, and they drifted out of sync
// more than once (e.g. index.html requesting "core-pos.js" while this file
// had "core-pos.js?v=2" precached — two different URLs as far as the Cache
// API is concerned, so the precached one was never actually used). To make
// that whole class of bug impossible, local files below now carry NO query
// string, and freshness is controlled in exactly one place: bump CACHE_NAME
// below on every deploy that changes any app file. That alone forces a full
// re-precache of everything, and the activate handler deletes the old cache.
const CORE_ASSETS = [
  // The app shell: same-origin files that MUST be cached for offline mode
  // to work at all. If any of these fails, the install itself fails loudly
  // (correct — it means the deploy itself is broken) rather than silently.
  './',
  './index.html',
  './pos.css',
  './manifest.json',
  './js/firebase-config.js',
  './js/cloud-storage.js',
  './js/core-pos.js',
  './js/products-modals.js',
  './js/cashier-inventory.js',
  './js/reports-pdf.js'
];

const OPTIONAL_ASSETS = [
  // Third-party CDN libraries. Cached on a best-effort basis (see install
  // handler below) — if a network hiccup, ad-blocker, or firewall blocks
  // any ONE of these during first install, that must NOT prevent the app
  // shell above from being cached. Losing one of these only means that one
  // specific feature (PDF export, or cloud sync) degrades gracefully later;
  // losing the whole precache would mean losing offline mode entirely.
  //
  // jsPDF + autotable — used to export the Daily Inventory Report as a PDF.
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  // Firebase SDK — cached so the app shell still loads with no connection.
  // If these aren't available (here, or on a later launch), cloud-storage.js
  // falls back to saving locally on-device instead of throwing.
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'
];

// Install: core app shell is all-or-nothing (it should always succeed —
// these are local files sitting right next to this one). Third-party CDN
// assets are cached individually and best-effort, so one blocked/failed
// domain can't take down offline support for the whole app.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      await cache.addAll(CORE_ASSETS);
      await Promise.allSettled(
        OPTIONAL_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('SW: optional asset not cached:', url, err))
        )
      );
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
// A pure cache-first strategy here was the real reason past logic fixes never
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
