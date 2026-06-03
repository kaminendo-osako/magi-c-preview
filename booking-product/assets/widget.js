/* =========================================================
   Booking Widget engine（製品プロトタイプ）
   - サイト非依存・自己完結（外部ライブラリ不要）
   - 設定(config)で項目・料金・決済手段を差し替え可能
   - デモモード：MGCB_CONFIG が空 → DB接続なしで従来どおり動作
   - ライブモード：MGCB_CONFIG に URL + anon キー → Supabaseに予約保存
       空き状況 = month_availability / 枠空き = day_slots / 予約 = create_booking
       ※Phase 2-a は「予約保存のみ・決済なし」。決済は Phase 2-b。
   ========================================================= */
(() => {
  const root = document.querySelector('.mgcb');
  if (!root) return;

  // ---- 接続設定（supabase-config.js から）----
  const RT = window.MGCB_CONFIG || {};
  let live = !!(RT.supabaseUrl && RT.supabaseAnonKey); // 資格情報があればライブ
  const spaceSlug = RT.spaceSlug || 'rental';

  // ---- 設定（デモ既定値。ライブ時はDBの値で上書き）----
  const config = {
    brand: 'MAGI-C',
    title: 'レンタルスペース予約',
    closedWeekdays: [2],                       // 火曜定休（仮）
    timeSlots: ['10:00–12:00', '13:00–16:00', '17:00–21:00'],
    plans: [
      { id: 'basic', name: '基本利用', note: '1時間〜', price: 3000 },
      { id: 'half',  name: '半日プラン', note: '4時間', price: 9000 },
      { id: 'full',  name: '1日プラン', note: '8時間', price: 16000 },
    ],
    // 決済手段：merchantごとに有効/無効を切替（審査に応じてSquare等を追加可能）
    payments: [
      { id: 'stripe', name: 'クレジットカード', provider: 'Stripe', enabled: true,  note: '事前決済（Visa / Mastercard ほか）' },
      { id: 'square', name: 'クレジットカード', provider: 'Square', enabled: false, note: '審査・店舗状況により有効化' },
      { id: 'bank',   name: '銀行振込',         provider: 'Bank',   enabled: false, note: '事前振込での前払い' },
    ],
    _slotByLabel: {},                          // ライブ時：表示ラベル → DBの枠コード
  };

  const fmt = (n) => '¥' + n.toLocaleString('ja-JP');
  const state = { step: 1, date: null, slot: null, planId: null, name: '', email: '', tel: '', people: 1, paymentId: null };

  // =========================================================
  //  Supabase REST ヘルパー（ライブモードのみ・外部依存なし）
  // =========================================================
  const api = {
    base: (RT.supabaseUrl || '').replace(/\/+$/, ''),
    headers() {
      return {
        apikey: RT.supabaseAnonKey,
        Authorization: 'Bearer ' + RT.supabaseAnonKey,
        'Content-Type': 'application/json',
      };
    },
    async select(path) {
      const r = await fetch(`${this.base}/rest/v1/${path}`, { headers: this.headers() });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    },
    async rpc(fn, body) {
      const r = await fetch(`${this.base}/rest/v1/rpc/${fn}`, {
        method: 'POST', headers: this.headers(), body: JSON.stringify(body),
      });
      if (!r.ok) {
        let e = null; try { e = await r.json(); } catch (_) {}
        throw new Error((e && (e.message || e.hint || e.code)) || ('HTTP ' + r.status));
      }
      return r.json();
    },
  };

  let spaceId = null;
  let monthCache = {};                          // 'YYYY-M' → { 'YYYY-MM-DD': status }

  // マスタ（スペース/枠/プラン/定休）をDBから読み込み、config を上書き
  async function loadMaster() {
    const sp = await api.select(`space?slug=eq.${encodeURIComponent(spaceSlug)}&is_active=eq.true&select=id,name&limit=1`);
    if (!sp.length) throw new Error('space_not_found');
    spaceId = sp[0].id;

    const slots = await api.select(`time_slot?space_id=eq.${spaceId}&is_active=eq.true&order=sort_order&select=code,label`);
    if (slots.length) {
      config.timeSlots = slots.map((s) => s.label);
      config._slotByLabel = {};
      slots.forEach((s) => { config._slotByLabel[s.label] = s.code; });
    }

    const plans = await api.select(`plan?space_id=eq.${spaceId}&is_active=eq.true&order=sort_order&select=code,name,note,price_yen`);
    if (plans.length) {
      config.plans = plans.map((p) => ({ id: p.code, name: p.name, note: p.note || '', price: p.price_yen }));
    }

    const cw = await api.select(`closed_weekday?space_id=eq.${spaceId}&select=weekday`);
    config.closedWeekdays = cw.map((x) => x.weekday);

    // Phase 2-a は決済なし。支払い選択は「予約のみ」に置き換える（虚偽表示を避ける）
    config.payments = [
      { id: 'reserve', name: '予約のみ（お支払いは別途ご案内）', provider: '予約', enabled: true, note: 'この段階ではお支払いは発生しません' },
    ];
  }

  async function loadMonth(y, m) {
    const ck = `${y}-${m}`;
    if (monthCache[ck]) return monthCache[ck];
    const rows = await api.rpc('month_availability', { p_space_id: spaceId, p_year: y, p_month: m + 1 });
    const map = {};
    rows.forEach((r) => { map[r.d] = r.status; });
    monthCache[ck] = map;
    return map;
  }

  // ---- DOM refs ----
  const panels = root.querySelectorAll('.mgcb__panel');
  const stepBars = root.querySelectorAll('.mgcb__steps li');
  const stepNote = root.querySelector('[data-stepnote]');
  const backBtn = root.querySelector('[data-back]');
  const nextBtn = root.querySelector('[data-next]');
  const TOTAL_STEPS = panels.length;
  const STEP_LABELS = ['日時とプランを選ぶ', 'お客様情報', 'お支払い方法の選択', '予約完了'];

  // ---- カレンダー ----
  const calTitle = root.querySelector('[data-cal-title]');
  const calBody = root.querySelector('[data-cal-body]');
  const calDow = root.querySelector('[data-cal-dow]');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fullDates = new Set(); // デモ用：貸切で不可（仮）
  [[0, 8], [0, 20], [1, 3]].forEach(([m, day]) => fullDates.add(key(new Date(today.getFullYear(), today.getMonth() + m, day))));

  ['日', '月', '火', '水', '木', '金', '土'].forEach((d) => {
    const c = document.createElement('div'); c.className = 'mgcb-cal__dow'; c.textContent = d; calDow.appendChild(c);
  });
  let view = new Date(today.getFullYear(), today.getMonth(), 1);

  const statusOf = (d) => {
    if (live) {
      const map = monthCache[`${view.getFullYear()}-${view.getMonth()}`] || {};
      return map[key(d)] || (d < today ? 'closed' : 'open');
    }
    if (d < today) return 'closed';
    if (config.closedWeekdays.includes(d.getDay())) return 'closed';
    if (fullDates.has(key(d))) return 'full';
    return 'open';
  };

  async function renderCal() {
    if (live) { try { await loadMonth(view.getFullYear(), view.getMonth()); } catch (e) { console.error('[MGCB]', e); } }
    calTitle.textContent = `${view.getFullYear()}年 ${view.getMonth() + 1}月`;
    calBody.innerHTML = '';
    const startPad = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
    const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    for (let i = 0; i < startPad; i++) { const e = document.createElement('div'); e.className = 'mgcb-cal__cell is-empty'; calBody.appendChild(e); }
    for (let day = 1; day <= days; day++) {
      const date = new Date(view.getFullYear(), view.getMonth(), day);
      const st = statusOf(date);
      const cell = document.createElement('div');
      cell.className = `mgcb-cal__cell ${st}` + (state.date === key(date) ? ' is-selected' : '');
      cell.textContent = day;
      if (st === 'open') {
        cell.setAttribute('role', 'button'); cell.tabIndex = 0;
        const pick = () => { state.date = key(date); renderCal(); if (live) applyDaySlots(); syncNext(); };
        cell.addEventListener('click', pick);
        cell.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      }
      calBody.appendChild(cell);
    }
  }
  root.querySelector('[data-cal-prev]').addEventListener('click', () => { view.setMonth(view.getMonth() - 1); renderCal(); });
  root.querySelector('[data-cal-next]').addEventListener('click', () => { view.setMonth(view.getMonth() + 1); renderCal(); });

  // ---- 選択肢の生成（slots / plans / payments）----
  const slotWrap = root.querySelector('[data-slots]');
  const planWrap = root.querySelector('[data-plans]');
  const payWrap = root.querySelector('[data-payments]');
  const slotButtons = []; // ライブ時の枠無効化に使用

  function buildOptions() {
    // 時間枠
    slotWrap.innerHTML = ''; slotButtons.length = 0;
    config.timeSlots.forEach((s) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'mgcb-opt'; b.innerHTML = `<span>${s}</span>`;
      b.addEventListener('click', () => { state.slot = s; slotWrap.querySelectorAll('.mgcb-opt').forEach((o) => o.classList.remove('is-selected')); b.classList.add('is-selected'); syncNext(); });
      slotWrap.appendChild(b);
      slotButtons.push({ btn: b, label: s });
    });

    // プラン
    planWrap.innerHTML = '';
    config.plans.forEach((p) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'mgcb-opt';
      b.innerHTML = `<span>${p.name}<small>${p.note}</small></span><span class="price">${fmt(p.price)}</span>`;
      b.addEventListener('click', () => { state.planId = p.id; planWrap.querySelectorAll('.mgcb-opt').forEach((o) => o.classList.remove('is-selected')); b.classList.add('is-selected'); syncNext(); });
      planWrap.appendChild(b);
    });

    // 決済方法（有効なものだけ選択可。差し替え可能を表現）
    payWrap.innerHTML = '';
    config.payments.forEach((pay) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'mgcb-opt'; b.disabled = !pay.enabled;
      b.innerHTML = `<span>${pay.name}<small>${pay.note}</small></span><span class="badge">${pay.provider}${pay.enabled ? '' : '・準備中'}</span>`;
      if (pay.enabled) b.addEventListener('click', () => { state.paymentId = pay.id; payWrap.querySelectorAll('.mgcb-opt').forEach((o) => o.classList.remove('is-selected')); b.classList.add('is-selected'); syncNext(); });
      payWrap.appendChild(b);
    });

    // ライブ（決済なし）では確認画面の注意書きを実態に合わせる
    if (live) {
      const sec = root.querySelector('.mgcb-secure');
      if (sec) sec.textContent = 'ご予約内容を送信します（この段階ではお支払いは発生しません）。';
    }
  }

  // 選択日の枠ごとの空きをDBから取得し、埋まっている枠を無効化（ライブのみ）
  async function applyDaySlots() {
    if (!live || !state.date) return;
    let rows;
    try { rows = await api.rpc('day_slots', { p_space_id: spaceId, p_date: state.date }); }
    catch (e) { console.error('[MGCB]', e); return; }
    const avail = {}; rows.forEach((r) => { avail[r.label] = r.available; });
    slotButtons.forEach(({ btn, label }) => {
      const ok = avail[label] !== false;
      btn.disabled = !ok;
      if (!ok && state.slot === label) { state.slot = null; btn.classList.remove('is-selected'); }
    });
    syncNext();
  }

  // ---- フォーム ----
  ['name', 'email', 'tel', 'people'].forEach((f) => {
    const el = root.querySelector(`[name="${f}"]`);
    if (el) el.addEventListener('input', () => { state[f] = el.value; syncNext(); });
  });

  // ---- エラー表示（確認パネル内に動的生成）----
  let errEl = null;
  function showError(msg) {
    if (!errEl) {
      errEl = document.createElement('p');
      errEl.className = 'mgcb-error';
      errEl.setAttribute('role', 'alert');
      panels[2].appendChild(errEl);
    }
    errEl.textContent = msg;
    errEl.style.display = '';
  }
  function clearError() { if (errEl) errEl.style.display = 'none'; }

  // ---- ステップ制御 ----
  const planById = (id) => config.plans.find((p) => p.id === id);
  function canAdvance() {
    if (state.step === 1) return state.date && state.slot && state.planId;
    if (state.step === 2) return state.name && /\S+@\S+\.\S+/.test(state.email) && state.tel;
    if (state.step === 3) return !!state.paymentId;
    return false;
  }
  function syncNext() { if (nextBtn) nextBtn.disabled = !canAdvance(); }

  function renderSummary() {
    const p = planById(state.planId);
    root.querySelector('[data-sum-date]').textContent = state.date || '—';
    root.querySelector('[data-sum-slot]').textContent = state.slot || '—';
    root.querySelector('[data-sum-plan]').textContent = p ? p.name : '—';
    root.querySelector('[data-sum-people]').textContent = state.people + '名';
    root.querySelector('[data-sum-total]').textContent = p ? fmt(p.price) : '—';
  }

  function go(step) {
    state.step = step;
    panels.forEach((pl, i) => pl.classList.toggle('is-current', i === step - 1));
    stepBars.forEach((b, i) => { b.classList.toggle('is-active', i === step - 1); b.classList.toggle('is-done', i < step - 1); });
    if (stepNote) stepNote.textContent = `ステップ ${Math.min(step, TOTAL_STEPS)} / ${TOTAL_STEPS}　—　${STEP_LABELS[step - 1]}`;
    if (backBtn) backBtn.style.visibility = step > 1 && step < TOTAL_STEPS ? 'visible' : 'hidden';
    if (nextBtn) {
      nextBtn.style.display = step < TOTAL_STEPS ? '' : 'none';
      nextBtn.textContent = step === 3 ? (live ? '予約を確定する' : 'お支払いへ進む') : '次へ';
    }
    if (step === 3) { clearError(); renderSummary(); }
    syncNext();
  }

  nextBtn && nextBtn.addEventListener('click', async () => {
    if (!canAdvance()) return;

    if (state.step === 3) {
      // ── ライブ：Supabaseに予約を作成（決済なし）──
      if (live) {
        clearError();
        nextBtn.disabled = true;
        try {
          const res = await api.rpc('create_booking', {
            p_space_id: spaceId,
            p_slot_code: config._slotByLabel[state.slot],
            p_plan_code: state.planId,
            p_date: state.date,
            p_people: parseInt(state.people, 10) || 1,
            p_name: state.name.trim(),
            p_email: state.email.trim(),
            p_tel: state.tel.trim(),
          });
          const id = Array.isArray(res) ? res[0] : res;
          const shortId = String(id).replace(/-/g, '').slice(0, 8).toUpperCase();
          const done = root.querySelector('[data-done-msg]');
          if (done) done.textContent = `予約番号：${shortId}　ご予約を保存しました。確認のご連絡を差し上げます（この段階ではお支払いは発生しません）。`;
          monthCache = {}; // 新規予約を反映するためキャッシュ破棄
          go(4);
        } catch (e) {
          const m = (e && e.message) || '';
          if (m === 'slot_taken' || m === 'blocked_slot' || m === 'closed_day') {
            showError('申し訳ありません。その日時はちょうどご利用できなくなりました。お手数ですが別の日時をお選びください。');
            monthCache = {};
            await renderCal();
            await applyDaySlots();
          } else {
            showError('ご予約の保存に失敗しました。通信状況をご確認のうえ、もう一度お試しください。');
          }
          nextBtn.disabled = false;
        }
        return;
      }

      // ── デモ：決済プロバイダのCheckoutへ進む想定（決済はスキップ）──
      const pay = config.payments.find((p) => p.id === state.paymentId);
      const done = root.querySelector('[data-done-msg]');
      if (done) done.textContent = `${pay.provider} による事前決済はこの後の画面で行われます（プロトタイプのため決済はスキップ）。`;
      go(4);
      return;
    }
    go(state.step + 1);
  });
  backBtn && backBtn.addEventListener('click', () => { if (state.step > 1) go(state.step - 1); });

  // ---- 起動 ----
  (async () => {
    if (live) {
      try { await loadMaster(); }
      catch (e) { console.error('[MGCB] マスタ読込に失敗。デモモードで表示します:', e); live = false; }
    }
    buildOptions();
    await renderCal();
    go(1);
  })();
})();
