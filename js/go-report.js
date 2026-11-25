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

let ST, REPORT = null;
const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
// ผู้ให้ข้อมูลหลายคน: คั่นด้วย ; หรือขึ้นบรรทัดใหม่
function names(v) { const a = String(v || '').split(/[;\n]/).map(x => x.trim()).filter(Boolean); return (a.length ? a : ['']).map(n => el('div', {}, `ชื่อ ${n}`)); }
function ctxGroupsText() { return [...new Set(ST.keywords.map(k => k.grp))].join(' '); }
function renderReport(m) {
  const R = ST.report, out = $('#r-out'); out.textContent = '';
  out.append(el('div', { class: 'r' }, 'หมวด 6 ข้อ 6.1 (2) รายงานจัดซื้อจัดจ้าง'), el('div', { class: 'r' }, 'แบบฟอร์ม 6.1 (2)'),
    el('div', { class: 't' }, 'แบบรายงานผลการจัดซื้อจัดจ้างสินค้าและบริการที่เป็นมิตรกับสิ่งแวดล้อม'),
    el('div', { class: 'c' }, `หน่วยงาน ${R.agency || ''}   ปีงบประมาณ พ.ศ. ${m.fy}`),
    el('div', {}, `1. รายการจัดซื้อสินค้าในช่วงเดือน ${m.periodText} (${m.period} ปีงบประมาณ พ.ศ. ${m.fy})`));
  const t = el('table', {});
  t.append(el('thead', {},
    el('tr', {}, el('th', { rowspan: 2 }, 'ที่'), el('th', { rowspan: 2 }, 'รายการ'), el('th', { rowspan: 2 }, 'ยี่ห้อ'), el('th', { rowspan: 2 }, 'รุ่นสินค้า'),
      el('th', {}, 'ความเป็นมิตร'), el('th', { colspan: 4 }, 'ปริมาณสินค้า (หน่วย)'), el('th', { colspan: 2 }, 'มูลค่าสินค้า (บาท)'), el('th', {}, 'เอกสาร/หลักฐาน')),
    el('tr', {}, el('th', {}, 'กับสิ่งแวดล้อม'), el('th', { colspan: 2 }, 'ทั้งหมด'), el('th', { colspan: 2 }, 'เป็นมิตรฯ'), el('th', {}, 'ทั้งหมด'), el('th', {}, 'เป็นมิตรฯ'), el('th', {}, 'รูปภาพ'))));
  const tb = el('tbody', {}); let n = 0;
  for (const g of m.groups) {
    tb.append(el('tr', { class: 'cat' }, el('td', {}), el('td', { colspan: 11 }, g.cat)));
    for (const it of g.items) {
      n++; const gr = it.is_green;
      const ev = '';
      tb.append(el('tr', {}, el('td', { class: 'c' }, n), el('td', {}, it.name), el('td', {}, it.brand), el('td', {}, it.model),
        el('td', { class: 'c g' }, gr ? it.label : ''), el('td', { class: 'num' }, fmtQ(it.qty)), el('td', { class: 'c' }, it.unit),
        el('td', { class: 'num g' }, gr ? fmtQ(it.qty) : ''), el('td', { class: 'c g' }, gr ? it.unit : ''),
        el('td', { class: 'num' }, fmt(it.total)), el('td', { class: 'num g' }, gr ? fmt(it.total) : ''), el('td', { class: 'c' }, ev)));
    }
  }
  if (!n) tb.append(el('tr', {}, el('td', { colspan: 12, class: 'c' }, '— ไม่มีการจัดซื้อในช่วงนี้ —')));
  t.append(tb); out.append(t);
  const s = m.sum, st = el('table', { class: 'sum' });
  const srow = (lab, a, b, pct) => el('tr', {}, el('td', { style: 'width:52%' }, lab), el('td', { class: 'c' }, pct ? fmt(a) : fmt(a)), el('td', { class: 'c' }, fmt(b)));
  st.append(el('thead', {}, el('tr', {}, el('th', {}, 'สรุปผล'), el('th', {}, 'ปริมาณ (หน่วย)'), el('th', {}, 'มูลค่า (บาท)'))),
    el('tbody', {}, srow('รวมการซื้อสินค้าที่เป็นมิตรกับสิ่งแวดล้อม', s.gQty, s.gVal),
      srow(`รวมการซื้อสินค้าของสำนักงานภายใต้บริบทการขอการรับรองสำนักงานสีเขียว (กลุ่มสินค้า: ${ctxGroupsText()})`, s.cQty, s.cVal),
      srow('สัดส่วนการซื้อสินค้าที่เป็นมิตรกับสิ่งแวดล้อมของสำนักงานที่อยู่ภายใต้บริบทการขอการรับรองสำนักงานสีเขียว (ร้อยละ)', s.ctxPctQty, s.ctxPctVal, true),
      srow('รวมการซื้อสินค้าทั้งหมดขององค์กร', s.tQty, s.tVal),
      srow('สัดส่วนการซื้อสินค้าที่เป็นมิตรกับสิ่งแวดล้อมขององค์กร (ร้อยละ)', s.orgPctQty, s.orgPctVal, true)));
  out.append(el('div', { class: 'blk' }, st));
  const list = (title, arr) => el('div', { class: 'blk' }, el('div', {}, title), ...(arr || []).map((t, i) => el('p', {}, `${i + 1}) ${t}`)));
  out.append(list('6. ปัญหาและอุปสรรคในการจัดซื้อจัดจ้างสินค้าและบริการที่เป็นมิตรกับสิ่งแวดล้อมมาใช้', R.problems), list('7. ข้อเสนอแนะเพิ่มเติมเกี่ยวกับการจัดซื้อจัดจ้าง', R.suggestions));
  out.append(el('div', { class: 'blk', style: 'margin-left:28px' }, el('b', {}, 'ผู้ให้ข้อมูล'), ...names(R.person), el('div', {}, `ตำแหน่ง ${R.position || ''}`),
    el('div', {}, `หน่วยงาน ${R.agency || ''}`), el('div', {}, `โทรศัพท์ ${R.tel || ''}`), el('div', {}, `โทรสาร ${R.fax || ''}`)));
}
async function makeReport() {
  msg('#r-msg', ''); $('#r-go').disabled = true;
  try {
    const fy = +$('#r-fy').value; if (!(fy > 2500 && fy < 2700)) throw new Error('ปีงบประมาณไม่ถูกต้อง');
    const { data, error } = await sb.rpc('go_public_report', { p_fy: fy });
    if (error) throw new Error(error.message);
    ST = { categories: data.categories || [], keywords: data.keywords || [], report: data.report || {} };
    REPORT = buildReport(data.items || [], ST, fy, $('#r-per').value);
    renderReport(REPORT); $('#r-print').disabled = false;
  } catch (e) { msg('#r-msg', 'สร้างรายงานไม่สำเร็จ: ' + e.message, false); } finally { $('#r-go').disabled = false; }
}
fill($('#r-per'), PERIODS); $('#r-per').value = 'ทั้งปี'; $('#r-fy').value = defaultFY();
$('#r-go').addEventListener('click', makeReport); $('#r-print').addEventListener('click', () => window.print());
