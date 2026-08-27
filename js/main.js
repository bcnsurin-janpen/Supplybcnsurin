// ---------- เมนูมือถือ ----------
const navToggle = document.getElementById('navToggle');
const mainNav = document.getElementById('mainNav');

if (navToggle && mainNav) {
  navToggle.addEventListener('click', () => {
    const isOpen = mainNav.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });
}

// ---------- ตัวกรองหมวดหมู่ (chip) ----------
// ใช้ได้ทั้งหน้ากฎหมาย (#lawList) และหน้าประกาศ (#annList)
function setupChipFilter(listId) {
  const list = document.getElementById(listId);
  if (!list) return;

  const chips = document.querySelectorAll('.chip');
  const rows = list.querySelectorAll('.ledger-row');

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');

      const filter = chip.dataset.filter;
      rows.forEach((row) => {
        const match = filter === 'all' || row.dataset.category === filter;
        row.style.display = match ? '' : 'none';
      });
    });
  });
}

setupChipFilter('pnList');
setupChipFilter('annList');
setupChipFilter('knowList');
setupChipFilter('dlList');
