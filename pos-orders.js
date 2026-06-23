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

  const baseStock = getIngredientStockMap();

  grid.innerHTML = products.map(p => {
    const cartItem = cart.find(i => i.id == p.id);
    const qty = cartItem ? cartItem.qty : 0;
    const inCart = qty > 0;

    // Stock that would remain if we exclude what THIS product already has in
    // cart (so its own "can I add one more" check doesn't double-subtract).
    const netStock = getStockMapMinusCart(baseStock, p.id);
    // addableMore = TOTAL capacity from net stock, minus what's already in
    // the cart for this product (see getRemainingAddable for why this
    // subtraction is required — without it the limit never engages).
    const addableMore = getMaxAddable(p, netStock) - qty;
    const outOfStock = addableMore <= 0; // can't add even one more unit
    const soldOutEntirely = outOfStock && !inCart; // never had any in cart either

    return `
    <div class="menu-item ${inCart ? 'in-cart' : ''} ${soldOutEntirely ? 'out-of-stock' : ''}" id="mc_${p.id}">
      ${soldOutEntirely ? '<span class="menu-item-soldout-badge">Out of Stock</span>' : ''}
      <div class="menu-item-tap" onclick="${soldOutEntirely ? '' : `menuCardQty('${p.id}', 1)`}">
        <span class="menu-item-name">${escHtml(p.name)}</span>
        <span class="menu-item-price">₱${fmt(p.price)}</span>
        <span class="menu-item-cat">${escHtml(p.category || '')}</span>
      </div>
      <div class="menu-item-qty-row">
        <button class="miq-btn miq-minus ${inCart ? '' : 'miq-zero'}" onclick="menuCardQty('${p.id}', -1)">−</button>
        <span class="miq-count ${inCart ? 'miq-active' : ''}" id="miq_${p.id}">${qty}</span>
        <button class="miq-btn miq-plus ${outOfStock ? 'miq-disabled' : ''}" onclick="menuCardQty('${p.id}', 1)">+</button>
      </div>
    </div>
  `}).join('');
}

// =================== CART ===================
function addToCart(productId) {
  const p = allProducts.find(x => x.id == productId);
  if (!p) return;
  const existing = cart.find(i => i.id == productId);

  const remainingAddable = getRemainingAddable(p);
  if (remainingAddable <= 0) {
    showToast(`🚫 ${p.name} is out of stock (ingredients depleted)`, 'error');
    return;
  }

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
  refreshStockLimits();
}

function menuCardQty(productId, delta) {
  const p = allProducts.find(x => x.id == productId);
  if (!p) return;

  const existing = cart.find(i => i.id == productId);

  if (delta > 0) {
    const remainingAddable = getRemainingAddable(p);
    if (remainingAddable <= 0) {
      showToast(`🚫 ${p.name} is out of stock (ingredients depleted)`, 'error');
      return;
    }
  }

  if (existing) {
    existing.qty += delta;
    if (existing.qty <= 0) {
      // Remove from cart
      cart = cart.filter(i => i.id !== productId);
      updateCardDisplay(productId, 0);
      renderCart();
      updateTotals();
      updateFloatCartBadge();
      refreshStockLimits();
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
  refreshStockLimits();
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

// Re-check stock availability for every visible card and update the plus
// button / "Out of Stock" badge accordingly. Needed because adding or
// removing one product can affect how much is left of a shared ingredient,
// which changes whether OTHER products on the grid are still addable.
function refreshStockLimits() {
  const baseStock = getIngredientStockMap();
  document.querySelectorAll('.menu-item').forEach(card => {
    const id = card.id.replace('mc_', '');
    const p = allProducts.find(x => x.id == id);
    if (!p) return;

    const cartItem = cart.find(i => i.id == p.id);
    const inCart = !!cartItem && cartItem.qty > 0;

    const netStock = getStockMapMinusCart(baseStock, p.id);
    const currentQty = inCart ? cartItem.qty : 0;
    const addableMore = getMaxAddable(p, netStock) - currentQty;
    const outOfStock = addableMore <= 0;
    const soldOutEntirely = outOfStock && !inCart;

    const plusBtn = card.querySelector('.miq-plus');
    if (plusBtn) plusBtn.classList.toggle('miq-disabled', outOfStock);

    card.classList.toggle('out-of-stock', soldOutEntirely);

    const tap = card.querySelector('.menu-item-tap');
    if (tap) tap.setAttribute('onclick', soldOutEntirely ? '' : `menuCardQty('${p.id}', 1)`);

    let badge = card.querySelector('.menu-item-soldout-badge');
    if (soldOutEntirely && !badge) {
      badge = document.createElement('span');
      badge.className = 'menu-item-soldout-badge';
      badge.textContent = 'Out of Stock';
      card.prepend(badge);
    } else if (!soldOutEntirely && badge) {
      badge.remove();
    }
  });
}

function removeFromCart(id) {
  cart = cart.filter(i => i.id !== id);
  updateCardDisplay(id, 0); // Reset card counter
  renderCart();
  updateTotals();
  updateFloatCartBadge();
  refreshStockLimits();
}

function changeQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;

  if (delta > 0) {
    const p = allProducts.find(x => x.id == id);
    if (p && getRemainingAddable(p) <= 0) {
      showToast(`🚫 ${p.name} is out of stock (ingredients depleted)`, 'error');
      return;
    }
  }

  item.qty += delta;
  if (item.qty <= 0) { removeFromCart(id); return; }
  renderCart();
  updateTotals();
  updateCardDisplay(id, item.qty);
  refreshStockLimits();
}

function setQty(id, val) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  const q = parseInt(val) || 0;
  if (q <= 0) { removeFromCart(id); return; }

  const p = allProducts.find(x => x.id == id);
  if (p) {
    // Max this item can be set to = current qty + however many more are addable
    const maxAddableMore = getRemainingAddable(p);
    if (maxAddableMore !== Infinity) {
      const maxTotal = item.qty + maxAddableMore;
      if (q > maxTotal) {
        showToast(`🚫 Only ${maxTotal} ${p.name} available (ingredients limited)`, 'error');
        item.qty = maxTotal;
        renderCart();
        updateTotals();
        updateFloatCartBadge();
        updateCardDisplay(id, item.qty);
        refreshStockLimits();
        return;
      }
    }
  }

  item.qty = q;
  updateTotals();
  updateFloatCartBadge();
  updateCardDisplay(id, item.qty);
  refreshStockLimits();
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
// Final safety check before finalizing a sale: re-verify every cart line
// against current ingredient stock (in case stock changed since items were
// added — e.g. another cashier/device, or an inventory edit mid-order).
// Returns null if OK, or an error message string if something can't be sold.
function validateCartAgainstStock() {
  const baseStock = getIngredientStockMap();

  // Accumulate total needed per ingredient across the whole cart, then
  // compare against what's actually available.
  const needed = {};
  for (const item of cart) {
    const product = allProducts.find(p => p.id == item.id);
    if (!product || !product.recipe || !product.recipe.length) {
      // No recipe linked = no stock to sell from, block the whole order.
      return `${item.name} has no ingredients/recipe set up and cannot be sold yet. Please link its recipe in Manage Products.`;
    }
    for (const r of product.recipe) {
      const key = (r.ingredient || '').trim().toLowerCase();
      needed[key] = (needed[key] || 0) + (r.qty || 1) * item.qty;
    }
  }

  for (const key in needed) {
    const available = Object.prototype.hasOwnProperty.call(baseStock, key) ? baseStock[key] : 0;
    if (needed[key] > available) {
      return `Not enough stock to complete this order — an ingredient ran out. Please adjust quantities.`;
    }
  }
  return null;
}

function processPayment() {
  if (!cart.length) return;

  const stockError = validateCartAgainstStock();
  if (stockError) {
    showToast(`🚫 ${stockError}`, 'error');
    renderMenuGrid();
    return;
  }

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

// Reconciles ingredient usedQty when a PAID order's items are edited
// (qty changed, item added, or item removed) after the original
// autoDeductIngredients() deduction already ran. Computes the net
// ingredient delta between the original and edited item lists and applies
// only that difference — giving back ingredients for removed/reduced
// quantities, and deducting extra for added/increased quantities.
function adjustIngredientsForOrderEdit(originalItems, newItems) {
  try {
    const dateKey = getLocalDateKey();
    const data = loadInventoryData();
    if (!data[dateKey]) return;
    const activeShift = getActiveShift(dateKey, data);
    if (!activeShift || !activeShift.opening || !activeShift.opening.ingredients || !activeShift.opening.ingredients.length) return;

    const openingIngs = activeShift.opening.ingredients;
    openingIngs.forEach(ing => { if (ing.usedQty === undefined) ing.usedQty = 0; });

    // Net delta per ingredient: positive = needs MORE deducted, negative = give some back.
    const delta = {};
    const addNeeded = (items, sign) => {
      items.forEach(item => {
        const product = (posState.customProducts || []).find(p => p.id == item.id);
        if (!product || !product.recipe || !product.recipe.length) return;
        product.recipe.forEach(r => {
          const key = (r.ingredient || '').trim().toLowerCase();
          if (!key) return;
          delta[key] = (delta[key] || 0) + sign * (r.qty || 1) * item.qty;
        });
      });
    };
    addNeeded(newItems, +1);
    addNeeded(originalItems, -1);

    let changed = false;
    Object.keys(delta).forEach(key => {
      if (!delta[key]) return;
      const ing = openingIngs.find(i => (i.name || '').trim().toLowerCase() === key);
      if (!ing) return;
      if (delta[key] > 0) {
        // Need to deduct more — cap at what's actually available so usedQty
        // never exceeds opening qty (matches autoDeductIngredients' safety cap).
        const available = Math.max(0, (ing.qty || 0) - (ing.usedQty || 0));
        ing.usedQty = (ing.usedQty || 0) + Math.min(delta[key], available);
      } else {
        // Give ingredients back, never going below 0 used.
        ing.usedQty = Math.max(0, (ing.usedQty || 0) + delta[key]);
      }
      changed = true;
    });

    if (changed) {
      saveInventoryData(data);
      if (document.getElementById('invOpeningList')) renderInventory();
    }
  } catch(e) {
    console.warn('adjustIngredientsForOrderEdit error:', e);
  }
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
      const product = (posState.customProducts || []).find(p => p.id == item.id);
      if (!product || !product.recipe || !product.recipe.length) return;
      product.recipe.forEach(recipeItem => {
        const totalDeduct = recipeItem.qty * item.qty;
        const ing = openingIngs.find(i => (i.name || '').trim().toLowerCase() === (recipeItem.ingredient || '').trim().toLowerCase());
        if (ing) {
          const available = Math.max(0, (ing.qty || 0) - (ing.usedQty || 0));
          ing.usedQty = (ing.usedQty || 0) + Math.min(totalDeduct, available);
          changed = true;
        }
      });
    });

    if (changed) {
      saveInventoryData(data);
      // If the Daily Inventory page is currently open, refresh it immediately
      // so the live remaining-stock numbers update right after this sale,
      // without requiring a manual page switch/reload.
      if (document.getElementById('invOpeningList')) renderInventory();
    }
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
      i => (i.name || '').trim().toLowerCase() === (ingredientName || '').trim().toLowerCase()
    );
    if (!ing) return null;
    return Math.max(0, (ing.qty || 0) - (ing.usedQty || 0));
  } catch(e) { return null; }
}

// =================== STOCK LIMIT CHECKS (NEW ORDER PAGE) ===================
// A product is only "limited" if it has a recipe (linked ingredients) AND
// today's shift has ingredient records. Products with no recipe are treated
// as unlimited (no inventory tracking configured for them), so this never
// blocks items that were never meant to be stock-tracked.
//
// Remaining stock per ingredient = opening qty - usedQty (already deducted
// from past completed sales today) - qty already sitting in the cart for
// items that haven't been paid yet (since autoDeductIngredients only runs
// AFTER payment, cart contents must be subtracted here too or the cashier
// could add far more than is actually in stock before checking out).
function getIngredientStockMap() {
  try {
    const dateKey = getLocalDateKey();
    const data = loadInventoryData();
    const activeShift = getActiveShift(dateKey, data);
    const openingIngs = activeShift?.opening?.ingredients || [];
    const map = {};
    openingIngs.forEach(ing => {
      const key = (ing.name || '').trim().toLowerCase();
      if (!key) return;
      map[key] = Math.max(0, (ing.qty || 0) - (ing.usedQty || 0));
    });
    return map; // always an object now — never null — so missing ingredients = 0 stock, not "unlimited"
  } catch(e) { return {}; }
}

// How many more units of this product can be added to the cart right now,
// given remaining ingredient stock and what's already in the cart.
// A recipe ingredient with no recorded stock (or zero stock) blocks the sale —
// missing/empty inventory means zero, never "unlimited".
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

