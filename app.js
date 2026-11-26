/* Ahorro — controla tus gastos y descubre cada día cuánto puedes gastar.
   Sin dependencias: todo el estado vive en el dispositivo (localStorage) y, cuando la app
   se abre dentro de Claude, también en tu cuenta (capacidad `db`). */
(() => {
  'use strict';

  // ───────────────────────── utilidades ─────────────────────────
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-5);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const mkOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1);
  const dkOf = (d) => mkOf(d) + '-' + pad(d.getDate());
  const parseDk = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const daysIn = (mk) => { const [y, m] = mk.split('-').map(Number); return new Date(y, m, 0).getDate(); };
  const addMonths = (mk, n) => { const [y, m] = mk.split('-').map(Number); return mkOf(new Date(y, m - 1 + n, 1)); };
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const r2 = (n) => Math.round(n * 100) / 100;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const today = () => new Date();
  const curMk = () => mkOf(today());
  const todayDk = () => dkOf(today());

  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const MONTHS_S = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const monthName = (mk) => MONTHS[Number(mk.slice(5)) - 1];
  const monthLabel = (mk) => cap(monthName(mk)) + ' ' + mk.slice(0, 4);

  // Acepta "12,5", "12.50", "1.234,56", "1,234.56", "1.500"
  function parseNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    let s = String(v || '').trim().replace(/[\s€$£]/g, '').replace(/^S\//, '');
    if (!s) return 0;
    const hasC = s.includes(','), hasD = s.includes('.');
    if (hasC && hasD) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (hasC) {
      s = /^\d{1,3}(,\d{3})+$/.test(s) && s.split(',').length > 2 ? s.replace(/,/g, '') : s.replace(',', '.');
    } else if (hasD) {
      if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    }
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  // ───────────────────────── catálogos ─────────────────────────
  const CURRENCIES = [
    { c: 'EUR', l: 'es-ES', s: '€', n: 'Euro' },
    { c: 'USD', l: 'es-US', s: 'US$', n: 'Dólar' },
    { c: 'MXN', l: 'es-MX', s: 'MX$', n: 'Peso mexicano' },
    { c: 'COP', l: 'es-CO', s: 'COL$', n: 'Peso colombiano', d: 0 },
    { c: 'ARS', l: 'es-AR', s: 'AR$', n: 'Peso argentino' },
    { c: 'CLP', l: 'es-CL', s: 'CLP$', n: 'Peso chileno', d: 0 },
    { c: 'PEN', l: 'es-PE', s: 'S/', n: 'Sol' },
    { c: 'GBP', l: 'en-GB', s: '£', n: 'Libra' },
  ];
  const CATS = [
    { id: 'super', e: '🛒', n: 'Súper' },
    { id: 'comida', e: '🍽️', n: 'Comer fuera' },
    { id: 'cafe', e: '☕', n: 'Café y snacks' },
    { id: 'transporte', e: '🚌', n: 'Transporte' },
    { id: 'ocio', e: '🎬', n: 'Ocio' },
    { id: 'compras', e: '🛍️', n: 'Compras' },
    { id: 'salud', e: '💊', n: 'Salud' },
    { id: 'hogar', e: '🏠', n: 'Casa' },
    { id: 'facturas', e: '💡', n: 'Facturas' },
    { id: 'subs', e: '📺', n: 'Suscripciones' },
    { id: 'regalos', e: '🎁', n: 'Regalos' },
    { id: 'otros', e: '✨', n: 'Otros' },
  ];
  const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));
  const catOf = (id) => CAT[id] || CAT.otros;
  const PRESETS = [
    { n: 'Alquiler', c: 'hogar' }, { n: 'Hipoteca', c: 'hogar' }, { n: 'Luz', c: 'facturas' }, { n: 'Agua', c: 'facturas' },
    { n: 'Gas', c: 'facturas' }, { n: 'Internet', c: 'facturas' }, { n: 'Móvil', c: 'facturas' }, { n: 'Gimnasio', c: 'salud' },
    { n: 'Suscripciones', c: 'subs' }, { n: 'Transporte', c: 'transporte' }, { n: 'Seguro', c: 'otros' }, { n: 'Compra del mes', c: 'super' },
  ];
  const GOAL_EMOJI = ['✈️', '🛟', '🏠', '🚗', '🎓', '💻', '💍', '🌴', '🎁', '🐷'];

  // ───────────────────────── iconos ─────────────────────────
  const svg = (p, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${p}</svg>`;
  const I = {
    gauge: svg('<path d="M3.5 15.5a8.5 8.5 0 0 1 17 0"/><path d="M12 15.5l4.2-4.6"/><circle cx="12" cy="15.5" r="1.6"/><path d="M5 19h14"/>'),
    list: svg('<path d="M6 3.5h12v17l-3-1.8-3 1.8-3-1.8-3 1.8z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>'),
    cal: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
    jar: svg('<path d="M8 3.5h8"/><path d="M9 3.5V6c-2.4 1.2-4 3.6-4 6.6v2.9A4.5 4.5 0 0 0 9.5 20h5a4.5 4.5 0 0 0 4.5-4.5v-2.9c0-3-1.6-5.4-4-6.6V3.5"/><circle cx="12" cy="13.5" r="2.6"/>'),
    sliders: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    left: svg('<path d="M14.5 6l-6 6 6 6"/>'),
    right: svg('<path d="M9.5 6l6 6-6 6"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    back: svg('<path d="M9 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-6-6z"/><path d="M13 10l4 4M17 10l-4 4"/>'),
    arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    bang: svg('<path d="M12 7v6M12 17h.01"/>'),
    logo: `<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="18" fill="var(--accent)"/><path d="M14 40a18 18 0 0 1 36 0" fill="none" stroke="var(--accent-ink)" stroke-width="6" stroke-linecap="round"/><path d="M32 40l9-10" stroke="var(--accent-ink)" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="40" r="4.5" fill="var(--accent-ink)"/></svg>`,
  };

  // ───────────────────────── estado ─────────────────────────
  const blankApp = () => ({
    v: 1, onboarded: false, name: '', currency: 'EUR', start: null,
    incomes: [], planned: [], saving: { mode: 'percent', value: 20 }, goals: [], lastCat: 'super', updatedAt: 0,
  });
  const blankMonth = () => ({ expenses: [], extra: 0, resisted: [], summary: null, updatedAt: 0 });
  const EMPTY_MONTH = Object.freeze({ expenses: [], extra: 0, resisted: [], summary: null });

  function normalizeApp(a) {
    const b = Object.assign(blankApp(), a || {});
    for (const k of ['incomes', 'planned', 'goals']) if (!Array.isArray(b[k])) b[k] = [];
    if (!b.saving || typeof b.saving !== 'object') b.saving = { mode: 'percent', value: 20 };
    if (!CURRENCIES.some((c) => c.c === b.currency)) b.currency = 'EUR';
    b.planned.forEach((p) => { if (!p.paid || typeof p.paid !== 'object') p.paid = {}; });
    return b;
  }
  function normalizeMonth(m) {
    const b = Object.assign(blankMonth(), m || {});
    if (!Array.isArray(b.expenses)) b.expenses = [];
    if (!Array.isArray(b.resisted)) b.resisted = [];
    b.extra = Number(b.extra) || 0;
    return b;
  }

  let S = { app: blankApp(), months: {} };
  let REAL = null; // estado real guardado mientras se ve el ejemplo
  let DEMO = false;
  const real = () => (DEMO ? REAL : S);

  const M = (mk) => S.months[mk] || EMPTY_MONTH;
  const Mw = (mk) => (S.months[mk] = S.months[mk] || blankMonth());

  const applies = (it, mk) => (it.month ? it.month === mk : !it.from || it.from <= mk);
  const amountIn = (it, mk) => (it.over && it.over[mk] != null ? Number(it.over[mk]) : Number(it.amount) || 0);
  const incomesFor = (mk) => S.app.incomes.filter((i) => applies(i, mk));
  const plannedFor = (mk) => S.app.planned.filter((p) => applies(p, mk));

  // ───────────────────────── dinero ─────────────────────────
  const fmtCache = new Map();
  const curInfo = () => CURRENCIES.find((c) => c.c === S.app.currency) || CURRENCIES[0];
  function fmt(dec) {
    const ci = curInfo();
    const d = ci.d === 0 ? 0 : dec;
    const key = ci.c + '|' + d;
    if (!fmtCache.has(key)) {
      let f;
      try { f = new Intl.NumberFormat(ci.l, { style: 'currency', currency: ci.c, minimumFractionDigits: d, maximumFractionDigits: d }); }
      catch { f = new Intl.NumberFormat('es-ES', { style: 'currency', currency: ci.c, minimumFractionDigits: d, maximumFractionDigits: d }); }
      fmtCache.set(key, f);
    }
    return fmtCache.get(key);
  }
  // Muestra decimales solo si hacen falta (o siempre con {dec:true})
  function money(n, o = {}) {
    n = Number(n) || 0;
    if (Math.abs(n) < 0.005) n = 0;
    const whole = Math.abs(n - Math.round(n)) < 0.005;
    const dec = o.dec === true ? 2 : o.dec === false ? 0 : whole ? 0 : 2;
    return fmt(Math.abs(n) >= 10000 && o.dec !== true ? 0 : dec).format(n);
  }
  function moneyHTML(n, o = {}) {
    n = Number(n) || 0;
    if (Math.abs(n) < 0.005) n = 0;
    const whole = Math.abs(n - Math.round(n)) < 0.005;
    const dec = o.dec === false || Math.abs(n) >= 10000 || (whole && o.dec !== true) ? 0 : 2;
    return fmt(dec).formatToParts(n).map((p) =>
      p.type === 'fraction' || p.type === 'decimal' ? `<span class="dec">${esc(p.value)}</span>` :
      p.type === 'currency' ? `<span class="cur">${esc(p.value)}</span>` : esc(p.value)).join('');
  }
  const decSep = () => (fmt(2).formatToParts(1.5).find((p) => p.type === 'decimal') || { value: ',' }).value;
  const zeroDec = () => curInfo().d === 0;

  // ───────────────────────── cálculos del mes ─────────────────────────
  function calc(mk, now = today()) {
    const a = S.app;
    const m = M(mk);
    const days = daysIn(mk);
    const cmk = mkOf(now);
    const when = mk === cmk ? 'current' : mk < cmk ? 'past' : 'future';
    const sm = m.summary;
    const income = sm ? sm.income : sum(incomesFor(mk), (i) => amountIn(i, mk));
    const pl = plannedFor(mk);
    const planned = sm ? sm.planned : sum(pl, (p) => amountIn(p, mk));
    const paid = sum(pl.filter((p) => p.paid && p.paid[mk]), (p) => amountIn(p, mk));
    const saveTarget = sm ? sm.saveTarget : a.saving.mode === 'percent' ? (income * (Number(a.saving.value) || 0)) / 100 : Number(a.saving.value) || 0;
    const extra = Number(m.extra) || 0;
    const baseB = income - planned - saveTarget; // dinero libre para el día a día según el plan
    // El mes en que empiezas a usar la app cuenta desde ese día: los días anteriores se dan por gastados según el plan.
    const effStart = !sm && a.start === mk && a.startDay > 1 ? Math.min(a.startDay, days) : 1;
    const prior = (baseB / days) * (effStart - 1);
    const B = baseB - extra - prior; // tras apartar ahorro extra
    const dayNum = when === 'current' ? now.getDate() : when === 'past' ? days + 1 : 1;
    const tdk = when === 'current' ? dkOf(now) : null;

    let spent = 0, spentToday = 0, spentBefore = 0;
    const byDay = new Array(days).fill(0);
    const byCat = {};
    for (const e of m.expenses) {
      const d = Number(e.date.slice(8, 10));
      const v = Number(e.amount) || 0;
      spent += v;
      if (d >= 1 && d <= days) byDay[d - 1] += v;
      byCat[e.cat] = (byCat[e.cat] || 0) + v;
      if (e.date === tdk) spentToday += v;
      else if (d < dayNum) spentBefore += v;
    }
    const daysLeft = Math.max(0, days - dayNum + 1); // incluye hoy
    const planDaily = baseB / days;
    const availBefore = B - spentBefore;
    const dailyToday = daysLeft > 0 ? Math.max(0, availBefore) / daysLeft : 0;
    const leftToday = dailyToday - spentToday;
    const leftMonth = B - spent;
    const tomorrowDaily = daysLeft > 1 ? Math.max(0, leftMonth) / (daysLeft - 1) : null;
    const margin = availBefore - planDaily * daysLeft; // + vas por delante, − vas por detrás
    const elapsed = when === 'current' ? dayNum - effStart + 1 : when === 'past' ? days - effStart + 1 : 0;
    const pace = elapsed > 0 ? spent / elapsed : 0;
    const projectedVar = prior + (when === 'past' ? spent : Math.max(spent, pace * (days - effStart + 1)));
    const projectedSaved = income - planned - projectedVar;
    const planSaved = saveTarget + extra + Math.min(0, leftMonth);
    const actualSaved = income - planned - spent - prior;
    const resisted = sum(m.resisted || [], (r) => r.amount);

    let level = 'good';
    if (income <= 0) level = 'empty';
    else if (baseB <= 0) level = 'broken';
    else if (when === 'current' && leftMonth < 0) level = 'overMonth';
    else if (leftToday < -0.004) level = 'over';
    else if (leftToday < dailyToday * 0.25) level = 'tight';

    return {
      mk, when, days, dayNum, effStart, prior, income, planned, paid, plannedItems: pl, saveTarget, extra, baseB, B,
      spent, spentToday, spentBefore, byDay, byCat, daysLeft, planDaily, dailyToday, leftToday, leftMonth,
      tomorrowDaily, margin, elapsed, pace, projectedSaved, planSaved, actualSaved, resisted,
      resistedN: (m.resisted || []).length, level,
    };
  }

  // ¿Puedo gastar X hoy?
  function verdict(x, c) {
    if (!(x > 0)) return null;
    if (c.level === 'empty' || c.level === 'broken') return { lvl: 'neutral', h: 'Primero, tu plan', t: 'Añade tus ingresos y gastos del mes para saber si te lo puedes permitir.' };
    const left = Math.max(0, c.leftToday);
    if (c.leftMonth < 0) return { lvl: 'bad', h: 'No', t: `Este mes ya vas <b>${money(-c.leftMonth)}</b> en rojo: todo lo que gastes sale de tu ahorro.` };
    if (x <= c.leftToday + 0.004) {
      return { lvl: 'good', h: 'Sí, puedes', t: `Te quedarán <b>${money(c.leftToday - x)}</b> para hoy.` };
    }
    const leftAfter = c.leftMonth - x;
    const rest = c.daysLeft - 1;
    if (leftAfter >= 0 && rest > 0) {
      const nd = leftAfter / rest;
      const ratio = c.planDaily > 0 ? nd / c.planDaily : 0;
      const over = left > 0 ? `Te pasas <b>${money(x - left)}</b> de lo de hoy` : 'Hoy ya no te queda margen';
      if (ratio >= 0.6) return { lvl: 'warn', h: 'Sí, pero ajusta', t: `${over}. Los próximos ${rest} días tendrías <b>${money(nd)}</b> al día en vez de ${money(c.tomorrowDaily ?? c.planDaily)}.` };
      return { lvl: 'bad', h: 'Mejor no', t: `${over}. Te quedarían solo <b>${money(nd)}</b> al día durante ${rest} días.` };
    }
    if (leftAfter >= 0) return { lvl: 'warn', h: 'Justo', t: `Es el último día y te cabe, pero apurarías el mes.` };
    return { lvl: 'bad', h: 'No te llega', t: `Te comerías <b>${money(-leftAfter)}</b> de tu ahorro de este mes.` };
  }

  // Al empezar un mes nuevo, congela los números de los meses anteriores
  function ensureSummaries() {
    const cm = curMk();
    let changed = false;
    for (const mk of Object.keys(S.months)) {
      const m = S.months[mk];
      if (mk < cm && !m.summary) {
        const c = calc(mk);
        m.summary = { income: r2(c.income), planned: r2(c.planned), saveTarget: r2(c.saveTarget), spent: r2(c.spent), saved: r2(c.actualSaved) };
        Store.saveMonth(mk);
        changed = true;
      }
    }
    return changed;
  }

  // ───────────────────────── guardado ─────────────────────────
  const LS_APP = 'ahorro.v1.app';
  const LS_M = 'ahorro.v1.m.';
  const Store = {
    mode: 'local', col: null, timers: {}, busy: {}, again: {}, error: null, downloads: null,
    lsGet(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
    lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
    lsDel(k) { try { localStorage.removeItem(k); } catch { /* nada */ } },
    loadLocal() {
      const app = this.lsGet(LS_APP);
      const months = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(LS_M)) { const v = this.lsGet(k); if (v) months[k.slice(LS_M.length)] = normalizeMonth(v); }
        }
      } catch { /* nada */ }
      return { app: app ? normalizeApp(app) : blankApp(), months };
    },
    saveApp() {
      if (DEMO) return;
      S.app.updatedAt = Date.now();
      this.lsSet(LS_APP, S.app);
      this.push('app');
    },
    saveMonth(mk) {
      if (DEMO || !S.months[mk]) return;
      S.months[mk].updatedAt = Date.now();
      this.lsSet(LS_M + mk, S.months[mk]);
      this.push('m-' + mk);
    },
    bodyFor(id) {
      const st = real();
      if (id === 'app') return st.app;
      return st.months[id.slice(2)];
    },
    push(id) {
      if (this.mode !== 'cloud') return;
      clearTimeout(this.timers[id]);
      this.timers[id] = setTimeout(() => this.flush(id), 700);
    },
    async flush(id, retried) {
      if (this.busy[id]) { this.again[id] = true; return; }
      const body = this.bodyFor(id);
      if (!body) return;
      this.busy[id] = true;
      try {
        await this.col.doc(id).set(clone(body));
        this.error = null;
      } catch (e) {
        const code = (e && e.code) || 'unavailable';
        this.error = code;
        if (code === 'unavailable' && !retried) {
          this.busy[id] = false;
          setTimeout(() => this.flush(id, true), 1500 + Math.random() * 1500);
          return;
        }
        if (code === 'invalid_argument' || code === 'revoked' || code === 'not_granted') this.mode = 'local';
      } finally {
        this.busy[id] = false;
      }
      if (this.again[id]) { this.again[id] = false; this.flush(id); }
    },
    async connectCloud() {
      const cl = window.claude;
      if (!cl || typeof cl.use !== 'function') return;
      try {
        cl.use('downloads').then((d) => { this.downloads = d; }).catch(() => {});
        const [db, user] = await Promise.all([cl.use('db'), cl.use('user')]);
        if (!db || !user) return;
        const id = await user.id();
        if (!id) return;
        const col = db.collection('data/users/' + id);
        const snap = await Promise.race([col.get(), new Promise((_, rej) => setTimeout(() => rej({ code: 'timeout' }), 10000))]);
        this.col = col;
        this.mode = 'cloud';
        const remote = {};
        for (const d of snap.docs) if (d.exists) remote[d.id] = clone(d.data());
        const st = real();
        let changed = false;
        const toPush = [];
        if (remote.app && (remote.app.updatedAt || 0) >= (st.app.updatedAt || 0)) {
          st.app = normalizeApp(remote.app);
          this.lsSet(LS_APP, st.app);
          changed = true;
        } else if (st.app.onboarded) toPush.push('app');
        for (const [k, v] of Object.entries(remote)) {
          if (!k.startsWith('m-')) continue;
          const mk = k.slice(2);
          const l = st.months[mk];
          if (!l || (v.updatedAt || 0) >= (l.updatedAt || 0)) { st.months[mk] = normalizeMonth(v); this.lsSet(LS_M + mk, st.months[mk]); changed = true; }
          else toPush.push(k);
        }
        for (const mk of Object.keys(st.months)) if (!remote['m-' + mk] && !toPush.includes('m-' + mk)) toPush.push('m-' + mk);
        for (const k of toPush) this.flush(k);
        if (changed && !DEMO) { fmtCache.clear(); ensureSummaries(); render(); }
        else if (ui.sheet && ui.sheet.type === 'settings') renderSheet();
      } catch { /* seguimos en modo local */ }
    },
    async wipe() {
      const st = real();
      const ids = ['app', ...Object.keys(st.months).map((mk) => 'm-' + mk)];
      this.lsDel(LS_APP);
      for (const mk of Object.keys(st.months)) this.lsDel(LS_M + mk);
      if (this.mode === 'cloud') for (const id of ids) { try { await this.col.doc(id).delete(); } catch { /* nada */ } }
    },
  };

  // ───────────────────────── interfaz ─────────────────────────
  const ui = { tab: 'hoy', gm: null, sheet: null, ob: null, toastT: null, installEvt: null };
  const TABS = [
    { id: 'hoy', n: 'Hoy', i: 'gauge' },
    { id: 'gastos', n: 'Gastos', i: 'list' },
    { id: 'plan', n: 'Plan', i: 'cal' },
    { id: 'ahorro', n: 'Ahorro', i: 'jar' },
  ];

  function render() {
    const root = $('#app');
    if (!S.app.onboarded && !DEMO) { root.innerHTML = renderOnboarding(); return; }
    const now = today();
    const mk = mkOf(now);
    const titles = { hoy: S.app.name ? `Hola, ${esc(S.app.name)}` : 'Hoy', gastos: 'Tus gastos', plan: 'Plan del mes', ahorro: 'Tu ahorro' };
    const views = { hoy: viewHoy, gastos: viewGastos, plan: viewPlan, ahorro: viewAhorro };
    const tab = TABS.some((t) => t.id === ui.tab) ? ui.tab : 'hoy';
    root.innerHTML = `
      <header class="top">
        <div class="top-l">
          <p class="eyebrow">${cap(WEEKDAYS[now.getDay()])} ${now.getDate()} de ${monthName(mk)} · ${daysLeftTxt(now)}</p>
          <h1>${titles[tab]}</h1>
        </div>
        <button class="icon-btn" data-act="settings" aria-label="Ajustes">${I.sliders}</button>
      </header>
      ${DEMO ? `<div class="demo-bar"><span>Estás viendo un ejemplo con datos inventados</span><button data-act="demo-exit">Usar mis datos</button></div>` : ''}
      <main class="view" id="view">${views[tab]()}</main>
      <nav class="tabbar" aria-label="Secciones">
        <div class="tabbar-in">
          ${tabBtn(TABS[0], tab)}${tabBtn(TABS[1], tab)}
          <div class="fab-wrap"><button class="fab" data-act="add" aria-label="Añadir gasto">${I.plus}</button></div>
          ${tabBtn(TABS[2], tab)}${tabBtn(TABS[3], tab)}
        </div>
      </nav>`;
  }
  const daysLeftTxt = (now) => { const n = daysIn(mkOf(now)) - now.getDate(); return n === 0 ? 'último día del mes' : n === 1 ? 'queda 1 día' : `quedan ${n} días`; };
  const tabBtn = (t, cur) => `<button class="tab" data-act="tab" data-tab="${t.id}" ${t.id === cur ? 'aria-current="page"' : ''}>${I[t.i]}<span>${t.n}</span></button>`;

  // ─────────── HOY ───────────
  function viewHoy() {
    const c = calc(curMk());
    let cls = 'good', pill = 'Vas bien', label = 'Hoy puedes gastar', amount = c.leftToday, note = '', meterPct = c.dailyToday > 0 ? clamp((c.spentToday / c.dailyToday) * 100, 0, 100) : 100, foot = true, btn = '';
    if (c.level === 'empty') {
      cls = 'idle'; pill = 'Sin plan'; label = 'Empieza por tus ingresos'; amount = 0; foot = false; meterPct = 0;
      btn = `<button class="btn btn-block" data-act="tab" data-tab="plan">Completar mi plan</button>`;
    } else if (c.level === 'broken') {
      cls = 'bad'; pill = 'Plan descuadrado'; label = 'A tu plan le faltan'; amount = -c.baseB; foot = false; meterPct = 100;
      note = 'Tus gastos previstos y tu meta de ahorro superan lo que ingresas.';
      btn = `<button class="btn btn-block" data-act="tab" data-tab="plan">Revisar el plan</button>`;
    } else if (c.level === 'overMonth') {
      cls = 'bad'; pill = 'Mes en rojo'; label = 'Este mes te has pasado'; amount = -c.leftMonth; meterPct = 100;
      note = `Estás tirando de tu ahorro. Lo ideal hoy: no gastar más.`;
    } else if (c.level === 'over') {
      cls = 'bad'; pill = 'Te has pasado'; label = 'Hoy te has pasado'; amount = -c.leftToday;
      note = c.tomorrowDaily != null ? `Mañana podrás gastar ${money(c.tomorrowDaily)}.` : 'Es el último día del mes.';
    } else if (c.level === 'tight') {
      cls = 'warn'; pill = 'Con cuidado';
    } else if (c.spentToday === 0) {
      pill = 'Aún no has gastado hoy';
    }
    const amtStr = money(amount);
    const hero = `
      <section class="hero hero--${cls}">
        <div class="hero-top"><span class="pill">${pill}</span>${c.planDaily > 0 ? `<span class="hero-date">Plan: ${money(c.planDaily)}/día</span>` : ''}</div>
        <p class="hero-label">${label}</p>
        <p class="hero-amount ${amtStr.length > 11 ? 'long' : ''}">${moneyHTML(amount)}</p>
        ${note ? `<p class="hero-note">${note}</p>` : ''}
        ${foot ? `<div class="meter" role="img" aria-label="Has usado el ${Math.round(meterPct)}% de lo de hoy"><span style="width:${meterPct}%"></span></div>
        <div class="hero-foot"><span>Gastado hoy <b>${money(c.spentToday)}</b></span><span>Límite de hoy <b>${money(c.dailyToday)}</b></span></div>` : ''}
        ${btn}
      </section>`;

    const ask = `
      <button class="ask" data-act="check">
        <span class="ask-ico">?</span>
        <span class="ask-txt"><b>¿Me lo puedo permitir?</b><small>Escribe un precio y te lo digo al momento</small></span>
        <span class="ask-go">${I.arrow}</span>
      </button>`;

    const ok = c.level !== 'empty' && c.level !== 'broken';
    const tiles = ok ? `
      <div class="tiles">
        <div class="tile"><p class="tile-k">Libre del mes</p><p class="tile-v ${c.leftMonth < 0 ? 'bad' : ''}">${money(c.leftMonth)}</p><p class="tile-s">para el día a día</p></div>
        <div class="tile"><p class="tile-k">Mañana</p><p class="tile-v">${c.tomorrowDaily != null ? money(c.tomorrowDaily) : '—'}</p><p class="tile-s">${c.tomorrowDaily != null ? 'al día' : 'fin de mes'}</p></div>
        <div class="tile"><p class="tile-k">Quedan</p><p class="tile-v">${c.daysLeft} ${c.daysLeft === 1 ? 'día' : 'días'}</p><p class="tile-s">con hoy</p></div>
      </div>` : '';

    return hero + ask + tiles + (ok ? monthCard(c) + marginCard(c) : '') + paymentsSec(c) + todaySec(c);
  }

  function monthCard(c) {
    const spentPct = c.B > 0 ? (c.spent / c.B) * 100 : 100;
    const timePct = ((c.dayNum - c.effStart + 0.5) / (c.days - c.effStart + 1)) * 100;
    const paceCls = spentPct > timePct + 8 ? 'is-bad' : spentPct > timePct ? 'is-warn' : '';
    const ref = Math.max(c.planDaily * 1.6, ...c.byDay, 1);
    const bars = c.byDay.map((v, i) => {
      const d = i + 1;
      const future = d > c.dayNum || d < c.effStart;
      const h = future ? 6 : Math.max(v > 0 ? 4 : 2, (v / ref) * 100);
      const k = future ? 'future' : d === c.dayNum ? 'today' : v === 0 ? 'zero' : v > c.planDaily ? 'over' : '';
      return `<span class="bar ${k}" style="height:${future ? 4 : h}%" title="Día ${d}: ${money(v)}"></span>`;
    }).join('');
    const planTop = 100 - (c.planDaily / ref) * 100;
    const diff = c.projectedSaved - c.saveTarget;
    const projTxt = c.elapsed < 1 ? '' : c.spent === 0
      ? `<p class="proj">Aún no has apuntado gastos este mes. Si sigues el plan, ahorrarás <b>${money(c.planSaved)}</b>.</p>`
      : `<p class="proj">A tu ritmo (<b>${money(c.pace)}</b> al día) acabarás el mes ahorrando <b class="${diff >= 0 ? 'good' : 'bad'}">${money(c.projectedSaved)}</b>. ${diff >= 0 ? `Eso es <b>${money(diff)}</b> más que tu meta.` : `Te faltarían <b>${money(-diff)}</b> para tu meta de ${money(c.saveTarget)}.`}</p>`;
    return `
      <section class="card" aria-label="Tu mes">
        <div class="sec-head" style="padding:0"><h2>Tu mes</h2><span class="muted num">${money(c.spent)} de ${money(c.B)}</span></div>
        <div class="pace" style="margin-top:12px" role="img" aria-label="Has gastado el ${Math.round(spentPct)}% con el ${Math.round(timePct)}% del mes pasado">
          <div class="pace-fill ${paceCls}" style="width:${clamp(spentPct, 0, 100)}%"></div>
          <div class="pace-mark" style="left:${clamp(timePct, 0, 100)}%"></div>
        </div>
        <div class="pace-legend"><span><i style="background:var(--${paceCls === 'is-bad' ? 'bad' : paceCls === 'is-warn' ? 'warn' : 'good'})"></i>Gastado ${Math.round(spentPct)}%</span><span><i style="background:var(--ink)"></i>Mes transcurrido ${Math.round(timePct)}%</span></div>
        <div class="bars-wrap">
          <div class="bars" role="img" aria-label="Gasto de cada día del mes frente a tu plan diario">
            ${bars}
            ${c.planDaily > 0 ? `<div class="bars-plan" style="top:${clamp(planTop, 2, 100)}%"><span>plan ${money(c.planDaily)}</span></div>` : ''}
          </div>
          <div class="bars-x"><span>1</span><span>${Math.round(c.days / 2)}</span><span>${c.days}</span></div>
        </div>
        ${projTxt}
      </section>`;
  }

  function marginCard(c) {
    if (c.when !== 'current') return '';
    const thr = Math.max(1, c.planDaily * 0.5);
    if (c.margin >= thr) {
      const amt = zeroDec() ? Math.floor(c.margin) : Math.floor(c.margin * 100) / 100;
      return `
        <section class="callout">
          <p class="callout-title">Vas ${money(amt)} por delante</p>
          <p>Has gastado menos de lo previsto. Si apartas ese dinero ahora, ya cuenta como ahorro y tu día a día sigue en <b>${money(c.planDaily)}</b>.</p>
          <button class="btn btn-good btn-block" data-act="extra" data-amount="${amt}">Apartar ${money(amt)} ya</button>
        </section>`;
    }
    if (c.margin <= -thr && c.level !== 'overMonth') {
      return `
        <section class="callout callout--warn">
          <p class="callout-title">Vas ${money(-c.margin)} por encima del plan</p>
          <p>Por eso hoy tienes <b>${money(c.dailyToday)}</b> en vez de ${money(c.planDaily)}. Cada día que gastes menos, el límite vuelve a subir.</p>
        </section>`;
    }
    return '';
  }

  function paymentsSec(c) {
    if (!c.plannedItems.length) return '';
    const mk = c.mk;
    const items = c.plannedItems.slice().sort((a, b) => {
      const pa = a.paid && a.paid[mk] ? 1 : 0, pb = b.paid && b.paid[mk] ? 1 : 0;
      if (pa !== pb) return pa - pb;
      return (a.day || 99) - (b.day || 99);
    });
    const unpaid = items.filter((p) => !(p.paid && p.paid[mk]));
    const show = unpaid.slice(0, 4);
    return `
      <section class="sec">
        <div class="sec-head"><h2>Pagos del mes</h2><span class="muted num">${money(c.paid)} de ${money(c.planned)} pagado</span></div>
        <div class="card card-tight"><div class="list">
          ${show.map((p) => plannedRow(p, mk)).join('')}
          ${unpaid.length > 4 ? `<button class="add-row" data-act="tab" data-tab="plan">Ver los ${unpaid.length} pendientes</button>` : ''}
          ${!unpaid.length ? `<p class="empty"><b>Todo pagado</b>Ya no te queda ningún pago previsto este mes.</p>` : ''}
        </div></div>
      </section>`;
  }

  function plannedRow(p, mk) {
    const paid = !!(p.paid && p.paid[mk]);
    const td = today().getDate();
    const due = p.day ? (paid ? `día ${p.day}` : p.day < td ? `día ${p.day} · pendiente` : p.day === td ? 'vence hoy' : `día ${p.day}`) : (p.month ? 'solo este mes' : 'cada mes');
    return `
      <div class="row ${paid ? 'is-paid' : ''}" style="grid-template-columns:auto auto 1fr auto">
        <button class="check ${paid ? 'on' : ''}" data-act="toggle-paid" data-id="${p.id}" aria-pressed="${paid}" aria-label="${paid ? 'Marcar como no pagado' : 'Marcar como pagado'}: ${esc(p.name)}">${I.check}</button>
        <span class="row-ico" aria-hidden="true">${catOf(p.cat).e}</span>
        <button class="row-main" style="text-align:left" data-act="edit-planned" data-id="${p.id}"><span class="row-t">${esc(p.name)}</span><span class="row-s ${!paid && p.day && p.day <= td ? 'warn' : ''}">${due}</span></button>
        <span class="row-v">${money(amountIn(p, mk))}</span>
      </div>`;
  }

  function todaySec(c) {
    const dk = todayDk();
    const list = M(c.mk).expenses.filter((e) => e.date === dk).sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return `
      <section class="sec">
        <div class="sec-head"><h2>Hoy</h2>${list.length ? `<button class="link" data-act="tab" data-tab="gastos">Ver todo</button>` : ''}</div>
        <div class="card card-tight"><div class="list">
          ${list.length ? list.map(expenseRow).join('') : `<p class="empty"><b>Nada apuntado hoy</b>Toca el botón + cada vez que gastes algo.</p>`}
        </div></div>
      </section>`;
  }

  function expenseRow(e) {
    const c = catOf(e.cat);
    return `
      <button class="row row-btn" data-act="edit-exp" data-id="${e.id}">
        <span class="row-ico" aria-hidden="true">${c.e}</span>
        <span class="row-main"><span class="row-t">${esc(e.note || c.n)}</span><span class="row-s">${esc(e.note ? c.n : 'Sin nota')}</span></span>
        <span class="row-v">−${money(e.amount)}</span>
      </button>`;
  }

  // ─────────── GASTOS ───────────
  function viewGastos() {
    const cm = curMk();
    const mk = ui.gm && ui.gm <= cm ? ui.gm : cm;
    const c = calc(mk);
    const m = M(mk);
    const prevOk = Object.keys(S.months).some((k) => k < mk) || (!!S.app.start && S.app.start < mk);
    const cats = Object.entries(c.byCat).sort((a, b) => b[1] - a[1]);
    const maxCat = cats.length ? cats[0][1] : 1;
    const groups = {};
    for (const e of m.expenses) (groups[e.date] = groups[e.date] || []).push(e);
    const dates = Object.keys(groups).sort().reverse();
    const avg = c.elapsed ? c.spent / c.elapsed : 0;
    const spentPct = c.B > 0 ? clamp((c.spent / c.B) * 100, 0, 100) : 100;

    return `
      <div class="month-nav">
        <button class="icon-btn" data-act="gm" data-d="-1" aria-label="Mes anterior" ${prevOk ? '' : 'disabled'}>${I.left}</button>
        <h2>${monthLabel(mk)}</h2>
        <button class="icon-btn" data-act="gm" data-d="1" aria-label="Mes siguiente" ${mk < cm ? '' : 'disabled'}>${I.right}</button>
      </div>
      <section class="card">
        <div class="pace-head"><span>Gastado en el día a día</span><span class="num">${Math.round(c.B > 0 ? (c.spent / c.B) * 100 : 0)}%</span></div>
        <p class="hero-amount" style="font-size:40px;margin-top:6px">${moneyHTML(c.spent)}</p>
        <p class="muted" style="font-weight:600;margin-top:2px">de ${money(c.B)} disponibles${c.extra ? ` (ya descontados ${money(c.extra)} apartados)` : ''}</p>
        <div class="pace" style="margin-top:14px"><div class="pace-fill ${c.spent > c.B ? 'is-bad' : ''}" style="width:${spentPct}%"></div></div>
        <div class="tiles" style="margin-top:14px">
          <div class="tile" style="box-shadow:none;background:var(--surface-2)"><p class="tile-k">Media diaria</p><p class="tile-v">${money(avg)}</p></div>
          <div class="tile" style="box-shadow:none;background:var(--surface-2)"><p class="tile-k">Plan diario</p><p class="tile-v">${money(Math.max(0, c.planDaily))}</p></div>
          <div class="tile" style="box-shadow:none;background:var(--surface-2)"><p class="tile-k">${c.when === 'past' ? 'Ahorraste' : 'Gastos'}</p><p class="tile-v ${c.when === 'past' && c.actualSaved < 0 ? 'bad' : ''}">${c.when === 'past' ? money(c.actualSaved) : m.expenses.length}</p></div>
        </div>
      </section>
      ${cats.length ? `
      <section class="sec">
        <div class="sec-head"><h2>En qué se va</h2></div>
        <div class="card"><div class="catbars">
          ${cats.map(([id, v]) => `
            <div><div class="catbar-top"><span>${catOf(id).e} ${esc(catOf(id).n)}</span><span>${money(v)} <span class="faint">· ${Math.round((v / c.spent) * 100)}%</span></span></div>
            <div class="catbar-track"><span style="width:${(v / maxCat) * 100}%"></span></div></div>`).join('')}
        </div></div>
      </section>` : ''}
      <section class="sec">
        <div class="sec-head"><h2>Movimientos</h2><span class="muted">${m.expenses.length} ${m.expenses.length === 1 ? 'gasto' : 'gastos'}</span></div>
        ${dates.length ? dates.map((dk) => {
          const list = groups[dk].sort((a, b) => (b.ts || 0) - (a.ts || 0));
          const d = parseDk(dk);
          const lbl = dk === todayDk() ? 'Hoy' : dk === dkOf(new Date(Date.now() - 864e5)) ? 'Ayer' : `${WEEKDAYS[d.getDay()]} ${d.getDate()}`;
          return `<div><div class="day-head"><span>${lbl}</span><span>−${money(sum(list, (e) => e.amount))}</span></div>
            <div class="card card-tight"><div class="list">${list.map(expenseRow).join('')}</div></div></div>`;
        }).join('') : `<div class="card"><p class="empty"><b>Sin gastos en ${monthName(mk)}</b>Cuando apuntes algo con el botón +, aparecerá aquí.</p></div>`}
      </section>`;
  }

  // ─────────── PLAN ───────────
  function viewPlan() {
    const mk = curMk();
    const c = calc(mk);
    const inc = incomesFor(mk);
    const pl = plannedFor(mk).slice().sort((a, b) => (a.day || 99) - (b.day || 99) || b.amount - a.amount);
    const tot = Math.max(c.income, c.planned + c.saveTarget, 1);
    const free = Math.max(0, c.baseB);
    const sv = S.app.saving;
    const missing = PRESETS.filter((p) => !pl.some((x) => x.name.toLowerCase() === p.n.toLowerCase())).slice(0, 8);
    return `
      <section class="card">
        <div class="ledger">
          <div class="ledger-row"><span>Ingresos</span><span>${money(c.income)}</span></div>
          <div class="ledger-row"><span><i class="sw c-planned"></i>Gastos previstos</span><span>−${money(c.planned)}</span></div>
          <div class="ledger-row"><span><i class="sw c-save"></i>Ahorro${sv.mode === 'percent' ? ` (${sv.value}%)` : ''}</span><span>−${money(c.saveTarget)}</span></div>
        </div>
        <div class="split" role="img" aria-label="Reparto de tus ingresos">
          <span class="c-planned" style="width:${(c.planned / tot) * 100}%"></span>
          <span class="c-save" style="width:${(c.saveTarget / tot) * 100}%"></span>
          <span class="c-free" style="width:${(free / tot) * 100}%"></span>
        </div>
        <div class="ledger-total"><b><i class="sw c-free" style="display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:8px"></i>Para el día a día</b><span class="big ${c.baseB < 0 ? 'bad' : ''}">${money(c.baseB)}</span></div>
        <div class="perday ${c.baseB <= 0 ? 'is-bad' : ''}">
          ${c.baseB > 0 ? `<span>Puedes gastar cada día</span><span class="big">${money(c.planDaily)}</span>` : `<span>${c.income > 0 ? 'Baja algún gasto o tu meta de ahorro: el plan no cuadra.' : 'Añade tus ingresos para empezar.'}</span>`}
        </div>
        ${c.prior > 0 && c.baseB > 0 ? `<p class="note" style="margin-top:10px">Empezaste el día ${c.effStart}, así que este mes cuenta desde entonces: ${money(c.baseB - c.prior)} para ${c.days - c.effStart + 1} días. A partir de ${MONTHS[Number(addMonths(mk, 1).slice(5)) - 1]}, el mes completo.</p>` : ''}
      </section>

      <section class="sec">
        <div class="sec-head"><h2>Ingresos</h2><span class="muted num">${money(c.income)}</span></div>
        <div class="card card-tight"><div class="list">
          ${inc.map((i) => `
            <button class="row row-btn" data-act="edit-income" data-id="${i.id}">
              <span class="row-ico" aria-hidden="true">💶</span>
              <span class="row-main"><span class="row-t">${esc(i.name)}</span><span class="row-s">${i.month ? 'Solo este mes' : 'Cada mes'}</span></span>
              <span class="row-v good">+${money(amountIn(i, mk))}</span>
            </button>`).join('')}
          <button class="add-row" data-act="new-income">${I.plus}Añadir ingreso</button>
        </div></div>
      </section>

      <section class="sec">
        <div class="sec-head"><h2>Gastos del mes</h2><span class="muted num">${money(c.paid)} de ${money(c.planned)} pagado</span></div>
        <div class="card card-tight"><div class="list">
          ${pl.length ? pl.map((p) => plannedRow(p, mk)).join('') : `<p class="empty"><b>Apunta lo que ya sabes que vas a pagar</b>Alquiler, facturas, suscripciones… Así sabrás lo que te queda libre de verdad.</p>`}
          <button class="add-row" data-act="new-planned">${I.plus}Añadir gasto previsto</button>
        </div></div>
        ${missing.length ? `<div class="chips">${missing.map((p) => `<button class="chip chip-add" data-act="new-planned" data-name="${esc(p.n)}" data-cat="${p.c}">${catOf(p.c).e} ${esc(p.n)}</button>`).join('')}</div>` : ''}
      </section>

      <section class="sec">
        <div class="sec-head"><h2>Meta de ahorro</h2></div>
        <div class="card card-tight"><div class="list">
          <button class="row row-btn" data-act="saving">
            <span class="row-ico" aria-hidden="true">🐷</span>
            <span class="row-main"><span class="row-t">${sv.mode === 'percent' ? `El ${sv.value}% de lo que ingresas` : 'Una cantidad fija'}</span><span class="row-s">Se aparta antes que nada</span></span>
            <span class="row-v">${money(c.saveTarget)}<small>al mes</small></span>
          </button>
        </div></div>
      </section>`;
  }

  // ─────────── AHORRO ───────────
  function viewAhorro() {
    const mk = curMk();
    const c = calc(mk);
    const goals = S.app.goals;
    const rate = Math.max(0, c.planSaved);
    const hist = Object.keys(S.months).filter((k) => k < mk && S.months[k].summary).sort().slice(-5);
    const cols = hist.map((k) => ({ k, v: S.months[k].summary.saved, live: false }));
    cols.push({ k: mk, v: c.planSaved, live: true });
    const maxV = Math.max(...cols.map((x) => Math.abs(x.v)), 1);
    const totalHist = sum(hist, (k) => S.months[k].summary.saved);

    return `
      <section class="save-hero">
        <p class="hero-label">Este mes vas a ahorrar</p>
        <p class="hero-amount">${moneyHTML(c.planSaved)}</p>
        <p class="hero-note">si gastas como mucho lo que te dice cada día</p>
        <div class="save-grid">
          <div><small>Meta mensual</small><b>${money(c.saveTarget)}</b></div>
          <div><small>Apartado extra</small><b>${money(c.extra)}</b></div>
          <div><small>A tu ritmo actual</small><b>${c.spent ? money(c.projectedSaved) : '—'}</b></div>
          <div><small>Caprichos evitados</small><b>${money(c.resisted)}</b></div>
        </div>
        <button class="btn btn-block" data-act="extra">Apartar dinero ahora</button>
      </section>

      <section class="sec">
        <div class="sec-head"><h2>Tus huchas</h2><button class="link" data-act="new-goal">+ Nueva</button></div>
        <div class="card card-tight">
          ${goals.length ? goals.map((g) => goalBlock(g, rate)).join('') : `<p class="empty"><b>¿Para qué ahorras?</b>Crea una hucha (un viaje, un colchón para imprevistos…) y te diré cuándo la llenarás a tu ritmo.</p>
            <button class="add-row" data-act="new-goal">${I.plus}Crear mi primera hucha</button>`}
        </div>
      </section>

      <section class="sec">
        <div class="sec-head"><h2>Mes a mes</h2>${hist.length ? `<span class="muted num">${money(totalHist)} en ${hist.length} ${hist.length === 1 ? 'mes' : 'meses'}</span>` : ''}</div>
        <div class="card">
          <div class="hist" role="img" aria-label="Ahorro de cada mes">
            ${cols.map((x) => `
              <div class="hist-col">
                <span class="hist-v ${x.v < 0 ? 'bad' : ''}">${money(x.v, { dec: false })}</span>
                <span class="hist-bar ${x.v < 0 ? 'neg' : ''} ${x.live ? 'live' : ''}" style="height:${Math.max(3, (Math.abs(x.v) / maxV) * 70)}%"></span>
                <span class="hist-k">${MONTHS_S[Number(x.k.slice(5)) - 1]}</span>
              </div>`).join('')}
          </div>
          <p class="note" style="margin-top:12px">${hist.length ? 'El mes actual (rayado) es una previsión si sigues el plan.' : 'Aquí verás cuánto ahorras cada mes. El mes actual (rayado) es una previsión si sigues el plan.'}</p>
        </div>
      </section>`;
  }

  function goalBlock(g, rate) {
    const pct = g.target > 0 ? clamp((g.saved / g.target) * 100, 0, 100) : 0;
    const left = Math.max(0, g.target - g.saved);
    let eta = '';
    if (left <= 0) eta = '<span class="good">¡Conseguido!</span>';
    else if (g.deadline) {
      const n = monthsBetween(curMk(), g.deadline);
      eta = n > 0 ? `Para ${monthName(g.deadline)} ${g.deadline.slice(0, 4)}: <b class="num">${money(left / n)}</b>/mes` : `<span class="bad">Fecha pasada</span>`;
    } else if (rate > 0) {
      const n = Math.ceil(left / rate);
      const end = addMonths(curMk(), n);
      eta = `Con todo tu ahorro: ${n === 1 ? 'el mes que viene' : `en ${n} meses`} (${MONTHS_S[Number(end.slice(5)) - 1]} ${end.slice(0, 4)})`;
    }
    return `
      <div class="goal">
        <button class="goal-top" data-act="edit-goal" data-id="${g.id}">
          <span class="row-ico" aria-hidden="true">${esc(g.emoji || '🐷')}</span>
          <span class="row-main"><span class="row-t">${esc(g.name)}</span><span class="row-s num">${money(g.saved)} de ${money(g.target)}</span></span>
          <span class="row-v">${Math.round(pct)}%</span>
        </button>
        <div class="goal-track"><span style="width:${pct}%"></span></div>
        <div class="goal-meta"><span>${eta}</span></div>
        ${left > 0 ? `<div class="goal-actions"><button class="btn btn-soft btn-sm" data-act="deposit" data-id="${g.id}">${I.plus}Añadir dinero</button></div>` : ''}
      </div>`;
  }
  const monthsBetween = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5)) - Number(a.slice(5));

  // ───────────────────────── hojas (formularios) ─────────────────────────
  function openSheet(sheet) {
    ui.sheet = sheet;
    clearTimeout(ui.toastT); $('#toast-root').innerHTML = ''; undoFn = null;
    renderSheet(true);
  }
  function closeSheet() {
    const s = $('#sheet-root');
    const sh = $('.sheet', s), sc = $('.scrim', s);
    ui.sheet = null;
    if (!sh) return;
    sh.classList.add('closing'); sc && sc.classList.add('closing');
    setTimeout(() => { if (!ui.sheet) s.innerHTML = ''; }, 190);
  }
  function renderSheet(first) {
    const s = $('#sheet-root');
    if (!ui.sheet) { s.innerHTML = ''; return; }
    const builders = { expense: sheetExpense, income: sheetIncome, planned: sheetPlanned, saving: sheetSaving, goal: sheetGoal, deposit: sheetDeposit, extra: sheetExtra, settings: sheetSettings, confirm: sheetConfirm };
    const { title, body, sub } = builders[ui.sheet.type]();
    const scroll = $('.sheet', s) ? $('.sheet', s).scrollTop : 0;
    s.innerHTML = `
      <div class="scrim" data-act="close" style="${first ? '' : 'animation:none'}"></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}" style="${first ? '' : 'animation:none'}">
        <div class="grabber"></div>
        <div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-act="close" aria-label="Cerrar">${I.x}</button></div>
        ${sub ? `<p class="sheet-sub" style="margin:-6px 0 14px">${sub}</p>` : ''}
        <div class="sheet-body">${body}</div>
      </div>`;
    if (!first) $('.sheet', s).scrollTop = scroll;
    if (first) {
      const f = $('[data-autofocus]', s);
      if (f && !matchMedia('(pointer: coarse)').matches) setTimeout(() => f.focus(), 60);
    }
  }

  // ─────────── gasto: añadir / comprobar / editar ───────────
  function newExpenseSheet(mode, extra = {}) {
    openSheet(Object.assign({ type: 'expense', mode, kp: '', cat: S.app.lastCat || 'super', note: '', date: todayDk() }, extra));
  }
  function kpValue() { const v = parseFloat(ui.sheet.kp || '0'); return isFinite(v) ? v : 0; }
  function kpHTML() {
    const kp = ui.sheet.kp;
    if (!kp) return moneyHTML(0, { dec: zeroDec() ? false : undefined }).replace(/<span class="dec">.*?<\/span>/g, '');
    const [i, d] = kp.split('.');
    const parts = fmt(0).formatToParts(Number(i || 0));
    let lastInt = -1;
    parts.forEach((p, ix) => { if (p.type === 'integer' || p.type === 'group') lastInt = ix; });
    return parts.map((p, ix) => {
      let out = p.type === 'currency' ? `<span class="cur">${esc(p.value)}</span>` : esc(p.value);
      if (ix === lastInt && d !== undefined) out += `<span class="dec">${esc(decSep())}${esc(d)}</span>`;
      return out;
    }).join('');
  }
  function verdictHTML(big) {
    const sh = ui.sheet;
    if (sh.mode === 'edit') return '';
    const x = kpValue();
    const c = calc(curMk());
    if (sh.date !== todayDk()) return `<div class="verdict verdict--neutral" id="verdict"><span>Gasto de otro día: se descontará de lo que te queda para el resto del mes.</span></div>`;
    const v = verdict(x, c);
    if (!v) {
      const t = sh.mode === 'check'
        ? (c.level === 'empty' || c.level === 'broken' ? 'Completa tu plan para poder responderte.' : `Hoy te quedan <b>${money(Math.max(0, c.leftToday))}</b>. Escribe el precio y te digo si cabe.`)
        : (c.level === 'empty' || c.level === 'broken' ? 'Escribe cuánto has gastado.' : `Hoy te quedan <b>${money(Math.max(0, c.leftToday))}</b>.`);
      return `<div class="verdict verdict--neutral ${big ? 'big' : ''}" id="verdict"><span>${t}</span></div>`;
    }
    const ico = v.lvl === 'good' ? I.check : v.lvl === 'neutral' ? '?' : I.bang;
    return `<div class="verdict verdict--${v.lvl} ${big ? 'big' : ''}" id="verdict" aria-live="polite"><span class="verdict-ico">${ico}</span><span><span class="verdict-h">${v.h}</span>${v.t}</span></div>`;
  }
  function sheetExpense() {
    const sh = ui.sheet;
    const yest = dkOf(new Date(today().getFullYear(), today().getMonth(), today().getDate() - 1));
    const isOther = sh.date !== todayDk() && sh.date !== yest;
    const title = sh.mode === 'check' ? '¿Me lo puedo permitir?' : sh.mode === 'edit' ? 'Editar gasto' : 'Nuevo gasto';
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'dec', '0', 'del'];
    const buttons = sh.mode === 'check'
      ? `<div class="btn-row"><button class="btn btn-soft" data-act="resist">Mejor no</button><button class="btn btn-primary" data-act="save-exp">Lo compro</button></div>`
      : sh.mode === 'edit'
        ? `<div class="btn-row wide-r"><button class="btn btn-danger" data-act="del-exp">Borrar</button><button class="btn btn-primary" data-act="save-exp">Guardar</button></div>`
        : `<button class="btn btn-primary btn-block" data-act="save-exp">Añadir gasto</button>`;
    return {
      title,
      body: `
        <p class="amount ${sh.kp ? '' : 'empty-amt'}" id="kp-display" aria-live="polite">${kpHTML()}</p>
        ${sh.mode === 'edit' ? '' : verdictHTML(sh.mode === 'check')}
        <div class="chips" role="group" aria-label="Categoría">
          ${CATS.map((c) => `<button class="chip" data-act="cat" data-cat="${c.id}" aria-pressed="${sh.cat === c.id}">${c.e} ${c.n}</button>`).join('')}
        </div>
        <div class="grid2">
          <input class="input" id="exp-note" placeholder="Nota (opcional)" maxlength="60" value="${esc(sh.note)}" autocomplete="off">
          <div class="seg" role="group" aria-label="Fecha">
            <button data-act="date" data-date="${todayDk()}" aria-pressed="${sh.date === todayDk()}">Hoy</button>
            <button data-act="date" data-date="${yest}" aria-pressed="${sh.date === yest}">Ayer</button>
          </div>
        </div>
        <label class="field" ${isOther ? '' : 'style="display:none"'} id="date-field"><span>Fecha</span><input class="input" type="date" id="exp-date" value="${sh.date}" max="${todayDk()}"></label>
        ${!isOther ? `<button class="link" style="align-self:flex-start;margin-top:-8px" data-act="other-date">Otra fecha…</button>` : ''}
        <div class="keypad" role="group" aria-label="Teclado numérico">
          ${keys.map((k) => k === 'dec' ? `<button class="key" data-act="key" data-k="." ${zeroDec() ? 'disabled' : ''} aria-label="Decimales">${esc(decSep())}</button>`
            : k === 'del' ? `<button class="key" data-act="key" data-k="del" aria-label="Borrar">${I.back}</button>`
            : `<button class="key" data-act="key" data-k="${k}">${k}</button>`).join('')}
        </div>
        ${buttons}`,
    };
  }
  function pressKey(k) {
    const sh = ui.sheet;
    if (!sh || sh.type !== 'expense') return;
    let kp = sh.kp;
    if (k === 'del') kp = kp.slice(0, -1);
    else if (k === '.') { if (zeroDec() || kp.includes('.')) return; kp = (kp || '0') + '.'; }
    else {
      const [i, d] = kp.split('.');
      if (d !== undefined && d.length >= 2) return;
      if (d === undefined && (i || '').replace(/^0+/, '').length >= 8) return;
      kp = kp === '0' ? k : kp + k;
    }
    sh.kp = kp;
    const disp = $('#kp-display');
    if (disp) { disp.innerHTML = kpHTML(); disp.classList.toggle('empty-amt', !kp); }
    const v = $('#verdict');
    if (v) v.outerHTML = verdictHTML(sh.mode === 'check');
  }
  function syncExpenseInputs() {
    const sh = ui.sheet;
    if (!sh || sh.type !== 'expense') return;
    const n = $('#exp-note'); if (n) sh.note = n.value.trim();
    const d = $('#exp-date'); if (d && d.value && d.closest('.field').style.display !== 'none') sh.date = d.value;
  }
  function saveExpense() {
    syncExpenseInputs();
    const sh = ui.sheet;
    const amount = r2(kpValue());
    if (!(amount > 0)) { const d = $('#kp-display'); d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake'); return; }
    let date = sh.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = todayDk();
    if (date > todayDk()) date = todayDk();
    const mk = date.slice(0, 7);
    if (sh.mode === 'edit') {
      const found = findExpense(sh.id);
      if (found) {
        const om = Mw(found.mk);
        om.expenses = om.expenses.filter((e) => e.id !== sh.id);
        Store.saveMonth(found.mk);
        Mw(mk).expenses.push(Object.assign({}, found.e, { amount, cat: sh.cat, note: sh.note, date }));
        Store.saveMonth(mk);
      }
      closeSheet(); render(); toast('Gasto actualizado');
      return;
    }
    const e = { id: uid(), amount, cat: sh.cat, note: sh.note, date, ts: Date.now() };
    Mw(mk).expenses.push(e);
    S.app.lastCat = sh.cat;
    Store.saveMonth(mk); Store.saveApp();
    closeSheet(); render();
    const c = calc(curMk());
    const msg = date === todayDk() && c.level !== 'empty' && c.level !== 'broken'
      ? (c.leftToday >= 0 ? `Apuntado. Te quedan ${money(c.leftToday)} hoy` : `Apuntado. Hoy vas ${money(-c.leftToday)} por encima`)
      : 'Gasto apuntado';
    toast(msg, () => { const mm = Mw(mk); mm.expenses = mm.expenses.filter((x) => x.id !== e.id); Store.saveMonth(mk); render(); });
  }
  function findExpense(id) {
    for (const [mk, m] of Object.entries(S.months)) {
      const e = m.expenses.find((x) => x.id === id);
      if (e) return { mk, e };
    }
    return null;
  }

  // ─────────── ingreso ───────────
  function sheetIncome() {
    const sh = ui.sheet;
    const it = sh.id ? S.app.incomes.find((i) => i.id === sh.id) : null;
    return {
      title: it ? 'Editar ingreso' : 'Nuevo ingreso',
      body: `
        <label class="field"><span>Concepto</span><input class="input" id="f-name" value="${esc(it ? it.name : sh.name || 'Nómina')}" maxlength="40" autocomplete="off"></label>
        <label class="field"><span>Cantidad al mes</span><input class="input money-in" id="f-amount" inputmode="decimal" placeholder="0" value="${it ? esc(String(it.amount).replace('.', decSep())) : ''}" data-autofocus autocomplete="off"></label>
        <div class="toggle-row"><span>Se repite cada mes<small>Si no, solo cuenta en ${monthName(curMk())}</small></span>
          <label class="switch"><input type="checkbox" id="f-rec" ${!it || !it.month ? 'checked' : ''} aria-label="Se repite cada mes"><span></span></label></div>
        ${it ? `<div class="btn-row wide-r"><button class="btn btn-danger" data-act="del-income">Borrar</button><button class="btn btn-primary" data-act="save-income">Guardar</button></div>`
          : `<button class="btn btn-primary btn-block" data-act="save-income">Añadir ingreso</button>`}`,
    };
  }

  // ─────────── gasto previsto ───────────
  function sheetPlanned() {
    const sh = ui.sheet;
    const it = sh.id ? S.app.planned.find((p) => p.id === sh.id) : null;
    const mk = curMk();
    if (!sh.cat) sh.cat = it ? it.cat : 'facturas';
    const recurring = !it || !it.month;
    return {
      title: it ? 'Editar gasto previsto' : 'Nuevo gasto previsto',
      sub: 'Algo que ya sabes que vas a pagar este mes.',
      body: `
        <label class="field"><span>Concepto</span><input class="input" id="f-name" value="${esc(it ? it.name : sh.name || '')}" placeholder="Alquiler, luz, Netflix…" maxlength="40" autocomplete="off" ${!it && !sh.name ? 'data-autofocus' : ''}></label>
        <div class="grid2">
          <label class="field"><span>Cantidad</span><input class="input money-in" id="f-amount" inputmode="decimal" placeholder="0" value="${it ? esc(String(amountIn(it, mk)).replace('.', decSep())) : ''}" autocomplete="off" ${!it && sh.name ? 'data-autofocus' : ''}></label>
          <label class="field"><span>Día de pago (opcional)</span><input class="input" id="f-day" inputmode="numeric" placeholder="Ej. 5" value="${it && it.day ? it.day : ''}" maxlength="2" autocomplete="off"></label>
        </div>
        <div class="field"><span class="field-label">Categoría</span>
          <div class="chips">${CATS.map((c) => `<button class="chip" data-act="pcat" data-cat="${c.id}" aria-pressed="${sh.cat === c.id}">${c.e} ${c.n}</button>`).join('')}</div></div>
        <div class="toggle-row"><span>Se repite cada mes<small>Si no, solo cuenta en ${monthName(mk)}</small></span>
          <label class="switch"><input type="checkbox" id="f-rec" ${recurring ? 'checked' : ''} aria-label="Se repite cada mes"><span></span></label></div>
        ${it && recurring ? `<div class="toggle-row"><span>Cambiar la cantidad solo en ${monthName(mk)}<small>Útil para facturas que varían</small></span>
          <label class="switch"><input type="checkbox" id="f-once" ${it.over && it.over[mk] != null ? 'checked' : ''} aria-label="Solo este mes"><span></span></label></div>` : ''}
        ${it ? `<div class="btn-row wide-r"><button class="btn btn-danger" data-act="del-planned">Borrar</button><button class="btn btn-primary" data-act="save-planned">Guardar</button></div>`
          : `<button class="btn btn-primary btn-block" data-act="save-planned">Añadir</button>`}`,
    };
  }

  // ─────────── meta de ahorro ───────────
  function sheetSaving() {
    const sh = ui.sheet;
    if (!sh.draft) sh.draft = clone(S.app.saving);
    const d = sh.draft;
    const c = calc(curMk());
    const target = d.mode === 'percent' ? (c.income * d.value) / 100 : d.value;
    const free = c.income - c.planned - target;
    const per = free / c.days;
    return {
      title: 'Meta de ahorro',
      sub: 'Este dinero se aparta nada más cobrar. Lo que queda es lo que puedes gastar.',
      body: `
        <div class="seg" role="group" aria-label="Porcentaje">
          ${[10, 15, 20, 30].map((p) => `<button data-act="sv-pct" data-v="${p}" aria-pressed="${d.mode === 'percent' && d.value === p}">${p}%</button>`).join('')}
          <button data-act="sv-fixed" aria-pressed="${d.mode === 'amount' || (d.mode === 'percent' && ![10, 15, 20, 30].includes(d.value))}">Otra</button>
        </div>
        ${d.mode === 'amount' || ![10, 15, 20, 30].includes(d.value) ? `
        <div class="grid2">
          <label class="field"><span>Cantidad fija al mes</span><input class="input money-in" id="sv-amount" inputmode="decimal" value="${d.mode === 'amount' ? esc(String(d.value).replace('.', decSep())) : ''}" placeholder="0" autocomplete="off"></label>
          <label class="field"><span>…o porcentaje</span><input class="input money-in" id="sv-percent" inputmode="decimal" value="${d.mode === 'percent' ? esc(String(d.value)) : ''}" placeholder="%" autocomplete="off"></label>
        </div>` : ''}
        <div class="preview-line" id="sv-preview">${savingPreview(target, free, per, c)}</div>
        <button class="btn btn-primary btn-block" data-act="save-saving">Guardar meta</button>`,
    };
  }
  function savingPreview(target, free, per, c) {
    if (c.income <= 0) return 'Añade tus ingresos en el plan para ver cuánto te queda cada día.';
    return free > 0
      ? `Ahorrarás <b>${money(target)}</b> al mes (${money(target * 12, { dec: false })} al año) y podrás gastar <b>${money(per)}</b> al día.`
      : `<span class="bad">Con esta meta no te queda dinero para el día a día (${money(free)}).</span>`;
  }

  // ─────────── huchas ───────────
  function sheetGoal() {
    const sh = ui.sheet;
    const g = sh.id ? S.app.goals.find((x) => x.id === sh.id) : null;
    if (!sh.emoji) sh.emoji = g ? g.emoji : GOAL_EMOJI[0];
    return {
      title: g ? 'Editar hucha' : 'Nueva hucha',
      body: `
        <div class="chips wrap" role="group" aria-label="Icono">${GOAL_EMOJI.map((e) => `<button class="chip" data-act="g-emoji" data-e="${e}" aria-pressed="${sh.emoji === e}" style="padding:0 11px;font-size:18px">${e}</button>`).join('')}</div>
        <label class="field"><span>¿Para qué ahorras?</span><input class="input" id="g-name" value="${esc(g ? g.name : '')}" placeholder="Viaje a Japón, colchón para imprevistos…" maxlength="40" autocomplete="off" data-autofocus></label>
        <div class="grid2">
          <label class="field"><span>Objetivo</span><input class="input money-in" id="g-target" inputmode="decimal" value="${g ? esc(String(g.target).replace('.', decSep())) : ''}" placeholder="0" autocomplete="off"></label>
          <label class="field"><span>Ya tengo</span><input class="input money-in" id="g-saved" inputmode="decimal" value="${g ? esc(String(g.saved).replace('.', decSep())) : ''}" placeholder="0" autocomplete="off"></label>
        </div>
        <label class="field"><span>¿Para cuándo? (opcional)</span><input class="input" type="month" id="g-deadline" value="${g && g.deadline ? g.deadline : ''}" min="${addMonths(curMk(), 1)}" placeholder="aaaa-mm"></label>
        ${g ? `<div class="btn-row wide-r"><button class="btn btn-danger" data-act="del-goal">Borrar</button><button class="btn btn-primary" data-act="save-goal">Guardar</button></div>`
          : `<button class="btn btn-primary btn-block" data-act="save-goal">Crear hucha</button>`}`,
    };
  }
  function sheetDeposit() {
    const sh = ui.sheet;
    const g = S.app.goals.find((x) => x.id === sh.id);
    if (!g) return { title: 'Hucha', body: '' };
    const c = calc(curMk());
    const sugg = [c.saveTarget, 50, 100].filter((v, i, a) => v > 0 && a.indexOf(v) === i);
    return {
      title: `${g.emoji || '🐷'} ${g.name}`,
      sub: `Llevas ${money(g.saved)} de ${money(g.target)}.`,
      body: `
        <label class="field"><span>Cantidad</span><input class="input money-in" id="d-amount" inputmode="decimal" placeholder="0" autocomplete="off" data-autofocus></label>
        <div class="chips wrap">${sugg.map((v) => `<button class="chip" data-act="d-fill" data-v="${r2(v)}">${money(v)}</button>`).join('')}</div>
        <div class="btn-row"><button class="btn btn-soft" data-act="withdraw">Sacar</button><button class="btn btn-primary" data-act="deposit-save">Añadir</button></div>`,
    };
  }

  // ─────────── apartar ahora ───────────
  function sheetExtra() {
    const sh = ui.sheet;
    const c = calc(curMk());
    const goals = S.app.goals.filter((g) => g.saved < g.target);
    if (sh.goal === undefined) sh.goal = goals.length ? goals[0].id : '';
    const amt = sh.amount != null ? sh.amount : '';
    return {
      title: 'Apartar dinero ahora',
      sub: 'Lo que apartes deja de contar para gastar y se suma a tu ahorro de este mes.',
      body: `
        <label class="field"><span>Cantidad</span><input class="input money-in" id="x-amount" inputmode="decimal" placeholder="0" value="${amt !== '' ? esc(String(amt).replace('.', decSep())) : ''}" autocomplete="off" data-autofocus></label>
        <div class="preview-line" id="x-preview">${extraPreview(parseNum(amt), c)}</div>
        ${goals.length ? `<div class="field"><span class="field-label">Guardarlo en una hucha</span><div class="chips">
          <button class="chip" data-act="x-goal" data-id="" aria-pressed="${!sh.goal}">Ninguna</button>
          ${goals.map((g) => `<button class="chip" data-act="x-goal" data-id="${g.id}" aria-pressed="${sh.goal === g.id}">${esc(g.emoji)} ${esc(g.name)}</button>`).join('')}</div></div>` : ''}
        <button class="btn btn-good btn-block" data-act="extra-save">Apartar</button>
        ${c.extra > 0 ? `<button class="btn btn-soft btn-block" data-act="extra-undo">Devolver los ${money(c.extra)} apartados al día a día</button>` : ''}`,
    };
  }
  function extraPreview(x, c) {
    const dl = `${c.daysLeft} ${c.daysLeft === 1 ? 'día' : 'días'}`;
    if (!(x > 0)) return `Ahora mismo puedes gastar <b>${money(c.dailyToday)}</b> al día durante ${dl}.`;
    if (c.leftMonth - x < 0) return `<span class="bad">No te llega: solo te quedan ${money(Math.max(0, c.leftMonth))} libres este mes.</span>`;
    const nd = Math.max(0, c.B - c.spentBefore - x) / Math.max(1, c.daysLeft);
    return `Ahorrarás <b>${money(c.planSaved + x)}</b> este mes y podrás gastar <b>${money(nd)}</b> al día durante ${dl}.`;
  }

  // ─────────── ajustes ───────────
  function sheetSettings() {
    const cloud = Store.mode === 'cloud';
    const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const showInstall = !window.claude && !isStandalone;
    return {
      title: 'Ajustes',
      body: `
        <div class="settings-group">
          <label class="field"><span>Tu nombre</span><input class="input" id="s-name" value="${esc(S.app.name)}" placeholder="Opcional" maxlength="24" autocomplete="off"></label>
          <div class="field"><span class="field-label">Moneda</span>
            <div class="chips wrap">${CURRENCIES.map((c) => `<button class="chip" data-act="s-cur" data-c="${c.c}" aria-pressed="${S.app.currency === c.c}">${esc(c.s)} ${esc(c.n)}</button>`).join('')}</div></div>
          <button class="btn btn-primary btn-block" data-act="s-save">Guardar</button>
        </div>
        <div class="settings-group">
          <h3>Tus datos</h3>
          <p class="status-line"><span class="dot ${cloud ? 'on' : ''}"></span>${DEMO ? 'Modo ejemplo: nada se guarda' : cloud ? 'Guardados en tu cuenta de Claude y en este dispositivo' : 'Guardados solo en este dispositivo'}</p>
          ${Store.error && cloud ? `<p class="note bad">El último guardado en la nube falló. Tus datos siguen en este dispositivo.</p>` : ''}
          <div class="btn-row">
            <button class="btn btn-soft btn-sm" data-act="export">Exportar copia</button>
            <label class="btn btn-soft btn-sm" style="cursor:pointer">Importar copia<input type="file" id="import-file" accept=".json,application/json" class="sr"></label>
          </div>
          <p class="note">La copia es un archivo .json con todo: plan, gastos y huchas.</p>
        </div>
        ${showInstall ? `<div class="settings-group">
          <h3>Instálala en tu móvil</h3>
          ${ui.installEvt ? `<button class="btn btn-primary btn-block" data-act="install">Instalar Ahorro</button>` : ''}
          <p class="note">${isIOS ? 'En Safari: toca Compartir y luego “Añadir a pantalla de inicio”.' : 'En Chrome: abre el menú ⋮ y elige “Instalar app” o “Añadir a pantalla de inicio”.'} Se abrirá a pantalla completa, como cualquier app.</p>
        </div>` : ''}
        <div class="settings-group">
          ${DEMO ? '' : `<button class="btn btn-soft btn-block" data-act="demo">Ver un ejemplo</button>`}
          <button class="btn btn-danger btn-block" data-act="ask-reset">Borrar todos mis datos</button>
          <p class="note" style="text-align:center">Ahorro · tus números se quedan contigo</p>
        </div>`,
    };
  }

  function sheetConfirm() {
    const sh = ui.sheet;
    return {
      title: sh.title,
      body: `<p style="font-size:15px;line-height:1.5">${sh.text}</p>
        <div class="btn-row"><button class="btn btn-soft" data-act="close">Cancelar</button><button class="btn btn-danger" data-act="confirm-ok">${sh.ok}</button></div>`,
    };
  }

  // ───────────────────────── onboarding ─────────────────────────
  function obInit() {
    ui.ob = {
      step: 0, name: '', currency: S.app.currency || 'EUR',
      incomes: [{ id: uid(), name: 'Nómina', amount: '' }],
      planned: [],
      saving: { mode: 'percent', value: 20 },
    };
  }
  function obCalc() {
    const o = ui.ob;
    const income = sum(o.incomes, (i) => parseNum(i.amount));
    const planned = sum(o.planned, (p) => parseNum(p.amount));
    const target = o.saving.mode === 'percent' ? (income * o.saving.value) / 100 : parseNum(o.saving.value);
    const free = income - planned - target;
    return { income, planned, target, free, per: free / daysIn(curMk()) };
  }
  function renderOnboarding() {
    if (!ui.ob) obInit();
    const o = ui.ob;
    const prev = S.app.currency;
    S.app.currency = o.currency; // para formatear con la moneda elegida
    if (prev !== o.currency) fmtCache.clear();
    const steps = [obWelcome, obIncome, obPlanned, obSaving, obResult];
    const html = steps[o.step]();
    return `<div class="ob">${html}</div>`;
  }
  const obProgress = (n, label) => `
    <div style="display:flex;flex-direction:column;gap:10px">
      <div class="ob-steps" aria-hidden="true">${[1, 2, 3, 4].map((i) => `<span class="${i <= n ? 'on' : ''}"></span>`).join('')}</div>
      <p class="ob-stepk">Paso ${n} de 4 · ${label}</p>
    </div>`;
  function obWelcome() {
    const o = ui.ob;
    return `
      <p class="brand">${I.logo} Ahorro</p>
      <div>
        <h1>Sabe cada día cuánto puedes gastar.</h1>
        <p class="lead">Apunta lo que vas a pagar este mes, decide cuánto quieres ahorrar y la app te dice al momento si un gasto cabe o no.</p>
      </div>
      <div class="hero hero--good ob-preview" aria-hidden="true">
        <div class="hero-top"><span class="pill example">Ejemplo</span><span class="hero-date">Vas bien</span></div>
        <p class="hero-label">Hoy puedes gastar</p>
        <p class="hero-amount">${moneyHTML(zeroDec() ? 23400 : 23.4)}</p>
        <div class="meter"><span style="width:34%"></span></div>
        <div class="hero-foot"><span>Gastado hoy <b>${money(zeroDec() ? 12000 : 12)}</b></span><span>Límite <b>${money(zeroDec() ? 35400 : 35.4)}</b></span></div>
      </div>
      <label class="field"><span>¿Cómo te llamas? (opcional)</span><input class="input" data-ob="name" value="${esc(o.name)}" maxlength="24" autocomplete="given-name"></label>
      <div class="field"><span class="field-label">Tu moneda</span>
        <div class="chips wrap">${CURRENCIES.map((c) => `<button class="chip" data-act="ob-cur" data-c="${c.c}" aria-pressed="${o.currency === c.c}">${esc(c.s)} ${esc(c.n)}</button>`).join('')}</div></div>
      <div class="ob-foot">
        <button class="btn btn-primary btn-block" data-act="ob-next">Crear mi plan del mes</button>
        <button class="btn btn-soft btn-block" data-act="demo">Ver primero un ejemplo</button>
      </div>`;
  }
  function obRows(list, kind, withEmoji) {
    return list.map((r, ix) => `
      <div class="ob-row ${withEmoji ? 'has-emoji' : ''}">
        ${withEmoji ? `<span class="row-ico" aria-hidden="true">${catOf(r.cat).e}</span>` : ''}
        <input class="input" data-ob="${kind}.${ix}.name" value="${esc(r.name)}" placeholder="Concepto" maxlength="40" aria-label="Concepto" autocomplete="off">
        <input class="input money-in" data-ob="${kind}.${ix}.amount" value="${esc(r.amount)}" inputmode="decimal" placeholder="0" aria-label="Cantidad" autocomplete="off" ${r.focus ? 'data-focus' : ''}>
        <button class="ob-x" data-act="ob-del" data-kind="${kind}" data-ix="${ix}" aria-label="Quitar">${I.x}</button>
      </div>`).join('');
  }
  function obIncome() {
    const o = ui.ob;
    return `
      ${obProgress(1, 'Ingresos')}
      <div><h1>¿Cuánto dinero entra al mes?</h1><p class="lead">Tu sueldo y cualquier otro ingreso fijo. Lo podrás cambiar cuando quieras.</p></div>
      <div class="ob-rows">${obRows(o.incomes, 'incomes', false)}</div>
      <button class="link" style="align-self:flex-start" data-act="ob-add" data-kind="incomes">+ Otro ingreso</button>
      <div class="ob-total"><span>Total al mes</span><b id="ob-total">${money(obCalc().income)}</b></div>
      <div class="ob-foot"><button class="btn btn-primary btn-block" data-act="ob-next">Siguiente</button><button class="btn btn-soft btn-block" data-act="ob-back">Atrás</button></div>`;
  }
  function obPlanned() {
    const o = ui.ob;
    const missing = PRESETS.filter((p) => !o.planned.some((x) => x.name.toLowerCase() === p.n.toLowerCase()));
    return `
      ${obProgress(2, 'Gastos del mes')}
      <div><h1>¿Qué vas a pagar sí o sí este mes?</h1><p class="lead">Alquiler, facturas, suscripciones… Lo del día a día (cafés, súper, salidas) lo apuntarás sobre la marcha.</p></div>
      <div class="chips wrap">${missing.map((p) => `<button class="chip chip-add" data-act="ob-preset" data-name="${esc(p.n)}" data-cat="${p.c}">+ ${catOf(p.c).e} ${esc(p.n)}</button>`).join('')}</div>
      <div class="ob-rows">${o.planned.length ? obRows(o.planned, 'planned', true) : ''}</div>
      <button class="link" style="align-self:flex-start" data-act="ob-add" data-kind="planned">+ Otro gasto</button>
      <div class="ob-total"><span>Gastos previstos</span><b id="ob-total">${money(obCalc().planned)}</b></div>
      <div class="ob-foot"><button class="btn btn-primary btn-block" data-act="ob-next">Siguiente</button><button class="btn btn-soft btn-block" data-act="ob-back">Atrás</button></div>`;
  }
  function obSaving() {
    const o = ui.ob;
    const c = obCalc();
    const custom = o.saving.mode === 'amount';
    return `
      ${obProgress(3, 'Ahorro')}
      <div><h1>¿Cuánto quieres ahorrar cada mes?</h1><p class="lead">Lo apartamos primero. Así ahorras desde el día 1 en vez de esperar a ver qué sobra.</p></div>
      <div class="seg" role="group" aria-label="Porcentaje de ahorro">
        ${[10, 15, 20, 30].map((p) => `<button data-act="ob-pct" data-v="${p}" aria-pressed="${!custom && o.saving.value === p}">${p}%</button>`).join('')}
        <button data-act="ob-fixed" aria-pressed="${custom}">Otra</button>
      </div>
      ${custom ? `<label class="field"><span>Cantidad fija al mes</span><input class="input money-in" data-ob="saving.value" value="${esc(o.saving.value)}" inputmode="decimal" placeholder="0" autocomplete="off" data-focus></label>` : ''}
      <div class="preview-line" id="ob-sv">${obSavingLine(c)}</div>
      <div class="ob-foot"><button class="btn btn-primary btn-block" data-act="ob-next">Ver mi resultado</button><button class="btn btn-soft btn-block" data-act="ob-back">Atrás</button></div>`;
  }
  const obSavingLine = (c) => c.income > 0
    ? `Ahorrarás <b>${money(c.target)}</b> al mes, <b>${money(c.target * 12, { dec: false })}</b> en un año.`
    : 'Añade tus ingresos en el paso 1 para ver la cifra.';
  function obResult() {
    const c = obCalc();
    const ok = c.free > 0;
    const days = daysIn(curMk());
    return `
      ${obProgress(4, 'Tu plan')}
      <div class="ob-result ${ok ? '' : 'is-bad'}">
        <p>${ok ? 'Cada día puedes gastar' : 'A tu plan le faltan'}</p>
        <p class="hero-amount">${moneyHTML(ok ? c.per : -c.free)}</p>
        <p style="opacity:.9;margin-top:6px;font-weight:600">${ok ? `y aun así ahorras ${money(c.target)} este mes` : 'Vuelve atrás y baja algún gasto o la meta de ahorro.'}</p>
      </div>
      <div class="card">
        <div class="ledger">
          <div class="ledger-row"><span>Ingresos</span><span>${money(c.income)}</span></div>
          <div class="ledger-row"><span>Gastos previstos</span><span>−${money(c.planned)}</span></div>
          <div class="ledger-row"><span>Ahorro</span><span>−${money(c.target)}</span></div>
        </div>
        <div class="ledger-total"><b>Para el día a día</b><span class="big">${money(c.free)}</span></div>
        <p class="note" style="margin-top:10px">${ok ? (today().getDate() > 1
          ? `Como empiezas hoy, ${monthName(curMk())} cuenta desde el día ${today().getDate()}: ${money(c.per * (days - today().getDate() + 1))} para los ${days - today().getDate() + 1} días que quedan. Si un día gastas menos, los demás tendrás un poco más (y al revés).`
          : `${money(c.free)} entre los ${days} días de ${monthName(curMk())}. Si un día gastas menos, los demás tendrás un poco más (y al revés).`) : ''}</p>
      </div>
      <div class="ob-foot"><button class="btn btn-primary btn-block" data-act="ob-finish" ${c.income > 0 ? '' : 'disabled'}>Empezar</button><button class="btn btn-soft btn-block" data-act="ob-back">Atrás</button></div>`;
  }
  function obFinish() {
    const o = ui.ob;
    const mk = curMk();
    S.app = normalizeApp({
      onboarded: true, name: o.name.trim(), currency: o.currency, start: mk, startDay: today().getDate(),
      incomes: o.incomes.filter((i) => parseNum(i.amount) > 0).map((i) => ({ id: uid(), name: i.name.trim() || 'Ingreso', amount: r2(parseNum(i.amount)), month: null, from: mk })),
      planned: o.planned.filter((p) => parseNum(p.amount) > 0).map((p) => ({ id: uid(), name: p.name.trim() || 'Gasto', amount: r2(parseNum(p.amount)), cat: p.cat || 'otros', day: null, month: null, from: mk, paid: {} })),
      saving: o.saving.mode === 'percent' ? { mode: 'percent', value: o.saving.value } : { mode: 'amount', value: r2(parseNum(o.saving.value)) },
      goals: [], lastCat: 'super',
    });
    ui.ob = null;
    ui.tab = 'hoy';
    Store.saveApp();
    render();
    scrollTo(0, 0);
    toast('¡Listo! Este es tu día');
  }

  // ───────────────────────── ejemplo ─────────────────────────
  function enterDemo() {
    if (!DEMO) REAL = S;
    DEMO = true;
    const cur = (REAL && REAL.app.currency) || (ui.ob && ui.ob.currency) || 'EUR';
    const k = cur === 'COP' || cur === 'CLP' ? 1000 : cur === 'ARS' ? 500 : cur === 'MXN' ? 20 : 1;
    const now = today();
    const mk = mkOf(now);
    const td = now.getDate();
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const a = normalizeApp({
      onboarded: true, name: 'Alex', currency: cur, start: addMonths(mk, -4), startDay: 1,
      incomes: [{ id: 'i1', name: 'Nómina', amount: 1850 * k, month: null }],
      planned: [
        ['Alquiler', 650, 1, 'hogar'], ['Abono transporte', 40, 1, 'transporte'], ['Gimnasio', 34.9, 5, 'salud'], ['Luz', 58, 8, 'facturas'],
        ['Internet y móvil', 45, 12, 'facturas'], ['Suscripciones', 17.98, 15, 'subs'], ['Seguro del coche', 38, 20, 'otros'],
      ].map(([n, v, d, c], ix) => ({ id: 'p' + ix, name: n, amount: r2(v * k), day: d, cat: c, month: null, paid: d < td ? { [mk]: true } : {} })),
      saving: { mode: 'percent', value: 20 },
      goals: [
        { id: 'g1', name: 'Viaje a Japón', emoji: '✈️', target: 2400 * k, saved: 860 * k, deadline: addMonths(mk, 8) },
        { id: 'g2', name: 'Colchón para imprevistos', emoji: '🛟', target: 3000 * k, saved: 1450 * k, deadline: null },
      ],
    });
    const tpl = [['super', 'Compra', 18, 46], ['cafe', 'Café', 1.6, 3.8], ['comida', 'Menú del día', 11, 16], ['transporte', 'Taxi', 7, 14], ['ocio', 'Cine', 8, 22], ['compras', 'Camiseta', 12, 35], ['cafe', 'Desayuno', 3, 6], ['comida', 'Cena con amigos', 18, 34]];
    const months = {};
    const mkExp = (mkx, d, i) => {
      const t = tpl[Math.floor(rnd() * tpl.length)];
      return { id: 'e' + mkx + d + i, amount: r2((t[2] + rnd() * (t[3] - t[2])) * 0.74 * k), cat: t[0], note: t[1], date: `${mkx}-${pad(d)}`, ts: Date.now() - (td - d) * 864e5 + i };
    };
    const ex = [];
    for (let d = 1; d < td; d++) {
      const n = rnd() < 0.18 ? 0 : 1 + Math.floor(rnd() * 2.2);
      for (let i = 0; i < n; i++) ex.push(mkExp(mk, d, i));
    }
    ex.push({ id: 'etoday', amount: r2(2.4 * k), cat: 'cafe', note: 'Café', date: dkOf(now), ts: Date.now() });
    months[mk] = normalizeMonth({ expenses: ex, extra: 0, resisted: [{ amount: 39.99 * k, ts: Date.now() - 3 * 864e5 }] });
    [[-4, 365], [-3, 298], [-2, 455], [-1, 412]].forEach(([o, s]) => {
      const pm = addMonths(mk, o);
      months[pm] = normalizeMonth({ expenses: [], summary: { income: 1850 * k, planned: 883.88 * k, saveTarget: 370 * k, spent: r2((1850 - 883.88 - s) * k), saved: s * k } });
    });
    S = { app: a, months };
    fmtCache.clear();
    ui.tab = 'hoy';
    closeSheet();
    render();
    scrollTo(0, 0);
  }
  function exitDemo() {
    DEMO = false;
    S = REAL || { app: blankApp(), months: {} };
    REAL = null;
    fmtCache.clear();
    ui.tab = 'hoy';
    closeSheet();
    render();
    scrollTo(0, 0);
  }

  // ───────────────────────── toast ─────────────────────────
  let undoFn = null;
  function toast(msg, undo) {
    const t = $('#toast-root');
    undoFn = undo || null;
    t.innerHTML = `<div class="toast ${ui.sheet ? 'toast--top' : ''}" role="status"><span>${esc(msg)}</span>${undo ? '<button data-act="undo">Deshacer</button>' : ''}</div>`;
    clearTimeout(ui.toastT);
    ui.toastT = setTimeout(() => { t.innerHTML = ''; undoFn = null; }, undo ? 5000 : 2600);
  }

  // ───────────────────────── exportar / importar ─────────────────────────
  async function exportData() {
    const st = real();
    const data = JSON.stringify({ app: 'ahorro', version: 1, exportedAt: new Date().toISOString(), state: st }, null, 2);
    const name = `ahorro-copia-${todayDk()}.json`;
    if (Store.downloads) {
      try { await Store.downloads.save({ filename: name, data }); toast('Copia guardada'); }
      catch (e) { if (e && e.code !== 'declined') toast('No se pudo guardar la copia aquí'); }
      return;
    }
    if (window.claude) { toast('Exportar no está disponible en esta vista'); return; }
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Copia descargada');
  }
  function importData(file) {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const j = JSON.parse(rd.result);
        const st = j && j.state;
        if (!st || !st.app) throw new Error('formato');
        if (DEMO) { DEMO = false; REAL = null; }
        S = { app: normalizeApp(st.app), months: {} };
        for (const [mk, m] of Object.entries(st.months || {})) if (/^\d{4}-\d{2}$/.test(mk)) S.months[mk] = normalizeMonth(m);
        S.app.onboarded = true;
        Store.saveApp();
        for (const mk of Object.keys(S.months)) Store.saveMonth(mk);
        fmtCache.clear();
        closeSheet(); render(); toast('Copia importada');
      } catch { toast('Ese archivo no es una copia de Ahorro'); }
    };
    rd.readAsText(file);
  }

  // ───────────────────────── acciones ─────────────────────────
  const A = {
    tab(el) { ui.tab = el.dataset.tab; try { if (location.hash !== '#' + ui.tab) location.hash = ui.tab; } catch { /* nada */ } render(); scrollTo(0, 0); },
    settings() { openSheet({ type: 'settings', cur: S.app.currency }); },
    close() { closeSheet(); },
    add() { newExpenseSheet('add'); },
    check() { newExpenseSheet('check'); },
    'edit-exp'(el) {
      const f = findExpense(el.dataset.id);
      if (!f) return;
      const e = f.e;
      let kp = String(r2(e.amount));
      openSheet({ type: 'expense', mode: 'edit', id: e.id, kp, cat: e.cat, note: e.note || '', date: e.date });
    },
    key(el) { pressKey(el.dataset.k); },
    cat(el) { syncExpenseInputs(); ui.sheet.cat = el.dataset.cat; $$('.chip[data-act="cat"]').forEach((c) => c.setAttribute('aria-pressed', c.dataset.cat === ui.sheet.cat)); },
    date(el) {
      syncExpenseInputs(); ui.sheet.date = el.dataset.date; renderSheet();
    },
    'other-date'() { syncExpenseInputs(); const f = $('#date-field'); f.style.display = ''; const b = $('[data-act="other-date"]'); b && b.remove(); const i = $('#exp-date'); i.focus(); if (i.showPicker) try { i.showPicker(); } catch { /* nada */ } },
    'save-exp'() { saveExpense(); },
    'del-exp'() {
      const f = findExpense(ui.sheet.id);
      if (!f) return closeSheet();
      const m = Mw(f.mk);
      m.expenses = m.expenses.filter((x) => x.id !== f.e.id);
      Store.saveMonth(f.mk);
      closeSheet(); render();
      toast('Gasto borrado', () => { Mw(f.mk).expenses.push(f.e); Store.saveMonth(f.mk); render(); });
    },
    resist() {
      const x = r2(kpValue());
      closeSheet();
      if (x > 0) {
        Mw(curMk()).resisted.push({ amount: x, ts: Date.now() });
        Store.saveMonth(curMk());
        render();
        toast(`Bien hecho: ${money(x)} que se quedan contigo`);
      }
    },
    'toggle-paid'(el) {
      const p = S.app.planned.find((x) => x.id === el.dataset.id);
      if (!p) return;
      const mk = curMk();
      p.paid = p.paid || {};
      if (p.paid[mk]) delete p.paid[mk]; else p.paid[mk] = true;
      Store.saveApp(); render();
    },
    'new-income'() { openSheet({ type: 'income' }); },
    'edit-income'(el) { openSheet({ type: 'income', id: el.dataset.id }); },
    'save-income'() {
      const name = $('#f-name').value.trim() || 'Ingreso';
      const amount = r2(parseNum($('#f-amount').value));
      if (!(amount > 0)) { $('#f-amount').focus(); toast('Escribe una cantidad'); return; }
      const rec = $('#f-rec').checked;
      const mk = curMk();
      const id = ui.sheet.id;
      if (id) {
        const it = S.app.incomes.find((i) => i.id === id);
        Object.assign(it, { name, amount, month: rec ? null : mk });
        if (rec && !it.from) it.from = mk;
      } else S.app.incomes.push({ id: uid(), name, amount, month: rec ? null : mk, from: mk });
      Store.saveApp(); closeSheet(); render(); toast(id ? 'Ingreso actualizado' : 'Ingreso añadido');
    },
    'del-income'() {
      const id = ui.sheet.id;
      const ix = S.app.incomes.findIndex((i) => i.id === id);
      const [it] = S.app.incomes.splice(ix, 1);
      Store.saveApp(); closeSheet(); render();
      toast('Ingreso borrado', () => { S.app.incomes.splice(ix, 0, it); Store.saveApp(); render(); });
    },
    'new-planned'(el) { openSheet({ type: 'planned', name: el.dataset.name || '', cat: el.dataset.cat || '' }); },
    'edit-planned'(el) { openSheet({ type: 'planned', id: el.dataset.id }); },
    pcat(el) { ui.sheet.cat = el.dataset.cat; $$('.chip[data-act="pcat"]').forEach((c) => c.setAttribute('aria-pressed', c.dataset.cat === ui.sheet.cat)); },
    'save-planned'() {
      const name = $('#f-name').value.trim();
      const amount = r2(parseNum($('#f-amount').value));
      if (!name) { $('#f-name').focus(); toast('Ponle un nombre'); return; }
      if (!(amount > 0)) { $('#f-amount').focus(); toast('Escribe una cantidad'); return; }
      let day = parseInt($('#f-day').value, 10);
      day = day >= 1 && day <= 31 ? day : null;
      const rec = $('#f-rec').checked;
      const once = $('#f-once') && $('#f-once').checked;
      const mk = curMk();
      const id = ui.sheet.id;
      if (id) {
        const it = S.app.planned.find((p) => p.id === id);
        it.name = name; it.day = day; it.cat = ui.sheet.cat; it.month = rec ? null : mk;
        if (rec && !it.from) it.from = mk;
        if (rec && once) { it.over = it.over || {}; it.over[mk] = amount; }
        else { it.amount = amount; if (it.over) delete it.over[mk]; }
      } else S.app.planned.push({ id: uid(), name, amount, day, cat: ui.sheet.cat, month: rec ? null : mk, from: mk, paid: {} });
      Store.saveApp(); closeSheet(); render(); toast(id ? 'Gasto previsto actualizado' : 'Gasto previsto añadido');
    },
    'del-planned'() {
      const id = ui.sheet.id;
      const ix = S.app.planned.findIndex((p) => p.id === id);
      const [it] = S.app.planned.splice(ix, 1);
      Store.saveApp(); closeSheet(); render();
      toast('Gasto previsto borrado', () => { S.app.planned.splice(ix, 0, it); Store.saveApp(); render(); });
    },
    saving() { openSheet({ type: 'saving' }); },
    'sv-pct'(el) { ui.sheet.draft = { mode: 'percent', value: Number(el.dataset.v) }; renderSheet(); },
    'sv-fixed'() { const c = calc(curMk()); ui.sheet.draft = { mode: 'amount', value: r2(c.saveTarget) }; renderSheet(); const i = $('#sv-amount'); i && i.focus(); },
    'save-saving'() {
      const d = ui.sheet.draft;
      if (!(d.value >= 0)) d.value = 0;
      S.app.saving = { mode: d.mode, value: d.mode === 'percent' ? clamp(Number(d.value) || 0, 0, 100) : r2(Number(d.value) || 0) };
      Store.saveApp(); closeSheet(); render(); toast('Meta de ahorro guardada');
    },
    'new-goal'() { openSheet({ type: 'goal' }); },
    'edit-goal'(el) { openSheet({ type: 'goal', id: el.dataset.id }); },
    'g-emoji'(el) { ui.sheet.emoji = el.dataset.e; $$('.chip[data-act="g-emoji"]').forEach((c) => c.setAttribute('aria-pressed', c.dataset.e === ui.sheet.emoji)); },
    'save-goal'() {
      const name = $('#g-name').value.trim();
      const target = r2(parseNum($('#g-target').value));
      const saved = r2(parseNum($('#g-saved').value));
      const dl = $('#g-deadline').value;
      if (!name) { $('#g-name').focus(); toast('Ponle un nombre'); return; }
      if (!(target > 0)) { $('#g-target').focus(); toast('¿Cuánto quieres juntar?'); return; }
      const deadline = /^\d{4}-\d{2}$/.test(dl) ? dl : null;
      const id = ui.sheet.id;
      if (id) Object.assign(S.app.goals.find((g) => g.id === id), { name, target, saved, deadline, emoji: ui.sheet.emoji });
      else S.app.goals.push({ id: uid(), name, target, saved, deadline, emoji: ui.sheet.emoji });
      Store.saveApp(); closeSheet(); render(); toast(id ? 'Hucha actualizada' : 'Hucha creada');
    },
    'del-goal'() {
      const id = ui.sheet.id;
      const ix = S.app.goals.findIndex((g) => g.id === id);
      const [g] = S.app.goals.splice(ix, 1);
      Store.saveApp(); closeSheet(); render();
      toast('Hucha borrada', () => { S.app.goals.splice(ix, 0, g); Store.saveApp(); render(); });
    },
    deposit(el) { openSheet({ type: 'deposit', id: el.dataset.id }); },
    'd-fill'(el) { const i = $('#d-amount'); i.value = String(el.dataset.v).replace('.', decSep()); },
    'deposit-save'() { moveGoal(1); },
    withdraw() { moveGoal(-1); },
    extra(el) { openSheet({ type: 'extra', amount: el.dataset.amount ? Number(el.dataset.amount) : null }); },
    'x-goal'(el) { ui.sheet.goal = el.dataset.id; $$('.chip[data-act="x-goal"]').forEach((c) => c.setAttribute('aria-pressed', c.dataset.id === ui.sheet.goal)); },
    'extra-save'() {
      const x = r2(parseNum($('#x-amount').value));
      if (!(x > 0)) { $('#x-amount').focus(); toast('Escribe una cantidad'); return; }
      const mk = curMk();
      const m = Mw(mk);
      m.extra = r2((m.extra || 0) + x);
      Store.saveMonth(mk);
      const g = ui.sheet.goal && S.app.goals.find((y) => y.id === ui.sheet.goal);
      if (g) { g.saved = r2(g.saved + x); Store.saveApp(); }
      closeSheet(); render();
      toast(g ? `${money(x)} a “${g.name}”` : `${money(x)} apartados. ¡Ya son ahorro!`, () => {
        const mm = Mw(mk); mm.extra = r2(Math.max(0, mm.extra - x)); Store.saveMonth(mk);
        if (g) { g.saved = r2(g.saved - x); Store.saveApp(); }
        render();
      });
    },
    'extra-undo'() {
      const mk = curMk(); const m = Mw(mk); const prev = m.extra; m.extra = 0; Store.saveMonth(mk);
      closeSheet(); render();
      toast('Dinero devuelto al día a día', () => { Mw(mk).extra = prev; Store.saveMonth(mk); render(); });
    },
    gm(el) { const cm = curMk(); const cur = ui.gm && ui.gm <= cm ? ui.gm : cm; ui.gm = addMonths(cur, Number(el.dataset.d)); if (ui.gm > cm) ui.gm = cm; render(); },
    's-cur'(el) { ui.sheet.cur = el.dataset.c; $$('.chip[data-act="s-cur"]').forEach((c) => c.setAttribute('aria-pressed', c.dataset.c === ui.sheet.cur)); },
    's-save'() {
      S.app.name = $('#s-name').value.trim();
      if (ui.sheet.cur) S.app.currency = ui.sheet.cur;
      fmtCache.clear();
      Store.saveApp(); closeSheet(); render(); toast('Ajustes guardados');
    },
    export() { exportData(); },
    async install() { if (ui.installEvt) { ui.installEvt.prompt(); try { await ui.installEvt.userChoice; } catch { /* nada */ } ui.installEvt = null; renderSheet(); } },
    demo() { enterDemo(); },
    'demo-exit'() { exitDemo(); },
    'ask-reset'() {
      openSheet({
        type: 'confirm', title: '¿Borrar todo?', ok: 'Sí, borrar',
        text: 'Se borrarán tu plan, tus gastos y tus huchas de este dispositivo' + (Store.mode === 'cloud' ? ' y de tu cuenta' : '') + '. Si quieres conservarlos, exporta antes una copia.',
        onOk: async () => {
          if (DEMO) { DEMO = false; S = REAL || S; REAL = null; }
          await Store.wipe();
          S = { app: blankApp(), months: {} };
          ui.ob = null; ui.tab = 'hoy';
          closeSheet(); render(); scrollTo(0, 0);
        },
      });
    },
    'confirm-ok'() { const f = ui.sheet && ui.sheet.onOk; if (f) f(); },
    undo() { const f = undoFn; undoFn = null; $('#toast-root').innerHTML = ''; if (f) f(); },

    // onboarding
    'ob-cur'(el) { ui.ob.currency = el.dataset.c; render(); },
    'ob-next'() { ui.ob.step = Math.min(4, ui.ob.step + 1); render(); scrollTo(0, 0); focusFirst(); },
    'ob-back'() { ui.ob.step = Math.max(0, ui.ob.step - 1); render(); scrollTo(0, 0); },
    'ob-add'(el) {
      const k = el.dataset.kind;
      ui.ob[k].forEach((r) => delete r.focus);
      ui.ob[k].push({ id: uid(), name: '', amount: '', cat: 'otros', focus: true });
      render();
      const rows = $$('.ob-row'); const last = rows[rows.length - 1]; last && $('input', last).focus();
    },
    'ob-preset'(el) {
      ui.ob.planned.forEach((r) => delete r.focus);
      ui.ob.planned.push({ id: uid(), name: el.dataset.name, amount: '', cat: el.dataset.cat, focus: true });
      render();
      const f = $('[data-focus]'); f && f.focus();
    },
    'ob-del'(el) { ui.ob[el.dataset.kind].splice(Number(el.dataset.ix), 1); render(); },
    'ob-pct'(el) { ui.ob.saving = { mode: 'percent', value: Number(el.dataset.v) }; render(); },
    'ob-fixed'() { const c = obCalc(); ui.ob.saving = { mode: 'amount', value: c.target ? String(r2(c.target)).replace('.', decSep()) : '' }; render(); const f = $('[data-focus]'); f && f.focus(); },
    'ob-finish'() { obFinish(); },
  };
  function focusFirst() {
    if (matchMedia('(pointer: coarse)').matches) return;
    const f = $('.ob input.money-in'); f && f.focus();
  }
  function moveGoal(sign) {
    const g = S.app.goals.find((x) => x.id === ui.sheet.id);
    const v = r2(parseNum($('#d-amount').value));
    if (!g || !(v > 0)) { $('#d-amount').focus(); return; }
    const before = g.saved;
    g.saved = r2(Math.max(0, g.saved + sign * v));
    Store.saveApp(); closeSheet(); render();
    const done = sign > 0 && g.saved >= g.target;
    toast(done ? `¡Hucha completa! ${g.name}` : sign > 0 ? `+${money(v)} en ${g.name}` : `−${money(v)} de ${g.name}`, () => { g.saved = before; Store.saveApp(); render(); });
  }

  // ───────────────────────── eventos ─────────────────────────
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t || t.disabled) return;
    const f = A[t.dataset.act];
    if (f) { e.preventDefault(); f(t, e); }
  });
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.ob) {
      const path = t.dataset.ob.split('.');
      let o = ui.ob;
      for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
      o[path[path.length - 1]] = t.value;
      const c = obCalc();
      const tot = $('#ob-total');
      if (tot) tot.textContent = money(ui.ob.step === 1 ? c.income : c.planned);
      const sv = $('#ob-sv');
      if (sv) sv.innerHTML = obSavingLine(c);
      return;
    }
    if (t.id === 'sv-amount' || t.id === 'sv-percent') {
      const d = ui.sheet.draft;
      if (t.id === 'sv-amount') { d.mode = 'amount'; d.value = parseNum(t.value); const p = $('#sv-percent'); if (p) p.value = ''; }
      else { d.mode = 'percent'; d.value = clamp(parseNum(t.value), 0, 100); const a = $('#sv-amount'); if (a) a.value = ''; }
      const c = calc(curMk());
      const target = d.mode === 'percent' ? (c.income * d.value) / 100 : d.value;
      const free = c.income - c.planned - target;
      $('#sv-preview').innerHTML = savingPreview(target, free, free / c.days, c);
      return;
    }
    if (t.id === 'x-amount') { $('#x-preview').innerHTML = extraPreview(parseNum(t.value), calc(curMk())); return; }
    if (t.id === 'exp-date' && ui.sheet) { ui.sheet.date = t.value || todayDk(); const v = $('#verdict'); if (v) v.outerHTML = verdictHTML(ui.sheet.mode === 'check'); }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'import-file' && e.target.files && e.target.files[0]) importData(e.target.files[0]);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui.sheet) { closeSheet(); return; }
    const sh = ui.sheet;
    if (!sh || sh.type !== 'expense' || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') { if (e.key === 'Enter') { e.preventDefault(); saveExpense(); } return; }
    if (/^[0-9]$/.test(e.key)) { pressKey(e.key); e.preventDefault(); }
    else if (e.key === ',' || e.key === '.') { pressKey('.'); e.preventDefault(); }
    else if (e.key === 'Backspace') { pressKey('del'); e.preventDefault(); }
    else if (e.key === 'Enter') { e.preventDefault(); saveExpense(); }
  });
  window.addEventListener('hashchange', () => {
    const h = location.hash.slice(1);
    if (TABS.some((t) => t.id === h) && h !== ui.tab) { ui.tab = h; render(); }
  });
  // Si cambia el día con la app abierta, recalcula
  let lastDay = todayDk();
  const tick = () => { if (todayDk() !== lastDay) { lastDay = todayDk(); ensureSummaries(); if (!ui.sheet) render(); } };
  setInterval(tick, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); ui.installEvt = e; });

  // ───────────────────────── arranque ─────────────────────────
  function boot() {
    const loaded = Store.loadLocal();
    S = { app: loaded.app, months: loaded.months };
    const h = location.hash.slice(1);
    if (TABS.some((t) => t.id === h)) ui.tab = h;
    if (S.app.onboarded) ensureSummaries();
    render();
    Store.connectCloud();
    if ('serviceWorker' in navigator && !window.claude && /^(https:|http:\/\/localhost|http:\/\/127\.)/.test(location.href)) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }
  // Expuesto para pruebas
  window.__ahorro = { calc: (mk) => calc(mk || curMk()), verdict: (x) => verdict(x, calc(curMk())), parseNum, state: () => S };
  boot();
})();
