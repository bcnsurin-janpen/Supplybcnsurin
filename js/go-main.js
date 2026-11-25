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

/* ===================== ชั้นข้อมูล (Supabase) ===================== */
function makeDb(sb) {
  const chk = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  return {
    sb,
    async session() { const { data } = await sb.auth.getSession(); return data.session; },
    async isAdmin() { return chk(await sb.rpc('go_is_admin')); },
    async signOut() { await sb.auth.signOut(); },
    async settings() {
      const [cats, labels, kws, rs] = await Promise.all([
        sb.from('go_categories').select('name,sort').order('sort'), sb.from('go_labels').select('name,is_green,sort').order('sort'),
        sb.from('go_context_keywords').select('id,keyword,grp').order('id'), sb.from('go_report_settings').select('*').eq('id', 1).maybeSingle()]);
      return { categories: chk(cats), labels: chk(labels), keywords: chk(kws), report: chk(rs) || {} };
    },
    async items(fy) {
      const out = []; const step = 1000;
      for (let from = 0; ; from += step) {
        const rows = chk(await sb.from('go_items_v').select('*').eq('fiscal_year', fy).order('received_date').order('id').range(from, from + step - 1));
        out.push(...rows); if (rows.length < step) break;
      }
      return out;
    },
    async history() { return chk(await sb.from('go_items_v').select('name,category,brand,model,unit,unit_price,label,vendor,received_date').order('received_date', { ascending: false }).order('id', { ascending: false }).limit(2000)); },
    async createOrder(order, items) {
      const o = chk(await sb.from('go_purchase_orders').insert(order).select('id').single());
      const { error } = await sb.from('go_purchase_items').insert(items.map(it => ({ ...it, order_id: o.id })));
      if (error) { await sb.from('go_purchase_orders').delete().eq('id', o.id); throw new Error(error.message); }
      return o.id;
    },
    async updateItem(id, patch) { chk(await sb.from('go_purchase_items').update(patch).eq('id', id)); },
    async deleteItem(id, orderId, path) {
      chk(await sb.from('go_purchase_items').delete().eq('id', id));
      if (path) await sb.storage.from('go-evidence').remove([path]);
      const left = chk(await sb.from('go_purchase_items').select('id').eq('order_id', orderId).limit(1));
      if (!left.length) await sb.from('go_purchase_orders').delete().eq('id', orderId);
    },
    async upload(file) {
      const ext = file.type === 'application/pdf' ? 'pdf' : 'jpg';
      const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
      chk(await sb.storage.from('go-evidence').upload(path, file, { contentType: file.type, upsert: false }));
      return path;
    },
    async signedUrl(path) { return chk(await sb.storage.from('go-evidence').createSignedUrl(path, 300)).signedUrl; },
    async saveSettings(s) {
      chk(await sb.from('go_report_settings').upsert({ id: 1, ...s.report, updated_at: new Date().toISOString() }));
      chk(await sb.from('go_labels').upsert(s.labels, { onConflict: 'name' }));
      const cur = chk(await sb.from('go_context_keywords').select('id'));
      if (cur.length) chk(await sb.from('go_context_keywords').delete().in('id', cur.map(x => x.id)));
      if (s.keywords.length) chk(await sb.from('go_context_keywords').insert(s.keywords));
    }
  };
}

/* ===================== คำนวณรายงาน (ตรงกับเวอร์ชัน Excel/Google Sheets) ===================== */
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

/* ===================== สถานะแอป ===================== */
let DB, ST, HIST = {}, LIST = [], REPORT = null;

async function init() {
  const factory = window.GO_DB_FACTORY || (() => makeDb(supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY)));
  $('#gateLogin').href = CONFIG.LOGIN_PAGE;
  try {
    DB = factory();
    const ses = await DB.session();
    if (!ses) { $('#gate').hidden = false; return; }
    if (!(await DB.isAdmin())) { $('#gateMsg').textContent = `บัญชี ${ses.user.email} ยังไม่มีสิทธิ์ใช้งานหน้านี้ (ให้ผู้ดูแลเพิ่มอีเมลในตาราง go_admins)`; $('#gate').hidden = false; return; }
    $('#who').textContent = ses.user.email; $('#logout').hidden = false;
    $('#logout').addEventListener('click', async e => { e.preventDefault(); await DB.signOut(); location.href = CONFIG.LOGIN_PAGE; });
    await loadSettings();
    $('#app').hidden = false;
    setupTabs(); setupEntry(); setupList(); setupReport(); setupSummary(); setupSettings();
    if (window.GO_EXT) GO_EXT.setup();
    loadHistory();
  } catch (e) {
    $('#gateMsg').textContent = 'เชื่อมต่อระบบไม่สำเร็จ: ' + e.message; $('#gate').hidden = false;
  }
}
async function loadSettings() { ST = await DB.settings(); }
async function loadHistory() {
  try {
    const rows = await DB.history(); HIST = {}; const vendors = new Set();
    for (const r of rows) { if (!HIST[r.name]) HIST[r.name] = r; if (r.vendor) vendors.add(r.vendor); }
    const dn = $('#dl-names'); dn.textContent = ''; Object.keys(HIST).forEach(n => dn.append(el('option', { value: n })));
    const dv = $('#dl-vendors'); dv.textContent = ''; vendors.forEach(n => dv.append(el('option', { value: n })));
  } catch (e) { /* ไม่กระทบการบันทึก */ }
}
const labelNames = () => ST.labels.map(l => l.name);
const isGreenLabel = n => !!ST.labels.find(l => l.name === n && l.is_green);
const ctxOptions = () => [NOCTX, ...new Set(ST.keywords.map(k => k.grp))];

function setupTabs() {
  $$('nav [role=tab]').forEach(b => b.addEventListener('click', () => {
    $$('nav [role=tab]').forEach(x => x.setAttribute('aria-selected', x === b));
    $$('main section').forEach(s => s.classList.toggle('on', s.id === 'tab-' + b.dataset.tab));
  }));
  $$('.per').forEach(s => fill(s, PERIODS));
  ['#l-fy', '#r-fy', '#s-fy'].forEach(i => $(i).value = defaultFY());
}

/* ---------- บันทึกซื้อเข้า ---------- */
function setupEntry() {
  $('#e-add').addEventListener('click', addItem); $('#e-save').addEventListener('click', saveEntry);
  $('#e-date').value = new Date().toISOString().slice(0, 10);
  addItem();
}
function addItem() {
  const n = $('#tpl-item').content.cloneNode(true); const c = n.querySelector('.item');
  fill($('.f-cat', c), ST.categories.map(x => x.name), '— เลือก —'); fill($('.f-label', c), labelNames(), '— เลือก —'); fill($('.f-ctx', c), ctxOptions(), 'อัตโนมัติ (ตามชื่อ)');
  $('.f-name', c).addEventListener('change', () => {
    const h = HIST[$('.f-name', c).value.trim()]; if (!h) return;
    const set = (cls, v) => { if (v !== null && v !== undefined && v !== '' && !$(cls, c).value) $(cls, c).value = v; };
    set('.f-cat', h.category); set('.f-brand', h.brand); set('.f-model', h.model); set('.f-unit', h.unit); set('.f-price', h.unit_price); set('.f-label', h.label); calcEntry();
  });
  ['.f-qty', '.f-price', '.f-label'].forEach(s => { $(s, c).addEventListener('input', calcEntry); $(s, c).addEventListener('change', calcEntry); });
  $('.rm', c).addEventListener('click', () => { if ($$('#e-items .item').length > 1) { c.remove(); renum(); } });
  $('#e-items').append(c); renum();
}
function renum() { $$('#e-items .item').forEach((c, i) => $('.no', c).textContent = i + 1); $('#e-n').textContent = $$('#e-items .item').length; calcEntry(); }
function calcEntry() {
  let s = 0, g = 0;
  $$('#e-items .item').forEach(c => { const t = (+$('.f-qty', c).value || 0) * (+$('.f-price', c).value || 0); s += t; if (isGreenLabel($('.f-label', c).value)) g += t; });
  $('#e-sum').textContent = fmt(s); $('#e-gsum').textContent = fmt(g);
}
async function shrink(file) {
  if (!file) return null;
  if (!/^image\/|^application\/pdf$/.test(file.type)) throw new Error('หลักฐานต้องเป็นรูปภาพหรือ PDF');
  if (file.type === 'application/pdf') { if (file.size > 8 * 1024 * 1024) throw new Error('ไฟล์ PDF ใหญ่เกิน 8 MB'); return file; }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.85));
    return new File([blob], 'evidence.jpg', { type: 'image/jpeg' });
  } catch { if (file.size > 8 * 1024 * 1024) throw new Error('รูปใหญ่เกิน 8 MB'); return file; }
  finally { URL.revokeObjectURL(url); }
}
async function saveEntry() {
  const btn = $('#e-save'); msg('#e-msg', '');
  const date = $('#e-date').value;
  if (!date) return msg('#e-msg', 'กรุณาใส่วันที่ตรวจรับ', false);
  const cards = $$('#e-items .item'); const items = [];
  try {
    for (const [i, c] of cards.entries()) {
      const v = cls => $(cls, c).value.trim();
      const it = { name: v('.f-name'), category: v('.f-cat'), brand: v('.f-brand'), model: v('.f-model'), qty: +v('.f-qty'), unit: v('.f-unit'),
        unit_price: v('.f-price') === '' ? null : +v('.f-price'), label: v('.f-label'), context_override: v('.f-ctx'), evidence_url: v('.f-url'), note: v('.f-note') };
      if (!it.name && !v('.f-qty')) continue;
      const miss = [];
      if (!it.name) miss.push('รายการ'); if (!it.category) miss.push('ประเภท'); if (!(it.qty > 0)) miss.push('จำนวน'); if (!it.unit) miss.push('หน่วย');
      if (it.unit_price === null || it.unit_price < 0) miss.push('ราคา'); if (!it.label) miss.push('ฉลาก');
      if (it.evidence_url && !safeHttps(it.evidence_url)) miss.push('ลิงก์หลักฐานต้องขึ้นต้น https://');
      if (miss.length) throw new Error(`รายการที่ ${i + 1} ยังขาด/ไม่ถูกต้อง: ${miss.join(', ')}`);
      it._file = await shrink($('.f-file', c).files[0]);
      items.push(it);
    }
    if (!items.length) throw new Error('ยังไม่มีรายการ');
  } catch (e) { return msg('#e-msg', e.message, false); }
  btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
  const uploaded = [];
  try {
    for (const it of items) { if (it._file) { it.evidence_path = await DB.upload(it._file); uploaded.push(it.evidence_path); } delete it._file; }
    await DB.createOrder({ po_no: $('#e-po').value.trim(), received_date: date, vendor: $('#e-vendor').value.trim() }, items);
    msg('#e-msg', `บันทึกแล้ว ${items.length} รายการ (วันที่ ${thDate(date)})`, true);
    $('#e-items').textContent = ''; addItem(); loadHistory();
  } catch (e) { msg('#e-msg', 'บันทึกไม่สำเร็จ: ' + e.message, false); }
  finally { btn.disabled = false; btn.textContent = 'บันทึก'; }
}

/* ---------- รายการซื้อเข้า ---------- */
function setupList() {
  fill($('#l-lab'), labelNames(), 'ทุกฉลาก'); $('#l-per').value = 'ทั้งปี';
  $('#l-go').addEventListener('click', loadList); $('#l-q').addEventListener('input', renderList); $('#l-lab').addEventListener('change', renderList);
  $('#l-per').addEventListener('change', renderList);
}
async function loadList() {
  msg('#l-msg', ''); $('#l-go').disabled = true;
  try { LIST = await DB.items(+$('#l-fy').value); renderList(); }
  catch (e) { msg('#l-msg', e.message, false); } finally { $('#l-go').disabled = false; }
}
function renderList() {
  const q = $('#l-q').value.trim().toLowerCase(), lab = $('#l-lab').value, per = $('#l-per').value;
  const rows = LIST.filter(it => inPeriod(it, per) && (!lab || it.label === lab) &&
    (!q || [it.name, it.brand, it.model, it.vendor, it.po_no].join(' ').toLowerCase().includes(q)));
  const s = summarize(rows);
  $('#l-info').textContent = `${rows.length} รายการ • รวม ${fmt(s.tVal)} บาท • เป็นมิตรฯ ${fmt(s.gVal)} บาท (${fmt(s.orgPctVal)}%)`;
  const tb = $('#l-tbl tbody'); tb.textContent = '';
  for (const it of rows) {
    const ev = it.evidence_path ? el('button', { class: 'btn sm', type: 'button', onclick: () => openEvidence(it.evidence_path) }, 'ดู')
      : (safeHttps(it.evidence_url) ? el('a', { href: safeHttps(it.evidence_url), target: '_blank', rel: 'noopener' }, 'ลิงก์') : el('span', { class: 'muted' }, '—'));
    tb.append(el('tr', {},
      el('td', { class: 'c' }, thDate(it.received_date)), el('td', {}, it.po_no), el('td', {}, it.name, it.note ? el('div', { class: 'small muted' }, it.note) : null),
      el('td', {}, [it.brand, it.model].filter(Boolean).join(' / ')), el('td', { class: 'num' }, `${fmtQ(it.qty)} ${it.unit}`), el('td', { class: 'num' }, fmt(it.total)),
      el('td', {}, el('span', { class: 'badge ' + (it.is_green ? 'g' : it.label === 'รอตรวจสอบ' ? 'w' : '') }, it.label)),
      el('td', {}, it.context_group || ''), el('td', { class: 'c' }, ev),
      el('td', { class: 'c' }, el('button', { class: 'btn sm', type: 'button', onclick: () => editItem(it) }, 'แก้ไข'), ' ',
        el('button', { class: 'btn sm danger', type: 'button', onclick: () => delItem(it) }, 'ลบ'))));
  }
  if (!rows.length) tb.append(el('tr', {}, el('td', { colspan: 10, class: 'c muted' }, LIST.length ? 'ไม่พบรายการตามเงื่อนไข' : 'กด "แสดง" เพื่อโหลดข้อมูล')));
}
async function openEvidence(path) {
  const w = window.open('', '_blank');
  try { const u = await DB.signedUrl(path); if (w) w.location = u; else location.href = u; }
  catch (e) { if (w) w.close(); msg('#l-msg', 'เปิดหลักฐานไม่ได้: ' + e.message, false); }
}
async function delItem(it) {
  if (!confirm(`ลบ "${it.name}" (${fmtQ(it.qty)} ${it.unit}) ใช่ไหม?`)) return;
  try { await DB.deleteItem(it.id, it.order_id, it.evidence_path); LIST = LIST.filter(x => x.id !== it.id); renderList(); msg('#l-msg', 'ลบแล้ว', true); }
  catch (e) { msg('#l-msg', e.message, false); }
}
function editItem(it) {
  const body = $('#dlg-body'); body.textContent = '';
  const f = {};
  const field = (key, label, type, val, opts) => {
    let inp;
    if (opts) { inp = el('select', {}); fill(inp, opts.list, opts.blank); inp.value = val ?? ''; }
    else inp = el('input', { type: type || 'text', step: type === 'number' ? 'any' : null, min: type === 'number' ? '0' : null }), inp.value = val ?? '';
    f[key] = inp; return el('div', {}, el('label', {}, label), inp);
  };
  body.append(el('div', { class: 'grid g2' },
    field('name', 'รายการ *', 'text', it.name), field('category', 'ประเภทวัสดุ *', null, it.category, { list: ST.categories.map(c => c.name) }),
    field('brand', 'ยี่ห้อ', 'text', it.brand), field('model', 'รุ่นสินค้า', 'text', it.model),
    field('qty', 'จำนวน *', 'number', it.qty), field('unit', 'หน่วย *', 'text', it.unit),
    field('unit_price', 'ราคา/หน่วย *', 'number', it.unit_price), field('label', 'ฉลากสิ่งแวดล้อม *', null, it.label, { list: labelNames() }),
    field('context_override', 'กลุ่มบริบท GO', null, it.context_override, { list: ctxOptions(), blank: 'อัตโนมัติ (ตามชื่อ)' }),
    field('evidence_url', 'ลิงก์หลักฐาน (https://)', 'text', it.evidence_url), field('note', 'หมายเหตุ', 'text', it.note),
    el('div', {}, el('label', {}, it.evidence_path ? 'แทนที่รูปหลักฐาน' : 'แนบรูปหลักฐาน'), f.file = el('input', { type: 'file', accept: 'image/*,application/pdf' }))));
  body.append(el('p', { class: 'small muted' }, `ครั้งที่ซื้อ ${it.po_no || '-'} • ${thDate(it.received_date)} • ${it.vendor || ''}`));
  const dlg = $('#dlg');
  $('#dlg-cancel').onclick = () => dlg.close();
  $('#dlg-save').onclick = async () => {
    const p = { name: f.name.value.trim(), category: f.category.value, brand: f.brand.value.trim(), model: f.model.value.trim(), qty: +f.qty.value, unit: f.unit.value.trim(),
      unit_price: +f.unit_price.value, label: f.label.value, context_override: f.context_override.value, evidence_url: f.evidence_url.value.trim(), note: f.note.value.trim() };
    if (!p.name || !p.category || !(p.qty > 0) || !p.unit || !(p.unit_price >= 0) || f.unit_price.value === '' || !p.label) return alert('กรอกช่องที่มี * ให้ครบ');
    if (p.evidence_url && !safeHttps(p.evidence_url)) return alert('ลิงก์หลักฐานต้องขึ้นต้น https://');
    $('#dlg-save').disabled = true;
    try {
      const file = await shrink(f.file.files[0]);
      if (file) { p.evidence_path = await DB.upload(file); }
      await DB.updateItem(it.id, p); dlg.close(); await loadList(); msg('#l-msg', 'แก้ไขแล้ว', true);
    } catch (e) { alert('บันทึกไม่สำเร็จ: ' + e.message); } finally { $('#dlg-save').disabled = false; }
  };
  dlg.showModal();
}

/* ---------- รายงาน 6.1(2) ---------- */
function setupReport() {
  $('#r-per').value = 'ไตรมาสที่ 1';
  $('#r-go').addEventListener('click', makeReport); $('#r-print').addEventListener('click', () => window.print()); $('#r-xlsx').addEventListener('click', exportXlsx);
}
async function makeReport() {
  msg('#r-msg', ''); $('#r-go').disabled = true;
  try {
    const fy = +$('#r-fy').value; if (!(fy > 2500 && fy < 2700)) throw new Error('ปีงบประมาณไม่ถูกต้อง');
    await loadSettings();
    REPORT = buildReport(await DB.items(fy), ST, fy, $('#r-per').value);
    REPORT.extra = window.GO_EXT ? await GO_EXT.loadExtra(fy) : {};
    renderReport(REPORT); $('#r-print').disabled = false; $('#r-xlsx').disabled = false;
    const inc = REPORT.groups.flatMap(g => g.items).filter(it => it.label === 'รอตรวจสอบ').length;
    if (inc) msg('#r-msg', `มี ${inc} รายการฉลาก "รอตรวจสอบ" (ยังไม่นับเป็นมิตรฯ) ตรวจกล่องสินค้าแล้วแก้ในแท็บรายการซื้อเข้าได้`, false);
  } catch (e) { msg('#r-msg', e.message, false); } finally { $('#r-go').disabled = false; }
}
// ผู้ให้ข้อมูลหลายคน: คั่นด้วย ; หรือขึ้นบรรทัดใหม่
function names(v) { const a = String(v || '').split(/[;\n]/).map(x => x.trim()).filter(Boolean); return (a.length ? a : ['']).map(n => el('div', {}, `ชื่อ ${n}`)); }
function ctxGroupsText() { return [...new Set(ST.keywords.map(k => k.grp))].join(' '); }
function renderReport(m) {
  const evidence = it => it.evidence_path ? el('button', { class: 'btn sm noprint-btn', type: 'button', onclick: () => openEvidence(it.evidence_path) }, 'มี (ดู)')
    : safeHttps(it.evidence_url) ? el('a', { href: safeHttps(it.evidence_url), target: '_blank', rel: 'noopener' }, 'ดูหลักฐาน') : '';
  GO.renderForm($('#r-out'), { m, X: GO.buildExtra(m.extra || {}, m.fy, m.period), R: ST.report, keywords: ST.keywords, admin: true, evidence });
}
function periodCode(p) { if (p === 'ทั้งปี') return 'Year'; const q = p.match(/ไตรมาสที่ (\d)/); if (q) return 'Q' + q[1]; return 'M' + String(TMON.indexOf(p) + 1).padStart(2, '0'); }
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('โหลดไลบรารี Excel ไม่สำเร็จ')); document.head.append(s); }); }
async function exportXlsx() {
  if (!REPORT) return;
  const btn = $('#r-xlsx'); btn.disabled = true;
  try {
    if (!window.ExcelJS) await loadScript('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js');
    const blob = await reportXlsxBlob(REPORT, ST, window.ExcelJS);
    const a = el('a', { href: URL.createObjectURL(blob), download: `GreenOffice_6.1(2)_${periodCode(REPORT.period)}_FY${REPORT.fy}.xlsx` }); document.body.append(a); a.click(); a.remove();
  } catch (e) { msg('#r-msg', e.message, false); } finally { btn.disabled = false; }
}
async function reportXlsxBlob(m, st, ExcelJS) {
  const R = st.report, wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('แบบฟอร์ม 6.1(2)', { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '6:7' }, views: [{ state: 'frozen', ySplit: 7 }] });
  const F = { name: 'TH SarabunPSK', size: 16 }, B = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  ws.columns = [5, 44, 14, 16, 18, 9, 10, 9, 10, 14, 13, 14].map(w => ({ width: w }));
  const put = (addr, v, o = {}) => { const c = ws.getCell(addr); c.value = v; c.font = { ...F, bold: !!o.b, color: o.color ? { argb: o.color } : undefined }; c.alignment = { vertical: 'middle', horizontal: o.h, wrapText: o.wrap !== false }; if (o.border) c.border = B; if (o.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.fill } }; if (o.fmt) c.numFmt = o.fmt; return c; };
  const mg = (a, v, o) => { ws.mergeCells(a); put(a.split(':')[0], v, o); };
  mg('A1:L1', 'หมวด 6 ข้อ 6.1 (2) รายงานจัดซื้อจัดจ้าง', { h: 'right' }); mg('A2:L2', 'แบบฟอร์ม 6.1 (2)', { h: 'right' });
  mg('A3:L3', 'แบบรายงานผลการจัดซื้อจัดจ้างสินค้าและบริการที่เป็นมิตรกับสิ่งแวดล้อม', { h: 'center', b: true });
  mg('A4:L4', `หน่วยงาน ${R.agency || ''}   ปีงบประมาณ พ.ศ. ${m.fy}`, { h: 'center' });
  mg('A5:L5', `1. รายการจัดซื้อสินค้าในช่วงเดือน ${m.periodText} (${m.period} ปีงบประมาณ พ.ศ. ${m.fy})`, { h: 'left' });
  const H = { h: 'center', b: true, border: true, fill: 'FFD9E2F3' };
  for (const c of 'ABCDEFGHIJKL') { put(c + '6', null, H); put(c + '7', null, H); }
  [['A6:A7', 'ที่'], ['B6:B7', 'รายการ'], ['C6:C7', 'ยี่ห้อ'], ['D6:D7', 'รุ่นสินค้า'], ['F6:I6', 'ปริมาณสินค้า (หน่วย)'], ['J6:K6', 'มูลค่าสินค้า (บาท)'], ['F7:G7', 'ทั้งหมด'], ['H7:I7', 'เป็นมิตรฯ']].forEach(([a, v]) => mg(a, v, H));
  put('E6', 'ความเป็นมิตร', H); put('E7', 'กับสิ่งแวดล้อม', H); put('J7', 'ทั้งหมด', H); put('K7', 'เป็นมิตรฯ', H); put('L6', 'เอกสาร/หลักฐาน', H); put('L7', 'รูปภาพ', H);
  let r = 8, n = 0;
  for (const g of m.groups) {
    for (const c of 'ABCDEFGHIJKL') put(c + r, null, { border: true, fill: 'FFE6ECF2' });
    ws.mergeCells(`B${r}:L${r}`); put('B' + r, g.cat, { b: true, border: true, fill: 'FFE6ECF2' }); r++;
    for (const it of g.items) {
      n++; const gr = it.is_green, G = gr ? '1E6B30' : undefined; const url = safeHttps(it.evidence_url);
      const vals = [n, it.name, it.brand, it.model, gr ? it.label : '', +it.qty, it.unit, gr ? +it.qty : '', gr ? it.unit : '', +it.total, gr ? +it.total : '',
        it.evidence_path ? 'มี (ในระบบ)' : url ? { text: 'ดูหลักฐาน', hyperlink: url } : ''];
      vals.forEach((v, i) => put(String.fromCharCode(65 + i) + r, v, { border: true, h: [0, 4, 5, 6, 7, 8, 11].includes(i) ? 'center' : i >= 9 ? 'right' : 'left', color: i >= 4 && i <= 10 ? G : undefined, fmt: i === 9 || i === 10 ? '#,##0.00' : i === 5 || i === 7 ? '#,##0.##' : undefined }));
      r++;
    }
  }
  if (!n) { ws.mergeCells(`A${r}:L${r}`); put('A' + r, '— ไม่มีการจัดซื้อในช่วงนี้ —', { h: 'center', border: true }); r++; }
  r++;
  const s = m.sum;
  const rows = [['สรุปผล', 'ปริมาณ (หน่วย)', 'มูลค่า (บาท)', 'h'], ['รวมการซื้อสินค้าที่เป็นมิตรกับสิ่งแวดล้อม', s.gQty, s.gVal],
    [`รวมการซื้อสินค้าของสำนักงานภายใต้บริบทการขอการรับรองสำนักงานสีเขียว (กลุ่มสินค้า: ${ctxGroupsText()})`, s.cQty, s.cVal],
    ['สัดส่วนการซื้อสินค้าที่เป็นมิตรกับสิ่งแวดล้อมของสำนักงานที่อยู่ภายใต้บริบทการขอการรับรองสำนักงานสีเขียว (ร้อยละ)', r2(s.ctxPctQty), r2(s.ctxPctVal), 'p'],
    ['รวมการซื้อสินค้าทั้งหมดขององค์กร', s.tQty, s.tVal], ['สัดส่วนการซื้อสินค้าที่เป็นมิตรกับสิ่งแวดล้อมขององค์กร (ร้อยละ)', r2(s.orgPctQty), r2(s.orgPctVal), 'p']];
  for (const [lab, a, b, k] of rows) {
    for (const c of 'ABCDEFGHIJK') put(c + r, null, { border: true });
    ws.mergeCells(`A${r}:E${r}`); ws.mergeCells(`F${r}:I${r}`); ws.mergeCells(`J${r}:K${r}`);
    const o = { border: true, b: k === 'h', h: 'center', fmt: k === 'h' ? undefined : k === 'p' ? '0.00' : '#,##0.00' };
    put('A' + r, lab, { border: true, b: k === 'h', h: k === 'h' ? 'center' : 'left' }); put('F' + r, a, o); put('J' + r, b, o);
    if (k !== 'h') ws.getRow(r).height = 48; r++;
  }
  r++;
  r = GO_EXT.xlsxExtra(ws, put, mg, r, m, m.extra, R);
  const para = (t, ind) => { ws.mergeCells(`${ind ? 'B' : 'A'}${r}:K${r}`); put((ind ? 'B' : 'A') + r, t, { h: 'left' }); if (ind) ws.getRow(r).height = 42; r++; };
  para('6. ปัญหาและอุปสรรคในการจัดซื้อจัดจ้างสินค้าและบริการที่เป็นมิตรกับสิ่งแวดล้อมมาใช้'); (R.problems || []).forEach((t, i) => para(`${i + 1}) ${t}`, true));
  para('7. ข้อเสนอแนะเพิ่มเติมเกี่ยวกับการจัดซื้อจัดจ้าง'); (R.suggestions || []).forEach((t, i) => para(`${i + 1}) ${t}`, true));
  r++;
  r = GO_EXT.xlsxFooter(put, r, R);
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/* ---------- สรุปรายไตรมาส/เดือน ---------- */
function setupSummary() { $('#s-go').addEventListener('click', loadSummary); }
async function loadSummary() {
  msg('#s-msg', ''); $('#s-go').disabled = true;
  try {
    const fy = +$('#s-fy').value; await loadSettings(); const items = await DB.items(fy);
    const out = $('#s-out'); out.textContent = '';
    const all = summarize(items);
    out.append(el('div', { class: 'kpis' },
      el('div', { class: 'kpi' }, el('span', {}, 'มูลค่าจัดซื้อทั้งปี'), el('b', {}, fmt(all.tVal)), el('span', {}, `${all.n} รายการ`)),
      el('div', { class: 'kpi' }, el('span', {}, 'เป็นมิตรกับสิ่งแวดล้อม'), el('b', { class: 'green' }, fmt(all.gVal)), el('span', {}, `${all.ng} รายการ`)),
      el('div', { class: 'kpi' }, el('span', {}, 'ร้อยละ (ทั้งองค์กร)'), el('b', {}, fmt(all.orgPctVal) + '%')),
      el('div', { class: 'kpi' }, el('span', {}, 'ร้อยละ (ในบริบท Green Office)'), el('b', {}, fmt(all.ctxPctVal) + '%'))));
    const table = (title, groups) => {
      const t = el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, ...['ช่วง', 'รายการ', 'เป็นมิตรฯ', 'มูลค่าทั้งหมด', 'มูลค่าเป็นมิตรฯ', 'ร้อยละ (องค์กร)', '', 'มูลค่าในบริบท', 'ร้อยละ (ในบริบท)'].map(h => el('th', {}, h)))));
      const tb = el('tbody', {});
      for (const [lab, arr] of groups) {
        const s = summarize(arr);
        tb.append(el('tr', { style: lab === 'รวมทั้งปี' ? 'font-weight:600;background:#F4F6F9' : '' }, el('td', {}, lab), el('td', { class: 'num' }, s.n), el('td', { class: 'num' }, s.ng),
          el('td', { class: 'num' }, fmt(s.tVal)), el('td', { class: 'num green' }, fmt(s.gVal)), el('td', { class: 'num' }, fmt(s.orgPctVal) + '%'),
          el('td', {}, el('div', { class: 'bar', title: fmt(s.orgPctVal) + '%' }, el('i', { style: `width:${Math.min(100, s.orgPctVal).toFixed(1)}%` }))),
          el('td', { class: 'num' }, fmt(s.cVal)), el('td', { class: 'num' }, fmt(s.ctxPctVal) + '%')));
      }
      t.append(tb); return el('div', { class: 'card' }, el('h2', {}, title), el('div', { class: 'scroll' }, t));
    };
    out.append(table(`รายไตรมาส ปีงบประมาณ ${fy}`, [1, 2, 3, 4].map(q => [`ไตรมาสที่ ${q}`, items.filter(i => i.fiscal_quarter === q)]).concat([['รวมทั้งปี', items]])));
    out.append(table('รายเดือน', [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(mo => [`${TMON[mo-1]} ${fy + (mo >= 10 ? -1 : 0)}`, items.filter(i => i.month_no === mo)]).concat([['รวมทั้งปี', items]])));
  } catch (e) { msg('#s-msg', e.message, false); } finally { $('#s-go').disabled = false; }
}

/* ---------- ตั้งค่า ---------- */
function setupSettings() { renderSettings(); $('#st-addlab').addEventListener('click', addLabel); $('#st-addkw').addEventListener('click', () => kwRow('', '')); $('#st-save').addEventListener('click', saveSettings); }
function renderSettings() {
  const R = ST.report || {};
  for (const k of ['agency', 'person', 'position', 'tel', 'fax']) $('#st-' + k).value = R[k] || '';
  $('#st-prob').value = (R.problems || []).join('\n'); $('#st-sug').value = (R.suggestions || []).join('\n');
  const lb = $('#st-labels tbody'); lb.textContent = '';
  ST.labels.forEach(l => labelRow(l.name, l.is_green));
  $('#st-kw tbody').textContent = ''; ST.keywords.forEach(k => kwRow(k.keyword, k.grp));
  if (window.GO_EXT) GO_EXT.renderSettingsExtra(R);
}
function labelRow(name, green) {
  const cb = el('input', { type: 'checkbox', style: 'width:auto', 'aria-label': 'นับเป็นมิตรฯ ' + name }); cb.checked = !!green;
  $('#st-labels tbody').append(el('tr', { 'data-name': name }, el('td', {}, name), el('td', { class: 'c' }, cb)));
}
function addLabel() { const v = $('#st-newlab').value.trim(); if (!v || ST.labels.find(l => l.name === v) || $(`#st-labels tr[data-name="${CSS.escape(v)}"]`)) return; labelRow(v, false); $('#st-newlab').value = ''; }
function kwRow(k, g) {
  const a = el('input', { value: k, 'aria-label': 'คำในชื่อรายการ' }), b = el('input', { value: g, 'aria-label': 'กลุ่มสินค้า' });
  const tr = el('tr', {}, el('td', {}, a), el('td', {}, b), el('td', { class: 'c' }, el('button', { class: 'btn sm danger', type: 'button', onclick: () => tr.remove() }, 'ลบ')));
  $('#st-kw tbody').append(tr);
}
async function saveSettings() {
  const lines = id => $(id).value.split('\n').map(s => s.trim()).filter(Boolean);
  const report = { agency: $('#st-agency').value.trim(), person: $('#st-person').value.trim(), position: $('#st-position').value.trim(), tel: $('#st-tel').value.trim(), fax: $('#st-fax').value.trim(),
    problems: lines('#st-prob'), suggestions: lines('#st-sug'), ...GO_EXT.readSettingsExtra() };
  const labels = $$('#st-labels tbody tr').map((tr, i) => ({ name: tr.dataset.name, is_green: $('input', tr).checked, sort: i + 1 }));
  const keywords = $$('#st-kw tbody tr').map(tr => { const [a, b] = $$('input', tr); return { keyword: a.value.trim(), grp: b.value.trim() }; }).filter(k => k.keyword && k.grp);
  const dup = keywords.map(k => k.keyword).find((k, i, arr) => arr.indexOf(k) !== i);
  if (dup) return msg('#st-msg', `คำ "${dup}" ซ้ำ`, false);
  $('#st-save').disabled = true;
  try { await DB.saveSettings({ report, labels, keywords }); await loadSettings(); renderSettings(); msg('#st-msg', 'บันทึกการตั้งค่าแล้ว (รายงานที่สร้างใหม่จะใช้ค่านี้)', true); }
  catch (e) { msg('#st-msg', e.message, false); } finally { $('#st-save').disabled = false; }
}

document.addEventListener('DOMContentLoaded', init);
