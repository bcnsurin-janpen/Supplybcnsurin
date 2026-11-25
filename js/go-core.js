/* Green Office 6.1(2) — ส่วนกลางที่ใช้ร่วมกันทั้งหน้าบันทึก (green-office.html) และหน้ารายงานสาธารณะ (green-office-report.html)
   ต้องโหลดหลัง go-main.js หรือ go-report.js (ใช้ฟังก์ชัน el, fmt, fmtQ, TMON, defaultFY ฯลฯ ที่นั่น) */
window.GO = (function () {
  const CRITERIA = [
    '1. ไม่ใช้ผลิตภัณฑ์ทำความสะอาดที่มีส่วนผสมของสารอันตราย',
    '2. พนักงานได้รับการฝึกอบรมด้านการใช้ทรัพยากรอย่างมีประสิทธิภาพ',
    '3. มีการดำเนินการ อธิบายขั้นตอน และเสนอแนวทางปฏิบัติที่ชัดเจนในการให้พนักงานทำความสะอาดคัดแยกบรรจุภัณฑ์ หรือวัสดุเหลือใช้อื่น ๆ ที่เกิดขึ้นจากขยะทั่วไปที่มีอยู่ในอาคารสำนักงาน เพื่อนำกลับไปสู่กระบวนการแปรรูปหรือเวียนใช้ใหม่ รวมถึงจัดอย่างถูกต้องตามหลักวิชาการ พร้อมรายงานผลการดำเนินการคัดแยกขยะตามระยะเวลาที่เหมาะสม'
  ];
  const calYear = (fy, mo) => (mo >= 10 ? fy - 1 : fy);               // ปี พ.ศ. ของเดือนปฏิทินในปีงบ fy
  const monthLabel = (fy, mo) => TMON[mo - 1] + ' ' + (calYear(fy, mo));
  const rowInPeriod = (r, period) => period === 'ทั้งปี' || ('ไตรมาสที่ ' + r.fiscal_quarter) === period || TMON[r.month_no - 1] === period;
  const sum = (arr, k) => r2(arr.reduce((a, x) => a + (+x[k] || 0), 0));
  const pctOf = (a, b) => (b ? a / b * 100 : 0);

  /* ---------- คำนวณข้อ 2-5 ---------- */
  function buildExtra(X, fy, period) {
    X = X || {};
    const sv = (X.services || []).filter(r => r.fiscal_year === fy && rowInPeriod(r, period));
    const months = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(mo => ({ mo, label: monthLabel(fy, mo), rows: sv.filter(r => r.month_no === mo) })).filter(g => g.rows.length);
    const sTot = sum(sv, 'value'), sGreen = sum(sv.filter(r => r.is_green), 'value');
    const cl = X.cleaning || [];
    const ht = (X.hotels || []).filter(r => r.fiscal_year === fy && rowInPeriod(r, period));
    return { sv, months, sTot, sGreen, sPct: pctOf(sGreen, sTot), cl, clTot: sum(cl, 'budget'), ht, copier: X.copier || null };
  }

  /* ---------- ตารางแบบฟอร์ม ข้อ 1-7 ---------- */
  function reporterList(R) {
    const a = Array.isArray(R.reporters) ? R.reporters.filter(x => x && (x.name || x.position)) : [];
    if (a.length) return a;
    return String(R.person || '').split(/[;\n]/).map(x => x.trim()).filter(Boolean).map(n => ({ name: n, position: R.position || '' }));
  }
  function renderForm(out, o) {
    const { m, X, R, keywords, admin } = o; out.textContent = '';
    const ctxText = [...new Set((keywords || []).map(k => k.grp))].join(' ');
    out.append(el('div', { class: 'r' }, 'หมวด 6 ข้อ 6.1 (2) รายงานจัดซื้อจัดจ้าง'), el('div', { class: 'r' }, 'แบบฟอร์ม 6.1 (2)'),
      el('div', { class: 't' }, 'แบบรายงานผลการจัดซื้อจัดจ้างสินค้าและบริการที่เป็นมิตรกับสิ่งแวดล้อม'),
      el('div', { class: 'c' }, `หน่วยงาน ${R.agency || ''}   ปีงบประมาณ พ.ศ. ${m.fy}`),
      el('div', {}, `1. รายการจัดซื้อสินค้าในช่วงเดือน ${m.periodText} (${m.period} ปีงบประมาณ พ.ศ. ${m.fy})`));
    /* ข้อ 1 */
    const t = el('table', {});
    t.append(el('thead', {},
      el('tr', {}, el('th', { rowspan: 2 }, 'ที่'), el('th', { rowspan: 2 }, 'รายการ'), el('th', { rowspan: 2 }, 'ยี่ห้อ'), el('th', { rowspan: 2 }, 'รุ่นสินค้า'),
        el('th', {}, 'ความเป็นมิตร'), el('th', { colspan: 4 }, 'ปริมาณสินค้า (หน่วย)'), el('th', { colspan: 2 }, 'มูลค่าสินค้า (บาท)'), el('th', {}, 'เอกสาร/หลักฐาน')),
      el('tr', {}, el('th', {}, 'กับสิ่งแวดล้อม'), el('th', { colspan: 2 }, 'ทั้งหมด'), el('th', { colspan: 2 }, 'เป็นมิตรฯ'), el('th', {}, 'ทั้งหมด'), el('th', {}, 'เป็นมิตรฯ'), el('th', {}, 'รูปภาพ'))));
    const tb = el('tbody', {}); let n = 0;
    for (const g of m.groups) {
      tb.append(el('tr', { class: 'cat' }, el('td', {}), el('td', { colspan: 11 }, g.cat)));
      for (const it of g.items) {
        n++; const gr = it.is_green; const ev = o.evidence ? o.evidence(it) : '';
        tb.append(el('tr', {}, el('td', { class: 'c' }, n), el('td', {}, it.name), el('td', {}, it.brand), el('td', {}, it.model),
          el('td', { class: 'c g' }, gr ? it.label : ''), el('td', { class: 'num' }, fmtQ(it.qty)), el('td', { class: 'c' }, it.unit),
          el('td', { class: 'num g' }, gr ? fmtQ(it.qty) : ''), el('td', { class: 'c g' }, gr ? it.unit : ''),
          el('td', { class: 'num' }, fmt(it.total)), el('td', { class: 'num g' }, gr ? fmt(it.total) : ''), el('td', { class: 'c' }, ev)));
      }
    }
    if (!n) tb.append(el('tr', {}, el('td', { colspan: 12, class: 'c' }, '— ไม่มีการจัดซื้อในช่วงนี้ —')));
    t.append(tb); out.append(t);
    const s = m.sum, st = el('table', { class: 'sum' });
    const srow = (lab, a, b) => el('tr', {}, el('td', { style: 'width:52%' }, lab), el('td', { class: 'c' }, fmt(a)), el('td', { class: 'c' }, fmt(b)));
    st.append(el('thead', {}, el('tr', {}, el('th', {}, 'สรุปผล'), el('th', {}, 'ปริมาณ (หน่วย)'), el('th', {}, 'มูลค่า (บาท)'))),
      el('tbody', {}, srow('รวมการซื้อสินค้าที่เป็นมิตรกับสิ่งแวดล้อม', s.gQty, s.gVal),
        srow(`รวมการซื้อสินค้าของสำนักงานภายใต้บริบทการขอการรับรองสำนักงานสีเขียว (กลุ่มสินค้า: ${ctxText})`, s.cQty, s.cVal),
        srow('สัดส่วนการซื้อสินค้าที่เป็นมิตรกับสิ่งแวดล้อมของสำนักงานที่อยู่ภายใต้บริบทการขอการรับรองสำนักงานสีเขียว (ร้อยละ)', s.ctxPctQty, s.ctxPctVal),
        srow('รวมการซื้อสินค้าทั้งหมดขององค์กร', s.tQty, s.tVal),
        srow('สัดส่วนการซื้อสินค้าที่เป็นมิตรกับสิ่งแวดล้อมขององค์กร (ร้อยละ)', s.orgPctQty, s.orgPctVal)));
    out.append(el('div', { class: 'blk' }, st));

    /* ข้อ 2 จ้างบริการ */
    out.append(el('div', { class: 'blk' }, `2. รายงานการจ้างบริการในช่วงเดือน ${m.periodText} (${m.period} ปีงบประมาณ พ.ศ. ${m.fy})`));
    const t2 = el('table', {}), b2 = el('tbody', {}); let n2 = 0;
    t2.append(el('thead', {}, el('tr', {}, el('th', {}, 'ที่'), el('th', {}, 'ประเภทงานจ้าง'), el('th', {}, 'บริษัท / หน่วยงาน'), el('th', {}, 'ความเป็นมิตรกับสิ่งแวดล้อม'), el('th', {}, 'มูลค่าการจ้างงาน (บาท)'))));
    for (const g of X.months) {
      b2.append(el('tr', { class: 'cat' }, el('td', {}), el('td', { colspan: 4 }, 'เดือน' + g.label)));
      for (const r of g.rows) {
        n2++;
        b2.append(el('tr', {}, el('td', { class: 'c' }, n2), el('td', {}, r.job_type), el('td', {}, admin ? r.company : '(ไม่แสดงต่อสาธารณะ)'),
          el('td', { class: 'c g' }, r.is_green ? r.label : ''), el('td', { class: 'num' }, fmt(r.value))));
      }
    }
    if (!n2) b2.append(el('tr', {}, el('td', { colspan: 5, class: 'c' }, '— ไม่มีการจ้างบริการในช่วงนี้ —')));
    t2.append(b2); out.append(t2);
    const s2 = el('table', { class: 'sum' }, el('tbody', {},
      el('tr', {}, el('td', { style: 'width:70%' }, 'รวมมูลค่าการจ้างงานทั้งหมดขององค์กร (บาท)'), el('td', { class: 'c' }, fmt(X.sTot))),
      el('tr', {}, el('td', {}, 'รวมมูลค่าการจ้างงานที่เป็นมิตรกับสิ่งแวดล้อม (บาท)'), el('td', { class: 'c' }, fmt(X.sGreen))),
      el('tr', {}, el('td', {}, 'สัดส่วนมูลค่าการจ้างที่เป็นมิตรกับสิ่งแวดล้อมของทั้งองค์กร (ร้อยละ)'), el('td', { class: 'c' }, fmt(X.sPct)))));
    out.append(el('div', { class: 'blk' }, s2));

    /* ข้อ 3 ทำความสะอาด */
    out.append(el('div', { class: 'blk' }, '3. การจัดจ้างบริการทำความสะอาดในสำนักงาน (ปีงบประมาณ พ.ศ. ' + m.fy + ')'));
    const t3 = el('table', {}), b3 = el('tbody', {});
    if (!X.cl.length) b3.append(el('tr', {}, el('td', { class: 'c' }, '— ยังไม่ได้บันทึก —')));
    X.cl.forEach((r, i) => b3.append(el('tr', {}, el('td', {}, `${i + 1}. ${admin ? r.name : 'ผู้รับจ้างรายที่ ' + (r.seq || i + 1)} ${r.period_text || ''}`), el('td', {}, 'งบประมาณที่ใช้'), el('td', { class: 'num' }, fmt(r.budget)), el('td', {}, 'บาท'))));
    if (X.cl.length) b3.append(el('tr', { class: 'cat' }, el('td', {}), el('td', {}, 'รวมเป็นเงิน'), el('td', { class: 'num' }, fmt(X.clTot)), el('td', {}, 'บาท')));
    t3.append(b3); out.append(t3);
    const cc = Array.isArray(R.clean_criteria) ? R.clean_criteria : [];
    const crit = el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'เกณฑ์ในการพิจารณา'), el('th', { style: 'width:60px' }, 'มี'), el('th', { style: 'width:60px' }, 'ไม่มี'))),
      el('tbody', {}, ...CRITERIA.map((c, i) => el('tr', {}, el('td', {}, c), el('td', { class: 'c' }, cc[i] === true ? '✓' : ''), el('td', { class: 'c' }, cc[i] === false ? '✓' : '')))));
    out.append(el('div', { class: 'blk' }, 'เกณฑ์ในการคัดเลือกหรือจัดหาบริการทำความสะอาดในสำนักงานที่ใช้พิจารณา มีดังนี้', crit));

    /* ข้อ 4 โรงแรม */
    out.append(el('div', { class: 'blk' }, `4. รายละเอียดของการใช้บริการโรงแรมในการจัดประชุม สัมมนา และอบรม ในช่วงเดือน ${m.periodText}`));
    const t4 = el('table', {}), b4 = el('tbody', {});
    t4.append(el('thead', {}, el('tr', {}, el('th', {}, 'รายการจัดประชุม/สัมมนา/อบรม'), el('th', {}, 'สถานที่จัดงาน/โรงแรม'), el('th', {}, 'จำนวนผู้เข้าร่วม (คน)'), el('th', {}, 'ระยะเวลา (วัน)'), el('th', {}, 'งบประมาณที่ใช้ (บาท)'), el('th', {}, 'เป็นมิตรกับสิ่งแวดล้อม'))));
    if (!X.ht.length) b4.append(el('tr', {}, el('td', { colspan: 6, class: 'c' }, '— ไม่มีการจัดงานที่โรงแรมในช่วงนี้ —')));
    for (const r of X.ht) b4.append(el('tr', {}, el('td', {}, r.project), el('td', {}, r.venue), el('td', { class: 'num' }, fmtQ(r.attendees)), el('td', { class: 'num' }, fmtQ(r.days)),
      el('td', { class: 'num' }, fmt(r.budget)), el('td', { class: 'c g' }, r.is_green ? r.label + (admin && r.note ? ' (' + r.note + ')' : '') : ' - ')));
    t4.append(b4); out.append(t4);
    out.append(el('div', { class: 'small' }, 'หมายเหตุ *กรณีที่เป็นมิตรกับสิ่งแวดล้อมให้ระบุด้วยว่าได้รับเกียรติบัตรใบไม้เขียว หรือ ได้รับการรับรอง ISO 14001 หรือได้รับการรับรอง Green Hotel'));

    /* ข้อ 5 เครื่องถ่ายเอกสาร */
    out.append(el('div', { class: 'blk' }, '5. บริการเช่าเครื่องถ่ายเอกสาร (ปีงบประมาณ พ.ศ. ' + m.fy + ')'));
    const c = X.copier, t5 = el('table', {}), b5 = el('tbody', {});
    if (!c) b5.append(el('tr', {}, el('td', { class: 'c' }, '— ยังไม่ได้บันทึกข้อมูลปีนี้ —')));
    else [['1. ชื่อบริษัทที่ให้บริการเช่าเครื่องถ่ายเอกสาร', admin ? c.company : '(ไม่แสดงต่อสาธารณะ)'], ['2. จำนวนเครื่องถ่ายเอกสารที่เช่าบริการ', c.units], ['3. งบประมาณที่ใช้', fmt(c.budget) + ' บาท/ปี'],
      ['4. ระบุยี่ห้อและรุ่นที่ใช้บริการ', `ยี่ห้อ ${c.brand}  รุ่น ${c.model}` + (admin ? `  หมายเลขเครื่อง ${c.serial}` : '')],
      ['5. เครื่องถ่ายเอกสารที่เช่าเป็นไปตามเกณฑ์สินค้าที่เป็นมิตรกับสิ่งแวดล้อม', c.is_green ? '☑ เป็นมิตรกับสิ่งแวดล้อม' : '☐ ไม่เป็นมิตรกับสิ่งแวดล้อม']]
      .forEach(([a, b]) => b5.append(el('tr', {}, el('td', { style: 'width:46%' }, a), el('td', {}, b))));
    t5.append(b5); out.append(t5);

    /* ข้อ 6-7 */
    const list = (title, arr) => el('div', { class: 'blk' }, el('div', {}, title), ...(arr || []).map((x, i) => el('p', {}, `${i + 1}) ${x}`)));
    out.append(list('6. ปัญหาและอุปสรรคในการจัดซื้อจัดจ้างสินค้าและบริการที่เป็นมิตรกับสิ่งแวดล้อมมาใช้', R.problems), list('7. ข้อเสนอแนะเพิ่มเติมเกี่ยวกับการจัดซื้อจัดจ้าง', R.suggestions));

    /* ผู้ให้ข้อมูล (หลายคน พร้อมตำแหน่ง) */
    const people = reporterList(R), foot = el('div', { class: 'blk', style: 'margin-left:28px' }, el('b', {}, 'ผู้ให้ข้อมูล'));
    people.forEach(p => foot.append(el('div', { style: 'margin-top:6px' }, `ชื่อ ${p.name || ''}`), el('div', {}, `ตำแหน่ง ${p.position || ''}`)));
    foot.append(el('div', { style: 'margin-top:6px' }, `หน่วยงาน ${R.agency || ''}`), el('div', {}, `โทรศัพท์ ${R.tel || ''}`), el('div', {}, `โทรสาร ${R.fax || ''}`));
    out.append(foot);
  }

  /* ---------- ภาพรวม (แบบเดิม: ตัวเลขสรุป + กราฟ) ---------- */
  function donut(green, total, color) {
    const NS = 'http://www.w3.org/2000/svg', R = 54, C = 2 * Math.PI * R, p = total > 0 ? Math.min(1, green / total) : 0;
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 140 140'); svg.setAttribute('width', '150'); svg.setAttribute('height', '150');
    const mk = (a, b) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', 70); c.setAttribute('cy', 70); c.setAttribute('r', R); c.setAttribute('fill', 'none'); for (const k in a) c.setAttribute(k, a[k]); return c; };
    svg.append(mk({ stroke: '#C9DBC9', 'stroke-width': 22 }));
    svg.append(mk({ stroke: color, 'stroke-width': 22, 'stroke-dasharray': `${(C * p).toFixed(2)} ${C.toFixed(2)}`, transform: 'rotate(-90 70 70)' }));
    const tx = document.createElementNS(NS, 'text'); tx.setAttribute('x', 70); tx.setAttribute('y', 76); tx.setAttribute('text-anchor', 'middle'); tx.setAttribute('font-size', '20'); tx.setAttribute('font-weight', '700'); tx.setAttribute('fill', '#1F4E79');
    tx.textContent = (p * 100).toFixed(1) + '%'; svg.append(tx); return svg;
  }
  function hbars(rows, color) {            // rows: [{label, value, green}]
    const max = Math.max(1, ...rows.map(r => r.value));
    return el('div', {}, ...rows.map(r => el('div', { class: 'hb' }, el('span', { class: 'hl', title: r.label }, r.label),
      el('span', { class: 'hbar' }, el('i', { style: `width:${(r.value / max * 100).toFixed(1)}%;background:${r.green ? '#2E7D32' : (color || '#B8863B')}` })), el('span', { class: 'hv' }, fmt(r.value)))));
  }
  function vbars(rows) {                   // แท่งคู่รายเดือน: ทั้งหมด (ทอง) เทียบเป็นมิตรฯ (เขียว)
    const NS = 'http://www.w3.org/2000/svg', W = 640, H = 230, L = 52, B = 30, T = 14, max = Math.max(1, ...rows.map(r => r.all));
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', '100%'); svg.setAttribute('role', 'img');
    const mk = (t, a, txt) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (txt !== undefined) e.textContent = txt; svg.append(e); return e; };
    for (let i = 0; i <= 4; i++) { const y = T + (H - B - T) * (1 - i / 4); mk('line', { x1: L, x2: W - 6, y1: y, y2: y, stroke: '#C9DBC9' }); mk('text', { x: L - 6, y: y + 4, 'text-anchor': 'end', 'font-size': 11, fill: '#5C6B58' }, fmt(max * i / 4).replace(/\.00$/, '')); }
    const bw = (W - L - 6) / rows.length;
    rows.forEach((r, i) => {
      const x = L + i * bw, h1 = (H - B - T) * r.all / max, h2 = (H - B - T) * r.g / max;
      mk('rect', { x: x + bw * .12, y: H - B - h1, width: bw * .36, height: Math.max(0, h1), fill: '#B8863B' });
      mk('rect', { x: x + bw * .52, y: H - B - h2, width: bw * .36, height: Math.max(0, h2), fill: '#2F7A4F' });
      mk('text', { x: x + bw / 2, y: H - 10, 'text-anchor': 'middle', 'font-size': 11, fill: '#5C6B58' }, r.label);
    });
    return el('div', {}, svg, el('div', { class: 'small muted' }, el('span', { class: 'lg', style: 'background:#B8863B' }), ' ทั้งหมด   ', el('span', { class: 'lg', style: 'background:#2F7A4F' }), ' เป็นมิตรกับสิ่งแวดล้อม'));
  }
  function renderDashboard(out, o) {
    const { items, X, fy } = o; out.textContent = '';
    const pTot = sum(items, 'total'), pGreen = sum(items.filter(i => i.is_green), 'total');
    const sv = (X.services || []).filter(r => r.fiscal_year === fy), sTot = sum(sv, 'value'), sGreen = sum(sv.filter(r => r.is_green), 'value');
    const ht = (X.hotels || []).filter(r => r.fiscal_year === fy), hGreen = ht.filter(r => r.is_green).length;
    const clTot = sum(X.cleaning || [], 'budget'), cp = X.copier;
    const all = pTot + sTot, allGreen = pGreen + sGreen;
    const kpi = (v, l, cls) => el('div', { class: 'kpi ' + (cls || '') }, el('b', {}, v), el('span', {}, l));
    out.append(el('div', { class: 'card dashhead' }, el('h2', {}, `สรุปภาพรวมสำนักงานสีเขียว ปีงบประมาณ ${fy}`), el('div', { class: 'muted small' }, `ข้อมูลตุลาคม ${fy - 544} — กันยายน ${fy - 543} • อัปเดตทุกครั้งที่เจ้าหน้าที่บันทึกข้อมูล`)));
    out.append(el('div', { class: 'kpis k6' },
      kpi(fmt(pctOf(allGreen, all)) + '%', 'สัดส่วนจัดซื้อจัดจ้างที่เป็นมิตรฯ โดยรวม'),
      kpi(fmt(pTot), 'มูลค่าจัดซื้อสินค้าทั้งหมด (บาท)', 'b'), kpi(fmt(sTot), 'มูลค่าจัดจ้างบริการทั้งหมด (บาท)', 'a'),
      kpi(String(ht.length), `การจัดประชุม/อบรมที่โรงแรม (ครั้ง) — เป็นมิตรฯ ${hGreen} ครั้ง`),
      kpi(fmt(clTot), 'งบประมาณบริการทำความสะอาด (บาท)', 'b'),
      kpi(!cp ? 'ยังไม่บันทึก' : cp.is_green ? '✔ ผ่านเกณฑ์' : '✘ ไม่ผ่านเกณฑ์', 'เครื่องถ่ายเอกสารเช่า เป็นมิตรกับสิ่งแวดล้อม', 'a')));
    const byMonth = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(mo => { const r = sv.filter(x => x.month_no === mo); return { label: TMON[mo - 1].slice(0, 3) + '.', all: sum(r, 'value'), g: sum(r.filter(x => x.is_green), 'value') }; });
    const top = [...items].sort((a, b) => b.total - a.total).slice(0, 8).map(i => ({ label: i.name, value: +i.total, green: i.is_green }));
    out.append(el('div', { class: 'charts' },
      el('div', { class: 'card' }, el('h3', {}, 'สัดส่วนมูลค่าสินค้า: เป็นมิตรฯ'), el('div', { class: 'c' }, donut(pGreen, pTot, '#2F7A4F'), el('div', { class: 'small muted' }, `เป็นมิตรฯ ${fmt(pGreen)} จาก ${fmt(pTot)} บาท`))),
      el('div', { class: 'card' }, el('h3', {}, 'สัดส่วนมูลค่าจ้างบริการ: เป็นมิตรฯ'), el('div', { class: 'c' }, donut(sGreen, sTot, '#2C6E9E'), el('div', { class: 'small muted' }, `เป็นมิตรฯ ${fmt(sGreen)} จาก ${fmt(sTot)} บาท`))),
      el('div', { class: 'card wide' }, el('h3', {}, 'มูลค่าจ้างบริการรายเดือน (บาท)'), byMonth.some(x => x.all > 0) ? vbars(byMonth) : el('div', { class: 'muted small' }, '— ยังไม่มีข้อมูล —')),
      el('div', { class: 'card wide' }, el('h3', {}, 'สินค้ามูลค่าสูงสุด 8 อันดับแรก (สีเขียว = เป็นมิตรฯ)'), top.length ? hbars(top) : el('div', { class: 'muted small' }, '— ยังไม่มีข้อมูล —'))));
  }

  return { buildExtra, renderForm, renderDashboard, reporterList, CRITERIA, monthLabel, rowInPeriod, sum };
})();
