/* Green Office — ส่วนเสริมหน้าบันทึกข้อมูล: ข้อ 2-5, ภาพรวม, รายชื่อผู้ให้ข้อมูล, Excel ข้อ 2-5
   โหลดหลัง go-main.js และ go-core.js (ใช้ DB, ST, el, fmt, msg, fill ฯลฯ จาก go-main.js) */
window.GO_EXT = (function () {
  const chk = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const client = () => DB.sb;
  const todayIso = () => new Date().toISOString().slice(0, 10);

  async function loadExtra(fy) {
    const [sv, ht, cl, cp] = await Promise.all([
      client().from('go_services_v').select('*').eq('fiscal_year', fy).order('service_month').order('id'),
      client().from('go_hotels_v').select('*').eq('fiscal_year', fy).order('event_date').order('id'),
      client().from('go_cleaning').select('*').eq('fiscal_year', fy).order('id'),
      client().from('go_copier').select('*').eq('fiscal_year', fy).maybeSingle()]);
    return { services: chk(sv), hotels: chk(ht), cleaning: chk(cl).map((r, i) => ({ ...r, seq: i + 1 })), copier: chk(cp) };
  }

  /* ---------- ตัวสร้างหน้าบันทึกแบบตาราง (ใช้กับข้อ 2, 3, 4) ---------- */
  function crudSection(id, title, hint, spec) {
    const sec = el('section', { id: 'tab-' + id });
    const fyIn = el('input', { type: 'number', min: 2560, max: 2600, style: 'width:110px', 'aria-label': 'ปีงบประมาณ' });
    fyIn.value = defaultFY();
    const inputs = {}, form = el('div', { class: 'grid g3' });
    for (const f of spec.fields) {
      const inp = f.type === 'select' ? el('select', {}) : el('input', { type: f.type || 'text', step: f.step, min: f.min });
      if (f.type === 'select') fill(inp, f.opts(), '— เลือก —');
      inputs[f.k] = inp; form.append(el('div', {}, el('label', {}, f.label + (f.req ? ' *' : '')), inp));
    }
    const msgId = 'm-' + id, pmId = 'pm-' + id, listBox = el('div', { class: 'scroll' }), totBox = el('div', { class: 'tot' });
    let editing = null, rows = [];
    const reset = () => { editing = null; for (const f of spec.fields) { const v = f.def ? f.def() : ''; inputs[f.k].value = v; } saveBtn.textContent = 'บันทึก'; };
    const saveBtn = el('button', { class: 'btn pri', type: 'button' }, 'บันทึก');
    const cancelBtn = el('button', { class: 'btn', type: 'button' }, 'ยกเลิก');
    const modal = el('div', { class: 'modal', hidden: true, role: 'dialog', 'aria-modal': 'true' });
    const openM = () => { modal.hidden = false; }, closeM = () => { modal.hidden = true; reset(); };
    async function load() {
      try {
        const fy = +fyIn.value; if (!(fy > 2500 && fy < 2700)) throw new Error('ปีงบประมาณไม่ถูกต้อง');
        rows = chk(await client().from(spec.view).select('*').eq('fiscal_year', fy).order(spec.order).order('id'));
        draw();
      } catch (e) { msg('#' + pmId, e.message + ' (ถ้าข้อความบอกว่าไม่พบตาราง ให้รัน SQL ไฟล์ 04 ใน Supabase ก่อน)', false); }
    }
    function draw() {
      const t = el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, ...spec.cols.map(c => el('th', {}, c.h)), el('th', {}, ''))));
      const tb = el('tbody', {});
      if (!rows.length) tb.append(el('tr', {}, el('td', { colspan: spec.cols.length + 1, class: 'c muted' }, 'ยังไม่มีรายการ')));
      for (const r of rows) tb.append(el('tr', {}, ...spec.cols.map(c => el('td', { class: c.cls || '' }, c.f(r))),
        el('td', { style: 'white-space:nowrap' },
          el('button', { class: 'btn sm', type: 'button', onclick: () => edit(r) }, 'แก้ไข'), ' ',
          el('button', { class: 'btn sm danger', type: 'button', onclick: () => del(r) }, 'ลบ'))));
      t.append(tb); listBox.textContent = ''; listBox.append(t);
      totBox.textContent = ''; totBox.append(...spec.totals(rows).map(x => el('span', {}, x)));
    }
    function edit(r) {
      editing = r.id;
      for (const f of spec.fields) inputs[f.k].value = f.toInput ? f.toInput(r[f.k]) : (r[f.k] ?? '');
      saveBtn.textContent = 'บันทึกการแก้ไข'; openM();
    }
    async function del(r) {
      if (!confirm('ลบรายการนี้?')) return;
      try { chk(await client().from(spec.table).delete().eq('id', r.id)); msg('#' + pmId, 'ลบแล้ว', true); await load(); } catch (e) { msg('#' + pmId, e.message, false); }
    }
    saveBtn.addEventListener('click', async () => {
      const row = {};
      try {
        for (const f of spec.fields) {
          let v = inputs[f.k].value.trim ? inputs[f.k].value.trim() : inputs[f.k].value;
          if (f.req && v === '') throw new Error('กรุณากรอก: ' + f.label);
          if (f.type === 'number') v = v === '' ? 0 : Number(v);
          if (f.fromInput) v = f.fromInput(v);
          row[f.k] = v;
        }
        saveBtn.disabled = true;
        if (editing) chk(await client().from(spec.table).update(row).eq('id', editing));
        else chk(await client().from(spec.table).insert(row));
        const keepFy = spec.fyFromRow ? spec.fyFromRow(row) : null; if (keepFy) fyIn.value = keepFy;
        closeM(); msg('#' + pmId, 'บันทึกแล้ว', true); await load();
      } catch (e) { msg('#' + msgId, e.message, false); } finally { saveBtn.disabled = false; }
    });
    cancelBtn.addEventListener('click', closeM);
    modal.addEventListener('click', e => { if (e.target === modal) closeM(); });
    fyIn.addEventListener('change', load);
    const formMsg = el('div', { id: msgId, class: 'msg', role: 'status' });
    modal.append(el('div', { class: 'modalbox' }, el('h2', {}, title), el('div', { class: 'muted small' }, hint), form, formMsg,
      el('div', { class: 'row', style: 'margin-top:12px;justify-content:flex-end' }, cancelBtn, saveBtn)));
    const addBtn = el('button', { class: 'btn pri', type: 'button' }, '+ เพิ่มรายการ');
    addBtn.addEventListener('click', () => { reset(); openM(); });
    sec.append(el('div', { class: 'card' }, el('div', { class: 'toolbar' }, el('div', {}, el('h2', {}, title), el('div', { class: 'muted small' }, hint)), addBtn),
      el('div', { class: 'row' }, el('div', {}, el('label', {}, 'ปีงบประมาณที่แสดง'), fyIn), el('button', { class: 'btn', type: 'button', onclick: load }, 'แสดง')),
      el('div', { id: pmId, class: 'msg', role: 'status' }), listBox, totBox), modal);
    reset(); setTimeout(load, 0);
    return sec;
  }

  const labelOpts = () => ST.labels.map(l => l.name);
  const monthIn = v => (v ? String(v).slice(0, 7) : '');
  const SERVICES = {
    table: 'go_services', view: 'go_services_v', order: 'service_month',
    fields: [
      { k: 'service_month', label: 'เดือนที่จ้าง', type: 'month', req: true, def: () => todayIso().slice(0, 7), toInput: monthIn, fromInput: v => v + '-01' },
      { k: 'job_type', label: 'ประเภทงานจ้าง', req: true },
      { k: 'company', label: 'บริษัท / หน่วยงาน / ผู้รับจ้าง' },
      { k: 'value', label: 'มูลค่าการจ้าง (บาท)', type: 'number', step: 'any', min: 0, req: true },
      { k: 'label', label: 'ฉลากสิ่งแวดล้อม', type: 'select', opts: labelOpts, req: true, def: () => 'ไม่มี' },
      { k: 'note', label: 'หมายเหตุ' }],
    cols: [{ h: 'เดือน', f: r => GO.monthLabel(r.fiscal_year, r.month_no) }, { h: 'ประเภทงานจ้าง', f: r => r.job_type }, { h: 'บริษัท/ผู้รับจ้าง', f: r => r.company },
      { h: 'ฉลาก', f: r => r.label, cls: 'c' }, { h: 'มูลค่า (บาท)', f: r => fmt(r.value), cls: 'num' }],
    totals: rows => [`รวม ${rows.length} รายการ • ${fmt(GO.sum(rows, 'value'))} บาท`, `เป็นมิตรฯ ${fmt(GO.sum(rows.filter(r => r.is_green), 'value'))} บาท`]
  };
  const CLEANING = {
    table: 'go_cleaning', view: 'go_cleaning', order: 'id',
    fields: [
      { k: 'fiscal_year', label: 'ปีงบประมาณ', type: 'number', req: true, def: () => String(defaultFY()) },
      { k: 'name', label: 'ชื่อ-สกุล / ผู้รับจ้าง', req: true },
      { k: 'period_text', label: 'ช่วงเวลาจ้าง เช่น (ต.ค.68-ก.ย.69)' },
      { k: 'budget', label: 'งบประมาณที่ใช้ (บาท)', type: 'number', step: 'any', min: 0, req: true }],
    cols: [{ h: 'ชื่อ-สกุล / ผู้รับจ้าง', f: r => r.name }, { h: 'ช่วงเวลา', f: r => r.period_text }, { h: 'งบประมาณ (บาท)', f: r => fmt(r.budget), cls: 'num' }],
    totals: rows => [`รวมเป็นเงิน ${fmt(GO.sum(rows, 'budget'))} บาท`], fyFromRow: r => r.fiscal_year
  };
  const HOTELS = {
    table: 'go_hotels', view: 'go_hotels_v', order: 'event_date',
    fields: [
      { k: 'event_date', label: 'วันที่จัดงาน', type: 'date', req: true, def: todayIso },
      { k: 'project', label: 'รายการจัดประชุม/สัมมนา/อบรม', req: true },
      { k: 'venue', label: 'สถานที่จัดงาน / โรงแรม' },
      { k: 'attendees', label: 'จำนวนผู้เข้าร่วม (คน)', type: 'number', min: 0 },
      { k: 'days', label: 'ระยะเวลา (วัน)', type: 'number', step: 'any', min: 0 },
      { k: 'budget', label: 'งบประมาณที่ใช้ (บาท)', type: 'number', step: 'any', min: 0, req: true },
      { k: 'label', label: 'ฉลาก/การรับรอง', type: 'select', opts: labelOpts, req: true, def: () => 'ไม่มี' },
      { k: 'note', label: 'หมายเหตุ เช่น เกียรติบัตรใบไม้เขียว / ISO 14001 / Green Hotel' }],
    cols: [{ h: 'วันที่', f: r => thDate(r.event_date) }, { h: 'รายการ', f: r => r.project }, { h: 'สถานที่/โรงแรม', f: r => r.venue },
      { h: 'ผู้เข้าร่วม', f: r => fmtQ(r.attendees), cls: 'num' }, { h: 'วัน', f: r => fmtQ(r.days), cls: 'num' }, { h: 'งบ (บาท)', f: r => fmt(r.budget), cls: 'num' },
      { h: 'ฉลาก', f: r => r.label, cls: 'c' }],
    totals: rows => [`รวม ${rows.length} ครั้ง • ${fmt(GO.sum(rows, 'budget'))} บาท`, `เป็นมิตรฯ ${rows.filter(r => r.is_green).length} ครั้ง`]
  };

  /* ---------- ข้อ 5 เครื่องถ่ายเอกสาร (ปีละ 1 แถว) ---------- */
  function copierSection() {
    const sec = el('section', { id: 'tab-copier' });
    const F = [['company', 'บริษัทผู้ให้บริการเช่า'], ['units', 'จำนวนเครื่องที่เช่า เช่น 1 เครื่อง'], ['budget', 'งบประมาณที่ใช้ (บาท/ปี)', 'number'], ['brand', 'ยี่ห้อ'], ['model', 'รุ่น'], ['serial', 'หมายเลขเครื่อง']];
    const fy = el('input', { type: 'number', min: 2560, max: 2600, style: 'width:110px' }); fy.value = defaultFY();
    const inp = {}, grid = el('div', { class: 'grid g3' });
    for (const [k, lab, ty] of F) { inp[k] = el('input', { type: ty || 'text', step: 'any', min: ty ? 0 : undefined }); grid.append(el('div', {}, el('label', {}, lab), inp[k])); }
    const green = el('input', { type: 'checkbox', style: 'width:auto' });
    async function load() {
      msg('#m-copier', '');
      try {
        const r = chk(await client().from('go_copier').select('*').eq('fiscal_year', +fy.value).maybeSingle());
        for (const [k] of F) inp[k].value = r ? r[k] : ''; green.checked = !!(r && r.is_green);
        if (!r) msg('#m-copier', 'ยังไม่มีข้อมูลของปีนี้ กรอกแล้วกดบันทึกได้เลย', true);
      } catch (e) { msg('#m-copier', e.message + ' (ถ้าข้อความบอกว่าไม่พบตาราง ให้รัน SQL ไฟล์ 04 ก่อน)', false); }
    }
    const save = el('button', { class: 'btn pri', type: 'button' }, 'บันทึก');
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        const row = { fiscal_year: +fy.value, is_green: green.checked, updated_at: new Date().toISOString() };
        for (const [k, , ty] of F) row[k] = ty ? Number(inp[k].value || 0) : inp[k].value.trim();
        chk(await client().from('go_copier').upsert(row)); msg('#m-copier', 'บันทึกแล้ว', true);
      } catch (e) { msg('#m-copier', e.message, false); } finally { save.disabled = false; }
    });
    fy.addEventListener('change', load);
    sec.append(el('div', { class: 'card' }, el('h2', {}, '5. บริการเช่าเครื่องถ่ายเอกสาร'), el('div', { class: 'muted small' }, 'ปีละ 1 ชุดข้อมูล เลือกปีแล้วแก้ไขได้'),
      el('div', { class: 'row' }, el('div', {}, el('label', {}, 'ปีงบประมาณ'), fy)), grid,
      el('div', { class: 'row', style: 'margin:10px 0' }, green, el('label', { style: 'margin:0' }, 'เป็นไปตามเกณฑ์สินค้าที่เป็นมิตรกับสิ่งแวดล้อม')), save, el('div', { id: 'm-copier', class: 'msg', role: 'status' })));
    setTimeout(load, 0); return sec;
  }

  /* ---------- ภาพรวม ---------- */
  function dashSection() {
    const fy = el('input', { type: 'number', min: 2560, max: 2600, style: 'width:110px' }); fy.value = defaultFY();
    const out = el('div', {}), go = el('button', { class: 'btn pri', type: 'button' }, 'แสดง'), bk = el('button', { class: 'btn', type: 'button' }, '💾 สำรองข้อมูลปีนี้ (ไฟล์)');
    bk.addEventListener('click', () => exportBackup(bk, fy));
    async function show() {
      msg('#m-dash', ''); go.disabled = true;
      try { const f = +fy.value; const [items, X] = await Promise.all([DB.items(f), loadExtra(f)]); GO.renderDashboard(out, { items, X, fy: f }); }
      catch (e) { msg('#m-dash', e.message, false); } finally { go.disabled = false; }
    }
    go.addEventListener('click', show); fy.addEventListener('change', show);
    const sec = el('section', { id: 'tab-dash' }, el('div', { class: 'card' }, el('div', { class: 'row' }, el('div', {}, el('label', {}, 'ปีงบประมาณ'), fy), go, bk), el('div', { id: 'm-dash', class: 'msg', role: 'status' })), out);
    sec._show = show; return sec;
  }

  /* ---------- ตั้งค่า: ผู้ให้ข้อมูลหลายคน + เกณฑ์ทำความสะอาด ---------- */
  let repBody, critSel = [];
  function settingsCard() {
    repBody = el('tbody', {});
    const card = el('div', { class: 'card', id: 'st-extra' }, el('h2', {}, 'ผู้ให้ข้อมูลท้ายรายงาน (สูงสุด 5 คน)'),
      el('div', { class: 'muted small' }, 'ชื่อและตำแหน่งของทุกคนที่ลงข้อมูลรายงาน จะแสดงท้ายแบบฟอร์ม (หน้ารายงานสาธารณะด้วย) กดปุ่ม "บันทึกการตั้งค่า" ด้านล่างสุดของหน้านี้'),
      el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, el('th', {}, 'ชื่อ-สกุล'), el('th', {}, 'ตำแหน่ง'))), repBody),
      el('h3', { style: 'margin-top:14px' }, 'เกณฑ์การคัดเลือกบริการทำความสะอาด (ข้อ 3)'));
    critSel = GO.CRITERIA.map(c => { const s = el('select', {}, el('option', { value: '' }, 'ไม่ระบุ'), el('option', { value: 'y' }, 'มี'), el('option', { value: 'n' }, 'ไม่มี')); card.append(el('div', { class: 'small', style: 'margin-top:6px' }, c), s); return s; });
    return card;
  }
  function renderSettingsExtra(R) {
    if (!repBody) return; R = R || {};
    const list = GO.reporterList(R).slice(0, 5); repBody.textContent = '';
    for (let i = 0; i < 5; i++) repBody.append(el('tr', {}, el('td', {}, el('input', { value: (list[i] || {}).name || '', 'aria-label': 'ชื่อ ' + (i + 1) })), el('td', {}, el('input', { value: (list[i] || {}).position || '', 'aria-label': 'ตำแหน่ง ' + (i + 1) }))));
    const cc = Array.isArray(R.clean_criteria) ? R.clean_criteria : [];
    critSel.forEach((s, i) => { s.value = cc[i] === true ? 'y' : cc[i] === false ? 'n' : ''; });
  }
  function readSettingsExtra() {
    const reporters = [...repBody.querySelectorAll('tr')].map(tr => { const [a, b] = tr.querySelectorAll('input'); return { name: a.value.trim(), position: b.value.trim() }; }).filter(x => x.name || x.position);
    return { reporters, clean_criteria: critSel.map(s => s.value === 'y' ? true : s.value === 'n' ? false : null) };
  }

  /* ---------- Excel ข้อ 2-5 และท้ายแบบฟอร์ม ---------- */
  function xlsxExtra(ws, put, mg, r, m, X0, R) {
    const X = GO.buildExtra(X0 || {}, m.fy, m.period), HD = { h: 'center', b: true, fill: 'FFD9E2F3' }, CAT = { b: true, fill: 'FFE6ECF2' };
    const row = (rr, spans) => { for (const [a, b, v, o] of spans) { for (let c = a.charCodeAt(0); c <= b.charCodeAt(0); c++) put(String.fromCharCode(c) + rr, null, { border: true, fill: (o || {}).fill }); if (a !== b) ws.mergeCells(`${a}${rr}:${b}${rr}`); put(a + rr, v, { border: true, ...(o || {}) }); } };
    const title = t => { mg(`A${r}:L${r}`, t, { h: 'left', b: true }); r++; };
    r++; title(`2. รายงานการจ้างบริการในช่วงเดือน ${m.periodText} (${m.period} ปีงบประมาณ พ.ศ. ${m.fy})`);
    row(r, [['A', 'A', 'ที่', HD], ['B', 'B', 'ประเภทงานจ้าง', HD], ['C', 'E', 'บริษัท / หน่วยงาน', HD], ['F', 'I', 'ความเป็นมิตรกับสิ่งแวดล้อม', HD], ['J', 'K', 'มูลค่าการจ้างงาน (บาท)', HD]]); r++;
    let n = 0;
    for (const g of X.months) { row(r, [['A', 'A', '', CAT], ['B', 'K', 'เดือน' + g.label, CAT]]); r++; for (const x of g.rows) { n++; row(r, [['A', 'A', n, { h: 'center' }], ['B', 'B', x.job_type, { h: 'left' }], ['C', 'E', x.company, { h: 'left' }], ['F', 'I', x.is_green ? x.label : '', { h: 'center', color: '1E6B30' }], ['J', 'K', +x.value, { h: 'right', fmt: '#,##0.00' }]]); r++; } }
    if (!n) { row(r, [['A', 'K', '— ไม่มีการจ้างบริการในช่วงนี้ —', { h: 'center' }]]); r++; }
    for (const [lab, v] of [['รวมมูลค่าการจ้างงานทั้งหมดขององค์กร (บาท)', X.sTot], ['รวมมูลค่าการจ้างงานที่เป็นมิตรกับสิ่งแวดล้อม (บาท)', X.sGreen], ['สัดส่วนมูลค่าการจ้างที่เป็นมิตรกับสิ่งแวดล้อมของทั้งองค์กร (ร้อยละ)', X.sPct]]) { row(r, [['A', 'I', lab, { h: 'left', b: true }], ['J', 'K', v, { h: 'right', b: true, fmt: '#,##0.00' }]]); r++; }
    r++; title(`3. การจัดจ้างบริการทำความสะอาดในสำนักงาน (ปีงบประมาณ พ.ศ. ${m.fy})`);
    X.cl.forEach((x, i) => { row(r, [['A', 'E', `${i + 1}. ${x.name} ${x.period_text || ''}`, { h: 'left' }], ['F', 'I', 'งบประมาณที่ใช้', { h: 'center' }], ['J', 'K', +x.budget, { h: 'right', fmt: '#,##0.00' }]]); r++; });
    if (!X.cl.length) { row(r, [['A', 'K', '— ยังไม่ได้บันทึก —', { h: 'center' }]]); r++; } else { row(r, [['A', 'I', 'รวมเป็นเงิน', { h: 'right', b: true }], ['J', 'K', X.clTot, { h: 'right', b: true, fmt: '#,##0.00' }]]); r++; }
    const cc = Array.isArray(R.clean_criteria) ? R.clean_criteria : [];
    row(r, [['A', 'I', 'เกณฑ์ในการพิจารณา', HD], ['J', 'J', 'มี', HD], ['K', 'K', 'ไม่มี', HD]]); r++;
    GO.CRITERIA.forEach((c, i) => { row(r, [['A', 'I', c, { h: 'left' }], ['J', 'J', cc[i] === true ? '✓' : '', { h: 'center' }], ['K', 'K', cc[i] === false ? '✓' : '', { h: 'center' }]]); ws.getRow(r).height = i === 2 ? 110 : 26; r++; });
    r++; title(`4. รายละเอียดของการใช้บริการโรงแรมในการจัดประชุม สัมมนา และอบรม ในช่วงเดือน ${m.periodText}`);
    row(r, [['A', 'C', 'รายการจัดประชุม/สัมมนา/อบรม', HD], ['D', 'E', 'สถานที่จัดงาน/โรงแรม', HD], ['F', 'F', 'ผู้เข้าร่วม (คน)', HD], ['G', 'G', 'ระยะเวลา (วัน)', HD], ['H', 'I', 'งบประมาณที่ใช้ (บาท)', HD], ['J', 'L', 'เป็นมิตรกับสิ่งแวดล้อม', HD]]); r++;
    for (const x of X.ht) { row(r, [['A', 'C', x.project, { h: 'left' }], ['D', 'E', x.venue, { h: 'left' }], ['F', 'F', +x.attendees, { h: 'center' }], ['G', 'G', +x.days, { h: 'center' }], ['H', 'I', +x.budget, { h: 'right', fmt: '#,##0.00' }], ['J', 'L', x.is_green ? x.label + (x.note ? ' (' + x.note + ')' : '') : ' - ', { h: 'center' }]]); r++; }
    if (!X.ht.length) { row(r, [['A', 'L', '— ไม่มีการจัดงานที่โรงแรมในช่วงนี้ —', { h: 'center' }]]); r++; }
    mg(`A${r}:L${r}`, 'หมายเหตุ *กรณีที่เป็นมิตรกับสิ่งแวดล้อมให้ระบุด้วยว่าได้รับเกียรติบัตรใบไม้เขียว หรือ ได้รับการรับรอง ISO 14001 หรือได้รับการรับรอง Green Hotel', { h: 'left' }); r++;
    r++; title(`5. บริการเช่าเครื่องถ่ายเอกสาร (ปีงบประมาณ พ.ศ. ${m.fy})`);
    const c = X.copier;
    if (!c) { row(r, [['A', 'L', '— ยังไม่ได้บันทึกข้อมูลปีนี้ —', { h: 'center' }]]); r++; }
    else for (const [a, b] of [['1. ชื่อบริษัทที่ให้บริการเช่าเครื่องถ่ายเอกสาร', c.company], ['2. จำนวนเครื่องถ่ายเอกสารที่เช่าบริการ', c.units], ['3. งบประมาณที่ใช้', fmt(c.budget) + ' บาท/ปี'],
      ['4. ระบุยี่ห้อและรุ่นที่ใช้บริการ', `ยี่ห้อ ${c.brand}  รุ่น ${c.model}  หมายเลขเครื่อง ${c.serial}`], ['5. เครื่องถ่ายเอกสารที่เช่าเป็นไปตามเกณฑ์สินค้าที่เป็นมิตรกับสิ่งแวดล้อม', c.is_green ? '☑ เป็นมิตรกับสิ่งแวดล้อม' : '☐ ไม่เป็นมิตรกับสิ่งแวดล้อม']]) { row(r, [['A', 'E', a, { h: 'left' }], ['F', 'L', b, { h: 'left' }]]); r++; }
    return r + 1;
  }
  function xlsxFooter(put, r, R) {
    const rows = [['ผู้ให้ข้อมูล', true]];
    GO.reporterList(R).forEach(p => { rows.push([`ชื่อ ${p.name || ''}`]); rows.push([`ตำแหน่ง ${p.position || ''}`]); });
    rows.push([`หน่วยงาน ${R.agency || ''}`], [`โทรศัพท์ ${R.tel || ''}`], [`โทรสาร ${R.fax || ''}`]);
    for (const [t, b] of rows) { put('B' + r, t, { b: !!b, h: 'left', wrap: false }); r++; }
    return r;
  }

  /* ---------- ข้อ 6-7 แยกหน้า (ใช้ช่องเดิมของหน้าตั้งค่า จึงบันทึกพร้อมกัน) ---------- */
  function notesSection() {
    const grid = document.querySelector('#st-prob').closest('.grid');
    const msgBox = el('div', { id: 'm-notes', class: 'msg', role: 'status' });
    const save = el('button', { class: 'btn pri', type: 'button' }, 'บันทึกข้อ 6-7');
    save.addEventListener('click', async () => {
      document.querySelector('#st-save').click();
      setTimeout(() => { const t = document.querySelector('#st-msg'); msg('#m-notes', t.textContent, t.classList.contains('ok')); }, 1200);
    });
    return el('section', { id: 'tab-notes' }, el('div', { class: 'card' }, el('h2', {}, '6-7. ปัญหา อุปสรรค และข้อเสนอแนะ'),
      el('div', { class: 'muted small' }, 'พิมพ์แต่ละประเด็นขึ้นบรรทัดใหม่ จะแสดงในรายงานข้อ 6 และข้อ 7'), grid, msgBox, el('div', { class: 'row', style: 'justify-content:flex-end' }, save)));
  }

  /* ---------- สำรองข้อมูลเป็นไฟล์ JSON (ไฟล์มีชื่อบริษัท/ผู้รับจ้าง ห้ามแชร์) ---------- */
  async function exportBackup(btn, fyIn) {
    btn.disabled = true; msg('#m-dash', '');
    try {
      const f = +fyIn.value, X = await loadExtra(f), items = await DB.items(f);
      const data = { exported_at: new Date().toISOString(), fiscal_year: f, items, ...X };
      const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })), download: `GreenOffice_backup_FY${f}.json` });
      document.body.append(a); a.click(); a.remove(); msg('#m-dash', 'ดาวน์โหลดไฟล์สำรองแล้ว (เก็บในที่ปลอดภัย ห้ามส่งต่อ เพราะมีชื่อผู้รับจ้าง/บริษัท)', true);
    } catch (e) { msg('#m-dash', e.message, false); } finally { btn.disabled = false; }
  }

  /* ---------- เริ่มต้น: เพิ่มแท็บและส่วนต่าง ๆ ---------- */
  function setup() {
    const navWrap = document.querySelector('nav .wrap'), main = document.querySelector('main');
    const dash = dashSection();
    const tabs = [['dash', '📊 ภาพรวม', dash, true], ['svc', '2. จ้างบริการ', crudSection('svc', '2. บันทึกการจ้างบริการ', 'รายการจ้างบริการแต่ละครั้ง (ไม่ใช่การซื้อสินค้า)', SERVICES)],
      ['clean', '3. ทำความสะอาด', crudSection('clean', '3. การจัดจ้างบริการทำความสะอาดในสำนักงาน', 'ผู้รับจ้างทำความสะอาดแต่ละราย', CLEANING)],
      ['hotel', '4. โรงแรม/ประชุม', crudSection('hotel', '4. การใช้บริการโรงแรมจัดประชุม สัมมนา อบรม', 'บันทึกทุกครั้งที่จัดงานที่โรงแรม', HOTELS)],
      ['copier', '5. เครื่องถ่ายเอกสาร', copierSection()], ['notes', '6-7. ปัญหา/ข้อเสนอแนะ', notesSection()]];
    const firstBtn = navWrap.querySelector('[data-tab]');
    for (const [id, label, secEl, first] of tabs) {
      const b = el('button', { role: 'tab', 'data-tab': id, 'aria-selected': 'false' }, label);
      if (first) navWrap.insertBefore(b, firstBtn); else navWrap.insertBefore(b, navWrap.querySelector('[data-tab=report]'));
      main.append(secEl);
      b.addEventListener('click', () => {
        document.querySelectorAll('nav [role=tab]').forEach(x => x.setAttribute('aria-selected', x === b));
        document.querySelectorAll('main section').forEach(s => s.classList.toggle('on', s.id === 'tab-' + id));
        if (id === 'dash') dash._show();
      });
    }
    // เมนูเดิมที่ผูกไว้ก่อนหน้า (setupTabs) ต้องปิดแท็บใหม่ด้วย
    document.querySelectorAll('nav [role=tab]').forEach(b => { if (!tabs.find(t => t[0] === b.dataset.tab)) b.addEventListener('click', () => { /* setupTabs จัดการ section เอง */ }); });
    ['#st-person', '#st-position'].forEach(i => { const d = document.querySelector(i).parentNode; d.hidden = true; });
    const st = document.querySelector('#tab-settings'); const saveBtn = st && st.querySelector('#st-save');
    if (st) { const card = settingsCard(); saveBtn ? saveBtn.parentNode.before(card) : st.append(card); renderSettingsExtra(ST.report); }
  }
  return { setup, loadExtra, renderSettingsExtra, readSettingsExtra, xlsxExtra, xlsxFooter };
})();
