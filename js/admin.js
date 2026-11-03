// ============================================
// Admin panel logic — login + CRUD สำหรับทุกตาราง
// ============================================

const TABLE_SCHEMAS = {
  procurement_news: {
    label: 'ข่าวจัดซื้อจัดจ้าง',
    orderBy: 'id', ascending: false,
    fields: [
      { name: 'code', label: 'เลขที่', type: 'text' },
      { name: 'category', label: 'หมวดหมู่', type: 'select', options: [
        ['plan', 'แผนจัดซื้อจัดจ้าง'], ['bid', 'ประกวดราคา'], ['price', 'สอบราคา'], ['result', 'ประกาศผล']
      ], required: true },
      { name: 'title', label: 'หัวข้อ', type: 'text', required: true, full: true },
      { name: 'doc_url', label: 'ลิงก์เอกสาร (ถ้ามี)', type: 'text', full: true },
      { name: 'published_at', label: 'วันที่ประกาศ', type: 'date' },
    ]
  },
  announcements: {
    label: 'ประกาศ',
    orderBy: 'id', ascending: false,
    fields: [
      { name: 'code', label: 'เลขที่', type: 'text' },
      { name: 'category', label: 'หมวดหมู่', type: 'select', options: [
        ['pr', 'ประชาสัมพันธ์'], ['staff', 'บุคลากร'], ['internal', 'ระเบียบภายใน']
      ], required: true },
      { name: 'title', label: 'หัวข้อ', type: 'text', required: true, full: true },
      { name: 'doc_url', label: 'ลิงก์เอกสาร (ถ้ามี)', type: 'text', full: true },
      { name: 'published_at', label: 'วันที่ประกาศ', type: 'date' },
    ]
  },
  knowledge: {
    label: 'คลังความรู้',
    orderBy: 'id', ascending: false,
    fields: [
      { name: 'code', label: 'เลขที่ / ปี', type: 'text' },
      { name: 'category', label: 'หมวดหมู่', type: 'select', options: [
        ['law', 'พระราชบัญญัติ'], ['regulation', 'ระเบียบ'], ['ministerial', 'กฎกระทรวง'],
        ['manual', 'คู่มือปฏิบัติงาน'], ['flow', 'Flowchart']
      ], required: true },
      { name: 'title', label: 'ชื่อเรื่อง', type: 'text', required: true, full: true },
      { name: 'doc_url', label: 'ลิงก์ไฟล์ (ถ้ามี)', type: 'text', full: true },
    ]
  },
  downloads: {
    label: 'ดาวน์โหลดเอกสาร',
    orderBy: 'id', ascending: false,
    fields: [
      { name: 'code', label: 'ประเภทไฟล์ (เช่น PDF, DOCX)', type: 'text' },
      { name: 'category', label: 'หมวดหมู่', type: 'select', options: [
        ['purchase', 'แบบฟอร์มจัดซื้อจัดจ้าง'], ['asset', 'แบบฟอร์มครุภัณฑ์/ทรัพย์สิน']
      ], required: true },
      { name: 'title', label: 'ชื่อแบบฟอร์ม', type: 'text', required: true, full: true },
      { name: 'doc_url', label: 'ลิงก์ไฟล์', type: 'text', full: true },
    ]
  },
  systems: {
    label: 'ระบบภายใน',
    orderBy: 'sort_order', ascending: true,
    fields: [
      { name: 'name', label: 'ชื่อระบบ', type: 'text', required: true },
      { name: 'icon', label: 'ไอคอน (emoji)', type: 'text' },
      { name: 'description', label: 'คำอธิบาย', type: 'textarea', full: true },
      { name: 'color', label: 'สี', type: 'select', options: [
        ['sky', 'ฟ้า'], ['sage', 'เขียว'], ['amber', 'ส้ม'], ['lilac', 'ม่วง'], ['blush', 'ชมพู']
      ] },
      { name: 'login_url', label: 'ลิงก์เข้าระบบ (ว่างไว้ถ้ายังไม่พร้อม)', type: 'text' },
      { name: 'status', label: 'ข้อความสถานะ', type: 'text' },
      { name: 'sort_order', label: 'ลำดับการแสดง', type: 'number' },
    ]
  },
  faq: {
    label: 'ถาม-ตอบ',
    orderBy: 'sort_order', ascending: true,
    fields: [
      { name: 'question', label: 'คำถาม', type: 'text', required: true, full: true },
      { name: 'answer', label: 'คำตอบ', type: 'textarea', required: true, full: true },
      { name: 'sort_order', label: 'ลำดับการแสดง', type: 'number' },
    ]
  }
};

let currentTable = 'procurement_news';
let editingId = null;

// ---------- อัปโหลดไฟล์ขึ้น Supabase Storage (bucket: documents) ----------
// ชนิดไฟล์ที่อนุญาต (ไม่รวม HTML/SVG/EXE เพื่อความปลอดภัย) และขนาดสูงสุด
const UPLOAD_BUCKET = 'documents';
const UPLOAD_MAX_MB = 10;
const UPLOAD_TYPES = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg'
};

function randomHex(bytes) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

function uploadControlHtml(fieldName) {
  const accept = Object.keys(UPLOAD_TYPES).map(e => '.' + e).join(',');
  return `<div style="margin-top:0.4rem;">
    <input type="file" id="up_${fieldName}" accept="${accept}">
    <div id="upStatus_${fieldName}" style="font-size:0.82rem; margin-top:0.25rem;"></div>
    <div style="font-size:0.78rem; color: var(--ink-soft); margin-top:0.15rem;">หรือเลือกไฟล์เพื่ออัปโหลด (PDF, Word, Excel, PowerPoint, รูปภาพ ไม่เกิน ${UPLOAD_MAX_MB} MB) ระบบจะใส่ลิงก์ให้อัตโนมัติ</div>
  </div>`;
}

async function handleUpload(inputEl, fieldName) {
  const status = document.getElementById('upStatus_' + fieldName);
  const target = document.getElementById('f_' + fieldName);
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;
  status.style.color = '';
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!UPLOAD_TYPES[ext]) {
    status.style.color = 'var(--stamp, #b3261e)';
    status.textContent = 'ชนิดไฟล์ไม่ได้รับอนุญาต (ใช้ได้: ' + Object.keys(UPLOAD_TYPES).join(', ') + ')';
    inputEl.value = '';
    return;
  }
  if (file.size > UPLOAD_MAX_MB * 1024 * 1024) {
    status.style.color = 'var(--stamp, #b3261e)';
    status.textContent = 'ไฟล์ใหญ่เกิน ' + UPLOAD_MAX_MB + ' MB';
    inputEl.value = '';
    return;
  }
  // ชื่อไฟล์บนเซิร์ฟเวอร์สร้างใหม่ (ไม่ใช้ชื่อเดิม) กันชื่อซ้ำ/อักขระแปลก และเดาลิงก์ไม่ได้
  const path = currentTable + '/' + new Date().toISOString().slice(0, 10) + '-' + randomHex(8) + '.' + ext;
  inputEl.disabled = true;
  status.textContent = 'กำลังอัปโหลด...';
  const { error } = await supabaseClient.storage.from(UPLOAD_BUCKET)
    .upload(path, file, { contentType: UPLOAD_TYPES[ext], upsert: false, cacheControl: '3600' });
  inputEl.disabled = false;
  inputEl.value = '';
  if (error) {
    status.style.color = 'var(--stamp, #b3261e)';
    status.textContent = 'อัปโหลดไม่สำเร็จ: ' + error.message;
    return;
  }
  const { data } = supabaseClient.storage.from(UPLOAD_BUCKET).getPublicUrl(path);
  target.value = data.publicUrl;
  // ช่อง "ประเภทไฟล์" ของหน้าดาวน์โหลด: เติมให้อัตโนมัติถ้ายังว่าง
  const codeEl = document.getElementById('f_code');
  if (currentTable === 'downloads' && codeEl && !codeEl.value) codeEl.value = ext.toUpperCase();
  status.style.color = 'var(--sage-ink, #1b6e3c)';
  status.textContent = 'อัปโหลดแล้ว ✓ ใส่ลิงก์ให้เรียบร้อย (กดบันทึกรายการด้านล่างเพื่อยืนยัน)';
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function showToast(message, isError) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast' + (isError ? ' error' : '');
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ---------- Auth ----------
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    errorEl.textContent = 'เข้าสู่ระบบไม่สำเร็จ: อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    return;
  }
  showApp();
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  showLogin();
}

function showLogin() {
  document.getElementById('loginView').style.display = 'flex';
  document.getElementById('appView').style.display = 'none';
}

function showApp() {
  document.getElementById('loginView').style.display = 'none';
  document.getElementById('appView').style.display = 'block';
  renderTabs();
  switchTable(currentTable);
}

// ---------- Tabs ----------
function renderTabs() {
  const tabsEl = document.getElementById('adminTabs');
  tabsEl.innerHTML = Object.entries(TABLE_SCHEMAS).map(([key, schema]) =>
    `<button class="admin-tab${key === currentTable ? ' is-active' : ''}" data-table="${key}">${esc(schema.label)}</button>`
  ).join('');
  tabsEl.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTable(btn.dataset.table));
  });
}

function switchTable(tableName) {
  currentTable = tableName;
  editingId = null;
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.toggle('is-active', b.dataset.table === tableName));
  renderFormCard();
  loadRows();
}

// ---------- Form ----------
function renderFormCard() {
  const schema = TABLE_SCHEMAS[currentTable];
  const card = document.getElementById('formCard');
  const title = editingId ? `แก้ไขรายการ (#${editingId})` : `เพิ่มรายการใหม่ — ${schema.label}`;

  const fieldsHtml = schema.fields.map(f => {
    const fullClass = f.full ? ' full' : '';
    let inputHtml = '';
    if (f.type === 'select') {
      inputHtml = `<select id="f_${f.name}">` +
        `<option value="">- เลือก -</option>` +
        f.options.map(([val, label]) => `<option value="${esc(val)}">${esc(label)}</option>`).join('') +
        `</select>`;
    } else if (f.type === 'textarea') {
      inputHtml = `<textarea id="f_${f.name}"></textarea>`;
    } else {
      inputHtml = `<input type="${f.type}" id="f_${f.name}">`;
      if (f.name === 'doc_url') inputHtml += uploadControlHtml(f.name);
    }
    return `<div class="field${fullClass}"><label>${esc(f.label)}${f.required ? ' *' : ''}</label>${inputHtml}</div>`;
  }).join('');

  card.innerHTML = `
    <h3>${esc(title)}</h3>
    <div class="admin-form-grid">${fieldsHtml}</div>
    <div class="admin-form-actions">
      <button class="btn btn-primary" id="saveBtn" type="button">${editingId ? 'บันทึกการแก้ไข' : 'เพิ่มรายการ'}</button>
      ${editingId ? '<button class="btn btn-ghost" id="cancelEditBtn" type="button">ยกเลิก</button>' : ''}
    </div>
    <div class="field-error" id="formError"></div>
  `;

  document.getElementById('saveBtn').addEventListener('click', saveRow);
  const upInput = document.getElementById('up_doc_url');
  if (upInput) upInput.addEventListener('change', () => handleUpload(upInput, 'doc_url'));
  const cancelBtn = document.getElementById('cancelEditBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', () => { editingId = null; renderFormCard(); });
}

function fillFormForEdit(row) {
  const schema = TABLE_SCHEMAS[currentTable];
  schema.fields.forEach(f => {
    const el = document.getElementById('f_' + f.name);
    if (el) el.value = row[f.name] == null ? '' : row[f.name];
  });
}

async function saveRow() {
  const schema = TABLE_SCHEMAS[currentTable];
  const errorEl = document.getElementById('formError');
  errorEl.textContent = '';

  const payload = {};
  for (const f of schema.fields) {
    const el = document.getElementById('f_' + f.name);
    let val = el.value.trim();
    if (f.required && !val) {
      errorEl.textContent = `กรุณากรอก "${f.label}"`;
      return;
    }
    if (f.type === 'number') {
      payload[f.name] = val ? parseInt(val, 10) : null;
    } else {
      payload[f.name] = val || null;
    }
  }

  let result;
  if (editingId) {
    result = await supabaseClient.from(currentTable).update(payload).eq('id', editingId);
  } else {
    result = await supabaseClient.from(currentTable).insert(payload);
  }

  if (result.error) {
    errorEl.textContent = 'บันทึกไม่สำเร็จ: ' + result.error.message;
    return;
  }

  showToast(editingId ? 'แก้ไขรายการสำเร็จ' : 'เพิ่มรายการสำเร็จ');
  editingId = null;
  renderFormCard();
  loadRows();
}

// ---------- List ----------
async function loadRows() {
  const schema = TABLE_SCHEMAS[currentTable];
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = `<tr><td colspan="${schema.fields.length + 1}">กำลังโหลด...</td></tr>`;

  const { data, error } = await supabaseClient
    .from(currentTable)
    .select('*')
    .order(schema.orderBy, { ascending: schema.ascending });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="${schema.fields.length + 1}">โหลดข้อมูลไม่สำเร็จ: ${esc(error.message)}</td></tr>`;
    return;
  }
  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${schema.fields.length + 1}">ยังไม่มีข้อมูล</td></tr>`;
    return;
  }

  const theadRow = document.getElementById('tableHeadRow');
  theadRow.innerHTML = schema.fields.map(f => `<th>${esc(f.label)}</th>`).join('') + '<th></th>';

  tbody.innerHTML = data.map(row => {
    const cells = schema.fields.map(f => {
      let val = row[f.name];
      if (f.type === 'select') {
        const opt = f.options.find(o => o[0] === val);
        val = opt ? opt[1] : val;
      }
      if (f.name === 'title' || f.name === 'question' || f.name === 'answer' || f.name === 'description') {
        return `<td>${esc(val)}</td>`;
      }
      return `<td class="mono" style="font-size:0.82rem;">${esc(val)}</td>`;
    }).join('');
    return `<tr>
      ${cells}
      <td class="row-actions">
        <button data-edit="${row.id}">แก้ไข</button>
        <button class="danger" data-delete="${row.id}">ลบ</button>
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.edit, 10);
      const row = data.find(r => r.id === id);
      editingId = id;
      renderFormCard();
      fillFormForEdit(row);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
  tbody.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('ยืนยันการลบรายการนี้? การลบไม่สามารถย้อนกลับได้')) return;
      const id = parseInt(btn.dataset.delete, 10);
      const { error } = await supabaseClient.from(currentTable).delete().eq('id', id);
      if (error) {
        showToast('ลบไม่สำเร็จ: ' + error.message, true);
        return;
      }
      showToast('ลบรายการสำเร็จ');
      loadRows();
    });
  });
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    showApp();
  } else {
    showLogin();
  }
});
