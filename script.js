// ---- File paths ----
const EARNINGS_JSON = 'earnings.json';
const ECON_JSON = 'econ.json';

// ---- Windows ----
const EARNINGS_WINDOW_3D = 3;   // earnings default
const EARNINGS_ALL = 365;       // earnings when toggle off
const SPECIALS_WINDOW = 14;     // OPEX/VIX
const ECON_WEEK_1 = [0, 6];     // this week: days 0..6
const ECON_WEEK_2 = [7, 13];    // next week: days 7..13

// ---- Date helpers ----
const MS_DAY = 86400000;
const SoD = (d=new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const today = () => SoD(new Date());
const parseISO = iso => SoD(new Date(iso + 'T00:00:00'));
const fmtDate = iso => parseISO(iso).toLocaleDateString(undefined,
  {weekday:'short', month:'short', day:'numeric', year:'numeric'});
const diffDays = (from, to) => Math.round((SoD(to)-SoD(from))/MS_DAY);
const isToday = iso => diffDays(today(), parseISO(iso)) === 0;
const isTomorrow = iso => diffDays(today(), parseISO(iso)) === 1;

// ---- UI helpers ----
function paintEvent(li, iso){
  const d = parseISO(iso);
  const now = today();
  if (d < now) li.classList.add('past');
  if (isToday(iso)) li.classList.add('today');
  if (isTomorrow(iso)) li.classList.add('tomorrow');
  li.dataset.dayoffset = diffDays(now, d);
}

async function getJSON(path){
  const res = await fetch(path, { cache:'no-store' });
  if(!res.ok) throw new Error(`Load failed: ${path}`);
  return res.json();
}

function addEvent(listEl, {date,label,type,url}){
  const tpl = document.getElementById('eventItemTemplate').content.cloneNode(true);
  const li = tpl.querySelector('.event');
  tpl.querySelector('.event-date').textContent = fmtDate(date);
  tpl.querySelector('.event-label').textContent = label || '';
  tpl.querySelector('.event-type').textContent = (type || 'EVENT').toUpperCase();
  const a = tpl.querySelector('.event-link');
  if (url) a.href = url; else a.style.display = 'none';
  paintEvent(li, date);
  listEl.appendChild(tpl);
}

const iso = d => d.toISOString().slice(0,10);

// ---- Specials: OPEX & VIX (14-day window) ----
function thirdFriday(year, monthIndex){
  const first = new Date(year, monthIndex, 1);
  const firstFriOffset = (5 - first.getDay() + 7) % 7; // 5=Fri
  return new Date(year, monthIndex, 1 + firstFriOffset + 14);
}
function vixSettlementForMonth(year, monthIndex){
  const opexNextMonth = thirdFriday(year, monthIndex + 1);
  const vro = new Date(opexNextMonth.getTime() - 30*MS_DAY);
  const WED = 3;
  if (vro.getDay() !== WED){
    const delta = WED - vro.getDay();
    vro.setDate(vro.getDate() + delta);
  }
  return vro;
}
function buildSpecials(){
  const ul = document.getElementById('specials'); ul.innerHTML = '';
  const now = today(); const y = now.getFullYear(); const m = now.getMonth();
  const candidates = [
    thirdFriday(y, m), thirdFriday(y, m+1),
    vixSettlementForMonth(y, m), vixSettlementForMonth(y, m+1),
  ];
  const seen = new Set();
  candidates.forEach(d=>{
    const dIso = iso(d);
    const off = diffDays(now, d);
    if (off < 0 || off > SPECIALS_WINDOW) return;
    const isOpex = d.getTime() === thirdFriday(d.getFullYear(), d.getMonth()).getTime();
    const type = isOpex ? 'MONTHLY OPEX' : 'VIX SETTLEMENT';
    const key = type+'|'+dIso; if (seen.has(key)) return; seen.add(key);
    addEvent(ul, {
      date: dIso,
      label: isOpex ? 'Monthly OPEX (standard options expiration)' : 'VIX Settlement (VRO)',
      type,
      url: isOpex
        ? 'https://www.cboe.com/tradable_products/expiration_dates/'
        : 'https://www.cboe.com/tradable_products/vix/vix_options/'
    });
  });
  if (!ul.children.length){
    const div = document.createElement('div'); div.style.opacity='.7';
    div.textContent = 'No OPEX or VIX settlement in the next 14 days.';
    ul.appendChild(div);
  }
}

// ---- Economic events (week widgets: days 0..6, plus 7..13 if toggled) ----
function inEconWeekRange(isoDate, showNextWeek){
  const off = diffDays(today(), parseISO(isoDate));
  if (off < 0) return false;
  if (off <= ECON_WEEK_1[1]) return true;
  if (showNextWeek && off >= ECON_WEEK_2[0] && off <= ECON_WEEK_2[1]) return true;
  return false;
}
function buildEcon(econ){
  const ul = document.getElementById('econList'); ul.innerHTML='';
  const showNext = document.getElementById('toggleNextWeek').checked;
  (econ.events || [])
    .filter(ev => inEconWeekRange(ev.date, showNext))
    .sort((a,b)=> new Date(a.date) - new Date(b.date))
    .forEach(ev => addEvent(ul, ev));
  if (!ul.children.length){
    const div = document.createElement('div'); div.style.opacity='.7';
    div.textContent = 'No economic events in the selected week(s).';
    ul.appendChild(div);
  }
}

// ---- Earnings & Sales (3-day toggle vs all) ----
function inWindow(isoDate, limit){
  const off = diffDays(today(), parseISO(isoDate));
  return off >= 0 && off <= limit;
}
function buildEarnings(earn){
  const board = document.getElementById('earningsBoard'); board.innerHTML='';
  const limit3 = document.getElementById('toggleEarnings3d').checked;
  const win = limit3 ? EARNINGS_WINDOW_3D : EARNINGS_ALL;
  const list = Array.isArray(earn.tickers) ? earn.tickers
              : Object.keys(earn).map(sym => ({symbol:sym, name:'', events:earn[sym]}));
  list.forEach(t=>{
    const events = (t.events || [])
      .filter(ev => inWindow(ev.date, win))
      .sort((a,b)=> new Date(a.date) - new Date(b.date));
    if (!events.length) return;
    const sect = document.getElementById('tickerTemplate').content.cloneNode(true);
    sect.querySelector('.ticker-title').textContent = `${t.symbol || ''} — ${t.name || ''}`.trim();
    const ul = sect.querySelector('.event-list');
    events.forEach(ev => addEvent(ul, ev));
    board.appendChild(sect);
  });
  if (!board.children.length){
    const div = document.createElement('div'); div.style.opacity='.7';
    div.textContent = limit3 ? 'No earnings/sales in the next 3 days.' : 'No upcoming earnings/sales found.';
    board.appendChild(div);
  }
}

// ---- Render wiring ----
async function renderAll(){
  try{
    const [econ, earnings] = await Promise.allSettled([getJSON(ECON_JSON), getJSON(EARNINGS_JSON)]);
    buildSpecials();
    if (econ.status === 'fulfilled') buildEcon(econ.value);
    if (earnings.status === 'fulfilled') buildEarnings(earnings.value);
  }catch(e){
    document.body.insertAdjacentHTML('afterbegin', `<div style="opacity:.7;padding:8px">Error: ${e.message}</div>`);
  }
}
function wire(){
  document.getElementById('toggleNextWeek').addEventListener('change', renderAll);
  document.getElementById('toggleEarnings3d').addEventListener('change', renderAll);
}
wire(); renderAll();
