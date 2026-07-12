# Burger Street POS — Deployment Guide

## What was fixed in this build
- ✅ **The app no longer breaks when Firebase can't load.** Previously, if the
  Firebase SDK failed to load — no internet on first visit, an ad-blocker or
  firewall blocking Google domains, or a Firebase outage — the app threw
  `firebase is not defined` / `cloudStorage is not defined` and every single
  save/load in the app broke, despite this being a PWA advertised as working
  offline. It now falls back to saving on this device only (with a console
  warning), and everything keeps working.
- ✅ **Service worker offline cache fixed.** Three of the four app JS files
  were cached under the wrong version query string, so the offline fallback
  could never actually find them (`pos-part1.js?v=1` requested vs
  `pos-part1.js?v=2` cached, etc.) — meaning offline mode was silently
  broken for most of the app. Also, the entire offline cache was
  all-or-nothing: it included a leftover reference to a library (Dexie) that
  nothing in the app uses anymore, so if that one CDN request ever failed,
  *nothing* got cached for offline use, not even the app's own files.
  Third-party libraries are now cached best-effort, separately from the
  app's own files, and versioning is now a single `CACHE_NAME` bump instead
  of per-file query strings that could (and did) drift out of sync.
- ✅ **Removed dead code:** `pos.js`, `js/app.js`, `js/db.js` — none of these
  were even loaded by `index.html`, but all three were still sitting in the
  project (270KB combined). Also removed a leftover first-run setup screen
  in `index.html` that called three functions (`enterSetupPin`,
  `deleteSetupPin`, `showSetupPinOrBypass`) that don't exist anywhere in the
  codebase — harmless since it was never actually shown, but confusing.
- ✅ **De-duplicated the logo.** It was embedded as a ~35KB base64 image
  directly in `index.html`, three separate times (~106KB total) — despite
  `assets/logo.png` already existing as a real file. All three now just
  reference that file. (One of the three embedded copies had also become
  corrupted — a single flipped character — which is exactly the kind of
  thing that happens to inline blobs like this over time.)
- ✅ **Renamed the 4 main JS files** from generic `pos-part1.js`…`pos-part4.js`
  to names that describe what's actually in them, and moved all JS into a
  single `js/` folder:
  - `js/core-pos.js` — cashier login/session, cart, menu, order totals
  - `js/products-modals.js` — product management, settings, receipts
  - `js/cashier-inventory.js` — cashier management, shifts, inventory, expenses
  - `js/reports-pdf.js` — priority stock alerts, PDF export
- ℹ️ **Left alone on purpose:** the legacy `INV_KEY` (`burgerStreetV5`) read
  in `getInventoryProducts()`. Per `README-FIREBASE-SETUP.md`, this is an
  intentional one-way read from a separate Inventory App, not dead code —
  removing it would silently drop products for anyone using that other
  tool. It's a known source of past bugs (see the `BUGFIX` comments next to
  it in `js/core-pos.js`), so if you're not actually using a separate
  Inventory App, it's worth revisiting later.

---

## Option A — Deploy as PWA (Installable Web App)

Upload the entire contents of this folder to any static web host.
The app must be served over **HTTPS** for the service worker (offline mode) to activate.

### Free hosting options:
| Host | Steps |
|---|---|
| **GitHub Pages** | Push to a repo → Settings → Pages → Deploy from branch |
| **Cloudflare Pages** | Connect repo or drag-drop upload at pages.cloudflare.com |
| **Vercel** | `npx vercel` in this folder, or drag-drop at vercel.com |
| **Render** | New Static Site → connect repo |

After deploying, open the URL in Chrome or Safari on your phone.
You'll see an **"Add to Home Screen"** / **"Install App"** prompt.
The app will then work fully offline — no internet needed.

---

## Option B — Package as Android APK

### Method 1: PWABuilder (Recommended, free, no coding)
1. Deploy the PWA first (Option A above)
2. Visit https://www.pwabuilder.com
3. Enter your deployed URL
4. Click **Package for stores** → **Android**
5. Download the `.apk` — sideload it or submit to the Play Store

### Method 2: Bubblewrap / TWA (advanced)
```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest https://your-deployed-url/manifest.json
bubblewrap build
```
Outputs a signed `.apk` and `.aab` for Play Store submission.

---

## Option C — Run Locally (no internet)
Just open `index.html` directly in a browser. All fonts and logic are self-contained.
Note: The service worker won't activate on `file://` URLs — that's fine for local use.
Firebase also won't load without internet, which is fine too — the app saves to this device instead.

---

## First-Time Setup
1. Open the app — since no cashiers exist yet, you'll see **"No cashiers set
   up yet"** with an **"Enter as Owner"** button. Tap it (no PIN needed the
   very first time, since none is set yet).
2. Go to **Settings** → set an owner PIN and add your cashiers (each gets
   its own 4-digit PIN, default `0000` — change it when adding them).
3. Go to **Manage Products** → add your menu items.
4. Done — start taking orders!
