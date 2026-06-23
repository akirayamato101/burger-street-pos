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

