const CONFIG = window.GO_CONFIG;
const TMON = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const PERIODS = ['ไตรมาสที่ 1','ไตรมาสที่ 2','ไตรมาสที่ 3','ไตรมาสที่ 4','ทั้งปี', ...[10,11,12,1,2,3,4,5,6,7,8,9].map(m => TMON[m-1])];
const NOCTX = 'ไม่อยู่ในบริบท';
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
const fmt = (n, d = 2) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtQ = n => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const r2 = n => Math.round((Number(n) + 1e-9) * 100) / 100;
const thDate = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return `${d} ${TMON[m-1].slice(0,3)}. ${String(y + 543).slice(2)}`; };
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v); }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k instanceof Node ? k : String(k));
  return e;
}
function msg(id, text, ok) { const m = $(id); m.textContent = text; m.className = 'msg ' + (text ? (ok ? 'ok' : 'err') : ''); }
function fill(sel, arr, blank) { sel.textContent = ''; if (blank !== undefined) sel.append(el('option', { value: '' }, blank)); arr.forEach(v => sel.append(el('option', { value: v }, v))); }
function defaultFY() { const d = new Date(); return d.getFullYear() + 543 + (d.getMonth() >= 9 ? 1 : 0); }
function safeHttps(u) { try { const x = new URL(u); return x.protocol === 'https:' ? x.href : ''; } catch { return ''; } }
function inPeriod(it, period) {
  return period === 'ทั้งปี' || `ไตรมาสที่ ${it.fiscal_quarter}` === period || TMON[it.month_no - 1] === period;
}
function periodText(fy, period) {
  const mt = (m, off) => `${TMON[m-1]} ${fy + off}`;
  const map = { 'ทั้งปี': `${mt(10,-1)} ถึง ${mt(9,0)}`, 'ไตรมาสที่ 1': `${mt(10,-1)} ถึง ${mt(12,-1)}`, 'ไตรมาสที่ 2': `${mt(1,0)} ถึง ${mt(3,0)}`,
    'ไตรมาสที่ 3': `${mt(4,0)} ถึง ${mt(6,0)}`, 'ไตรมาสที่ 4': `${mt(7,0)} ถึง ${mt(9,0)}` };
  if (map[period]) return map[period];
  const m = TMON.indexOf(period) + 1; return mt(m, m >= 10 ? -1 : 0);
}
function summarize(sel) {
  const s = { n: sel.length, ng: 0, gQty: 0, gVal: 0, cQty: 0, cVal: 0, cgQty: 0, cgVal: 0, tQty: 0, tVal: 0 };
  for (const it of sel) {
    const q = +it.qty, v = +it.total; s.tQty += q; s.tVal += v;
    if (it.is_green) { s.ng++; s.gQty += q; s.gVal += v; }
    if (it.context_group) { s.cQty += q; s.cVal += v; if (it.is_green) { s.cgQty += q; s.cgVal += v; } }
  }
  for (const k of ['gQty','gVal','cQty','cVal','cgQty','cgVal','tQty','tVal']) s[k] = r2(s[k]);
  s.ctxPctQty = s.cQty ? s.cgQty / s.cQty * 100 : 0; s.ctxPctVal = s.cVal ? s.cgVal / s.cVal * 100 : 0;
  s.orgPctQty = s.tQty ? s.gQty / s.tQty * 100 : 0; s.orgPctVal = s.tVal ? s.gVal / s.tVal * 100 : 0;
  return s;
}
function buildReport(items, st, fy, period) {
  const sel = items.filter(it => it.fiscal_year === fy && inPeriod(it, period));
  const order = st.categories.map(c => c.name);
  sel.forEach(it => { if (!order.includes(it.category)) order.push(it.category); });
  const groups = order.map(c => ({ cat: c, items: sel.filter(it => it.category === c) })).filter(g => g.items.length);
  return { fy, period, periodText: periodText(fy, period), groups, sum: summarize(sel) };
}

let DATA = null, DFY = null;
const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
async function loadData(fy) {
  if (!(fy > 2500 && fy < 2700)) throw new Error('ปีงบประมาณไม่ถูกต้อง');
  if (DATA && DFY === fy) return DATA;
  const { data, error } = await sb.rpc('go_public_report', { p_fy: fy });
  if (error) throw new Error(error.message);
  DATA = data; DFY = fy; return data;
}
async function showDashboard() {
  msg('#r-msg', ''); $('#r-go').disabled = true;
  try {
    const fy = +$('#r-fy').value, d = await loadData(fy);
    GO.renderDashboard($('#d-out'), { items: d.items || [], X: d, fy });
  } catch (e) { msg('#r-msg', 'โหลดข้อมูลไม่สำเร็จ: ' + e.message, false); } finally { $('#r-go').disabled = false; }
}
async function makeReport() {
  msg('#r-msg', ''); $('#r-go').disabled = true;
  try {
    const fy = +$('#r-fy').value, d = await loadData(fy), per = $('#r-per').value;
    const ST = { categories: d.categories || [], keywords: d.keywords || [], report: d.report || {} };
    const m = buildReport(d.items || [], ST, fy, per);
    GO.renderForm($('#r-out'), { m, X: GO.buildExtra(d, fy, per), R: ST.report, keywords: ST.keywords, admin: false });
    $('#r-print').disabled = false;
  } catch (e) { msg('#r-msg', 'สร้างรายงานไม่สำเร็จ: ' + e.message, false); } finally { $('#r-go').disabled = false; }
}
function showTab(id) {
  $$('nav [role=tab]').forEach(x => x.setAttribute('aria-selected', x.dataset.tab === id));
  $$('main section').forEach(s => s.classList.toggle('on', s.id === 'tab-' + id));
  $('#r-perbox').hidden = id === 'dash';
}
$$('nav [role=tab]').forEach(b => b.addEventListener('click', () => { showTab(b.dataset.tab); (b.dataset.tab === 'dash' ? showDashboard : makeReport)(); }));
fill($('#r-per'), PERIODS); $('#r-per').value = 'ทั้งปี'; $('#r-fy').value = defaultFY();
$('#r-go').addEventListener('click', () => ($('#tab-dash').classList.contains('on') ? showDashboard : makeReport)());
$('#r-print').addEventListener('click', () => window.print());
showDashboard();
