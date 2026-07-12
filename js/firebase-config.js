/* =============================================
   BURGER STREET POS — FIREBASE CONFIG
   =============================================
   Fill these in from:
   Firebase Console → ⚙️ Project settings → General → "Your apps" → Web app → SDK setup and configuration

   This file has NO secrets that need hiding — Firebase web config is meant
   to be public (your Firestore Security Rules are what actually protect the
   data, not this file). It's safe to commit this to a public repo.
   ============================================= */

const firebaseConfig = {
  
  apiKey: "AIzaSyC3nCQj10h4DmSfrwTtHZpXMGVs2GcGlBM",
  authDomain: "burger-street-pos-15cd9.firebaseapp.com",
  projectId: "burger-street-pos-15cd9",
  storageBucket: "burger-street-pos-15cd9.firebasestorage.app",
  messagingSenderId: "828938679812",
  appId: "1:828938679812:web:e3f81e4ef2ec5f49a46751"
};

// One shared ID for this shop's data. Every device that uses this same ID
// reads/writes the SAME live data and stays in sync in real time.
// If you ever run more than one branch/location, give each one its own ID
// (e.g. "burger-street-makati", "burger-street-cebu") so they don't mix data.
const FIRESTORE_STORE_ID = "main-branch";

// `firestoreDb` stays null (instead of throwing) whenever Firebase isn't
// usable — no internet on first load, an ad-blocker or firewall blocking
// Google/Firebase domains, or Firebase itself having an outage. Without this
// guard, a missing/blocked SDK used to throw right here and take the rest of
// the app down with it (see cloud-storage.js for how the app then falls back
// to saving locally on this device instead of syncing to the cloud).
let firestoreDb = null;

if (typeof firebase === 'undefined') {
  console.warn('Firebase SDK did not load (offline, blocked, or CDN unreachable) — Burger Street POS will run in local-only mode on this device.');
} else {
  try {
    firebase.initializeApp(firebaseConfig);
    firestoreDb = firebase.firestore();

    // Offline persistence disabled — was causing QuotaExceededError in the browser
    // because local storage was full. The app still works perfectly online and
    // syncs in real time across all devices. Re-enable this later if needed after
    // clearing browser storage.
    // firestoreDb.enablePersistence({ synchronizeTabs: true }).catch(err => {
    //   console.warn('Firestore offline persistence not enabled:', err.code);
    // });
  } catch (e) {
    console.warn('Firebase failed to initialize — Burger Street POS will run in local-only mode on this device:', e);
    firestoreDb = null;
  }
}
