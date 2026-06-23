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


// =================== CASHIER/SHIFT STATE ===================
let activeCashier = null; // { id, name, pin }

function getCashiers() {
  try { return JSON.parse(localStorage.getItem(CASHIERS_KEY)) || []; } catch(e) { return []; }
}
function saveCashiers(list) {
  try { localStorage.setItem(CASHIERS_KEY, JSON.stringify(list)); } catch(e) {}
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
    const s = localStorage.getItem(OWNER_GLOBAL_KEY);
    return s ? JSON.parse(s) : {};
  } catch(e) { return {}; }
}
function saveGlobalState(data) {
  try { localStorage.setItem(OWNER_GLOBAL_KEY, JSON.stringify(data)); } catch(e) {}
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
  try { localStorage.setItem(getCashierStorageKey(activeCashier.id), JSON.stringify(posState)); } catch(e) {}
  // Also save products globally so all cashiers share the menu
  const global = loadGlobalState();
  global.customProducts = posState.customProducts;
  global.ownerPin = posState.settings.ownerPin;
  saveGlobalState(global);
}

function loadPos() {
  if (!activeCashier) return;
  try {
    const s = localStorage.getItem(getCashierStorageKey(activeCashier.id));
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

  const today = new Date().toISOString().split('T')[0];
  const filterDate = document.getElementById('filterDate');
  const summaryDate = document.getElementById('summaryDate');
  const inventoryDate = document.getElementById('inventoryDate');
  const ownerSummaryDate = document.getElementById('ownerSummaryDate');
  if (filterDate) filterDate.value = today;
  if (summaryDate) summaryDate.value = today;
  if (inventoryDate) inventoryDate.value = getLocalDateKey();
  if (ownerSummaryDate) ownerSummaryDate.value = today;

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
});

function updateDate() {
  const el = document.getElementById('currentDate');
  if (el) el.textContent = new Date().toLocaleDateString('en-PH', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });
}

