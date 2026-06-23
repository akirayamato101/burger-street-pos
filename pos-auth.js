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
  if (page === 'inventory') { currentShiftIndex = -1; renderInventory(); renderDeliveryLog(); renderCashAdvanceLog(); }
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

