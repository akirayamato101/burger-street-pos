/* ===== pos-part3.js — PART 3 of 4 (continues from pos-part2.js) ===== */

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
  // Load shared expenses for the day (expenses are store-wide, not per cashier)
  const dayExpenses = loadExpenses().filter(e => e.datetime && e.datetime.startsWith(summaryDate));
  const totalExpenses = dayExpenses.reduce((s, e) => s + (e.amount || 0), 0);

  let totalSales = 0, totalCashAdv = 0, totalOrders = 0, rows = '';
  cashiers.forEach(c => {
    let orders = [], cashAdvances = [];
    try {
      const s = localStorage.getItem(getCashierStorageKey(c.id));
      if (s) {
        const parsed = JSON.parse(s);
        orders = parsed.orders || [];
        cashAdvances = parsed.cashAdvances || [];
      }
    } catch(e) {}
    const dayOrders = orders.filter(o => o.date && o.date.startsWith(summaryDate));
    const sales = dayOrders.reduce((sum, o) => sum + o.total, 0);
    const dayCashAdv = cashAdvances
      .filter(a => a.datetime && a.datetime.startsWith(summaryDate))
      .reduce((sum, a) => sum + (a.amount || 0), 0);
    const netSales = Math.max(0, sales - dayCashAdv);
    totalSales += sales; totalCashAdv += dayCashAdv; totalOrders += dayOrders.length;
    rows += `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:36px;height:36px;border-radius:50%;background:var(--orange);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;">${c.name.charAt(0).toUpperCase()}</div>
          <div><div style="font-weight:700;">${escHtml(c.name)}</div><div style="font-size:0.78rem;color:var(--text3);">${dayOrders.length} orders${dayCashAdv > 0 ? ` &middot; <span style="color:var(--red);">-₱${fmt(dayCashAdv)} advance</span>` : ''}</div></div>
        </div>
        <div style="text-align:right;">
          <strong style="color:var(--green);">₱${fmt(netSales)}</strong>
          ${dayCashAdv > 0 ? `<div style="font-size:0.7rem;color:var(--text3);">(₱${fmt(sales)} gross)</div>` : ''}
        </div>
      </div>`;
  });
  const totalNetSales = Math.max(0, totalSales - totalCashAdv);
  const totalAfterExpenses = Math.max(0, totalNetSales - totalExpenses);
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:12px;padding:14px;text-align:center;">
        <div style="font-size:0.72rem;color:var(--text3);font-weight:700;letter-spacing:1px;">GROSS SALES</div>
        <div style="font-size:1.4rem;font-weight:800;color:var(--green);">₱${fmt(totalSales)}</div>
      </div>
      <div style="background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:12px;padding:14px;text-align:center;">
        <div style="font-size:0.72rem;color:var(--text3);font-weight:700;letter-spacing:1px;">TOTAL ORDERS</div>
        <div style="font-size:1.4rem;font-weight:800;color:var(--blue);">${totalOrders}</div>
      </div>
    </div>
    ${(totalCashAdv > 0 || totalExpenses > 0) ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      ${totalCashAdv > 0 ? `<div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:12px;padding:14px;text-align:center;">
        <div style="font-size:0.72rem;color:var(--text3);font-weight:700;letter-spacing:1px;">CASH ADVANCES</div>
        <div style="font-size:1.3rem;font-weight:800;color:var(--red);">-₱${fmt(totalCashAdv)}</div>
      </div>` : ''}
      ${totalExpenses > 0 ? `<div style="background:rgba(251,146,60,0.08);border:1px solid rgba(251,146,60,0.25);border-radius:12px;padding:14px;text-align:center;">
        <div style="font-size:0.72rem;color:var(--text3);font-weight:700;letter-spacing:1px;">EXPENSES</div>
        <div style="font-size:1.3rem;font-weight:800;color:var(--orange);">-₱${fmt(totalExpenses)}</div>
      </div>` : ''}
    </div>
    <div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:12px;padding:14px;text-align:center;margin-bottom:12px;">
      <div style="font-size:0.72rem;color:var(--text3);font-weight:700;letter-spacing:1px;">NET (AFTER ADVANCES + EXPENSES)</div>
      <div style="font-size:1.5rem;font-weight:800;color:var(--green);">₱${fmt(totalAfterExpenses)}</div>
      <div style="font-size:0.72rem;color:var(--text3);margin-top:2px;">₱${fmt(totalSales)} − ₱${fmt(totalCashAdv)} advances − ₱${fmt(totalExpenses)} expenses</div>
    </div>` : ''}
    <div style="font-size:0.72rem;font-weight:800;color:var(--text3);letter-spacing:1px;margin-bottom:8px;">PER CASHIER</div>
    ${rows || '<p style="color:var(--text3);font-size:0.85rem;text-align:center;padding:16px 0;">No data for this date.</p>'}`;
}





function viewOrder(orderId) {
  const order = posState.orders.find(o => o.id === orderId);
  if (!order) return;

  const date = new Date(order.date);
  const timeStr = date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  const dateStr = date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

  document.getElementById('viewOrderTitle').textContent = `📋 Order #${order.orderNum}`;
  document.getElementById('viewOrderMeta').innerHTML =
    `<strong>Date:</strong> ${dateStr} ${timeStr}<br>` +
    `<strong>Cashier:</strong> ${escHtml(order.cashier)}<br>` +
    `<strong>Payment:</strong> ${escHtml(order.payMethod)}`;

  const container = document.getElementById('viewOrderItems');
  container.innerHTML = order.items.map(item => `
    <div class="order-edit-item">
      <div style="flex:1;min-width:0">
        <div class="oei-name">${escHtml(item.name)}</div>
        <div class="oei-price">₱${fmt(item.price)} each</div>
      </div>
      <span style="font-weight:700;font-size:0.88rem;color:var(--text2);">×${item.qty}</span>
      <span class="oei-subtotal">₱${fmt(item.price * item.qty)}</span>
    </div>
  `).join('');

  const subtotal = order.items.reduce((s, i) => s + i.price * i.qty, 0);
  document.getElementById('viewOrderTotals').innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:6px;color:var(--text3)">
      <span>Subtotal</span><span>₱${fmt(subtotal)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:1rem;font-weight:800;color:var(--orange)">
      <span>TOTAL</span><span>₱${fmt(order.total !== undefined ? order.total : subtotal)}</span>
    </div>
  `;

  document.getElementById('viewOrderModal').classList.remove('hidden');
}

// =================== INVENTORY SYSTEM ===================
// SHARED inventory — all cashiers use the same store.
// The closing inventory of one shift seeds the opening of the next.
const INV_STORE_KEY = 'burgerStreetSharedInventory';
const SHARED_DELIVERY_KEY = 'burgerStreetSharedDeliveries';
// Standalone list of ingredient/supply NAMES + units (no quantities, no dates).
// This is intentionally a separate store from INV_STORE_KEY so that clearing
// daily opening/closing records (or any date's data) never erases the list of
// what you stock — only the day-to-day counts.
const INGREDIENT_TEMPLATE_KEY = 'burgerStreetIngredientTemplate';

function loadIngredientTemplate() {
  try {
    const s = localStorage.getItem(INGREDIENT_TEMPLATE_KEY);
    if (s) return JSON.parse(s);
  } catch (e) {}
  // First-ever run, nothing saved yet: seed with sensible defaults.
  return {
    ingredients: [
      { name: 'Burger Patty', unit: 'pcs' },
      { name: 'Burger Buns', unit: 'pcs' },
      { name: 'Cheese Slice', unit: 'pcs' }
    ],
    amounts: [
      { name: 'Pocket Money / Change' }
    ]
  };
}
function saveIngredientTemplate(tpl) {
  try { localStorage.setItem(INGREDIENT_TEMPLATE_KEY, JSON.stringify(tpl)); } catch (e) {}
}
// Called whenever an opening inventory is saved — keeps the template in sync
// with any new ingredient/amount names the cashier types in, WITHOUT storing
// quantities. This is how the list grows over time and survives record clears.
function syncIngredientTemplate(ingredients, amounts) {
  const tpl = loadIngredientTemplate();
  (ingredients || []).forEach(i => {
    if (!i.name || !i.name.trim()) return;
    const existing = tpl.ingredients.find(t => t.name.toLowerCase() === i.name.toLowerCase());
    if (existing) existing.unit = i.unit || existing.unit;
    else tpl.ingredients.push({ name: i.name, unit: i.unit || 'pcs' });
  });
  (amounts || []).forEach(a => {
    if (!a.name || !a.name.trim()) return;
    const existing = tpl.amounts.find(t => t.name.toLowerCase() === a.name.toLowerCase());
    if (!existing) tpl.amounts.push({ name: a.name });
  });
  saveIngredientTemplate(tpl);
}

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
// If no closing was ever done, falls back to the most recent previous opening so the
// inventory is never lost when a cashier skips the closing step.
function seedOpeningFromLastClosing(dateKey, invData) {
  const shifts = getDayShifts(dateKey, invData);
  // If there's already a shift for this date with a non-empty opening, don't re-seed.
  // An opening is considered non-empty only when it has at least one ingredient or
  // amount — an empty shell {ingredients:[], amounts:[]} left by a failed/partial
  // pull-out must not block seeding, or the opening would stay blank forever.
  const lastShift = shifts.length ? shifts[shifts.length - 1] : null;
  const hasRealOpening = !!(lastShift && lastShift.opening &&
    ((lastShift.opening.ingredients && lastShift.opening.ingredients.length) ||
     (lastShift.opening.amounts     && lastShift.opening.amounts.length)));
  if (hasRealOpening) return;

  // Look for last closing — could be a previous shift on the same day or a previous day
  let lastClosing = null;
  let seededFrom = null;
  // Fallback: last known opening (when cashier never did a closing)
  let lastOpeningFallback = null;
  let fallbackFrom = null;

  // Check other shifts on same day first
  if (shifts.length > 1) {
    const prev = shifts[shifts.length - 2];
    if (prev.closing) { lastClosing = prev.closing; seededFrom = dateKey; }
    else if (prev.opening) { lastOpeningFallback = prev.opening; fallbackFrom = dateKey; }
  }

  // Otherwise look at previous days. We want the MOST RECENT day that has
  // any record at all. Within that most recent day, prefer its closing;
  // if that day only has an opening (cashier edited opening but never
  // saved a closing), use that opening instead — do NOT skip past it to
  // search for a closing on some older day. Skipping past it was the bug:
  // a deliberate opening edit (e.g. setting everything to 0 to test) on
  // the most recent day was being ignored in favor of stale data from
  // days further back that happened to have a closing saved.
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
      if (lastPrevShift && lastPrevShift.opening) {
        lastOpeningFallback = lastPrevShift.opening;
        fallbackFrom = dates[i];
        break;
      }
    }
  }

  let newOpening;

  if (lastClosing) {
    // Normal path: seed from the closing inventory
    newOpening = {
      ingredients: (lastClosing.ingredients || []).map(i => ({
        name: i.name, unit: i.unit,
        // If an actual physical count was recorded, use it as the true closing qty.
        // Otherwise use closingQty strictly — it may legitimately be 0 (fully consumed).
        // Do NOT fall back to i.qty (the opening qty): that would wrongly re-seed a
        // fully-consumed ingredient back to its old opening count the next day.
        qty: (i.actualQty !== null && i.actualQty !== undefined && i.actualQty !== '')
          ? (parseInt(i.actualQty, 10) || 0)
          : (i.closingQty ?? 0)
      })),
      amounts: (lastClosing.amounts || []).map(a => ({
        name: a.name,
        // If an actual physical count was recorded, use it as the true closing amount.
        // Otherwise use closingAmount strictly — it may legitimately be 0 (fully spent).
        // Do NOT fall back to a.amount (the opening amount).
        amount: (a.actualAmount !== null && a.actualAmount !== undefined && a.actualAmount !== '')
          ? (parseFloat(a.actualAmount) || 0)
          : (a.closingAmount ?? 0)
      })),
      seededFrom
    };
  } else if (lastOpeningFallback) {
    // Fallback: cashier never closed — carry the opening forward.
    // PERMANENT FIX: the source day may still have LIVE auto-deduct tracking
    // (usedQty) on it — e.g. it's today, sales already happened, but no
    // closing has been saved yet. That usedQty is real, current stock
    // movement, not stale leftover state. The old code copied the raw
    // opening qty and ignored usedQty entirely, so jumping to any date with
    // no record of its own (including a future date, or "today" before its
    // closing exists) seeded a FULL, undeducted qty — looking exactly like
    // auto-deduct never ran. Net usedQty out of qty here so the carried-
    // forward number reflects what's actually left, while still never
    // writing a usedQty field itself into the new opening (the field
    // belongs to the source shift's own tracking, not the new day's).
    newOpening = {
      ingredients: (lastOpeningFallback.ingredients || []).map(i => ({
        name: i.name, unit: i.unit,
        qty: Math.max(0, (i.qty ?? 0) - (i.usedQty ?? 0))
      })),
      amounts: (lastOpeningFallback.amounts || []).map(a => ({
        name: a.name,
        amount: Math.max(0, (a.amount ?? 0) - (a.usedAmount ?? 0))
      })),
      seededFrom: fallbackFrom
    };
  } else {
    return; // Nothing to seed from
  }

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

// Read-only debug view: shows exactly what is saved in storage for the most
// recent days, so a cashier/owner can see raw data without guessing.
// Does not modify or delete anything.
function renderDebugData() {
  const el = document.getElementById('debugDataOutput');
  if (!el) return;
  try {
    const data = loadInventoryData();
    const dates = Object.keys(data).sort().reverse().slice(0, 10);
    if (!dates.length) {
      el.textContent = 'No inventory data saved yet.';
      return;
    }
    let out = `Today's date key: ${getLocalDateKey()}\n`;
    out += `Currently viewing inventory date: ${getTodayInvKey()}\n`;
    out += '='.repeat(50) + '\n\n';

    dates.forEach(dateKey => {
      const shifts = getDayShifts(dateKey, data);
      out += `DATE: ${dateKey}  (${shifts.length} shift${shifts.length === 1 ? '' : 's'})\n`;
      shifts.forEach((shift, idx) => {
        out += `  Shift ${idx + 1}:\n`;
        if (shift.opening) {
          out += `    OPENING (cashier: ${shift.opening.cashier || '—'}, savedAt: ${shift.opening.savedAt || '—'}, seededFrom: ${shift.opening.seededFrom || '—'})\n`;
          (shift.opening.ingredients || []).forEach(i => {
            out += `      ${i.name}: qty=${i.qty}\n`;
          });
        } else {
          out += `    OPENING: (none saved)\n`;
        }
        if (shift.closing) {
          out += `    CLOSING (cashier: ${shift.closing.cashier || '—'}, savedAt: ${shift.closing.savedAt || '—'})\n`;
          (shift.closing.ingredients || []).forEach(i => {
            out += `      ${i.name}: closingQty=${i.closingQty ?? '—'}, actualQty=${i.actualQty ?? '(blank)'}\n`;
          });
        } else {
          out += `    CLOSING: (none saved)\n`;
        }
      });
      out += '\n';
    });

    el.textContent = out;
  } catch (e) {
    el.textContent = 'Error reading data: ' + e.message;
  }
}

// Returns a sorted list of date keys that have at least one opening or
// closing inventory record (in any shift, current or legacy format).
function getInventoryDatesWithRecords() {
  const data = loadInventoryData();
  const dates = [];
  for (const date of Object.keys(data)) {
    const shifts = getDayShifts(date, data);
    const hasRecord = shifts.some(s => (s.opening && ((s.opening.ingredients && s.opening.ingredients.length) || (s.opening.amounts && s.opening.amounts.length)))
      || (s.closing && ((s.closing.ingredients && s.closing.ingredients.length) || (s.closing.amounts && s.closing.amounts.length))));
    if (hasRecord) dates.push(date);
  }
  return dates.sort();
}

// Navigate the Daily Inventory page to the previous/next cashier shift record.
// Within a single day, this steps through each cashier's opening/closing
// inventory (shift) one at a time. When the first/last shift of the day is
// reached, Prev/Next moves on to the previous/next date that has records,
// landing on the last/first shift of that day respectively.
function shiftInventoryDate(delta) {
  const el = document.getElementById('inventoryDate');
  if (!el) return;
  const current = el.value || getLocalDateKey();
  const data = loadInventoryData();
  const dayShifts = getDayShifts(current, data);
  const shiftCount = dayShifts.length;

  // Resolve the index currently being viewed for this day
  const viewIdx = (currentShiftIndex < 0 || currentShiftIndex >= shiftCount)
    ? shiftCount - 1
    : currentShiftIndex;

  if (delta < 0) {
    // Step back to the previous shift within the same day, if any
    if (shiftCount > 0 && viewIdx > 0) {
      currentShiftIndex = viewIdx - 1;
      renderInventory();
      return;
    }
    // Otherwise jump to the previous date with records, landing on its last shift
    const todayKey = getLocalDateKey();
    const dates = getInventoryDatesWithRecords();
    const candidates = [...new Set([...dates, todayKey])].sort();
    let target = null;
    for (let i = candidates.length - 1; i >= 0; i--) {
      if (candidates[i] < current) { target = candidates[i]; break; }
    }
    if (!target) {
      showToast('No earlier inventory records found.', '');
      return;
    }
    el.value = target;
    const targetShifts = getDayShifts(target, data);
    currentShiftIndex = targetShifts.length ? targetShifts.length - 1 : -1;
    renderInventory();
  } else {
    // Step forward to the next shift within the same day, if any
    if (shiftCount > 0 && viewIdx < shiftCount - 1) {
      currentShiftIndex = viewIdx + 1;
      renderInventory();
      return;
    }
    // Otherwise jump to the next date with records, landing on its first shift
    const todayKey = getLocalDateKey();
    const dates = getInventoryDatesWithRecords();
    const candidates = [...new Set([...dates, todayKey])].sort();
    let target = null;
    for (let i = 0; i < candidates.length; i++) {
      if (candidates[i] > current) { target = candidates[i]; break; }
    }
    if (!target) {
      showToast('No later inventory records found.', '');
      return;
    }
    el.value = target;
    currentShiftIndex = 0;
    renderInventory();
  }
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
  // FIX: Block closing inventory on past dates or non-active shifts.
  if (type === 'closing') {
    const viewingDate = getTodayInvKey();
    const actualToday = getLocalDateKey();
    if (viewingDate !== actualToday) {
      showToast('⛔ Closing inventory can only be set for today.', 'error');
      return;
    }
    const _d = loadInventoryData();
    const _shifts = getDayShifts(viewingDate, _d);
    const _viewIdx = (currentShiftIndex < 0 || currentShiftIndex >= _shifts.length)
      ? _shifts.length - 1 : currentShiftIndex;
    if (_viewIdx !== _shifts.length - 1) {
      showToast('⛔ That shift is already closed.', 'error');
      return;
    }
  }

  invModalType = type;
  const dateKey = getTodayInvKey();
  const data = loadInventoryData();
  const activeShift = getActiveShift(dateKey, data) || {};

  document.getElementById('invModalTitle').textContent =
    type === 'opening' ? '🌅 Set Opening Inventory' : '🌙 Set Closing Inventory';

  if (type === 'opening') {
    const op = activeShift.opening || {};
    const tpl = loadIngredientTemplate();
    invIngredients = (op.ingredients && op.ingredients.length
      ? op.ingredients
      : tpl.ingredients.map(i => ({ ...i, qty: 0 }))
    ).map(i => ({...i}));
    invAmounts = (op.amounts && op.amounts.length
      ? op.amounts
      : tpl.amounts.map(a => ({ ...a, amount: 0 }))
    ).map(a => ({...a}));
    // Show a note if sales have already happened today — so the cashier
    // understands why the number they type here differs from what's on the shelf.
    const hasSales = invIngredients.some(i => (i.usedQty || 0) > 0);
    document.getElementById('invIngDesc').textContent = hasSales
      ? 'Edit the opening count (what you STARTED with). Sales already deducted today are shown below each item.'
      : 'How many of each ingredient/supply do you have for today? (count in pieces, packs, bags, etc.)';
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
    const todayExpenses = loadExpenses().filter(e => e.datetime && e.datetime.startsWith(dateKey));
    const totalExpense  = todayExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const opAmounts     = op.amounts || [];
    const openTotal     = opAmounts.reduce((s, a) => s + (a.amount || 0), 0);

    if (cl.amounts && cl.amounts.length) {
      // Already-saved closing: apply expense deduction if the closing amount
      // equals the opening amount (i.e. the cashier never manually adjusted it
      // and it was saved with the stale pre-fill value).  This fixes the case
      // where a closing was recorded before the expense-deduction pre-fill was
      // in place, or was submitted without editing the auto-filled 4,000 field
      // — so the report keeps showing 4,000 instead of 4,000 − 780 = 3,220.
      //
      // We only auto-correct when closingAmount === openingAmount AND expenses
      // exist, because that is the fingerprint of an un-adjusted default fill.
      // If the cashier deliberately left it at the opening value (e.g. all
      // expenses were reimbursed), they would have set actualAmount instead,
      // so this heuristic is safe.
      invAmounts = cl.amounts.map(a => {
        const opA = opAmounts.find(o => o.name === a.name);
        const opAmt = opA ? (opA.amount || 0) : 0;
        const savedClosing = parseFloat(a.closingAmount) || 0;
        const needsCorrection = totalExpense > 0
          && Math.abs(savedClosing - opAmt) < 0.01   // closing == opening → was never adjusted
          && (a.actualAmount === null || a.actualAmount === undefined || a.actualAmount === '');
        if (needsCorrection) {
          const share     = openTotal > 0 ? opAmt / openTotal : 0;
          const deduction = Math.min(opAmt, totalExpense * share);
          return { ...a, closingAmount: Math.max(0, opAmt - deduction) };
        }
        return { ...a };
      });
    } else {
      // FIX: Pre-fill closing amounts with (opening amount − today's expenses).
      // Without this, the default was the full opening amount, so if a cashier
      // skipped adjusting the field manually, the next day seeded from the
      // gross opening total (e.g. ₱4,000) instead of what was actually left
      // after expenses (e.g. ₱4,000 − ₱780 = ₱3,220).
      //
      // Expenses are deducted proportionally across all named amount items
      // (e.g. "Pocket Money ₱1,000" and "Cash on Hand ₱3,000" each absorb
      // their pro-rata share of the total expense, floored at ₱0). This keeps
      // the individual item totals internally consistent while the overall
      // closing total correctly reflects what remains.
      invAmounts = opAmounts.map(a => {
        // Distribute expense proportional to each item's share of the opening total.
        // If opening total is 0 (degenerate), just leave each item unchanged.
        const share       = openTotal > 0 ? (a.amount || 0) / openTotal : 0;
        const deduction   = Math.min(a.amount || 0, totalExpense * share);
        const closingAmt  = Math.max(0, (a.amount || 0) - deduction);
        return { ...a, closingAmount: closingAmt, notes: '' };
      });
    }
    document.getElementById('invIngDesc').textContent = 'How many of each ingredient/supply is LEFT at the end of the shift?';
    document.getElementById('invAmtDesc').textContent = 'How much cash / amount is LEFT at the end of the shift?';
  }

  renderInvModal();
  document.getElementById('invModal').classList.remove('hidden');
}

// ---- RENDER MODAL ----
function updateActualDiff(idx) {
  const ing = invIngredients[idx];
  const el = document.getElementById('actualDiff_' + idx);
  if (!el) return;
  const leftOver = ing.closingQty ?? ing.qty ?? 0;
  const hasActual = ing.actualQty !== null && ing.actualQty !== undefined;
  if (!hasActual) { el.textContent = ''; return; }
  const diff = ing.actualQty - leftOver;
  el.style.color = diff === 0 ? 'var(--green)' : 'var(--red)';
  el.textContent = diff === 0 ? '✓ match' : (diff > 0 ? `+${diff} over` : `${diff} short`);
}

function updateActualAmtDiff(idx) {
  const amt = invAmounts[idx];
  const el = document.getElementById('actualAmtDiff_' + idx);
  if (!el) return;
  const leftOver = amt.closingAmount ?? amt.amount ?? 0;
  const hasActual = amt.actualAmount !== null && amt.actualAmount !== undefined;
  if (!hasActual) { el.textContent = ''; return; }
  const diff = amt.actualAmount - leftOver;
  el.style.color = diff === 0 ? 'var(--green)' : 'var(--red)';
  el.textContent = diff === 0 ? '✓ match' : (diff > 0 ? `+₱${fmt(Math.abs(diff))} over` : `-₱${fmt(Math.abs(diff))} short`);
}

function renderInvModal() {
  const isClosing = invModalType === 'closing';

  // --- INGREDIENTS section ---
  const ingHeader = document.getElementById('invIngHeader');
  const ingList   = document.getElementById('invIngList');

  if (!isClosing) {
    ingHeader.style.gridTemplateColumns = '1fr 90px 90px 32px';
    const hasSalesHeader = invIngredients.some(i => (i.usedQty || 0) > 0);
    ingHeader.innerHTML = `
      <span style="font-size:0.72rem;color:var(--text3);font-weight:700;letter-spacing:1px;">INGREDIENT / SUPPLY</span>
      <span style="font-size:0.72rem;color:var(--text3);font-weight:700;letter-spacing:1px;">UNIT</span>
      <span style="font-size:0.72rem;color:var(--text3);font-weight:700;letter-spacing:1px;">${hasSalesHeader ? 'ON SHELF NOW' : 'QTY FOR TODAY'}</span>
      <span></span>`;

    ingList.innerHTML = invIngredients.map((ing, idx) => {
      const soldToday = ing.usedQty || 0;
      const remaining = Math.max(0, (ing.qty || 0) - soldToday);
      const hasSales = soldToday > 0;
      // Show the remaining (on-shelf) qty in the input, not the raw opening qty.
      // Deliveries/pull-outs already adjust opening qty directly, so they naturally
      // show up in ing.qty. Sales are tracked separately via usedQty — subtracting
      // them here makes the modal consistent: the number shown is always "what's
      // physically on your shelf right now."
      // When saved, we write back (remaining) as the new qty and reset usedQty to 0,
      // because the cashier is now confirming the current count from scratch.
      const displayQty = hasSales ? remaining : (ing.qty || 0);
      return `
      <div style="margin-bottom:${hasSales ? '12px' : '8px'};">
        <div style="display:grid;grid-template-columns:1fr 90px 90px 32px;gap:8px;align-items:center;">
          <input type="text" class="input-field" value="${escHtml(ing.name||'')}" placeholder="e.g. Burger Patty"
            style="padding:7px 10px;font-size:0.85rem;"
            oninput="invIngredients[${idx}].name=this.value" />
          <input type="text" class="input-field" value="${escHtml(ing.unit||'pcs')}" placeholder="pcs"
            style="padding:7px 10px;font-size:0.85rem;text-align:center;"
            oninput="invIngredients[${idx}].unit=this.value" />
          <input type="number" class="input-field" value="${displayQty}" min="0" step="1" placeholder="0"
            style="padding:7px 10px;font-size:0.92rem;font-weight:800;text-align:center;color:var(--orange);"
            oninput="invIngredients[${idx}].qty=parseInt(this.value)||0" />
          <button class="inv-del-btn" onclick="removeIngredient(${idx})">✕</button>
        </div>
        ${hasSales ? `<div style="font-size:0.72rem;margin-top:3px;padding-left:4px;display:flex;gap:12px;">
          <span style="color:var(--red);">🔥 −${soldToday} sold today already deducted</span>
        </div>` : ''}
      </div>`;
    }).join('');

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
      const hasActual = ing.actualQty !== undefined && ing.actualQty !== null && ing.actualQty !== '';
      const diff = hasActual ? (ing.actualQty - leftOver) : null;
      const diffColor = diff === null ? '' : diff === 0 ? 'var(--green)' : 'var(--red)';
      const diffLabel = diff === null ? '' : diff === 0 ? '✓' : (diff > 0 ? `+${diff}` : `${diff}`);
      return `
      <div style="display:grid;grid-template-columns:1fr 70px 90px 90px 90px;gap:8px;align-items:center;margin-bottom:14px;">
        <div style="font-weight:700;font-size:0.88rem;">${escHtml(ing.name||'Item')}</div>
        <div style="font-size:0.8rem;color:var(--text3);text-align:center;">${escHtml(ing.unit||'pcs')}</div>
        <div style="text-align:center;font-weight:800;color:var(--blue);font-size:0.95rem;">${ing.qty||0}</div>
        <input type="number" class="input-field" value="${leftOver}" min="0" step="1" placeholder="0"
          style="padding:7px 6px;font-size:0.92rem;font-weight:800;text-align:center;color:var(--green);border-color:rgba(16,185,129,0.4);"
          oninput="invIngredients[${idx}].closingQty=this.value===''?null:Math.max(0,parseInt(this.value,10)||0);updateActualDiff(${idx})" />
        <div>
          <input type="number" class="input-field" id="actualInp_${idx}" value="${hasActual ? ing.actualQty : ''}" min="0" step="1" placeholder="recount"
            style="padding:7px 6px;font-size:0.92rem;font-weight:800;text-align:center;color:var(--orange);border-color:rgba(251,146,60,0.4);width:100%;"
            oninput="invIngredients[${idx}].actualQty=this.value===''?null:parseInt(this.value);updateActualDiff(${idx})" />
          <div id="actualDiff_${idx}" style="font-size:0.68rem;font-weight:800;text-align:right;min-height:14px;color:${diffColor};">${diffLabel}</div>
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
    // Closing amounts: show opening amount, input what's left, actual recount
    amtHeader.style.gridTemplateColumns = '1fr 100px 100px 100px';
    amtHeader.innerHTML = `
      <span style="font-size:0.72rem;color:var(--text3);font-weight:700;letter-spacing:1px;">DESCRIPTION</span>
      <span style="font-size:0.72rem;color:var(--blue);font-weight:700;letter-spacing:1px;">STARTED WITH (₱)</span>
      <span style="font-size:0.72rem;color:var(--green);font-weight:700;letter-spacing:1px;">AMOUNT LEFT (₱)</span>
      <span style="font-size:0.72rem;color:var(--orange);font-weight:700;letter-spacing:1px;">ACTUAL COUNT (₱)</span>`;

    amtList.innerHTML = invAmounts.map((amt, idx) => {
      const hasActualAmt = amt.actualAmount !== undefined && amt.actualAmount !== null;
      return `
      <div style="margin-bottom:14px;">
        <div style="display:grid;grid-template-columns:1fr 100px 100px 100px;gap:8px;align-items:center;margin-bottom:4px;">
          <div style="font-weight:700;font-size:0.88rem;">${escHtml(amt.name||'Amount')}</div>
          <div style="text-align:center;font-weight:800;color:var(--blue);font-size:0.95rem;">₱${fmt(amt.amount||0)}</div>
          <input type="number" class="input-field" value="${amt.closingAmount ?? amt.amount ?? 0}" min="0" step="0.01" placeholder="0.00"
            style="padding:7px 6px;font-size:0.92rem;font-weight:800;text-align:center;color:var(--green);border-color:rgba(16,185,129,0.4);"
            oninput="invAmounts[${idx}].closingAmount=parseFloat(this.value)||0;updateInvTotal();updateActualAmtDiff(${idx})" />
          <div>
            <input type="number" class="input-field" id="actualAmtInp_${idx}" value="${hasActualAmt ? amt.actualAmount : ''}" min="0" step="0.01" placeholder="recount"
              style="padding:7px 6px;font-size:0.92rem;font-weight:800;text-align:center;color:var(--orange);border-color:rgba(251,146,60,0.4);width:100%;"
              oninput="invAmounts[${idx}].actualAmount=this.value===''?null:parseFloat(this.value);updateActualAmtDiff(${idx})" />
            <div id="actualAmtDiff_${idx}" style="font-size:0.68rem;font-weight:800;text-align:right;min-height:14px;"></div>
          </div>
        </div>
        <input type="text" class="input-field" value="${escHtml(amt.notes||'')}" placeholder="Notes (optional)..."
          style="width:100%;padding:5px 9px;color:var(--text3);font-size:0.78rem;"
          oninput="invAmounts[${idx}].notes=this.value" />
      </div>`;
    }).join('');
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
    // FIX: Strip stale tracking fields (usedQty, closingQty, actualQty) that
    // belong to the previous shift. Saving them into the new opening causes
    // phantom "already used" stock before any sales happen today.
    const ings = invIngredients
      .filter(i => i.name && i.name.trim())
      .map(({ name, unit, qty }) => ({ name, unit, qty: qty ?? 0 }));
    const amts = invAmounts
      .filter(a => a.name && a.name.trim())
      .map(({ name, amount }) => ({ name, amount: amount ?? 0 }));
    if (!ings.length && !amts.length) { showToast('Please add at least one item.', 'error'); return; }
    shift.opening = { ingredients: ings, amounts: amts, cashier: cashierName, savedAt: new Date().toLocaleTimeString('en-PH', {hour:'2-digit',minute:'2-digit'}) };
    syncIngredientTemplate(ings, amts);
  } else {
    // Read actualQty and actualAmount directly from DOM inputs to ensure
    // values are captured even if oninput didn't fire on the last edit (e.g. mobile).
    invIngredients.forEach((ing, idx) => {
      const el = document.getElementById('actualInp_' + idx);
      if (el) {
        const raw = el.value.trim();
        ing.actualQty = raw === '' ? null : (parseInt(raw, 10) || 0);
      }
    });
    invAmounts.forEach((amt, idx) => {
      const el = document.getElementById('actualAmtInp_' + idx);
      if (el) {
        const raw = el.value.trim();
        amt.actualAmount = raw === '' ? null : (parseFloat(raw) || 0);
      }
    });
    shift.closing = {
      // FIX: Only store fields needed for seeding; {...i} leaked usedQty
      // into the closing record, making the next day's auto-seeded opening
      // start with qty - usedQty instead of closingQty.
      ingredients: invIngredients.map(({ name, unit, qty, closingQty, actualQty, notes }) => ({
        name, unit,
        qty,
        closingQty: (closingQty !== null && closingQty !== undefined) ? closingQty : Math.max(0, qty || 0),
        actualQty:  actualQty !== undefined ? actualQty : null,
        notes:      notes || ''
      })),
      amounts: invAmounts.map(({ name, amount, closingAmount, actualAmount, notes }) => ({
        name,
        amount,
        closingAmount: closingAmount ?? amount ?? 0,
        actualAmount:  actualAmount !== undefined ? actualAmount : null,
        notes:         notes || ''
      })),
      cashier: cashierName,
      savedAt: new Date().toLocaleTimeString('en-PH', {hour:'2-digit',minute:'2-digit'})
    };
  }

  saveInventoryData(data);

  // FIX: When opening or closing is manually edited, delete any future dates
  // whose opening was auto-seeded from today (or from a chain of seeded dates)
  // so they re-seed with correct values.
  // CHAIN FIX: track invalidated dates so that Day C (seeded from Day B which
  // was seeded from today) is also cleared, not just Day B.
  {
    const futureDates = Object.keys(data).filter(d => d > dateKey).sort();
    let invChanged = false;
    const invalidatedDates = new Set([dateKey]);
    for (const futureDate of futureDates) {
      const futureShifts = data[futureDate] && data[futureDate].shifts;
      if (!futureShifts || !futureShifts.length) continue;
      const firstShift = futureShifts[0];
      if (!firstShift.opening) continue;
      const sf = firstShift.opening.seededFrom;
      if (sf && (sf === 'previous shift' || invalidatedDates.has(sf))) {
        delete firstShift.opening;
        if (!firstShift.closing) {
          futureShifts.splice(0, 1);
          if (!futureShifts.length) delete data[futureDate];
        }
        invChanged = true;
        invalidatedDates.add(futureDate);
      }
      // No break — must scan ALL future dates to catch chains like A→B→C→D
    }
    if (invChanged) saveInventoryData(data);
  }

  closeModal('invModal');
  renderInventory();
  // Opening/closing inventory changed -> stock limits on the New Order page
  // may now be different (e.g. ingredients just got recorded for the first
  // time today), so refresh the menu grid if it's currently showing.
  if (document.getElementById('menuGrid')) renderMenuGrid();
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
        name: i.name, unit: i.unit,
        // Use actual physical count if recorded; otherwise closingQty (may be 0 = fully used).
        // Never fall back to i.qty (opening qty) — that would re-inflate a consumed ingredient.
        qty: (i.actualQty !== null && i.actualQty !== undefined && i.actualQty !== '')
          ? (parseInt(i.actualQty, 10) || 0)
          : (i.closingQty ?? 0)
      })),
      amounts: (lastClosing.amounts || []).map(a => ({
        name: a.name,
        // Use actual physical count if recorded; otherwise closingAmount (may be 0 = fully spent).
        // Never fall back to a.amount (opening amount).
        amount: (a.actualAmount !== null && a.actualAmount !== undefined && a.actualAmount !== '')
          ? (parseFloat(a.actualAmount) || 0)
          : (a.closingAmount ?? 0)
      })),
      seededFrom: 'previous shift',
      cashier: cashierName,
      savedAt: new Date().toLocaleTimeString('en-PH', {hour:'2-digit',minute:'2-digit'})
    }
  };

  data[dateKey].shifts.push(newShift);
  saveInventoryData(data);
  renderInventory();
  if (document.getElementById('menuGrid')) renderMenuGrid();
  showToast(`✅ New shift started! Opening seeded from previous shift's closing.`, 'success');
}

// Which shift index is selected on the inventory page (-1 = last/active)
let currentShiftIndex = -1;

function selectShift(idx) {
  currentShiftIndex = idx;
  renderInventory();
}

function renderInventory() {
  const dateKey = getTodayInvKey();
  let data = loadInventoryData();

  // Auto-seed opening from last closing if needed.
  // CRITICAL FIX: Also re-seed when the existing opening was auto-seeded
  // (has seededFrom), not manually entered by the cashier. Auto-seeded openings
  // are stale snapshots — if a pull-out or delivery was recorded on the source
  // date after this date was seeded, the stored qty here is wrong. Re-seeding on
  // every view guarantees the opening always reflects the current source data.
  // Manually-entered openings (no seededFrom) are never touched — they are the
  // cashier's own physical count and must not be overwritten automatically.
  const existingShifts = getDayShifts(dateKey, data);
  const lastExistingShift = existingShifts.length ? existingShifts[existingShifts.length - 1] : null;
  const isAutoSeeded = !!(lastExistingShift && lastExistingShift.opening && lastExistingShift.opening.seededFrom);
  if (!existingShifts.length || !lastExistingShift || !lastExistingShift.opening || isAutoSeeded) {
    // BUGFIX (auto-deduct / opening-carries-over bug): re-seeding rebuilds
    // the opening from the source day's closing every time this page
    // renders (so late deliveries/pull-outs on the source day get picked
    // up — see comment above). But that rebuild used to throw away
    // usedQty, which is THIS day's own live auto-deduct tracking (written
    // by autoDeductIngredients() as sales happen today), not stale data
    // from the source day. Losing it made auto-deduct look broken —
    // remaining stock would jump back to the full opening qty every time
    // the cashier simply reopened the Daily Inventory page — and it then
    // corrupted the NEXT day's opening too, since that gets seeded from
    // this day's closingQty, which the closing modal pre-fills from
    // qty - usedQty (see openInvModal). Snapshot usedQty here and re-apply
    // it (matched by ingredient/amount name) onto the freshly-seeded
    // opening below, so today's sales are never lost by a re-seed.
    const preservedIngUsed = {};
    const preservedAmtUsed = {};
    if (isAutoSeeded) {
      ((lastExistingShift.opening.ingredients) || []).forEach(i => {
        if (i.usedQty !== undefined) preservedIngUsed[(i.name || '').trim().toLowerCase()] = i.usedQty;
      });
      ((lastExistingShift.opening.amounts) || []).forEach(a => {
        if (a.usedAmount !== undefined) preservedAmtUsed[(a.name || '').trim().toLowerCase()] = a.usedAmount;
      });
    }

    // Delete the stale auto-seeded opening so seedOpeningFromLastClosing
    // always generates a fresh one from the current source data.
    if (isAutoSeeded) {
      delete lastExistingShift.opening;
      if (!lastExistingShift.closing) {
        existingShifts.splice(existingShifts.length - 1, 1);
        if (!existingShifts.length) delete data[dateKey];
      }
    }
    seedOpeningFromLastClosing(dateKey, data);
    data = loadInventoryData();

    // Re-apply preserved usedQty/usedAmount onto the freshly-seeded opening.
    if (isAutoSeeded && (Object.keys(preservedIngUsed).length || Object.keys(preservedAmtUsed).length)) {
      const refreshedShift = getActiveShift(dateKey, data);
      if (refreshedShift && refreshedShift.opening) {
        (refreshedShift.opening.ingredients || []).forEach(i => {
          const key = (i.name || '').trim().toLowerCase();
          if (preservedIngUsed[key] !== undefined) {
            // Cap to the new qty in case the re-seed changed available stock.
            i.usedQty = Math.min(preservedIngUsed[key], i.qty || 0);
          }
        });
        (refreshedShift.opening.amounts || []).forEach(a => {
          const key = (a.name || '').trim().toLowerCase();
          if (preservedAmtUsed[key] !== undefined) {
            a.usedAmount = preservedAmtUsed[key];
          }
        });
        saveInventoryData(data);
      }
    }
  }

  const dayShifts = getDayShifts(dateKey, data);
  const shiftCount = dayShifts.length;
  const todayKey = getLocalDateKey();
  const isToday = dateKey === todayKey;

  // Resolve which shift to display
  const viewIdx = (currentShiftIndex < 0 || currentShiftIndex >= shiftCount)
    ? shiftCount - 1
    : currentShiftIndex;

  // ── Shift indicator (between Prev/Next buttons) ─────────────────────────
  const shiftIndicator = document.getElementById('invShiftIndicator');
  if (shiftIndicator) {
    if (shiftCount > 0) {
      const dateLabel = new Date(dateKey + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
      shiftIndicator.textContent = `Shift ${viewIdx + 1} of ${shiftCount} · ${dateLabel}`;
    } else {
      shiftIndicator.textContent = '';
    }
  }

  const activeShift = dayShifts[viewIdx] || {};
  const op = activeShift.opening || {};
  const cl = activeShift.closing || {};

  const openIngredients  = op.ingredients || [];
  const openAmounts      = op.amounts     || [];
  const closeIngredients = cl.ingredients || [];
  const closeAmounts     = cl.amounts     || [];

  // Map deliveries/pull-outs (tagged with dateKey + shiftIndex at save time)
  // to the shift/ingredient they actually belong to. Hoisted here (rather than
  // declared inside the report section further down) so both the Closing list
  // above and the comparison report below use the exact same numbers.
  const allDeliveries = loadSharedDeliveries();
  function deliveredQtyFor(itemName, shiftIdx) {
    // Net of stock IN (delivery) minus stock OUT (pullout) for this
    // ingredient/shift, regardless of timing — used only for the "+X
    // delivered" / "−X pulled out" display hints, not for the Used calc.
    return allDeliveries
      .filter(d => d.dateKey === dateKey && d.shiftIndex === shiftIdx
        && d.item && d.item.trim().toLowerCase() === itemName.trim().toLowerCase())
      .reduce((sum, d) => sum + (d.type === 'pullout' ? -(d.qtyNum || 0) : (d.qtyNum || 0)), 0);
  }
  function pulledOutQtyFor(itemName, shiftIdx) {
    return allDeliveries
      .filter(d => d.dateKey === dateKey && d.shiftIndex === shiftIdx && d.type === 'pullout'
        && d.item && d.item.trim().toLowerCase() === itemName.trim().toLowerCase())
      .reduce((sum, d) => sum + (d.qtyNum || 0), 0);
  }
  // BUGFIX: a movement only needs to be netted out of "Used" when it was
  // logged AFTER this shift's closing had already been saved — that's the
  // only case where the delivery/pull-out landed in opening.qty too late to
  // be reflected in the cashier's manual closing/actual count. A movement
  // logged BEFORE closing is already baked into that closing count, so
  // netting it again would double-count it and silently understate (for
  // deliveries) or overstate (for pull-outs) real ingredient usage. Each
  // movement is tagged with `postClosing` at save time (saveDelivery(),
  // pos-part2.js) precisely so this function can tell the two cases apart —
  // checking "does this shift currently have a closing" is not enough,
  // because that's true for both cases by the time this report renders.
  function postClosingNetQtyFor(itemName, shiftIdx) {
    return allDeliveries
      .filter(d => d.dateKey === dateKey && d.shiftIndex === shiftIdx && d.postClosing
        && d.item && d.item.trim().toLowerCase() === itemName.trim().toLowerCase())
      .reduce((sum, d) => sum + (d.type === 'pullout' ? -(d.qtyNum || 0) : (d.qtyNum || 0)), 0);
  }

  const emptyEl       = document.getElementById('invEmptyState');
  const summaryCards  = document.getElementById('invSummaryCards');
  const compareGrid   = document.getElementById('invCompareGrid');
  const reportSection = document.getElementById('invReportSection');
  const shiftSelector = document.getElementById('invShiftSelector');

  const hasOpening = openIngredients.length > 0 || openAmounts.length > 0;

  // Show/hide Set Opening button (today only)
  const btnOpen = document.getElementById('btnSetOpening');
  if (btnOpen) btnOpen.style.display = isToday ? '' : 'none';

  // FIX: Hide Set Closing button on past dates and past shifts — only show
  // for today's active (last) shift to prevent accidental past-date saves.
  const isActiveShift = isToday && viewIdx === shiftCount - 1;
  const btnSetClosing = document.getElementById('btnSetClosing');
  if (btnSetClosing) btnSetClosing.style.display = isActiveShift ? '' : 'none';

  if (!hasOpening) {
    emptyEl.style.display = 'block';
    emptyEl.innerHTML = isToday
      ? '<div style="font-size:3rem;margin-bottom:12px;">📦</div><div style="font-weight:700;font-size:1rem;margin-bottom:6px;">No Inventory Set for Today</div><div style="font-size:0.88rem;margin-bottom:20px;">Start by setting your Opening Inventory for today.</div><button class="btn btn-primary" onclick="openInvModal(\'opening\')">+ Set Opening Inventory</button>'
      : '<div style="font-size:3rem;margin-bottom:12px;">📅</div><div style="font-weight:700;font-size:1rem;margin-bottom:6px;">No Inventory Recorded</div><div style="font-size:0.88rem;color:var(--text3);">No opening inventory was saved for <strong>' + dateKey + '</strong>.<br>Use ◀ Prev / Next ▶ to find a date with records.</div>';
    summaryCards.style.display = 'none';
    compareGrid.style.display = 'none';
    reportSection.style.display = 'none';
    if (shiftSelector) shiftSelector.style.display = 'none';
    return;
  }

  emptyEl.style.display = 'none';
  summaryCards.style.display = 'grid';
  compareGrid.style.display = 'grid';

  // ── Status banner ─────────────────────────────────────────────────────────
  const statusBannerEl = document.getElementById('invStatusBanner');
  if (statusBannerEl) {
    const hasClosing = (cl.ingredients && cl.ingredients.length) || (cl.amounts && cl.amounts.length);
    if (hasClosing) {
      statusBannerEl.style.display = 'block';
      statusBannerEl.innerHTML = `<div style="padding:10px 16px;border-radius:10px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);font-size:0.85rem;font-weight:700;color:var(--green);">✅ Shift ${viewIdx + 1} closed${cl.cashier ? ' by ' + escHtml(cl.cashier) : ''}${cl.savedAt ? ' at ' + cl.savedAt : ''}.</div>`;
    } else if (isToday) {
      statusBannerEl.style.display = 'block';
      statusBannerEl.innerHTML = `<div style="padding:10px 16px;border-radius:10px;background:rgba(251,146,60,0.1);border:1px solid rgba(251,146,60,0.3);font-size:0.85rem;font-weight:700;color:var(--orange);">⏳ Shift open — no closing inventory yet${op.cashier ? ' (opened by ' + escHtml(op.cashier) + ')' : ''}.</div>`;
    } else {
      statusBannerEl.style.display = 'none';
    }
  }

  // ── Ingredient/shift list (always shown; selectable when 2+ shifts) ─────
  if (shiftSelector) {
    shiftSelector.style.display = 'block';
    const headerLabel = shiftCount > 1
      ? '🔄 SHIFTS THIS DAY — tap to view'
      : '🥩 INGREDIENT INVENTORY — Opening → Closing';
    let shtml = `<div style="font-size:0.72rem;font-weight:800;color:var(--text3);letter-spacing:1px;margin-bottom:8px;">${headerLabel}</div>`;
    shtml += '<div style="display:flex;flex-direction:column;gap:6px;">';
    dayShifts.forEach((s, i) => {
      const sOp = s.opening || {}, sCl = s.closing || {};
      const openAmt = (sOp.amounts || []).reduce((a, x) => a + (x.amount||0), 0);
      const closeAmt = (sCl.amounts || []).reduce((a, x) => {
        const hasActual = x.actualAmount !== null && x.actualAmount !== undefined && x.actualAmount !== '';
        return a + (hasActual ? (parseFloat(x.actualAmount) || 0) : (parseFloat(x.closingAmount) || 0));
      }, 0);
      const sOpIng = sOp.ingredients || [];
      const sClIng = sCl.ingredients || [];
      const hasCl = (sCl.ingredients && sCl.ingredients.length) || (sCl.amounts && sCl.amounts.length);
      const isSelected = i === viewIdx;
      const isLast = isToday && i === shiftCount - 1;
      const cashier = sOp.cashier || sCl.cashier || '';
      const time = sOp.savedAt || '';
      const clickable = shiftCount > 1;

      // Build a short preview of ingredients: name, opening qty → closing qty (if set)
      // For the active shift today (no closing yet), show LIVE remaining
      // stock (qty - usedQty) instead of the static opening qty, so this
      // preview also updates immediately as sales happen.
      const isThisActiveToday = isToday && i === shiftCount - 1 && !hasCl;
      const ingPreviewLimit = 4;
      const ingPreview = sOpIng.slice(0, ingPreviewLimit).map(oi => {
        const ci = sClIng.find(c => c.name === oi.name);
        const unit = oi.unit || ci?.unit || 'pcs';
        const openQty = oi.qty || 0;
        const closeQty = ci ? (ci.closingQty ?? 0) : null;
        const remainingQty = Math.max(0, openQty - (oi.usedQty || 0));
        const displayQty = isThisActiveToday ? remainingQty : openQty;
        // Stock-level rule applied to whichever qty is actually shown here
        // (closing qty once the shift is closed, otherwise the live/opening
        // qty) so this preview badge matches the same color logic as the
        // full Opening/Closing Inventory lists below.
        const displayColor = stockLevelColor(closeQty !== null ? closeQty : displayQty, oi.name);
        return `<span style="display:inline-flex;align-items:center;gap:3px;background:var(--bg3);border-radius:6px;padding:2px 8px;font-size:0.74rem;white-space:nowrap;">
          <span style="font-weight:700;">${escHtml(oi.name)}</span>
          <span style="color:${displayColor};">${displayQty}${closeQty !== null ? ` → ${closeQty}` : ''} ${escHtml(unit)}</span>
        </span>`;
      }).join('');
      const moreCount = Math.max(0, sOpIng.length - ingPreviewLimit);
      const moreBadge = moreCount > 0
        ? `<span style="font-size:0.72rem;color:var(--text3);font-weight:700;">+${moreCount} more</span>` : '';

      shtml += `<div ${clickable ? `onclick="selectShift(${i})" style="cursor:pointer;` : 'style="'}padding:10px 14px;border-radius:10px;border:2px solid ${isSelected && clickable ? 'var(--orange)' : 'var(--border)'};background:${isSelected && clickable ? 'rgba(251,146,60,0.1)' : 'var(--card-bg)'};display:flex;flex-direction:column;gap:8px;">
        ${shiftCount > 1 ? `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
          <div>
            <span style="font-weight:800;font-size:0.88rem;color:${isSelected ? 'var(--orange)' : 'var(--text1)'};">Shift ${i+1}</span>
            ${cashier ? `<span style="font-size:0.72rem;color:var(--text3);margin-left:8px;">👤 ${escHtml(cashier)}${time ? ' · '+time : ''}</span>` : ''}
            ${isLast ? '<span style="font-size:0.68rem;background:rgba(251,146,60,0.15);color:var(--orange);border-radius:6px;padding:1px 6px;margin-left:6px;font-weight:700;">ACTIVE</span>' : ''}
          </div>
          <div style="text-align:right;font-size:0.82rem;">
            <span style="color:var(--blue);">Open ₱${fmt(openAmt)}</span>
            <span style="color:var(--text3);margin:0 4px;">→</span>
            <span style="color:${hasCl ? 'var(--green)' : 'var(--text3)'};">${hasCl ? 'Close ₱'+fmt(closeAmt) : 'No closing'}</span>
          </div>
        </div>` : ''}
        ${sOpIng.length ? `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span style="font-size:0.72rem;color:var(--orange);font-weight:800;">🥩 ${sOpIng.length} ingredient${sOpIng.length !== 1 ? 's' : ''}:</span>
          ${ingPreview}${moreBadge}
        </div>` : `<div style="font-size:0.84rem;color:var(--text3);text-align:center;padding:${shiftCount > 1 ? '0' : '12px 0'};">No ingredients recorded yet. ${isLast ? `<button class="btn btn-outline btn-sm" onclick="event.stopPropagation();openInvModal('opening')" style="margin-left:8px;">+ Add Ingredients</button>` : ''}</div>`}
      </div>`;
    });
    shtml += '</div>';
    shiftSelector.innerHTML = shtml;
  }

  // ── Summary cards for the selected shift ────────────────────────────────
  // BUGFIX: "Cash Left" totals/displays were computed from `closingAmount`
  // only, ignoring the cashier's "actual recount" entry. So if a cashier
  // recorded a real shortage (e.g. opened with ₱1,000, actually counted only
  // ₱950), the closing list still showed the un-adjusted ₱1,000 — and other
  // cards downstream (Cash Used / Closing Cash / Discrepancy) disagreed with
  // each other because some used actualAmount and some didn't. This helper
  // is now the single source of truth: actual recount wins when present,
  // otherwise fall back to the entered closing amount.
  const effectiveCashAmt = a => {
    const hasActual = a.actualAmount !== null && a.actualAmount !== undefined && a.actualAmount !== '';
    return hasActual ? (parseFloat(a.actualAmount) || 0) : (parseFloat(a.closingAmount) || 0);
  };
  const openAmtTotal  = openAmounts.reduce((s, a) => s + (a.amount||0), 0);
  const closeAmtTotal = closeAmounts.length ? closeAmounts.reduce((s, a) => s + effectiveCashAmt(a), 0) : null;
  const usedAmt = closeAmtTotal !== null ? Math.max(0, openAmtTotal - closeAmtTotal) : null;

  // Expenses for the viewed date — deducted from opening cash in the display
  const dayExpenses = loadExpenses().filter(e => e.datetime && e.datetime.startsWith(dateKey));
  const dayExpenseTotal = dayExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const openCashAfterExpenses = Math.max(0, openAmtTotal - dayExpenseTotal);

  document.getElementById('invOpenTotal').textContent  = '₱' + fmt(openAmtTotal);
  document.getElementById('invCloseTotal').textContent = closeAmtTotal !== null ? '₱' + fmt(closeAmtTotal) : '—';
  const ingCountEl = document.getElementById('invIngCount');
  if (ingCountEl) ingCountEl.textContent = openIngredients.length + ' item' + (openIngredients.length !== 1 ? 's' : '');

  // ── Opening list ─────────────────────────────────────────────────────────
  const openingList = document.getElementById('invOpeningList');
  let openHTML = '';
  if (op.seededFrom) {
    const prevDate = op.seededFrom === 'previous shift' ? 'previous shift'
      : new Date(op.seededFrom + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
    openHTML += `<div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:10px;padding:8px 12px;margin-bottom:12px;font-size:0.8rem;color:var(--green);font-weight:700;">🔄 Auto-filled from ${prevDate}</div>`;
  }
  if (openIngredients.length) {
    openHTML += `<div style="font-size:0.72rem;font-weight:800;color:var(--orange);letter-spacing:1px;margin-bottom:6px;text-transform:uppercase;">🥩 Ingredients/Supplies</div>`;
    // The headline number for each ingredient is now the LIVE REMAINING stock
    // (opening qty - usedQty), not the static opening qty — so a sale
    // immediately changes what's shown here, not just in fine print below it.
    // Only the ACTIVE shift on TODAY actually accrues usedQty from sales
    // (autoDeductIngredients/adjustIngredientsForOrderEdit only ever touch
    // today's active shift), so only that shift shows "remaining" as the
    // headline; other shifts/dates show the plain opening qty since nothing
    // is being live-deducted from them.
    const isActiveShiftToday = isToday && viewIdx === shiftCount - 1;
    const globalAlertThreshold = loadGlobalAlertThreshold();
    openHTML += openIngredients.map((i, idx) => {
      const unit = escHtml(i.unit || 'pcs');
      const opened = i.qty || 0;
      const used = i.usedQty || 0;
      const remaining = Math.max(0, opened - used);
      const headline = isActiveShiftToday ? remaining : opened;
      // Top-5 ingredients turn orange when below the global alert threshold.
      // Per-ingredient thresholds still apply for all items via stockLevelColor.
      const isTopFive = idx < 5;
      const isLowStock = isTopFive && globalAlertThreshold !== null && headline > 0 && headline < globalAlertThreshold;
      // If this is a top-5 low-stock item, force orange; otherwise use normal stock color.
      const headlineColor = isLowStock ? 'var(--orange)' : stockLevelColor(headline, i.name);
      return `
      <div class="inv-list-item" style="flex-direction:column;align-items:stretch;gap:2px;">
        <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span style="font-weight:700;">${escHtml(i.name)}</span>
            <span style="font-size:0.72rem;color:var(--text3);">${unit}</span>
            ${isLowStock ? `<span style="font-size:0.68rem;font-weight:800;color:var(--orange);background:rgba(232,124,30,0.13);border:1px solid rgba(232,124,30,0.35);border-radius:6px;padding:1px 6px;white-space:nowrap;">⚡ Low Stock</span>` : ''}
          </div>
          <span style="font-weight:800;color:${headlineColor};">${headline} <span style="font-size:0.72rem;color:var(--text3);">${unit}</span></span>
        </div>
        ${isActiveShiftToday && used > 0 ? `<div style="display:flex;justify-content:flex-end;gap:10px;font-size:0.72rem;color:var(--text3);">
          <span>Opened with ${opened} ${unit}</span>
          <span style="color:var(--red);font-weight:700;">🔥 −${used} sold</span>
        </div>` : ''}
        ${isActiveShiftToday && remaining <= 0 && opened > 0 ? `<div style="font-size:0.72rem;color:var(--red);font-weight:700;text-align:right;">🚫 Out of stock</div>` : ''}
      </div>`;
    }).join('');
  }
  if (openAmounts.length) {
    openHTML += `<div style="font-size:0.72rem;font-weight:800;color:var(--blue);letter-spacing:1px;margin:12px 0 6px;text-transform:uppercase;">💵 Cash / Amounts</div>`;
    openHTML += openAmounts.map(a => `
      <div class="inv-list-item">
        <span style="font-weight:700;">${escHtml(a.name)}</span>
        <span style="font-weight:800;color:var(--blue);">₱${fmt(a.amount||0)}</span>
      </div>`).join('');
    openHTML += `<div style="display:flex;justify-content:space-between;padding-top:10px;font-weight:800;font-size:0.9rem;border-top:1px dashed var(--border);margin-top:8px;"><span>CASH TOTAL</span><span style="color:var(--blue);">₱${fmt(openAmtTotal)}</span></div>`;
    if (dayExpenseTotal > 0) {
      openHTML += `
        <div style="display:flex;justify-content:space-between;padding-top:6px;font-size:0.85rem;color:var(--orange);">
          <span>− Expenses / Cash-outs</span>
          <span style="font-weight:800;">−₱${fmt(dayExpenseTotal)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding-top:6px;font-weight:800;font-size:0.95rem;border-top:2px solid var(--border);margin-top:6px;">
          <span>REMAINING CASH</span>
          <span style="color:${openCashAfterExpenses <= 0 ? 'var(--red)' : 'var(--green)'};">₱${fmt(openCashAfterExpenses)}</span>
        </div>`;
      // Itemised expense breakdown under the opening cash section
      openHTML += `<div style="margin-top:8px;border-left:3px solid rgba(251,146,60,0.4);padding-left:10px;">`;
      dayExpenses.forEach(e => {
        const t = new Date(e.datetime).toLocaleTimeString('en-PH', {hour:'2-digit',minute:'2-digit'});
        openHTML += `<div style="display:flex;justify-content:space-between;font-size:0.78rem;padding:2px 0;color:var(--text2);">
          <span>🔸 ${escHtml(e.desc)}${e.category ? ' ('+escHtml(e.category)+')' : ''} <span style="color:var(--text3);">${t}</span></span>
          <span style="font-weight:700;color:var(--orange);">−₱${fmt(e.amount)}</span>
        </div>`;
      });
      openHTML += `</div>`;
    }
  }
  openingList.innerHTML = openHTML || `<p style="color:var(--text3);font-size:0.85rem;text-align:center;padding:16px 0;">No opening inventory set.</p>`;

  // Refresh the Alerts button badge (low-stock count)
  refreshAlertsBadge();




  // ── Closing list ─────────────────────────────────────────────────────────
  const closingList = document.getElementById('invClosingList');
  const hasClosing = closeIngredients.length > 0 || closeAmounts.length > 0;
  if (hasClosing) {
    let closeHTML = '';
    if (cl.cashier) closeHTML += `<div style="font-size:0.75rem;color:var(--text3);margin-bottom:10px;">👤 <b>${escHtml(cl.cashier)}</b>${cl.savedAt ? ' · ' + cl.savedAt : ''}</div>`;
    if (closeIngredients.length) {
      closeHTML += `<div style="font-size:0.72rem;font-weight:800;color:var(--orange);letter-spacing:1px;margin-bottom:6px;text-transform:uppercase;">🥩 Ingredients Left</div>`;
      closeHTML += closeIngredients.map(i => {
        const oi = openIngredients.find(o => o.name === i.name);
        const hasActual = i.actualQty !== null && i.actualQty !== undefined && i.actualQty !== '';
        const effectiveQty = hasActual ? (parseInt(i.actualQty, 10) || 0) : (i.closingQty || 0);
        // Net out only post-closing movements (see postClosingNetQtyFor above)
        // so this badge always agrees with the "Used/Sold" column in the
        // comparison report below for the same shift/ingredient.
        const postClosingDelta = postClosingNetQtyFor(i.name, viewIdx);
        const used = oi ? Math.max(0, (oi.qty||0) - postClosingDelta - effectiveQty) : 0;
        const short = hasActual ? ((i.closingQty || 0) - effectiveQty) : 0;
        return `<div class="inv-list-item">
          <div>
            <span style="font-weight:700;">${escHtml(i.name)}</span>
            ${used > 0 ? `<span style="font-size:0.72rem;color:var(--red);margin-left:6px;">-${used} used</span>` : ''}
            ${hasActual && short > 0 ? `<span style="font-size:0.72rem;color:var(--red);margin-left:6px;">(${short} short — actual count used)</span>` : ''}
            ${hasActual && short < 0 ? `<span style="font-size:0.72rem;color:var(--orange);margin-left:6px;">(${Math.abs(short)} over — actual count used)</span>` : ''}
          </div>
          <span style="font-weight:800;color:${stockLevelColor(effectiveQty, i.name)};">${effectiveQty} <span style="font-size:0.72rem;color:var(--text3);">${escHtml(i.unit||'pcs')}</span></span>
        </div>`;
      }).join('');
    }
    if (closeAmounts.length) {
      closeHTML += `<div style="font-size:0.72rem;font-weight:800;color:var(--blue);letter-spacing:1px;margin:12px 0 6px;text-transform:uppercase;">💵 Cash Left</div>`;
      closeHTML += closeAmounts.map(a => {
        const hasActualAmt = a.actualAmount !== null && a.actualAmount !== undefined && a.actualAmount !== '';
        const effectiveAmt = effectiveCashAmt(a);
        const shortAmt = hasActualAmt ? ((parseFloat(a.closingAmount) || 0) - effectiveAmt) : 0;
        return `
        <div class="inv-list-item">
          <div>
            <span style="font-weight:700;">${escHtml(a.name)}</span>${a.notes ? `<span style="font-size:0.72rem;color:var(--text3);margin-left:6px;">${escHtml(a.notes)}</span>` : ''}
            ${hasActualAmt && shortAmt > 0 ? `<span style="font-size:0.72rem;color:var(--red);margin-left:6px;">(₱${fmt(shortAmt)} short — actual count used)</span>` : ''}
            ${hasActualAmt && shortAmt < 0 ? `<span style="font-size:0.72rem;color:var(--orange);margin-left:6px;">(₱${fmt(Math.abs(shortAmt))} over — actual count used)</span>` : ''}
          </div>
          <span style="font-weight:800;color:${hasActualAmt && shortAmt !== 0 ? 'var(--orange)' : 'var(--green)'};">₱${fmt(effectiveAmt)}</span>
        </div>`;
      }).join('');
      closeHTML += `<div style="display:flex;justify-content:space-between;padding-top:10px;font-weight:800;font-size:0.9rem;border-top:1px dashed var(--border);margin-top:8px;"><span>CASH LEFT</span><span style="color:var(--green);">₱${fmt(closeAmtTotal||0)}</span></div>`;
    }
    if (isToday && viewIdx === shiftCount - 1) {
      closeHTML += `<div style="margin-top:16px;"><button class="btn btn-primary" style="width:100%;font-size:0.88rem;" onclick="startNewShift()">🔄 Start New Shift (Next Cashier)</button></div>`;
    }
    closingList.innerHTML = closeHTML;
    document.getElementById('btnSetClosing').textContent = '✏️ Edit';
    document.getElementById('btnSetClosing').className = 'btn btn-outline btn-sm';
  } else {
    closingList.innerHTML = `<p style="color:var(--text3);font-size:0.85rem;text-align:center;padding:16px 0;">Not yet set. Click "+ Set Closing" to add.</p>`;
    const btnCl = document.getElementById('btnSetClosing');
    if (btnCl) { btnCl.textContent = '+ Set Closing'; btnCl.className = 'btn btn-primary btn-sm'; }
  }

  // ── Comparison report ────────────────────────────────────────────────────
  const anyShiftHasClosing = dayShifts.some(s => (s.closing?.ingredients?.length || s.closing?.amounts?.length));
  // Always show the report section — even without a closing, the opening data
  // is useful to see (stock on hand, pull-outs, etc.). When no closing exists,
  // we render an opening-only table with a "no closing yet" notice.
  reportSection.style.display = 'block';
  if (anyShiftHasClosing) {

    // Build report across ALL shifts so the table shows the full day
    // For single shift: Item | Opening | Closing | Used | Actual | Variance | Status
    // For multi-shift:  Item | S1 Open | S1 Close | S1 Used | S2 Open | S2 Close | S2 Used | ... | Total Used | Status

    const table = document.getElementById('invReportTable');
    const thead = table.querySelector('thead tr');
    const tbody = document.getElementById('invReportBody');

    // Gather all unique item names across every shift
    const allIngNames = [...new Set(dayShifts.flatMap(s =>
      [...(s.opening?.ingredients||[]), ...(s.closing?.ingredients||[])].map(i => i.name)
    ))];
    const allAmtNames = [...new Set(dayShifts.flatMap(s =>
      [...(s.opening?.amounts||[]), ...(s.closing?.amounts||[])].map(a => a.name)
    ))];

    // Build dynamic header
    if (shiftCount === 1) {
      thead.innerHTML = '<th>Ingredient/Supply</th><th>Opening</th><th>Closing</th><th>Used/Sold</th><th>Actual Count</th><th>Variance</th><th>Status</th>';
    } else {
      let hcols = '<th>Ingredient/Supply</th>';
      dayShifts.forEach((_, si) => {
        hcols += `<th style="color:var(--orange);">S${si+1} Open</th><th style="color:var(--green);">S${si+1} Close</th><th style="color:var(--orange);font-weight:700;">S${si+1} Actual</th><th style="color:var(--red);">S${si+1} Short</th><th style="color:var(--red);">S${si+1} Used</th>`;
      });
      hcols += '<th style="color:var(--red);font-weight:800;">Total Used</th><th>Status</th>';
      thead.innerHTML = hcols;
    }

    let rows = '';
    let totalShorts = 0;

    // Ingredient rows
    allIngNames.forEach(name => {
      let totalUsed = 0;
      let anyVariance = false;
      let lastEndQty = null;
      let unit = 'pcs';

      if (shiftCount === 1) {
        const s = dayShifts[0];
        const opI = (s.opening?.ingredients||[]).find(i => i.name === name);
        const clI = (s.closing?.ingredients||[]).find(i => i.name === name);
        const startQty = opI ? (opI.qty||0) : 0;
        const endQty   = clI ? (clI.closingQty ?? 0) : null;
        // If this shift is already closed, any movement tagged to it landed in
        // opening.qty AFTER closingQty was already locked in by the cashier —
        // so that delivered/pulled amount was never actually available to be
        // "used" by sales. Net it out, or Total Used gets distorted by the
        // full delivered/pulled qty.
        const deliveredQty = deliveredQtyFor(name, 0);
        const pulledQty = pulledOutQtyFor(name, 0);
        // BUGFIX: only movements logged AFTER this shift's closing should be
        // netted out of Used (see postClosingNetQtyFor) — netting ALL movements
        // whenever the shift happens to be closed (the old `s.closing ? ... : 0`
        // check) wrongly subtracted mid-shift deliveries too, which were already
        // reflected in the cashier's closing count, distorting Used/shrinkage.
        const postClosingDelta = postClosingNetQtyFor(name, 0);
        // PERMANENT FIX: a shift with no saved closing yet used to show "—"
        // (blank) for Used/Closing here, even when sales had already been
        // auto-deducted live (opI.usedQty) — making the official report look
        // like zero activity happened, while the live Opening Inventory card
        // above correctly showed "−N sold". Fall back to the LIVE usedQty so
        // the report always reflects real activity, not just finalized
        // closings. liveUsedQty/liveRemaining are clearly distinguished from
        // a real saved closing via the "(live)" tag below — they are an
        // in-progress snapshot, not a locked-in physical count.
        const hasLiveTracking = !clI && opI && (opI.usedQty || 0) > 0;
        const liveUsedQty = hasLiveTracking ? (opI.usedQty || 0) : null;
        const liveRemaining = hasLiveTracking ? Math.max(0, startQty - liveUsedQty) : null;
        const usedQty  = endQty !== null ? Math.max(0, (startQty - postClosingDelta) - endQty) : liveUsedQty;
        unit = opI?.unit || clI?.unit || 'pcs';
        const hasActual = clI && clI.actualQty !== undefined && clI.actualQty !== null && clI.actualQty !== '';
        const actualQty = hasActual ? clI.actualQty : null;
        const variance  = hasActual ? (actualQty - endQty) : null;
        const vColor = variance === null ? '' : variance === 0 ? 'var(--green)' : 'var(--red)';
        const vLabel = variance === null ? '—' : variance === 0 ? '✓ Match' : (variance > 0 ? `+${variance} over` : `${variance} short`);
        if (variance !== null && variance !== 0) anyVariance = true;
        // Status rule: Short shows the exact short count (actual physical count vs
        // the expected closing qty); Empty when nothing is left;
        // Low Stock when closing qty is at or below the custom threshold; OK otherwise.
        const shortAmount = (hasActual && actualQty < endQty) ? (endQty - actualQty) : 0;
        if (shortAmount > 0) totalShorts++;
        const ingThreshold = getIngredientThreshold(name);
        const effectiveClose = hasActual ? actualQty : (endQty !== null ? endQty : liveRemaining);
        const isCloseLow = ingThreshold !== null && effectiveClose !== null && effectiveClose > 0 && effectiveClose <= ingThreshold;
        let status = shortAmount > 0 ? `<span class="inv-status-tag inv-tag-low">⚠️ Short - ${shortAmount} ${escHtml(unit)}</span>`
          : (endQty === 0 || (hasActual && actualQty === 0) || liveRemaining === 0) ? `<span class="inv-status-tag inv-tag-low">⚡ Empty</span>`
          : isCloseLow ? `<span class="inv-status-tag inv-tag-low">⚡ Low Stock</span>`
          : `<span class="inv-status-tag inv-tag-ok">✓ OK</span>`;
        const closingCellContent = endQty !== null
          ? endQty+' '+escHtml(unit)
          : (liveRemaining !== null
              ? `${liveRemaining} ${escHtml(unit)} <span style="font-size:0.68rem;color:var(--text3);font-weight:700;">(live)</span>`
              : '<span style="color:var(--text3);font-size:0.78rem;">—</span>');
        rows += `<tr>
          <td><strong>${escHtml(name)}</strong> <span style="font-size:0.72rem;color:var(--text3);">(qty)</span></td>
          <td style="color:${stockLevelColor(startQty, name)};">${startQty} ${escHtml(unit)}${deliveredQty > 0 ? `<div style="font-size:0.68rem;color:var(--blue);font-weight:700;">+${deliveredQty} delivered</div>` : ''}${pulledQty > 0 ? `<div style="font-size:0.68rem;color:var(--red);font-weight:700;">−${pulledQty} pulled out</div>` : ''}</td>
          <td style="color:${endQty !== null ? stockLevelColor(endQty, name) : (liveRemaining !== null ? stockLevelColor(liveRemaining, name) : '')};">${closingCellContent}</td>
          <td style="color:${usedQty>0?'var(--red)':'var(--text3)'};">${usedQty !== null ? (usedQty > 0 ? '-'+usedQty : '—') : '<span style="color:var(--text3);font-size:0.78rem;">—</span>'}</td>
          <td style="color:${hasActual ? stockLevelColor(actualQty, name) : ''};font-weight:800;">${hasActual ? actualQty+' '+escHtml(unit) : '<span style="color:var(--text3);font-size:0.78rem;">—</span>'}</td>
          <td style="color:${vColor};font-weight:800;">${vLabel}</td>
          <td>${status}</td></tr>`;
      } else {
        let cols = `<td><strong>${escHtml(name)}</strong> <span style="font-size:0.72rem;color:var(--text3);">(qty)</span></td>`;
        let totalShortQty = 0;
        let everHadStock = false;
        dayShifts.forEach((s, si) => {
          const opI = (s.opening?.ingredients||[]).find(i => i.name === name);
          const clI = (s.closing?.ingredients||[]).find(i => i.name === name);
          const startQty = opI ? (opI.qty||0) : 0;
          const endQty   = clI ? (clI.closingQty ?? 0) : (opI ? null : null);
          const deliveredQty = deliveredQtyFor(name, si);
          const pulledQty = pulledOutQtyFor(name, si);
          // BUGFIX: only movements logged AFTER this shift's closing should be
          // netted out of Used — a movement logged before closing is already
          // reflected in the cashier's closing count, so netting it again
          // double-counted it (the old `s.closing ? ... : 0` check couldn't
          // tell "closed, movement was before" from "closed, movement was after").
          const postClosingDelta = postClosingNetQtyFor(name, si);
          // PERMANENT FIX: a shift with no saved closing yet (endQty === null)
          // used to report 0 Used here even when sales had already been
          // auto-deducted live onto opI.usedQty — so an in-progress shift
          // with real sales showed "—" for Used and the full undeducted
          // qty for everything downstream (Total Used, Status), completely
          // hiding that activity from the official report. Fall back to the
          // live usedQty/remaining for any shift that hasn't been closed yet.
          const hasLiveTrackingI = !clI && opI && (opI.usedQty || 0) > 0;
          const liveUsedQtyI = hasLiveTrackingI ? (opI.usedQty || 0) : null;
          const liveRemainingI = hasLiveTrackingI ? Math.max(0, startQty - liveUsedQtyI) : null;
          const usedQty  = (endQty !== null) ? Math.max(0, (startQty - postClosingDelta) - endQty) : (liveUsedQtyI || 0);
          unit = opI?.unit || clI?.unit || unit;
          totalUsed += usedQty;
          // lastEndQty drives the "Empty"/"Low Stock" status below — when this
          // shift is still open, fall back to the live remaining qty so an
          // in-progress shift that's actually run low/out is correctly
          // flagged instead of being skipped because endQty is null.
          lastEndQty = endQty !== null ? endQty : (liveRemainingI !== null ? liveRemainingI : lastEndQty);
          if (opI && startQty > 0) everHadStock = true;
          const hasActualI = clI && clI.actualQty !== undefined && clI.actualQty !== null && clI.actualQty !== '';
          const actualQtyI = hasActualI ? clI.actualQty : null;
          const shortQtyI  = (hasActualI && endQty !== null) ? Math.max(0, endQty - actualQtyI) : null;
          if (shortQtyI !== null && shortQtyI > 0) { totalShorts++; totalShortQty += shortQtyI; }
          const closeCellI = clI ? (endQty ?? '—')
            : (liveRemainingI !== null ? `${liveRemainingI} <span style="font-size:0.65rem;color:var(--text3);font-weight:700;">(live)</span>` : '—');
          cols += `<td style="color:${opI ? stockLevelColor(startQty, name) : ''};">${opI ? startQty : '—'}${deliveredQty > 0 ? `<div style="font-size:0.65rem;color:var(--blue);font-weight:700;">+${deliveredQty} delivered</div>` : ''}${pulledQty > 0 ? `<div style="font-size:0.65rem;color:var(--red);font-weight:700;">−${pulledQty} pulled out</div>` : ''}</td>`;
          cols += `<td style="color:${clI && endQty !== null ? stockLevelColor(endQty, name) : (liveRemainingI !== null ? stockLevelColor(liveRemainingI, name) : '')};">${closeCellI}</td>`;
          cols += `<td style="color:${hasActualI ? stockLevelColor(actualQtyI, name) : ''};font-weight:700;">${hasActualI ? actualQtyI : '<span style="color:var(--text3);font-size:0.78rem;">—</span>'}</td>`;
          cols += `<td style="color:${shortQtyI>0?'var(--red)':'var(--text3);'}font-weight:${shortQtyI>0?'800':'400'};">${shortQtyI !== null ? (shortQtyI > 0 ? '-'+shortQtyI : '—') : '<span style="color:var(--text3);font-size:0.78rem;">—</span>'}</td>`;
          cols += `<td style="color:${usedQty>0?'var(--red)':'var(--text3)'};">${usedQty > 0 ? '-'+usedQty : '—'}</td>`;
        });
        // Status rule: Short shows the exact total short count across shifts
        // (actual physical count vs expected closing, summed); Empty when the
        // last shift ended with nothing left; Low Stock when the last known
        // closing qty is at/below the custom threshold; OK otherwise.
        const ingThresholdM = getIngredientThreshold(name);
        const isLastShiftLow = ingThresholdM !== null && lastEndQty !== null && lastEndQty > 0 && lastEndQty <= ingThresholdM;
        const statusTag = totalShortQty > 0 ? `<span class="inv-status-tag inv-tag-low">⚠️ Short - ${totalShortQty} ${escHtml(unit)}</span>`
          : (lastEndQty === 0 && everHadStock) ? `<span class="inv-status-tag inv-tag-low">⚡ Empty</span>`
          : isLastShiftLow ? `<span class="inv-status-tag inv-tag-low">⚡ Low Stock</span>`
          : `<span class="inv-status-tag inv-tag-ok">✓ OK</span>`;
        cols += `<td style="color:var(--red);font-weight:800;">${totalUsed > 0 ? '-'+totalUsed+' '+escHtml(unit) : '—'}</td>`;
        cols += `<td>${statusTag}</td>`;
        rows += `<tr>${cols}</tr>`;
      }
    });


    // Amount rows
    allAmtNames.forEach(name => {
      let totalUsedAmt = 0;

      if (shiftCount === 1) {
        const s = dayShifts[0];
        const opA = (s.opening?.amounts||[]).find(a => a.name === name);
        const clA = (s.closing?.amounts||[]).find(a => a.name === name);
        const startAmt = opA ? (opA.amount||0) : 0;
        // Use closingAmount strictly — do NOT fall back to clA.amount (opening value).
        // clA.amount is the opening amount carried on the closing record; falling back to it
        // makes the "used" column show 0 even when cash was actually spent.
        //
        // DISPLAY FIX: if the saved closingAmount equals the opening amount AND
        // there are expenses for this day AND the cashier never set an actualAmount,
        // the closing was submitted with the stale default pre-fill (before the
        // expense-deduction fix was in place). Correct it on-the-fly so the report
        // shows Opening − Expenses = Remaining instead of the raw 4,000.
        const rawEndAmt = clA ? (clA.closingAmount ?? 0) : null;
        const hasActualAmt = clA && clA.actualAmount !== undefined && clA.actualAmount !== null && clA.actualAmount !== '';
        const endAmtNeedsCorrection = rawEndAmt !== null
          && dayExpenseTotal > 0
          && !hasActualAmt
          && Math.abs(rawEndAmt - startAmt) < 0.01;   // closing == opening → was never adjusted
        const endAmt = endAmtNeedsCorrection
          ? Math.max(0, startAmt - dayExpenseTotal)
          : rawEndAmt;
        const usedAmt2 = endAmt !== null ? Math.max(0, startAmt - endAmt) : null;
        const notes    = clA?.notes || '';
        const hasActualAmt = clA && clA.actualAmount !== undefined && clA.actualAmount !== null && clA.actualAmount !== '';
        const actualAmt = hasActualAmt ? parseFloat(clA.actualAmount) : null;
        const amtVariance = hasActualAmt ? (actualAmt - endAmt) : null;
        const vColor = amtVariance === null ? '' : amtVariance === 0 ? 'var(--green)' : 'var(--red)';
        const vLabel = amtVariance === null ? '—' : amtVariance === 0 ? '✓ Match' : amtVariance < 0 ? '-₱'+fmt(Math.abs(amtVariance))+' short' : '+₱'+fmt(amtVariance)+' over';
        // Status rule (cash): Short shows the exact short peso amount (actual
        // count vs expected closing amount); Empty when nothing is left; OK otherwise.
        const shortAmtVal = (hasActualAmt && actualAmt < endAmt) ? (endAmt - actualAmt) : 0;
        if (shortAmtVal > 0) totalShorts++;
        let status = !clA ? '<span class="inv-status-tag inv-tag-na">Not Closed</span>'
          : shortAmtVal > 0 ? `<span class="inv-status-tag inv-tag-low">⚠️ Short - ₱${fmt(shortAmtVal)}</span>`
          : (endAmt === 0 || (hasActualAmt && actualAmt === 0)) ? '<span class="inv-status-tag inv-tag-low">⚡ Empty</span>'
          : '<span class="inv-status-tag inv-tag-ok">✓ OK</span>';
        const actualCell = hasActualAmt ? '₱'+fmt(actualAmt)+(notes ? ' ('+escHtml(notes)+')' : '') : '<span style="color:var(--text3);font-size:0.78rem;">—</span>';
        rows += '<tr>'
          + '<td><strong>'+escHtml(name)+'</strong> <span style="font-size:0.72rem;color:var(--blue);">(₱)</span></td>'
          + '<td style="color:var(--blue);">₱'+fmt(startAmt)+'</td>'
          + '<td style="color:var(--green);">'+(endAmt !== null ? '₱'+fmt(endAmt) : '<span style="color:var(--text3);font-size:0.78rem;">—</span>')+'</td>'
          + '<td style="color:'+(usedAmt2>0?'var(--red)':'var(--text3)')+';">'+(usedAmt2 !== null ? (usedAmt2>0?'-₱'+fmt(usedAmt2):'<span style="color:var(--text3);font-size:0.78rem;">—</span>') : '<span style="color:var(--text3);font-size:0.78rem;">—</span>')+'</td>'
          + '<td style="color:var(--orange);font-weight:800;">'+actualCell+'</td>'
          + '<td style="color:'+vColor+';font-weight:800;">'+vLabel+'</td>'
          + '<td>'+status+'</td></tr>';
      } else {
        let cols = `<td><strong>${escHtml(name)}</strong> <span style="font-size:0.72rem;color:var(--blue);">(₱)</span></td>`;
        let totalShortAmtVal = 0;
        let lastEndAmt = null;
        let everHadAmt = false;
        dayShifts.forEach(s => {
          const opA = (s.opening?.amounts||[]).find(a => a.name === name);
          const clA = (s.closing?.amounts||[]).find(a => a.name === name);
          const startAmt = opA ? (opA.amount||0) : 0;
          // Use closingAmount strictly — not clA.amount (which is the opening value).
          // If there is no closing record yet (clA is null), endAmt must be null
          // (not 0). Defaulting to 0 was the bug: it made usedAmt2 = startAmt - 0
          // = the full opening amount (e.g. ₱950), so an unclosed shift always
          // showed 100% of opening cash as "used" even when nothing was spent.
          //
          // DISPLAY FIX: if closingAmount == openingAmount, expenses exist, and
          // no actualAmount was set, the cashier never adjusted the default fill;
          // correct on-the-fly: effective closing = opening − expenses.
          const rawEndAmt = clA ? (clA.closingAmount ?? 0) : null;
          const hasActualA = clA && clA.actualAmount !== undefined && clA.actualAmount !== null && clA.actualAmount !== '';
          const endAmtNeedsCorrection = rawEndAmt !== null
            && dayExpenseTotal > 0
            && !hasActualA
            && Math.abs(rawEndAmt - startAmt) < 0.01;
          const endAmt = endAmtNeedsCorrection
            ? Math.max(0, startAmt - dayExpenseTotal)
            : rawEndAmt;
          const usedAmt2 = (opA && clA && endAmt !== null) ? Math.max(0, startAmt - endAmt) : 0;
          totalUsedAmt += usedAmt2;
          lastEndAmt = endAmt;
          if (opA && startAmt > 0) everHadAmt = true;
          const actualAmtA = hasActualA ? parseFloat(clA.actualAmount) : null;
          const shortAmtA  = (hasActualA && endAmt !== null) ? Math.max(0, endAmt - actualAmtA) : null;
          if (shortAmtA !== null && shortAmtA > 0) { totalShorts++; totalShortAmtVal += shortAmtA; }
          cols += `<td style="color:var(--blue);">${opA ? '₱'+fmt(startAmt) : '—'}</td>`;
          cols += `<td style="color:var(--green);">${clA ? '₱'+fmt(endAmt) : '—'}</td>`;
          cols += `<td style="color:var(--orange);font-weight:700;">${hasActualA ? '₱'+fmt(actualAmtA) : '<span style="color:var(--text3);font-size:0.78rem;">—</span>'}</td>`;
          cols += `<td style="color:${shortAmtA>0?'var(--red)':'var(--text3)'};font-weight:${shortAmtA>0?'800':'400'};">${shortAmtA !== null ? (shortAmtA > 0 ? '-₱'+fmt(shortAmtA) : '—') : '<span style="color:var(--text3);font-size:0.78rem;">—</span>'}</td>`;
          cols += `<td style="color:${usedAmt2>0?'var(--red)':'var(--text3)'};">${usedAmt2>0?'-₱'+fmt(usedAmt2):'—'}</td>`;
        });
        // Status rule (cash): Short shows the exact total short peso amount across
        // shifts; Empty when the last shift ended with ₱0 left; OK otherwise.
        const amtStatusTag = totalShortAmtVal > 0 ? `<span class="inv-status-tag inv-tag-low">⚠️ Short - ₱${fmt(totalShortAmtVal)}</span>`
          : (lastEndAmt === 0 && everHadAmt) ? '<span class="inv-status-tag inv-tag-low">⚡ Empty</span>'
          : '<span class="inv-status-tag inv-tag-ok">✓ OK</span>';
        cols += `<td style="color:var(--red);font-weight:800;">${totalUsedAmt>0?'-₱'+fmt(totalUsedAmt):'—'}</td>`;
        cols += `<td>${amtStatusTag}</td>`;
        rows += `<tr>${cols}</tr>`;
      }
    });

    tbody.innerHTML = rows;

    // Shorts count card
    const shortsEl = document.getElementById('invShortsCount');
    if (shortsEl) {
      shortsEl.textContent = totalShorts === 0 ? '✓ None' : totalShorts + ' item' + (totalShorts !== 1 ? 's' : '');
      shortsEl.style.color = totalShorts === 0 ? 'var(--green)' : 'var(--red)';
    }

    // Balance check — first shift opening, last shift closing (actual count overrides closingAmount)
    // Expenses are now factored in: Opening − Expenses − Closing = operational cash used
    const firstShift = dayShifts[0];
    const lastShift  = dayShifts[dayShifts.length - 1];
    const lastShiftClosed = lastShift?.closing && (lastShift.closing.amounts||[]).length > 0;
    const totalOpenCash = (firstShift?.opening?.amounts||[]).reduce((a, x) => a + (parseFloat(x.amount)||0), 0);
    // Only compute closing cash if the last shift has actually been closed.
    // When closing is absent (shift still open), totalCloseCash would be 0 and
    // the full opening amount would wrongly appear as "Cash Used / Discrepancy".
    const totalCloseCash = lastShiftClosed
      ? (lastShift.closing.amounts||[]).reduce((a, x) => {
          const v = (x.actualAmount !== null && x.actualAmount !== undefined && x.actualAmount !== '')
            ? parseFloat(x.actualAmount)
            : parseFloat(x.closingAmount);
          return a + (v || 0);
        }, 0)
      : null;
    // Cash used by operations = Opening − Expenses − Closing.
    // Without subtracting expenses, a ₱500 Gasul expense would show as
    // ₱500 "discrepancy" even though the cashier correctly spent it.
    const cashAfterExpenses = Math.max(0, totalOpenCash - dayExpenseTotal);
    const totalUsedCash  = totalCloseCash !== null ? Math.max(0, cashAfterExpenses - totalCloseCash) : null;
    const isBalanced = totalCloseCash !== null && Math.abs(cashAfterExpenses - totalCloseCash) < 0.01;
    const balanceEl = document.getElementById('invBalanceCheck');
    balanceEl.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:14px;">
        <div style="text-align:center;"><div style="font-size:0.7rem;color:var(--text3);font-weight:700;letter-spacing:1px;margin-bottom:4px;">OPENING CASH</div><div style="font-size:1.15rem;font-weight:800;color:var(--blue);">₱${fmt(totalOpenCash)}</div></div>
        ${dayExpenseTotal > 0 ? `<div style="text-align:center;"><div style="font-size:0.7rem;color:var(--text3);font-weight:700;letter-spacing:1px;margin-bottom:4px;">EXPENSES</div><div style="font-size:1.15rem;font-weight:800;color:var(--orange);">−₱${fmt(dayExpenseTotal)}</div><div style="font-size:0.68rem;color:var(--text3);">${dayExpenses.length} item${dayExpenses.length!==1?'s':''}</div></div>` : ''}
        <div style="text-align:center;"><div style="font-size:0.7rem;color:var(--text3);font-weight:700;letter-spacing:1px;margin-bottom:4px;">${dayExpenseTotal > 0 ? 'CASH LEFT' : 'CASH USED'}</div><div style="font-size:1.15rem;font-weight:800;color:var(--red);">${totalUsedCash !== null ? '-₱'+fmt(totalUsedCash) : '<span style="color:var(--text3);font-size:0.95rem;">—</span>'}</div></div>
        <div style="text-align:center;"><div style="font-size:0.7rem;color:var(--text3);font-weight:700;letter-spacing:1px;margin-bottom:4px;">CLOSING CASH</div><div style="font-size:1.15rem;font-weight:800;color:var(--green);">${totalCloseCash !== null ? '₱'+fmt(totalCloseCash) : '<span style="color:var(--text3);font-size:0.95rem;">—</span>'}</div></div>
      </div>
      ${dayExpenseTotal > 0 ? `<div style="font-size:0.75rem;color:var(--text3);text-align:center;margin-bottom:10px;">Balance = Opening (₱${fmt(totalOpenCash)}) − Expenses (₱${fmt(dayExpenseTotal)}) − Closing cash</div>` : ''}
      <div style="padding:14px 20px;border-radius:12px;text-align:center;background:${!lastShiftClosed?'rgba(234,179,8,0.1)':isBalanced?'rgba(16,185,129,0.12)':'rgba(239,68,68,0.1)'};border:2px solid ${!lastShiftClosed?'rgba(234,179,8,0.4)':isBalanced?'rgba(16,185,129,0.4)':'rgba(239,68,68,0.4)'};">
        ${!lastShiftClosed
          ? `<span style="font-size:1.3rem;">🕐</span> <span style="font-weight:800;color:#eab308;font-size:1rem;">Shift not yet closed — no balance data available</span>`
          : isBalanced
            ? `<span style="font-size:1.3rem;">✅</span> <span style="font-weight:800;color:var(--green);font-size:1rem;">Cash Balanced!</span>`
            : `<span style="font-size:1.3rem;">⚠️</span> <span style="font-weight:800;color:#ef4444;font-size:1rem;">Cash Discrepancy: ₱${fmt(Math.abs(cashAfterExpenses - totalCloseCash))}</span>`}
      </div>`;
    balanceEl.style.background = 'var(--card-bg)';
    balanceEl.style.borderColor = isBalanced ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)';

    const oldEl = document.getElementById('invAllShifts');
    if (oldEl) oldEl.remove();
  } else {
    // No closing yet — render an opening-only report so the cashier can still
    // see current stock levels, pull-outs, and deliveries in table form.
    const table = document.getElementById('invReportTable');
    const thead = table.querySelector('thead tr');
    const tbody = document.getElementById('invReportBody');
    thead.innerHTML = '<th>Ingredient/Supply</th><th>Opening</th><th>Closing</th><th>Used/Sold</th><th>Actual Count</th><th>Variance</th><th>Status</th>';

    const allDeliveries = loadSharedDeliveries();
    let rows = '';

    // Collect all opening ingredients across all shifts for this day
    const allIngNames = [...new Set(dayShifts.flatMap(s =>
      (s.opening?.ingredients || []).map(i => i.name)
    ))];
    const allAmtNames = [...new Set(dayShifts.flatMap(s =>
      (s.opening?.amounts || []).map(a => a.name)
    ))];

    allIngNames.forEach(name => {
      const opI = openIngredients.find(i => i.name === name);
      const unit = opI?.unit || 'pcs';
      const openQty = opI ? (opI.qty || 0) : 0;
      // Show pull-out/delivery hints the same way the full report does
      const netMoved = allDeliveries
        .filter(d => d.dateKey === dateKey && d.shiftIndex === viewIdx
          && d.item && d.item.trim().toLowerCase() === name.trim().toLowerCase())
        .reduce((sum, d) => sum + (d.type === 'pullout' ? -(d.qtyNum || 0) : (d.qtyNum || 0)), 0);
      const movedHint = netMoved !== 0
        ? `<span style="font-size:0.72rem;color:${netMoved < 0 ? 'var(--red)' : 'var(--green)'};margin-left:4px;">${netMoved < 0 ? netMoved : '+' + netMoved} ${netMoved < 0 ? 'pulled out' : 'delivered'}</span>`
        : '';
      // PERMANENT FIX: this whole branch renders whenever NOT A SINGLE shift
      // today has a saved closing — which is the common case while a shift
      // is still actively open. It used to hardcode "—" for Closing/Used/
      // Actual/Variance for every ingredient, completely ignoring live
      // usedQty written by autoDeductIngredients() as sales happen. That
      // made the official report look like zero activity occurred all day,
      // even with dozens of recorded sales — exactly what was reported.
      // Use live usedQty/remaining here too, tagged "(live)" so it's clear
      // this isn't a finalized physical count yet.
      const usedQty = opI ? (opI.usedQty || 0) : 0;
      const remainingQty = opI ? Math.max(0, openQty - usedQty) : 0;
      const hasLiveUsage = usedQty > 0;
      const ingThresholdO = getIngredientThreshold(name);
      const isLowO = ingThresholdO !== null && remainingQty > 0 && remainingQty <= ingThresholdO;
      const statusO = remainingQty === 0 && openQty > 0
        ? `<span style="color:var(--red);font-weight:700;">⚡ Empty</span>`
        : isLowO
          ? `<span style="color:var(--orange);font-weight:700;">⚡ Low Stock</span>`
          : `<span style="color:var(--green);font-weight:700;">✓ OK</span>`;
      rows += `<tr>
        <td><b>${escHtml(name)}</b> <span style="font-size:0.72rem;color:var(--text3);">(qty)</span>${movedHint}</td>
        <td style="color:var(--green);font-weight:700;">${openQty} ${escHtml(unit)}</td>
        <td style="color:${hasLiveUsage ? stockLevelColor(remainingQty, name) : 'var(--text3)'};">${hasLiveUsage ? `${remainingQty} ${escHtml(unit)} <span style="font-size:0.65rem;font-weight:700;">(live)</span>` : '—'}</td>
        <td style="color:${hasLiveUsage ? 'var(--red)' : 'var(--text3)'};">${hasLiveUsage ? '-'+usedQty : '—'}</td>
        <td style="color:var(--text3);">—</td>
        <td style="color:var(--text3);">—</td>
        <td>${statusO}</td>
      </tr>`;
    });

    allAmtNames.forEach(name => {
      const opA = openAmounts.find(a => a.name === name);
      const openAmt = opA ? (opA.amount || 0) : 0;
      rows += `<tr>
        <td><b>${escHtml(name)}</b> <span style="font-size:0.72rem;color:var(--blue);">(₱)</span></td>
        <td style="color:var(--blue);font-weight:700;">₱${fmt(openAmt)}</td>
        <td style="color:var(--text3);">—</td>
        <td style="color:var(--text3);">—</td>
        <td style="color:var(--text3);">—</td>
        <td style="color:var(--text3);">—</td>
        <td><span style="color:var(--green);font-weight:700;">✓ OK</span></td>
      </tr>`;
    });

    tbody.innerHTML = rows || '<tr><td colspan="7" style="text-align:center;color:var(--text3);">No opening inventory set.</td></tr>';

    // Cash summary — opening only (shift still open)
    const balanceEl = document.getElementById('invBalanceCheck');
    if (balanceEl) {
      const totalOpenCash = openAmounts.reduce((s, a) => s + (a.amount || 0), 0);
      const openCashRemainingLive = Math.max(0, totalOpenCash - dayExpenseTotal);
      balanceEl.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:12px;">
          <div style="text-align:center;">
            <div style="font-size:0.7rem;font-weight:800;color:var(--text3);letter-spacing:1px;margin-bottom:4px;">OPENING CASH</div>
            <div style="font-size:1.2rem;font-weight:800;color:var(--blue);">₱${fmt(totalOpenCash)}</div>
          </div>
          ${dayExpenseTotal > 0 ? `<div style="text-align:center;">
            <div style="font-size:0.7rem;font-weight:800;color:var(--text3);letter-spacing:1px;margin-bottom:4px;">EXPENSES</div>
            <div style="font-size:1.2rem;font-weight:800;color:var(--orange);">−₱${fmt(dayExpenseTotal)}</div>
            <div style="font-size:0.68rem;color:var(--text3);">${dayExpenses.length} item${dayExpenses.length!==1?'s':''}</div>
          </div>` : ''}
          ${dayExpenseTotal > 0 ? `<div style="text-align:center;">
            <div style="font-size:0.7rem;font-weight:800;color:var(--text3);letter-spacing:1px;margin-bottom:4px;">REMAINING</div>
            <div style="font-size:1.2rem;font-weight:800;color:${openCashRemainingLive<=0?'var(--red)':'var(--green)'};">₱${fmt(openCashRemainingLive)}</div>
          </div>` : ''}
          <div style="text-align:center;">
            <div style="font-size:0.7rem;font-weight:800;color:var(--text3);letter-spacing:1px;margin-bottom:4px;">CLOSING CASH</div>
            <div style="font-size:1.2rem;font-weight:800;color:var(--text3);">—</div>
          </div>
        </div>
        <div style="padding:14px 20px;border-radius:12px;border:1.5px solid rgba(234,179,8,0.4);background:rgba(234,179,8,0.07);text-align:center;">
          🕐 <span style="font-weight:800;color:#eab308;font-size:1rem;">Shift not yet closed — no closing data available</span>
        </div>`;
      balanceEl.style.background = 'var(--card-bg)';
      balanceEl.style.borderColor = 'rgba(234,179,8,0.3)';
    }

    const oldEl = document.getElementById('invAllShifts');
    if (oldEl) oldEl.remove();
  }
}


// =================== EXPENSE / CASH-OUT SYSTEM ===================
const EXPENSE_KEY = 'burgerStreetExpenses';

function loadExpenses() {
  try {
    const s = localStorage.getItem(EXPENSE_KEY);
    return s ? JSON.parse(s) : [];
  } catch(e) { return []; }
}

function saveExpenses(arr) {
  try { localStorage.setItem(EXPENSE_KEY, JSON.stringify(arr)); } catch(e) {}
}

function openExpenseModal() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.getElementById('expenseDatetime').value = local;
  document.getElementById('expenseDesc').value = '';
  document.getElementById('expenseAmount').value = '';
  document.getElementById('expenseNotes').value = '';
  document.getElementById('expensePaidBy').value = posState.settings.cashierName || '';
  document.getElementById('expenseCategory').value = 'Supplies';
  document.getElementById('expenseModal').style.display = 'flex';
}

function closeExpenseModal() {
  document.getElementById('expenseModal').style.display = 'none';
}

function saveExpense() {
  const desc    = document.getElementById('expenseDesc').value.trim();
  const amount  = parseFloat(document.getElementById('expenseAmount').value);
  const cat     = document.getElementById('expenseCategory').value;
  const paidBy  = document.getElementById('expensePaidBy').value.trim();
  const notes   = document.getElementById('expenseNotes').value.trim();
  const dt      = document.getElementById('expenseDatetime').value;

  if (!desc)           { showToast('Please enter a description.', 'error'); return; }
  if (!amount || amount <= 0) { showToast('Please enter a valid amount.', 'error'); return; }

  const expense = {
    id: Date.now(),
    category: cat,
    desc,
    amount,
    paidBy: paidBy || '—',
    notes: notes || '',
    datetime: dt || new Date().toISOString()
  };

  const expenses = loadExpenses();
  expenses.unshift(expense);
  saveExpenses(expenses);
  closeExpenseModal();
  renderExpenseLog();
  // Refresh inventory so opening cash section reflects new expense immediately
  if (document.getElementById('invOpeningList')) renderInventory();
  showToast(`✅ Expense of ₱${fmt(amount)} recorded.`, 'success');
}

function deleteExpense(id) {
  if (!confirm('Delete this expense record?')) return;
  const expenses = loadExpenses().filter(e => e.id !== id);
  saveExpenses(expenses);
  renderExpenseLog();
  if (document.getElementById('invOpeningList')) renderInventory();
  showToast('Expense deleted.', '');
}

function renderExpenseLog() {
  const container  = document.getElementById('expenseList');
  const totalBar   = document.getElementById('expenseTotalBar');
  const totalAmtEl = document.getElementById('expenseTotalAmt');
  if (!container) return;

  const expenses = loadExpenses();
  const today = new Date().toISOString().split('T')[0];
  const todayExp = expenses.filter(e => e.datetime && e.datetime.startsWith(today));
  const todayTotal = todayExp.reduce((s, e) => s + (e.amount || 0), 0);

  if (totalBar) totalBar.style.display = todayTotal > 0 ? 'flex' : 'none';
  if (totalAmtEl) totalAmtEl.textContent = '₱' + fmt(todayTotal);

  if (!expenses.length) {
    container.innerHTML = '<p style="color:var(--text3);font-size:0.85rem;text-align:center;padding:16px 0;">No expenses recorded yet.</p>';
    return;
  }

  // Category badge colors
  const catColor = {
    Supplies:   'var(--orange)',
    Utilities:  'var(--blue)',
    Repairs:    '#a855f7',
    Rent:       '#ec4899',
    Transport:  'var(--green)',
    Marketing:  '#eab308',
    Other:      'var(--text3)'
  };

  container.innerHTML = expenses.map(e => {
    const dt      = new Date(e.datetime);
    const dateStr = dt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = dt.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
    const isToday = e.datetime && e.datetime.startsWith(today);
    const color   = catColor[e.category] || 'var(--text3)';
    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--border);gap:10px;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:2px;">
            <span style="font-size:0.7rem;font-weight:800;color:${color};background:${color}1a;border:1px solid ${color}55;border-radius:20px;padding:1px 8px;">${escHtml(e.category)}</span>
            ${isToday ? '<span style="font-size:0.7rem;background:var(--orange);color:#fff;padding:1px 7px;border-radius:20px;font-weight:700;">TODAY</span>' : ''}
          </div>
          <div style="font-weight:700;font-size:0.95rem;color:var(--text);">${escHtml(e.desc)}</div>
          ${e.notes ? `<div style="font-size:0.78rem;color:var(--text3);margin-top:1px;">📝 ${escHtml(e.notes)}</div>` : ''}
          <div style="font-size:0.75rem;color:var(--text3);margin-top:2px;">👤 ${escHtml(e.paidBy)}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-weight:800;color:var(--orange);font-size:1rem;">-₱${fmt(e.amount)}</div>
          <div style="font-size:0.78rem;font-weight:700;color:var(--text2);">${dateStr}</div>
          <div style="font-size:0.75rem;color:var(--text3);">${timeStr}</div>
          <button onclick="deleteExpense(${e.id})" style="margin-top:4px;font-size:0.7rem;color:var(--red);background:none;border:none;cursor:pointer;padding:0;font-weight:700;">🗑 Delete</button>
        </div>
      </div>`;
  }).join('');
}

function getExpenseTotalToday() {
  const today = new Date().toISOString().split('T')[0];
  return loadExpenses()
    .filter(e => e.datetime && e.datetime.startsWith(today))
    .reduce((s, e) => s + (e.amount || 0), 0);
}

// =================== PRIORITY STOCK ALERTS ===================
// Returns the live remaining stock for each opening ingredient in the active shift.
