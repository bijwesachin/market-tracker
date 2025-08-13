// ========== File paths ==========
const EARNINGS_JSON = 'earnings.json';
const ECON_JSON = 'econ.json';

// ========== Ranges & Windows ==========
const ECON_WEEK_1 = [0, 6];     // current week: days 0..6
const ECON_WEEK_2 = [7, 13];    // next week:   days 7..13
const EARNINGS_WEEK_1 = [0, 6]; // current week: days 0..6
const EARNINGS_WEEK_2 = [7, 13];// next week:   days 7..13
const SPECIALS_WINDOW = 14;     // OPEX/VIX window: next 14 days

// ========== Date helpers ==========
const MS_DAY = 86400000;
const SoD = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const today = () => SoD(new Date());
const parseISO = (iso) => SoD(new Date(iso + 'T00:00:00'));
const fmtDate = (iso) =>
  parseISO(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const diffDays = (from, to) => Math.round((SoD(to) - SoD(from)) / MS_DAY);
const isToday = (iso) => diffDays(today(), parseISO(iso)) === 0;
const isTomorrow = (iso) => diffDays(today(), parseISO(iso)) === 1;
const iso = (d) => d.toISOString().slice(0, 10);

// ========== UI helpers ==========
function paintEvent(li, isoDate) {
  const d = parseISO(isoDate);
  const now = today();
  if (d < now) li.classList.add('past');
  if (isToday(isoDate)) li.classList.add('today');
  if (isTomorrow(isoDate)) li.classList.add('tomorrow');
  li.dataset.dayoffset = diffDays(now, d);
}

async function getJSON(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Load failed: ${path}`);
  return res.json();
}

function addEvent(listEl, { date, label, type, url }) {
  const tpl = document.getElementById('eventItemTemplate').content.cloneNode(true);
  const li = tpl.querySelector('.event');
  tpl.querySelector('.event-date').textContent = fmtDate(date);
  tpl.querySelector('.event-label').textContent = label || '';
  tpl.querySelector('.event-type').textContent = (type || 'EVENT').toUpperCase();
  const a = tpl.querySelector('.event-link');
  if (a) {
    if (url) a.href = url;
    // link visibility is controlled by CSS (hidden globally per your request)
  }
  paintEvent(li, date);
  listEl.appendChild(tpl);
}

// ========== Specials: Monthly OPEX & VIX ==========
function thirdFriday(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const firstFriOffset = (5 - first.getDay() + 7) % 7; // 5 = Friday
  return new Date(year, monthIndex, 1 + firstFriOffset + 14); // third Friday
}

// VIX settlement (VRO) = Wednesday 30 days before next month's OPEX (SPX monthly)
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
  const ul = document.getElementById('specials');
  if (!ul) return;
  ul.innerHTML = '';

  const now = today();
  const y = now.getFullYear();
  const m = now.getMonth();

  const candidates = [
    thirdFriday(y, m),
    thirdFriday(y, m + 1),
    vixSettlementForMonth(y, m),
    vixSettlementForMonth(y, m + 1),
  ];

  const seen = new Set();
  candidates.forEach((d) => {
    const dIso = iso(d);
    const off = diffDays(now, d);
    if (off < 0 || off > SPECIALS_WINDOW) return;

    const isOpex = d.getTime() === thirdFriday(d.getFullYear(), d.getMonth()).getTime();
    const type = isOpex ? 'MONTHLY OPEX' : 'VIX SETTLEMENT';
    const key = type + '|' + dIso;
    if (seen.has(key)) return;
    seen.add(key);

    addEvent(ul, {
      date: dIso,
      label: isOpex ? 'Monthly OPEX (standard options expiration)' : 'VIX Settlement (VRO)',
      type,
      url: isOpex
        ? 'https://www.cboe.com/tradable_products/expiration_dates/'
        : 'https://www.cboe.com/tradable_products/vix/vix_options/',
    });
  });

  if (!ul.children.length) {
    const div = document.createElement('div');
    div.style.opacity = '.7';
    div.textContent = 'No OPEX or VIX settlement in the next 14 days.';
    ul.appendChild(div);
  }
}

// ========== Economic Events (week-based) ==========
function inWeekRange(isoDate, baseRange, nextRange, showNextWeek) {
  const off = diffDays(today(), parseISO(isoDate));
  if (off < 0) return false;
  if (off >= baseRange[0] && off <= baseRange[1]) return true;
  if (showNextWeek && off >= nextRange[0] && off <= nextRange[1]) return true;
  return false;
}

function buildEcon(econ) {
  const ul = document.getElementById('econList');
  if (!ul) return;
  ul.innerHTML = '';

  const showNext = document.getElementById('toggleNextWeek').checked;

  (econ.events || [])
    .filter((ev) => inWeekRange(ev.date, ECON_WEEK_1, ECON_WEEK_2, showNext))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .forEach((ev) => addEvent(ul, ev));

  if (!ul.children.length) {
    const div = document.createElement('div');
    div.style.opacity = '.7';
    div.textContent = showNext ? 'No events in this or next week.' : 'No events this week.';
    ul.appendChild(div);
  }
}

// ========== Earnings & Sales (week-based) ==========
function normalizeEarningsList(data) {
  // Support both formats:
  // 1) { "tickers": [ {symbol, name, events:[...]}, ... ] }
  // 2) { "AAPL": [ ... ], "MSFT": [ ... ] }
  if (Array.isArray(data?.tickers)) return data.tickers;
  if (data && typeof data === 'object') {
    return Object.keys(data).map((sym) => ({ symbol: sym, name: '', events: data[sym] }));
  }
  return [];
}

function buildEarnings(earn) {
  const board = document.getElementById('earningsBoard');
  if (!board) return;
  board.innerHTML = '';

  const showNext = document.getElementById('toggleEarningsWeek').checked;
  const list = normalizeEarningsList(earn);

  list.forEach((t) => {
    const events = (t.events || [])
      .filter((ev) => inWeekRange(ev.date, EARNINGS_WEEK_1, EARNINGS_WEEK_2, showNext))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (!events.length) return;

    const sect = document.getElementById('tickerTemplate').content.cloneNode(true);
    sect.querySelector('.ticker-title').textContent = `${t.symbol || ''} — ${t.name || ''}`.trim();
    const ul = sect.querySelector('.event-list');

    events.forEach((ev) => addEvent(ul, ev));
    board.appendChild(sect);
  });

  if (!board.children.length) {
    const div = document.createElement('div');
    div.style.opacity = '.7';
    div.textContent = showNext ? 'No earnings/sales in this or next week.' : 'No earnings/sales this week.';
    board.appendChild(div);
  }
}

// ========== Render & Wire ==========
async function renderAll() {
  try {
    const [econ, earnings] = await Promise.allSettled([getJSON(ECON_JSON), getJSON(EARNINGS_JSON)]);
    buildSpecials();
    if (econ.status === 'fulfilled') buildEcon(econ.value);
    if (earnings.status === 'fulfilled') buildEarnings(earnings.value);
  } catch (e) {
    document.body.insertAdjacentHTML('afterbegin', `<div style="opacity:.7;padding:8px">Error: ${e.message}</div>`);
  }
}

function wire() {
  const econToggle = document.getElementById('toggleNextWeek');
  const earnToggle = document.getElementById('toggleEarningsWeek');
  if (econToggle) econToggle.addEventListener('change', renderAll);
  if (earnToggle) earnToggle.addEventListener('change', renderAll);
}

wire();
renderAll();