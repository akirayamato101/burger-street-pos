# Burger Street POS — Deployment Guide

## What was fixed in this build
- ✅ Removed dead files: `js/app.js`, `css/style.css`, `netlify.toml`
- ✅ Removed `getSampleProducts()` dead stub
- ✅ Google Fonts **replaced with self-hosted base64 fonts** (Bangers + Nunito) — fully offline
- ✅ Service worker updated (v4): removed dead file references and Google Fonts URL
- ✅ Default PIN changed from `1234` to `0000` — change it in Settings on first launch

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

---

## First-Time Setup
1. Open the app → it starts on the Lock Screen with PIN `0000`
2. Go to **Settings** → change the PIN and set the cashier name
3. Go to **Manage Products** → add your menu items
4. Done — start taking orders!
