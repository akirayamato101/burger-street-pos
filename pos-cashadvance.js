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

