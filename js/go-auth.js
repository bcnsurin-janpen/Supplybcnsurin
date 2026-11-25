/* หน้าเข้าสู่ระบบของ Green Office: อีเมล+รหัสผ่าน • ลืมรหัสผ่าน (ส่งลิงก์ไปอีเมลองค์กร) • เปลี่ยนรหัสผ่าน • ตั้งรหัสใหม่จากลิงก์
   ไม่บังคับเปลี่ยนรหัสตั้งต้น (ตามที่ผู้ใช้กำหนด) • ใช้ textContent/DOM เท่านั้น (ไม่ใช้ innerHTML กับข้อมูลผู้ใช้) */
window.GO_AUTH = (function () {
  const DEF_PW = '123456789', KEY = 'goEmails';
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in (attrs || {})) { if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
    for (const c of kids) e.append(c);
    return e;
  }
  function emails() { try { return JSON.parse(localStorage.getItem(KEY) || '[]').filter(x => typeof x === 'string').slice(0, 8); } catch (e) { return []; } }
  function remember(em) { try { const l = [em].concat(emails().filter(x => x !== em)).slice(0, 8); localStorage.setItem(KEY, JSON.stringify(l)); } catch (e) { /* ไม่เก็บก็ได้ */ } }
  function forget() { try { localStorage.removeItem(KEY); } catch (e) { /* */ } }
  function pwField(id, label, auto) {
    const inp = h('input', { type: 'password', id, autocomplete: auto, 'aria-label': label });
    const eye = h('button', { type: 'button', class: 'eye', 'aria-label': 'แสดง/ซ่อนรหัสผ่าน', title: 'แสดง/ซ่อนรหัสผ่าน' }, '👁');
    eye.addEventListener('click', () => { inp.type = inp.type === 'password' ? 'text' : 'password'; });
    return h('label', { class: 'field' }, h('span', { class: 'lab' }, label), h('span', { class: 'pw' }, inp, eye));
  }
  const $ = (root, id) => root.querySelector('#' + id);

  /* ---- หน้าเข้าสู่ระบบ (แทนการส่งไปหน้า admin.html) ---- */
  function showLogin(sb, mount, note) {
    mount.textContent = ''; mount.hidden = false;
    const list = h('datalist', { id: 'goEmails' }); emails().forEach(e => list.append(h('option', { value: e })));
    const em = h('input', { type: 'email', id: 'gEmail', list: 'goEmails', autocomplete: 'username', placeholder: 'ชื่อ@bcnsurin.ac.th', 'aria-label': 'อีเมลองค์กร' });
    const msg = h('div', { id: 'gMsg', class: 'msg', role: 'alert' }, note || '');
    const login = h('button', { type: 'button', class: 'btn pri', id: 'gLogin', style: 'width:100%' }, 'เข้าสู่ระบบ');
    const forgot = h('button', { type: 'button', class: 'lnk', id: 'gForgot' }, 'ลืมรหัสผ่าน');
    const row = h('div', { class: 'linkrow' }, forgot);
    if (emails().length) { const c = h('button', { type: 'button', class: 'lnk' }, 'ล้างอีเมลที่จำไว้ในเครื่องนี้'); c.addEventListener('click', () => { forget(); showLogin(sb, mount); }); row.append(c); }
    const card = h('div', { class: 'card login-card' },
      h('h2', {}, '⚡ Green Office หมวดที่ 6 การจัดซื้อจัดจ้าง'),
      h('div', { class: 'muted small' }, 'เข้าสู่ระบบเพื่อบันทึกข้อมูล — สำหรับเจ้าหน้าที่ที่ได้รับสิทธิ์ ใช้อีเมลองค์กรและรหัสผ่านของระบบ'),
      h('label', { class: 'field' }, h('span', { class: 'lab' }, 'อีเมลองค์กร'), em, list),
      pwField('gPw', 'รหัสผ่าน', 'current-password'), msg, login, row);
    mount.append(card);
    const say = (t, ok) => { msg.textContent = t; msg.className = 'msg ' + (t ? (ok ? 'ok' : 'err') : ''); };
    async function go() {
      const e = em.value.trim().toLowerCase(), pw = $(mount, 'gPw').value; say('');
      if (!e || !pw) return say('กรอกอีเมลและรหัสผ่าน');
      login.disabled = true;
      try {
        const r = await sb.auth.signInWithPassword({ email: e, password: pw });
        if (r.error) return say(/Invalid login/i.test(r.error.message) ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่');
        remember(e); location.reload();
      } catch (x) { say('เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่'); } finally { login.disabled = false; }
    }
    login.addEventListener('click', go); $(mount, 'gPw').addEventListener('keydown', ev => { if (ev.key === 'Enter') go(); });
    forgot.addEventListener('click', async () => {
      const e = em.value.trim().toLowerCase(); if (!e) return say('พิมพ์อีเมลองค์กรก่อน แล้วกด "ลืมรหัสผ่าน"');
      forgot.disabled = true;
      try {
        const r = await sb.auth.resetPasswordForEmail(e, { redirectTo: location.origin + location.pathname });
        say(r.error ? 'ส่งลิงก์ไม่สำเร็จ กรุณาลองใหม่ภายหลัง' : 'ถ้าอีเมลนี้มีบัญชีในระบบ จะได้รับลิงก์ตั้งรหัสใหม่ทางอีเมลองค์กร (ตรวจกล่องจดหมายขยะด้วย) กดขอครั้งเดียวแล้วรอสักครู่', !r.error);
      } catch (x) { say('ส่งลิงก์ไม่สำเร็จ กรุณาลองใหม่ภายหลัง'); } finally { setTimeout(() => { forgot.disabled = false; }, 30000); }
    });
  }

  /* ---- หน้าต่างเปลี่ยนรหัสผ่าน / ตั้งรหัสใหม่จากลิงก์อีเมล ---- */
  function pwDialog(sb, opt) {
    opt = opt || {}; const recovery = !!opt.recovery;
    const old = document.getElementById('goPw'); if (old) old.remove();
    const msg = h('div', { class: 'msg', role: 'alert' });
    const save = h('button', { type: 'button', class: 'btn pri' }, 'บันทึกรหัสผ่านใหม่');
    const cancel = h('button', { type: 'button', class: 'btn' }, recovery ? 'ออกจากระบบ' : 'ยกเลิก');
    const box = h('div', { class: 'modalbox', role: 'dialog', 'aria-modal': 'true' },
      h('h2', {}, recovery ? 'ตั้งรหัสผ่านใหม่' : 'เปลี่ยนรหัสผ่าน'),
      recovery ? h('span') : pwField('pCur', 'รหัสผ่านปัจจุบัน', 'current-password'),
      pwField('pNew', 'รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)', 'new-password'), pwField('pNew2', 'ยืนยันรหัสผ่านใหม่', 'new-password'),
      msg, h('div', { class: 'row', style: 'margin-top:10px' }, save, cancel));
    const wrap = h('div', { class: 'modal', id: 'goPw' }, box); document.body.append(wrap);
    const say = t => { msg.textContent = t; msg.className = 'msg ' + (t ? 'err' : ''); };
    const close = () => wrap.remove();
    cancel.addEventListener('click', async () => { if (recovery) { await sb.auth.signOut(); location.replace(location.pathname); } else close(); });
    save.addEventListener('click', async () => {
      const n = $(box, 'pNew').value, n2 = $(box, 'pNew2').value; say('');
      if (n.length < 8) return say('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัว');
      if (n === DEF_PW) return say('ห้ามใช้รหัสตั้งต้น 123456789 เป็นรหัสใหม่');
      if (n !== n2) return say('ยืนยันรหัสผ่านไม่ตรงกัน');
      save.disabled = true;
      try {
        if (!recovery) {
          const cur = $(box, 'pCur').value; if (cur === n) return say('รหัสใหม่ต้องไม่ซ้ำรหัสเดิม');
          const u = await sb.auth.getUser();
          const r0 = await sb.auth.signInWithPassword({ email: u.data.user.email, password: cur });
          if (r0.error) return say('รหัสผ่านปัจจุบันไม่ถูกต้อง');
        }
        const r = await sb.auth.updateUser({ password: n });
        if (r.error) return say(/different from the old/i.test(r.error.message) ? 'รหัสใหม่ต้องไม่ซ้ำรหัสเดิม' : 'เปลี่ยนรหัสไม่สำเร็จ กรุณาลองใหม่');
        close(); if (recovery) location.replace(location.pathname); else if (opt.done) opt.done('เปลี่ยนรหัสผ่านแล้ว');
      } catch (x) { say('เปลี่ยนรหัสไม่สำเร็จ กรุณาลองใหม่'); } finally { save.disabled = false; }
    });
    $(box, 'pNew').focus();
  }
  return { showLogin, pwDialog };
})();
