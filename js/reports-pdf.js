/* =============================================
   REPORTS-PDF.JS — 4 of 4 app modules
   Priority stock alerts, inventory report and
   opening-inventory PDF export/print.
   Continues from cashier-inventory.js — see index.html.
   ============================================= */

function getPriorityStockStatus() {
  const thresholds = loadPriorityThresholds();
  const dateKey = getTodayInvKey();
  const data = loadInventoryData();
  const activeShift = getActiveShift(dateKey, data);
  const openIngs = activeShift?.opening?.ingredients || [];
  const isActiveToday = dateKey === getLocalDateKey();

  const globalThreshold = loadGlobalAlertThreshold();
  return openIngs.map((ing, idx) => {
    const name      = ing.name || '';
    const unit      = ing.unit || 'pcs';
    const opened    = ing.qty || 0;
    const used      = ing.usedQty || 0;
    const remaining = isActiveToday ? Math.max(0, opened - used) : opened;
    const perIngThreshold = thresholds[name.toLowerCase()] ?? null;
    // Global threshold only applies to the top 5 ingredients
    const isTopFive = idx < 5;
    const threshold = perIngThreshold !== null ? perIngThreshold
                    : (isTopFive ? globalThreshold : null);
    const isLow     = threshold !== null && remaining > 0 && remaining < threshold;
    const isOut     = remaining === 0;
    return { name, unit, remaining, threshold, isLow, isOut };
  });
}

// Updates the 🚨 Alerts button badge — called after renderInventory and after saves.
function refreshAlertsBadge() {
  const btn = document.getElementById('btnPriorityAlerts');
  if (!btn) return;
  const items = getPriorityStockStatus();
  const alertCount = items.filter(i => i.isLow || i.isOut).length;
  // Remove any existing badge
  const old = btn.querySelector('.alert-badge-dot');
  if (old) old.remove();
  if (alertCount > 0) {
    const badge = document.createElement('span');
    badge.className = 'alert-badge-dot';
    badge.textContent = alertCount;
    badge.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;' +
      'background:var(--red);color:#fff;border-radius:20px;font-size:0.65rem;font-weight:800;' +
      'padding:1px 6px;margin-left:4px;vertical-align:middle;line-height:1.4;';
    btn.appendChild(badge);
  }
}

// Opens the Alerts modal — list is built from today's opening inventory ingredients.
function openPriorityStockSettings() {
  const container = document.getElementById('priorityStockSettingsList');
  if (!container) return;

  const thresholds = loadPriorityThresholds();
  const dateKey = getTodayInvKey();
  const data = loadInventoryData();
  const activeShift = getActiveShift(dateKey, data);
  const openIngs = activeShift?.opening?.ingredients || [];
  const isActiveToday = dateKey === getLocalDateKey();

  if (!openIngs.length) {
    container.innerHTML = `
      <div style="text-align:center;padding:24px 0;color:var(--text3);">
        <div style="font-size:2rem;margin-bottom:8px;">📦</div>
        <div style="font-size:0.88rem;">No opening inventory set yet.<br>Set today's Opening Inventory first, then configure alerts here.</div>
      </div>`;
    document.getElementById('priorityStockModal').classList.remove('hidden');
    return;
  }

  const globalVal = loadGlobalAlertThreshold();
  const top5 = openIngs.slice(0, 5);

  // Single global threshold input + top-5 preview
  let html = `
    <div style="display:flex;align-items:center;gap:10px;padding:14px 16px;
                background:rgba(232,124,30,0.08);border-radius:12px;
                border:1.5px solid rgba(232,124,30,0.45);flex-wrap:wrap;margin-bottom:16px;">
      <div style="flex:1;min-width:140px;">
        <div style="font-weight:800;font-size:0.95rem;color:var(--orange);">🔔 Alert Count</div>
        <div style="font-size:0.75rem;color:var(--text3);margin-top:3px;">Top 5 ingredients turn 🟠 orange when their count is below this number.</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
        <span style="font-size:0.8rem;color:var(--text3);font-weight:700;white-space:nowrap;">Below</span>
        <input type="number" id="ps_global_thr"
          value="${globalVal !== null ? globalVal : ''}" min="1" max="9999" step="1" placeholder="e.g. 30"
          class="input-field"
          style="width:80px;font-size:1.1rem;font-weight:800;text-align:center;padding:7px 8px;
                 color:var(--orange);border-color:rgba(232,124,30,0.6);background:rgba(232,124,30,0.06);"
          oninput="this.value=this.value===''?'':Math.max(1,parseInt(this.value)||1)" />
      </div>
    </div>
    <div style="font-size:0.72rem;font-weight:800;color:var(--text3);letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">📋 Top 5 Ingredients Affected</div>
    <div style="display:flex;flex-direction:column;gap:8px;">`;

  if (top5.length === 0) {
    html += `<div style="font-size:0.85rem;color:var(--text3);text-align:center;padding:8px 0;">No ingredients in opening inventory.</div>`;
  } else {
    top5.forEach((ing, idx) => {
      const name      = ing.name || '';
      const unit      = ing.unit || 'pcs';
      const opened    = ing.qty || 0;
      const used      = ing.usedQty || 0;
      const remaining = isActiveToday ? Math.max(0, opened - used) : opened;
      const willAlert = globalVal !== null && remaining > 0 && remaining < globalVal;
      const stockColor = willAlert ? 'var(--orange)' : stockLevelColor(remaining, name);
      html += `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;
                    background:${willAlert ? 'rgba(232,124,30,0.07)' : 'var(--bg2)'};
                    border-radius:10px;border:1px solid ${willAlert ? 'rgba(232,124,30,0.35)' : 'var(--border)'};justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:0.7rem;font-weight:800;color:var(--text3);background:var(--bg3);border-radius:50%;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;">${idx + 1}</span>
            <span style="font-weight:700;font-size:0.9rem;">${escHtml(name)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            ${willAlert ? `<span style="font-size:0.68rem;font-weight:800;color:var(--orange);background:rgba(232,124,30,0.13);border:1px solid rgba(232,124,30,0.35);border-radius:6px;padding:1px 6px;">⚡ Low</span>` : ''}
            <span style="font-weight:800;color:${stockColor};">${remaining} <span style="font-size:0.72rem;color:var(--text3);">${escHtml(unit)}</span></span>
          </div>
        </div>`;
    });
  }

  html += `</div>`;
  container.innerHTML = html;

  document.getElementById('priorityStockModal').classList.remove('hidden');
}

function savePriorityStockSettings() {
  // Save the single global threshold
  const globalInput = document.getElementById('ps_global_thr');
  if (globalInput) {
    const gv = globalInput.value.trim();
    saveGlobalAlertThreshold(gv === '' || isNaN(parseInt(gv)) ? null : Math.max(1, parseInt(gv)));
  }
  closeModal('priorityStockModal');
  refreshAlertsBadge();
  // Re-render inventory so colors and Low Stock badges update immediately.
  renderInventory();
  showToast('✅ Stock alerts saved!', 'success');
}

// =================== PRINT ===================
const printStyle = `
  @media print {
    @page { size: A4 portrait; margin: 16mm; }
    body > * { display: none !important; }
    #receiptModal { display: block !important; position: static !important; background: none !important; }
    #receiptModal .modal-box { box-shadow: none !important; border: none !important; max-width: 100% !important; }
    #receiptModal .modal-header, #receiptModal .modal-footer { display: none !important; }
    .receipt-biz-name { color: #000 !important; }
    #invReportPrintArea { display: block !important; position: static !important; background: #fff !important; padding: 0 !important; }
    #invReportPrintArea table { width: 100% !important; table-layout: auto; }
    #invReportPrintArea tr { page-break-inside: avoid; }
    #invOpeningPrintArea { display: block !important; position: static !important; background: #fff !important; padding: 0 !important; }
    #invOpeningPrintArea .inv-list-item { page-break-inside: avoid; }
    * { color: #000 !important; background: #fff !important; }
  }
`;
const styleEl = document.createElement('style');
styleEl.textContent = printStyle;
document.head.appendChild(styleEl);

// =================== DAILY INVENTORY REPORT — PRINT / PDF ===================
// Both functions read the already-rendered #invReportTable and #invBalanceCheck
// directly from the DOM, so the printed/exported report always matches exactly
// what the cashier sees on screen (same Total Used / Status fixes already applied
// by renderInventory()) instead of duplicating that calculation logic separately.

// Shared legend markup explaining the Good/Low/Out stock coloring used by
// both Print exports below (Daily Inventory Report and Opening Inventory) —
// kept in one place so the wording/thresholds can't drift between the two.
// The legend notes that Low Stock thresholds are per-ingredient (custom).
function buildStockLegendHTML() {
  return `
    <div style="display:flex;justify-content:center;gap:18px;flex-wrap:wrap;margin:10px 0 16px;font-size:0.76rem;font-weight:700;">
      <span style="color:var(--green);">&#9632; Good Stock (above threshold)</span>
      <span style="color:var(--orange);">&#9632; Low Stock (at or below threshold)</span>
      <span style="color:var(--red);">&#9632; Out of Stock (0)</span>
    </div>`;
}

function getInventoryReportHeaderInfo() {
  const dateKey = getTodayInvKey();
  const dateLabel = new Date(dateKey + 'T00:00:00').toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  const cashierName = activeCashier?.name || BIZ_NAME;
  return { dateKey, dateLabel, cashierName };
}

// Reads the live (possibly very wide, N-shifts-across) #invReportTable and
// regroups it into a list of compact tables: one small table per shift
// (Item | Open | Close | Actual | Short | Used), plus a final summary table
// (Item | Total Used | Status). A wide table with 5 shifts has 27+ columns,
// which is unreadable on any printed page no matter how small the font —
// stacking narrow per-shift tables instead keeps every column legible.
function getInventoryReportTablesGrouped() {
  const table = document.getElementById('invReportTable');
  const headerCells = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
  // Each cell is captured as {text, color} instead of plain text. color is
  // whatever literal value (if any) renderInventory() already set via
  // td.style.color — for stock quantity cells that's always one of the
  // stockLevelColor() outputs ('var(--green)' / 'var(--orange)' /
  // 'var(--red)'), since that's the only thing that writes inline color
  // there. Carrying this through (instead of discarding it, as the old
  // textContent-only extraction did) is what lets the Print view and PDF
  // export reproduce the same Good/Low/Out stock coloring shown on screen.
  const bodyRows = [...table.querySelectorAll('tbody tr')].map(tr =>
    [...tr.querySelectorAll('td')].map(td => ({
      text: td.textContent.replace(/\s+/g, ' ').trim(),
      color: td.style.color || ''
    }))
  );

  const isSingleShift = headerCells[1] === 'Opening';
  if (isSingleShift) {
    // Already compact: Item | Opening | Closing | Used/Sold | Actual | Variance | Status
    return {
      shiftTables: [{ title: null, head: headerCells, rows: bodyRows }],
      summaryTable: null
    };
  }

  // Multi-shift wide format: Item, then 5 cols per shift, then Total Used, Status.
  const shiftCount = (headerCells.length - 3) / 5;
  const shiftTables = [];
  for (let si = 0; si < shiftCount; si++) {
    const startCol = 1 + si * 5;
    const head = ['Item', 'Open', 'Close', 'Actual', 'Short', 'Used'];
    const rows = bodyRows.map(r => [r[0], r[startCol], r[startCol+1], r[startCol+2], r[startCol+3], r[startCol+4]]);
    shiftTables.push({ title: `Shift ${si + 1}`, head, rows });
  }
  const totalUsedCol = headerCells.length - 2;
  const statusCol = headerCells.length - 1;
  const summaryTable = {
    title: 'Total Used & Status (All Shifts Combined)',
    head: ['Item', 'Total Used', 'Status'],
    rows: bodyRows.map(r => [r[0], r[totalUsedCol], r[statusCol]])
  };
  return { shiftTables, summaryTable };
}

// Builds a temporary, print-friendly DOM node containing one compact table
// per shift plus the combined summary and balance check, so the print
// preview stays readable on a normal page regardless of shift count.
function buildInventoryReportPrintArea() {
  const reportSection = document.getElementById('invReportSection');
  if (!reportSection || reportSection.style.display === 'none') {
    showToast('No inventory report available to export yet. Set an opening and closing inventory first.', 'error');
    return null;
  }

  const { dateLabel, cashierName } = getInventoryReportHeaderInfo();
  const shortsCount = document.getElementById('invShortsCount')?.textContent || '—';
  const { shiftTables, summaryTable } = getInventoryReportTablesGrouped();
  const balanceClone = document.getElementById('invBalanceCheck').cloneNode(true);

  function renderTableHTML(t) {
    const headHTML = t.head.map(h => `<th style="padding:6px 8px;border:1px solid #ccc;background:#e87c1e;color:#fff;text-align:left;font-size:0.78rem;">${escHtml(h)}</th>`).join('');
    // c.color carries through whatever stockLevelColor() already set on
    // screen (var(--green)/var(--orange)/var(--red), or '' for cells that
    // were never stock-colored). CSS variables resolve fine here since this
    // print area is appended into the same document that defines them at
    // :root, so no hex conversion is needed for the Print path (unlike PDF).
    const rowsHTML = t.rows.map(r =>
      `<tr>${r.map(c => `<td style="padding:5px 8px;border:1px solid #ddd;font-size:0.78rem;color:${c.color || '#000'};${c.color ? 'font-weight:700;' : ''}">${escHtml(c.text)}</td>`).join('')}</tr>`
    ).join('');
    return `
      ${t.title ? `<div style="font-weight:700;font-size:0.88rem;margin:14px 0 6px;color:#222;">${escHtml(t.title)}</div>` : ''}
      <table style="width:100%;border-collapse:collapse;margin-bottom:6px;">
        <thead><tr>${headHTML}</tr></thead>
        <tbody>${rowsHTML}</tbody>
      </table>`;
  }

  // Legend explaining the stock-level coloring used on the Open/Close/Actual
  // quantity columns above, so the rule is clear on a standalone printed
  // page (on screen it's learned by context; on paper it needs to be spelled out).
  const legendHTML = buildStockLegendHTML();

  const wrap = document.createElement('div');
  wrap.id = 'invReportPrintArea';
  wrap.style.cssText = 'position:fixed;top:0;left:0;width:100%;background:#fff;color:#000;padding:24px;z-index:99999;display:none;font-family:Arial,Helvetica,sans-serif;';
  wrap.innerHTML = `
    <div style="text-align:center;margin-bottom:18px;">
      <div style="font-size:1.4rem;font-weight:800;">${escHtml(BIZ_NAME)}</div>
      <div style="font-size:1.05rem;font-weight:700;margin-top:4px;">Daily Inventory Report</div>
      <div style="font-size:0.9rem;color:#444;margin-top:2px;">${escHtml(dateLabel)}</div>
      <div style="font-size:0.82rem;color:#666;">Prepared by: ${escHtml(cashierName)} &nbsp;|&nbsp; Shorts found: ${escHtml(shortsCount)}</div>
    </div>
    ${legendHTML}
    ${shiftTables.map(renderTableHTML).join('')}
    ${summaryTable ? renderTableHTML(summaryTable) : ''}
  `;
  const balanceWrap = document.createElement('div');
  balanceWrap.style.marginTop = '18px';
  balanceWrap.appendChild(balanceClone);
  wrap.appendChild(balanceWrap);
  document.body.appendChild(wrap);
  return wrap;
}

function printInventoryReport() {
  const area = buildInventoryReportPrintArea();
  if (!area) return;
  area.style.display = 'block';
  setTimeout(() => {
    window.print();
    setTimeout(() => area.remove(), 500);
  }, 50);
}

// =================== OPENING INVENTORY — PRINT / PDF ===================
// Mirrors the Daily Inventory Report print/PDF pair above, but scoped to just
// the #invOpeningList block (ingredients + cash amounts for the currently
// viewed shift), so a cashier can hand over / file a record of opening stock
// without needing the full open-vs-close comparison report.

function buildOpeningInventoryPrintArea() {
  const openingList = document.getElementById('invOpeningList');
  if (!openingList || !openingList.innerHTML.trim() || openingList.querySelector('p')) {
    showToast('No opening inventory set for this date/shift yet.', 'error');
    return null;
  }

  const { dateLabel, cashierName } = getInventoryReportHeaderInfo();
  const listClone = openingList.cloneNode(true);

  const wrap = document.createElement('div');
  wrap.id = 'invOpeningPrintArea';
  wrap.style.cssText = 'position:fixed;top:0;left:0;width:100%;background:#fff;color:#000;padding:24px;z-index:99999;display:none;font-family:Arial,Helvetica,sans-serif;';
  wrap.innerHTML = `
    <div style="text-align:center;margin-bottom:18px;">
      <div style="font-size:1.4rem;font-weight:800;">${escHtml(BIZ_NAME)}</div>
      <div style="font-size:1.05rem;font-weight:700;margin-top:4px;">Opening Inventory</div>
      <div style="font-size:0.9rem;color:#444;margin-top:2px;">${escHtml(dateLabel)}</div>
      <div style="font-size:0.82rem;color:#666;">Prepared by: ${escHtml(cashierName)}</div>
    </div>
    ${buildStockLegendHTML()}
  `;
  const listWrap = document.createElement('div');
  listWrap.style.cssText = 'color:#000;max-width:520px;margin:0 auto;';
  listWrap.appendChild(listClone);
  wrap.appendChild(listWrap);
  document.body.appendChild(wrap);
  return wrap;
}

function printOpeningInventory() {
  const area = buildOpeningInventoryPrintArea();
  if (!area) return;
  area.style.display = 'block';
  setTimeout(() => {
    window.print();
    setTimeout(() => area.remove(), 500);
  }, 50);
}

// Reads the live #invOpeningList DOM and converts it into a simple two-column
// (Item | Qty/Amount) row list for autoTable. The live list isn't a uniform
// <table> — it mixes two different .inv-list-item shapes:
//   - Cash rows: <div class="inv-list-item"><span>name</span><span>amount</span></div>
//     (name/value are direct children)
//   - Ingredient rows: <div class="inv-list-item"><div class="flex-row">
//       <div>name</div><span>qty</span></div> ...extra sold/out-of-stock divs... </div>
//     (name/value are nested one level down, inside the first child row, and
//     there may be additional sibling divs for "sold"/"out of stock" notes
//     that must NOT be picked up as the value column)
// so each row's own name+value pair is read from whichever level actually
// holds two label/value children, instead of always trusting top-level
// children — which is what silently dropped every ingredient row before
// (their headline qty isn't a direct child of .inv-list-item at all).
function getOpeningInventoryRowsForPDF() {
  const openingList = document.getElementById('invOpeningList');
  const rows = [];
  if (!openingList) return rows;
  openingList.querySelectorAll('.inv-list-item').forEach(item => {
    // Ingredient rows nest the actual name/qty pair inside the row's FIRST
    // CHILD (a flex div with exactly 2 children: name-block, qty-block), and
    // may have extra sibling divs after it (sold / out-of-stock notes) that
    // must be ignored. Cash rows have no such wrapper — the name/value pair
    // is the row's own direct children. Detect which shape this is by
    // checking the first child itself, not the row's total child count
    // (a row can have 1, 2, or 3 children depending on sold/out-of-stock
    // notes, so child count alone doesn't reliably distinguish the shapes).
    const firstChild = item.firstElementChild;
    const pairHolder = (firstChild && firstChild.children.length === 2) ? firstChild : item;
    const cellText = el => {
      // Some cells (e.g. the ingredient name block) are built from two
      // adjacent <span>s with no whitespace text node between them in the
      // markup — visual spacing comes from CSS margin only — so plain
      // textContent runs them together as "Burger Pattiespcs". Other cells
      // (e.g. the qty block "40 <span>pcs</span>") DO have a real space
      // character before the nested element, so textContent is already
      // correct there. Detect the "no separator" case specifically: every
      // child node is an element (no loose whitespace text in between) AND
      // there's more than one of them — only then re-join with an inserted
      // space; otherwise trust textContent as-is.
      const onlyElementChildren = el.childNodes.length > 1 &&
        [...el.childNodes].every(n => n.nodeType === 1);
      const raw = onlyElementChildren
        ? [...el.children].map(c => c.textContent).join(' ')
        : el.textContent;
      return raw.replace(/\s+/g, ' ').trim();
    };
    const cells = [...pairHolder.children].map(cellText);
    // The value cell (qty for ingredients, amount for cash) is whichever
    // element is last in pairHolder.children — renderInventory() already set
    // its inline color via stockLevelColor() for ingredient rows (cash rows
    // get a fixed var(--blue) instead, which deliberately isn't a stock
    // color — see stockColorToRGB()'s null fallback below). Reading it here
    // is what lets the PDF reproduce the same Good/Low/Out coloring shown
    // on screen instead of rendering every row in plain black text.
    const valueColor = pairHolder.lastElementChild ? pairHolder.lastElementChild.style.color || '' : '';
    if (cells.length >= 2 && cells[0]) rows.push([cells[0], cells[cells.length - 1], valueColor]);
  });
  return rows;
}

// Generates a clean, shareable PDF of the Opening Inventory using jsPDF +
// autotable. Falls back to the Print dialog (Save as PDF) if the jsPDF
// library failed to load (e.g. no internet on first run before the service
// worker has cached it) — same fallback behavior as the full report export.
function downloadOpeningInventoryPDF() {
  if (typeof window.jspdf === 'undefined') {
    showToast('PDF library not loaded yet — using Print instead. Choose "Save as PDF" in the print dialog.', '');
    printOpeningInventory();
    return;
  }

  const openingList = document.getElementById('invOpeningList');
  if (!openingList || !openingList.innerHTML.trim() || openingList.querySelector('p')) {
    showToast('No opening inventory set for this date/shift yet.', 'error');
    return;
  }

  const { dateLabel, cashierName } = getInventoryReportHeaderInfo();
  // rawRows carries a 3rd element per row (the qty/amount cell's stock
  // color, or '' if none) — kept out of `rows` (the actual autoTable body)
  // and looked up separately in didParseCell below, since autoTable body
  // cells must be plain strings, not [text, color] pairs.
  const rawRows = getOpeningInventoryRowsForPDF();
  const rows = rawRows.map(r => [pdfSafeText(r[0]), pdfSafeText(r[1])]);
  const rowColors = rawRows.map(r => r[2] || '');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text(BIZ_NAME, pageWidth / 2, 40, { align: 'center' });
  doc.setFontSize(12);
  doc.text('Opening Inventory', pageWidth / 2, 58, { align: 'center' });
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(pdfSafeText(dateLabel), pageWidth / 2, 74, { align: 'center' });
  doc.text(`Prepared by: ${pdfSafeText(cashierName)}`, pageWidth / 2, 88, { align: 'center' });
  doc.setTextColor(0);

  // Legend for the Good/Low/Out stock coloring applied to the Qty / Amount
  // column below — drawn with colored text so it doubles as a sample swatch.
  const legendY = 100;
  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(16, 185, 129);
  doc.text('Good Stock (above threshold)', pageWidth / 2 - 130, legendY, { align: 'center' });
  doc.setTextColor(232, 124, 30);
  doc.text('Low Stock (at/below threshold)', pageWidth / 2, legendY, { align: 'center' });
  doc.setTextColor(239, 68, 68);
  doc.text('Out of Stock (0)', pageWidth / 2 + 130, legendY, { align: 'center' });
  doc.setTextColor(0);
  doc.setFont(undefined, 'normal');

  doc.autoTable({
    head: [['Item', 'Qty / Amount']],
    body: rows,
    startY: legendY + 14,
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [232, 124, 30], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    margin: { left: 24, right: 24 },
    didParseCell: function(data) {
      // Only the Qty/Amount column (index 1) ever carries a stock color —
      // cash rows resolve to null via stockColorToRGB() and are left alone.
      if (data.section === 'body' && data.column.index === 1) {
        const rgb = stockColorToRGB(rowColors[data.row.index]);
        if (rgb) {
          data.cell.styles.textColor = rgb;
          data.cell.styles.fontStyle = 'bold';
        }
      }
    }
  });

  const dateKey = getTodayInvKey();
  doc.save(`Opening-Inventory-${dateKey}.pdf`);
}

// jsPDF's built-in fonts (Helvetica/Times/Courier) have no emoji glyphs at
// all, so any emoji passed to doc.text()/autoTable() renders as garbage bytes
// (e.g. "&¡", "&þ") instead of being skipped. The print/on-screen views are
// real browser HTML and render emoji fine — this sanitizer is PDF-only, so it
// doesn't touch the print or live report.
function pdfSafeText(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/⚠️|⚠/g, '[!]')
    .replace(/⚡/g, '[LOW]')
    .replace(/✓\s*/g, '')
    .replace(/✅/g, '[OK]')
    .replace(/🕐/g, '')
    .replace(/₱/g, 'PHP ')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\uFE0F]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pdfSafeTable(t) {
  return {
    title: t.title ? pdfSafeText(t.title) : null,
    head: t.head.map(pdfSafeText),
    // Each row cell is {text, color} (see getInventoryReportTablesGrouped) —
    // sanitize the text for PDF-unsafe emoji while passing color through
    // untouched so downloadInventoryReportPDF() can still map it to an RGB
    // value for the cell.
    rows: t.rows.map(r => r.map(c => ({ text: pdfSafeText(c.text), color: c.color || '' })))
  };
}

// Generates a clean, shareable PDF of the Daily Inventory Report using
// jsPDF + autotable. Falls back to the Print dialog (Save as PDF) if the
// jsPDF library failed to load (e.g. no internet on first run before the
// service worker has cached it).
function downloadInventoryReportPDF() {
  if (typeof window.jspdf === 'undefined') {
    showToast('PDF library not loaded yet — using Print instead. Choose "Save as PDF" in the print dialog.', '');
    printInventoryReport();
    return;
  }

  const reportSection = document.getElementById('invReportSection');
  if (!reportSection || reportSection.style.display === 'none') {
    showToast('No inventory report available to export yet. Set an opening and closing inventory first.', 'error');
    return;
  }

  const { dateKey, dateLabel, cashierName } = getInventoryReportHeaderInfo();
  const shortsCount = pdfSafeText(document.getElementById('invShortsCount')?.textContent || '—');
  const { shiftTables, summaryTable } = getInventoryReportTablesGrouped();
  const safeShiftTables = shiftTables.map(pdfSafeTable);
  const safeSummaryTable = summaryTable ? pdfSafeTable(summaryTable) : null;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Header
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text(BIZ_NAME, pageWidth / 2, 40, { align: 'center' });
  doc.setFontSize(12);
  doc.text('Daily Inventory Report', pageWidth / 2, 58, { align: 'center' });
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(dateLabel, pageWidth / 2, 74, { align: 'center' });
  doc.text(`Prepared by: ${cashierName}   |   Shorts found: ${shortsCount}`, pageWidth / 2, 88, { align: 'center' });
  doc.setTextColor(0);

  // Legend for the Good/Low/Out stock coloring applied to the Open/Close/
  // Actual quantity columns below — drawn in colored text so it also serves
  // as a sample swatch of each color.
  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(16, 185, 129);
  doc.text('Good Stock (above threshold)', pageWidth / 2 - 130, 100, { align: 'center' });
  doc.setTextColor(232, 124, 30);
  doc.text('Low Stock (at/below threshold)', pageWidth / 2, 100, { align: 'center' });
  doc.setTextColor(239, 68, 68);
  doc.text('Out of Stock (0)', pageWidth / 2 + 130, 100, { align: 'center' });
  doc.setTextColor(0);
  doc.setFont(undefined, 'normal');

  // One compact table per shift (Item | Open | Close | Actual | Short | Used),
  // stacked vertically — never wider than 6 columns, so it stays readable no
  // matter how many shifts the day had. autoTable auto-breaks across pages.
  let y = 116;
  const allTables = safeSummaryTable ? [...safeShiftTables, safeSummaryTable] : safeShiftTables;
  allTables.forEach((t, idx) => {
    if (t.title) {
      if (y > pageHeight - 80) { doc.addPage(); y = 40; }
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(20);
      doc.text(t.title, 24, y);
      doc.setTextColor(0);
      y += 10;
    }
    doc.autoTable({
      head: [t.head],
      body: t.rows.map(r => r.map(c => c.text)),
      startY: y,
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [232, 124, 30], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      margin: { left: 24, right: 24 },
      didParseCell: function(data) {
        // t.rows still holds the {text, color} objects in closure here, so
        // look up this exact cell's color by position — only cells that
        // were actually stock-colored on screen (Open/Close/Actual qty)
        // resolve to a non-null RGB; everything else is left at default.
        if (data.section === 'body') {
          const cell = t.rows[data.row.index]?.[data.column.index];
          const rgb = cell ? stockColorToRGB(cell.color) : null;
          if (rgb) {
            data.cell.styles.textColor = rgb;
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    });
    y = doc.lastAutoTable.finalY + 20;
  });

  // Cash balance summary, plain text below the tables
  if (y > pageHeight - 100) { doc.addPage(); y = 40; }
  const balanceText = pdfSafeText(document.getElementById('invBalanceCheck')?.textContent || '');
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text('Cash Balance Summary', 24, y);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  const wrapped = doc.splitTextToSize(balanceText, pageWidth - 48);
  doc.text(wrapped, 24, y + 16);

  const fileName = `Inventory_Report_${dateKey}.pdf`;
  doc.save(fileName);
  showToast('✅ PDF saved — ready to share with the owner!', 'success');
}
