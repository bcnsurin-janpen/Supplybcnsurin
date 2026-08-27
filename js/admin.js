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
