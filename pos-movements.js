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
  if (!qty) { showToast('Please enter a quantity.', 'error'); return; }

  const dateKey = getTodayInvKey();
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
    const currentQty = existing ? (existing.qty || 0) : 0;
    if (qtyNum > currentQty) {
      const proceed = confirm(`⚠️ Only ${currentQty} ${unit} of "${item}" is currently in stock, but you're pulling out ${qtyNum}. Continue anyway? (Stock will be set to 0.)`);
      if (!proceed) return;
    }
  }

  const movement = {
    id: Date.now(),
    type, // 'delivery' (stock in) or 'pullout' (stock out)
    item,
    qty,
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
    saveInventoryData(invData);

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

