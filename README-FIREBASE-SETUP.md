# Adding Firebase to Burger Street POS — Setup Guide

This patch turns the app's storage from **per-device localStorage** into a
**shared, real-time Firestore database**. Every cashier device that uses the
same `FIRESTORE_STORE_ID` now sees the same cashiers, menu, orders,
inventory, deliveries, expenses, and settings — live, with no manual sync.

## What changed (for your own understanding)

| File | Change |
|---|---|
| `js/firebase-config.js` | Your Firebase project config + Firestore init. You must fill in the placeholder values. Now falls back to local-only mode instead of crashing the app if the SDK can't load. |
| `js/cloud-storage.js` | `cloudStorage` — a drop-in replacement for `localStorage` backed by Firestore, with real-time sync. Falls back to the browser's real `localStorage` (same device only) if Firebase is unavailable — see the comment at the top of the file. |
| `js/core-pos.js`, `js/products-modals.js`, `js/cashier-inventory.js` | Every call that read/wrote **shared business data** (`localStorage.getItem/setItem/removeItem`) was changed to `cloudStorage.getItem/setItem/removeItem`. (These three files were renamed from `pos-part1.js`/`pos-part2.js`/`pos-part3.js` — same content, clearer names.) |
| `js/core-pos.js` (init) | The startup code now waits for the first Firestore sync (`cloudStorage.onReady(...)`) before showing the cashier login screen, so you don't see a flash of empty data on load. |
| `index.html` | Added the Firebase SDK `<script>` tags and the two new files, loaded *before* the app's own JS files. |
| `sw.js` | Bumped the cache version and added the new files/CDN scripts to the offline cache list (third-party CDN scripts are now cached best-effort, so one being unreachable can't block the rest of the app from being available offline). |

### What was deliberately left untouched
- **`'burgStreet_activeSession'`** — which cashier is currently logged in on *this* terminal. This is a device/session detail, not shared business data, so it stays in plain `localStorage`.
- **`INV_KEY` (`'burgerStreetV5'`)** — this app only *reads* this key (it's written by a separate "Inventory App", if you use one). Since this code never writes it, there's nothing for it to push to the cloud.

---

## Step 1 — Create a Firebase project
1. Go to https://console.firebase.google.com → **Add project**.
2. Name it anything (e.g. "burger-street-pos"). Google Analytics is optional — you can skip it.
3. Once created, click the **Web** icon (`</>`) to register a web app. Give it a nickname (e.g. "POS"). You **don't** need Firebase Hosting — you're staying on GitHub Pages.
4. Firebase will show you a `firebaseConfig` object. Copy it.

## Step 2 — Paste your config in
Open `js/firebase-config.js` and replace the placeholder values with what Firebase gave you:
```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "burger-street-pos.firebaseapp.com",
  projectId: "burger-street-pos",
  storageBucket: "burger-street-pos.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};
```
This file has no secrets to hide — it's normal and safe for it to be public in your repo. Real protection comes from Firestore Security Rules (Step 4).

## Step 3 — Turn on Firestore + Anonymous Auth
1. In the Firebase Console sidebar: **Build → Firestore Database → Create database**.
   - Choose a region close to your shop (e.g. `asia-southeast1` for the Philippines).
   - Start in **production mode** (we'll set proper rules in Step 4 — don't leave it in test mode long-term, test mode auto-locks everyone out after 30 days).
2. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable.**
   - The app signs every device in anonymously in the background — there's no separate login screen for this. It just lets Firestore tell "a device from my app" apart from a random stranger on the internet. Your existing PIN screens still control who can actually use the POS.

## Step 4 — Set Firestore Security Rules
In **Firestore Database → Rules**, replace the default rules with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /stores/{storeId}/data/{docId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

This means: anyone *signed in* (i.e. any device running your app) can read/write this shop's data, but a random visitor with no app can't. This is the right level of security for a single small business where every device using the app is a trusted staff device. Click **Publish**.

> If you ever want tighter control (e.g. cashiers can't edit other cashiers' settings), that requires replacing anonymous auth with real per-user accounts and writing per-field rules — a bigger change. Ask if you want help with that later.

## Step 5 — Deploy
1. Commit and push all the changed/new files to your `burger-street-pos` GitHub repo (same repo, same branch you already deploy from).
2. GitHub Pages will rebuild automatically. Give it a minute, then hard-refresh the live site (or just wait — the service worker is network-first for `.js`/`.html`, so it'll pick up the new version itself).
3. Open the app on **two different devices/browsers** at once and confirm: add a cashier or place an order on one, and watch it appear on the other within a second or two, with no refresh.

## Step 6 — (Recommended) Set a budget alert
Firestore's free tier (Spark plan) is generous — 50K reads/20K writes/day — and a single burger stand is very unlikely to hit it. Still, in **Firebase Console → Usage and billing**, you can set a budget alert just as a safety net.

---

## Troubleshooting
- **"Connecting to cloud…" never goes away** → open the browser console (F12). A `permission-denied` error means Step 4's rules weren't published, or Anonymous Auth isn't enabled (Step 3). A `Firebase: Error (auth/...)` means Anonymous Auth isn't turned on.
- **Data doesn't show up on a second device** → make sure `FIRESTORE_STORE_ID` in `js/firebase-config.js` is *identical* on every device's copy of the file (it is, automatically, since they all load the same file from GitHub Pages — but double check if you ever hand-edit one device differently).
- **Works on one device, blank on a freshly opened one** → that's expected the very first time a brand-new device hits a store that already has data; it has to do its very first sync. It should populate within a second or two — that's what the "Connecting to cloud…" screen is covering for.
