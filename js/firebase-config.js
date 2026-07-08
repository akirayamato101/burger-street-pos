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

// Offline persistence disabled — was causing QuotaExceededError in the browser
// because local storage was full. The app still works perfectly online and
// syncs in real time across all devices. Re-enable this later if needed after
// clearing browser storage.
// firestoreDb.enablePersistence({ synchronizeTabs: true }).catch(err => {
//   console.warn('Firestore offline persistence not enabled:', err.code);
// });
