/* ===== pos-part2.js — PART 2 of 4 (continues from pos-part1.js) ===== */

function getMaxAddable(product, stockMap) {
  if (!product) return 0;
  if (!product.recipe || !product.recipe.length) return 0; // no recipe linked = no stock to sell

  let max = Infinity;
  product.recipe.forEach(recipeItem => {
    const key = (recipeItem.ingredient || '').trim().toLowerCase();
    const remaining = Object.prototype.hasOwnProperty.call(stockMap, key) ? stockMap[key] : 0;
    const perUnit = recipeItem.qty || 1;
    const possible = perUnit > 0 ? Math.floor(remaining / perUnit) : Infinity;
    if (possible < max) max = possible;
  });
  return max;
}

// Net remaining stock map after subtracting what's currently in the cart
// (so a second product sharing the same ingredient sees the true remainder).
function getStockMapMinusCart(stockMap, excludeProductId = null) {
  const map = { ...(stockMap || {}) };
  cart.forEach(item => {
    if (excludeProductId !== null && item.id == excludeProductId) return;
    const product = (allProducts || []).find(p => p.id == item.id);
    if (!product || !product.recipe || !product.recipe.length) return;
    product.recipe.forEach(recipeItem => {
      const key = (recipeItem.ingredient || '').trim().toLowerCase();
      // Ingredient may not have a key yet if it was never recorded — that
      // still means zero stock, so seed it at 0 rather than skipping it.
      if (!Object.prototype.hasOwnProperty.call(map, key)) map[key] = 0;
      map[key] = Math.max(0, map[key] - (recipeItem.qty || 1) * item.qty);
    });
  });
  return map;
}

// How many more of `product` can still be added, accounting for everything
// else already in the cart (including other units of the same product).
//
// BUGFIX: getMaxAddable(product, netStock) returns the TOTAL number of this
// product that current stock could ever produce (after removing this
// product's own cart usage from the stock map) — it does NOT know how many
// are already sitting in the cart. Previously this function returned that
// total directly, so e.g. with stock for exactly 3 burgers, the result was
// always "3 addable" no matter whether the cart already had 0, 3, or 10 —
// the +button and out-of-stock badge never actually limited anything, and
// cashiers could keep adding well past real stock until the final
// checkout-time validation blocked the whole order. The fix: subtract the
// quantity already in the cart for THIS product from the total capacity.
function getRemainingAddable(product) {
  const baseStock = getIngredientStockMap();
  const netStock = getStockMapMinusCart(baseStock, product.id);
  const totalCapacity = getMaxAddable(product, netStock);
  if (totalCapacity === Infinity) return Infinity;
  const cartItem = cart.find(i => i.id == product.id);
  const currentQty = cartItem ? cartItem.qty : 0;
  return totalCapacity - currentQty;
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
        <td><button class="btn-eye" onclick="viewOrder(${o.id})" title="View Order">👁</button></td>
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

// Stock-level color rule used throughout the Daily Inventory page: any time
// an ingredient/supply quantity is shown, color it by how much is left —
// >10 = green (good stock), 1–10 = orange (running low), 0 = red (empty/out
// of stock) — so a cashier can tell stock health at a glance without reading
// the number itself. Negative quantities (shouldn't normally occur, but
// stock math elsewhere already floors at 0) are treated the same as 0.
// =================== PRIORITY STOCK THRESHOLDS (storage) ===================
// Defined here — above getIngredientThreshold — so PRIORITY_STOCK_KEY (a const,
// not hoisted) is always initialised before any threshold lookup runs.
const PRIORITY_STOCK_KEY = 'burgerStreetPriorityStock';
const GLOBAL_ALERT_KEY   = 'burgerStreetGlobalAlertThreshold';

function loadPriorityThresholds() {
  try {
    const s = localStorage.getItem(PRIORITY_STOCK_KEY);
    if (s) return JSON.parse(s);
  } catch (e) {}
  return {};
}

function savePriorityThresholds(map) {
  try { localStorage.setItem(PRIORITY_STOCK_KEY, JSON.stringify(map)); } catch (e) {}
}

// Global alert threshold — single value that applies to ALL ingredients
// unless overridden by a per-ingredient threshold.
function loadGlobalAlertThreshold() {
  try {
    const v = localStorage.getItem(GLOBAL_ALERT_KEY);
    if (v !== null && v !== '') return Number(v);
  } catch (e) {}
  return null; // null = not set
}

function saveGlobalAlertThreshold(val) {
  try {
    if (val === null || val === '') {
      localStorage.removeItem(GLOBAL_ALERT_KEY);
    } else {
      localStorage.setItem(GLOBAL_ALERT_KEY, String(Math.max(1, Number(val))));
    }
  } catch (e) {}
}

// Returns the custom alert threshold for a named ingredient, or null if no
// alert has been configured for it. Callers that need a numeric fallback for
// coloring purposes should use getIngredientThresholdOrDefault() instead.
function getIngredientThreshold(name) {
  if (!name) return null;
  const thresholds = loadPriorityThresholds();
  const custom = thresholds[(name + '').toLowerCase()];
  return (custom !== undefined && custom !== null) ? Number(custom) : null;
}

// Like getIngredientThreshold but returns the global alert threshold (or 10)
// when no per-ingredient alert is set — used by stockLevelColor/stockLevelLabel
// where a numeric value is always needed.
function getIngredientThresholdOrDefault(name) {
  const t = getIngredientThreshold(name);
  if (t !== null) return t;
  const g = loadGlobalAlertThreshold();
  return g !== null ? g : 10;
}

// Accepts an optional ingredient name so it can look up a per-ingredient
// custom low-stock threshold from Priority Stock Alerts. Falls back to the
// default threshold of 10 when the name is not supplied or has no custom value.
function stockLevelColor(qty, name) {
  const n = Number(qty) || 0;
  const threshold = getIngredientThresholdOrDefault(name);
  if (n <= 0) return 'var(--red)';
  if (n <= threshold) return 'var(--orange)';
  return 'var(--green)';
}

// Same stock-level rule as stockLevelColor(), but returning the plain-English
// label ("Good Stock" / "Low Stock" / "Out of Stock") instead of a color —
// used by the Print/PDF exports below, which need a legend + a textual tag
// since neither plain printed paper nor jsPDF's default cell rendering can
// rely on a colored dot/background alone to convey meaning.
function stockLevelLabel(qty, name) {
  const n = Number(qty) || 0;
  const threshold = getIngredientThresholdOrDefault(name);
  if (n <= 0) return 'Out of Stock';
  if (n <= threshold) return 'Low Stock';
  return 'Good Stock';
}

// Resolves one of the three stockLevelColor() outputs — which are always the
// literal CSS variable reference strings 'var(--green)', 'var(--orange)', or
// 'var(--red)' — into an [r,g,b] triplet jsPDF can use directly (jsPDF has no
// concept of CSS variables, so var(--xxx) must be hard-mapped to the same RGB
// values defined for --green/--orange/--red in pos.css). Any other color
// string (e.g. 'var(--blue)' used for cash amounts, or '' for uncolored
// cells) intentionally returns null so only true stock-level cells get
// colorized — matching the on-screen rule, which never stock-colors cash.
function stockColorToRGB(cssVar) {
  switch (cssVar) {
    case 'var(--green)':  return [16, 185, 129];
    case 'var(--orange)': return [232, 124, 30];
    case 'var(--red)':    return [239, 68, 68];
    default: return null;
  }
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

// =================== STOCK MOVEMENTS (DELIVERIES + PULL-OUTS) ===================
// A "movement" record is either:
//  - type 'delivery': stock coming IN (received from supplier) — adds to opening qty
//  - type 'pullout':  stock going OUT (damaged/expired/borrowed/internal use) — subtracts from opening qty
// Both share the same shared log and the same dateKey/shiftIndex tagging scheme
// that the inventory report uses to net them back out of "Total Used".

function autoFillDeliveryQty() {
  const n = document.getElementById('deliveryQtyNum').value;
  const u = document.getElementById('deliveryUnit').value.trim() || 'pcs';
  const display = document.getElementById('deliveryQty');
  if (n && display && !display._manuallyEdited) {
    display.value = `${n} ${u}`;
  }
}

function markDeliveryQtyManual() {
  const display = document.getElementById('deliveryQty');
  if (display) display._manuallyEdited = display.value !== '';
}

function setDeliveryType(type) {
  document.getElementById('deliveryType').value = type;

  const btnDelivery = document.getElementById('deliveryTypeBtnDelivery');
  const btnPullout = document.getElementById('deliveryTypeBtnPullout');
  const title = document.getElementById('deliveryModalTitle');
  const banner = document.getElementById('deliveryInfoBanner');
  const qtyLabel = document.getElementById('deliveryQtyLabel');
  const supplierWrap = document.getElementById('deliverySupplierWrap');
  const reasonWrap = document.getElementById('pulloutReasonWrap');
  const notesWrap = document.getElementById('pulloutNotesWrap');
  const saveBtn = document.getElementById('deliverySaveBtn');

  if (type === 'pullout') {
    btnPullout.classList.add('btn-primary');
    btnDelivery.classList.remove('btn-primary');
    btnPullout.style.background = 'var(--red)';
    btnPullout.style.color = '#fff';
    btnDelivery.style.background = '';
    btnDelivery.style.color = '';

    title.textContent = '📤 Pull Out Stock';
    banner.style.background = 'rgba(239,68,68,0.08)';
    banner.style.borderColor = 'rgba(239,68,68,0.25)';
    banner.style.color = 'var(--red)';
    banner.innerHTML = '⚠️ This amount will be <strong>removed</strong> from today\'s inventory stock (damaged, expired, borrowed, etc.) — separately from normal sales usage.';
    qtyLabel.textContent = 'QUANTITY TO PULL OUT *';
    supplierWrap.style.display = 'none';
    reasonWrap.style.display = 'block';
    notesWrap.style.display = 'block';
    saveBtn.textContent = '✅ Save & Remove from Inventory';
  } else {
    btnDelivery.classList.add('btn-primary');
    btnPullout.classList.remove('btn-primary');
    btnDelivery.style.background = '';
    btnDelivery.style.color = '';
    btnPullout.style.background = 'var(--red)';
    btnPullout.style.color = '#fff';

    title.textContent = '🚚 Record Stock Delivery';
    banner.style.background = 'rgba(16,185,129,0.08)';
    banner.style.borderColor = 'rgba(16,185,129,0.25)';
    banner.style.color = 'var(--green)';
    banner.innerHTML = '✅ Received items will automatically be added to today\'s inventory stock.';
    qtyLabel.textContent = 'QUANTITY RECEIVED *';
    supplierWrap.style.display = 'block';
    reasonWrap.style.display = 'none';
    notesWrap.style.display = 'none';
    saveBtn.textContent = '✅ Save & Add to Inventory';
  }
}

function openDeliveryModal(type = 'delivery') {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.getElementById('deliveryDateTime').value = local;
  document.getElementById('deliveryItem').value = '';
  document.getElementById('deliveryQty').value = '';
  const dQty = document.getElementById('deliveryQty');
  if (dQty) dQty._manuallyEdited = false;
  document.getElementById('deliveryQtyNum').value = '';
  document.getElementById('deliveryUnit').value = 'pcs';
  document.getElementById('deliverySupplier').value = '';
  document.getElementById('pulloutReason').value = 'Damaged/Spoiled';
  document.getElementById('pulloutNotes').value = '';

  // Populate the ingredient name suggestions — prefer today's actual stock list
  // (so a pull-out can only reasonably target something currently on hand),
  // falling back to the master ingredient template for everything else.
  const datalist = document.getElementById('deliveryItemSuggestions');
  if (datalist) {
    const dateKey = getTodayInvKey();
    const invData = loadInventoryData();
    const todayShifts = invData[dateKey]?.shifts || [];
    const activeShift = todayShifts[todayShifts.length - 1];
    const stockNames = (activeShift?.opening?.ingredients || []).map(i => i.name);
    const tpl = loadIngredientTemplate();
    const tplNames = (tpl.ingredients || []).map(i => i.name);
    const names = [...new Set([...stockNames, ...tplNames])];
    datalist.innerHTML = names.map(n => `<option value="${escHtml(n)}"></option>`).join('');
  }

  setDeliveryType(type);

  const modal = document.getElementById('deliveryModal');
  modal.style.display = 'flex';
}

function closeDeliveryModal() {
  document.getElementById('deliveryModal').style.display = 'none';
}

function saveDelivery() {
  const type = document.getElementById('deliveryType').value === 'pullout' ? 'pullout' : 'delivery';
  const item = document.getElementById('deliveryItem').value.trim();
  const qty = document.getElementById('deliveryQty').value.trim();
  const supplier = document.getElementById('deliverySupplier').value.trim();
  const reason = document.getElementById('pulloutReason').value;
  const pulloutNotes = document.getElementById('pulloutNotes').value.trim();
  const dt = document.getElementById('deliveryDateTime').value;
  const unit = document.getElementById('deliveryUnit').value.trim() || 'pcs';
  const qtyNum = parseFloat(document.getElementById('deliveryQtyNum').value) || 0;

  if (!item) { showToast('Please enter an item name.', 'error'); return; }
  // If the display-qty field is empty (e.g. browser autofill bypassed oninput),
  // fall back to the numeric qty + unit so the save is never silently blocked.
  const resolvedQty = qty || (qtyNum > 0 ? `${qtyNum} ${unit}` : '');
  if (!resolvedQty) { showToast('Please enter a quantity.', 'error'); return; }
  // Keep qty in sync so the movement record always has a display string.
  if (!qty && resolvedQty) document.getElementById('deliveryQty').value = resolvedQty;

  const dateKey = getLocalDateKey(); // FIXED: always use real today, not the date picker value
  const invData = loadInventoryData();

  // For pull-outs, check current stock so the cashier can't silently push an
  // ingredient negative without at least being warned — damaged/borrowed stock
  // can only come out of what's actually on hand.
  if (type === 'pullout' && qtyNum > 0) {
    if (!invData[dateKey]) invData[dateKey] = {};
    if (!invData[dateKey].shifts) {
      const legacy = {};
      if (invData[dateKey].opening) { legacy.opening = invData[dateKey].opening; delete invData[dateKey].opening; }
      if (invData[dateKey].closing) { legacy.closing = invData[dateKey].closing; delete invData[dateKey].closing; }
      invData[dateKey].shifts = [legacy];
    }
    const activeShiftIdx = invData[dateKey].shifts.length - 1;
    const activeShift = invData[dateKey].shifts[activeShiftIdx];
    const ings = activeShift.opening?.ingredients || [];
    const existing = ings.find(i => i.name.trim().toLowerCase() === item.toLowerCase());
    // Use actual remaining stock (opening qty minus sales already made today),
    // not raw opening qty — otherwise the warning shows the wrong number when
    // sales have already happened (e.g. opened 80, sold 48, remaining 32, but
    // warning used to say "Only 80 in stock" instead of the correct "Only 32").
    const currentQty = existing ? Math.max(0, (existing.qty || 0) - (existing.usedQty || 0)) : 0;
    if (qtyNum > currentQty) {
      const proceed = confirm(`⚠️ Only ${currentQty} ${unit} of "${item}" is currently on the shelf, but you're pulling out ${qtyNum}. Continue anyway? (Stock will be set to 0.)`);
      if (!proceed) return;
    }
  }

  const movement = {
    id: Date.now(),
    type, // 'delivery' (stock in) or 'pullout' (stock out)
    item,
    qty: resolvedQty,
    qtyNum,
    unit,
    supplier: type === 'delivery' ? (supplier || '—') : '—',
    reason: type === 'pullout' ? reason : null,
    notes: type === 'pullout' ? (pulloutNotes || '—') : null,
    datetime: dt || new Date().toISOString(),
    recordedBy: posState.settings.cashierName || CASHIER_NAME,
    // dateKey/shiftIndex record exactly which inventory shift this movement was
    // folded into. The report uses these (not just the mutated opening qty) to
    // know how much of "Total Used" is delivered/pulled stock vs. true
    // consumption — without this, a movement logged after a shift closes has
    // no reliable way to be matched back to the shift it belongs to.
    dateKey: null,
    shiftIndex: null
  };

  // Save to shared delivery log (visible to all cashiers)
  const sharedDeliveries = loadSharedDeliveries();
  sharedDeliveries.unshift(movement);
  saveSharedDeliveries(sharedDeliveries);

  // ── AUTO-APPLY TO TODAY'S SHARED INVENTORY ──
  if (qtyNum > 0) {
    if (!invData[dateKey]) invData[dateKey] = {};

    // Ensure shifts array exists (multi-shift format)
    if (!invData[dateKey].shifts) {
      const legacy = {};
      if (invData[dateKey].opening) { legacy.opening = invData[dateKey].opening; delete invData[dateKey].opening; }
      if (invData[dateKey].closing) { legacy.closing = invData[dateKey].closing; delete invData[dateKey].closing; }
      invData[dateKey].shifts = [legacy];
    }

    // Apply to the active (last) shift's opening ingredients
    const activeShiftIdx = invData[dateKey].shifts.length - 1;
    const activeShift = invData[dateKey].shifts[activeShiftIdx];

    // Record whether this shift was ALREADY closed at the moment this
    // movement was saved. The report (renderInventory in pos-part3.js) uses
    // this flag — not just "does this shift have a closing right now" — to
    // decide whether to net the movement out of "Used": a delivery/pull-out
    // logged before closing is already reflected in the cashier's manual
    // closing/actual count, so netting it again would double-count it.
    const cl = activeShift.closing;
    movement.postClosing = !!(cl && ((cl.ingredients && cl.ingredients.length) || (cl.amounts && cl.amounts.length)));

    if (!activeShift.opening) activeShift.opening = { ingredients: [], amounts: [] };
    if (!activeShift.opening.ingredients) activeShift.opening.ingredients = [];
    const ings = activeShift.opening.ingredients;

    // Find existing ingredient (case-insensitive match)
    const existing = ings.find(i => i.name.trim().toLowerCase() === item.toLowerCase());
    const delta = type === 'pullout' ? -qtyNum : qtyNum;
    if (existing) {
      existing.qty = Math.max(0, (existing.qty || 0) + delta);
    } else if (type === 'delivery') {
      ings.push({ name: item, unit: unit, qty: qtyNum });
    }
    // (A pull-out on an item with no existing stock record is logged but has
    // nothing to subtract from — the warning above already covered this case.)

    // FIX: Whenever a closing exists, sync closing.closingQty with the same
    // delta so tomorrow's opening seeds from the correct number.
    // seedOpeningFromLastClosing reads closingQty (not opening.qty), so without
    // this sync any pull-out or delivery is invisible to the next day's seeding
    // regardless of whether the closing was saved before or after this movement.
    if (activeShift.closing && activeShift.closing.ingredients) {
      const closingIng = activeShift.closing.ingredients.find(
        i => i.name.trim().toLowerCase() === item.toLowerCase()
      );
      if (closingIng) {
        closingIng.closingQty = Math.max(0, (closingIng.closingQty ?? 0) + delta);
        if (closingIng.actualQty !== null && closingIng.actualQty !== undefined && closingIng.actualQty !== '') {
          closingIng.actualQty = Math.max(0, (parseInt(closingIng.actualQty, 10) || 0) + delta);
        }
      } else if (type === 'delivery') {
        activeShift.closing.ingredients.push({ name: item, unit: unit, closingQty: qtyNum, actualQty: null });
      }
    }

    saveInventoryData(invData);

    // FIX: If a future date was already auto-seeded before this pull-out/delivery
    // happened, its opening is now stale. Delete it so it re-seeds fresh on next
    // view and picks up the corrected qty.
    // CHAIN FIX: use a set of "dirty" source dates so that if Day C was seeded
    // from Day B which was seeded from today (Day A), Day C is also invalidated
    // even though its seededFrom is "Day B", not "Day A". The previous `break`
    // caused the loop to stop at Day B and leave Day C with stale data.
    const futureDates = Object.keys(invData).filter(d => d > dateKey).sort();
    let invChanged = false;
    const invalidatedDates = new Set([dateKey]);
    for (const futureDate of futureDates) {
      const futureShifts = invData[futureDate] && invData[futureDate].shifts;
      if (!futureShifts || !futureShifts.length) continue;
      const firstShift = futureShifts[0];
      if (!firstShift.opening) continue;
      const sf = firstShift.opening.seededFrom;
      // Invalidate if seeded from today or from any already-invalidated date,
      // OR if it was a same-day "previous shift" seed (which is always stale
      // when the source shift's opening changed).
      if (sf === 'previous shift' || invalidatedDates.has(sf)) {
        delete firstShift.opening;
        if (!firstShift.closing) {
          futureShifts.splice(0, 1);
          if (!futureShifts.length) delete invData[futureDate];
        }
        invChanged = true;
        invalidatedDates.add(futureDate); // mark so dates seeded from this are also caught
      }
      // No break — must scan ALL future dates to catch chains like A→B→C→D
    }
    if (invChanged) saveInventoryData(invData);

    // Record exactly where this movement landed so the report can pull it
    // back out of "Used" later, even if this shift has since closed.
    movement.dateKey = dateKey;
    movement.shiftIndex = activeShiftIdx;
    saveSharedDeliveries(sharedDeliveries);

    renderInventory();
  }

  closeDeliveryModal();
  renderDeliveryLog();
  if (document.getElementById('menuGrid')) renderMenuGrid();
  showToast(type === 'pullout' ? '✅ Stock pulled out & inventory updated!' : '✅ Delivery recorded & added to inventory!', 'success');
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
    const isPullout = d.type === 'pullout';
    const sign = isPullout ? '−' : '+';
    const qtyColor = isPullout ? 'var(--red)' : 'var(--orange)';
    const subline = isPullout
      ? `📤 ${escHtml(d.reason || 'Pulled out')}${d.notes && d.notes !== '—' ? ' — ' + escHtml(d.notes) : ''} &nbsp;·&nbsp; 👤 ${escHtml(d.recordedBy)}`
      : `📦 ${escHtml(d.supplier)} &nbsp;·&nbsp; 👤 ${escHtml(d.recordedBy)}`;
    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--border);gap:10px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:800;font-size:0.95rem;color:var(--text);">${isPullout ? '📤 ' : ''}${escHtml(d.item)}</div>
          <div style="font-size:0.82rem;color:${qtyColor};font-weight:700;margin-top:2px;">Qty: ${sign}${d.qtyNum ? `${d.qtyNum} ${escHtml(d.unit||'pcs')}` : escHtml(d.qty)}</div>
          <div style="font-size:0.78rem;color:var(--text3);margin-top:2px;">${subline}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:0.78rem;font-weight:700;color:var(--text2);">${dateStr}</div>
          <div style="font-size:0.78rem;color:var(--text3);">${timeStr}</div>
        </div>
      </div>`;
  }).join('');
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
        </div>
      </div>`;
  }).join('');
}

function getCashAdvanceTotalToday() {
  const today = new Date().toISOString().split('T')[0];
  return (posState.cashAdvances || [])
    .filter(a => a.datetime.startsWith(today))
    .reduce((s, a) => s + (a.amount || 0), 0);
}

// =================== BACKUP & RESTORE ===================
// Exports every storage key this app uses into one JSON file the owner can
// save outside the app (Files, cloud, email, etc.) and use to restore later.
// This is the safety net for the kind of permanent data loss that can happen
// from Clear Data — a backup means a mistaken or accidental clear is no
// longer "gone forever".
function exportAllData() {
  try {
    const cashiers = getCashiers();
    const perCashierData = {};
    cashiers.forEach(c => {
      const key = getCashierStorageKey(c.id);
      const s = localStorage.getItem(key);
      if (s) perCashierData[key] = JSON.parse(s);
    });

    const backup = {
      _backupType: 'burgerStreetPOS',
      _backupVersion: 1,
      _exportedAt: new Date().toISOString(),
      cashiers: cashiers,
      globalState: loadGlobalState(),
      perCashierData: perCashierData,
      inventory: loadInventoryData(),
      deliveries: loadSharedDeliveries(),
      ingredientTemplate: loadIngredientTemplate()
    };

    const json = JSON.stringify(backup, null, 2);
    const dateStamp = getLocalDateKey();
    const filename = `burger-street-pos-backup-${dateStamp}.json`;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // IMPORTANT: revoke the blob URL on a delay, not immediately. On some
    // Android/PWA browsers, revoking right after click() invalidates the
    // download before the OS-level download manager has actually fetched
    // it, which silently fails the download with no visible error.
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch (e) {}
    }, 10000);

    showToast('✅ Backup downloaded! Check your Downloads folder.', 'success');
  } catch (e) {
    console.error('Export failed:', e);
    // Fallback: if Blob/anchor download is blocked entirely (some locked-down
    // standalone PWA contexts), open the JSON directly in a new tab so the
    // owner can still manually save/share it.
    try {
      const cashiers = getCashiers();
      const perCashierData = {};
      cashiers.forEach(c => {
        const key = getCashierStorageKey(c.id);
        const s = localStorage.getItem(key);
        if (s) perCashierData[key] = JSON.parse(s);
      });
      const backup = {
        _backupType: 'burgerStreetPOS', _backupVersion: 1, _exportedAt: new Date().toISOString(),
        cashiers, globalState: loadGlobalState(), perCashierData,
        inventory: loadInventoryData(), deliveries: loadSharedDeliveries(),
        ingredientTemplate: loadIngredientTemplate()
      };
      const win = window.open('', '_blank');
      if (win) {
        win.document.write('<pre style="white-space:pre-wrap;word-break:break-all;">' + JSON.stringify(backup, null, 2).replace(/</g, '&lt;') + '</pre>');
        showToast('Direct download was blocked — opened backup as text instead. Select all & copy/save it.', 'error');
      } else {
        showToast('❌ Backup failed: ' + (e?.message || e), 'error');
      }
    } catch (e2) {
      showToast('❌ Backup failed: ' + (e?.message || e), 'error');
    }
  }
}

// Restores everything from a backup file produced by exportAllData().
// This OVERWRITES current data for any key present in the backup — it's a
// full restore, not a merge, so the owner is warned clearly before it runs.
function importAllData(file) {
  if (!file) return;

  const doRestore = () => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const backup = JSON.parse(e.target.result);
        if (backup._backupType !== 'burgerStreetPOS') {
          showToast('❌ This does not look like a valid backup file.', 'error');
          return;
        }

        const confirmed = window.confirm(
          'Restore from backup taken on ' + (backup._exportedAt || 'unknown date') + '?\n\n' +
          'This will OVERWRITE your current data with what is in the backup file.\n\n' +
          'This CANNOT be undone.'
        );
        if (!confirmed) return;

        if (backup.cashiers) saveCashiers(backup.cashiers);
        if (backup.globalState) saveGlobalState(backup.globalState);
        if (backup.perCashierData) {
          Object.entries(backup.perCashierData).forEach(([key, val]) => {
            try { localStorage.setItem(key, JSON.stringify(val)); } catch (err) {}
          });
        }
        if (backup.inventory) saveInventoryData(backup.inventory);
        if (backup.deliveries) saveSharedDeliveries(backup.deliveries);
        if (backup.ingredientTemplate) saveIngredientTemplate(backup.ingredientTemplate);

        showToast('✅ Backup restored! Reloading...', 'success');
        setTimeout(() => location.reload(), 1200);
      } catch (err) {
        console.error('Restore failed:', err);
        showToast('❌ Could not read that backup file.', 'error');
      }
    };
    reader.readAsText(file);
  };

  if (posState.settings.ownerPin) {
    openPinVerify(doRestore, posState.settings.ownerPin);
  } else {
    doRestore();
  }
}


// Lets the owner pick exactly which categories to wipe, instead of an
// all-or-nothing reset. Each category only touches its own storage keys.
function confirmClearSelectedData() {
  const wantOrders     = document.getElementById('clrOrders')?.checked;
  const wantProducts   = document.getElementById('clrProducts')?.checked;
  const wantInventory  = document.getElementById('clrInventory')?.checked;
  const wantIngList    = document.getElementById('clrIngredientList')?.checked;
  const wantCashiers   = document.getElementById('clrCashiers')?.checked;

  if (!wantOrders && !wantProducts && !wantInventory && !wantIngList && !wantCashiers) {
    showToast('Select at least one item to delete.', 'error');
    return;
  }

  const labels = [];
  if (wantOrders) labels.push('• All orders (every cashier)');
  if (wantProducts) labels.push('• Products / menu list');
  if (wantInventory) labels.push('• Inventory records, stock delivery/pull-out log, cash advance log');
  if (wantIngList) labels.push('• Ingredient & supply name list');
  if (wantCashiers) labels.push('• Cashier accounts, PINs & settings');

  const doDelete = async () => {
    const confirmed = window.confirm(
      'Delete the following?\n\n' + labels.join('\n') + '\n\nThis CANNOT be undone.'
    );
    if (!confirmed) return;
    const confirmed2 = window.confirm('Last chance — are you absolutely sure?');
    if (!confirmed2) return;

    const cashiers = getCashiers();

    if (wantOrders) {
      // Wipe orders from every cashier's individual storage, plus the active one in memory.
      cashiers.forEach(c => {
        try {
          const key = getCashierStorageKey(c.id);
          const s = localStorage.getItem(key);
          if (s) {
            const parsed = JSON.parse(s);
            parsed.orders = [];
            parsed.orderCounter = 1;
            localStorage.setItem(key, JSON.stringify(parsed));
          }
        } catch (e) {}
      });
      posState.orders = [];
      posState.orderCounter = 1;
    }

    if (wantProducts) {
      // Products are shared globally, but also mirrored into each cashier's
      // own save — clear both so nothing reappears on next load.
      const global = loadGlobalState();
      global.customProducts = [];
      saveGlobalState(global);
      cashiers.forEach(c => {
        try {
          const key = getCashierStorageKey(c.id);
          const s = localStorage.getItem(key);
          if (s) {
            const parsed = JSON.parse(s);
            parsed.customProducts = [];
            localStorage.setItem(key, JSON.stringify(parsed));
          }
        } catch (e) {}
      });
      posState.customProducts = [];
    }

    if (wantInventory) {
      try { localStorage.removeItem(INV_STORE_KEY); } catch (e) {}
      try { localStorage.removeItem(SHARED_DELIVERY_KEY); } catch (e) {}
      // Cash advance log lives inside each cashier's own posState.
      cashiers.forEach(c => {
        try {
          const key = getCashierStorageKey(c.id);
          const s = localStorage.getItem(key);
          if (s) {
            const parsed = JSON.parse(s);
            parsed.cashAdvances = [];
            localStorage.setItem(key, JSON.stringify(parsed));
          }
        } catch (e) {}
      });
      posState.cashAdvances = [];
    }

    if (wantIngList) {
      try { localStorage.removeItem(INGREDIENT_TEMPLATE_KEY); } catch (e) {}
    }

    if (wantCashiers) {
      try { localStorage.removeItem(CASHIERS_KEY); } catch (e) {}
      try { localStorage.removeItem(OWNER_GLOBAL_KEY); } catch (e) {}
      try { localStorage.removeItem('burgStreet_activeSession'); } catch (e) {}
      // Settings (including ownerPin) live in OWNER_GLOBAL_KEY (cleared above)
      // and in posState — reset posState's copy too.
      posState.settings = { pin: CASHIER_PIN, cashierName: CASHIER_NAME, theme: 'dark', pinEnabled: false };
    }

    savePos();

    showToast('✅ Selected data cleared.', 'success');
    setTimeout(() => location.reload(), 1200);
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

