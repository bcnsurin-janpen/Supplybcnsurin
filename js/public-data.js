// ============================================
// ดึงข้อมูลจาก Supabase มาแสดงในหน้าเว็บสาธารณะ
// ============================================

const CATEGORY_META = {
  procurement_news: {
    containerId: 'pnList',
    dateField: 'published_at',
    categories: {
      plan:   { label: 'แผนจัดซื้อจัดจ้าง', color: 'sage' },
      bid:    { label: 'ประกวดราคา',        color: 'amber' },
      price:  { label: 'สอบราคา',           color: 'sky' },
      result: { label: 'ประกาศผล',          color: 'stamp' },
    }
  },
  announcements: {
    containerId: 'annList',
    dateField: 'published_at',
    categories: {
      pr:       { label: 'ประชาสัมพันธ์',   color: 'sky' },
      staff:    { label: 'บุคลากร',         color: 'sage' },
      internal: { label: 'ระเบียบภายใน',    color: 'lilac' },
    }
  },
  knowledge: {
    containerId: 'knowList',
    dateField: null,
    categories: {
      law:         { label: 'พระราชบัญญัติ',    color: 'sky' },
      regulation:  { label: 'ระเบียบ',          color: 'sage' },
      ministerial: { label: 'กฎกระทรวง',        color: 'amber' },
      manual:      { label: 'คู่มือปฏิบัติงาน', color: 'lilac' },
      flow:        { label: 'Flowchart',        color: 'blush' },
    }
  },
  downloads: {
    containerId: 'dlList',
    dateField: null,
    categories: {
      purchase: { label: 'แบบฟอร์มจัดซื้อจัดจ้าง',      color: 'sky' },
      asset:    { label: 'แบบฟอร์มครุภัณฑ์/ทรัพย์สิน', color: 'sage' },
    }
  }
};

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function formatThaiDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function emptyState(container, message) {
  container.innerHTML = `<p style="padding:1.75rem; color: var(--ink-soft); text-align:center;">${message}</p>`;
}

async function renderLedger(tableName) {
  const meta = CATEGORY_META[tableName];
  const container = document.getElementById(meta.containerId);
  if (!container) return;

  const { data, error } = await supabaseClient.from(tableName).select('*').order('id', { ascending: false });

  if (error) {
    emptyState(container, 'ไม่สามารถโหลดข้อมูลได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง');
    return;
  }
  if (!data || data.length === 0) {
    emptyState(container, 'ยังไม่มีข้อมูลในขณะนี้');
    return;
  }

  container.innerHTML = data.map(row => {
    const cat = meta.categories[row.category] || { label: row.category || '', color: 'sky' };
    const hasLink = row.doc_url && row.doc_url.trim();
    const href = hasLink ? row.doc_url : '#';
    const dateText = meta.dateField ? formatThaiDate(row[meta.dateField]) : '';
    const goText = dateText ? `${dateText} →` : 'ดูรายละเอียด →';
    return `
      <a class="ledger-row" href="${escapeHtml(href)}" data-category="${escapeHtml(row.category || '')}"${hasLink ? ' target="_blank" rel="noopener"' : ''}>
        <span class="code mono">${escapeHtml(row.code || '')}</span>
        <span class="main">
          <span class="cat ${cat.color}">${escapeHtml(cat.label)}</span>
          <h4>${escapeHtml(row.title)}</h4>
        </span>
        <span class="go">${goText}</span>
      </a>`;
  }).join('');

  if (window.setupChipFilter) window.setupChipFilter(meta.containerId);
}

async function renderSystems() {
  const container = document.getElementById('systemsGrid');
  if (!container) return;

  const { data, error } = await supabaseClient.from('systems').select('*').order('sort_order', { ascending: true });

  if (error || !data || data.length === 0) {
    emptyState(container, 'ยังไม่มีระบบภายในในขณะนี้');
    return;
  }

  const colorVarMap = { sky: 'var(--tab-sky)', sage: 'var(--tab-sage)', amber: 'var(--tab-amber)', lilac: 'var(--tab-lilac)', blush: 'var(--stamp-bg)' };

  container.innerHTML = data.map(sys => {
    const bg = colorVarMap[sys.color] || 'var(--tab-sky)';
    const hasLink = sys.login_url && sys.login_url.trim();
    const linkHtml = hasLink
      ? `<a class="btn btn-ghost" href="${escapeHtml(sys.login_url)}">เข้าสู่ระบบ →</a>`
      : `<a class="btn btn-ghost" href="#" aria-disabled="true" onclick="return false;">เข้าสู่ระบบ →</a>`;
    return `
      <div class="system-card">
        <div class="top">
          <div class="icon" style="background: ${bg};" aria-hidden="true">${escapeHtml(sys.icon || '🗂️')}</div>
          <span class="lock-badge">🔒 ต้องเข้าสู่ระบบ</span>
        </div>
        <h3>${escapeHtml(sys.name)}</h3>
        <p>${escapeHtml(sys.description || '')}</p>
        <span class="status mono">สถานะ: ${escapeHtml(sys.status || '')}</span>
        ${linkHtml}
      </div>`;
  }).join('');
}

async function renderFaq() {
  const container = document.getElementById('faqList');
  if (!container) return;

  const { data, error } = await supabaseClient.from('faq').select('*').order('sort_order', { ascending: true });

  if (error || !data || data.length === 0) {
    emptyState(container, 'ยังไม่มีคำถามที่พบบ่อยในขณะนี้');
    return;
  }

  container.innerHTML = data.map((item, i) => `
    <details class="faq-item"${i === 0 ? ' open' : ''}>
      <summary>
        <span style="display:flex; align-items:center; gap:0.9rem;">
          <span class="q-mark" aria-hidden="true">Q</span>
          ${escapeHtml(item.question)}
        </span>
        <span class="chevron" aria-hidden="true">▾</span>
      </summary>
      <div class="faq-answer">${escapeHtml(item.answer)}</div>
    </details>`).join('');
}

async function renderHomeLatest() {
  const container = document.getElementById('homeLatest');
  if (!container) return;

  const { data, error } = await supabaseClient.from('announcements').select('*').order('id', { ascending: false }).limit(3);

  if (error || !data || data.length === 0) {
    emptyState(container, 'ยังไม่มีข่าวประชาสัมพันธ์ในขณะนี้');
    return;
  }

  const meta = CATEGORY_META.announcements;
  container.innerHTML = data.map(row => {
    const cat = meta.categories[row.category] || { label: row.category || '', color: 'sky' };
    const dateText = formatThaiDate(row.published_at);
    return `
      <a class="ledger-row" href="announcements.html">
        <span class="code mono">${escapeHtml(row.code || '')}</span>
        <span class="main">
          <span class="cat ${cat.color}">${escapeHtml(cat.label)}</span>
          <h4>${escapeHtml(row.title)}</h4>
        </span>
        <span class="go">${dateText ? dateText + ' →' : '→'}</span>
      </a>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof supabaseClient === 'undefined') return;
  renderLedger('procurement_news');
  renderLedger('announcements');
  renderLedger('knowledge');
  renderLedger('downloads');
  renderSystems();
  renderFaq();
  renderHomeLatest();
});
