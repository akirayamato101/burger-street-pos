/* ===== pos-part1.js — PART 1 of 4 ===== */
/* This is pos.js split into 4 files, in the exact original order. */
/* Load order matters: part1 -> part2 -> part3 -> part4 (see index.html) */

/* =============================================
   BURGER STREET POS — CASHIER APP
   Reads products from Inventory App localStorage
   ============================================= */

// =================== CONSTANTS ===================
const CASHIER_PIN = '0000';
const CASHIER_NAME = 'Cashier 1';
const BIZ_NAME = 'Burger Street';
const STORAGE_KEY = 'burgerStreetPOS';
const INV_KEY = 'burgerStreetV5';
const CASHIERS_KEY = 'burgerStreetCashiers';
const OWNER_GLOBAL_KEY = 'burgerStreetGlobal';

// Returns YYYY-MM-DD based on LOCAL time, not UTC.
// Using toISOString() alone shifts the date by the timezone offset (e.g. in
// Manila, UTC+8, anything before 8:00 AM local time gets stamped as "yesterday"
// in UTC). That caused inventory entered early in the morning by one cashier
// to be saved under the previous day's key, making it invisible to the next
// cashier checking "today's" inventory.
function getLocalDateKey(d = new Date()) {
  const tzOffsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().split('T')[0];
}

// Tracks the date getLocalDateKey() returned the last time we checked it.
// Used by checkDateRollover() (called once a minute — see updateDate()) to
// notice when a new calendar day has started while the app is still open.
let lastKnownDateKey = getLocalDateKey();


// =================== CASHIER/SHIFT STATE ===================
let activeCashier = null; // { id, name, pin }

function getCashiers() {
  try { return JSON.parse(cloudStorage.getItem(CASHIERS_KEY)) || []; } catch(e) { return []; }
}
function saveCashiers(list) {
  try { cloudStorage.setItem(CASHIERS_KEY, JSON.stringify(list)); } catch(e) {}
}

function getCashierStorageKey(cashierId) {
  return STORAGE_KEY + '_' + cashierId;
}
function getCashierInvKey(cashierId) {
  return 'burgerStreetInventory_' + cashierId;
}

// Global data (products, owner settings) shared across all cashiers
function loadGlobalState() {
  try {
    const s = cloudStorage.getItem(OWNER_GLOBAL_KEY);
    return s ? JSON.parse(s) : {};
  } catch(e) { return {}; }
}
function saveGlobalState(data) {
  try { cloudStorage.setItem(OWNER_GLOBAL_KEY, JSON.stringify(data)); } catch(e) {}
}

// =================== STATE ===================
let posState = {
  orders: [],
  orderCounter: 1,
  settings: { pin: CASHIER_PIN, cashierName: CASHIER_NAME, theme: 'dark', pinEnabled: false },
  customProducts: []
};

let cart = [];
let discountType = 'pct';
let payMethod = 'Cash';
let activePage = 'pos';

// =================== STORAGE ===================
function savePos() {
  if (!activeCashier) return;
  try { cloudStorage.setItem(getCashierStorageKey(activeCashier.id), JSON.stringify(posState)); } catch(e) {}
  // Also save products globally so all cashiers share the menu
  const global = loadGlobalState();
  global.customProducts = posState.customProducts;
  global.ownerPin = posState.settings.ownerPin;
  saveGlobalState(global);
}

function loadPos() {
  if (!activeCashier) return;
  try {
    const s = cloudStorage.getItem(getCashierStorageKey(activeCashier.id));
    if (s) posState = { ...posState, ...JSON.parse(s) };
    // Load shared products from global store
    const global = loadGlobalState();
    if (global.customProducts) posState.customProducts = global.customProducts;
    if (global.ownerPin) posState.settings.ownerPin = global.ownerPin;
  } catch(e) {}
}

// Get products from inventory app or posState custom products
function getInventoryProducts() {
  // Use custom products added in Manage Products
  const custom = posState.customProducts || [];
  try {
    const inv = localStorage.getItem(INV_KEY);
    if (inv) {
      const data = JSON.parse(inv);
      const invProds = (data.products || []).filter(p => p.name && p.price > 0);
      const customIds = new Set(custom.map(p => p.id));
      const merged = [...invProds.filter(p => !customIds.has(p.id)), ...custom];
      return merged;
    }
  } catch(e) {}
  return custom;
}


function getCategoryEmoji(cat) {
  const map = {
    'Burgers': '🍔', 'Rice Bowls': '🍚', 'Sides': '🍟', 'Drinks': '🥤',
    'Desserts': '🍰', 'Snacks': '🍿', 'Breakfast': '🍳',
    'Chicken': '🍗', 'Seafood': '🦐', 'Pasta': '🍝', 'Salads': '🥗',
    'Sandwiches': '🥪', 'Pizza': '🍕', 'Specials': '⭐'
  };
  return map[cat] || '🍽';
}

function getProductEmoji(p) {
  if (p.emoji) return p.emoji;
  return getCategoryEmoji(p.category) || '🍽';
}

// =================== INIT ===================
document.addEventListener('DOMContentLoaded', () => {
  updateDate();
  setInterval(updateDate, 60000);

  // FIX: was new Date().toISOString().split('T')[0] — that's the UTC date,
  // not the local one. In Manila (UTC+8), anything before 8:00 AM local time
  // rolled these three fields back to "yesterday" even though getLocalDateKey()
  // (used everywhere else, including inventory) correctly said "today" —
  // Order History / My Summary / Owner Summary would silently default to
  // the wrong day for the first 8 hours of every morning.
  const today = getLocalDateKey();
  const filterDate = document.getElementById('filterDate');
  const summaryDate = document.getElementById('summaryDate');
  const inventoryDate = document.getElementById('inventoryDate');
  const ownerSummaryDate = document.getElementById('ownerSummaryDate');
  if (filterDate) filterDate.value = today;
  if (summaryDate) summaryDate.value = today;
  if (inventoryDate) inventoryDate.value = today;
  if (ownerSummaryDate) ownerSummaryDate.value = today;

  // Wait for the first batch of data to arrive from Firebase before showing
  // anything that depends on cloud data (cashier list, products, etc). Without
  // this, the app would briefly render with an EMPTY cache on every fresh
  // load, then "snap" to the real data a moment later once Firestore replies.
  const startApp = () => {
    // Restore session if available, otherwise show cashier login
    try {
      const saved = localStorage.getItem('burgStreet_activeSession');
      if (saved) {
        const session = JSON.parse(saved);
        activeCashier = session;
        loadPos();
        unlockApp();
        return;
      }
    } catch(e) {}
    showCashierLogin();
  };

  if (typeof cloudStorage !== 'undefined') {
    cloudShowConnecting();
    cloudStorage.onReady(() => {
      cloudHideConnecting();
      startApp();
    });
  } else {
    // Firebase scripts didn't load (e.g. offline on first-ever visit) — fall
    // back to running on whatever is in the local cache so the app isn't dead.
    startApp();
  }
});

function updateDate() {
  const el = document.getElementById('currentDate');
  if (el) el.textContent = new Date().toLocaleDateString('en-PH', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });
  checkDateRollover();
}

// THE ACTUAL BUG: inventoryDate (and filterDate/summaryDate/ownerSummaryDate)
// only ever got set to "today" ONCE, at DOMContentLoaded. This is a PWA meant
// to be left open on a shop tablet for days at a stretch — nothing about
// normal use ever reloads the page, including switching to the Daily
// Inventory tab (showPage() just re-renders, it never resets the date input).
// So once the app is left running past midnight, that date field is frozen
// on the PREVIOUS day forever, while autoDeductIngredients()/getLocalDateKey()
// (used for every actual stock write) correctly moved on to the new day.
// Result: sales keep deducting correctly from the real "today" record, but
// the Daily Inventory page — and the "Set Opening Inventory" editor opened
// from it — keeps showing/editing the stale old day, which nobody is
// actually selling against anymore. That looks exactly like "auto-deduct
// stopped working," and any ingredient added while editing what looks like
// "today's" opening silently gets saved onto that old day instead, so it
// never shows up where the cashier expects it.
//
// Fix: once a minute (piggybacking on the existing updateDate interval),
// check whether the real calendar date has moved on. If a date field is
// still showing the date we last knew as "today," roll it forward and
// re-render. If the cashier had deliberately navigated a field to some
// other date to review a past record, we leave it alone — we only touch
// fields that still match our last-known "today," never any other date.
function checkDateRollover() {
  const realToday = getLocalDateKey();
  if (realToday === lastKnownDateKey) return;
  const staleToday = lastKnownDateKey;
  lastKnownDateKey = realToday;

  const fields = [
    { id: 'inventoryDate', onChanged: () => {
        currentShiftIndex = -1;
        if (activePage === 'inventory') renderInventory();
      } },
    { id: 'filterDate', onChanged: () => {
        if (activePage === 'orders') renderOrderHistory();
      } },
    { id: 'summaryDate', onChanged: () => {
        if (activePage === 'summary') renderSummary();
      } },
    { id: 'ownerSummaryDate', onChanged: () => {
        if (typeof renderOwnerSummary === 'function') renderOwnerSummary();
      } }
  ];
  fields.forEach(({ id, onChanged }) => {
    const el = document.getElementById(id);
    if (el && el.value === staleToday) {
      el.value = realToday;
      onChanged();
    }
  });

  // Ingredient stock limits on the New Order page key off getLocalDateKey()
  // directly rather than one of the date inputs above, but the menu grid
  // still needs a repaint now that a new day's opening inventory is active.
  if (activePage === 'pos') renderMenuGrid();
}

// =================== CASHIER LOGIN SYSTEM ===================
let cashierLoginBuffer = '';
let selectedCashierId = null;

function showCashierLogin() {
  document.getElementById('lockScreen').classList.add('hidden');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('cashierLoginScreen').classList.remove('hidden');
  cashierLoginBuffer = '';
  selectedCashierId = null;
  renderCashierList();
}

function renderCashierList() {
  const cashiers = getCashiers();
  const list = document.getElementById('cashierSelectList');
  const pinSection = document.getElementById('cashierPinSection');

  if (!cashiers.length) {
    list.innerHTML = `
      <div style="text-align:center;padding:24px 0;color:var(--text3);">
        <div style="font-size:2rem;margin-bottom:8px;">👤</div>
        <div style="font-size:0.88rem;margin-bottom:16px;">No cashiers set up yet.</div>
        <button class="btn btn-primary" onclick="enterAsOwner()" style="background:var(--orange);width:100%;max-width:240px;">
          👑 Enter as Owner
        </button>
      </div>`;
    pinSection.style.display = 'none';
    return;
  }

  list.innerHTML = cashiers.map(c => `
    <div class="cashier-select-item ${selectedCashierId === c.id ? 'selected' : ''}" onclick="selectCashier('${c.id}')">
      <div class="cashier-avatar">${c.name.charAt(0).toUpperCase()}</div>
      <div class="cashier-select-name">${escHtml(c.name)}${!c.pin ? ' <span style="font-size:0.7rem;color:var(--orange);font-weight:700;">SET PIN</span>' : ''}</div>
    </div>
  `).join('') + `
    <div style="text-align:center;margin-top:16px;padding-top:16px;border-top:1px solid var(--border);">
      <button class="btn btn-primary" onclick="enterAsOwner()" style="background:var(--orange);width:100%;max-width:240px;">
        👑 Enter as Owner
      </button>
    </div>`;

  pinSection.style.display = selectedCashierId ? 'block' : 'none';
}

function enterAsOwner() {
  // Check if an owner PIN has been set
  const global = loadGlobalState();
  const ownerPin = global.ownerPin || null;

  if (!ownerPin) {
    // No PIN set yet — enter directly (first-time setup scenario)
    _doEnterAsOwner();
    return;
  }

  // Show owner PIN prompt on the cashier login screen
  _showOwnerPinPrompt(ownerPin);
}

let _ownerPinBuffer = '';
let _ownerPinExpected = null;

function _showOwnerPinPrompt(expectedPin) {
  _ownerPinBuffer = '';
  _ownerPinExpected = expectedPin;

  let overlay = document.getElementById('ownerLoginPinOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'ownerLoginPinOverlay';
    overlay.style.cssText = [
      'position:fixed;inset:0;z-index:9999',
      'background:rgba(0,0,0,0.75)',
      'display:flex;align-items:center;justify-content:center',
    ].join(';');
    overlay.innerHTML = `
      <div style="background:var(--card-bg);border-radius:20px;padding:32px 28px;width:100%;max-width:320px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
        <div style="font-size:2rem;margin-bottom:8px;">👑</div>
        <div style="font-weight:800;font-size:1.1rem;margin-bottom:4px;">Owner Access</div>
        <div style="font-size:0.85rem;color:var(--text3);margin-bottom:20px;">Enter your Owner PIN</div>
        <div style="display:flex;gap:16px;justify-content:center;margin-bottom:16px;">
          <div class="dot" id="opd0"></div>
          <div class="dot" id="opd1"></div>
          <div class="dot" id="opd2"></div>
          <div class="dot" id="opd3"></div>
        </div>
        <p id="ownerPinLoginError" class="pin-error hidden">Incorrect PIN. Try again.</p>
        <div class="numpad">
          <button class="num-btn" onclick="_ownerLoginPin('1')">1</button>
          <button class="num-btn" onclick="_ownerLoginPin('2')">2</button>
          <button class="num-btn" onclick="_ownerLoginPin('3')">3</button>
          <button class="num-btn" onclick="_ownerLoginPin('4')">4</button>
          <button class="num-btn" onclick="_ownerLoginPin('5')">5</button>
          <button class="num-btn" onclick="_ownerLoginPin('6')">6</button>
          <button class="num-btn" onclick="_ownerLoginPin('7')">7</button>
          <button class="num-btn" onclick="_ownerLoginPin('8')">8</button>
          <button class="num-btn" onclick="_ownerLoginPin('9')">9</button>
          <button class="num-btn blank"></button>
          <button class="num-btn" onclick="_ownerLoginPin('0')">0</button>
          <button class="num-btn del-btn" onclick="_ownerLoginPinDel()">&#x232B;</button>
        </div>
        <button class="btn" onclick="_closeOwnerPinPrompt()" style="margin-top:18px;width:100%;color:var(--text3);">Cancel</button>
      </div>`;
    document.body.appendChild(overlay);
  } else {
    overlay.style.display = 'flex';
  }
  _updateOwnerPinDots();
}

function _updateOwnerPinDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById('opd' + i);
    if (dot) dot.classList.toggle('filled', i < _ownerPinBuffer.length);
  }
}

function _ownerLoginPin(digit) {
  if (_ownerPinBuffer.length >= 4) return;
  _ownerPinBuffer += digit;
  _updateOwnerPinDots();
  if (_ownerPinBuffer.length === 4) {
    setTimeout(() => {
      if (_ownerPinBuffer === _ownerPinExpected) {
        _closeOwnerPinPrompt();
        _doEnterAsOwner();
      } else {
        const errEl = document.getElementById('ownerPinLoginError');
        if (errEl) errEl.classList.remove('hidden');
        _ownerPinBuffer = '';
        _updateOwnerPinDots();
        setTimeout(() => { if (errEl) errEl.classList.add('hidden'); }, 2000);
      }
    }, 200);
  }
}

function _ownerLoginPinDel() {
  _ownerPinBuffer = _ownerPinBuffer.slice(0, -1);
  _updateOwnerPinDots();
}

function _closeOwnerPinPrompt() {
  const overlay = document.getElementById('ownerLoginPinOverlay');
  if (overlay) overlay.style.display = 'none';
  _ownerPinBuffer = '';
  _ownerPinExpected = null;
}

function _doEnterAsOwner() {
  activeCashier = { id: 'owner', name: 'Owner', pin: null };
  posState = {
    orders: [], orderCounter: 1,
    settings: { cashierName: 'Owner', theme: 'dark', pinEnabled: false },
    customProducts: []
  };
  loadPos();
  unlockApp();
  showToast('👑 Entered as Owner', 'success');
}

function selectCashier(id) {
  selectedCashierId = id;
  cashierLoginBuffer = '';
  updateCashierPinDots();
  document.getElementById('cashierPinError').classList.add('hidden');
  renderCashierList();

  const cashiers = getCashiers();
  const c = cashiers.find(x => x.id === id);
  if (!c) return;

  // No PIN set yet — enter directly and prompt to set PIN
  if (!c.pin) {
    activeCashier = c;
    posState = {
      orders: [], orderCounter: 1,
      settings: { cashierName: c.name, theme: 'dark', pinEnabled: false },
      customProducts: []
    };
    loadPos();
    unlockApp();
    showToast(`Welcome, ${c.name}! Please set your PIN in Settings.`, 'success');
    setTimeout(() => showSetPinPrompt(c), 1200);
    return;
  }

  // Has PIN — show numpad
  document.getElementById('cashierPinSection').style.display = 'block';
  document.getElementById('cashierPinLabel').textContent = `Enter PIN for ${c.name}`;
}

function showSetPinPrompt(cashier) {
  showPage('settings');
  // Show the PIN set section
  const pinSetSection = document.getElementById('pinSetSection');
  if (pinSetSection) {
    pinSetSection.style.display = 'block';
    pinSetSection.scrollIntoView({ behavior: 'smooth' });
  }
  showToast(`Hi ${cashier.name}! Set your 4-digit PIN below.`, 'success');
}

function enterCashierPin(digit) {
  if (cashierLoginBuffer.length >= 4) return;
  cashierLoginBuffer += digit;
  updateCashierPinDots();
  if (cashierLoginBuffer.length === 4) {
    setTimeout(() => {
      const cashiers = getCashiers();
      const c = cashiers.find(x => x.id === selectedCashierId);
      if (!c) return;
      if (cashierLoginBuffer === c.pin) {
        activeCashier = c;
        posState = {
          orders: [], orderCounter: 1,
          settings: { pin: c.pin, cashierName: c.name, theme: 'dark', pinEnabled: true },
          customProducts: []
        };
        loadPos();
        unlockApp();
        showToast(`Welcome, ${c.name}! 👋`, 'success');
      } else {
        document.getElementById('cashierPinError').classList.remove('hidden');
        cashierLoginBuffer = '';
        updateCashierPinDots();
        setTimeout(() => document.getElementById('cashierPinError').classList.add('hidden'), 2000);
      }
    }, 200);
  }
}

function deleteCashierPin() {
  cashierLoginBuffer = cashierLoginBuffer.slice(0, -1);
  updateCashierPinDots();
}

function updateCashierPinDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById('cd' + i);
    if (dot) dot.classList.toggle('filled', i < cashierLoginBuffer.length);
  }
}

// =================== LOCK SCREEN ===================
let pinBuffer = '';

function enterPin(digit) {
  if (pinBuffer.length >= 4) return;
  pinBuffer += digit;
  updatePinDots();
  if (pinBuffer.length === 4) {
    setTimeout(() => {
      const pin = posState.settings.pin || CASHIER_PIN;
      if (pinBuffer === pin) {
        unlockApp();
        showToast(`Welcome, ${posState.settings.cashierName || CASHIER_NAME}! 👋`, 'success');
      } else {
        document.getElementById('pinError').classList.remove('hidden');
        pinBuffer = '';
        updatePinDots();
        setTimeout(() => document.getElementById('pinError').classList.add('hidden'), 2000);
      }
    }, 200);
  }
}

function deletePin() {
  pinBuffer = pinBuffer.slice(0, -1);
  updatePinDots();
}

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById('d' + i);
    if (dot) dot.classList.toggle('filled', i < pinBuffer.length);
  }
}

function unlockApp() {
  pinBuffer = '';
  // Save session so page refresh doesn't require PIN again
  if (activeCashier) {
    try { localStorage.setItem('burgStreet_activeSession', JSON.stringify({ id: activeCashier.id, name: activeCashier.name, pin: activeCashier.pin })); } catch(e) {}
  }
  document.getElementById('lockScreen').classList.add('hidden');
  document.getElementById('cashierLoginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  const name = activeCashier ? activeCashier.name : (posState.settings.cashierName || CASHIER_NAME);
  document.getElementById('cashierName').textContent = name;
  updateOrderNum();
  buildMenuGrid();
  updateTotals();
  renderOrderHistory();
  renderSummary();
  refreshProductList();
  refreshSettingsPage();
  renderDeliveryLog();
  renderCashAdvanceLog();
  renderExpenseLog();
}

function logOut() {
  document.getElementById('lockScreen').classList.add('hidden');
  document.getElementById('app').classList.add('hidden');
  activeCashier = null;
  try { localStorage.removeItem('burgStreet_activeSession'); } catch(e) {}
  showCashierLogin();
}

// =================== NAVIGATION ===================
function showPage(page) {
  activePage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');

  document.querySelectorAll(`[data-page="${page}"]`).forEach(n => n.classList.add('active'));

  const titles = { pos: 'New Order', orders: 'Order History', summary: 'My Summary', products: 'Manage Products', settings: 'Settings', inventory: 'Daily Inventory', debugdata: 'Debug Data' };
  document.getElementById('pageTitle').textContent = titles[page] || page;

  // Float cart only visible on New Order page
  const floatBtn = document.getElementById('floatCartBtn');
  if (floatBtn) floatBtn.classList.toggle('float-cart-hidden', page !== 'pos');

  // ALWAYS scroll back to top when switching pages
  const pc = document.getElementById('pageContent');
  if (pc) pc.scrollTop = 0;
  if (pageEl) pageEl.scrollTop = 0;

  closeSidebar();

  if (page === 'orders') renderOrderHistory();
  if (page === 'summary') renderSummary();
  if (page === 'products') refreshProductList();
  if (page === 'settings') refreshSettingsPage();
  if (page === 'inventory') { currentShiftIndex = -1; renderInventory(); renderDeliveryLog(); renderCashAdvanceLog(); renderExpenseLog(); }
  if (page === 'debugdata') { renderDebugData(); }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('active');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('active');
}

// =================== MENU GRID ===================
let allProducts = [];
let activeCategory = 'All';

function buildMenuGrid() {
  allProducts = getInventoryProducts();
  buildCategoryTabs();
  renderMenuGrid();
}

function buildCategoryTabs() {
  const cats = ['All', ...new Set(allProducts.map(p => p.category || 'Other').filter(Boolean))];
  const tabsEl = document.getElementById('categoryTabs');
  tabsEl.innerHTML = cats.map((c, i) =>
    `<button class="cat-tab ${i === 0 ? 'active' : ''}" onclick="filterByCategory('${c}', this)">${c === 'All' ? 'All' : (getCategoryEmoji(c) + ' ' + c)}</button>`
  ).join('');
}

function filterByCategory(cat, btn) {
  activeCategory = cat;
  document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderMenuGrid();
}

function filterMenu() {
  renderMenuGrid();
}

function renderMenuGrid() {
  const search = (document.getElementById('menuSearch')?.value || '').toLowerCase();
  let products = allProducts;

  if (activeCategory !== 'All') {
    products = products.filter(p => (p.category || 'Other') === activeCategory);
  }
  if (search) {
    products = products.filter(p => p.name.toLowerCase().includes(search));
  }

  const grid = document.getElementById('menuGrid');
  if (!products.length) {
    grid.innerHTML = `<div class="empty-menu"><span class="empty-icon">🔍</span>No items found.</div>`;
    return;
  }

  const baseStock = getIngredientStockMap();

  grid.innerHTML = products.map(p => {
    const cartItem = cart.find(i => i.id == p.id);
    const qty = cartItem ? cartItem.qty : 0;
    const inCart = qty > 0;

    // Stock that would remain if we exclude what THIS product already has in
    // cart (so its own "can I add one more" check doesn't double-subtract).
    const netStock = getStockMapMinusCart(baseStock, p.id);
    // addableMore = TOTAL capacity from net stock, minus what's already in
    // the cart for this product (see getRemainingAddable for why this
    // subtraction is required — without it the limit never engages).
    const addableMore = getMaxAddable(p, netStock) - qty;
    const outOfStock = addableMore <= 0; // can't add even one more unit
    const soldOutEntirely = outOfStock && !inCart; // never had any in cart either

    return `
    <div class="menu-item ${inCart ? 'in-cart' : ''} ${soldOutEntirely ? 'out-of-stock' : ''}" id="mc_${p.id}">
      ${soldOutEntirely ? '<span class="menu-item-soldout-badge">Out of Stock</span>' : ''}
      <div class="menu-item-tap" onclick="${soldOutEntirely ? '' : `menuCardQty('${p.id}', 1)`}">
        <span class="menu-item-name">${escHtml(p.name)}</span>
        <span class="menu-item-price">₱${fmt(p.price)}</span>
        <span class="menu-item-cat">${escHtml(p.category || '')}</span>
      </div>
      <div class="menu-item-qty-row">
        <button class="miq-btn miq-minus ${inCart ? '' : 'miq-zero'}" onclick="menuCardQty('${p.id}', -1)">−</button>
        <span class="miq-count ${inCart ? 'miq-active' : ''}" id="miq_${p.id}">${qty}</span>
        <button class="miq-btn miq-plus ${outOfStock ? 'miq-disabled' : ''}" onclick="menuCardQty('${p.id}', 1)">+</button>
      </div>
    </div>
  `}).join('');
}

// =================== CART ===================
function addToCart(productId) {
  const p = allProducts.find(x => x.id == productId);
  if (!p) return;
  const existing = cart.find(i => i.id == productId);

  const remainingAddable = getRemainingAddable(p);
  if (remainingAddable <= 0) {
    showToast(`🚫 ${p.name} is out of stock (ingredients depleted)`, 'error');
    return;
  }

  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ id: p.id, name: p.name, price: p.price, qty: 1, emoji: getProductEmoji(p) });
  }
  const newQty = cart.find(i => i.id == productId)?.qty || 0;
  updateCardDisplay(productId, newQty);
  renderCart();
  updateTotals();
  updateFloatCartBadge();
  refreshStockLimits();
}

function menuCardQty(productId, delta) {
  const p = allProducts.find(x => x.id == productId);
  if (!p) return;

  const existing = cart.find(i => i.id == productId);

  if (delta > 0) {
    const remainingAddable = getRemainingAddable(p);
    if (remainingAddable <= 0) {
      showToast(`🚫 ${p.name} is out of stock (ingredients depleted)`, 'error');
      return;
    }
  }

  if (existing) {
    existing.qty += delta;
    if (existing.qty <= 0) {
      // Remove from cart
      cart = cart.filter(i => i.id !== productId);
      updateCardDisplay(productId, 0);
      renderCart();
      updateTotals();
      updateFloatCartBadge();
      refreshStockLimits();
      return;
    }
  } else {
    if (delta <= 0) return; // Can't go below 0 if not in cart
    cart.push({ id: p.id, name: p.name, price: p.price, qty: 1, emoji: getProductEmoji(p) });
  }

  const newQty = cart.find(i => i.id == productId)?.qty || 0;
  updateCardDisplay(productId, newQty);
  renderCart();
  updateTotals();
  updateFloatCartBadge();
  refreshStockLimits();
}

// Update a single card's qty display WITHOUT re-rendering the whole grid
function updateCardDisplay(productId, qty) {
  const card = document.getElementById('mc_' + productId);
  if (!card) return;

  const countEl = document.getElementById('miq_' + productId);
  if (countEl) {
    countEl.textContent = qty;
    countEl.classList.toggle('miq-active', qty > 0);
  }

  // Toggle minus button disabled state
  const minusBtn = card.querySelector('.miq-minus');
  if (minusBtn) {
    minusBtn.classList.toggle('miq-zero', qty === 0);
  }

  // Highlight card when item is in cart
  card.classList.toggle('in-cart', qty > 0);
}

// Re-check stock availability for every visible card and update the plus
// button / "Out of Stock" badge accordingly. Needed because adding or
// removing one product can affect how much is left of a shared ingredient,
// which changes whether OTHER products on the grid are still addable.
function refreshStockLimits() {
  const baseStock = getIngredientStockMap();
  document.querySelectorAll('.menu-item').forEach(card => {
    const id = card.id.replace('mc_', '');
    const p = allProducts.find(x => x.id == id);
    if (!p) return;

    const cartItem = cart.find(i => i.id == p.id);
    const inCart = !!cartItem && cartItem.qty > 0;

    const netStock = getStockMapMinusCart(baseStock, p.id);
    const currentQty = inCart ? cartItem.qty : 0;
    const addableMore = getMaxAddable(p, netStock) - currentQty;
    const outOfStock = addableMore <= 0;
    const soldOutEntirely = outOfStock && !inCart;

    const plusBtn = card.querySelector('.miq-plus');
    if (plusBtn) plusBtn.classList.toggle('miq-disabled', outOfStock);

    card.classList.toggle('out-of-stock', soldOutEntirely);

    const tap = card.querySelector('.menu-item-tap');
    if (tap) tap.setAttribute('onclick', soldOutEntirely ? '' : `menuCardQty('${p.id}', 1)`);

    let badge = card.querySelector('.menu-item-soldout-badge');
    if (soldOutEntirely && !badge) {
      badge = document.createElement('span');
      badge.className = 'menu-item-soldout-badge';
      badge.textContent = 'Out of Stock';
      card.prepend(badge);
    } else if (!soldOutEntirely && badge) {
      badge.remove();
    }
  });
}

function removeFromCart(id) {
  cart = cart.filter(i => i.id !== id);
  updateCardDisplay(id, 0); // Reset card counter
  renderCart();
  updateTotals();
  updateFloatCartBadge();
  refreshStockLimits();
}

function changeQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;

  if (delta > 0) {
    const p = allProducts.find(x => x.id == id);
    if (p && getRemainingAddable(p) <= 0) {
      showToast(`🚫 ${p.name} is out of stock (ingredients depleted)`, 'error');
      return;
    }
  }

  item.qty += delta;
  if (item.qty <= 0) { removeFromCart(id); return; }
  renderCart();
  updateTotals();
  updateCardDisplay(id, item.qty);
  refreshStockLimits();
}

function setQty(id, val) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  const q = parseInt(val) || 0;
  if (q <= 0) { removeFromCart(id); return; }

  const p = allProducts.find(x => x.id == id);
  if (p) {
    // Max this item can be set to = current qty + however many more are addable
    const maxAddableMore = getRemainingAddable(p);
    if (maxAddableMore !== Infinity) {
      const maxTotal = item.qty + maxAddableMore;
      if (q > maxTotal) {
        showToast(`🚫 Only ${maxTotal} ${p.name} available (ingredients limited)`, 'error');
        item.qty = maxTotal;
        renderCart();
        updateTotals();
        updateFloatCartBadge();
        updateCardDisplay(id, item.qty);
        refreshStockLimits();
        return;
      }
    }
  }

  item.qty = q;
  updateTotals();
  updateFloatCartBadge();
  updateCardDisplay(id, item.qty);
  refreshStockLimits();
}

function renderCart() {
  const list = document.getElementById('orderItemsList');
  const emptyEl = document.getElementById('orderEmpty');

  if (!cart.length) {
    list.innerHTML = `<div class="order-empty" id="orderEmpty"><span class="order-empty-icon">🛒</span><span>Tap a menu item to add it</span></div>`;
    return;
  }

  list.innerHTML = cart.map(item => `
    <div class="order-item">
      <span class="oi-emoji">${item.emoji}</span>
      <div class="oi-info">
        <div class="oi-name">${escHtml(item.name)}</div>
        <div class="oi-unit">₱${fmt(item.price)} each</div>
      </div>
      <div class="oi-qty-ctrl">
        <button class="oi-qty-btn" onclick="changeQty('${item.id}', -1)">−</button>
        <input type="number" class="oi-qty-val" value="${item.qty}" min="1" onchange="setQty('${item.id}', this.value)" />
        <button class="oi-qty-btn" onclick="changeQty('${item.id}', 1)">+</button>
      </div>
      <span class="oi-price">₱${fmt(item.price * item.qty)}</span>
      <button class="oi-del" onclick="removeFromCart('${item.id}')">✕</button>
    </div>
  `).join('');
}

function updateFloatCartBadge() {
  const total = cart.reduce((s, i) => s + i.qty, 0);
  const badge = document.getElementById('cartCount');
  if (badge) {
    badge.textContent = total;
    badge.classList.toggle('hidden', total === 0);
  }
}

// =================== TOTALS ===================
function getSubtotal() {
  return cart.reduce((s, i) => s + i.price * i.qty, 0);
}

function getDiscount(subtotal) {
  const val = parseFloat(document.getElementById('discountVal')?.value) || 0;
  if (val <= 0) return 0;
  if (discountType === 'pct') return Math.min(subtotal * val / 100, subtotal);
  return Math.min(val, subtotal);
}

function getTotal() {
  const sub = getSubtotal();
  return Math.max(0, sub - getDiscount(sub));
}

function updateTotals() {
  const sub = getSubtotal();
  const disc = getDiscount(sub);
  const total = Math.max(0, sub - disc);

  document.getElementById('subtotalDisplay').textContent = '₱' + fmt(sub);
  document.getElementById('discountAmtDisplay').textContent = '-₱' + fmt(disc);
  document.getElementById('totalDisplay').textContent = '₱' + fmt(total);
  document.getElementById('chargeBtn').textContent = `CHARGE ₱${fmt(total)}`;
  document.getElementById('chargeBtn').disabled = cart.length === 0;

  // Show/hide discount amount row
  const discRow = document.getElementById('discountRow');
  if (discRow) discRow.style.display = disc > 0 ? '' : 'none';

  // Update item count badge
  const totalItems = cart.reduce((s, i) => s + i.qty, 0);
  const countEl = document.getElementById('cartItemCount');
  if (countEl) countEl.textContent = totalItems > 0 ? `${totalItems} item${totalItems > 1 ? 's' : ''}` : '';

  updateChange();
}

function updateChange() {
  const total = getTotal();
  const cash = parseFloat(document.getElementById('cashTendered')?.value) || 0;
  const change = cash - total;
  const changeEl = document.getElementById('changeDisplay');
  const changeAmt = document.getElementById('changeAmount');

  if (payMethod !== 'Cash') {
    if (changeEl) changeEl.style.display = 'none';
    return;
  }
  if (changeEl) changeEl.style.display = '';

  if (changeAmt) {
    changeAmt.textContent = change >= 0 ? '₱' + fmt(change) : '-₱' + fmt(Math.abs(change));
  }
  if (changeEl) {
    changeEl.classList.toggle('insufficient', cash > 0 && change < 0);
  }
}

function setDiscountType(type) {
  discountType = type;
  document.getElementById('discPct').classList.toggle('active', type === 'pct');
  document.getElementById('discFixed').classList.toggle('active', type === 'fixed');
  updateTotals();
}

function setQuickCash(amount) {
  document.getElementById('cashTendered').value = amount;
  updateChange();
}

function setExactCash() {
  document.getElementById('cashTendered').value = getTotal().toFixed(2);
  updateChange();
}

function selectPayMethod(method, btn) {
  payMethod = method;
  document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const cashSection = document.getElementById('cashSection');
  if (cashSection) cashSection.style.display = method === 'Cash' ? '' : 'none';
  updateChange();
}

// =================== ORDER NUM ===================
function updateOrderNum() {
  const num = String(posState.orderCounter).padStart(3, '0');
  const label = document.getElementById('orderNumLabel');
  const topbarLabel = document.getElementById('topbarOrderNum');
  if (label) label.textContent = `Order #${num}`;
  if (topbarLabel) topbarLabel.textContent = `#${num}`;
}

// =================== PROCESS PAYMENT ===================
// Final safety check before finalizing a sale: re-verify every cart line
// against current ingredient stock (in case stock changed since items were
// added — e.g. another cashier/device, or an inventory edit mid-order).
// Returns null if OK, or an error message string if something can't be sold.
function validateCartAgainstStock() {
  const baseStock = getIngredientStockMap();

  // Accumulate total needed per ingredient across the whole cart, then
  // compare against what's actually available.
  const needed = {};
  for (const item of cart) {
    const product = allProducts.find(p => p.id == item.id);
    if (!product || !product.recipe || !product.recipe.length) {
      // No recipe linked = no stock to sell from, block the whole order.
      return `${item.name} has no ingredients/recipe set up and cannot be sold yet. Please link its recipe in Manage Products.`;
    }
    for (const r of product.recipe) {
      const key = (r.ingredient || '').trim().toLowerCase();
      needed[key] = (needed[key] || 0) + (r.qty || 1) * item.qty;
    }
  }

  for (const key in needed) {
    const available = Object.prototype.hasOwnProperty.call(baseStock, key) ? baseStock[key] : 0;
    if (needed[key] > available) {
      return `Not enough stock to complete this order — an ingredient ran out. Please adjust quantities.`;
    }
  }
  return null;
}

function processPayment() {
  if (!cart.length) return;

  const stockError = validateCartAgainstStock();
  if (stockError) {
    showToast(`🚫 ${stockError}`, 'error');
    renderMenuGrid();
    return;
  }

  const total = getTotal();
  const cash = parseFloat(document.getElementById('cashTendered')?.value) || 0;

  if (payMethod === 'Cash' && cash < total) {
    showToast('Insufficient cash tendered!', 'error');
    return;
  }

  const change = payMethod === 'Cash' ? cash - total : 0;
  const order = {
    id: posState.orderCounter,
    orderNum: String(posState.orderCounter).padStart(3, '0'),
    date: new Date().toISOString(),
    items: JSON.parse(JSON.stringify(cart)),
    subtotal: getSubtotal(),
    discountType,
    discountVal: parseFloat(document.getElementById('discountVal')?.value) || 0,
    discountAmt: getDiscount(getSubtotal()),
    total,
    payMethod,
    cashTendered: payMethod === 'Cash' ? cash : total,
    change,
    cashier: posState.settings.cashierName || CASHIER_NAME
  };

  posState.orders.push(order);
  posState.orderCounter++;
  savePos();

  // === AUTO-DEDUCT INGREDIENTS FROM TODAY'S INVENTORY ===
  autoDeductIngredients(order.items);

  showReceipt(order);
  clearOrder();
  updateOrderNum();
  showToast('✅ Payment successful!', 'success');
}

function clearOrder() {
  // Reset all card displays before clearing cart
  cart.forEach(item => updateCardDisplay(item.id, 0));
  cart = [];
  renderCart();
  updateTotals();
  updateFloatCartBadge();
  document.getElementById('discountVal').value = 0;
  document.getElementById('cashTendered').value = '';
  updateChange();
}

// Reconciles ingredient usedQty when a PAID order's items are edited
// (qty changed, item added, or item removed) after the original
// autoDeductIngredients() deduction already ran. Computes the net
// ingredient delta between the original and edited item lists and applies
// only that difference — giving back ingredients for removed/reduced
// quantities, and deducting extra for added/increased quantities.
function adjustIngredientsForOrderEdit(originalItems, newItems) {
  try {
    const dateKey = getLocalDateKey();
    const data = loadInventoryData();
    if (!data[dateKey]) return;
    const activeShift = getActiveShift(dateKey, data);
    if (!activeShift || !activeShift.opening || !activeShift.opening.ingredients || !activeShift.opening.ingredients.length) return;

    const openingIngs = activeShift.opening.ingredients;
    openingIngs.forEach(ing => { if (ing.usedQty === undefined) ing.usedQty = 0; });

    // Net delta per ingredient: positive = needs MORE deducted, negative = give some back.
    const delta = {};
    const addNeeded = (items, sign) => {
      items.forEach(item => {
        // BUGFIX: look up the product the SAME way the menu grid and stock
        // validation do (allProducts — see validateCartAgainstStock), not
        // just posState.customProducts. getInventoryProducts() merges in
        // products from an older, separate inventory store (INV_KEY) that
        // are sellable from the menu and pass stock validation, but were
        // invisible here — so selling them silently deducted nothing,
        // even though the sale itself went through fine. Fall back to
        // posState.customProducts only if allProducts isn't populated yet.
        const product = (typeof allProducts !== 'undefined' && allProducts.length
          ? allProducts
          : (posState.customProducts || [])
        ).find(p => p.id == item.id);
        if (!product || !product.recipe || !product.recipe.length) return;
        product.recipe.forEach(r => {
          const key = (r.ingredient || '').trim().toLowerCase();
          if (!key) return;
          delta[key] = (delta[key] || 0) + sign * (r.qty || 1) * item.qty;
        });
      });
    };
    addNeeded(newItems, +1);
    addNeeded(originalItems, -1);

    let changed = false;
    Object.keys(delta).forEach(key => {
      if (!delta[key]) return;
      const ing = openingIngs.find(i => (i.name || '').trim().toLowerCase() === key);
      if (!ing) return;
      if (delta[key] > 0) {
        // Need to deduct more — cap at what's actually available so usedQty
        // never exceeds opening qty (matches autoDeductIngredients' safety cap).
        const available = Math.max(0, (ing.qty || 0) - (ing.usedQty || 0));
        ing.usedQty = (ing.usedQty || 0) + Math.min(delta[key], available);
      } else {
        // Give ingredients back, never going below 0 used.
        ing.usedQty = Math.max(0, (ing.usedQty || 0) + delta[key]);
      }
      changed = true;
    });

    if (changed) {
      saveInventoryData(data);
      if (document.getElementById('invOpeningList')) renderInventory();
    }
  } catch(e) {
    console.warn('adjustIngredientsForOrderEdit error:', e);
  }
}

// =================== AUTO-DEDUCT INVENTORY ===================
function autoDeductIngredients(soldItems) {
  try {
    const dateKey = getLocalDateKey();
    const data = loadInventoryData();
    if (!data[dateKey]) return;
    const activeShift = getActiveShift(dateKey, data);
    if (!activeShift || !activeShift.opening || !activeShift.opening.ingredients || !activeShift.opening.ingredients.length) return;

    const openingIngs = activeShift.opening.ingredients;
    openingIngs.forEach(ing => { if (ing.usedQty === undefined) ing.usedQty = 0; });

    let changed = false;
    soldItems.forEach(item => {
      // BUGFIX: same as adjustIngredientsForOrderEdit above — use allProducts
      // (the merged list the menu grid actually sells from) so any product
      // that came from the legacy INV_KEY merge in getInventoryProducts()
      // is found here too. Previously this only checked
      // posState.customProducts, so a sale of a merged-in product passed
      // stock validation and completed normally, but deducted ZERO
      // ingredients — looking exactly like "the sale wasn't recorded".
      const product = (typeof allProducts !== 'undefined' && allProducts.length
        ? allProducts
        : (posState.customProducts || [])
      ).find(p => p.id == item.id);
      if (!product || !product.recipe || !product.recipe.length) return;
      product.recipe.forEach(recipeItem => {
        const totalDeduct = recipeItem.qty * item.qty;
        const ing = openingIngs.find(i => (i.name || '').trim().toLowerCase() === (recipeItem.ingredient || '').trim().toLowerCase());
        if (ing) {
          const available = Math.max(0, (ing.qty || 0) - (ing.usedQty || 0));
          ing.usedQty = (ing.usedQty || 0) + Math.min(totalDeduct, available);
          changed = true;
        }
      });
    });

    if (changed) {
      saveInventoryData(data);
      // If the Daily Inventory page is currently open, refresh it immediately
      // so the live remaining-stock numbers update right after this sale,
      // without requiring a manual page switch/reload.
      if (document.getElementById('invOpeningList')) renderInventory();
    }
  } catch(e) {
    console.warn('autoDeductIngredients error:', e);
  }
}

// Helper: get remaining stock for an ingredient in the active shift today
function getRemainingStock(ingredientName) {
  try {
    const dateKey = getLocalDateKey();
    const data = loadInventoryData();
    const activeShift = getActiveShift(dateKey, data);
    const ing = (activeShift?.opening?.ingredients || []).find(
      i => (i.name || '').trim().toLowerCase() === (ingredientName || '').trim().toLowerCase()
    );
    if (!ing) return null;
    return Math.max(0, (ing.qty || 0) - (ing.usedQty || 0));
  } catch(e) { return null; }
}

// =================== STOCK LIMIT CHECKS (NEW ORDER PAGE) ===================
// A product is only "limited" if it has a recipe (linked ingredients) AND
// today's shift has ingredient records. Products with no recipe are treated
// as unlimited (no inventory tracking configured for them), so this never
// blocks items that were never meant to be stock-tracked.
//
// Remaining stock per ingredient = opening qty - usedQty (already deducted
// from past completed sales today) - qty already sitting in the cart for
// items that haven't been paid yet (since autoDeductIngredients only runs
// AFTER payment, cart contents must be subtracted here too or the cashier
// could add far more than is actually in stock before checking out).
function getIngredientStockMap() {
  try {
    const dateKey = getLocalDateKey();
    const data = loadInventoryData();
    const activeShift = getActiveShift(dateKey, data);
    const openingIngs = activeShift?.opening?.ingredients || [];
    const map = {};
    openingIngs.forEach(ing => {
      const key = (ing.name || '').trim().toLowerCase();
      if (!key) return;
      map[key] = Math.max(0, (ing.qty || 0) - (ing.usedQty || 0));
    });
    return map; // always an object now — never null — so missing ingredients = 0 stock, not "unlimited"
  } catch(e) { return {}; }
}

// How many more units of this product can be added to the cart right now,
// given remaining ingredient stock and what's already in the cart.
// A recipe ingredient with no recorded stock (or zero stock) blocks the sale —
// missing/empty inventory means zero, never "unlimited".
