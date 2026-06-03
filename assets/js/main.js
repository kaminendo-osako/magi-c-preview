// MAGI-C — interactions

// Sticky header background on scroll
const header = document.getElementById('header');
const onScroll = () => {
  if (!header) return;
  header.classList.toggle('is-scrolled', window.scrollY > 40);
};
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Mobile nav toggle
const toggle = document.getElementById('navToggle');
const nav = document.getElementById('nav');
if (toggle && nav) {
  const setOpen = (open) => {
    toggle.classList.toggle('is-open', open);
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  };
  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
  nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
}

// 営業カレンダー（カフェ）— 貸切/定休日を判別して表示
(() => {
  const root = document.getElementById('cafeCalendar');
  if (!root) return;

  const titleEl = root.querySelector('[data-cal-title]');
  const dowEl = root.querySelector('[data-cal-dow]');
  const bodyEl = root.querySelector('[data-cal-body]');
  const prevBtn = root.querySelector('[data-cal-prev]');
  const nextBtn = root.querySelector('[data-cal-next]');

  const DOW = ['日', '月', '火', '水', '木', '金', '土'];
  const LABEL = { open: '営業', full: '貸切', closed: '定休' };

  // --- 仮データ（本番では予約・貸切状況と連動）---
  const closedWeekdays = [2]; // 火曜定休
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fullDates = new Set();
  [[0, 8], [0, 9], [0, 20], [1, 3], [1, 15]].forEach(([mOff, day]) => {
    fullDates.add(key(new Date(today.getFullYear(), today.getMonth() + mOff, day)));
  });

  const statusOf = (date) => {
    if (closedWeekdays.includes(date.getDay())) return 'closed';
    if (fullDates.has(key(date))) return 'full';
    return 'open';
  };

  DOW.forEach((d) => {
    const c = document.createElement('div');
    c.className = 'cal__dow';
    c.textContent = d;
    dowEl.appendChild(c);
  });

  let view = new Date(today.getFullYear(), today.getMonth(), 1);

  const render = () => {
    titleEl.textContent = `${view.getFullYear()}年 ${view.getMonth() + 1}月`;
    bodyEl.innerHTML = '';
    const startPad = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
    const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    for (let i = 0; i < startPad; i++) {
      const e = document.createElement('div');
      e.className = 'cal__cell is-empty';
      bodyEl.appendChild(e);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(view.getFullYear(), view.getMonth(), day);
      const st = statusOf(date);
      const cell = document.createElement('div');
      cell.className = `cal__cell ${st}${key(date) === key(today) ? ' today' : ''}`;
      cell.innerHTML = `<span>${day}</span><span class="dot"></span>`;
      cell.title = LABEL[st];
      cell.setAttribute('aria-label', `${view.getMonth() + 1}月${day}日 ${LABEL[st]}`);
      bodyEl.appendChild(cell);
    }
  };

  prevBtn.addEventListener('click', () => { view.setMonth(view.getMonth() - 1); render(); });
  nextBtn.addEventListener('click', () => { view.setMonth(view.getMonth() + 1); render(); });
  render();
})();

// Reveal on scroll
const revealEls = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window && revealEls.length) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  revealEls.forEach((el) => io.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add('is-visible'));
}
