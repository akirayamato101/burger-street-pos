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

