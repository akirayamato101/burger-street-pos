/* =============================================
   BURGER STREET POS — DATABASE LAYER
   Uses Dexie.js (IndexedDB) instead of localStorage
   ============================================= */

const db = new Dexie('BurgerStreetPOS');

db.version(1).stores({
  settings:  '++id, key',        // key-value settings store
  orders:    '++id, orderNum, date, payMethod',
  products:  '++id, &productId, category',
  inventory: '++id, &dateKey',   // one record per date
  deliveries:'++id, datetime',
  cashAdvances: '++id, datetime'
});

/* ---- Helper: settings as key/value ---- */
async function dbGetSetting(key, defaultVal = null) {
  const row = await db.settings.where('key').equals(key).first();
  return row ? row.value : defaultVal;
}

async function dbSetSetting(key, value) {
  const existing = await db.settings.where('key').equals(key).first();
  if (existing) {
    await db.settings.update(existing.id, { value });
  } else {
    await db.settings.add({ key, value });
  }
}

/* ---- Orders ---- */
async function dbSaveOrder(order) {
  // order.id is the order number (e.g. 1, 2, 3...)
  const existing = await db.orders.where('orderNum').equals(order.orderNum).first();
  if (existing) {
    await db.orders.update(existing.id, order);
  } else {
    await db.orders.add(order);
  }
}

async function dbGetOrders(dateFilter = null) {
  let collection = db.orders.orderBy('id').reverse();
  const all = await collection.toArray();
  if (dateFilter) {
    return all.filter(o => o.date && o.date.startsWith(dateFilter));
  }
  return all;
}

async function dbUpdateOrder(orderNum, updates) {
  const row = await db.orders.where('orderNum').equals(orderNum).first();
  if (row) await db.orders.update(row.id, updates);
}

async function dbDeleteAllOrders() {
  await db.orders.clear();
}

/* ---- Products ---- */
async function dbGetProducts() {
  return await db.products.toArray();
}

async function dbSaveProduct(product) {
  // product.productId is our app-level id (e.g. 'cp_1234')
  const existing = await db.products.where('productId').equals(product.productId).first();
  if (existing) {
    await db.products.update(existing.id, product);
  } else {
    await db.products.add(product);
  }
}

async function dbDeleteProduct(productId) {
  await db.products.where('productId').equals(productId).delete();
}

async function dbClearProducts() {
  await db.products.clear();
}

/* ---- Inventory ---- */
async function dbGetInventory(dateKey) {
  return await db.inventory.where('dateKey').equals(dateKey).first() || null;
}

async function dbSaveInventory(dateKey, data) {
  const existing = await db.inventory.where('dateKey').equals(dateKey).first();
  if (existing) {
    await db.inventory.update(existing.id, { dateKey, ...data });
  } else {
    await db.inventory.add({ dateKey, ...data });
  }
}

async function dbGetAllInventory() {
  return await db.inventory.toArray();
}

/* ---- Deliveries ---- */
async function dbGetDeliveries() {
  return await db.deliveries.orderBy('id').reverse().toArray();
}

async function dbSaveDelivery(delivery) {
  await db.deliveries.add(delivery);
}

async function dbDeleteDelivery(deliveryId) {
  await db.deliveries.where('deliveryId').equals(deliveryId).delete();
}

async function dbClearDeliveries() {
  await db.deliveries.clear();
}

/* ---- Cash Advances ---- */
async function dbGetCashAdvances() {
  return await db.cashAdvances.orderBy('id').reverse().toArray();
}

async function dbSaveCashAdvance(advance) {
  await db.cashAdvances.add(advance);
}

async function dbDeleteCashAdvance(advanceId) {
  await db.cashAdvances.where('advanceId').equals(advanceId).delete();
}

async function dbClearCashAdvances() {
  await db.cashAdvances.clear();
}

/* ---- Nuclear clear (reset all) ---- */
async function dbClearAll() {
  await db.settings.clear();
  await db.orders.clear();
  await db.products.clear();
  await db.inventory.clear();
  await db.deliveries.clear();
  await db.cashAdvances.clear();
}

/* ---- Counter helper ---- */
async function dbGetOrderCounter() {
  return await dbGetSetting('orderCounter', 1);
}

async function dbIncrementOrderCounter() {
  const current = await dbGetOrderCounter();
  await dbSetSetting('orderCounter', current + 1);
  return current + 1;
}
