/* =============================================
   BURGER STREET POS — CLOUD STORAGE (Firebase)
   =============================================
   A drop-in replacement for localStorage:
     cloudStorage.getItem(key)
     cloudStorage.setItem(key, value)
     cloudStorage.removeItem(key)

   ...except every value is mirrored to a Firestore collection in real time,
   so every cashier device sharing the same FIRESTORE_STORE_ID sees the same
   data, live, with no manual refresh.

   How it stays "synchronous" like localStorage:
   An in-memory cache holds the latest known value for every key. Reads
   return straight from that cache instantly. Writes update the cache
   immediately (so the UI feels instant) AND push the change to Firestore
   in the background. A real-time listener (onSnapshot) keeps the cache
   updated with changes coming from OTHER devices too, and re-runs the
   relevant screen's render function automatically so a second cashier's
   sale, a stock update, etc. shows up on every screen without anyone
   tapping refresh.

   FALLBACK MODE: if the Firebase SDK didn't load (no internet on first
   visit, an ad-blocker/firewall blocking Google domains, or a Firebase
   outage) firebase-config.js leaves firestoreDb as null instead of
   throwing. When that happens, cloudStorage below falls back to the
   browser's real localStorage so the app keeps working on this one
   device — it just won't sync to other cashier devices until the
   connection comes back. Every caller uses the exact same
   getItem/setItem/removeItem/onReady API either way.
   ============================================= */

// ---- FALLBACK: plain localStorage, wrapped in the same API as cloud mode ----
function buildLocalOnlyStorage(reason) {
  console.warn('Cloud sync unavailable (' + reason + ') — Burger Street POS is saving locally on this device only.');
  return {
    getItem(key) {
      try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    setItem(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        console.error('Local save failed for "' + key + '":', e);
        if (typeof showToast === 'function') {
          showToast('⚠️ Could not save — device storage may be full.', 'error');
        }
      }
    },
    removeItem(key) {
      try { localStorage.removeItem(key); } catch (e) { console.error('Local delete failed for "' + key + '":', e); }
    },
    // Nothing to wait for locally — call back on the next tick so callers
    // that assume onReady is always async behave consistently either way.
    onReady(cb) { setTimeout(cb, 0); }
  };
}

const cloudStorage = (typeof firebase === 'undefined' || !firestoreDb)
  ? buildLocalOnlyStorage(typeof firebase === 'undefined' ? 'Firebase SDK did not load' : 'Firebase failed to initialize')
  : (() => {
  try {

  const cache = {};
  let ready = false;
  const readyCallbacks = [];

  // Maps a stored key to the render/refresh function(s) that should re-run
  // when that key's data changes (from this device OR any other device).
  // Add to this list any time you add a new cloudStorage-backed key that
  // has its own screen.
  const RENDER_MAP = [
    { match: k => k === 'burgerStreetCashiers',
      fns: ['renderCashierList', 'renderCashierManagement'] },
    { match: k => k === 'burgerStreetGlobal',
      fns: ['renderMenuGrid'] },
    { match: k => k.startsWith('burgerStreetPOS_'),
      fns: ['renderOrderHistory', 'renderSummary', 'renderOwnerSummary'] },
    { match: k => k === 'burgerStreetSharedInventory',
      fns: ['renderInventory', 'renderInvModal'] },
    { match: k => k === 'burgerStreetSharedDeliveries',
      fns: ['renderDeliveryLog'] },
    { match: k => k === 'burgerStreetExpenses',
      fns: ['renderExpenseLog', 'renderOwnerSummary'] },
    { match: k => k === 'burgerStreetPriorityStock' || k === 'burgerStreetGlobalAlertThreshold',
      fns: ['refreshSettingsPage'] },
    { match: k => k === 'burgerStreetIngredientTemplate',
      fns: ['_refreshRecipeUI'] }
  ];

  function triggerRender(key) {
    RENDER_MAP.forEach(rule => {
      if (!rule.match(key)) return;
      rule.fns.forEach(fnName => {
        try {
          if (typeof window[fnName] === 'function') window[fnName]();
        } catch (e) {
          console.warn('Cloud sync: render hook "' + fnName + '" failed for key', key, e);
        }
      });
    });
  }

  function docIdFor(key) {
    // Firestore doc IDs can't contain "/" — sanitize just in case a future
    // key ever does. Our current keys never do.
    return key.replace(/\//g, '_');
  }

  const collectionRef = () =>
    firestoreDb.collection('stores').doc(FIRESTORE_STORE_ID).collection('data');

  function startListening() {
    collectionRef().onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        const key = (change.doc.data() && change.doc.data().key) || change.doc.id;
        if (change.type === 'removed') {
          delete cache[key];
        } else {
          cache[key] = change.doc.data().value;
        }
        if (ready) triggerRender(key);
      });
      if (!ready) {
        ready = true;
        readyCallbacks.forEach(cb => cb());
        readyCallbacks.length = 0;
      }
    }, err => {
      console.error('Cloud sync error:', err);
      if (typeof showToast === 'function') {
        showToast('⚠️ Cloud sync error — check your connection.', 'error');
      }
      // Don't leave the app stuck waiting forever if the very first
      // connection attempt fails (e.g. no internet on first-ever launch).
      if (!ready) {
        ready = true;
        readyCallbacks.forEach(cb => cb());
        readyCallbacks.length = 0;
      }
    });
  }

  // Auth gate: Firestore security rules (see README-FIREBASE-SETUP.md)
  // require a signed-in user. We use silent Anonymous Auth — there's no
  // separate login UI for this; the app's own PIN screens still control who
  // can actually use the POS. This just authenticates the DEVICE to Firebase.
  firebase.auth().onAuthStateChanged(user => {
    if (user) {
      startListening();
    } else {
      firebase.auth().signInAnonymously().catch(e => {
        console.error('Firebase anonymous sign-in failed:', e);
        if (typeof showToast === 'function') {
          showToast('⚠️ Could not connect to cloud — working offline.', 'error');
        }
        ready = true;
        readyCallbacks.forEach(cb => cb());
        readyCallbacks.length = 0;
      });
    }
  });

  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : null;
    },
    setItem(key, value) {
      cache[key] = value;
      collectionRef().doc(docIdFor(key)).set({
        key,
        value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(e => console.error('Cloud save failed for "' + key + '":', e));
    },
    removeItem(key) {
      delete cache[key];
      collectionRef().doc(docIdFor(key)).delete()
        .catch(e => console.error('Cloud delete failed for "' + key + '":', e));
    },
    // Calls cb() once the first full sync with Firestore has completed
    // (or immediately, if it already has).
    onReady(cb) {
      if (ready) cb(); else readyCallbacks.push(cb);
    }
  };

  } catch (e) {
    // Something about cloud setup itself threw synchronously (e.g. the
    // Firestore SDK loaded but the Auth SDK didn't). Fall back rather than
    // taking the rest of the app down with it.
    return buildLocalOnlyStorage('Firebase setup failed: ' + e);
  }
})();

/* ---- Tiny "Connecting..." overlay, shown only on first load ---- */
function cloudShowConnecting() {
  if (document.getElementById('cloudConnectingOverlay')) return;
  const el = document.createElement('div');
  el.id = 'cloudConnectingOverlay';
  el.style.cssText = 'position:fixed;inset:0;background:#1a1a1a;color:#fff;' +
    'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'gap:14px;font-family:sans-serif;z-index:99999;';
  el.innerHTML =
    '<div style="font-size:2.2rem;">🍔</div>' +
    '<div style="font-size:0.95rem;opacity:0.85;">Connecting to cloud…</div>';
  document.body.appendChild(el);
}
function cloudHideConnecting() {
  const el = document.getElementById('cloudConnectingOverlay');
  if (el) el.remove();
}
