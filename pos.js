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

  // Always show cashier login first
  showCashierLogin();
});

function updateDate() {
  const el = document.getElementById('currentDate');
  if (el) el.textContent = new Date().toLocaleDateString('en-PH', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });
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
  `).join('');

  pinSection.style.display = selectedCashierId ? 'block' : 'none';
}

function enterAsOwner() {
  // Enter app as owner with no cashier selected — full access
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
}

function logOut() {
  document.getElementById('lockScreen').classList.add('hidden');
  document.getElementById('app').classList.add('hidden');
  activeCashier = null;
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

  const titles = { pos: 'New Order', orders: 'Order History', summary: 'My Summary', products: 'Manage Products', settings: 'Settings', inventory: 'Daily Inventory', reports: 'Inventory Totals' };
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
  if (page === 'inventory') { renderInventory(); renderDeliveryLog(); renderCashAdvanceLog(); }
  if (page === 'reports') { renderReports(); }
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

  grid.innerHTML = products.map(p => {
    const cartItem = cart.find(i => i.id == p.id);
    const qty = cartItem ? cartItem.qty : 0;
    const inCart = qty > 0;
    return `
    <div class="menu-item ${inCart ? 'in-cart' : ''}" id="mc_${p.id}">
      <div class="menu-item-tap" onclick="menuCardQty('${p.id}', 1)">
        <span class="menu-item-name">${escHtml(p.name)}</span>
        <span class="menu-item-price">₱${fmt(p.price)}</span>
        <span class="menu-item-cat">${escHtml(p.category || '')}</span>
      </div>
      <div class="menu-item-qty-row">
        <button class="miq-btn miq-minus ${inCart ? '' : 'miq-zero'}" onclick="menuCardQty('${p.id}', -1)">−</button>
        <span class="miq-count ${inCart ? 'miq-active' : ''}" id="miq_${p.id}">${qty}</span>
        <button class="miq-btn miq-plus" onclick="menuCardQty('${p.id}', 1)">+</button>
      </div>
    </div>
  `}).join('');
}

// =================== CART ===================
function addToCart(productId) {
  const p = allProducts.find(x => x.id == productId);
  if (!p) return;
  const existing = cart.find(i => i.id == productId);
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
}

function menuCardQty(productId, delta) {
  const p = allProducts.find(x => x.id == productId);
  if (!p) return;

  const existing = cart.find(i => i.id == productId);
  if (existing) {
    existing.qty += delta;
    if (existing.qty <= 0) {
      // Remove from cart
      cart = cart.filter(i => i.id !== productId);
      updateCardDisplay(productId, 0);
      renderCart();
      updateTotals();
      updateFloatCartBadge();
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

function removeFromCart(id) {
  cart = cart.filter(i => i.id !== id);
  updateCardDisplay(id, 0); // Reset card counter
  renderCart();
  updateTotals();
  updateFloatCartBadge();
}

function changeQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) { removeFromCart(id); return; }
  renderCart();
  updateTotals();
}

function setQty(id, val) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  const q = parseInt(val) || 0;
  if (q <= 0) { removeFromCart(id); return; }
  item.qty = q;
  updateTotals();
  updateFloatCartBadge();
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
function processPayment() {
  if (!cart.length) return;

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
      const product = (posState.customProducts || []).find(p => p.id === item.id);
      if (!product || !product.recipe || !product.recipe.length) return;
      product.recipe.forEach(recipeItem => {
        const totalDeduct = recipeItem.qty * item.qty;
        const ing = openingIngs.find(i => i.name.toLowerCase() === recipeItem.ingredient.toLowerCase());
        if (ing) {
          const available = Math.max(0, (ing.qty || 0) - (ing.usedQty || 0));
          ing.usedQty = (ing.usedQty || 0) + Math.min(totalDeduct, available);
          changed = true;
        }
      });
    });

    if (changed) saveInventoryData(data);
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
      i => i.name.toLowerCase() === ingredientName.toLowerCase()
    );
    if (!ing) return null;
    return Math.max(0, (ing.qty || 0) - (ing.usedQty || 0));
  } catch(e) { return null; }
}

function confirmClearOrder() {
  if (!cart.length) return;
  showConfirm('Clear Order?', 'Remove all items from the current order?', () => {
    clearOrder();
    closeModal('confirmModal');
  });
}

// =================== RECEIPT ===================
function showReceipt(order) {
  const modal = document.getElementById('receiptModal');
  const body = document.getElementById('receiptBody');

  const date = new Date(order.date);
  const timeStr = date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  const dateStr = date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

  body.innerHTML = `
    <div class="receipt-header">
      <div class="receipt-biz-name">${BIZ_NAME}</div>
      <div class="receipt-sub">POS Cashier Receipt</div>
      <div class="receipt-sub">${dateStr} — ${timeStr}</div>
      <div class="receipt-sub">Order #${order.orderNum} | Cashier: ${escHtml(order.cashier)}</div>
    </div>
    <div class="receipt-items">
      ${order.items.map(i => `
        <div class="receipt-item">
          <span class="receipt-item-name">${escHtml(i.name)}</span>
          <span class="receipt-item-qty">×${i.qty}</span>
          <span class="receipt-item-price">₱${fmt(i.price * i.qty)}</span>
        </div>
      `).join('')}
    </div>
    <hr class="receipt-divider" />
    <div class="receipt-summary-row"><span>Subtotal</span><span>₱${fmt(order.subtotal)}</span></div>
    ${order.discountAmt > 0 ? `<div class="receipt-summary-row"><span>Discount</span><span style="color:#ef4444">-₱${fmt(order.discountAmt)}</span></div>` : ''}
    <div class="receipt-total-row"><span>TOTAL</span><span style="color:var(--orange)">₱${fmt(order.total)}</span></div>
    ${order.payMethod === 'Cash' ? `
      <div class="receipt-summary-row"><span>Cash</span><span>₱${fmt(order.cashTendered)}</span></div>
      <div class="receipt-summary-row" style="font-weight:700;color:var(--green)"><span>Change</span><span>₱${fmt(order.change)}</span></div>
    ` : `<div class="receipt-summary-row"><span>Payment</span><span>${escHtml(order.payMethod)}</span></div>`}
    <div class="receipt-footer">
      Thank you for dining at ${BIZ_NAME}!<br>
      Please come again 😊
    </div>
  `;

  modal.classList.remove('hidden');
}

function closeReceipt() {
  document.getElementById('receiptModal').classList.add('hidden');
}

function printReceipt() {
  window.print();
}

// =================== ORDER HISTORY ===================
function renderOrderHistory() {
  const filterDate = document.getElementById('filterDate')?.value;
  let orders = posState.orders;

  if (filterDate) {
    orders = orders.filter(o => o.date.startsWith(filterDate));
  }

  const tbody = document.getElementById('orderHistoryBody');
  if (!orders.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-row">No orders found.</td></tr>`;
    return;
  }

  // Show newest first
  const sorted = [...orders].reverse();
  tbody.innerHTML = sorted.map(o => {
    const date = new Date(o.date);
    const timeStr = date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
    const itemsSummary = o.items.map(i => `${i.name}×${i.qty}`).join(', ');
    return `
      <tr>
        <td><strong style="color:var(--orange)">#${o.orderNum}</strong></td>
        <td>${timeStr}</td>
        <td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:0.8rem">${escHtml(itemsSummary)}</td>
        <td><span class="badge badge-blue">${escHtml(o.payMethod)}</span></td>
        <td><strong style="color:var(--green)">₱${fmt(o.total)}</strong></td>
        <td>${o.payMethod === 'Cash' ? '₱' + fmt(o.change) : '—'}</td>
        <td><span class="badge badge-green">Paid</span></td>
        <td><button class="btn-eye" onclick="viewOrder(${o.id})" title="View & Edit Order">👁</button></td>
      </tr>
    `;
  }).join('');
}

function clearDateFilter() {
  const filterDate = document.getElementById('filterDate');
  if (filterDate) filterDate.value = '';
  renderOrderHistory();
}

// =================== SUMMARY ===================
function renderSummary() {
  const summaryDate = document.getElementById('summaryDate')?.value || new Date().toISOString().split('T')[0];
  const orders = posState.orders.filter(o => o.date.startsWith(summaryDate));

  const totalSales = orders.reduce((s, o) => s + o.total, 0);
  const count = orders.length;
  const avg = count > 0 ? totalSales / count : 0;

  // Cash advances for this date
  const caTotal = (posState.cashAdvances || [])
    .filter(a => a.datetime.startsWith(summaryDate))
    .reduce((s, a) => s + (a.amount || 0), 0);
  const netSales = Math.max(0, totalSales - caTotal);

  document.getElementById('summaryIncome').textContent = '₱' + fmt(totalSales);
  document.getElementById('summaryOrders').textContent = count;
  document.getElementById('summaryAvg').textContent = '₱' + fmt(avg);

  const caEl = document.getElementById('summaryCashAdv');
  const netEl = document.getElementById('summaryNet');
  if (caEl) caEl.textContent = caTotal > 0 ? '-₱' + fmt(caTotal) : '₱0.00';
  if (netEl) netEl.textContent = '₱' + fmt(netSales);

  // Top items
  const itemMap = {};
  orders.forEach(o => {
    o.items.forEach(i => {
      if (!itemMap[i.name]) itemMap[i.name] = { qty: 0, total: 0, emoji: i.emoji };
      itemMap[i.name].qty += i.qty;
      itemMap[i.name].total += i.price * i.qty;
    });
  });

  const topItems = Object.entries(itemMap).sort((a, b) => b[1].qty - a[1].qty).slice(0, 6);
  const topEl = document.getElementById('topItemsList');
  if (!topItems.length) {
    topEl.innerHTML = `<p style="color:var(--text3);font-size:0.88rem;text-align:center;padding:24px 0;">No sales data yet.</p>`;
  } else {
    topEl.innerHTML = topItems.map(([name, data], i) => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:1.3rem">${data.emoji || '🍔'}</span>
        <div style="flex:1">
          <div style="font-weight:700;font-size:0.9rem">${escHtml(name)}</div>
          <div style="font-size:0.75rem;color:var(--text3)">${data.qty} sold</div>
        </div>
        <strong style="color:var(--orange)">₱${fmt(data.total)}</strong>
      </div>
    `).join('');
  }

  // Payment breakdown
  const payMap = {};
  orders.forEach(o => {
    payMap[o.payMethod] = (payMap[o.payMethod] || 0) + o.total;
  });

  const payEl = document.getElementById('paymentBreakdown');
  if (!Object.keys(payMap).length) {
    payEl.innerHTML = `<p style="color:var(--text3);font-size:0.88rem;text-align:center;padding:24px 0;">No sales data yet.</p>`;
  } else {
    const icons = { Cash: '💵', GCash: '📱', Card: '💳' };
    payEl.innerHTML = Object.entries(payMap).map(([method, total]) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:1.3rem">${icons[method] || '💰'}</span>
          <span style="font-weight:700">${escHtml(method)}</span>
        </div>
        <strong style="color:var(--green)">₱${fmt(total)}</strong>
      </div>
    `).join('');
  }
}

// =================== MOBILE CART ===================
function toggleMobileCart() {
  const panel = document.getElementById('orderPanel');
  panel.classList.toggle('show-mobile');
}

// =================== MODALS ===================
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function showConfirm(title, msg, onOk) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = msg;
  const btn = document.getElementById('confirmOkBtn');
  btn.onclick = onOk;
  document.getElementById('confirmModal').classList.remove('hidden');
}

// =================== TOAST ===================
let toastTimer;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

// =================== HELPERS ===================
function fmt(n) {
  return parseFloat(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// =================== PRODUCT MANAGEMENT ===================
function refreshProductList() {
  const products = posState.customProducts || [];
  const tbody = document.getElementById('productListBody');
  if (!tbody) return;

  if (!products.length) {
    tbody.innerHTML = `
      <tr><td colspan="4" style="padding:32px 14px;text-align:center;">
        <div style="font-size:2rem;margin-bottom:10px;">🍔</div>
        <div style="font-weight:700;color:var(--text2);margin-bottom:6px;">No products yet</div>
        <div style="font-size:0.82rem;color:var(--text3);">Click "+ Add Product" to add your first menu item.</div>
      </td></tr>
    `;
  } else {
    tbody.innerHTML = products.map(p => `
      <tr>
        <td><span style="font-weight:700;">${escHtml(p.name)}</span></td>
        <td>${escHtml(p.category || '—')}</td>
        <td style="color:var(--orange);font-weight:700;">₱${fmt(p.price)}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="editProduct('${p.id}')" style="margin-right:6px;">✏️ Edit</button>
          <button class="btn btn-sm" onclick="deleteProduct('${p.id}')" style="background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.3);">🗑 Delete</button>
        </td>
      </tr>
    `).join('');
  }
}

function openAddProductModal() {
  document.getElementById('productModalTitle').textContent = 'Add Product';
  document.getElementById('productEditId').value = '';
  document.getElementById('productName').value = '';
  document.getElementById('productPrice').value = '';
  document.getElementById('productCategory').value = '';
  renderRecipeRows([]);
  document.getElementById('productModal').classList.remove('hidden');
}

function editProduct(id) {
  const p = (posState.customProducts || []).find(x => x.id === id);
  if (!p) return;
  document.getElementById('productModalTitle').textContent = 'Edit Product';
  document.getElementById('productEditId').value = p.id;
  document.getElementById('productName').value = p.name;
  document.getElementById('productPrice').value = p.price;
  document.getElementById('productCategory').value = p.category || '';
  renderRecipeRows(p.recipe || []);
  document.getElementById('productModal').classList.remove('hidden');
}

// ---- Recipe rows helpers ----
let recipeRows = [];
function renderRecipeRows(rows) {
  recipeRows = rows.map(r => ({...r}));
  _refreshRecipeUI();
}
function addRecipeRow() {
  recipeRows.push({ ingredient: '', qty: 1 });
  _refreshRecipeUI();
}
function removeRecipeRow(idx) {
  recipeRows.splice(idx, 1);
  _refreshRecipeUI();
}
function _refreshRecipeUI() {
  const el = document.getElementById('recipeRowsList');
  if (!el) return;
  if (!recipeRows.length) {
    el.innerHTML = '<div style="font-size:0.8rem;color:var(--text3);padding:6px 0;">No ingredients linked — add one above.</div>';
    return;
  }
  el.innerHTML = recipeRows.map((r, i) => `
    <div style="display:flex;gap:6px;align-items:center;">
      <input type="text" class="input-field" style="flex:1;font-size:0.85rem;padding:6px 8px;" placeholder="Ingredient name" value="${escHtml(r.ingredient || '')}"
        oninput="recipeRows[${i}].ingredient=this.value" list="recipeIngSuggest" />
      <input type="number" class="input-field" style="width:60px;font-size:0.85rem;padding:6px 8px;text-align:center;" min="0.5" step="0.5" value="${r.qty || 1}"
        oninput="recipeRows[${i}].qty=parseFloat(this.value)||1" />
      <button type="button" onclick="removeRecipeRow(${i})" style="background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:0.8rem;">✕</button>
    </div>
  `).join('');
  // Datalist for ingredient suggestions from today's inventory
  const dateKey = getTodayKey();
  const cashierInvData = getInvData();
  const dayData = (cashierInvData[dateKey] || {});
  const knownIngs = (dayData.opening?.ingredients || []).map(i => i.name).filter(Boolean);
  // Always include defaults
  ['Burger Patty','Burger Buns','Cheese Slice'].forEach(n => { if (!knownIngs.includes(n)) knownIngs.push(n); });
  document.getElementById('recipeIngSuggest')?.remove();
  const dl = document.createElement('datalist');
  dl.id = 'recipeIngSuggest';
  knownIngs.forEach(n => { const o = document.createElement('option'); o.value = n; dl.appendChild(o); });
  document.body.appendChild(dl);
}

function saveProduct() {
  const name = document.getElementById('productName').value.trim();
  const price = parseFloat(document.getElementById('productPrice').value);
  const category = document.getElementById('productCategory').value.trim() || 'Other';
  const editId = document.getElementById('productEditId').value;
  const recipe = recipeRows.filter(r => r.ingredient && r.ingredient.trim()).map(r => ({ ingredient: r.ingredient.trim(), qty: parseFloat(r.qty) || 1 }));

  if (!name) { showToast('Please enter a product name.', 'error'); return; }
  if (isNaN(price) || price <= 0) { showToast('Please enter a valid price.', 'error'); return; }

  if (!posState.customProducts) posState.customProducts = [];

  if (editId) {
    const idx = posState.customProducts.findIndex(p => p.id === editId);
    if (idx >= 0) {
      posState.customProducts[idx] = { ...posState.customProducts[idx], name, price, category, recipe };
    }
    showToast('✅ Product updated!', 'success');
  } else {
    const newId = 'cp_' + Date.now();
    posState.customProducts.push({ id: newId, name, price, category, emoji: getCategoryEmoji(category), recipe });
    showToast('✅ Product added!', 'success');
  }

  savePos();
  closeModal('productModal');
  refreshProductList();
  buildMenuGrid(); // Refresh the New Order menu
}

function deleteProduct(id) {
  showConfirm('Delete Product?', 'This product will be removed from the menu.', () => {
    posState.customProducts = (posState.customProducts || []).filter(p => p.id !== id);
    savePos();
    closeModal('confirmModal');
    refreshProductList();
    buildMenuGrid();
    showToast('Product deleted.', '');
  });
}


// =================== SALES REPORTS ===================
function renderReports() {
  const period = document.getElementById('reportPeriod')?.value || 'daily';
  const fromEl  = document.getElementById('reportFrom');
  const toEl    = document.getElementById('reportTo');
  const toLabel = document.getElementById('reportToLabel');
  if (fromEl)  fromEl.style.display  = period === 'custom' ? '' : 'none';
  if (toEl)    toEl.style.display    = period === 'custom' ? '' : 'none';
  if (toLabel) toLabel.style.display = period === 'custom' ? '' : 'none';

  const today = new Date();
  const todayStr = getLocalDateKey(today);
  let startDate, endDate;

  if (period === 'daily') {
    startDate = endDate = todayStr;
    document.getElementById('reportPeriodLabel').textContent = 'Today — ' + today.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  } else if (period === 'weekly') {
    const day = today.getDay();
    const mon = new Date(today); mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
    startDate = getLocalDateKey(mon);
    endDate   = todayStr;
    document.getElementById('reportPeriodLabel').textContent = 'Week of ' + mon.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) + ' – ' + today.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  } else if (period === 'monthly') {
    startDate = getLocalDateKey(new Date(today.getFullYear(), today.getMonth(), 1));
    endDate   = todayStr;
    document.getElementById('reportPeriodLabel').textContent = today.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  } else if (period === 'yearly') {
    startDate = today.getFullYear() + '-01-01';
    endDate   = todayStr;
    document.getElementById('reportPeriodLabel').textContent = 'Year ' + today.getFullYear();
  } else {
    startDate = fromEl?.value || todayStr;
    endDate   = toEl?.value   || todayStr;
    document.getElementById('reportPeriodLabel').textContent = startDate + ' to ' + endDate;
  }

  const cashiers = getCashiers();

  // ── Collect all inventory records from the shared inventory store ──
  // Opening/closing inventory is shared across all cashiers (burgerStreetSharedInventory),
  // not stored per-cashier — so read from loadInventoryData() directly.
  // Each record looks like: { date, cashierName, type:'opening'/'closing', items:[{name,qty,...}], amounts:[...] }
  const allInvRecords = [];
  try {
    const sharedInv = loadInventoryData();
    for (const [date, dayData] of Object.entries(sharedInv)) {
      if (date < startDate || date > endDate) continue;
      if (dayData.shifts && dayData.shifts.length) {
        // Multi-shift format: aggregate all shifts for this day
        dayData.shifts.forEach((shift, si) => {
          if (shift.opening) allInvRecords.push({ date, cashierName: shift.opening.cashier || BIZ_NAME, type: 'opening', items: shift.opening.ingredients || [], amounts: shift.opening.amounts || [], shiftIdx: si });
          if (shift.closing) allInvRecords.push({ date, cashierName: shift.closing.cashier || BIZ_NAME, type: 'closing', items: shift.closing.ingredients || [], amounts: shift.closing.amounts || [], shiftIdx: si });
        });
      } else {
        // Legacy single opening/closing
        if (dayData.opening) allInvRecords.push({ date, cashierName: BIZ_NAME, type: 'opening', items: dayData.opening.ingredients || [], amounts: dayData.opening.amounts || [] });
        if (dayData.closing) allInvRecords.push({ date, cashierName: BIZ_NAME, type: 'closing', items: dayData.closing.ingredients || [], amounts: dayData.closing.amounts || [] });
      }
    }
  } catch(e) {}

  // ── Aggregate per item name across all cashiers ──
  // itemMap[name] = { totalOpening: qty, totalClosing: qty, cashiersSet: Set }
  const itemMap = {};
  for (const rec of allInvRecords) {
    for (const it of rec.items) {
      const nm = (it.name || '').trim();
      if (!nm) continue;
      if (!itemMap[nm]) itemMap[nm] = { totalOpening: 0, totalClosing: 0, cashiers: new Set() };
      if (rec.type === 'opening') {
        itemMap[nm].totalOpening += (parseFloat(it.qty) || 0);
        itemMap[nm].cashiers.add(rec.cashierName);
      } else {
        itemMap[nm].totalClosing += (parseFloat(it.closingQty ?? it.qty) || 0);
        itemMap[nm].cashiers.add(rec.cashierName);
      }
    }
    // amounts (money-based) — treat label as item name
    for (const am of rec.amounts) {
      const nm = (am.label || am.name || '').trim();
      if (!nm) continue;
      if (!itemMap[nm]) itemMap[nm] = { totalOpening: 0, totalClosing: 0, cashiers: new Set() };
      if (rec.type === 'opening') {
        itemMap[nm].totalOpening += (parseFloat(am.amount) || 0);
        itemMap[nm].cashiers.add(rec.cashierName);
      } else {
        itemMap[nm].totalClosing += (parseFloat(am.closingAmount ?? am.amount) || 0);
        itemMap[nm].cashiers.add(rec.cashierName);
      }
    }
  }

  const activeDays = new Set(allInvRecords.map(r => r.date)).size;
  document.getElementById('rptDays').textContent = activeDays;

  const itemRows = Object.entries(itemMap).sort((a, b) => a[0].localeCompare(b[0])).map(([name, d]) => {
    const used = Math.max(0, d.totalOpening - d.totalClosing);
    const usedColor = used > 0 ? 'color:var(--red);' : 'color:var(--text3);';
    return `<tr>
      <td style="font-weight:700;">${escHtml(name)}</td>
      <td style="color:var(--blue);font-weight:700;">${d.totalOpening % 1 === 0 ? d.totalOpening : d.totalOpening.toFixed(2)}</td>
      <td style="color:var(--green);font-weight:700;">${d.totalClosing % 1 === 0 ? d.totalClosing : d.totalClosing.toFixed(2)}</td>
      <td style="${usedColor}font-weight:700;">${used % 1 === 0 ? used : used.toFixed(2)}</td>
      <td><span class="badge badge-blue">${d.cashiers.size} cashier${d.cashiers.size !== 1 ? 's' : ''}</span></td>
    </tr>`;
  }).join('');
  document.getElementById('rptInventoryBody').innerHTML = itemRows || '<tr><td colspan="5" class="empty-row">No inventory data for selected period.</td></tr>';

  // ── Collect all cash advances across all cashiers ──
  let allAdvances = [];
  for (const c of cashiers) {
    try {
      const s = localStorage.getItem(getCashierStorageKey(c.id));
      if (!s) continue;
      const st = JSON.parse(s);
      (st.cashAdvances || []).forEach(a => { a._cashierName = c.name; allAdvances.push(a); });
    } catch(e) {}
  }
  if (activeCashier) {
    (posState.cashAdvances || []).forEach(a => {
      if (!allAdvances.find(x => x.id === a.id)) { a._cashierName = activeCashier.name; allAdvances.push(a); }
    });
  }
  const filteredAdv = allAdvances.filter(a => {
    const d = (a.datetime || '').split('T')[0];
    return d >= startDate && d <= endDate;
  }).sort((a, b) => (b.datetime || '').localeCompare(a.datetime || ''));

  const totalAdv = filteredAdv.reduce((s, a) => s + (a.amount || 0), 0);
  document.getElementById('rptCashAdv').textContent = '₱' + fmt(totalAdv);

  const advRows = filteredAdv.map(a => {
    const d = new Date((a.datetime || '').replace(' ', 'T'));
    const dateLabel = isNaN(d) ? (a.datetime || '') : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
    return `<tr>
      <td style="font-size:0.82rem;">${dateLabel}</td>
      <td>${escHtml(a._cashierName || 'Unknown')}</td>
      <td>${escHtml(a.name || '')}</td>
      <td style="color:var(--red);font-weight:800;">₱${fmt(a.amount || 0)}</td>
      <td style="color:var(--text3);font-size:0.82rem;">${escHtml(a.reason || '')}</td>
    </tr>`;
  }).join('');
  document.getElementById('rptCashAdvBody').innerHTML = advRows || '<tr><td colspan="5" class="empty-row">No cash advances for selected period.</td></tr>';

  // ── Daily inventory breakdown per cashier ──
  // Group records by date → cashier
  const byDateCashier = {};
  for (const rec of allInvRecords) {
    if (!byDateCashier[rec.date]) byDateCashier[rec.date] = {};
    if (!byDateCashier[rec.date][rec.cashierName]) byDateCashier[rec.date][rec.cashierName] = { opening: null, closing: null };
    byDateCashier[rec.date][rec.cashierName][rec.type] = rec;
  }

  const sortedDates = Object.keys(byDateCashier).sort().reverse();
  let dailyHtml = '';
  for (const date of sortedDates) {
    const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const cashierEntries = byDateCashier[date];
    let cashierRows = '';
    for (const [cname, recs] of Object.entries(cashierEntries)) {
      const openItems = recs.opening ? [...(recs.opening.items || []), ...(recs.opening.amounts || [])] : [];
      const closeItems = recs.closing ? [...(recs.closing.items || []), ...(recs.closing.amounts || [])] : [];
      const hasOpen  = openItems.length > 0;
      const hasClose = closeItems.length > 0;
      const itemNames = [...new Set([...openItems.map(i => i.name || i.label || ''), ...closeItems.map(i => i.name || i.label || '')])].filter(Boolean);
      let itemRowsHtml = itemNames.map(nm => {
        const oIt = openItems.find(i => (i.name || i.label || '') === nm);
        const cIt = closeItems.find(i => (i.name || i.label || '') === nm);
        const oQty = oIt ? (parseFloat(oIt.qty ?? oIt.amount) || 0) : '—';
        const cQty = cIt ? (parseFloat(cIt.closingQty ?? cIt.closingAmount ?? cIt.qty ?? cIt.amount) || 0) : '—';
        const used = (typeof oQty === 'number' && typeof cQty === 'number') ? Math.max(0, oQty - cQty) : '—';
        return `<tr style="font-size:0.82rem;">
          <td style="padding-left:20px;color:var(--text2);">${escHtml(nm)}</td>
          <td style="color:var(--blue);">${typeof oQty === 'number' ? (oQty % 1 === 0 ? oQty : oQty.toFixed(2)) : oQty}</td>
          <td style="color:var(--green);">${typeof cQty === 'number' ? (cQty % 1 === 0 ? cQty : cQty.toFixed(2)) : cQty}</td>
          <td style="color:${typeof used === 'number' && used > 0 ? 'var(--red)' : 'var(--text3)'};">${typeof used === 'number' ? (used % 1 === 0 ? used : used.toFixed(2)) : used}</td>
        </tr>`;
      }).join('');
      cashierRows += `
        <tr style="background:var(--bg3);">
          <td colspan="4" style="font-weight:800;padding:10px 14px;">
            👤 ${escHtml(cname)}
            ${hasOpen ? '<span class="badge badge-blue" style="margin-left:8px;">Opening ✓</span>' : '<span class="badge" style="margin-left:8px;background:var(--bg3);color:var(--text3);">No Opening</span>'}
            ${hasClose ? '<span class="badge badge-green" style="margin-left:4px;">Closing ✓</span>' : '<span class="badge" style="margin-left:4px;background:var(--bg3);color:var(--text3);">No Closing</span>'}
          </td>
        </tr>
        ${itemRowsHtml || `<tr><td colspan="4" style="padding-left:20px;color:var(--text3);font-size:0.82rem;padding-top:8px;padding-bottom:8px;">No items recorded.</td></tr>`}`;
    }
    dailyHtml += `
      <div style="margin-bottom:20px;">
        <div style="font-weight:800;font-size:0.95rem;color:var(--orange);margin-bottom:8px;padding:8px 12px;background:rgba(232,124,30,0.08);border-radius:8px;border-left:3px solid var(--orange);">📅 ${dateLabel}</div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Item / Supply</th><th>Opening</th><th>Closing</th><th>Used</th></tr></thead>
            <tbody>${cashierRows}</tbody>
          </table>
        </div>
      </div>`;
  }
  document.getElementById('rptDailyCashierInv').innerHTML = dailyHtml || '<p style="color:var(--text3);font-size:0.88rem;text-align:center;padding:24px 0;">No inventory data for selected period.</p>';
}

// =================== SECRET OWNER TAP ===================
let ownerTapCount = 0;
let ownerTapTimer = null;

function ownerTapSecret() {
  ownerTapCount++;
  clearTimeout(ownerTapTimer);
  ownerTapTimer = setTimeout(() => { ownerTapCount = 0; }, 2000);
  if (ownerTapCount >= 5) {
    ownerTapCount = 0;
    const section = document.getElementById('ownerPinSection');
    const cashierSection = document.getElementById('cashierMgmtSection');
    const ownerSummarySection = document.getElementById('ownerSummarySection');
    if (section) { section.style.display = 'block'; }
    if (cashierSection) { cashierSection.style.display = 'block'; renderCashierManagement(); }
    if (ownerSummarySection) { ownerSummarySection.style.display = 'block'; renderOwnerSummary(); }
    section?.scrollIntoView({ behavior: 'smooth' });
    showToast('👑 Owner settings unlocked', 'success');
  }
}


function refreshSettingsPage() {
  const nameInput = document.getElementById('settingsCashierName');
  const pinStatusLabel = document.getElementById('pinStatusLabel');
  const pinToggleBtn = document.getElementById('pinToggleBtn');
  const pinSetSection = document.getElementById('pinSetSection');

  if (nameInput) nameInput.value = posState.settings.cashierName || '';
  
  const enabled = posState.settings.pinEnabled || false;
  if (pinStatusLabel) pinStatusLabel.textContent = enabled ? '🔒 PIN Lock: Enabled' : 'PIN Lock: Disabled';
  if (pinToggleBtn) pinToggleBtn.textContent = enabled ? 'Disable PIN' : 'Enable PIN';
  if (pinSetSection) pinSetSection.style.display = enabled ? '' : 'none';

  const ownerPinStatus = document.getElementById('ownerPinStatus');
  if (ownerPinStatus) {
    ownerPinStatus.textContent = posState.settings.ownerPin
      ? '✅ Owner PIN is set'
      : '⚠️ No Owner PIN set yet';
    ownerPinStatus.style.color = posState.settings.ownerPin ? 'var(--green)' : 'var(--orange)';
  }

  // Always hide owner sections on page refresh — revealed only by secret tap
  const ownerSection = document.getElementById('ownerPinSection');
  if (ownerSection) ownerSection.style.display = 'none';
  const cashierSection = document.getElementById('cashierMgmtSection');
  if (cashierSection) cashierSection.style.display = 'none';
  const ownerSummarySection = document.getElementById('ownerSummarySection');
  if (ownerSummarySection) ownerSummarySection.style.display = 'none';
}

function togglePinEnabled() {
  const enabled = posState.settings.pinEnabled || false;
  if (enabled) {
    posState.settings.pinEnabled = false;
    savePos();
    refreshSettingsPage();
    showToast('PIN lock disabled. Terminal will not require PIN.', '');
  } else {
    posState.settings.pinEnabled = true;
    savePos();
    refreshSettingsPage();
    showToast('PIN lock enabled. Set your PIN below.', 'success');
  }
}

// =================== DELIVERY LOG ===================

function autoFillDeliveryQty() {
  const n = document.getElementById('deliveryQtyNum').value;
  const u = document.getElementById('deliveryUnit').value.trim() || 'pcs';
  const display = document.getElementById('deliveryQty');
  if (n && display && !display._manuallyEdited) {
    display.value = `${n} ${u}`;
  }
}

function openDeliveryModal() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.getElementById('deliveryDateTime').value = local;
  document.getElementById('deliveryItem').value = '';
  document.getElementById('deliveryQty').value = '';
  document.getElementById('deliveryQtyNum').value = '';
  document.getElementById('deliveryUnit').value = 'pcs';
  document.getElementById('deliverySupplier').value = '';
  const modal = document.getElementById('deliveryModal');
  modal.style.display = 'flex';
}

function closeDeliveryModal() {
  document.getElementById('deliveryModal').style.display = 'none';
}

function saveDelivery() {
  const item = document.getElementById('deliveryItem').value.trim();
  const qty = document.getElementById('deliveryQty').value.trim();
  const supplier = document.getElementById('deliverySupplier').value.trim();
  const dt = document.getElementById('deliveryDateTime').value;
  const unit = document.getElementById('deliveryUnit').value.trim() || 'pcs';
  const qtyNum = parseFloat(document.getElementById('deliveryQtyNum').value) || 0;

  if (!item) { showToast('Please enter an item name.', 'error'); return; }
  if (!qty) { showToast('Please enter a quantity.', 'error'); return; }

  const delivery = {
    id: Date.now(),
    item,
    qty,
    qtyNum,
    unit,
    supplier: supplier || '—',
    datetime: dt || new Date().toISOString(),
    recordedBy: posState.settings.cashierName || CASHIER_NAME
  };

  // Save to shared delivery log (visible to all cashiers)
  const sharedDeliveries = loadSharedDeliveries();
  sharedDeliveries.unshift(delivery);
  saveSharedDeliveries(sharedDeliveries);

  // ── AUTO-ADD TO TODAY'S SHARED INVENTORY ──
  if (qtyNum > 0) {
    const dateKey = getTodayInvKey();
    const invData = loadInventoryData();
    if (!invData[dateKey]) invData[dateKey] = {};
    if (!invData[dateKey].opening) invData[dateKey].opening = { ingredients: [], amounts: [] };
    const ings = invData[dateKey].opening.ingredients;
    // Find existing ingredient (case-insensitive match)
    const existing = ings.find(i => i.name.trim().toLowerCase() === item.toLowerCase());
    if (existing) {
      existing.qty = (existing.qty || 0) + qtyNum;
    } else {
      ings.push({ name: item, unit: unit, qty: qtyNum });
    }
    saveInventoryData(invData);
    renderInventory();
  }

  closeDeliveryModal();
  renderDeliveryLog();
  showToast('✅ Delivery recorded & added to inventory!', 'success');
}

function renderDeliveryLog() {
  const container = document.getElementById('deliveryLogList');
  if (!container) return;
  const deliveries = loadSharedDeliveries();
  if (!deliveries.length) {
    container.innerHTML = '<p style="color:var(--text3);font-size:0.85rem;text-align:center;padding:16px 0;">No deliveries recorded yet.</p>';
    return;
  }
  container.innerHTML = deliveries.map(d => {
    const dt = new Date(d.datetime);
    const dateStr = dt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = dt.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--border);gap:10px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:800;font-size:0.95rem;color:var(--text);">${escHtml(d.item)}</div>
          <div style="font-size:0.82rem;color:var(--orange);font-weight:700;margin-top:2px;">Qty: ${d.qtyNum ? `${d.qtyNum} ${escHtml(d.unit||'pcs')}` : escHtml(d.qty)}</div>
          <div style="font-size:0.78rem;color:var(--text3);margin-top:2px;">📦 ${escHtml(d.supplier)} &nbsp;·&nbsp; 👤 ${escHtml(d.recordedBy)}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:0.78rem;font-weight:700;color:var(--text2);">${dateStr}</div>
          <div style="font-size:0.78rem;color:var(--text3);">${timeStr}</div>
          <button onclick="deleteDelivery(${d.id})" style="background:none;border:none;color:var(--red);font-size:0.75rem;cursor:pointer;margin-top:4px;font-weight:700;">🗑 Remove</button>
        </div>
      </div>`;
  }).join('');
}

function deleteDelivery(id) {
  if (!confirm('Remove this delivery record?')) return;
  const dl = loadSharedDeliveries().filter(d => d.id !== id);
  saveSharedDeliveries(dl);
  renderDeliveryLog();
  showToast('Delivery record removed.', 'success');
}

// =================== CASH ADVANCE ===================

function openCashAdvanceModal() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.getElementById('caDateTime').value = local;
  document.getElementById('caName').value = posState.settings.cashierName || '';
  document.getElementById('caAmount').value = '';
  document.getElementById('caReason').value = '';
  document.getElementById('cashAdvanceModal').style.display = 'flex';
}

function closeCashAdvanceModal() {
  document.getElementById('cashAdvanceModal').style.display = 'none';
}

function saveCashAdvance() {
  const name = document.getElementById('caName').value.trim();
  const amount = parseFloat(document.getElementById('caAmount').value);
  const reason = document.getElementById('caReason').value.trim();
  const dt = document.getElementById('caDateTime').value;

  if (!name) { showToast('Please enter the cashier name.', 'error'); return; }
  if (!amount || amount <= 0) { showToast('Please enter a valid amount.', 'error'); return; }

  const advance = {
    id: Date.now(),
    name,
    amount,
    reason: reason || '—',
    datetime: dt || new Date().toISOString()
  };

  if (!posState.cashAdvances) posState.cashAdvances = [];
  posState.cashAdvances.unshift(advance);
  savePos();
  closeCashAdvanceModal();
  renderCashAdvanceLog();
  showToast(`✅ Cash advance of ₱${fmt(amount)} recorded and deducted from today's sales.`, 'success');
}

function renderCashAdvanceLog() {
  const container = document.getElementById('cashAdvanceList');
  const totalBar = document.getElementById('cashAdvanceTotalBar');
  const totalAmt = document.getElementById('cashAdvanceTotalAmt');
  if (!container) return;

  const advances = posState.cashAdvances || [];

  // Filter to today's advances for the total bar
  const today = new Date().toISOString().split('T')[0];
  const todayAdvances = advances.filter(a => a.datetime.startsWith(today));
  const todayTotal = todayAdvances.reduce((s, a) => s + (a.amount || 0), 0);

  if (todayTotal > 0) {
    totalBar.style.display = 'flex';
    totalAmt.textContent = '₱' + fmt(todayTotal);
  } else {
    totalBar.style.display = 'none';
  }

  if (!advances.length) {
    container.innerHTML = '<p style="color:var(--text3);font-size:0.85rem;text-align:center;padding:16px 0;">No cash advances recorded yet.</p>';
    return;
  }

  container.innerHTML = advances.map(a => {
    const dt = new Date(a.datetime);
    const dateStr = dt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = dt.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
    const isToday = a.datetime.startsWith(today);
    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--border);gap:10px;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-weight:800;font-size:0.95rem;color:var(--text);">👤 ${escHtml(a.name)}</span>
            ${isToday ? '<span style="font-size:0.7rem;background:var(--red);color:#fff;padding:2px 8px;border-radius:20px;font-weight:700;">TODAY</span>' : ''}
          </div>
          <div style="font-size:0.82rem;color:var(--text3);margin-top:2px;">📝 ${escHtml(a.reason)}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-weight:800;color:var(--red);font-size:1rem;">-₱${fmt(a.amount)}</div>
          <div style="font-size:0.78rem;font-weight:700;color:var(--text2);">${dateStr}</div>
          <div style="font-size:0.78rem;color:var(--text3);">${timeStr}</div>
          <button onclick="deleteCashAdvance(${a.id})" style="background:none;border:none;color:var(--red);font-size:0.75rem;cursor:pointer;margin-top:4px;font-weight:700;">🗑 Remove</button>
        </div>
      </div>`;
  }).join('');
}

function deleteCashAdvance(id) {
  if (!confirm('Remove this cash advance record?')) return;
  posState.cashAdvances = (posState.cashAdvances || []).filter(a => a.id !== id);
  savePos();
  renderCashAdvanceLog();
  showToast('Cash advance record removed.', 'success');
}

function getCashAdvanceTotalToday() {
  const today = new Date().toISOString().split('T')[0];
  return (posState.cashAdvances || [])
    .filter(a => a.datetime.startsWith(today))
    .reduce((s, a) => s + (a.amount || 0), 0);
}

function confirmClearData() {
  const doDelete = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to delete ALL data?\n\nThis includes:\n• All orders\n• All products\n• Inventory records\n• Settings\n\nThis CANNOT be undone.'
    );
    if (!confirmed) return;
    const confirmed2 = window.confirm('Last chance — are you absolutely sure?');
    if (!confirmed2) return;

    // Wipe ALL localStorage for this app (catches every key, current and legacy/orphaned)
    try { localStorage.clear(); } catch (e) {}

    // Wipe sessionStorage too
    try { sessionStorage.clear(); } catch (e) {}

    // Delete any IndexedDB databases (legacy Dexie-based versions of this app)
    try {
      if (indexedDB.databases) {
        const dbs = await indexedDB.databases();
        await Promise.all((dbs || []).map(d => d.name ? indexedDB.deleteDatabase(d.name) : null));
      } else {
        indexedDB.deleteDatabase('BurgerStreetPOS');
      }
    } catch (e) {}

    // Clear service worker caches so the next reload doesn't restore stale assets/data
    try {
      if (window.caches && caches.keys) {
        const names = await caches.keys();
        await Promise.all(names.map(n => caches.delete(n)));
      }
    } catch (e) {}

    // Reset in-memory state so nothing gets re-saved before reload
    activeCashier = null;
    posState = {
      orders: [], orderCounter: 1,
      settings: { pin: CASHIER_PIN, cashierName: CASHIER_NAME, theme: 'dark', pinEnabled: false },
      customProducts: []
    };
    cart = [];

    showToast('All data cleared. Restarting...', 'success');
    setTimeout(() => location.reload(), 1500);
  };

  if (posState.settings.ownerPin) {
    openPinVerify(doDelete, posState.settings.ownerPin);
  } else {
    doDelete();
  }
}

// ===== PIN VERIFY MODAL =====
let pinVerifyCallback = null;
let pinVerifyBuffer = '';
let pinVerifyCode = null;

function openPinVerify(onSuccess, pinOverride) {
  pinVerifyCallback = onSuccess;
  pinVerifyCode = pinOverride || null;
  pinVerifyBuffer = '';
  updatePinVerifyDots();
  document.getElementById('pinVerifyError').classList.add('hidden');
  document.getElementById('pinVerifyModal').classList.remove('hidden');
}

function closePinVerify() {
  pinVerifyBuffer = '';
  pinVerifyCallback = null;
  pinVerifyCode = null;
  document.getElementById('pinVerifyModal').classList.add('hidden');
}

function enterPinVerify(digit) {
  if (pinVerifyBuffer.length >= 4) return;
  pinVerifyBuffer += digit;
  updatePinVerifyDots();
  if (pinVerifyBuffer.length === 4) {
    setTimeout(() => {
      const pin = pinVerifyCode || posState.settings.pin || CASHIER_PIN;
      if (pinVerifyBuffer === pin) {
        const cb = pinVerifyCallback;
        closePinVerify();
        if (cb) cb();
      } else {
        document.getElementById('pinVerifyError').classList.remove('hidden');
        pinVerifyBuffer = '';
        updatePinVerifyDots();
        setTimeout(() => document.getElementById('pinVerifyError').classList.add('hidden'), 2000);
      }
    }, 200);
  }
}

function deletePinVerify() {
  pinVerifyBuffer = pinVerifyBuffer.slice(0, -1);
  updatePinVerifyDots();
}

function updatePinVerifyDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById('vd' + i);
    if (dot) dot.classList.toggle('filled', i < pinVerifyBuffer.length);
  }
}

function saveSettings() {
  const name = (document.getElementById('settingsCashierName')?.value || '').trim() || CASHIER_NAME;
  posState.settings.cashierName = name;
  savePos();
  document.getElementById('cashierName').textContent = name;
  showToast('✅ Settings saved!', 'success');
}

function savePinSettings() {
  const pin1 = document.getElementById('newPin')?.value || '';
  const pin2 = document.getElementById('confirmPin')?.value || '';

  if (pin1.length !== 4 || !/^\d{4}$/.test(pin1)) {
    showToast('PIN must be exactly 4 digits.', 'error'); return;
  }
  if (pin1 !== pin2) {
    showToast('PINs do not match.', 'error'); return;
  }

  // Check not same as owner PIN
  const global = loadGlobalState();
  if (pin1 === (global.ownerPin || '')) {
    showToast('Your PIN cannot be the same as the Owner PIN.', 'error'); return;
  }

  posState.settings.pin = pin1;
  posState.settings.pinEnabled = true;
  savePos();

  // Also save PIN back to the cashiers list so it works on login screen
  if (activeCashier && activeCashier.id !== 'owner') {
    const cashiers = getCashiers();
    const updated = cashiers.map(c => c.id === activeCashier.id ? { ...c, pin: pin1 } : c);
    saveCashiers(updated);
    activeCashier.pin = pin1;
  }

  document.getElementById('newPin').value = '';
  document.getElementById('confirmPin').value = '';
  refreshSettingsPage();
  showToast('✅ PIN saved!', 'success');
}

function saveOwnerPin() {
  const pin1 = document.getElementById('newOwnerPin')?.value || '';
  const pin2 = document.getElementById('confirmOwnerPin')?.value || '';
  if (pin1.length !== 4 || !/^\d{4}$/.test(pin1)) { showToast('Owner PIN must be exactly 4 digits.', 'error'); return; }
  if (pin1 !== pin2) { showToast('Owner PINs do not match.', 'error'); return; }
  posState.settings.ownerPin = pin1;
  const global = loadGlobalState();
  global.ownerPin = pin1;
  saveGlobalState(global);
  savePos();
  document.getElementById('newOwnerPin').value = '';
  document.getElementById('confirmOwnerPin').value = '';
  refreshSettingsPage();
  showToast('✅ Owner PIN saved!', 'success');
}

// =================== CASHIER MANAGEMENT ===================
function renderCashierManagement() {
  const cashiers = getCashiers();
  const list = document.getElementById('cashierMgmtList');
  if (!list) return;
  if (!cashiers.length) {
    list.innerHTML = `<p style="color:var(--text3);font-size:0.85rem;text-align:center;padding:12px 0;">No cashiers added yet.</p>`;
    return;
  }
  list.innerHTML = cashiers.map(c => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);gap:10px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:36px;height:36px;border-radius:50%;background:var(--orange);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1rem;">${c.name.charAt(0).toUpperCase()}</div>
        <div>
          <div style="font-weight:700;font-size:0.92rem;">${escHtml(c.name)}</div>
          <div style="font-size:0.75rem;color:var(--text3);">PIN: ••••</div>
        </div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-outline btn-sm" onclick="editCashierModal('${c.id}')">✏️</button>
        <button class="btn btn-sm" onclick="deleteCashier('${c.id}')" style="background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.3);">🗑</button>
      </div>
    </div>`).join('');
}

function openAddCashierModal() {
  document.getElementById('cashierMgmtModalTitle').textContent = 'Add Cashier';
  document.getElementById('cashierMgmtId').value = '';
  document.getElementById('cashierMgmtName').value = '';
  document.getElementById('cashierMgmtPin').value = '';
  document.getElementById('cashierMgmtPin2').value = '';
  document.getElementById('cashierPinNote').style.display = 'block';
  document.getElementById('cashierMgmtModal').classList.remove('hidden');
}

function editCashierModal(id) {
  const cashiers = getCashiers();
  const c = cashiers.find(x => x.id === id);
  if (!c) return;
  document.getElementById('cashierMgmtModalTitle').textContent = 'Edit Cashier';
  document.getElementById('cashierMgmtId').value = c.id;
  document.getElementById('cashierMgmtName').value = c.name;
  document.getElementById('cashierMgmtPin').value = '';
  document.getElementById('cashierMgmtPin2').value = '';
  document.getElementById('cashierPinNote').style.display = 'none';
  document.getElementById('cashierMgmtModal').classList.remove('hidden');
}

function saveCashierMgmt() {
  const id = document.getElementById('cashierMgmtId').value;
  const name = document.getElementById('cashierMgmtName').value.trim();
  const pin1 = document.getElementById('cashierMgmtPin').value.trim();
  const pin2 = document.getElementById('cashierMgmtPin2').value.trim();

  if (!name) { showToast('Please enter a cashier name.', 'error'); return; }

  // PIN validation only if PIN was entered
  if (pin1) {
    if (pin1.length !== 4 || !/^\d{4}$/.test(pin1)) { showToast('PIN must be exactly 4 digits.', 'error'); return; }
    if (pin1 !== pin2) { showToast('PINs do not match.', 'error'); return; }
    const global = loadGlobalState();
    if (pin1 === (global.ownerPin || '')) { showToast('Cashier PIN must be different from Owner PIN.', 'error'); return; }
  }

  let cashiers = getCashiers();
  if (id) {
    // Edit — update name and PIN if provided
    cashiers = cashiers.map(c => c.id === id ? { ...c, name, pin: pin1 || c.pin } : c);
    showToast('✅ Cashier updated!', 'success');
  } else {
    // Add new — PIN is optional (null = not set yet, cashier will set on first login)
    cashiers.push({ id: 'c_' + Date.now(), name, pin: pin1 || null });
    showToast(`✅ ${name} added! They will set their PIN on first login.`, 'success');
  }

  saveCashiers(cashiers);
  closeModal('cashierMgmtModal');
  renderCashierManagement();
}

function deleteCashier(id) {
  showConfirm('Delete Cashier?', 'This will remove the cashier login. Their data stays in storage.', () => {
    saveCashiers(getCashiers().filter(c => c.id !== id));
    closeModal('confirmModal');
    renderCashierManagement();
    showToast('Cashier removed.', '');
  });
}

// =================== OWNER SUMMARY ===================
function renderOwnerSummary() {
  const cashiers = getCashiers();
  const summaryDate = document.getElementById('ownerSummaryDate')?.value || new Date().toISOString().split('T')[0];
  const container = document.getElementById('ownerSummaryContent');
  if (!container) return;
  let totalSales = 0, totalOrders = 0, rows = '';
  cashiers.forEach(c => {
    let orders = [];
    try { const s = localStorage.getItem(getCashierStorageKey(c.id)); if (s) orders = JSON.parse(s).orders || []; } catch(e) {}
    const dayOrders = orders.filter(o => o.date && o.date.startsWith(summaryDate));
    const sales = dayOrders.reduce((sum, o) => sum + o.total, 0);
    totalSales += sales; totalOrders += dayOrders.length;
    rows += `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:36px;height:36px;border-radius:50%;background:var(--orange);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;">${c.name.charAt(0).toUpperCase()}</div>
          <div><div style="font-weight:700;">${escHtml(c.name)}</div><div style="font-size:0.78rem;color:var(--text3);">${dayOrders.length} orders</div></div>
        </div>
        <strong style="color:var(--green);">₱${fmt(sales)}</strong>
      </div>`;
  });
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
      <div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:12px;padding:14px;text-align:center;">
        <div style="font-size:0.72rem;color:var(--text3);font-weight:700;letter-spacing:1px;">TOTAL SALES</div>
        <div style="font-size:1.4rem;font-weight:800;color:var(--green);">₱${fmt(totalSales)}</div>
      </div>
      <div style="background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:12px;padding:14px;text-align:center;">
        <div style="font-size:0.72rem;color:var(--text3);font-weight:700;letter-spacing:1px;">TOTAL ORDERS</div>
        <div style="font-size:1.4rem;font-weight:800;color:var(--blue);">${totalOrders}</div>
      </div>
    </div>
    <div style="font-size:0.72rem;font-weight:800;color:var(--text3);letter-spacing:1px;margin-bottom:8px;">PER CASHIER</div>
    ${rows || '<p style="color:var(--text3);font-size:0.85rem;text-align:center;padding:16px 0;">No data for this date.</p>'}`;
}




let editingOrderId = null;
let editingOrderItems = [];

function viewOrder(orderId) {
  const order = posState.orders.find(o => o.id === orderId);
  if (!order) return;
  editingOrderId = orderId;
  editingOrderItems = JSON.parse(JSON.stringify(order.items)); // deep copy

  const date = new Date(order.date);
  const timeStr = date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  const dateStr = date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

  document.getElementById('viewOrderTitle').textContent = `📋 Order #${order.orderNum}`;
  document.getElementById('viewOrderMeta').innerHTML =
    `<strong>Date:</strong> ${dateStr} ${timeStr}<br>` +
    `<strong>Cashier:</strong> ${escHtml(order.cashier)}<br>` +
    `<strong>Payment:</strong> ${escHtml(order.payMethod)}`;

  renderViewOrderItems();
  document.getElementById('viewOrderModal').classList.remove('hidden');
}

function renderViewOrderItems() {
  const container = document.getElementById('viewOrderItems');
  container.innerHTML = editingOrderItems.map((item, idx) => `
    <div class="order-edit-item">
      <div style="flex:1;min-width:0">
        <div class="oei-name">${escHtml(item.name)}</div>
        <div class="oei-price">₱${fmt(item.price)} each</div>
      </div>
      <div class="oei-qty-ctrl">
        <button class="oei-qty-btn" onclick="editOrderQty(${idx}, -1)">−</button>
        <input type="number" class="oei-qty-val" value="${item.qty}" min="1" onchange="editOrderSetQty(${idx}, this.value)" />
        <button class="oei-qty-btn" onclick="editOrderQty(${idx}, 1)">+</button>
      </div>
      <span class="oei-subtotal">₱${fmt(item.price * item.qty)}</span>
      <button class="oei-del" onclick="editOrderRemove(${idx})" title="Remove item">✕</button>
    </div>
  `).join('');

  // Update totals
  const subtotal = editingOrderItems.reduce((s, i) => s + i.price * i.qty, 0);
  document.getElementById('viewOrderTotals').innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:6px;color:var(--text3)">
      <span>Subtotal</span><span>₱${fmt(subtotal)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:1rem;font-weight:800;color:var(--orange)">
      <span>TOTAL</span><span>₱${fmt(subtotal)}</span>
    </div>
  `;
}

function editOrderQty(idx, delta) {
  editingOrderItems[idx].qty += delta;
  if (editingOrderItems[idx].qty <= 0) {
    editingOrderItems.splice(idx, 1);
  }
  renderViewOrderItems();
}

function editOrderSetQty(idx, val) {
  const q = parseInt(val) || 1;
  editingOrderItems[idx].qty = Math.max(1, q);
  renderViewOrderItems();
}

function editOrderRemove(idx) {
  editingOrderItems.splice(idx, 1);
  renderViewOrderItems();
}

function saveOrderEdits() {
  const orderIdx = posState.orders.findIndex(o => o.id === editingOrderId);
  if (orderIdx < 0) return;

  if (!editingOrderItems.length) {
    showToast('Order must have at least one item.', 'error');
    return;
  }

  const subtotal = editingOrderItems.reduce((s, i) => s + i.price * i.qty, 0);
  posState.orders[orderIdx].items = editingOrderItems;
  posState.orders[orderIdx].subtotal = subtotal;
  posState.orders[orderIdx].total = subtotal - (posState.orders[orderIdx].discountAmt || 0);

  savePos();
  closeModal('viewOrderModal');
  renderOrderHistory();
  renderSummary();
  showToast('✅ Order updated!', 'success');
}

// =================== INVENTORY SYSTEM ===================
// SHARED inventory — all cashiers use the same store.
// The closing inventory of one shift seeds the opening of the next.
const INV_STORE_KEY = 'burgerStreetSharedInventory';
const SHARED_DELIVERY_KEY = 'burgerStreetSharedDeliveries';

function loadInventoryData() {
  try {
    const s = localStorage.getItem(INV_STORE_KEY);
    return s ? JSON.parse(s) : {};
  } catch(e) { return {}; }
}

function saveInventoryData(data) {
  try { localStorage.setItem(INV_STORE_KEY, JSON.stringify(data)); } catch(e) {}
}

// Shared deliveries (visible to all cashiers)
function loadSharedDeliveries() {
  try {
    const s = localStorage.getItem(SHARED_DELIVERY_KEY);
    return s ? JSON.parse(s) : [];
  } catch(e) { return []; }
}
function saveSharedDeliveries(arr) {
  try { localStorage.setItem(SHARED_DELIVERY_KEY, JSON.stringify(arr)); } catch(e) {}
}

// Returns the active shift for a dateKey from the inventory data.
// A "day" can have multiple shifts: data[dateKey].shifts = [{opening, closing, cashier, startedAt}, ...]
// For backward compat, a day with only data[dateKey].opening/closing is treated as shifts[0].
function getDayShifts(dateKey, data) {
  const dayData = data[dateKey] || {};
  if (dayData.shifts && dayData.shifts.length) return dayData.shifts;
  // Migrate legacy single opening/closing to shifts array format (read-only, don't save)
  const shift = {};
  if (dayData.opening) shift.opening = dayData.opening;
  if (dayData.closing) shift.closing = dayData.closing;
  return Object.keys(shift).length ? [shift] : [];
}

function getActiveShift(dateKey, data) {
  const shifts = getDayShifts(dateKey, data);
  if (!shifts.length) return null;
  return shifts[shifts.length - 1]; // last shift is active
}

// Auto-seed today's opening from the most recent previous closing (or last shift on same day).
// Called when opening the inventory page if no opening exists for today.
function seedOpeningFromLastClosing(dateKey, invData) {
  const shifts = getDayShifts(dateKey, invData);
  // If there's already a shift today with an opening, don't re-seed
  if (shifts.length && shifts[shifts.length - 1].opening) return;

  // Look for last closing — could be a previous shift on the same day or a previous day
  let lastClosing = null;
  let seededFrom = null;

  // Check other shifts on same day first
  if (shifts.length > 1) {
    const prev = shifts[shifts.length - 2];
    if (prev.closing) { lastClosing = prev.closing; seededFrom = dateKey; }
  }

  // Otherwise look at previous days
  if (!lastClosing) {
    const dates = Object.keys(invData)
      .filter(d => d < dateKey)
      .sort();
    for (let i = dates.length - 1; i >= 0; i--) {
      const prevShifts = getDayShifts(dates[i], invData);
      const lastPrevShift = prevShifts[prevShifts.length - 1];
      if (lastPrevShift && lastPrevShift.closing) {
        lastClosing = lastPrevShift.closing;
        seededFrom = dates[i];
        break;
      }
    }
  }

  if (!lastClosing) return;

  const newOpening = {
    ingredients: (lastClosing.ingredients || []).map(i => ({
      name: i.name, unit: i.unit, qty: i.closingQty ?? i.qty ?? 0
    })),
    amounts: (lastClosing.amounts || []).map(a => ({
      name: a.name, amount: a.closingAmount ?? a.amount ?? 0
    })),
    seededFrom
  };

  if (!invData[dateKey]) invData[dateKey] = {};
  // Save as shifts array
  if (!invData[dateKey].shifts) invData[dateKey].shifts = [{}];
  invData[dateKey].shifts[invData[dateKey].shifts.length - 1].opening = newOpening;
  // Clear legacy keys to avoid confusion
  delete invData[dateKey].opening;
  delete invData[dateKey].closing;
  saveInventoryData(invData);
}


function getTodayInvKey() {
  const d = document.getElementById('inventoryDate')?.value || getLocalDateKey();
  return d;
}
// Alias used by recipe row renderer
function getInvData() { return loadInventoryData(); }
function getTodayKey() { return getLocalDateKey(); }

let invModalType = 'opening'; // 'opening' | 'closing'
// Two separate arrays for the two sections
let invIngredients = []; // { name, unit, qty }            — count-based
let invAmounts    = []; // { name, amount }               — peso-based (opening)
                        // closing adds: closingAmount, notes

// ---- OPEN MODAL ----
function openInvModal(type) {
  invModalType = type;
  const dateKey = getTodayInvKey();
  const data = loadInventoryData();
  const activeShift = getActiveShift(dateKey, data) || {};

  document.getElementById('invModalTitle').textContent =
    type === 'opening' ? '🌅 Set Opening Inventory' : '🌙 Set Closing Inventory';

  if (type === 'opening') {
    const op = activeShift.opening || {};
    invIngredients = (op.ingredients || [
      { name: 'Burger Patty', unit: 'pcs', qty: 0 },
      { name: 'Burger Buns',  unit: 'pcs', qty: 0 },
      { name: 'Cheese Slice', unit: 'pcs', qty: 0 }
    ]).map(i => ({...i}));
    invAmounts = (op.amounts || [
      { name: 'Pocket Money / Change', amount: 0 }
    ]).map(a => ({...a}));
    document.getElementById('invIngDesc').textContent = 'How many of each ingredient/supply do you have for today? (count in pieces, packs, bags, etc.)';
    document.getElementById('invAmtDesc').textContent = 'Enter the peso amount for today. (e.g. pocket money for change, petty cash, fund)';
  } else {
    const op = activeShift.opening || {};
    const cl = activeShift.closing || {};
    if (cl.ingredients && cl.ingredients.length) {
      invIngredients = cl.ingredients.map(i => ({...i}));
    } else {
      invIngredients = (op.ingredients || []).map(i => ({
        ...i, closingQty: Math.max(0, (i.qty||0) - (i.usedQty||0))
      }));
    }
    if (cl.amounts && cl.amounts.length) {
      invAmounts = cl.amounts.map(a => ({...a}));
    } else {
      invAmounts = (op.amounts || []).map(a => ({...a, closingAmount: a.amount, notes: ''}));
    }
    document.getElementById('invIngDesc').textContent = 'How many of each ingredient/supply is LEFT at the end of the shift?';
    document.getElementById('invAmtDesc').textContent = 'How much cash / amount is LEFT at the end of the shift?';
  }

  renderInvModal();
  document.getElementById('invModal').classList.remove('hidden');
}

// ---- RENDER MODAL ----
function renderInvModal() {
  const isClosing = invModalType === 'closing';

  // --- INGREDIENTS section ---
  const ingHeader = document.getElementById('invIngHeader');
  const ingList   = document.getElementById('invIngList');

  if (!isClosing) {
    ingHeader.style.gridTemplateColumns = '1fr 90px 90px 32px';
    ingHeader.innerHTML = `
      <span style="font-size:0.72rem;color:var(--text3);font-weight:700;letter-spacing:1px;">INGREDIENT / SUPPLY</span>
      <span style="font-size:0.72rem;color:var(--text3);font-weight:700;letter-spacing:1px;">UNIT</span>
      <span style="font-size:0.72rem;color:var(--text3);font-weight:700;letter-spacing:1px;">QTY FOR TODAY</span>
      <span></span>`;

    ingList.innerHTML = invIngredients.map((ing, idx) => `
      <div style="display:grid;grid-template-columns:1fr 90px 90px 32px;gap:8px;align-items:center;margin-bottom:8px;">
        <input type="text" class="input-field" value="${escHtml(ing.name||'')}" placeholder="e.g. Burger Patty"
          style="padding:7px 10px;font-size:0.85rem;"
          oninput="invIngredients[${idx}].name=this.value" />
        <input type="text" class="input-field" value="${escHtml(ing.unit||'pcs')}" placeholder="pcs"
          style="padding:7px 10px;font-size:0.85rem;text-align:center;"
          oninput="invIngredients[${idx}].unit=this.value" />
        <input type="number" class="input-field" value="${ing.qty||0}" min="0" step="1" placeholder="0"
          style="padding:7px 10px;font-size:0.92rem;font-weight:800;text-align:center;color:var(--orange);"
          oninput="invIngredients[${idx}].qty=parseInt(this.value)||0" />
        <button class="inv-del-btn" onclick="removeIngredient(${idx})">✕</button>
      </div>`).join('');

  } else {
    // Closing ingredients: show opening qty, input closing qty
    ingHeader.style.gridTemplateColumns = '1fr 70px 90px 90px 90px';
    ingHeader.innerHTML = `
      <span style="font-size:0.72rem;color:var(--text3);font-weight:700;letter-spacing:1px;">INGREDIENT / SUPPLY</span>
      <span style="font-size:0.72rem;color:var(--text3);font-weight:700;letter-spacing:1px;">UNIT</span>
      <span style="font-size:0.72rem;color:var(--text3);font-weight:700;letter-spacing:1px;color:var(--blue);">STARTED WITH</span>
      <span style="font-size:0.72rem;color:var(--text3);font-weight:700;letter-spacing:1px;color:var(--green);">LEFT OVER</span>
      <span style="font-size:0.72rem;color:var(--text3);font-weight:700;letter-spacing:1px;color:var(--orange);">ACTUAL COUNT</span>`;

    ingList.innerHTML = invIngredients.map((ing, idx) => {
      const leftOver = ing.closingQty ?? ing.qty ?? 0;
      const actual = ing.actualQty ?? '';
      const hasActual = ing.actualQty !== undefined && ing.actualQty !== null && ing.actualQty !== '';
      const diff = hasActual ? (ing.actualQty - leftOver) : null;
      const diffColor = diff === null ? '' : diff === 0 ? 'var(--green)' : 'var(--red)';
      const diffLabel = diff === null ? '' : diff === 0 ? '✓' : (diff > 0 ? `+${diff}` : `${diff}`);
      return `
      <div style="display:grid;grid-template-columns:1fr 70px 90px 90px 90px;gap:8px;align-items:center;margin-bottom:8px;">
        <div style="font-weight:700;font-size:0.88rem;">${escHtml(ing.name||'Item')}</div>
        <div style="font-size:0.8rem;color:var(--text3);text-align:center;">${escHtml(ing.unit||'pcs')}</div>
        <div style="text-align:center;font-weight:800;color:var(--blue);font-size:0.95rem;">${ing.qty||0}</div>
        <input type="number" class="input-field" value="${leftOver}" min="0" step="1" placeholder="0"
          style="padding:7px 6px;font-size:0.92rem;font-weight:800;text-align:center;color:var(--green);border-color:rgba(16,185,129,0.4);"
          oninput="invIngredients[${idx}].closingQty=parseInt(this.value)||0;renderInvModal()" />
        <div style="position:relative;">
          <input type="number" class="input-field" value="${hasActual ? ing.actualQty : ''}" min="0" step="1" placeholder="recount"
            style="padding:7px 6px;font-size:0.92rem;font-weight:800;text-align:center;color:var(--orange);border-color:rgba(251,146,60,0.4);width:100%;"
            oninput="invIngredients[${idx}].actualQty=this.value===''?null:parseInt(this.value);renderInvModal()" />
          ${diffLabel ? `<div style="position:absolute;right:4px;bottom:-16px;font-size:0.68rem;font-weight:800;color:${diffColor};">${diffLabel}</div>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  document.getElementById('invIngBadge').textContent = `${invIngredients.length} item${invIngredients.length !== 1 ? 's' : ''}`;

  // --- AMOUNTS section ---
  const amtHeader = document.getElementById('invAmtHeader');
  const amtList   = document.getElementById('invAmtList');

  if (!isClosing) {
    amtHeader.style.gridTemplateColumns = '1fr 130px 32px';
    amtHeader.innerHTML = `
      <span style="font-size:0.72rem;color:var(--text3);font-weight:700;letter-spacing:1px;">DESCRIPTION</span>
      <span style="font-size:0.72rem;color:var(--blue);font-weight:700;letter-spacing:1px;">AMOUNT FOR TODAY (₱)</span>
      <span></span>`;

    amtList.innerHTML = invAmounts.map((amt, idx) => `
      <div style="display:grid;grid-template-columns:1fr 130px 32px;gap:8px;align-items:center;margin-bottom:8px;">
        <input type="text" class="input-field" value="${escHtml(amt.name||'')}" placeholder="e.g. Pocket Money"
          style="padding:7px 10px;font-size:0.85rem;"
          oninput="invAmounts[${idx}].name=this.value;updateInvTotal()" />
        <input type="number" class="input-field" value="${amt.amount||0}" min="0" step="0.01" placeholder="0.00"
          style="padding:7px 10px;font-size:0.92rem;font-weight:800;text-align:center;color:var(--blue);border-color:rgba(59,130,246,0.4);"
          oninput="invAmounts[${idx}].amount=parseFloat(this.value)||0;updateInvTotal()" />
        <button class="inv-del-btn" onclick="removeAmount(${idx})">✕</button>
      </div>`).join('');

  } else {
    // Closing amounts: show opening amount, input what's left
    amtHeader.style.gridTemplateColumns = '1fr 110px 110px';
    amtHeader.innerHTML = `
      <span style="font-size:0.72rem;color:var(--text3);font-weight:700;letter-spacing:1px;">DESCRIPTION</span>
      <span style="font-size:0.72rem;color:var(--blue);font-weight:700;letter-spacing:1px;">STARTED WITH (₱)</span>
      <span style="font-size:0.72rem;color:var(--green);font-weight:700;letter-spacing:1px;">AMOUNT LEFT (₱)</span>`;

    amtList.innerHTML = invAmounts.map((amt, idx) => `
      <div style="margin-bottom:12px;">
        <div style="display:grid;grid-template-columns:1fr 110px 110px;gap:8px;align-items:center;margin-bottom:4px;">
          <div style="font-weight:700;font-size:0.88rem;">${escHtml(amt.name||'Amount')}</div>
          <div style="text-align:center;font-weight:800;color:var(--blue);font-size:0.95rem;">₱${fmt(amt.amount||0)}</div>
          <input type="number" class="input-field" value="${amt.closingAmount ?? amt.amount ?? 0}" min="0" step="0.01" placeholder="0.00"
            style="padding:7px 10px;font-size:0.92rem;font-weight:800;text-align:center;color:var(--green);border-color:rgba(16,185,129,0.4);"
            oninput="invAmounts[${idx}].closingAmount=parseFloat(this.value)||0;updateInvTotal()" />
        </div>
        <input type="text" class="input-field" value="${escHtml(amt.notes||'')}" placeholder="Notes (optional)..."
          style="width:100%;padding:5px 9px;color:var(--text3);font-size:0.78rem;"
          oninput="invAmounts[${idx}].notes=this.value" />
      </div>`).join('');
  }

  document.getElementById('invAmtBadge').textContent = `${invAmounts.length} item${invAmounts.length !== 1 ? 's' : ''}`;
  updateInvTotal();
}

function addIngredient() {
  invIngredients.push({ name: '', unit: 'pcs', qty: 0 });
  renderInvModal();
}
function removeIngredient(idx) {
  invIngredients.splice(idx, 1);
  renderInvModal();
}
function addAmount() {
  invAmounts.push({ name: '', amount: 0 });
  renderInvModal();
}
function removeAmount(idx) {
  invAmounts.splice(idx, 1);
  renderInvModal();
}

function updateInvTotal() {
  // Total = sum of all amounts (peso values only; qty is just count, no peso value)
  const isClosing = invModalType === 'closing';
  const total = invAmounts.reduce((s, a) => s + (isClosing ? (a.closingAmount||0) : (a.amount||0)), 0);
  const el = document.getElementById('invModalTotalLabel');
  if (el) el.textContent = `Cash Total: ₱${fmt(total)}`;
}

function saveInvModal() {
  const dateKey = getTodayInvKey();
  const data = loadInventoryData();
  if (!data[dateKey]) data[dateKey] = {};

  // Ensure shifts array exists; migrate legacy opening/closing
  if (!data[dateKey].shifts) {
    const legacy = {};
    if (data[dateKey].opening) { legacy.opening = data[dateKey].opening; delete data[dateKey].opening; }
    if (data[dateKey].closing) { legacy.closing = data[dateKey].closing; delete data[dateKey].closing; }
    data[dateKey].shifts = [legacy];
  }

  const shiftIdx = data[dateKey].shifts.length - 1;
  const shift = data[dateKey].shifts[shiftIdx];
  const cashierName = activeCashier?.name || BIZ_NAME;

  if (invModalType === 'opening') {
    const ings = invIngredients.filter(i => i.name && i.name.trim());
    const amts = invAmounts.filter(a => a.name && a.name.trim());
    if (!ings.length && !amts.length) { showToast('Please add at least one item.', 'error'); return; }
    shift.opening = { ingredients: ings, amounts: amts, cashier: cashierName, savedAt: new Date().toLocaleTimeString('en-PH', {hour:'2-digit',minute:'2-digit'}) };
  } else {
    shift.closing = {
      ingredients: invIngredients.map(i => ({...i})),
      amounts: invAmounts.map(a => ({...a})),
      cashier: cashierName,
      savedAt: new Date().toLocaleTimeString('en-PH', {hour:'2-digit',minute:'2-digit'})
    };
  }

  saveInventoryData(data);
  closeModal('invModal');
  renderInventory();
  showToast(invModalType === 'opening' ? '✅ Opening inventory saved!' : '✅ Closing inventory saved!', 'success');
}

// Called when a cashier clicks "Start New Shift" — seeds a new shift from current closing
function startNewShift() {
  const dateKey = getTodayInvKey();
  const data = loadInventoryData();
  if (!data[dateKey]) return;

  // Ensure shifts array
  if (!data[dateKey].shifts) {
    const legacy = {};
    if (data[dateKey].opening) { legacy.opening = data[dateKey].opening; delete data[dateKey].opening; }
    if (data[dateKey].closing) { legacy.closing = data[dateKey].closing; delete data[dateKey].closing; }
    data[dateKey].shifts = [legacy];
  }

  const lastShift = data[dateKey].shifts[data[dateKey].shifts.length - 1];
  if (!lastShift.closing) {
    showToast('Please set a closing inventory for the current shift first.', 'error');
    return;
  }

  // Build new opening from last shift's closing
  const lastClosing = lastShift.closing;
  const cashierName = activeCashier?.name || BIZ_NAME;
  const newShift = {
    opening: {
      ingredients: (lastClosing.ingredients || []).map(i => ({
        name: i.name, unit: i.unit, qty: i.closingQty ?? i.qty ?? 0
      })),
      amounts: (lastClosing.amounts || []).map(a => ({
        name: a.name, amount: a.closingAmount ?? a.amount ?? 0
      })),
      seededFrom: 'previous shift',
      cashier: cashierName,
      savedAt: new Date().toLocaleTimeString('en-PH', {hour:'2-digit',minute:'2-digit'})
    }
  };

  data[dateKey].shifts.push(newShift);
  saveInventoryData(data);
  renderInventory();
  showToast(`✅ New shift started! Opening seeded from previous shift's closing.`, 'success');
}

function renderInventory() {
  const dateKey = getTodayInvKey();
  let data = loadInventoryData();
  // Auto-seed opening from last shift closing if not yet set
  const existingShifts = getDayShifts(dateKey, data);
  if (!existingShifts.length || !existingShifts[existingShifts.length - 1].opening) {
    seedOpeningFromLastClosing(dateKey, data);
    data = loadInventoryData();
  }

  const dayShifts = getDayShifts(dateKey, data);
  const shiftCount = dayShifts.length;
  const activeShift = dayShifts[shiftCount - 1] || {};
  const op = activeShift.opening || {};
  const cl = activeShift.closing || {};

  const openIngredients = op.ingredients || [];
  const openAmounts     = op.amounts     || [];
  const closeIngredients = cl.ingredients || [];
  const closeAmounts     = cl.amounts     || [];

  const emptyEl       = document.getElementById('invEmptyState');
  const summaryCards  = document.getElementById('invSummaryCards');
  const compareGrid   = document.getElementById('invCompareGrid');
  const reportSection = document.getElementById('invReportSection');

  const hasOpening = openIngredients.length > 0 || openAmounts.length > 0;
  if (!hasOpening) {
    emptyEl.style.display = 'block';
    summaryCards.style.display = 'none';
    compareGrid.style.display = 'none';
    reportSection.style.display = 'none';
    return;
  }

  emptyEl.style.display = 'none';
  summaryCards.style.display = 'grid';
  compareGrid.style.display = 'grid';

  // Summary numbers (only amounts have ₱ value)
  const openAmtTotal  = openAmounts.reduce((s, a) => s + (a.amount||0), 0);
  const closeAmtTotal = closeAmounts.reduce((s, a) => s + (a.closingAmount||0), 0);
  const usedAmt = Math.max(0, openAmtTotal - closeAmtTotal);

  const hasClosingAmounts = closeAmounts.length > 0;
  document.getElementById('invOpenTotal').textContent  = '₱' + fmt(openAmtTotal);
  document.getElementById('invExpenses').textContent   = '₱0.00'; // reserved for future
  document.getElementById('invUsed').textContent       = hasClosingAmounts ? '₱' + fmt(usedAmt) : '—';
  document.getElementById('invCloseTotal').textContent = hasClosingAmounts ? '₱' + fmt(closeAmtTotal) : '—';

  // ---- Opening list ----
  const openingList = document.getElementById('invOpeningList');
  let openHTML = '';

  // Show a banner if opening was auto-seeded from previous shift's closing
  if (op.seededFrom) {
    const prevDate = new Date(op.seededFrom + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
    openHTML += `<div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:10px;padding:8px 12px;margin-bottom:12px;font-size:0.8rem;color:var(--green);font-weight:700;">
      🔄 Auto-filled from previous shift closing (${prevDate})
    </div>`;
  }

  if (openIngredients.length) {
    openHTML += `<div style="font-size:0.72rem;font-weight:800;color:var(--orange);letter-spacing:1px;margin-bottom:6px;text-transform:uppercase;">🥩 Ingredients/Supplies</div>`;
    openHTML += openIngredients.map(i => `
      <div class="inv-list-item">
        <div>
          <span style="font-weight:700;">${escHtml(i.name)}</span>
          <span style="font-size:0.72rem;color:var(--text3);margin-left:6px;">${escHtml(i.unit||'pcs')}</span>
          ${i.usedQty > 0 ? `<span style="font-size:0.72rem;color:var(--red);margin-left:6px;">-${i.usedQty} sold</span>` : ''}
        </div>
        <div style="text-align:right;">
          <span style="font-weight:800;color:var(--orange);">${i.qty||0} <span style="font-size:0.72rem;color:var(--text3);">${escHtml(i.unit||'pcs')}</span></span>
          ${i.usedQty > 0 ? `<div style="font-size:0.72rem;color:var(--green);font-weight:700;">${Math.max(0,(i.qty||0)-(i.usedQty||0))} left</div>` : ''}
        </div>
      </div>`).join('');
  }

  if (openAmounts.length) {
    openHTML += `<div style="font-size:0.72rem;font-weight:800;color:var(--blue);letter-spacing:1px;margin:12px 0 6px;text-transform:uppercase;">💵 Cash / Amounts</div>`;
    openHTML += openAmounts.map(a => `
      <div class="inv-list-item">
        <span style="font-weight:700;">${escHtml(a.name)}</span>
        <span style="font-weight:800;color:var(--blue);">₱${fmt(a.amount||0)}</span>
      </div>`).join('');
    openHTML += `<div style="display:flex;justify-content:space-between;padding-top:10px;font-weight:800;font-size:0.9rem;border-top:1px dashed var(--border);margin-top:8px;">
      <span>CASH TOTAL</span><span style="color:var(--blue);">₱${fmt(openAmtTotal)}</span></div>`;
  }

  openingList.innerHTML = openHTML || `<p style="color:var(--text3);font-size:0.85rem;text-align:center;padding:16px 0;">No opening inventory set.</p>`;

  // ---- Closing list ----
  const closingList = document.getElementById('invClosingList');
  const hasClosing = closeIngredients.length > 0 || closeAmounts.length > 0;

  if (hasClosing) {
    let closeHTML = '';

    if (closeIngredients.length) {
      closeHTML += `<div style="font-size:0.72rem;font-weight:800;color:var(--orange);letter-spacing:1px;margin-bottom:6px;text-transform:uppercase;">🥩 Ingredients/Supplies Left</div>`;
      closeHTML += closeIngredients.map(i => {
        const openIng = openIngredients.find(o => o.name === i.name);
        const usedQty = openIng ? Math.max(0, (openIng.qty||0) - (i.closingQty||0)) : 0;
        return `
          <div class="inv-list-item">
            <div>
              <span style="font-weight:700;">${escHtml(i.name)}</span>
              ${usedQty > 0 ? `<span style="font-size:0.72rem;color:var(--red);margin-left:6px;">-${usedQty} used</span>` : ''}
            </div>
            <span style="font-weight:800;color:var(--green);">${i.closingQty||0} <span style="font-size:0.72rem;color:var(--text3);">${escHtml(i.unit||'pcs')}</span></span>
          </div>`;
      }).join('');
    }

    if (closeAmounts.length) {
      closeHTML += `<div style="font-size:0.72rem;font-weight:800;color:var(--blue);letter-spacing:1px;margin:12px 0 6px;text-transform:uppercase;">💵 Cash Left</div>`;
      closeHTML += closeAmounts.map(a => `
        <div class="inv-list-item">
          <div>
            <span style="font-weight:700;">${escHtml(a.name)}</span>
            ${(a.notes) ? `<span style="font-size:0.72rem;color:var(--text3);margin-left:6px;">${escHtml(a.notes)}</span>` : ''}
          </div>
          <span style="font-weight:800;color:var(--green);">₱${fmt(a.closingAmount||0)}</span>
        </div>`).join('');
      closeHTML += `<div style="display:flex;justify-content:space-between;padding-top:10px;font-weight:800;font-size:0.9rem;border-top:1px dashed var(--border);margin-top:8px;">
        <span>CASH LEFT</span><span style="color:var(--green);">₱${fmt(closeAmtTotal)}</span></div>`;
    }

    // Cashier tag for closing
    if (cl.cashier) {
      closeHTML = `<div style=\"font-size:0.75rem;color:var(--text3);margin-bottom:10px;\">👤 <b>${escHtml(cl.cashier)}</b>${cl.savedAt ? ' · ' + cl.savedAt : ''}</div>` + closeHTML;
    }
    // Start New Shift button — only on today
    const _todayKey = getLocalDateKey();
    if (dateKey === _todayKey) {
      closeHTML += `<div style=\"margin-top:16px;\">
        <button class=\"btn btn-primary\" style=\"width:100%;font-size:0.88rem;\" onclick=\"startNewShift()\">
          🔄 Start New Shift (Next Cashier)
        </button>
      </div>`;
    }
    closingList.innerHTML = closeHTML;
    document.getElementById('btnSetClosing').textContent = '✏️ Edit';
    document.getElementById('btnSetClosing').className = 'btn btn-outline btn-sm';
  } else {
    closingList.innerHTML = `<p style="color:var(--text3);font-size:0.85rem;text-align:center;padding:16px 0;">Not yet set. Click "+ Set Closing" to add.</p>`;
  }

  // ---- Report section ----
  if (hasClosing) {
    reportSection.style.display = 'block';
    const tbody = document.getElementById('invReportBody');
    let rows = '';

    // Ingredient rows
    const allIngNames = [...new Set([
      ...openIngredients.map(i => i.name),
      ...closeIngredients.map(i => i.name)
    ])];
    allIngNames.forEach(name => {
      const opI = openIngredients.find(i => i.name === name);
      const clI = closeIngredients.find(i => i.name === name);
      const startQty = opI ? (opI.qty||0) : 0;
      const endQty   = clI ? (clI.closingQty ?? clI.qty ?? 0) : 0;
      const usedQty  = Math.max(0, startQty - endQty);
      const unit     = opI ? (opI.unit||'pcs') : (clI ? clI.unit||'pcs' : 'pcs');
      const hasActual = clI && clI.actualQty !== undefined && clI.actualQty !== null && clI.actualQty !== '';
      const actualQty = hasActual ? clI.actualQty : null;
      const variance  = hasActual ? (actualQty - endQty) : null;
      const varianceColor = variance === null ? '' : variance === 0 ? 'var(--green)' : 'var(--red)';
      const varianceLabel = variance === null ? '—' : variance === 0 ? '✓ Match' : (variance > 0 ? `+${variance} over` : `${variance} short`);

      let statusTag = '';
      if (variance !== null && variance !== 0) statusTag = `<span class="inv-status-tag inv-tag-low">⚠️ Variance</span>`;
      else if (usedQty === 0 && startQty > 0) statusTag = `<span class="inv-status-tag inv-tag-ok">✓ Full</span>`;
      else if (endQty === 0 && startQty > 0) statusTag = `<span class="inv-status-tag inv-tag-low">⚡ Empty</span>`;
      else if (endQty < startQty * 0.2 && startQty > 0) statusTag = `<span class="inv-status-tag inv-tag-low">⚡ Low</span>`;
      else statusTag = `<span class="inv-status-tag inv-tag-ok">✓ OK</span>`;

      rows += `<tr>
        <td><strong>${escHtml(name)}</strong> <span style="font-size:0.72rem;color:var(--text3);">(qty)</span></td>
        <td style="color:var(--orange);">${startQty} ${escHtml(unit)}</td>
        <td style="color:var(--green);">${endQty} ${escHtml(unit)}</td>
        <td style="color:${usedQty>0?'var(--red)':'var(--text3)'};">${usedQty > 0 ? '-'+usedQty+' '+escHtml(unit) : '—'}</td>
        <td style="color:var(--orange);font-weight:800;">${hasActual ? actualQty+' '+escHtml(unit) : '<span style="color:var(--text3);font-size:0.78rem;">not recounted</span>'}</td>
        <td style="color:${varianceColor};font-weight:800;">${varianceLabel}</td>
        <td>${statusTag}</td>
      </tr>`;
    });

    // Amount rows
    const allAmtNames = [...new Set([
      ...openAmounts.map(a => a.name),
      ...closeAmounts.map(a => a.name)
    ])];
    allAmtNames.forEach(name => {
      const opA = openAmounts.find(a => a.name === name);
      const clA = closeAmounts.find(a => a.name === name);
      const startAmt = opA ? (opA.amount||0) : 0;
      const endAmt   = clA ? (clA.closingAmount ?? clA.amount ?? 0) : 0;
      const usedAmt2 = Math.max(0, startAmt - endAmt);
      const notes    = clA ? (clA.notes||'') : '';

      let statusTag = '';
      if (!clA) statusTag = `<span class="inv-status-tag inv-tag-na">Not Closed</span>`;
      else if (usedAmt2 === 0) statusTag = `<span class="inv-status-tag inv-tag-ok">✓ Full</span>`;
      else if (endAmt < startAmt * 0.2 && startAmt > 0) statusTag = `<span class="inv-status-tag inv-tag-low">⚡ Low</span>`;
      else statusTag = `<span class="inv-status-tag inv-tag-ok">✓ OK</span>`;

      rows += `<tr>
        <td><strong>${escHtml(name)}</strong> <span style="font-size:0.72rem;color:var(--blue);">(₱)</span></td>
        <td style="color:var(--blue);">₱${fmt(startAmt)}</td>
        <td style="color:var(--green);">₱${fmt(endAmt)}</td>
        <td style="color:${usedAmt2>0?'var(--red)':'var(--text3)'};">${usedAmt2 > 0 ? '-₱'+fmt(usedAmt2) : '₱0.00'}</td>
        <td>${statusTag}</td>
        <td style="font-size:0.78rem;color:var(--text3);">${escHtml(notes)||'—'}</td>
      </tr>`;
    });

    tbody.innerHTML = rows;

    // Balance check (amounts only)
    const isBalanced = Math.abs(openAmtTotal - closeAmtTotal - usedAmt) < 0.01;
    const balanceEl = document.getElementById('invBalanceCheck');
    balanceEl.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:14px;">
        <div style="text-align:center;">
          <div style="font-size:0.72rem;color:var(--text3);font-weight:700;letter-spacing:1px;margin-bottom:4px;">OPENING CASH</div>
          <div style="font-size:1.2rem;font-weight:800;color:var(--blue);">₱${fmt(openAmtTotal)}</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:0.72rem;color:var(--text3);font-weight:700;letter-spacing:1px;margin-bottom:4px;">CASH USED</div>
          <div style="font-size:1.2rem;font-weight:800;color:var(--red);">-₱${fmt(usedAmt)}</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:0.72rem;color:var(--text3);font-weight:700;letter-spacing:1px;margin-bottom:4px;">CLOSING CASH</div>
          <div style="font-size:1.2rem;font-weight:800;color:var(--green);">₱${fmt(closeAmtTotal)}</div>
        </div>
      </div>
      <div style="padding:14px 20px;border-radius:12px;text-align:center;background:${isBalanced?'rgba(16,185,129,0.12)':'rgba(239,68,68,0.1)'};border:2px solid ${isBalanced?'rgba(16,185,129,0.4)':'rgba(239,68,68,0.4)'};">
        ${isBalanced
          ? `<span style="font-size:1.3rem;">✅</span> <span style="font-weight:800;color:var(--green);font-size:1rem;">Cash Balanced!</span> <span style="font-size:0.85rem;color:var(--text3);">Opening and closing cash match.</span>`
          : `<span style="font-size:1.3rem;">⚠️</span> <span style="font-weight:800;color:#ef4444;font-size:1rem;">Cash Discrepancy: ₱${fmt(Math.abs(openAmtTotal - closeAmtTotal - usedAmt))}</span>`}
      </div>`;
    balanceEl.style.background = 'var(--card-bg)';
    balanceEl.style.borderColor = isBalanced ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)';
  } else {
    reportSection.style.display = 'none';
  }
}

// =================== PRINT ===================
const printStyle = `
  @media print {
    body > * { display: none !important; }
    #receiptModal { display: block !important; position: static !important; background: none !important; }
    #receiptModal .modal-box { box-shadow: none !important; border: none !important; max-width: 100% !important; }
    #receiptModal .modal-header, #receiptModal .modal-footer { display: none !important; }
    .receipt-biz-name { color: #000 !important; }
    * { color: #000 !important; background: #fff !important; }
  }
`;
const styleEl = document.createElement('style');
styleEl.textContent = printStyle;
document.head.appendChild(styleEl);
