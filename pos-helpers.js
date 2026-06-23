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
