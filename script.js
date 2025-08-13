// ===== Paths =====
const EARNINGS_JSON = 'earnings.json';
const ECON_JSON = 'econ.json';

// ===== Ranges =====
const ECON_WEEK_1 = [0, 6];     // current week
const ECON_WEEK_2 = [7, 13];    // next week
const EARNINGS_WEEK_1 = [0, 6]; // current week
const EARNINGS_WEEK_2 = [7, 13];// next week
const SPECIALS_WINDOW = 14;     // OPEX/VIX next 14 days

// ===== Date helpers =====
const MS_DAY = 86400000;
const SoD = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const today = () => SoD(new Date());
const parseISO = (iso) => SoD(new Date((iso || '') + 'T00:00:00'));
const fmtDate = (iso) => {
  const d = parseISO(iso);
  if (isNaN(d)) return String(iso || '');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};
const diffDays = (from, to) => Math.round((SoD(to) - SoD(from)) / MS_DAY);
const isToday = (iso) => diffDays(today(), parseISO(iso)) === 0;
const isTomorrow = (iso) => diffDays(today(), parseISO(iso)) === 1;
const iso = (d) => d.toISOString().slice(0, 10);

// ===== DOM helpers =====
function $(sel) { return document.querySelector(sel); }
function paintEvent(li, isoDate) {
  if (!li) return;
  const d = parseISO(isoDate);
  const now = today();
  if (isNaN(d)) return;
  if (d < now) li.classList.add('past');
  if (isToday(isoDate)) li.classList.add('today');
  if (isTomorrow(isoDate)) li.classList.add('tomorrow');
  li.dataset.dayoffset = diffDays(now, d);
}

async function getJSON(path, fallback = {}) {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
    return await res.json();
  } catch (e) {
    console.warn(`getJSON fallback for ${path}:`, e?.message || e);
    return fallback; // never crash on missing JSON
  }
}

function addEvent(listEl, ev) {
  const tplEl = $('#eventItemTemplate');
  if (!listEl || !tplEl) return;                   // guard for missing template/target
  const frag = tplEl.content.cloneNode(true);
  const li = frag.querySelector('.event');
  const d = frag.querySelector('.event-date');
  const lbl = frag.querySelector('.event-label');
  const typ = frag.querySelector('.event-type');

  if (d) d.textContent = fmtDate(ev.date);
  if (lbl) lbl.textContent = ev.label || '';
  if (typ) typ.textContent = (ev.type || 'EVENT').toUpperCase();

  paintEvent(li, ev.date);
  listEl.appendChild(frag);
}

// ===== Specials: OPEX & VIX =====
function thirdFriday(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const firstFriOffset = (5 - first.getDay() + 7) % 7; // 5 = Fri
  return new Date(year, monthIndex, 1 + firstFriOffset + 14);
}
function vixSettlementForMonth(year, monthIndex) {
  const opexNextMonth = thirdFriday(year, monthIndex + 1);
  const vro = new Date(opexNextMonth.getTime() - 30 * MS_DAY);
  const WED = 3;
  if (vro.getDay() !== WED) {
    const delta = WED - vro.getDay();
    vro.setDate(vro.getDate() + delta);
  }
  return vro;
}
function buildSpecials() {
  const ul = $('#specials'); if (!ul) return;
  ul.innerHTML = '';

  const now = today(), y = now.getFullYear(), m = now.getMonth();
  const candidates = [
    thirdFriday(y, m), thirdFriday(y, m + 1),
    vixSettlementForMonth(y, m), vixSettlementForMonth(y, m + 1),
  ];

  const seen = new Set();
  candidates.forEach((d) => {
    if (!(d instanceof Date) || isNaN(d)) return;
    const dIso = iso(d);
    const off = diffDays(now, d);
    if (off < 0 || off > SPECIALS_WINDOW) return;

    const isOpex = d.getTime() === thirdFriday(d.getFullYear(), d.getMonth()).getTime();
    const type = isOpex ? 'MONTHLY OPEX' : 'VIX SETTLEMENT';
    const key = type + '|' + dIso;
    if (seen.has(key)) return; seen.add(key);

    addEvent(ul, {
      date: dIso,
      label: isOpex ? 'Monthly OPEX (standard options expiration)' : 'VIX Settlement (VRO)',
      type
    });
  });

  if (!ul.children.length) {
    const div = document.createElement('div'); div.style.opacity = '.7';
    div.textContent = 'No OPEX or VIX settlement in the next 14 days.';
    ul.appendChild(div);
  }
}

// ===== Week filtering =====
function inWeekRange(isoDate, baseRange, nextRange, showNextWeek) {
  const d = parseISO(isoDate);
  if (isNaN(d)) return false;
  const off = diffDays(today(), d);
  if (off < 0) return false;
  if (off >= baseRange[0] && off <= baseRange[1]) return true;
  if (showNextWeek && off >= nextRange[0] && off <= nextRange[1]) return true;
  return false;
}

// ===== Economic Events =====
function buildEcon(econ) {
  const ul = $('#econList'); if (!ul) return;
  ul.innerHTML = '';
  const showNext = $('#toggleNextWeek')?.checked ?? false;

  (econ?.events || [])
    .filter(ev => inWeekRange(ev?.date, ECON_WEEK_1, ECON_WEEK_2, showNext))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .forEach(ev => addEvent(ul, ev));

  if (!ul.children.length) {
    const div = document.createElement('div'); div.style.opacity = '.7';
    div.textContent = showNext ? 'No events in this or next week.' : 'No events this week.';
    ul.appendChild(div);
  }
}

// ===== Earnings & Sales =====
function normalizeEarningsList(data) {
  if (Array.isArray(data?.tickers)) return data.tickers;
  if (data && typeof data === 'object') {
    return Object.keys(data).map(sym => ({ symbol: sym, name: '', events: data[sym] }));
  }
  return [];
}
function buildEarnings(earn) {
  const board = $('#earningsBoard'); if (!board) return;
  board.innerHTML = '';
  const showNext = $('#toggleEarningsWeek')?.checked ?? false;

  const list = normalizeEarningsList(earn);
  list.forEach(t => {
    const events = (t?.events || [])
      .filter(ev => inWeekRange(ev?.date, EARNINGS_WEEK_1, EARNINGS_WEEK_2, showNext))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (!events.length) return;

    const tpl = $('#tickerTemplate'); if (!tpl) return;
    const sect = tpl.content.cloneNode(true);
    const title = sect.querySelector('.ticker-title');
    if (title) title.textContent = `${t.symbol || ''} — ${t.name || ''}`.trim();
    const ul = sect.querySelector('.event-list');
    events.forEach(ev => addEvent(ul, ev));
    board.appendChild(sect);
  });

  if (!board.children.length) {
    const div = document.createElement('div'); div.style.opacity = '.7';
    div.textContent = showNext ? 'No earnings/sales in this or next week.' : 'No earnings/sales this week.';
    board.appendChild(div);
  }
}

// ===== Render & Wire =====
async function renderAll() {
  const [econ, earnings] = await Promise.allSettled([
    getJSON(ECON_JSON, { events: [] }),
    getJSON(EARNINGS_JSON, { tickers: [] })
  ]);
  buildSpecials();
  if (econ.status === 'fulfilled') buildEcon(econ.value); else buildEcon({ events: [] });
  if (earnings.status === 'fulfilled') buildEarnings(earnings.value); else buildEarnings({ tickers: [] });
}

function wire() {
  $('#toggleNextWeek')?.addEventListener('change', renderAll);
  $('#toggleEarningsWeek')?.addEventListener('change', renderAll);
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    wire();
    renderAll();
  } catch (e) {
    console.error('Init error:', e);
    document.body.insertAdjacentHTML('afterbegin', `<div style="opacity:.7;padding:8px">Error initializing app.</div>`);
  }
});