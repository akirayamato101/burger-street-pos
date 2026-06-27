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

firebase.initializeApp(firebaseConfig);
const firestoreDb = firebase.firestore();

// Lets the app keep working (reading/writing the LOCAL cache) when the
// connection drops, and quietly re-syncs once it's back — important since
// this app is used on a shop floor where wifi isn't always reliable.
firestoreDb.enablePersistence({ synchronizeTabs: true }).catch(err => {
  // Fails in some cases (private/incognito mode, or more than one tab open
  // without synchronizeTabs support) — not fatal, sync still works without it.
  console.warn('Firestore offline persistence not enabled:', err.code);
});
