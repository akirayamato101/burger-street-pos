/* =============================================
   BURGER STREET POS — MAIN APP LOGIC
   All data operations use db.js (Dexie/IndexedDB)
   ============================================= */

// =================== CONSTANTS ===================
const CASHIER_PIN  = '0000';
const CASHIER_NAME = 'Cashier 1';
const BIZ_NAME     = 'Burger Street';

// =================== RUNTIME STATE ===================
let appSettings   = { pin: CASHIER_PIN, cashierName: CASHIER_NAME, theme: 'dark', pinEnabled: false };
let orderCounter  = 1;

let cart          = [];
let discountType  = 'pct';
let payMethod     = 'Cash';
let activePage    = 'pos';
let allProducts   = [];
let activeCategory = 'All';

// =================== INIT ===================
document.addEventListener('DOMContentLoaded', async () => {
  // Load settings from DB
  const savedSettings = await dbGetSetting('appSettings', null);
  if (savedSettings) appSettings = { ...appSettings, ...savedSettings };

  orderCounter = await dbGetOrderCounter();

  updateDate();
  setInterval(updateDate, 60000);

  const today = new Date().toISOString().split('T')[0];
  const filterDate  = document.getElementById('filterDate');
  const summaryDate = document.getElementById('summaryDate');
  const inventoryDate = document.getElementById('inventoryDate');
  if (filterDate)   filterDate.value   = today;
  if (summaryDate)  summaryDate.value  = today;
  if (inventoryDate) inventoryDate.value = today;

  // Show lock screen if PIN is enabled, otherwise go straight in
  if (appSettings.pinEnabled) {
    document.getElementById('lockScreen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    pinBuffer = '';
    updatePinDots();
    document.getElementById('pinError').classList.add('hidden');
  } else {
    unlockApp();
  }
});

async function saveAppSettings() {
  await dbSetSetting('appSettings', appSettings);
}

function updateDate() {
  const el = document.getElementById('currentDate');
  if (el) el.textContent = new Date().toLocaleDateString('en-PH', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });
}

// =================== LOCK SCREEN ===================
let pinBuffer = '';

function enterPin(digit) {
  if (pinBuffer.length >= 4) return;
  pinBuffer += digit;
  updatePinDots();
  if (pinBuffer.length === 4) {
    setTimeout(() => {
      const pin = appSettings.pin || CASHIER_PIN;
      if (pinBuffer === pin) {
        unlockApp();
        showToast(`Welcome, ${appSettings.cashierName || CASHIER_NAME}! 👋`, 'success');
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

async function unlockApp() {
  pinBuffer = '';
  document.getElementById('lockScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  const name = appSettings.cashierName || CASHIER_NAME;
  document.getElementById('cashierName').textContent = name;

  updateOrderNumDisplay();
  await buildMenuGrid();
  updateTotals();
  await renderOrderHistory();
  await renderSummary();
  await refreshProductList();
  refreshSettingsPage();
  await renderDeliveryLog();
  await renderCashAdvanceLog();
}

function logOut() {
  if (!appSettings.pinEnabled) {
    showToast('PIN lock is not enabled. Enable it in Settings.', 'error');
    return;
  }
  document.getElementById('lockScreen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  pinBuffer = '';
  updatePinDots();
  document.getElementById('pinError').classList.add('hidden');
}

// =================== NAVIGATION ===================
async function showPage(page) {
  activePage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');
  document.querySelectorAll(`[data-page="${page}"]`).forEach(n => n.classList.add('active'));

  const titles = {
    pos: 'New Order', orders: 'Order History', summary: 'My Summary',
    products: 'Manage Products', settings: 'Settings', inventory: 'Daily Inventory'
  };
  document.getElementById('pageTitle').textContent = titles[page] || page;

  const floatBtn = document.getElementById('floatCartBtn');
  if (floatBtn) floatBtn.classList.toggle('float-cart-hidden', page !== 'pos');

  const pc = document.getElementById('pageContent');
  if (pc) pc.scrollTop = 0;
  if (pageEl) pageEl.scrollTop = 0;

  closeSidebar();

  if (page === 'orders')   await renderOrderHistory();
  if (page === 'summary')  await renderSummary();
  if (page === 'products') await refreshProductList();
  if (page === 'settings') refreshSettingsPage();
  if (page === 'inventory') { await renderInventory(); await renderDeliveryLog(); await renderCashAdvanceLog(); }
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
async function buildMenuGrid() {
  allProducts = await dbGetProducts();
  // Map productId back to id field for compatibility
  allProducts = allProducts.map(p => ({ ...p, id: p.productId }));
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
    const cartItem = cart.find(i => i.id == p.productId);
    const qty = cartItem ? cartItem.qty : 0;
    const inCart = qty > 0;
    return `
    <div class="menu-item ${inCart ? 'in-cart' : ''}" id="mc_${p.productId}">
      <div class="menu-item-tap" onclick="menuCardQty('${p.productId}', 1)">
        <span class="menu-item-name">${escHtml(p.name)}</span>
        <span class="menu-item-price">₱${fmt(p.price)}</span>
        <span class="menu-item-cat">${escHtml(p.category || '')}</span>
      </div>
      <div class="menu-item-qty-row">
        <button class="miq-btn miq-minus ${inCart ? '' : 'miq-zero'}" onclick="menuCardQty('${p.productId}', -1)">−</button>
        <span class="miq-count ${inCart ? 'miq-active' : ''}" id="miq_${p.productId}">${qty}</span>
        <button class="miq-btn miq-plus" onclick="menuCardQty('${p.productId}', 1)">+</button>
      </div>
    </div>
  `}).join('');
}

// =================== CART ===================
function menuCardQty(productId, delta) {
  const p = allProducts.find(x => x.productId == productId);
  if (!p) return;

  const existing = cart.find(i => i.id == productId);
  if (existing) {
    existing.qty += delta;
    if (existing.qty <= 0) {
      cart = cart.filter(i => i.id !== productId);
      updateCardDisplay(productId, 0);
      renderCart(); updateTotals(); updateFloatCartBadge();
      return;
    }
  } else {
    if (delta <= 0) return;
    cart.push({ id: p.productId, name: p.name, price: p.price, qty: 1, emoji: getProductEmoji(p) });
  }

  const newQty = cart.find(i => i.id == productId)?.qty || 0;
  updateCardDisplay(productId, newQty);
  renderCart(); updateTotals(); updateFloatCartBadge();
}

function updateCardDisplay(productId, qty) {
  const card = document.getElementById('mc_' + productId);
  if (!card) return;
  const countEl = document.getElementById('miq_' + productId);
  if (countEl) {
    countEl.textContent = qty;
    countEl.classList.toggle('miq-active', qty > 0);
  }
  const minusBtn = card.querySelector('.miq-minus');
  if (minusBtn) minusBtn.classList.toggle('miq-zero', qty === 0);
  card.classList.toggle('in-cart', qty > 0);
}

function removeFromCart(id) {
  cart = cart.filter(i => i.id !== id);
  updateCardDisplay(id, 0);
  renderCart(); updateTotals(); updateFloatCartBadge();
}

function changeQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) { removeFromCart(id); return; }
  renderCart(); updateTotals();
}

function setQty(id, val) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  const q = parseInt(val) || 0;
  if (q <= 0) { removeFromCart(id); return; }
  item.qty = q;
  updateTotals(); updateFloatCartBadge();
}

function renderCart() {
  const list = document.getElementById('orderItemsList');
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

  const discRow = document.getElementById('discountRow');
  if (discRow) discRow.style.display = disc > 0 ? '' : 'none';

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
function updateOrderNumDisplay() {
  const num = String(orderCounter).padStart(3, '0');
  const label = document.getElementById('orderNumLabel');
  const topbarLabel = document.getElementById('topbarOrderNum');
  if (label) label.textContent = `Order #${num}`;
  if (topbarLabel) topbarLabel.textContent = `#${num}`;
}

// =================== PROCESS PAYMENT ===================
async function processPayment() {
  if (!cart.length) return;

  const total = getTotal();
  const cash = parseFloat(document.getElementById('cashTendered')?.value) || 0;

  if (payMethod === 'Cash' && cash < total) {
    showToast('Insufficient cash tendered!', 'error');
    return;
  }

  const change = payMethod === 'Cash' ? cash - total : 0;
  const orderNum = String(orderCounter).padStart(3, '0');

  const order = {
    orderNum,
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
    cashier: appSettings.cashierName || CASHIER_NAME
  };

  await dbSaveOrder(order);
  orderCounter++;
  await dbSetSetting('orderCounter', orderCounter);

  showReceipt(order);
  clearOrder();
  updateOrderNumDisplay();
  showToast('✅ Payment successful!', 'success');
}

function clearOrder() {
  cart.forEach(item => updateCardDisplay(item.id, 0));
  cart = [];
  renderCart(); updateTotals(); updateFloatCartBadge();
  document.getElementById('discountVal').value = 0;
  document.getElementById('cashTendered').value = '';
  updateChange();
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
  const body  = document.getElementById('receiptBody');

  const date    = new Date(order.date);
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
async function renderOrderHistory() {
  const filterDate = document.getElementById('filterDate')?.value || null;
  const orders = await dbGetOrders(filterDate);

  const tbody = document.getElementById('orderHistoryBody');
  if (!orders.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-row">No orders found.</td></tr>`;
    return;
  }

  tbody.innerHTML = orders.map(o => {
    const date     = new Date(o.date);
    const timeStr  = date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
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
        <td><button class="btn-eye" onclick="viewOrder('${o.orderNum}')" title="View & Edit Order">👁</button></td>
      </tr>
    `;
  }).join('');
}

async function clearDateFilter() {
  const filterDate = document.getElementById('filterDate');
  if (filterDate) filterDate.value = '';
  await renderOrderHistory();
}

// =================== SUMMARY ===================
async function renderSummary() {
  const summaryDate = document.getElementById('summaryDate')?.value || new Date().toISOString().split('T')[0];
  const orders = await dbGetOrders(summaryDate);

  const totalSales = orders.reduce((s, o) => s + o.total, 0);
  const count = orders.length;
  const avg   = count > 0 ? totalSales / count : 0;

  const advances   = await dbGetCashAdvances();
  const caTotal    = advances.filter(a => a.datetime.startsWith(summaryDate)).reduce((s, a) => s + (a.amount || 0), 0);
  const netSales   = Math.max(0, totalSales - caTotal);

  document.getElementById('summaryIncome').textContent = '₱' + fmt(totalSales);
  document.getElementById('summaryOrders').textContent = count;
  document.getElementById('summaryAvg').textContent    = '₱' + fmt(avg);

  const caEl  = document.getElementById('summaryCashAdv');
  const netEl = document.getElementById('summaryNet');
  if (caEl)  caEl.textContent  = caTotal > 0 ? '-₱' + fmt(caTotal) : '₱0.00';
  if (netEl) netEl.textContent = '₱' + fmt(netSales);

  // Top items
  const itemMap = {};
  orders.forEach(o => {
    o.items.forEach(i => {
      if (!itemMap[i.name]) itemMap[i.name] = { qty: 0, total: 0, emoji: i.emoji };
      itemMap[i.name].qty   += i.qty;
      itemMap[i.name].total += i.price * i.qty;
    });
  });

  const topItems = Object.entries(itemMap).sort((a, b) => b[1].qty - a[1].qty).slice(0, 6);
  const topEl = document.getElementById('topItemsList');
  if (!topItems.length) {
    topEl.innerHTML = `<p style="color:var(--text3);font-size:0.88rem;text-align:center;padding:24px 0;">No sales data yet.</p>`;
  } else {
    topEl.innerHTML = topItems.map(([name, data]) => `
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
  orders.forEach(o => { payMap[o.payMethod] = (payMap[o.payMethod] || 0) + o.total; });

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
  document.getElementById('confirmMsg').textContent   = msg;
  const btn = document.getElementById('confirmOkBtn');
  btn.onclick = onOk;
  document.getElementById('confirmModal').classList.remove('hidden');
}

// =================== TOAST ===================
let toastTimer;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = 'toast ' + type;
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

// =================== PRODUCT MANAGEMENT ===================
async function refreshProductList() {
  const products = await dbGetProducts();
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
          <button class="btn btn-outline btn-sm" onclick="editProduct('${p.productId}')" style="margin-right:6px;">✏️ Edit</button>
          <button class="btn btn-sm" onclick="deleteProduct('${p.productId}')" style="background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.3);">🗑 Delete</button>
        </td>
      </tr>
    `).join('');
  }
}

function openAddProductModal() {
  document.getElementById('productModalTitle').textContent = 'Add Product';
  document.getElementById('productEditId').value  = '';
  document.getElementById('productName').value    = '';
  document.getElementById('productPrice').value   = '';
  document.getElementById('productCategory').value = '';
  document.getElementById('productModal').classList.remove('hidden');
}

async function editProduct(productId) {
  const products = await dbGetProducts();
  const p = products.find(x => x.productId === productId);
  if (!p) return;
  document.getElementById('productModalTitle').textContent = 'Edit Product';
  document.getElementById('productEditId').value  = p.productId;
  document.getElementById('productName').value    = p.name;
  document.getElementById('productPrice').value   = p.price;
  document.getElementById('productCategory').value = p.category || '';
  document.getElementById('productModal').classList.remove('hidden');
}

async function saveProduct() {
  const name     = document.getElementById('productName').value.trim();
  const price    = parseFloat(document.getElementById('productPrice').value);
  const category = document.getElementById('productCategory').value.trim() || 'Other';
  const editId   = document.getElementById('productEditId').value;

  if (!name)               { showToast('Please enter a product name.', 'error'); return; }
  if (isNaN(price) || price <= 0) { showToast('Please enter a valid price.', 'error'); return; }

  if (editId) {
    const products = await dbGetProducts();
    const existing = products.find(p => p.productId === editId);
    if (existing) {
      await dbSaveProduct({ ...existing, name, price, category });
    }
    showToast('✅ Product updated!', 'success');
  } else {
    const newId = 'cp_' + Date.now();
    await dbSaveProduct({ productId: newId, name, price, category, emoji: getCategoryEmoji(category) });
    showToast('✅ Product added!', 'success');
  }

  closeModal('productModal');
  await refreshProductList();
  await buildMenuGrid();
}

async function deleteProduct(productId) {
  showConfirm('Delete Product?', 'This product will be removed from the menu.', async () => {
    await dbDeleteProduct(productId);
    closeModal('confirmModal');
    await refreshProductList();
    await buildMenuGrid();
    showToast('Product deleted.', '');
  });
}

// =================== SETTINGS ===================
function refreshSettingsPage() {
  const nameInput      = document.getElementById('settingsCashierName');
  const pinStatusLabel = document.getElementById('pinStatusLabel');
  const pinToggleBtn   = document.getElementById('pinToggleBtn');
  const pinSetSection  = document.getElementById('pinSetSection');

  if (nameInput) nameInput.value = appSettings.cashierName || '';

  const enabled = appSettings.pinEnabled || false;
  if (pinStatusLabel) pinStatusLabel.textContent = enabled ? '🔒 PIN Lock: Enabled' : 'PIN Lock: Disabled';
  if (pinToggleBtn)   pinToggleBtn.textContent   = enabled ? 'Disable PIN' : 'Enable PIN';
  if (pinSetSection)  pinSetSection.style.display = enabled ? '' : 'none';
}

async function togglePinEnabled() {
  const enabled = appSettings.pinEnabled || false;
  appSettings.pinEnabled = !enabled;
  await saveAppSettings();
  refreshSettingsPage();
  showToast(appSettings.pinEnabled ? 'PIN lock enabled. Set your PIN below.' : 'PIN lock disabled.', appSettings.pinEnabled ? 'success' : '');
}

async function saveSettings() {
  const name = (document.getElementById('settingsCashierName')?.value || '').trim() || CASHIER_NAME;
  appSettings.cashierName = name;
  await saveAppSettings();
  document.getElementById('cashierName').textContent = name;
  showToast('✅ Settings saved!', 'success');
}

async function savePinSettings() {
  const pin1 = document.getElementById('newPin')?.value || '';
  const pin2 = document.getElementById('confirmPin')?.value || '';

  if (pin1.length !== 4 || !/^\d{4}$/.test(pin1)) { showToast('PIN must be exactly 4 digits.', 'error'); return; }
  if (pin1 !== pin2) { showToast('PINs do not match.', 'error'); return; }

  appSettings.pin = pin1;
  appSettings.pinEnabled = true;
  await saveAppSettings();
  document.getElementById('newPin').value    = '';
  document.getElementById('confirmPin').value = '';
  refreshSettingsPage();
  showToast('✅ PIN saved! Lock Terminal to test it.', 'success');
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
  const now   = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.getElementById('deliveryDateTime').value = local;
  document.getElementById('deliveryItem').value     = '';
  document.getElementById('deliveryQty').value      = '';
  document.getElementById('deliveryQtyNum').value   = '';
  document.getElementById('deliveryUnit').value     = 'pcs';
  document.getElementById('deliverySupplier').value = '';
  document.getElementById('deliveryModal').style.display = 'flex';
}

function closeDeliveryModal() {
  document.getElementById('deliveryModal').style.display = 'none';
}

async function saveDelivery() {
  const item     = document.getElementById('deliveryItem').value.trim();
  const qty      = document.getElementById('deliveryQty').value.trim();
  const supplier = document.getElementById('deliverySupplier').value.trim();
  const dt       = document.getElementById('deliveryDateTime').value;
  const unit     = document.getElementById('deliveryUnit').value.trim() || 'pcs';
  const qtyNum   = parseFloat(document.getElementById('deliveryQtyNum').value) || 0;

  if (!item) { showToast('Please enter an item name.', 'error'); return; }
  if (!qty)  { showToast('Please enter a quantity.', 'error'); return; }

  const delivery = {
    deliveryId: Date.now(),
    item, qty, qtyNum, unit,
    supplier: supplier || '—',
    datetime: dt || new Date().toISOString(),
    recordedBy: appSettings.cashierName || CASHIER_NAME
  };

  await dbSaveDelivery(delivery);

  // Auto-add to today's opening inventory
  if (qtyNum > 0) {
    const dateKey = getTodayInvKey();
    let dayInv = await dbGetInventory(dateKey) || { dateKey, opening: { ingredients: [], amounts: [] } };
    if (!dayInv.opening) dayInv.opening = { ingredients: [], amounts: [] };
    const ings = dayInv.opening.ingredients;
    const existing = ings.find(i => i.name.trim().toLowerCase() === item.toLowerCase());
    if (existing) {
      existing.qty = (existing.qty || 0) + qtyNum;
    } else {
      ings.push({ name: item, unit, qty: qtyNum });
    }
    await dbSaveInventory(dateKey, dayInv);
    await renderInventory();
  }

  closeDeliveryModal();
  await renderDeliveryLog();
  showToast('✅ Delivery recorded & added to inventory!', 'success');
}

async function renderDeliveryLog() {
  const container = document.getElementById('deliveryLogList');
  if (!container) return;
  const deliveries = await dbGetDeliveries();

  if (!deliveries.length) {
    container.innerHTML = '<p style="color:var(--text3);font-size:0.85rem;text-align:center;padding:16px 0;">No deliveries recorded yet.</p>';
    return;
  }

  container.innerHTML = deliveries.map(d => {
    const dt      = new Date(d.datetime);
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
          <button onclick="deleteDelivery(${d.deliveryId})" style="background:none;border:none;color:var(--red);font-size:0.75rem;cursor:pointer;margin-top:4px;font-weight:700;">🗑 Remove</button>
        </div>
      </div>`;
  }).join('');
}

async function deleteDelivery(deliveryId) {
  if (!confirm('Remove this delivery record?')) return;
  await dbDeleteDelivery(deliveryId);
  await renderDeliveryLog();
  showToast('Delivery record removed.', 'success');
}

// =================== CASH ADVANCE ===================
function openCashAdvanceModal() {
  const now   = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.getElementById('caDateTime').value = local;
  document.getElementById('caName').value     = appSettings.cashierName || '';
  document.getElementById('caAmount').value   = '';
  document.getElementById('caReason').value   = '';
  document.getElementById('cashAdvanceModal').style.display = 'flex';
}

function closeCashAdvanceModal() {
  document.getElementById('cashAdvanceModal').style.display = 'none';
}

async function saveCashAdvance() {
  const name   = document.getElementById('caName').value.trim();
  const amount = parseFloat(document.getElementById('caAmount').value);
  const reason = document.getElementById('caReason').value.trim();
  const dt     = document.getElementById('caDateTime').value;

  if (!name)              { showToast('Please enter the cashier name.', 'error'); return; }
  if (!amount || amount <= 0) { showToast('Please enter a valid amount.', 'error'); return; }

  const advance = {
    advanceId: Date.now(),
    name, amount,
    reason: reason || '—',
    datetime: dt || new Date().toISOString()
  };

  await dbSaveCashAdvance(advance);
  closeCashAdvanceModal();
  await renderCashAdvanceLog();
  showToast(`✅ Cash advance of ₱${fmt(amount)} recorded.`, 'success');
}

async function renderCashAdvanceLog() {
  const container = document.getElementById('cashAdvanceList');
  const totalBar  = document.getElementById('cashAdvanceTotalBar');
  const totalAmt  = document.getElementById('cashAdvanceTotalAmt');
  if (!container) return;

  const advances = await dbGetCashAdvances();
  const today    = new Date().toISOString().split('T')[0];
  const todayAdv = advances.filter(a => a.datetime.startsWith(today));
  const todayTotal = todayAdv.reduce((s, a) => s + (a.amount || 0), 0);

  if (totalBar) totalBar.style.display = todayTotal > 0 ? 'flex' : 'none';
  if (totalAmt) totalAmt.textContent = '₱' + fmt(todayTotal);

  if (!advances.length) {
    container.innerHTML = '<p style="color:var(--text3);font-size:0.85rem;text-align:center;padding:16px 0;">No cash advances recorded yet.</p>';
    return;
  }

  container.innerHTML = advances.map(a => {
    const dt      = new Date(a.datetime);
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
          <button onclick="deleteCashAdvance(${a.advanceId})" style="background:none;border:none;color:var(--red);font-size:0.75rem;cursor:pointer;margin-top:4px;font-weight:700;">🗑 Remove</button>
        </div>
      </div>`;
  }).join('');
}

async function deleteCashAdvance(advanceId) {
  if (!confirm('Remove this cash advance record?')) return;
  await dbDeleteCashAdvance(advanceId);
  await renderCashAdvanceLog();
  showToast('Cash advance record removed.', 'success');
}

// =================== PIN VERIFY MODAL ===================
let pinVerifyCallback = null;
let pinVerifyBuffer   = '';

function openPinVerify(onSuccess) {
  pinVerifyCallback = onSuccess;
  pinVerifyBuffer   = '';
  updatePinVerifyDots();
  document.getElementById('pinVerifyError').classList.add('hidden');
  document.getElementById('pinVerifyModal').classList.remove('hidden');
}

function closePinVerify() {
  pinVerifyBuffer   = '';
  pinVerifyCallback = null;
  document.getElementById('pinVerifyModal').classList.add('hidden');
}

function enterPinVerify(digit) {
  if (pinVerifyBuffer.length >= 4) return;
  pinVerifyBuffer += digit;
  updatePinVerifyDots();
  if (pinVerifyBuffer.length === 4) {
    setTimeout(() => {
      const pin = appSettings.pin || CASHIER_PIN;
      if (pinVerifyBuffer === pin) {
        closePinVerify();
        if (pinVerifyCallback) pinVerifyCallback();
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

// =================== CLEAR DATA ===================
function confirmClearData() {
  const doDelete = async () => {
    const confirmed = window.confirm('Are you sure you want to delete ALL data?\n\nThis includes:\n• All orders\n• All products\n• Inventory records\n• Settings\n\nThis CANNOT be undone.');
    if (!confirmed) return;
    const confirmed2 = window.confirm('Last chance — are you absolutely sure?');
    if (!confirmed2) return;

    await dbClearAll();
    appSettings  = { pin: CASHIER_PIN, cashierName: CASHIER_NAME, theme: 'dark', pinEnabled: false };
    orderCounter = 1;
    showToast('All data cleared. Restarting...', 'success');
    setTimeout(() => location.reload(), 1500);
  };

  // If PIN is enabled, require PIN before clearing
  if (appSettings.pinEnabled) {
    openPinVerify(doDelete);
  } else {
    doDelete();
  }
}

// =================== VIEW / EDIT ORDER ===================
let editingOrderNum  = null;
let editingOrderItems = [];

async function viewOrder(orderNum) {
  const orders = await dbGetOrders();
  const order  = orders.find(o => o.orderNum === orderNum);
  if (!order) return;

  editingOrderNum   = orderNum;
  editingOrderItems = JSON.parse(JSON.stringify(order.items));

  const date    = new Date(order.date);
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
  if (editingOrderItems[idx].qty <= 0) editingOrderItems.splice(idx, 1);
  renderViewOrderItems();
}

function editOrderSetQty(idx, val) {
  editingOrderItems[idx].qty = Math.max(1, parseInt(val) || 1);
  renderViewOrderItems();
}

function editOrderRemove(idx) {
  editingOrderItems.splice(idx, 1);
  renderViewOrderItems();
}

async function saveOrderEdits() {
  if (!editingOrderItems.length) { showToast('Order must have at least one item.', 'error'); return; }

  const subtotal = editingOrderItems.reduce((s, i) => s + i.price * i.qty, 0);
  const orders   = await dbGetOrders();
  const order    = orders.find(o => o.orderNum === editingOrderNum);
  if (!order) return;

  await dbUpdateOrder(editingOrderNum, {
    ...order,
    items: editingOrderItems,
    subtotal,
    total: subtotal - (order.discountAmt || 0)
  });

  closeModal('viewOrderModal');
  await renderOrderHistory();
  await renderSummary();
  showToast('✅ Order updated!', 'success');
}

// =================== INVENTORY ===================
let invModalType  = 'opening';
let invIngredients = [];
let invAmounts    = [];

function getTodayInvKey() {
  return document.getElementById('inventoryDate')?.value || new Date().toISOString().split('T')[0];
}

async function openInvModal(type) {
  invModalType = type;
  const dateKey = getTodayInvKey();
  const dayInv  = await dbGetInventory(dateKey) || {};

  document.getElementById('invModalTitle').textContent =
    type === 'opening' ? '🌅 Set Opening Inventory' : '🌙 Set Closing Inventory';

  if (type === 'opening') {
    const op = dayInv.opening || {};
    invIngredients = (op.ingredients || [
      { name: 'Burger Patty', unit: 'pcs', qty: 0 },
      { name: 'Burger Buns',  unit: 'pcs', qty: 0 },
      { name: 'Cheese Slice', unit: 'pcs', qty: 0 }
    ]).map(i => ({...i}));
    invAmounts = (op.amounts || [{ name: 'Pocket Money / Change', amount: 0 }]).map(a => ({...a}));
    document.getElementById('invIngDesc').textContent = 'How many of each ingredient/supply do you have for today?';
    document.getElementById('invAmtDesc').textContent = 'Enter the peso amount for today.';
  } else {
    const op = dayInv.opening || {};
    const cl = dayInv.closing || {};
    invIngredients = (cl.ingredients?.length ? cl.ingredients : (op.ingredients || []).map(i => ({ ...i, closingQty: i.qty }))).map(i => ({...i}));
    invAmounts     = (cl.amounts?.length     ? cl.amounts     : (op.amounts     || []).map(a => ({ ...a, closingAmount: a.amount, notes: '' }))).map(a => ({...a}));
    document.getElementById('invIngDesc').textContent = 'How many of each ingredient/supply is LEFT at the end of the day?';
    document.getElementById('invAmtDesc').textContent = 'How much cash / amount is LEFT at the end of the day?';
  }

  renderInvModal();
  document.getElementById('invModal').classList.remove('hidden');
}

function renderInvModal() {
  const isClosing = invModalType === 'closing';
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
        <input type="text" class="input-field" value="${escHtml(ing.name||'')}" placeholder="e.g. Burger Patty" style="padding:7px 10px;font-size:0.85rem;" oninput="invIngredients[${idx}].name=this.value" />
        <input type="text" class="input-field" value="${escHtml(ing.unit||'pcs')}" placeholder="pcs" style="padding:7px 10px;font-size:0.85rem;text-align:center;" oninput="invIngredients[${idx}].unit=this.value" />
        <input type="number" class="input-field" value="${ing.qty||0}" min="0" step="1" style="padding:7px 10px;font-size:0.92rem;font-weight:800;text-align:center;color:var(--orange);" oninput="invIngredients[${idx}].qty=parseInt(this.value)||0" />
        <button class="inv-del-btn" onclick="removeIngredient(${idx})">✕</button>
      </div>`).join('');
  } else {
    ingHeader.style.gridTemplateColumns = '1fr 80px 100px 100px';
    ingHeader.innerHTML = `
      <span style="font-size:0.72rem;color:var(--text3);font-weight:700;">INGREDIENT / SUPPLY</span>
      <span style="font-size:0.72rem;color:var(--text3);font-weight:700;">UNIT</span>
      <span style="font-size:0.72rem;color:var(--blue);font-weight:700;">STARTED WITH</span>
      <span style="font-size:0.72rem;color:var(--green);font-weight:700;">LEFT OVER</span>`;
    ingList.innerHTML = invIngredients.map((ing, idx) => `
      <div style="display:grid;grid-template-columns:1fr 80px 100px 100px;gap:8px;align-items:center;margin-bottom:8px;">
        <div style="font-weight:700;font-size:0.88rem;">${escHtml(ing.name||'Item')}</div>
        <div style="font-size:0.8rem;color:var(--text3);text-align:center;">${escHtml(ing.unit||'pcs')}</div>
        <div style="text-align:center;font-weight:800;color:var(--blue);font-size:0.95rem;">${ing.qty||0}</div>
        <input type="number" class="input-field" value="${ing.closingQty ?? ing.qty ?? 0}" min="0" step="1" style="padding:7px 10px;font-size:0.92rem;font-weight:800;text-align:center;color:var(--green);border-color:rgba(16,185,129,0.4);" oninput="invIngredients[${idx}].closingQty=parseInt(this.value)||0" />
      </div>`).join('');
  }

  document.getElementById('invIngBadge').textContent = `${invIngredients.length} item${invIngredients.length !== 1 ? 's' : ''}`;

  const amtHeader = document.getElementById('invAmtHeader');
  const amtList   = document.getElementById('invAmtList');

  if (!isClosing) {
    amtHeader.style.gridTemplateColumns = '1fr 130px 32px';
    amtHeader.innerHTML = `
      <span style="font-size:0.72rem;color:var(--text3);font-weight:700;">DESCRIPTION</span>
      <span style="font-size:0.72rem;color:var(--blue);font-weight:700;">AMOUNT FOR TODAY (₱)</span>
      <span></span>`;
    amtList.innerHTML = invAmounts.map((amt, idx) => `
      <div style="display:grid;grid-template-columns:1fr 130px 32px;gap:8px;align-items:center;margin-bottom:8px;">
        <input type="text" class="input-field" value="${escHtml(amt.name||'')}" placeholder="e.g. Pocket Money" style="padding:7px 10px;font-size:0.85rem;" oninput="invAmounts[${idx}].name=this.value;updateInvTotal()" />
        <input type="number" class="input-field" value="${amt.amount||0}" min="0" step="0.01" style="padding:7px 10px;font-size:0.92rem;font-weight:800;text-align:center;color:var(--blue);border-color:rgba(59,130,246,0.4);" oninput="invAmounts[${idx}].amount=parseFloat(this.value)||0;updateInvTotal()" />
        <button class="inv-del-btn" onclick="removeAmount(${idx})">✕</button>
      </div>`).join('');
  } else {
    amtHeader.style.gridTemplateColumns = '1fr 110px 110px';
    amtHeader.innerHTML = `
      <span style="font-size:0.72rem;color:var(--text3);font-weight:700;">DESCRIPTION</span>
      <span style="font-size:0.72rem;color:var(--blue);font-weight:700;">STARTED WITH (₱)</span>
      <span style="font-size:0.72rem;color:var(--green);font-weight:700;">AMOUNT LEFT (₱)</span>`;
    amtList.innerHTML = invAmounts.map((amt, idx) => `
      <div style="margin-bottom:12px;">
        <div style="display:grid;grid-template-columns:1fr 110px 110px;gap:8px;align-items:center;margin-bottom:4px;">
          <div style="font-weight:700;font-size:0.88rem;">${escHtml(amt.name||'Amount')}</div>
          <div style="text-align:center;font-weight:800;color:var(--blue);font-size:0.95rem;">₱${fmt(amt.amount||0)}</div>
          <input type="number" class="input-field" value="${amt.closingAmount ?? amt.amount ?? 0}" min="0" step="0.01" style="padding:7px 10px;font-size:0.92rem;font-weight:800;text-align:center;color:var(--green);border-color:rgba(16,185,129,0.4);" oninput="invAmounts[${idx}].closingAmount=parseFloat(this.value)||0;updateInvTotal()" />
        </div>
        <input type="text" class="input-field" value="${escHtml(amt.notes||'')}" placeholder="Notes (optional)..." style="width:100%;padding:5px 9px;color:var(--text3);font-size:0.78rem;" oninput="invAmounts[${idx}].notes=this.value" />
      </div>`).join('');
  }

  document.getElementById('invAmtBadge').textContent = `${invAmounts.length} item${invAmounts.length !== 1 ? 's' : ''}`;
  updateInvTotal();
}

function addIngredient() { invIngredients.push({ name: '', unit: 'pcs', qty: 0 }); renderInvModal(); }
function removeIngredient(idx) { invIngredients.splice(idx, 1); renderInvModal(); }
function addAmount() { invAmounts.push({ name: '', amount: 0 }); renderInvModal(); }
function removeAmount(idx) { invAmounts.splice(idx, 1); renderInvModal(); }

function updateInvTotal() {
  const isClosing = invModalType === 'closing';
  const total = invAmounts.reduce((s, a) => s + (isClosing ? (a.closingAmount||0) : (a.amount||0)), 0);
  const el = document.getElementById('invModalTotalLabel');
  if (el) el.textContent = `Cash Total: ₱${fmt(total)}`;
}

async function saveInvModal() {
  const dateKey = getTodayInvKey();
  let dayInv = await dbGetInventory(dateKey) || { dateKey };

  if (invModalType === 'opening') {
    const ings = invIngredients.filter(i => i.name && i.name.trim());
    const amts = invAmounts.filter(a => a.name && a.name.trim());
    if (!ings.length && !amts.length) { showToast('Please add at least one item.', 'error'); return; }
    dayInv.opening = { ingredients: ings, amounts: amts };
  } else {
    dayInv.closing = {
      ingredients: invIngredients.map(i => ({...i})),
      amounts:     invAmounts.map(a => ({...a}))
    };
  }

  await dbSaveInventory(dateKey, dayInv);
  closeModal('invModal');
  await renderInventory();
  showToast(invModalType === 'opening' ? '✅ Opening inventory saved!' : '✅ Closing inventory saved!', 'success');
}

async function renderInventory() {
  const dateKey = getTodayInvKey();
  const dayInv  = await dbGetInventory(dateKey) || {};
  const op = dayInv.opening || {};
  const cl = dayInv.closing || {};

  const openIngredients  = op.ingredients || [];
  const openAmounts      = op.amounts     || [];
  const closeIngredients = cl.ingredients || [];
  const closeAmounts     = cl.amounts     || [];

  const emptyEl      = document.getElementById('invEmptyState');
  const summaryCards = document.getElementById('invSummaryCards');
  const compareGrid  = document.getElementById('invCompareGrid');
  const reportSection = document.getElementById('invReportSection');

  const hasOpening = openIngredients.length > 0 || openAmounts.length > 0;
  if (!hasOpening) {
    emptyEl.style.display      = 'block';
    summaryCards.style.display = 'none';
    compareGrid.style.display  = 'none';
    reportSection.style.display = 'none';
    return;
  }

  emptyEl.style.display      = 'none';
  summaryCards.style.display = 'grid';
  compareGrid.style.display  = 'grid';

  const openAmtTotal  = openAmounts.reduce((s, a) => s + (a.amount||0), 0);
  const closeAmtTotal = closeAmounts.reduce((s, a) => s + (a.closingAmount||0), 0);
  const usedAmt       = Math.max(0, openAmtTotal - closeAmtTotal);

  const hasClosingAmounts = closeAmounts.length > 0;
  document.getElementById('invOpenTotal').textContent  = '₱' + fmt(openAmtTotal);
  document.getElementById('invExpenses').textContent   = '₱0.00';
  document.getElementById('invUsed').textContent       = hasClosingAmounts ? '₱' + fmt(usedAmt) : '—';
  document.getElementById('invCloseTotal').textContent = hasClosingAmounts ? '₱' + fmt(closeAmtTotal) : '—';

  // Opening list
  const openingList = document.getElementById('invOpeningList');
  let openHTML = '';
  if (openIngredients.length) {
    openHTML += `<div style="font-size:0.72rem;font-weight:800;color:var(--orange);letter-spacing:1px;margin-bottom:6px;text-transform:uppercase;">🥩 Ingredients/Supplies</div>`;
    openHTML += openIngredients.map(i => `
      <div class="inv-list-item">
        <div><span style="font-weight:700;">${escHtml(i.name)}</span><span style="font-size:0.72rem;color:var(--text3);margin-left:6px;">${escHtml(i.unit||'pcs')}</span></div>
        <span style="font-weight:800;color:var(--orange);">${i.qty||0} <span style="font-size:0.72rem;color:var(--text3);">${escHtml(i.unit||'pcs')}</span></span>
      </div>`).join('');
  }
  if (openAmounts.length) {
    openHTML += `<div style="font-size:0.72rem;font-weight:800;color:var(--blue);letter-spacing:1px;margin:12px 0 6px;text-transform:uppercase;">💵 Cash / Amounts</div>`;
    openHTML += openAmounts.map(a => `
      <div class="inv-list-item"><span style="font-weight:700;">${escHtml(a.name)}</span><span style="font-weight:800;color:var(--blue);">₱${fmt(a.amount||0)}</span></div>`).join('');
    openHTML += `<div style="display:flex;justify-content:space-between;padding-top:10px;font-weight:800;font-size:0.9rem;border-top:1px dashed var(--border);margin-top:8px;"><span>CASH TOTAL</span><span style="color:var(--blue);">₱${fmt(openAmtTotal)}</span></div>`;
  }
  openingList.innerHTML = openHTML || `<p style="color:var(--text3);font-size:0.85rem;text-align:center;padding:16px 0;">No opening inventory set.</p>`;

  // Closing list
  const closingList = document.getElementById('invClosingList');
  const hasClosing  = closeIngredients.length > 0 || closeAmounts.length > 0;

  if (hasClosing) {
    let closeHTML = '';
    if (closeIngredients.length) {
      closeHTML += `<div style="font-size:0.72rem;font-weight:800;color:var(--orange);letter-spacing:1px;margin-bottom:6px;text-transform:uppercase;">🥩 Ingredients/Supplies Left</div>`;
      closeHTML += closeIngredients.map(i => {
        const openIng = openIngredients.find(o => o.name === i.name);
        const usedQty = openIng ? Math.max(0, (openIng.qty||0) - (i.closingQty||0)) : 0;
        return `
          <div class="inv-list-item">
            <div><span style="font-weight:700;">${escHtml(i.name)}</span>${usedQty > 0 ? `<span style="font-size:0.72rem;color:var(--red);margin-left:6px;">-${usedQty} used</span>` : ''}</div>
            <span style="font-weight:800;color:var(--green);">${i.closingQty||0} <span style="font-size:0.72rem;color:var(--text3);">${escHtml(i.unit||'pcs')}</span></span>
          </div>`;
      }).join('');
    }
    if (closeAmounts.length) {
      closeHTML += `<div style="font-size:0.72rem;font-weight:800;color:var(--blue);letter-spacing:1px;margin:12px 0 6px;text-transform:uppercase;">💵 Cash Left</div>`;
      closeHTML += closeAmounts.map(a => `
        <div class="inv-list-item">
          <div><span style="font-weight:700;">${escHtml(a.name)}</span>${a.notes ? `<span style="font-size:0.72rem;color:var(--text3);margin-left:6px;">${escHtml(a.notes)}</span>` : ''}</div>
          <span style="font-weight:800;color:var(--green);">₱${fmt(a.closingAmount||0)}</span>
        </div>`).join('');
      closeHTML += `<div style="display:flex;justify-content:space-between;padding-top:10px;font-weight:800;font-size:0.9rem;border-top:1px dashed var(--border);margin-top:8px;"><span>CASH LEFT</span><span style="color:var(--green);">₱${fmt(closeAmtTotal)}</span></div>`;
    }
    closingList.innerHTML = closeHTML;
    document.getElementById('btnSetClosing').textContent = '✏️ Edit';
    document.getElementById('btnSetClosing').className = 'btn btn-outline btn-sm';
  } else {
    closingList.innerHTML = `<p style="color:var(--text3);font-size:0.85rem;text-align:center;padding:16px 0;">Not yet set. Click "+ Set Closing" to add.</p>`;
  }

  // Report section
  if (hasClosing) {
    reportSection.style.display = 'block';
    const tbody = document.getElementById('invReportBody');
    let rows = '';

    const allIngNames = [...new Set([...openIngredients.map(i => i.name), ...closeIngredients.map(i => i.name)])];
    allIngNames.forEach(name => {
      const opI = openIngredients.find(i => i.name === name);
      const clI = closeIngredients.find(i => i.name === name);
      const startQty = opI ? (opI.qty||0) : 0;
      const endQty   = clI ? (clI.closingQty ?? clI.qty ?? 0) : 0;
      const usedQty  = Math.max(0, startQty - endQty);
      const unit     = opI ? (opI.unit||'pcs') : (clI ? clI.unit||'pcs' : 'pcs');
      let statusTag  = '';
      if (usedQty === 0 && startQty > 0) statusTag = `<span class="inv-status-tag inv-tag-ok">✓ Full</span>`;
      else if (endQty === 0 && startQty > 0) statusTag = `<span class="inv-status-tag inv-tag-low">⚡ Empty</span>`;
      else if (endQty < startQty * 0.2 && startQty > 0) statusTag = `<span class="inv-status-tag inv-tag-low">⚡ Low</span>`;
      else statusTag = `<span class="inv-status-tag inv-tag-ok">✓ OK</span>`;
      rows += `<tr>
        <td><strong>${escHtml(name)}</strong> <span style="font-size:0.72rem;color:var(--text3);">(qty)</span></td>
        <td style="color:var(--orange);">${startQty} ${escHtml(unit)}</td>
        <td style="color:var(--green);">${endQty} ${escHtml(unit)}</td>
        <td style="color:${usedQty>0?'var(--red)':'var(--text3)'};">${usedQty > 0 ? '-'+usedQty+' '+escHtml(unit) : '—'}</td>
        <td>${statusTag}</td><td>—</td>
      </tr>`;
    });

    const allAmtNames = [...new Set([...openAmounts.map(a => a.name), ...closeAmounts.map(a => a.name)])];
    allAmtNames.forEach(name => {
      const opA      = openAmounts.find(a => a.name === name);
      const clA      = closeAmounts.find(a => a.name === name);
      const startAmt = opA ? (opA.amount||0) : 0;
      const endAmt   = clA ? (clA.closingAmount ?? clA.amount ?? 0) : 0;
      const usedAmt2 = Math.max(0, startAmt - endAmt);
      const notes    = clA ? (clA.notes||'') : '';
      let statusTag  = '';
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

    const isBalanced = Math.abs(openAmtTotal - closeAmtTotal - usedAmt) < 0.01;
    const balanceEl  = document.getElementById('invBalanceCheck');
    balanceEl.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:14px;">
        <div style="text-align:center;"><div style="font-size:0.72rem;color:var(--text3);font-weight:700;letter-spacing:1px;margin-bottom:4px;">OPENING CASH</div><div style="font-size:1.2rem;font-weight:800;color:var(--blue);">₱${fmt(openAmtTotal)}</div></div>
        <div style="text-align:center;"><div style="font-size:0.72rem;color:var(--text3);font-weight:700;letter-spacing:1px;margin-bottom:4px;">CASH USED</div><div style="font-size:1.2rem;font-weight:800;color:var(--red);">-₱${fmt(usedAmt)}</div></div>
        <div style="text-align:center;"><div style="font-size:0.72rem;color:var(--text3);font-weight:700;letter-spacing:1px;margin-bottom:4px;">CLOSING CASH</div><div style="font-size:1.2rem;font-weight:800;color:var(--green);">₱${fmt(closeAmtTotal)}</div></div>
      </div>
      <div style="padding:14px 20px;border-radius:12px;text-align:center;background:${isBalanced?'rgba(16,185,129,0.12)':'rgba(239,68,68,0.1)'};border:2px solid ${isBalanced?'rgba(16,185,129,0.4)':'rgba(239,68,68,0.4)'};">
        ${isBalanced
          ? `<span style="font-size:1.3rem;">✅</span> <span style="font-weight:800;color:var(--green);font-size:1rem;">Cash Balanced!</span>`
          : `<span style="font-size:1.3rem;">⚠️</span> <span style="font-weight:800;color:#ef4444;font-size:1rem;">Cash Discrepancy: ₱${fmt(Math.abs(openAmtTotal - closeAmtTotal - usedAmt))}</span>`}
      </div>`;
    balanceEl.style.background   = 'var(--card-bg)';
    balanceEl.style.borderColor  = isBalanced ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)';
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
