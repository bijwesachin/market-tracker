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
const parseISO = (isoStr) => SoD(new Date((isoStr || '') + 'T00:00:00'));
const fmtDate = (isoStr) => {
  const d = parseISO(isoStr);
  if (isNaN(d)) return String(isoStr || '');
  return d.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });
};
const diffDays = (from, to) => Math.round((SoD(to) - SoD(from)) / MS_DAY);
const isToday = (isoStr) => diffDays(today(), parseISO(isoStr)) === 0;
const isTomorrow = (isoStr) => diffDays(today(), parseISO(isoStr)) === 1;
const iso = (d) => d.toISOString().slice(0, 10);

// ===== Time helpers (12-hour CT + inference for AM/PM/BMO/AMC) =====
function fmtTime12CT(timeStr) {
  if (!timeStr) return '';
  // Accept "am"/"pm"
  if (/^(am|pm)$/i.test(timeStr)) {
    const isAM = /^am$/i.test(timeStr);
    const h24 = isAM ? 9 : 16; // placeholder: 9:00 AM CT vs 4:00 PM CT
    const h12 = h24 % 12 || 12;
    const mm = '00';
    return `${h12}:${mm} ${isAM ? 'AM' : 'PM'} CT`;
  }
  // Accept "HH:MM" (24h)
  const m = String(timeStr).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '';
  let h = parseInt(m[1], 10), mm = m[2];
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${mm} ${period} CT`;
}

function inferTime(ev, context) {
  const t = ev?.time && String(ev.time).trim();

  // explicit am/pm
  if (/^(am|pm)$/i.test(t || '')) {
    return /^am$/i.test(t) ? { minutes: 9 * 60, period: 'AM' } : { minutes: 16 * 60, period: 'PM' };
  }
  // explicit HH:MM
  if (t && /^\d{1,2}:\d{2}$/.test(t)) {
    const [h, m] = t.split(':').map(Number);
    return { minutes: h * 60 + m, period: h >= 12 ? 'PM' : 'AM' };
  }
  // keyword inference for earnings
  const hay = `${ev?.label || ''} ${ev?.type || ''}`.toLowerCase();
  if (context === 'earnings') {
    if (/(bmo|before market|pre[-\s]?market|premarket)/.test(hay)) return { minutes: 9 * 60, period: 'AM' };
    if (/(amc|after market|after hours|post[-\s]?market|postmarket)/.test(hay)) return { minutes: 16 * 60, period: 'PM' };
  }
  return { minutes: null, period: '' };
}

// sort by date, then by time (missing time last)
function compareByDateTime(a, b, context = '') {
  const da = new Date(a.date), db = new Date(b.date);
  if (da - db !== 0) return da - db;
  const ta = inferTime(a, context).minutes;
  const tb = inferTime(b, context).minutes;
  if (ta != null && tb != null) return ta - tb;
  if (ta != null && tb == null) return -1;
  if (ta == null && tb != null) return 1;
  return 0;
}

function periodFromEvent(ev, context) { return inferTime(ev, context).period; }

// ===== DOM helpers =====
const $ = (sel) => document.querySelector(sel);

function paintEvent(li, isoDate) {
  if (!li) return;
  const d = parseISO(isoDate), now = today();
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
    return fallback;
  }
}

function tzAbbrevFromTZString(tzString) {
  if (!tzString) return 'CT';
  const s = String(tzString).toLowerCase();
  if (s.includes('chicago') || s.includes('central')) return 'CT';
  return 'CT';
}

// Add a row to a list using the template.
// For earnings: NO label text; keep EARNINGS pill and icon.
function addEvent(listEl, ev, tzLabel = 'CT', context = '') {
  const tplEl = $('#eventItemTemplate');
  if (!listEl || !tplEl) return;
  const frag = tplEl.content.cloneNode(true);
  const li = frag.querySelector('.event');
  const dEl = frag.querySelector('.event-date');
  const lblEl = frag.querySelector('.event-label');
  const typeEl = frag.querySelector('.event-type');

  let dateLine = fmtDate(ev?.date);
  const timeLabel = fmtTime12CT(ev?.time);
  if (timeLabel) dateLine += ` · ${timeLabel}`;

  // AM/PM icons for earnings
  if (context === 'earnings') {
    const p = periodFromEvent(ev, 'earnings');
    if (p === 'AM') dateLine += '  ☀️';
    else if (p === 'PM') dateLine += '  🌙';
  }

  if (dEl) dEl.textContent = dateLine;

  // Only set label text for NON-earnings events
  if (lblEl) {
    if (context === 'earnings') {
      lblEl.textContent = ''; // <— remove "Earnings" word
    } else {
      lblEl.textContent = ev?.label || '';
    }
  }

  // Keep the type pill; for earnings we show "EARNINGS"
  if (typeEl) typeEl.textContent = ((ev?.type) || 'EVENT').toUpperCase();

  paintEvent(li, ev?.date);
  listEl.appendChild(frag);
}

// ===== Specials: OPEX & VIX =====
function thirdFriday(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const firstFriOffset = (5 - first.getDay() + 7) % 7; // 5 = Fri
  return new Date(year, monthIndex, 1 + firstFriOffset + 14);
}
function vixSettlementForMonth(year, monthIndex) {
  // VIX settlement: Wednesday ~30 days before next month's OPEX
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
    const dIso = iso(d), off = diffDays(now, d);
    if (off < 0 || off > SPECIALS_WINDOW) return;

    const isOpex = d.getTime() === thirdFriday(d.getFullYear(), d.getMonth()).getTime();
    const type = isOpex ? 'MONTHLY OPEX' : 'VIX SETTLEMENT';
    const key = type + '|' + dIso; if (seen.has(key)) return; seen.add(key);

    addEvent(ul, {
      date: dIso,
      label: isOpex ? 'Monthly OPEX (standard options expiration)' : 'VIX Settlement (VRO)',
      type
    }, 'CT', '');
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
  const tzLabel = tzAbbrevFromTZString(econ?.timezone || 'America/Chicago');

  (econ?.events || [])
    .filter(ev => inWeekRange(ev?.date, ECON_WEEK_1, ECON_WEEK_2, showNext))
    .sort((a, b) => compareByDateTime(a, b, 'econ'))
    .forEach(ev => addEvent(ul, ev, tzLabel, ''));

  if (!ul.children.length) {
    const div = document.createElement('div'); div.style.opacity = '.7';
    div.textContent = showNext ? 'No events in this or next week.' : 'No events this week.';
    ul.appendChild(div);
  }
}

// ===== Earnings (flat earnings.json) =====
function normalizeEarningsFlat(rows) {
  if (!Array.isArray(rows)) return [];
  const map = new Map(); // symbol -> events[]
  rows.forEach(r => {
    if (!r || !r.ticker || !r.date) return;
    const sym = String(r.ticker).toUpperCase().trim();
    if (!map.has(sym)) map.set(sym, []);
    map.get(sym).push({
      date: r.date,
      time: r.time || '', // "am" | "pm" | "HH:MM" | ''
      label: '',          // <— no "Earnings" label text inside the card
      type: 'EARNINGS'
    });
  });
  return Array.from(map.entries()).map(([symbol, events]) => ({ symbol, events }));
}

function buildEarnings(earnRaw) {
  const board = $('#earningsBoard'); if (!board) return;
  board.innerHTML = '';
  const showNext = $('#toggleEarningsWeek')?.checked ?? false;

  const groups = normalizeEarningsFlat(earnRaw);
  groups.forEach(t => {
    const events = (t.events || [])
      .filter(ev => inWeekRange(ev?.date, EARNINGS_WEEK_1, EARNINGS_WEEK_2, showNext))
      .sort((a, b) => compareByDateTime(a, b, 'earnings'));
    if (!events.length) return;

    const tpl = $('#tickerTemplate'); if (!tpl) return;
    const sect = tpl.content.cloneNode(true);
    const title = sect.querySelector('.ticker-title');
    if (title) title.textContent = (t.symbol || '').trim(); // SYMBOL ONLY in header

    const ul = sect.querySelector('.event-list');
    events.forEach(ev => addEvent(ul, ev, 'CT', 'earnings'));
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
    getJSON(ECON_JSON, { timezone: 'America/Chicago', events: [] }),
    getJSON(EARNINGS_JSON, []) // FLAT ARRAY fallback
  ]);
  buildSpecials();
  buildEcon(econ.status === 'fulfilled' ? econ.value : { timezone:'America/Chicago', events: [] });
  buildEarnings(earnings.status === 'fulfilled' ? earnings.value : []);
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