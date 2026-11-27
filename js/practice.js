/* isatprep · Practice Mode — question bank with free navigation, Untimed / Rush modes, report and AI tutor.
   Same look as the Daily SAT Mock (css/app.css + css/practice.css). Progress lives in localStorage (one object),
   a summary is sent to the practice sheet, and the AI tutor talks to Gemini only through the Apps Script backend. */
(function () {
  'use strict';
  var C = window.SATCore;
  var CFG = window.SAT_CONFIG || {};
  var BANK = window.PRACTICE_BANK = window.PRACTICE_BANK || {};
  var $app = document.getElementById('app'), $layer = document.getElementById('layer'), $toasts = document.getElementById('toasts');
  var BANK_VER = (document.querySelector('meta[name="bank-version"]') || {}).content || '1';

  /* =================================================================== constants */
  var SEC = { rw: { name: 'Reading & Writing', short: 'R&W', count: 185 }, math: { name: 'Math', short: 'Math', count: 170 } };
  var DIFF = { E: 'Easy', M: 'Medium', H: 'Hard' };
  var RUSH = { rw: { E: 50, M: 70, H: 90 }, math: { E: 70, M: 95, H: 120 } };   // seconds per question
  var KEY = 'isatprep:practice:v1';
  var AI_DAILY = 8;
  var BADGE = {
    ok: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#16915a"/><path d="M5.8 10.4l2.8 2.8 5.6-6" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bad: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#d63a3f"/><path d="M7 7l6 6M13 7l-6 6" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>',
    okr: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#f2b705" stroke="#c98f00" stroke-width="1"/><rect x="4.6" y="8.4" width="10.8" height="3.2" rx=".6" fill="#fff"/></svg>',
    to: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#7a5ad8"/><path d="M10 5.6V10l2.8 1.8" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>'
  };
  var KHEX = '3ecfa63da7d6047e8b1b5b694cac2db0bc8f1335bbf514537a0acf2ac2bf13b0';

  /* =================================================================== utilities */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function now() { return Date.now(); }
  function uid(n) { var a = 'abcdefghijkmnpqrstuvwxyz23456789', s = ''; for (var i = 0; i < (n || 12); i++) s += a.charAt(Math.floor(Math.random() * a.length)); return s; }
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function isNarrow() { return window.matchMedia('(max-width: 899px)').matches; }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function fmt(ms) {
    var s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (x < 10 ? '0' : '') + x;
  }
  function fmtLong(ms) { var m = Math.round(ms / 60000); return m < 60 ? m + ' min' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function renderMath(el, dollars) {
    if (!el || !window.renderMathInElement) return;
    var dl = [{ left: '\\(', right: '\\)', display: false }, { left: '\\[', right: '\\]', display: true }];
    if (dollars) dl = [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }].concat(dl);
    try { window.renderMathInElement(el, { delimiters: dl, throwOnError: false, ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'input'] }); } catch (e) { }
  }
  var Store = (function () {
    var ok = false, mem = {};
    try { var k = '__isat_probe__'; localStorage.setItem(k, '1'); localStorage.removeItem(k); ok = true; } catch (e) { }
    return {
      ok: ok,
      get: function (k) { try { return ok ? localStorage.getItem(k) : (k in mem ? mem[k] : null); } catch (e) { return k in mem ? mem[k] : null; } },
      set: function (k, v) { mem[k] = v; if (!ok) return; try { localStorage.setItem(k, v); } catch (e) { } },
      del: function (k) { delete mem[k]; try { if (ok) localStorage.removeItem(k); } catch (e) { } }
    };
  })();
  // Night mode: remembered per device; the first visit follows the phone/laptop setting.
  function theme() { var t = Store.get('isatprep:theme'); if (t === 'dark' || t === 'light') return t; try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { return 'light'; } }
  function applyTheme() { var t = theme(); document.documentElement.setAttribute('data-theme', t); var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', t === 'dark' ? '#0f131c' : '#ffffff'); }
  function toggleTheme() {
    Store.set('isatprep:theme', theme() === 'dark' ? 'light' : 'dark'); applyTheme();
    $$('[data-action="theme"]').forEach(function (b) { var d = theme() === 'dark'; b.innerHTML = (d ? I.sun : I.moon) + '<span>' + (d ? 'Light' : 'Night') + '</span>'; b.setAttribute('aria-label', d ? 'Switch to light mode' : 'Switch to night mode'); });
  }
  function themeBtn(cls) { var d = theme() === 'dark'; return '<button class="' + cls + '" data-action="theme" aria-label="' + (d ? 'Switch to light mode' : 'Switch to night mode') + '">' + (d ? I.sun : I.moon) + '<span>' + (d ? 'Light' : 'Night') + '</span></button>'; }
  function deviceId() { var id = Store.get('isatprep:device'); if (!id) { id = 'd-' + uid(14); Store.set('isatprep:device', id); } return id; }
  var KB = (function () { var a = []; for (var i = 0; i < KHEX.length; i += 2) a.push(parseInt(KHEX.substr(i, 2), 16)); return a; })();
  var keyCache = {};
  function keyOf(sec, q) {
    var ck = sec + q.n; if (ck in keyCache) return keyCache[ck];
    var bin = atob(q.k), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) ^ KB[i % KB.length];
    var s = new TextDecoder('utf-8').decode(bytes);
    var v = q.t === 'mcq' ? s : JSON.parse(s);
    keyCache[ck] = v; return v;
  }
  function isRight(sec, q, a) {
    if (a == null || a === '') return false;
    var k = keyOf(sec, q);
    return q.t === 'mcq' ? a === k : C.isSprCorrect(a, k);
  }
  function keyText(sec, q) {
    var k = keyOf(sec, q); if (q.t === 'mcq') return k;
    return k.join(' or ');
  }

  /* =================================================================== icons */
  var I = {
    bookmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4.2-6.5 4.2v-16a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    bookmarkOn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4.2-6.5 4.2v-16a1 1 0 0 1 1-1z" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    calc: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="2.5" width="15" height="19" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="7.5" y="5.5" width="9" height="4" rx="1" fill="currentColor"/><circle cx="8.5" cy="13" r="1.2" fill="currentColor"/><circle cx="12" cy="13" r="1.2" fill="currentColor"/><circle cx="15.5" cy="13" r="1.2" fill="currentColor"/><circle cx="8.5" cy="17" r="1.2" fill="currentColor"/><circle cx="12" cy="17" r="1.2" fill="currentColor"/><circle cx="15.5" cy="17" r="1.2" fill="currentColor"/></svg>',
    ref: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.5h10l4 4v13H5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 11h8M8 14.5h8M8 18h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M14.5 3.5v4.5h4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    chevLeft: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevRight: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    marker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4.5l5 5-8.5 8.5H6v-5z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M4 21h16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    listCheck: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7l1.6 1.6L8.5 5.6M4 15l1.6 1.6 2.9-3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 7h8M12 15h8" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    chevUp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevDown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    cross: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 11v6M12 7.5v.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3.5L10.5 13.5M21 3.5l-6.5 17-4-7-7-4z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" fill="currentColor"/></svg>',
    shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M8.5 12l2.5 2.5 4.5-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    unlock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 6.8-1.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z" fill="currentColor"/></svg>',
    leaf: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15M5 19l7-7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V4M4 20h16" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M8 16v-5M12 16V8M16 16v-3" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.9"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.9"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.9"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.9"/></svg>',
    bot: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="7.5" width="15" height="11" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="9.5" cy="13" r="1.4" fill="currentColor"/><circle cx="14.5" cy="13" r="1.4" fill="currentColor"/><path d="M12 7.5V4.5M10 4.5h4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    fire: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21c-3.9 0-6.5-2.6-6.5-6.1 0-3.3 2.3-5.4 3.6-8.4.5 2 1.6 3.1 2.9 3.8.2-2.6 1.3-5 3.5-6.8-.1 3.8 3 5.7 3 10 0 4.3-2.7 7.5-6.5 7.5z" fill="currentColor"/></svg>',
    redo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8.5A7.5 7.5 0 1 0 19.5 15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M19.5 4v5h-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    filter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16l-6.2 7.3v5.7l-3.6 1.8v-7.5z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    laptop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="5" width="15" height="10.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M2.5 19h19" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>'
  };
  function abcIcon(on) { return '<span class="abc-ico' + (on ? ' on' : '') + '" aria-hidden="true">ABC<i></i></span>'; }
  function wordmark() {
    return '<span class="wm-mark" aria-hidden="true"><svg viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="url(#wmg)"/><defs><linearGradient id="wmg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f5df0"/><stop offset="1" stop-color="#7a3cf0"/></linearGradient></defs><circle cx="16" cy="9" r="2.6" fill="#fff"/><rect x="13.6" y="13.2" width="4.8" height="11.5" rx="2.4" fill="#fff"/></svg></span><span class="wm-text">' + esc(CFG.brand || 'isatprep') + '</span>';
  }

  /* =================================================================== state */
  var P = null;
  function fresh() {
    return { v: 1, user: null, mode: 'untimed', sec: 'rw', cur: { rw: 1, math: 1 }, at: {}, streak: 0, best: 0, sessionMs: 0,
      f: { d: { E: 1, M: 1, H: 1 }, st: 'all', sk: '' }, ui: { abc: false, calcOpen: false, calcW: 0, panel: true },
      sync: { sent: 0, dirty: false, id: 'p-' + uid(10) }, ai: { day: '', used: 0 }, createdAt: now(), mig: { rw: 1, math: 1 } };
  }
  function load() {
    var raw = Store.get(KEY), s = null;
    try { s = raw ? JSON.parse(raw) : null; } catch (e) { s = null; }
    if (!s || s.v !== 1) s = fresh();
    var needMig = !!(s.user && !s.mig);
    var d = fresh();
    Object.keys(d).forEach(function (k) { if (s[k] == null) s[k] = d[k]; });
    if (!s.f.d) s.f.d = { E: 1, M: 1, H: 1 };
    if (needMig) s.mig = {};
    return s;
  }
  function save() { Store.set(KEY, JSON.stringify(P)); }
  function rec(sec, n, make) { var k = sec + ':' + n; if (!P.at[k] && make) P.at[k] = { s: '', ms: 0 }; return P.at[k]; }
  function status(sec, n) { var r = P.at[sec + ':' + n]; return r ? r.s || '' : ''; }

  /* =================================================================== layer / toast */
  var layerOnClose = null;
  function openLayer(html, opts) {
    opts = opts || {}; closeLayer();
    $layer.innerHTML = '<div class="scrim' + (opts.popover ? ' clear' : '') + '" data-action="layer-close"></div>' + html;
    $layer.classList.add('open'); layerOnClose = opts.onClose || null;
    renderMath($layer);
  }
  function closeLayer() {
    if (!$layer.classList.contains('open')) return;
    $layer.classList.remove('open'); $layer.innerHTML = '';
    var cb = layerOnClose; layerOnClose = null; if (cb) cb();
  }
  function modal(o) {
    var acts = (o.actions || []).map(function (a) { return '<button class="btn ' + (a.kind || 'ghost') + '" data-action="' + a.action + '">' + a.label + '</button>'; }).join('');
    openLayer('<div class="modal ' + (o.cls || '') + '" role="dialog" aria-modal="true" aria-label="' + esc(o.title || '') + '" tabindex="-1">' +
      '<div class="modal-head"><h2>' + (o.title || '') + '</h2><button class="icon-btn" data-action="layer-close" aria-label="Close">' + I.close + '</button></div>' +
      '<div class="modal-body">' + o.body + '</div>' + (acts ? '<div class="modal-foot">' + acts + '</div>' : '') + '</div>', o);
  }
  function toast(msg, kind, ms) {
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || 'info');
    el.innerHTML = '<span class="toast-ico">' + (kind === 'warn' ? I.clock : kind === 'ok' ? I.check : I.info) + '</span><span>' + esc(msg) + '</span>';
    $toasts.appendChild(el);
    setTimeout(function () { el.classList.add('show'); }, 10);
    setTimeout(function () { el.classList.remove('show'); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 400); }, ms || 3200);
  }

  /* =================================================================== bank loading */
  var loading = {};
  function loadBank(sec, cb) {
    if (BANK[sec]) return cb(true);
    if (loading[sec]) { loading[sec].push(cb); return; }
    loading[sec] = [cb];
    var s = document.createElement('script');
    s.src = 'practice/bank-' + sec + '.js?v=' + BANK_VER;
    s.onload = function () { if (BANK[sec]) migrate(sec); var w = loading[sec]; loading[sec] = null; w.forEach(function (f) { f(!!BANK[sec]); }); };
    s.onerror = function () { var w = loading[sec]; loading[sec] = null; s.parentNode.removeChild(s); w.forEach(function (f) { f(false); }); };
    document.head.appendChild(s);
  }
  // Progress saved before the mixed order (Nov 27) is keyed by the old position: move it to the new numbers once.
  function migrate(sec) {
    P.mig = P.mig || {}; if (P.mig[sec]) return;
    var map = {}; BANK[sec].forEach(function (q) { map[q.o] = q.n; });
    var at = {};
    Object.keys(P.at).forEach(function (k) {
      var p = k.split(':'), r = P.at[k];
      if (p[0] !== sec) { at[k] = r; return; }
      var nn = map[+p[1]]; if (!nn) return;
      if (r.rev && r.last !== 'ok') { r.gave = true; r.showX = true; }   // old releases showed the answer automatically
      at[sec + ':' + nn] = r;
    });
    P.at = at; if (map[P.cur[sec]]) P.cur[sec] = map[P.cur[sec]];
    P.mig[sec] = 1; save();
  }
  function qs(sec) { return BANK[sec] || []; }
  function qAt(sec, n) { return qs(sec)[n - 1]; }

  /* =================================================================== welcome */
  function screenWelcome() {
    stopTicker();
    $app.className = 'app page';
    var u = P.user, done = doneCount('rw') + doneCount('math');
    var rules = [
      [I.shield, 'Use your real name and Telegram username', 'Your progress is saved under it, and it’s how you appear on the leaderboard.'],
      [I.unlock, 'Nothing is locked', 'Pick any question, in any order, and come back to it as many times as you like.'],
      [I.bot, 'Use the built-in AI tutor', 'Stuck? Ask the tutor for a hint. No outside AI or answer keys: the point is to learn.'],
      [I.send, 'Share your report', 'Finish a section and post your report in the channel.']
    ];
    var modes = '<div class="mode-pick" role="radiogroup" aria-label="Practice mode">' +
      modeCard('untimed', I.leaf, 'Untimed practice', 'No limits. A stopwatch shows how long each question takes.') +
      modeCard('rush', I.bolt, 'Rush mode', 'Every question has a countdown. Beat the clock, build a streak.') + '</div>';
    var form;
    if (u) {
      form = '<div class="start-card" id="startForm">' +
        '<h2>Welcome back, ' + esc(u.name.split(' ')[0]) + '!</h2>' +
        '<div class="wb-stats"><div><b>' + done + '</b><span>of 355 done</span></div><div><b>' + pct(correctCount('rw') + correctCount('math'), done) + '%</b><span>correct</span></div><div><b>' + P.best + '</b><span>best streak</span></div></div>' +
        '<span class="field-lbl">Mode</span>' + modes +
        '<button class="btn primary big block" data-action="go">Continue practicing ' + I.chevRight + '</button>' +
        '<button class="btn ghost block" data-action="report">' + I.chart + ' My report</button>' +
        '<p class="fine">' + I.info + '<span>Not ' + esc(u.name.split(' ')[0]) + '? <a href="#" data-action="switch-user">Switch student</a></span></p>' +
        '</div>';
    } else {
      var name = Store.get('isatprep:name') || '', tg = Store.get('isatprep:tg') || '';
      form = '<form class="start-card" id="startForm" novalidate autocomplete="on">' +
        '<h2>Who’s practicing?</h2>' +
        '<label class="field"><span>Full name</span><input id="fName" type="text" maxlength="40" autocomplete="name" placeholder="e.g. Aziza Karimova" value="' + esc(name) + '"></label>' +
        '<label class="field"><span>Telegram username</span><div class="at-input"><b>@</b><input id="fTg" type="text" maxlength="33" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="username" value="' + esc(tg) + '"></div></label>' +
        '<span class="field-lbl">Mode</span>' + modes +
        '<label class="agree"><input type="checkbox" id="fAgree"><span>I’ve read the rules and I’ll follow them.</span></label>' +
        '<p class="field-err" id="fErr" hidden></p>' +
        '<button class="btn primary big block" type="submit">Start practicing ' + I.chevRight + '</button>' +
        '<p class="fine">' + I.laptop + '<span>Works on laptops and phones. Your progress is saved on this device.</span></p>' +
        '</form>';
    }
    $app.innerHTML = '<header class="brandbar"><a class="wordmark" href="practice.html">' + wordmark() + '</a>' + themeBtn('theme-pill') + '</header>' +
      '<main class="welcome">' +
      '<section class="hero">' +
        '<div class="hero-copy">' +
          '<div class="eyebrow">' + I.spark + ' Practice Mode</div>' +
          '<h1>SAT Question Bank</h1>' +
          '<div class="chips"><span>' + I.book + ' 355 questions</span><span>' + I.grid + ' R&amp;W 185 · Math 170</span><span><i class="dd e"></i><i class="dd m"></i><i class="dd h"></i> Easy · Medium · Hard</span></div>' +
          '<div class="rules-card"><h2>How it works</h2><ol class="rule-list">' + rules.map(function (r, i) {
            return '<li><span class="rl-ico">' + r[0] + '</span><div><b>' + (i + 1) + '. ' + r[1] + '</b><p>' + r[2] + '</p></div></li>';
          }).join('') + '</ol></div>' +
        '</div>' + form +
      '</section>' +
      '<footer class="foot">Unofficial practice. SAT® is a trademark of College Board, which is not affiliated with this site.</footer>' +
      '</main>';
    paintModePick();
    $$('.mode-card').forEach(function (b) { b.addEventListener('click', function () { P.mode = b.getAttribute('data-mode'); save(); paintModePick(); }); });
    var f = $('form#startForm');
    if (f) {
      var nameIn = $('#fName'), tgIn = $('#fTg'), err = $('#fErr'), agree = $('#fAgree');
      tgIn.addEventListener('input', function () { err.hidden = true; var v = tgIn.value.replace(/^@+/, '').replace(/[^A-Za-z0-9_]/g, ''); if (v !== tgIn.value) tgIn.value = v; });
      nameIn.addEventListener('input', function () { err.hidden = true; });
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var nm = nameIn.value.trim().replace(/\s+/g, ' '), t = tgIn.value.trim();
        if (nm.length < 2) { err.textContent = 'Please enter your real name (at least 2 letters).'; err.hidden = false; nameIn.focus(); return; }
        if (!/^[A-Za-z0-9_]{4,32}$/.test(t)) { err.textContent = 'Please enter your Telegram username (at least 4 letters, numbers or _).'; err.hidden = false; tgIn.focus(); return; }
        if (!agree.checked) { err.textContent = 'Please read the rules and tick the box.'; err.hidden = false; return; }
        Store.set('isatprep:name', nm.slice(0, 40)); Store.set('isatprep:tg', t.slice(0, 32));
        P.user = { name: nm.slice(0, 40), tg: t.slice(0, 32) }; P.sync.dirty = true; save();
        startPractice();
      });
    }
  }
  function modeCard(id, ico, title, desc) {
    return '<button type="button" class="mode-card" role="radio" data-mode="' + id + '"><span class="mc-ico ' + id + '">' + ico + '</span><span><b>' + title + '</b><small>' + desc + '</small></span></button>';
  }
  function paintModePick() { $$('.mode-card').forEach(function (b) { var on = b.getAttribute('data-mode') === P.mode; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); }); }

  /* =================================================================== practice screen */
  var view = { qStart: 0, ticker: null, pendingAnswer: null, rushLeft: null };
  function startPractice() {
    $app.className = 'app page';
    $app.innerHTML = '<div class="boot"><div class="boot-mark"></div><p>Loading questions…</p></div>';
    loadBank(P.sec, function (ok) {
      if (!ok) { $app.innerHTML = '<div class="boot"><p>Couldn’t load the questions. Check your connection.</p><button class="btn primary" onclick="location.reload()">Try again</button></div>'; return; }
      screenPractice();
      setTimeout(function () { loadBank(P.sec === 'rw' ? 'math' : 'rw', function () { }); }, 1500);   // warm the other section
    });
  }
  function screenPractice() {
    var sec = P.sec;
    $app.className = 'app test practice ' + (sec === 'math' ? 'math' : 'rw') + (P.ui.calcOpen && sec === 'math' ? ' calc-open' : '') + (P.mode === 'rush' ? ' rush' : '');
    $app.innerHTML =
      '<header class="tb ptb">' +
        '<div class="tb-left"><a class="wordmark sm" href="practice.html" data-action="home" aria-label="Practice home">' + wordmark() + '</a>' +
          '<div class="seg" role="tablist" aria-label="Section">' + ['rw', 'math'].map(function (s) {
            return '<button role="tab" class="' + (s === sec ? 'on' : '') + '" data-action="sec" data-sec="' + s + '" aria-selected="' + (s === sec) + '"><span class="full">' + SEC[s].name + '</span><span class="short">' + SEC[s].short + '</span></button>';
          }).join('') + '</div></div>' +
        '<div class="tb-center" id="clockBox"></div>' +
        '<div class="tb-right">' +
          '<button class="tool mode-tool" data-action="mode" title="Switch mode">' + (P.mode === 'rush' ? I.bolt : I.leaf) + '<span>' + (P.mode === 'rush' ? 'Rush' : 'Untimed') + '</span></button>' +
          (sec === 'math' ? '<button class="tool" data-action="calc" aria-pressed="' + (P.ui.calcOpen ? 'true' : 'false') + '">' + I.calc + '<span><b class="full">Calculator</b><b class="short">Calc</b></span></button><button class="tool" data-action="reference">' + I.ref + '<span><b class="full">Reference</b><b class="short">Ref</b></span></button>' : '') +
          '<button class="tool" data-action="hl-help" title="Highlight text">' + I.marker + '<span>Highlight</span></button>' +
          '<button class="tool" data-action="tutor" aria-pressed="false">' + I.bot + '<span><b class="full">AI tutor</b><b class="short">Tutor</b></span></button>' +
          '<button class="tool" data-action="report">' + I.chart + '<span>Report</span></button>' + themeBtn('tool theme-tool') +
        '</div>' +
      '</header>' +
      '<div class="tb-rule" aria-hidden="true"></div>' +
      '<div class="work">' +
        '<aside class="qmap" id="qmap" aria-label="Question map"></aside>' +
        (sec === 'math' ? '<aside class="calc-dock" id="calcDock" aria-label="Desmos graphing calculator"><div class="calc-head"><b>' + I.calc + ' Calculator</b><button class="icon-btn" data-action="calc" aria-label="Close calculator">' + I.close + '</button></div><div class="calc-body" id="calcBody"></div><div class="calc-resize" id="calcResize" aria-hidden="true"></div></aside>' : '') +
        '<main class="stage" id="stage"></main>' +
        '<aside class="tutor" id="tutor" aria-label="AI tutor" hidden></aside>' +
      '</div>' +
      '<footer class="bb" id="bb"></footer>';
    if (sec === 'math') { mountDesmos(); setupCalcResize(); }
    paintMap(); paintQuestion(); startTicker();
  }

  /* ---------------------------------------------------------------- map */
  function filtered(sec) {
    var f = P.f;
    return qs(sec).filter(function (q) {
      if (!f.d[q.d]) return false;
      if (f.sk && q.sk !== f.sk) return false;
      var s = status(sec, q.n), r = P.at[sec + ':' + q.n];
      if (f.st === 'new') return !s;
      if (f.st === 'wrong') return s === 'bad' || s === 'to';
      if (f.st === 'right') return s === 'ok' || s === 'okr';
      if (f.st === 'marked') return !!(r && r.mk);
      return true;
    });
  }
  function paintMap() {
    var el = $('#qmap'); if (!el) return;
    var sec = P.sec, list = filtered(sec), all = qs(sec);
    var skills = []; all.forEach(function (q) { if (skills.indexOf(q.sk) < 0) skills.push(q.sk); });
    var d = doneCount(sec);
    el.innerHTML =
      '<div class="qm-head"><b class="qm-title" title="' + d + '/' + all.length + ' done · ' + pct(correctCount(sec), d) + '% correct">Questions</b>' +
        '<label class="qm-pill">' + I.listCheck + '<select id="fSt" aria-label="Show">' + [['all', 'All questions'], ['new', 'Not tried yet'], ['wrong', 'My mistakes'], ['marked', 'For review'], ['right', 'Correct']].map(function (o) { return '<option value="' + o[0] + '"' + (P.f.st === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
        '<button class="icon-btn qm-ftog" data-action="ftoggle" aria-pressed="' + (showFilters || fActive()) + '" aria-label="Filter by difficulty or skill">' + I.filter + '</button>' +
        '<button class="icon-btn qm-close" data-action="panel" aria-label="Close question map">' + I.close + '</button></div>' +
      (showFilters || fActive() ? '<div class="qm-filters"><div class="dchips">' + ['E', 'M', 'H'].map(function (k) { return '<button class="dchip ' + k.toLowerCase() + (P.f.d[k] ? ' on' : '') + '" data-action="fd" data-d="' + k + '" aria-pressed="' + !!P.f.d[k] + '">' + DIFF[k] + '</button>'; }).join('') + '</div>' +
        '<select id="fSk" class="qm-skill" aria-label="Skill"><option value="">All skills</option>' + skills.map(function (s) { return '<option' + (P.f.sk === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></div>' : '') +
      '<div class="qm-legend"><span><i class="lg-b">' + BADGE.ok + '</i>Correct</span><span><i class="lg-b">' + BADGE.bad + '</i>Incorrect</span><span><i class="lg-f">' + I.bookmarkOn + '</i>For Review</span><span><i class="lg-b">' + BADGE.okr + '</i>Correct (incorrect attempts)</span>' +
        (P.mode === 'rush' || hasTimeouts() ? '<span><i class="lg-b">' + BADGE.to + '</i>Timed out</span>' : '') + '</div>' +
      (list.length ? '<div class="tiles">' + list.map(function (q) {
        var s = status(sec, q.n), r = P.at[sec + ':' + q.n];
        return '<button class="tile d' + q.d + (s ? ' s-' + s : '') + (q.n === P.cur[sec] ? ' cur' : '') + '" data-action="goto" data-n="' + q.n + '" title="' + DIFF[q.d] + ' · ' + esc(q.sk) + '" aria-label="Question ' + q.n + ', ' + DIFF[q.d] + (s ? ', ' + statusWord(s) : ', not tried') + '">' + q.n +
          (s ? '<i class="tbadge ' + s + '">' + BADGE[s] + '</i>' : '') + (r && r.mk ? '<i class="tflag">' + I.bookmarkOn + '</i>' : '') + '</button>';
      }).join('') + '</div>' : '<div class="qm-empty">No questions match these filters.<button class="mini-btn" data-action="fclear">Show all</button></div>');
    var st = $('#fSt'), sk = $('#fSk');
    st.addEventListener('change', function () { P.f.st = st.value; save(); paintMap(); paintBottom(); });
    if (sk) sk.addEventListener('change', function () { P.f.sk = sk.value; save(); paintMap(); paintBottom(); });
    var cur = $('.tile.cur', el); if (cur && cur.scrollIntoView) try { cur.scrollIntoView({ block: 'nearest' }); } catch (e) { }
  }
  var showFilters = false;
  function fActive() { return !!(P.f.sk || !(P.f.d.E && P.f.d.M && P.f.d.H)); }
  function hasTimeouts() { return Object.keys(P.at).some(function (k) { return P.at[k].s === 'to'; }); }
  function statusWord(s) { return { ok: 'correct', okr: 'correct on retry', bad: 'wrong', to: 'timed out' }[s] || 'not tried'; }

  /* ---------------------------------------------------------------- question */
  function curQ() { return qAt(P.sec, P.cur[P.sec]); }
  function paintQuestion() {
    var sec = P.sec, q = curQ(), stage = $('#stage');
    if (!q) { P.cur[sec] = 1; q = curQ(); }
    var r = rec(sec, q.n, false) || {};
    view.qStart = now();
    view.pendingAnswer = r.a != null && !r.rev && (r.wr || []).indexOf(r.a) < 0 ? r.a : null;
    view.rushLeft = null; view.lastTick = now();
    var tags = '<span class="dtag ' + q.d.toLowerCase() + '"><i></i>' + DIFF[q.d] + '</span><span class="sktag">' + esc(q.sk) + '</span>';
    var qhead = '<div class="qhead"><div class="qnum">' + q.n + '</div>' +
      '<button class="mark-btn' + (r.mk ? ' on' : '') + '" data-action="mark" aria-pressed="' + !!r.mk + '">' + (r.mk ? I.bookmarkOn : I.bookmark) + '<span>Mark for Review</span></button>' +
      (q.t === 'mcq' ? '<button class="abc-btn' + (P.ui.abc ? ' on' : '') + '" data-action="abc" aria-pressed="' + !!P.ui.abc + '" title="Cross out choices">' + abcIcon(P.ui.abc) + '</button>' : '') + '</div>' +
      '<div class="qtags">' + tags + '</div>';
    var body = qhead + '<div class="prompt">' + q.q + '</div><div id="answerArea"></div><div id="feedback"></div>';
    if (sec === 'rw') {
      stage.className = 'stage split';
      stage.innerHTML = '<section class="pane passage-pane"><div class="passage">' + q.p + '</div></section><div class="divider" aria-hidden="true"></div><section class="pane question-pane" id="qPane">' + body + '</section>';
    } else {
      stage.className = 'stage single';
      stage.innerHTML = '<section class="pane question-pane math-pane" id="qPane"><div class="math-col">' + body + '</div></section>';
    }
    paintAnswer(); paintFeedback();
    renderMath(stage); paintAllHl(); hideHlBar();
    $$('.pane', stage).forEach(function (p) { p.scrollTop = 0; }); stage.scrollTop = 0;
    paintBottom(); paintClock();
    if (tutorOpen) paintTutorHead();
  }
  // r.rev  = finished for now (solved, or the student pressed Show answer) · r.gave = answer shown without solving
  // r.tout = Rush time ran out (the student may keep trying without the clock) · r.wr = wrong answers tried this round
  // r.showX = explanation open. Explanations never open by themselves: the student asks for them.
  function revealed(r) { return !!(r && r.rev); }
  function paintAnswer() {
    var sec = P.sec, q = curQ(), r = rec(sec, q.n, false) || {}, box = $('#answerArea');
    var rev = revealed(r), gave = rev && r.gave, key = rev ? keyOf(sec, q) : null, mine = rev ? r.a : view.pendingAnswer, wr = r.wr || [];
    if (q.t === 'mcq') {
      var st = r.x || {};
      box.innerHTML = '<div class="choices' + (rev ? ' review' : '') + (P.ui.abc && !rev ? ' abc-mode' : '') + '" role="radiogroup" aria-label="Answer choices">' + q.c.map(function (c, i) {
        var L = 'ABCD'.charAt(i), sel = mine === L, isKey = rev && L === key, tried = wr.indexOf(L) >= 0 && !isKey, x = !!st[L] && !rev;
        var tag = isKey ? '<span class="tag ok">' + I.check + (gave ? ' Correct answer' : ' Correct') + '</span>' : tried ? '<span class="tag bad">' + I.cross + ' Tried</span>' : '';
        return '<div class="choice-row' + (sel && !rev ? ' selected' : '') + (isKey ? ' key' : '') + (tried ? (rev ? ' wrong' : ' tried') : '') + (x ? ' struck' : '') + '">' +
          '<div class="choice" role="radio" tabindex="0" aria-checked="' + sel + '" data-action="choose" data-letter="' + L + '"><span class="letter">' + L + '</span><span class="ctext">' + c + '</span>' + tag + '</div>' +
          '<button class="strike" data-action="strike" data-letter="' + L + '" aria-label="Cross out choice ' + L + '">' + (x ? '<u>Undo</u>' : '<span class="strike-l">' + L + '</span>') + '</button></div>';
      }).join('') + '</div>';
    } else if (rev) {
      var ok = !gave;
      box.innerHTML = '<div class="spr-review"><div><small>Your answer</small><b class="' + (ok ? 'ok' : r.a ? 'bad' : 'om') + '">' + (r.a ? esc(r.a) : '—') + '</b></div>' +
        (gave ? '<div><small>Correct answer</small><b class="ok">' + esc(keyText(sec, q)) + '</b></div>' : '') + '</div>';
    } else {
      box.innerHTML = '<div class="spr"><label class="spr-label" for="sprIn">Your answer</label>' +
        '<div class="spr-row"><input id="sprIn" class="spr-input" type="text" inputmode="decimal" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" maxlength="6" value="' + esc(mine || '') + '">' +
        '<div class="spr-keys"><button type="button" class="key" data-action="spr-key" data-key="-" aria-label="Negative sign">−</button><button type="button" class="key" data-action="spr-key" data-key="/" aria-label="Fraction bar">/</button><button type="button" class="key" data-action="spr-key" data-key="." aria-label="Decimal point">.</button></div></div>' +
        (wr.length ? '<p class="spr-tried">' + I.cross + ' Tried: ' + wr.map(esc).join(', ') + '</p>' : '') +
        '<div class="spr-preview" id="sprPrev"></div><p class="spr-hint" id="sprHint" hidden></p></div>';
      bindSpr();
    }
  }
  function bindSpr() {
    var inp = $('#sprIn'), prev = $('#sprPrev'), hint = $('#sprHint'); if (!inp) return;
    function paintPrev() {
      var p = C.sprPreview(inp.value);
      if (p.kind === 'empty') prev.innerHTML = '<span class="muted">Answer preview will appear here</span>';
      else if (p.kind === 'invalid') prev.innerHTML = '<span class="muted">Answer preview: </span><span class="bad">not a complete number yet</span>';
      else { prev.innerHTML = '<span class="muted">Answer preview: </span><span class="pv">\\(' + p.tex + '\\)</span>'; renderMath(prev); }
    }
    function commit() {
      var raw = inp.value, clean = C.sanitizeSpr(raw);
      if (clean !== raw) { inp.value = clean; hint.textContent = 'Only digits, one decimal point, one fraction bar (/), and a leading negative sign. Up to 5 characters (6 with a negative sign).'; hint.hidden = false; setTimeout(function () { hint.hidden = true; }, 4000); }
      view.pendingAnswer = clean || null; paintCheckBtn(); paintPrev();
    }
    inp.addEventListener('input', commit);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (view.pendingAnswer) check(); } });
    sprCommit = commit; paintPrev();
  }
  var sprCommit = null;
  function insertSprKey(k) {
    var inp = $('#sprIn'); if (!inp) return; var v = inp.value;
    if (k === '-') inp.value = v.charAt(0) === '-' ? v.slice(1) : '-' + v;
    else { var s = inp.selectionStart != null ? inp.selectionStart : v.length, e2 = inp.selectionEnd != null ? inp.selectionEnd : v.length; inp.value = v.slice(0, s) + k + v.slice(e2); try { inp.setSelectionRange(s + 1, s + 1); } catch (e) { } }
    if (sprCommit) sprCommit();
  }

  /* ---------------------------------------------------------------- feedback & checking */
  function paintFeedback() {
    var sec = P.sec, q = curQ(), r = rec(sec, q.n, false) || {}, box = $('#feedback'); if (!box) return;
    var h = '', hint = '<button class="btn ghost" data-action="tutor-ask">' + I.bot + ' Get a hint</button>';
    var xBtn = '<button class="btn ghost" data-action="show-x">' + I.spark + ' Show explanation</button>';
    var after = '<button class="btn ghost" data-action="tutor-ask">' + I.bot + ' Ask the AI tutor</button><button class="btn ghost" data-action="retry">' + I.redo + ' Practice again</button><button class="btn primary" data-action="next">Next question ' + I.chevRight + '</button>';
    if (revealed(r) && !r.gave) {
      h = '<div class="fb ok">' + I.check + '<div><b>' + (r.s === 'okr' && (r.wr || []).length ? 'Correct, on a retry!' : 'Correct!') + '</b><span>' + (P.streak > 1 ? I.fire + ' ' + P.streak + ' in a row' : 'Nice work.') + '</span></div></div>' +
        (r.showX ? explainBox(q) : '') + '<div class="fb-actions">' + (r.showX ? '' : xBtn) + after + '</div>';
    } else if (revealed(r)) {
      h = '<div class="fb bad">' + I.cross + '<div><b>The correct answer is ' + esc(keyText(sec, q)) + '.</b><span>Read the explanation, then try a similar question.</span></div></div>' +
        explainBox(q) + '<div class="fb-actions">' + after + '</div>';
    } else {
      if (r.tout) h = '<div class="fb warn">' + I.clock + '<div><b>Time’s up!</b><span>Your streak starts again. You can keep trying without the clock, or show the answer.</span></div></div>';
      else if (r.last === 'bad') h = '<div class="fb bad">' + I.cross + '<div><b>Not quite.</b><span>Try another answer, or show the answer.</span></div></div>';
      h += '<div class="fb-actions"><button class="btn primary" id="checkBtn" data-action="check">Check answer</button>' +
        (r.last === 'bad' || r.tout ? '<button class="btn ghost" data-action="reveal">Show answer</button>' : '') + (P.mode === 'rush' && !r.tout ? '' : hint) + '</div>';
    }
    box.innerHTML = h; renderMath(box); paintCheckBtn();
  }
  function explainBox(q) { return '<div class="explain"><b>' + I.spark + ' Explanation</b><div>' + q.x + '</div></div>'; }
  function showExplanation() { var r = rec(P.sec, curQ().n, true); r.showX = true; save(); paintFeedback(); }
  function paintCheckBtn() { var b = $('#checkBtn'); if (b) b.disabled = !view.pendingAnswer; }
  // Question time stops once the question is finished; session time keeps going.
  function addTime(r) { var t = now(); if (view.qStart && !document.hidden) { var dt = Math.min(t - view.qStart, 30 * 60000); if (!r.rev) r.ms = (r.ms || 0) + dt; P.sessionMs += dt; } view.qStart = t; }
  function refresh(q) { paintAnswer(); paintFeedback(); renderMath($('#answerArea')); paintMapTile(q.n); paintBottom(); paintClock(); }
  function check() {
    var sec = P.sec, q = curQ(); if (!view.pendingAnswer) return;
    var r = rec(sec, q.n, true); if (r.rev) return;
    addTime(r);
    var a = view.pendingAnswer, ok = isRight(sec, q, a);
    r.a = a; r.tries = (r.tries || 0) + 1; r.m = P.mode; r.when = now();
    if (ok) {
      if (r.s !== 'ok' && r.s !== 'okr') r.s = (r.wrongOnce || r.tout) ? 'okr' : 'ok';
      if (r.first == null) r.first = 'ok';
      r.last = 'ok'; r.rev = true; r.gave = false; r.showX = false; P.streak++; if (P.streak > P.best) P.best = P.streak;
    } else {
      r.wrongOnce = true; if (r.first == null) r.first = 'bad';
      if (r.s !== 'ok' && r.s !== 'okr' && r.s !== 'to') r.s = 'bad';
      r.last = 'bad'; r.wr = (r.wr || []).concat([a]); P.streak = 0;
      view.pendingAnswer = null;
    }
    P.sync.dirty = true; save(); refresh(q);
    maybeSync(); checkSectionComplete(sec);
  }
  function reveal() {
    var sec = P.sec, q = curQ(), r = rec(sec, q.n, true);
    addTime(r); r.rev = true; r.gave = true; r.showX = true; if (!r.last) r.last = 'bad';
    if (r.s !== 'ok' && r.s !== 'okr' && r.s !== 'to') r.s = 'bad'; if (r.first == null) r.first = 'bad';
    P.streak = 0; P.sync.dirty = true; save(); refresh(q); maybeSync(); checkSectionComplete(sec);
  }
  function timeUp() {
    var sec = P.sec, q = curQ(), r = rec(sec, q.n, true); if (r.rev || r.tout) return;
    addTime(r); r.tout = true; r.rl = 0; r.m = 'rush'; r.when = now();
    if (r.s !== 'ok' && r.s !== 'okr') r.s = 'to'; if (r.first == null) r.first = 'to';
    P.streak = 0; P.sync.dirty = true; save(); refresh(q);
    maybeSync(); checkSectionComplete(sec);
  }
  function retry() {
    var sec = P.sec, q = curQ(), r = rec(sec, q.n, true);
    addTime(r); r.rev = false; r.gave = false; r.showX = false; r.tout = false; r.wr = []; r.last = ''; r.a = null; r.x = {}; r.rl = null; save();
    view.pendingAnswer = null; view.rushLeft = null; view.qStart = now(); view.lastTick = now();
    paintAnswer(); paintFeedback(); renderMath($('#answerArea')); paintClock();
  }
  function paintMapTile(n) {
    if ($app.classList.contains('map-open')) return paintMap();
    var t = $('.tile[data-n="' + n + '"]'); if (!t) return;
    var sec = P.sec, s = status(sec, n);
    t.className = t.className.replace(/\bs-\w+/g, '').trim() + (s ? ' s-' + s : '');

  }
  function choose(L) {
    var sec = P.sec, q = curQ(), r = rec(sec, q.n, false) || {};
    if (r.rev) return;
    if (P.ui.abc && r.x && r.x[L]) return;
    if ((r.wr || []).indexOf(L) >= 0) { toast('You already tried ' + L + '. Pick another answer.'); return; }
    view.pendingAnswer = L;
    $$('.choice-row').forEach(function (row) { var on = row.querySelector('[data-letter]').getAttribute('data-letter') === L; row.classList.toggle('selected', on); row.querySelector('.choice').setAttribute('aria-checked', on); });
    paintCheckBtn();
  }
  function strike(L) {
    var sec = P.sec, q = curQ(), r = rec(sec, q.n, true); if (r.rev) return;
    r.x = r.x || {}; r.x[L] = !r.x[L]; if (r.x[L] && view.pendingAnswer === L) view.pendingAnswer = null; save(); paintAnswer(); renderMath($('#answerArea')); paintCheckBtn();
  }
  function goTo(n) {
    var sec = P.sec, list = qs(sec); n = Math.max(1, Math.min(list.length, n));
    var q = curQ(); if (q) { var r = rec(sec, q.n, false); if (r) { addTime(r); if (view.rushLeft != null && !r.rev) r.rl = view.rushLeft; } }
    P.cur[sec] = n; save();
    $$('.tile.cur').forEach(function (t) { t.classList.remove('cur'); });
    var t = $('.tile[data-n="' + n + '"]'); if (t) { t.classList.add('cur'); try { t.scrollIntoView({ block: 'nearest' }); } catch (e) { } }
    closePanel();
    paintQuestion();
  }
  function step(dir) {
    // Next/Back follow the filtered list, so "My mistakes" or "Hard only" becomes a focused drill.
    var sec = P.sec, list = filtered(sec), cur = P.cur[sec];
    if (!list.length) return goTo(cur + dir);
    var idx = -1; for (var i = 0; i < list.length; i++) if (list[i].n === cur) { idx = i; break; }
    var nx;
    if (idx >= 0) nx = list[idx + dir];
    else nx = dir > 0 ? list.filter(function (q) { return q.n > cur; })[0] : list.filter(function (q) { return q.n < cur; }).pop();
    if (!nx) { toast(dir > 0 ? 'That’s the last question in this list.' : 'That’s the first question in this list.'); return; }
    goTo(nx.n);
  }

  /* ---------------------------------------------------------------- bottom bar & clock */
  function paintBottom() {
    var sec = P.sec, list = filtered(sec), cur = P.cur[sec], bb = $('#bb'); if (!bb) return;
    var pos = 0; list.forEach(function (q, i) { if (q.n === cur) pos = i + 1; });
    var label = P.f.st !== 'all' || P.f.sk || !(P.f.d.E && P.f.d.M && P.f.d.H) ? (pos ? pos + ' of ' + list.length + ' in list' : 'Not in this list') : 'Question ' + cur + ' of ' + qs(sec).length;
    bb.innerHTML = '<div class="bb-left"><span class="who">' + esc(P.user ? P.user.name : '') + '</span></div>' +
      '<div class="bb-center"><button class="qnav-btn" data-action="panel" aria-haspopup="dialog" aria-label="Open the question map"><span>' + label + '</span>' + I.chevUp + '</button></div>' +
      '<div class="bb-right"><button class="btn ghost" data-action="back">' + I.chevLeft + '<span>Back</span></button><button class="btn primary" data-action="next"><span>Next</span>' + I.chevRight + '</button></div>' +
      '<div class="bb-progress" aria-hidden="true"><i style="width:' + pct(doneCount(sec), qs(sec).length) + '%"></i></div>';
  }
  function startTicker() { stopTicker(); view.ticker = setInterval(tick, 250); }
  function stopTicker() { if (view.ticker) clearInterval(view.ticker); view.ticker = null; }
  function liveMs() { var q = curQ(), r = q && P.at[P.sec + ':' + q.n]; return ((r && r.ms) || 0) + (document.hidden || (r && r.rev) ? 0 : now() - view.qStart); }
  function tick() {
    if (!$('#clockBox')) return stopTicker();
    var q = curQ(); if (!q) return;
    var r = P.at[P.sec + ':' + q.n];
    if (P.mode === 'rush' && !revealed(r) && !(r && r.tout)) {
      if (view.rushLeft == null) view.rushLeft = (r && r.rl != null) ? r.rl : RUSH[P.sec][q.d] * 1000;
      var t = now(); view.rushLeft -= (t - (view.lastTick || t));      // Rush keeps counting in another tab: no looking things up
      view.lastTick = now();
      if (view.rushLeft <= 0) { view.rushLeft = 0; timeUp(); return; }
    } else view.lastTick = now();
    paintClockNumbers();
  }
  function paintClock() {
    var box = $('#clockBox'); if (!box) return;
    var q = curQ(), r = q && P.at[P.sec + ':' + q.n];
    if (P.mode === 'rush') {
      var total = RUSH[P.sec][q.d];
      box.innerHTML = revealed(r) || (r && r.tout) ? '<div class="rush-done"><span class="streak">' + I.fire + ' ' + P.streak + '</span><small>streak · best ' + P.best + '</small></div>'
        : '<div class="rush-clock"><svg viewBox="0 0 40 40" class="rc-ring"><circle cx="20" cy="20" r="17" class="rc-bg"/><circle cx="20" cy="20" r="17" class="rc-fg" id="rcFg"/></svg><b id="rcTxt">' + total + '</b></div><div class="rush-meta"><span class="streak">' + I.fire + ' ' + P.streak + '</span><small>' + total + ' s · ' + DIFF[q.d] + '</small></div>';
    } else {
      box.innerHTML = '<div class="sw"><span class="sw-q" id="swQ">0:00</span><small>this question · session <span id="swS">0:00</span></small></div>';
    }
    paintClockNumbers();
  }
  function paintClockNumbers() {
    var q = curQ(); if (!q) return;
    if (P.mode === 'rush') {
      var fg = $('#rcFg'), tx = $('#rcTxt'); if (!fg || view.rushLeft == null) return;
      var total = RUSH[P.sec][q.d] * 1000, left = Math.max(0, view.rushLeft), c = 2 * Math.PI * 17;
      fg.style.strokeDasharray = c; fg.style.strokeDashoffset = c * (1 - left / total);
      tx.textContent = Math.ceil(left / 1000);
      $('.rush-clock').classList.toggle('urgent', left < 10000);
    } else {
      var a = $('#swQ'), b = $('#swS'); if (!a) return;
      a.textContent = fmt(liveMs()); b.textContent = fmt(P.sessionMs + (document.hidden ? 0 : now() - view.qStart));
    }
  }
  document.addEventListener('visibilitychange', function () {
    var q = P && P.user && $('#stage') && curQ(); if (!q) return;
    var r = rec(P.sec, q.n, true);
    if (document.hidden) { addTime(r); if (view.rushLeft != null && !r.rev) r.rl = view.rushLeft; save(); sendSync(true); }
    else { view.qStart = now(); }
  });
  window.addEventListener('pagehide', function () { var q = P && P.user && $('#stage') && curQ(); if (q) { addTime(rec(P.sec, q.n, true)); save(); } sendSync(true); });

  /* ---------------------------------------------------------------- panel (map) */
  // The question map is a pop-up opened from the bottom bar, so the question always has the whole screen.
  function togglePanel() {
    var open = !$app.classList.contains('map-open');
    $app.classList.toggle('map-open', open);
    if (open) { paintMap(); var cur = $('.tile.cur'); if (cur) try { cur.scrollIntoView({ block: 'center' }); } catch (e) { } }
  }
  function closePanel() { $app.classList.remove('map-open'); }

  /* =================================================================== stats */
  function doneCount(sec) { var n = 0; Object.keys(P.at).forEach(function (k) { if (k.indexOf(sec + ':') === 0 && P.at[k].s) n++; }); return n; }
  function correctCount(sec) { var n = 0; Object.keys(P.at).forEach(function (k) { if (k.indexOf(sec + ':') === 0 && (P.at[k].s === 'ok' || P.at[k].s === 'okr')) n++; }); return n; }
  function stats(sec) {
    var o = { done: 0, ok: 0, okr: 0, bad: 0, to: 0, ms: 0, diff: { E: [0, 0, 0], M: [0, 0, 0], H: [0, 0, 0] }, skills: {}, rush: [0, 0], untimed: [0, 0], total: (BANK[sec] || []).length || SEC[sec].count };
    (BANK[sec] || []).forEach(function (q) {
      var r = P.at[sec + ':' + q.n], d = o.diff[q.d];
      d[2]++;
      if (!o.skills[q.sk]) o.skills[q.sk] = { dom: q.dom, done: 0, ok: 0, total: 0 };
      var sk = o.skills[q.sk]; sk.total++;
      if (!r || !r.s) return;
      o.done++; d[0]++; sk.done++; o.ms += r.ms || 0;
      var first = r.first === 'ok';            // accuracy uses the first attempt: that is what the real test rewards
      if (first) { o.ok++; d[1]++; sk.ok++; }
      if (r.s === 'okr') o.okr++; if (r.s === 'bad') o.bad++; if (r.s === 'to') o.to++;
      var bucket = r.m === 'rush' ? o.rush : o.untimed; bucket[0]++; if (first) bucket[1]++;
    });
    return o;
  }

  /* =================================================================== report */
  function screenReport() {
    stopTicker(); closeTutor(true);
    var need = ['rw', 'math'].filter(function (s) { return !BANK[s]; });
    if (need.length) {
      $app.className = 'app page'; $app.innerHTML = '<div class="boot"><div class="boot-mark"></div><p>Building your report…</p></div>';
      var left = need.length; need.forEach(function (s) { loadBank(s, function () { if (--left === 0) screenReport(); }); });
      return;
    }
    var R = stats('rw'), M = stats('math'), name = P.user ? P.user.name : '';
    var done = R.done + M.done, ok = R.ok + M.ok;
    var rep = reportSec;
    var A = rep === 'rw' ? R : M;
    $app.className = 'app page';
    $app.innerHTML = '<header class="brandbar"><a class="wordmark" href="practice.html">' + wordmark() + '</a><div class="rb-actions">' + themeBtn('theme-pill') + '<button class="btn ghost" data-action="go">' + I.chevLeft + ' Back to practice</button></div></header>' +
      '<main class="results report">' +
      '<section class="score-hero rep-hero"><div><div class="eyebrow light">' + I.chart + ' My report</div><h1>' + esc(name.split(' ')[0] || 'Your') + '’s progress</h1>' +
        '<p>' + done + ' of 355 questions done · <b>' + pct(ok, done) + '%</b> correct on the first try · ' + fmtLong(R.ms + M.ms) + ' practiced · best streak ' + P.best + '.</p>' +
        '<div class="sh-actions"><button class="btn white" data-action="share">' + I.send + ' Share card</button><button class="btn glass" data-action="go">Keep practicing</button></div></div>' +
        '<div class="rep-rings">' + ring('R&W', R) + ring('Math', M) + '</div></section>' +
      '<div class="tabs rep-tabs">' + ['rw', 'math'].map(function (s) { return '<button class="tab' + (s === rep ? ' on' : '') + '" data-action="rep-sec" data-sec="' + s + '">' + SEC[s].name + '</button>'; }).join('') + '</div>' +
      (A.done === A.total ? '<div class="callout ok">' + I.check + ' <span><b>Section complete!</b> You’ve done all ' + A.total + ' ' + SEC[rep].name + ' questions. Share your card in the channel 🎉</span></div>' : '') +
      '<div class="sec-cards">' +
        statCard('Done', A.done + '<small>/ ' + A.total + '</small>', pct(A.done, A.total)) +
        statCard('Correct (first try)', pct(A.ok, A.done) + '<small>%</small>', pct(A.ok, A.done)) +
        '<div class="sec-card meta">' +
          metaRow(I.clock, 'Time practiced', fmtLong(A.ms)) + metaRow(I.clock, 'Average per question', A.done ? Math.round(A.ms / A.done / 1000) + ' s' : '—') +
          metaRow(I.redo, 'Correct on a retry', A.okr) + metaRow(I.bolt, 'Timed out (Rush)', A.to) +
          metaRow(I.leaf, 'Untimed accuracy', A.untimed[0] ? pct(A.untimed[1], A.untimed[0]) + '% of ' + A.untimed[0] : '—') + metaRow(I.bolt, 'Rush accuracy', A.rush[0] ? pct(A.rush[1], A.rush[0]) + '% of ' + A.rush[0] : '—') +
        '</div></div>' +
      '<section class="panel"><h2>By difficulty</h2><div class="diff-bars">' + ['E', 'M', 'H'].map(function (k) {
        var d = A.diff[k]; return '<div class="dbar"><div class="dom-top"><span><i class="dd ' + k.toLowerCase() + '"></i> ' + DIFF[k] + '</span><b>' + (d[0] ? pct(d[1], d[0]) + '%' : '—') + ' <small class="muted">' + d[0] + '/' + d[2] + ' done</small></b></div><div class="dom-bar"><i class="' + lvl(d[1], d[0]) + '" style="width:' + (d[0] ? pct(d[1], d[0]) : 0) + '%"></i></div></div>';
      }).join('') + '</div></section>' +
      '<section class="panel"><div class="panel-head"><h2>Skills</h2><small class="muted">Weakest first · tap “Practice” to drill a skill</small></div><div class="skill-list">' + skillRows(A, rep) + '</div></section>' +
      '<section class="panel"><div class="panel-head"><h2>My mistakes</h2><small class="muted">Wrong or timed out · tap to open</small></div>' + mistakeRows(rep) + '</section>' +
      '<section class="panel"><div class="panel-head"><h2>Time insights</h2></div>' + timeInsights(rep) + '</section>' +
      '<footer class="foot">Accuracy counts your first attempt at each question.</footer>' +
      '</main>';
    renderMath($app);
  }
  var reportSec = 'rw';
  function ring(lbl, o) {
    var c = 2 * Math.PI * 34, p = o.done ? o.ok / o.done : 0;
    return '<div class="rring"><svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="34" class="sr-bg"/><circle cx="40" cy="40" r="34" class="sr-fg" style="stroke-dasharray:' + c + ';stroke-dashoffset:' + (c * (1 - p)) + '"/></svg><div><b>' + pct(o.ok, o.done) + '%</b><small>' + lbl + ' · ' + o.done + '/' + o.total + '</small></div></div>';
  }
  function statCard(t, big, p) { return '<div class="sec-card"><div class="sc-top"><span>' + t + '</span></div><div class="sc-score">' + big + '</div><div class="sc-bar"><i style="width:' + p + '%"></i></div></div>'; }
  function metaRow(ic, a, b) { return '<div class="meta-row"><span>' + ic + a + '</span><b>' + b + '</b></div>'; }
  function lvl(a, b) { var p = b ? a / b : 0; return p >= 0.8 ? 'hi' : p >= 0.55 ? 'mid' : 'lo'; }
  function skillRows(A, sec) {
    var rows = Object.keys(A.skills).map(function (k) { var s = A.skills[k]; return { k: k, s: s, p: s.done ? s.ok / s.done : -1 }; });
    rows.sort(function (a, b) { if ((a.p < 0) !== (b.p < 0)) return a.p < 0 ? 1 : -1; return a.p - b.p || b.s.done - a.s.done; });
    return rows.map(function (r) {
      var s = r.s;
      return '<div class="sk-row"><div class="sk-main"><div class="dom-top"><span><b>' + esc(r.k) + '</b> <small class="muted">' + esc(s.dom) + '</small></span><b>' + (s.done ? pct(s.ok, s.done) + '%' : '—') + ' <small class="muted">' + s.done + '/' + s.total + '</small></b></div>' +
        '<div class="dom-bar"><i class="' + lvl(s.ok, s.done) + '" style="width:' + (s.done ? pct(s.ok, s.done) : 0) + '%"></i></div></div>' +
        '<button class="mini-btn" data-action="drill" data-sec="' + sec + '" data-sk="' + esc(r.k) + '">Practice</button></div>';
    }).join('');
  }
  function mistakeRows(sec) {
    var list = (BANK[sec] || []).filter(function (q) { var s = status(sec, q.n); return s === 'bad' || s === 'to'; });
    if (!list.length) return '<p class="muted">No open mistakes in this section. ' + (doneCount(sec) ? 'Great job!' : 'Start practicing to see them here.') + '</p>';
    return '<div class="res-rows">' + list.map(function (q) {
      var r = P.at[sec + ':' + q.n];
      return '<button class="res-row" data-action="rep-open" data-sec="' + sec + '" data-n="' + q.n + '"><span class="rr-n bad">' + q.n + '</span><span class="rr-d">' + esc(q.sk) + ' · ' + DIFF[q.d] + '</span><span class="rr-a">' + (r.s === 'to' ? 'Timed out' : 'You: <b>' + esc(r.a || '—') + '</b> · Key: <b>' + esc(keyText(sec, q)) + '</b>') + '</span>' + I.chevRight + '</button>';
    }).join('') + '</div>' + '<div class="rep-cta"><button class="btn primary" data-action="redo-mistakes" data-sec="' + sec + '">' + I.redo + ' Redo my mistakes</button></div>';
  }
  function timeInsights(sec) {
    var rows = (BANK[sec] || []).map(function (q) { return { q: q, r: P.at[sec + ':' + q.n] }; }).filter(function (x) { return x.r && x.r.s && x.r.ms; });
    if (!rows.length) return '<p class="muted">Answer a few questions to see where your time goes.</p>';
    var slow = rows.slice().sort(function (a, b) { return b.r.ms - a.r.ms; }).slice(0, 8);
    var rushed = rows.filter(function (x) { return x.r.first !== 'ok' && x.r.ms < RUSH[sec][x.q.d] * 1000 * 0.45; }).slice(0, 8);
    function chipList(arr, fn) { return '<div class="ti-chips">' + arr.map(function (x) { return '<button class="ti-chip" data-action="rep-open" data-sec="' + sec + '" data-n="' + x.q.n + '"><b>#' + x.q.n + '</b> ' + fn(x) + '</button>'; }).join('') + '</div>'; }
    return '<div class="ti-grid"><div><h3>Slowest questions</h3>' + chipList(slow, function (x) { return fmt(x.r.ms); }) + '</div>' +
      '<div><h3>Fast but wrong <small class="muted">(maybe rushed)</small></h3>' + (rushed.length ? chipList(rushed, function (x) { return fmt(x.r.ms); }) : '<p class="muted">None, nice and careful.</p>') + '</div></div>';
  }
  function openReportQuestion(sec, n) {
    var q = qAt(sec, n), r = P.at[sec + ':' + n] || {}, key = keyOf(sec, q);
    var choices = q.t === 'mcq' ? '<div class="choices review">' + q.c.map(function (c, j) {
      var L = 'ABCD'.charAt(j), isKey = L === key, mine = L === r.a;
      return '<div class="choice-row' + (isKey ? ' key' : '') + (mine && !isKey ? ' wrong' : '') + '"><div class="choice"><span class="letter">' + L + '</span><span class="ctext">' + c + '</span>' + (isKey ? '<span class="tag ok">' + I.check + ' Correct</span>' : mine ? '<span class="tag bad">' + I.cross + ' Your answer</span>' : '') + '</div></div>';
    }).join('') + '</div>' : '<div class="spr-review"><div><small>Your answer</small><b class="' + (r.a ? (isRight(sec, q, r.a) ? 'ok' : 'bad') : 'om') + '">' + esc(r.a || '—') + '</b></div><div><small>Correct answer</small><b class="ok">' + esc(keyText(sec, q)) + '</b></div></div>';
    modal({ title: SEC[sec].short + ' · Question ' + n, cls: 'wide review-modal',
      body: '<div class="rq-meta"><span class="dtag ' + q.d.toLowerCase() + '"><i></i>' + DIFF[q.d] + '</span><span class="chip">' + esc(q.dom) + '</span><span class="chip">' + esc(q.sk) + '</span></div>' +
        (q.p ? '<div class="passage boxed">' + q.p + '</div>' : '') + '<div class="prompt">' + q.q + '</div>' + choices + '<div class="explain"><b>' + I.spark + ' Explanation</b><div>' + q.x + '</div></div>',
      actions: [{ label: 'Close', action: 'layer-close' }, { label: 'Practice this question', action: 'rep-practice', kind: 'primary' }] });
    repCursor = { sec: sec, n: n };
  }
  var repCursor = null;
  function shareCard() {
    var R = stats('rw'), M = stats('math'), name = P.user ? P.user.name : '';
    var txt = '📚 isatprep Practice — ' + name + '\n' +
      'R&W: ' + R.done + '/' + R.total + ' done · ' + pct(R.ok, R.done) + '% correct\n' +
      'Math: ' + M.done + '/' + M.total + ' done · ' + pct(M.ok, M.done) + '% correct\n' +
      '🔥 Best streak: ' + P.best + ' · ⏱ ' + fmtLong(R.ms + M.ms) + ' practiced\n' + location.origin + location.pathname;
    modal({ title: 'Share your progress', cls: 'narrow',
      body: '<div class="share-card"><div class="scard-top">' + wordmark() + '<span>Practice Mode</span></div><h3>' + esc(name) + '</h3>' +
        '<div class="scard-grid"><div><small>Reading &amp; Writing</small><b>' + pct(R.ok, R.done) + '%</b><span>' + R.done + '/' + R.total + ' done</span></div><div><small>Math</small><b>' + pct(M.ok, M.done) + '%</b><span>' + M.done + '/' + M.total + ' done</span></div></div>' +
        '<div class="scard-foot"><span>' + I.fire + ' Best streak ' + P.best + '</span><span>' + I.clock + ' ' + fmtLong(R.ms + M.ms) + '</span></div></div>' +
        '<p class="fine">' + I.info + '<span>Take a screenshot of the card, or copy the text and post it in the channel.</span></p>',
      actions: [{ label: I.send + ' Copy text', action: 'copy-share', kind: 'primary' }] });
    shareText = txt;
  }
  var shareText = '';
  function copyText(t) {
    function fallback() { var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Copied!', 'ok'); } catch (e) { toast('Couldn’t copy. Select the text manually.'); } document.body.removeChild(ta); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { toast('Copied!', 'ok'); }, fallback); else fallback();
  }
  function checkSectionComplete(sec) {
    var key = 'done:' + sec;
    if (P[key] || doneCount(sec) < qs(sec).length) return;
    P[key] = now(); save();
    modal({ title: '🎉 ' + SEC[sec].name + ' complete!', cls: 'narrow',
      body: '<p>You’ve finished all <b>' + qs(sec).length + '</b> ' + SEC[sec].name + ' questions. Open your report to see your mistakes, weakest skills and time insights.</p>',
      actions: [{ label: 'Keep going', action: 'layer-close' }, { label: I.chart + ' Open my report', action: 'report', kind: 'primary' }] });
  }

  /* =================================================================== sync to the practice sheet */
  function summary() {
    var R = stats('rw'), M = stats('math');
    function dp(k) { var a = R.diff[k][1] + M.diff[k][1], b = R.diff[k][0] + M.diff[k][0]; return b ? pct(a, b) : ''; }
    return { kind: 'practice', id: P.sync.id, deviceId: deviceId(), name: P.user ? P.user.name : '', telegram: P.user ? '@' + P.user.tg : '',
      mode: P.mode, rwDone: R.done, rwCorrect: R.ok, mathDone: M.done, mathCorrect: M.ok, accuracy: pct(R.ok + M.ok, R.done + M.done),
      easy: dp('E'), medium: dp('M'), hard: dp('H'), timedOut: R.to + M.to, bestStreak: P.best, minutes: Math.round((R.ms + M.ms) / 60000),
      avgSec: (R.done + M.done) ? Math.round((R.ms + M.ms) / (R.done + M.done) / 1000) : '', aiUsed: P.ai.total || 0,
      completed: [P['done:rw'] ? 'R&W' : '', P['done:math'] ? 'Math' : ''].filter(Boolean).join(' + '), device: isNarrow() ? 'mobile' : 'desktop' };
  }
  var syncTimer = null;
  function maybeSync() { clearTimeout(syncTimer); syncTimer = setTimeout(function () { sendSync(false); }, now() - P.sync.sent > 90000 ? 4000 : 90000); }
  function sendSync(beacon) {
    if (!P || !P.user || !P.sync.dirty || !CFG.resultsUrl || !BANK.rw && !BANK.math) return;
    var body = JSON.stringify(summary());
    P.sync.dirty = false; P.sync.sent = now(); save();
    try {
      if (beacon && navigator.sendBeacon) { navigator.sendBeacon(CFG.resultsUrl, new Blob([body], { type: 'text/plain;charset=utf-8' })); return; }
      fetch(CFG.resultsUrl, { method: 'POST', mode: 'no-cors', body: body, headers: { 'Content-Type': 'text/plain;charset=utf-8' } }).catch(function () { P.sync.dirty = true; save(); });
    } catch (e) { P.sync.dirty = true; save(); }
  }

  /* =================================================================== AI tutor */
  var tutorOpen = false, tutorBusy = false, chats = {};
  function chatKey() { return P.sec + ':' + P.cur[P.sec]; }
  function openTutor() {
    var el = $('#tutor'); if (!el) return;
    tutorOpen = true; el.hidden = false; $app.classList.add('tutor-open');
    $$('[data-action="tutor"].tool').forEach(function (b) { b.setAttribute('aria-pressed', 'true'); });
    el.innerHTML = '<div class="tu-head"><b>' + I.bot + ' AI tutor</b><span class="tu-left" id="tuLeft"></span><button class="icon-btn" data-action="tutor-close" aria-label="Close tutor">' + I.close + '</button></div>' +
      '<div class="tu-ctx" id="tuCtx"></div><div class="tu-log" id="tuLog"></div>' +
      '<form class="tu-form" id="tuForm"><textarea id="tuIn" rows="2" maxlength="500" placeholder="Ask about this question…"></textarea><button class="btn primary" type="submit" aria-label="Send">' + I.send + '</button></form>' +
      '<p class="tu-fine">Answers come from Google’s Gemini and can be wrong. Messages are processed by Google.</p>';
    $('#tuForm').addEventListener('submit', function (e) { e.preventDefault(); askTutor($('#tuIn').value); });
    $('#tuIn').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askTutor($('#tuIn').value); } });
    paintTutorHead(); paintLog();
    if (D.calc) setTimeout(function () { try { D.calc.resize(); } catch (e) { } }, 60);
  }
  function closeTutor(silent) {
    tutorOpen = false; var el = $('#tutor'); if (el) { el.hidden = true; el.innerHTML = ''; }
    $app.classList.remove('tutor-open');
    $$('[data-action="tutor"].tool').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
  }
  function aiLeft() { if (P.ai.day !== today()) { P.ai.day = today(); P.ai.used = 0; } return Math.max(0, AI_DAILY - P.ai.used); }
  function paintTutorHead() {
    var q = curQ(), r = P.at[chatKey()], ctx = $('#tuCtx'), left = $('#tuLeft'); if (!ctx) return;
    left.textContent = aiLeft() + ' / ' + AI_DAILY + ' left today';
    ctx.innerHTML = '<span>' + SEC[P.sec].short + ' · Question ' + q.n + ' · ' + DIFF[q.d] + '</span>' + (revealed(r) ? '<em>Full explanations on</em>' : '<em>Hints only until you check your answer</em>');
    paintLog();
    var chips = $('#tuChips'); if (chips) chips.remove();
    if (!(chats[chatKey()] || []).length) {
      var sugg = revealed(r) ? ['Why is my answer wrong?', 'Explain it step by step', 'Give me a similar question'] : ['Give me a hint', 'What is this question testing?', 'How should I start?'];
      $('#tuLog').insertAdjacentHTML('beforeend', '<div class="tu-chips" id="tuChips">' + sugg.map(function (s) { return '<button class="ti-chip" data-action="tutor-sugg">' + esc(s) + '</button>'; }).join('') + '</div>');
    }
  }
  function md(t) {
    var h = esc(t);
    h = h.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
    var lines = h.split(/\n/), out = [], inList = false;
    lines.forEach(function (l) {
      var m = l.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)$/);
      if (m) { if (!inList) { out.push('<ul>'); inList = true; } out.push('<li>' + m[1] + '</li>'); return; }
      if (inList) { out.push('</ul>'); inList = false; }
      if (l.trim()) out.push('<p>' + l + '</p>');
    });
    if (inList) out.push('</ul>');
    return out.join('');
  }
  function paintLog() {
    var log = $('#tuLog'); if (!log) return;
    var msgs = chats[chatKey()] || [];
    log.innerHTML = msgs.map(function (m) { return '<div class="tu-msg ' + m.role + (m.err ? ' err' : '') + '">' + (m.role === 'user' ? '<p>' + esc(m.text) + '</p>' : md(m.text)) + '</div>'; }).join('') +
      (tutorBusy ? '<div class="tu-msg model typing"><i></i><i></i><i></i></div>' : '');
    renderMath(log, true);
    log.scrollTop = log.scrollHeight;
  }
  function plain(html) {
    var d = document.createElement('div');
    d.innerHTML = html.replace(/<svg[\s\S]*?<\/svg>/g, ' [figure] ').replace(/<\/(p|div|li|tr)>/g, '\n').replace(/<td>|<th>/g, ' | ');
    return d.textContent.replace(/\\\(|\\\)/g, '$').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, 4000);
  }
  function askTutor(text) {
    text = String(text || '').trim(); if (!text || tutorBusy) return;
    if (!CFG.resultsUrl) { toast('The AI tutor isn’t connected yet.'); return; }
    if (aiLeft() <= 0) { toast('You’ve used all ' + AI_DAILY + ' AI messages for today. They reset tomorrow.', 'warn', 5000); return; }
    var k = chatKey(), q = curQ(), r = P.at[k] || {}, sec = P.sec;
    chats[k] = chats[k] || [];
    var history = chats[k].filter(function (m) { return !m.err; }).slice(-6).map(function (m) { return { role: m.role, text: m.text }; });
    chats[k].push({ role: 'user', text: text });
    var inp = $('#tuIn'); if (inp) inp.value = '';
    tutorBusy = true; paintLog(); var chips = $('#tuChips'); if (chips) chips.remove();
    var payload = { action: 'tutor', deviceId: deviceId(), name: P.user ? P.user.name : '', telegram: P.user ? P.user.tg : '', message: text.slice(0, 500), history: history,
      question: { section: SEC[sec].name, skill: q.sk, difficulty: DIFF[q.d], passage: plain(q.p || ''), prompt: plain(q.q),
        choices: q.t === 'mcq' ? q.c.map(function (c, i) { return 'ABCD'.charAt(i) + ') ' + plain(c); }) : [], type: q.t === 'mcq' ? 'multiple choice' : 'student-produced response',
        correctAnswer: keyText(sec, q), explanation: plain(q.x), studentAnswer: r.a || view.pendingAnswer || '', checked: revealed(r) } };
    var ctrl = window.AbortController ? new AbortController() : null, to = setTimeout(function () { if (ctrl) ctrl.abort(); }, 45000);
    fetch(CFG.resultsUrl, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow', signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) { return res.text(); })
      .then(function (t) {
        clearTimeout(to); tutorBusy = false;
        var j = null; try { j = JSON.parse(t); } catch (e) { }
        if (j && j.ok && j.reply) {
          chats[k].push({ role: 'model', text: j.reply });
          P.ai.used = AI_DAILY - (j.left != null ? j.left : aiLeft() - 1); P.ai.total = (P.ai.total || 0) + 1; P.sync.dirty = true; save();
        } else {
          var why = j && j.error;
          var msg = why === 'limit' ? 'You’ve used all ' + AI_DAILY + ' AI messages for today. They reset tomorrow.' : why === 'rate' ? 'That was quick! Wait a minute before your next message (2 per minute).' : why === 'nokey' ? 'The AI tutor isn’t switched on yet. Please tell the admin.' : 'The tutor couldn’t answer right now. Please try again in a moment.';
          if (why === 'limit') { P.ai.used = AI_DAILY; save(); }
          chats[k].pop(); chats[k].push({ role: 'user', text: text }); chats[k].push({ role: 'model', text: msg, err: true });
        }
        paintLog(); paintTutorHead();
      })
      .catch(function () { clearTimeout(to); tutorBusy = false; chats[k].push({ role: 'model', text: 'Couldn’t reach the tutor. Check your connection and try again.', err: true }); paintLog(); });
  }


  /* =================================================================== highlighting (like Bluebook)
     Select text in the passage or the question → "Highlight". Tap a highlight → "Remove".
     Saved per question as character ranges of the rendered text, so they come back after a reload. */
  var HL_AREAS = { p: '.passage-pane .passage', q: '#qPane .prompt' };
  function hlRanges(key) { var q = curQ(), r = q && P.at[P.sec + ':' + q.n]; return (r && r.hl && r.hl[key]) || []; }
  function hlTextNodes(root) {
    var out = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) out.push(n);
    return out;
  }
  function inMath(node) { var e = node.parentNode; while (e && e !== document) { if (e.classList && (e.classList.contains('katex') || e.tagName === 'svg')) return true; e = e.parentNode; } return false; }
  function offsetIn(root, container, off) {
    var rg = document.createRange(); rg.setStart(root, 0);
    try { rg.setEnd(container, off); } catch (e) { return -1; }
    return rg.toString().length;
  }
  function paintHl(key) {
    var root = $(HL_AREAS[key]); if (!root) return;
    $$('mark.hl', root).forEach(function (m) { var t = document.createTextNode(m.textContent); m.parentNode.replaceChild(t, m); });
    root.normalize();
    hlRanges(key).forEach(function (rg, idx) {
      var s0 = rg[0], e0 = rg[1], pos = 0;
      hlTextNodes(root).forEach(function (node) {
        var len = node.nodeValue.length, a = pos, b = pos + len; pos = b;
        if (b <= s0 || a >= e0 || inMath(node)) return;
        var from = Math.max(0, s0 - a), to = Math.min(len, e0 - a);
        if (to <= from || !node.nodeValue.slice(from, to).trim()) return;
        var mid = node; if (from > 0) mid = node.splitText(from);
        if (to - from < mid.nodeValue.length) mid.splitText(to - from);
        var mk = document.createElement('mark'); mk.className = 'hl'; mk.setAttribute('data-k', key); mk.setAttribute('data-i', idx);
        mid.parentNode.replaceChild(mk, mid); mk.appendChild(mid);
      });
    });
  }
  function paintAllHl() { Object.keys(HL_AREAS).forEach(paintHl); }
  function addHl(key, s0, e0) {
    var q = curQ(), r = rec(P.sec, q.n, true);
    r.hl = r.hl || {}; var list = (r.hl[key] || []).concat([[s0, e0]]).sort(function (x, y) { return x[0] - y[0]; });
    var merged = [];
    list.forEach(function (x) { var last = merged[merged.length - 1]; if (last && x[0] <= last[1]) last[1] = Math.max(last[1], x[1]); else merged.push([x[0], x[1]]); });
    r.hl[key] = merged; save(); paintHl(key);
  }
  function removeHl(key, idx) {
    var q = curQ(), r = rec(P.sec, q.n, true); if (!r.hl || !r.hl[key]) return;
    r.hl[key].splice(idx, 1); save(); paintHl(key);
  }
  var hlBar = null;
  function hideHlBar() { if (hlBar) { hlBar.remove(); hlBar = null; } }
  function showHlBar(rect, html) {
    hideHlBar();
    hlBar = document.createElement('div'); hlBar.className = 'hl-bar'; hlBar.innerHTML = html;
    hlBar.addEventListener('mousedown', function (e) { e.preventDefault(); });   // keep the text selection while tapping the button
    document.body.appendChild(hlBar);
    var w = hlBar.offsetWidth, h = hlBar.offsetHeight;
    var x = Math.max(8, Math.min(window.innerWidth - w - 8, rect.left + rect.width / 2 - w / 2));
    var y = rect.top - h - 10; if (y < 8) y = rect.bottom + 10;
    hlBar.style.left = x + 'px'; hlBar.style.top = y + 'px';
  }
  var pendingHl = null;
  function checkSelection() {
    var sel = window.getSelection && window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) { if (hlBar && hlBar.getAttribute('data-kind') === 'add') hideHlBar(); return; }
    var rg = sel.getRangeAt(0), key = null, root = null;
    Object.keys(HL_AREAS).forEach(function (k) { var el = $(HL_AREAS[k]); if (el && el.contains(rg.commonAncestorContainer)) { key = k; root = el; } });
    if (!key || !rg.toString().trim()) return;
    var s0 = offsetIn(root, rg.startContainer, rg.startOffset), e0 = offsetIn(root, rg.endContainer, rg.endOffset);
    if (s0 < 0 || e0 <= s0) return;
    pendingHl = { key: key, s: s0, e: e0 };
    showHlBar(rg.getBoundingClientRect(), '<button data-action="hl-add">' + I.marker + ' Highlight</button>');
    hlBar.setAttribute('data-kind', 'add');
  }
  var selTimer = null;
  document.addEventListener('selectionchange', function () { if (!$('#stage')) return; clearTimeout(selTimer); selTimer = setTimeout(checkSelection, 350); });
  document.addEventListener('mouseup', function () { if ($('#stage')) setTimeout(checkSelection, 10); });
  document.addEventListener('scroll', hideHlBar, true);

  /* =================================================================== reference + Desmos (same as the mock) */
  function openReference() {
    var f = function (tex) { return '<div class="rf-f">\\(' + tex + '\\)</div>'; };
    var shapes = [['Circle', f('A = \\pi r^2') + f('C = 2\\pi r')], ['Rectangle', f('A = \\ell w')], ['Triangle', f('A = \\tfrac{1}{2}bh')], ['Pythagorean theorem', f('c^2 = a^2 + b^2')],
      ['Special right triangles', '<div class="rf-t">\\(30^\\circ\\)–\\(60^\\circ\\)–\\(90^\\circ\\): sides \\(x,\\ x\\sqrt{3},\\ 2x\\)</div><div class="rf-t">\\(45^\\circ\\)–\\(45^\\circ\\)–\\(90^\\circ\\): sides \\(s,\\ s,\\ s\\sqrt{2}\\)</div>'],
      ['Rectangular box', f('V = \\ell wh')], ['Cylinder', f('V = \\pi r^2 h')], ['Sphere', f('V = \\tfrac{4}{3}\\pi r^3')], ['Cone', f('V = \\tfrac{1}{3}\\pi r^2 h')], ['Pyramid', f('V = \\tfrac{1}{3}\\ell wh')]];
    modal({ title: 'Reference Sheet', cls: 'wide', body: '<div class="ref-grid">' + shapes.map(function (s) { return '<div class="ref-card"><b>' + s[0] + '</b>' + s[1] + '</div>'; }).join('') + '</div>' +
      '<ul class="ref-facts"><li>The number of degrees of arc in a circle is 360.</li><li>The number of radians of arc in a circle is \\(2\\pi\\).</li><li>The sum of the measures in degrees of the angles of a triangle is 180.</li></ul>',
      actions: [{ label: 'Close', action: 'layer-close', kind: 'primary' }] });
  }
  var D = { state: 'idle', calc: null, el: null, waiters: [] };
  function loadDesmos(cb) {
    if (D.state === 'ready') return cb(true); if (D.state === 'failed') return cb(false);
    D.waiters.push(cb); if (D.state === 'loading') return; D.state = 'loading';
    var s = document.createElement('script'), t = setTimeout(fail, 45000);
    function fail() { if (D.state !== 'loading') return; D.state = 'failed'; flush(false); }
    function flush(ok) { var w = D.waiters; D.waiters = []; w.forEach(function (f) { try { f(ok); } catch (e) { } }); }
    s.src = 'https://www.desmos.com/api/v1.11/calculator.js?apiKey=' + encodeURIComponent(CFG.desmosKey || ''); s.async = true;
    s.onload = function () { clearTimeout(t); try { D.el = document.createElement('div'); D.el.className = 'desmos-host'; D.calc = window.Desmos.GraphingCalculator(D.el, { keypad: true, expressions: true, settingsMenu: true, zoomButtons: true, expressionsTopbar: true, border: false, links: false, pasteGraphLink: false, images: false, folders: false, notes: false }); D.state = 'ready'; flush(true); } catch (e) { D.state = 'failed'; flush(false); } };
    s.onerror = function () { clearTimeout(t); fail(); };
    document.head.appendChild(s);
  }
  function mountDesmos() {
    var body = $('#calcBody'); if (!body || !P.ui.calcOpen) return;
    if (D.state === 'ready') { body.innerHTML = ''; body.appendChild(D.el); setTimeout(function () { try { D.calc.resize(); } catch (e) { } }, 30); return; }
    body.innerHTML = '<div class="calc-loading"><span class="spin dark"></span> Loading calculator…</div>';
    loadDesmos(function (ok) { var b = $('#calcBody'); if (!b) return; if (ok) { b.innerHTML = ''; b.appendChild(D.el); try { D.calc.resize(); } catch (e) { } } else b.innerHTML = '<div class="calc-fail"><p>The calculator couldn’t load.</p><a class="btn ghost" href="https://www.desmos.com/calculator" target="_blank" rel="noopener">Open Desmos in a new tab</a></div>'; });
  }
  function toggleCalc() {
    P.ui.calcOpen = !P.ui.calcOpen; save(); $app.classList.toggle('calc-open', P.ui.calcOpen);
    var b = $('[data-action="calc"].tool'); if (b) b.setAttribute('aria-pressed', P.ui.calcOpen);
    if (P.ui.calcOpen) mountDesmos();
    setTimeout(function () { if (D.calc) try { D.calc.resize(); } catch (e) { } }, 60);
  }
  function setupCalcResize() {
    var h = $('#calcResize'), dock = $('#calcDock'); if (!h || !dock) return;
    if (P.ui.calcW) dock.style.width = P.ui.calcW + 'px';
    var x0 = 0, w0 = 0, drag = false;
    h.addEventListener('pointerdown', function (e) { drag = true; x0 = e.clientX; w0 = dock.getBoundingClientRect().width; try { h.setPointerCapture(e.pointerId); } catch (x) { } e.preventDefault(); });
    h.addEventListener('pointermove', function (e) { if (!drag) return; var w = Math.max(300, Math.min(window.innerWidth * 0.6, w0 + e.clientX - x0)); dock.style.width = w + 'px'; P.ui.calcW = Math.round(w); if (D.calc) try { D.calc.resize(); } catch (x) { } });
    function end() { if (drag) { drag = false; save(); } } h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
  }

  /* =================================================================== events */
  document.addEventListener('click', function (e) {
    if ($app.classList.contains('map-open') && !e.target.closest('#qmap') && !e.target.closest('[data-action="panel"]')) { closePanel(); if (!e.target.closest('[data-action]')) return; }   // click outside closes the map
    var mk = e.target.closest && e.target.closest('mark.hl');
    if (mk && (!window.getSelection() || window.getSelection().isCollapsed)) {
      showHlBar(mk.getBoundingClientRect(), '<button data-action="hl-del" data-k="' + mk.getAttribute('data-k') + '" data-i="' + mk.getAttribute('data-i') + '">' + I.close + ' Remove highlight</button>');
      return;
    }
    if (hlBar && !e.target.closest('.hl-bar')) hideHlBar();
    var t = e.target.closest('[data-action]'); if (!t) return;
    var a = t.getAttribute('data-action');
    switch (a) {
      case 'layer-close': closeLayer(); break;
      case 'hl-add': if (pendingHl) { addHl(pendingHl.key, pendingHl.s, pendingHl.e); pendingHl = null; try { window.getSelection().removeAllRanges(); } catch (x) { } } hideHlBar(); break;
      case 'hl-del': removeHl(t.getAttribute('data-k'), +t.getAttribute('data-i')); hideHlBar(); break;
      case 'hl-help': toast('Select any words in the passage or the question, then tap “Highlight”. Tap a highlight to remove it.', 'info', 5000); break;
      case 'theme': toggleTheme(); break;
      case 'go': closeLayer(); if (!P.user) return screenWelcome(); startPractice(); break;
      case 'home': e.preventDefault(); goHome(); break;
      case 'switch-user': e.preventDefault(); modal({ title: 'Switch student?', cls: 'narrow', body: '<p>This clears <b>' + esc(P.user.name) + '</b>’s progress from this device so someone else can start. Progress already sent to the sheet stays there.</p>', actions: [{ label: 'Cancel', action: 'layer-close' }, { label: 'Clear and switch', action: 'switch-confirm', kind: 'primary' }] }); break;
      case 'switch-confirm': Store.del(KEY); P = fresh(); closeLayer(); screenWelcome(); break;
      case 'report': closeLayer(); reportSec = P.sec; screenReport(); break;
      case 'rep-sec': reportSec = t.getAttribute('data-sec'); screenReport(); break;
      case 'rep-open': openReportQuestion(t.getAttribute('data-sec'), +t.getAttribute('data-n')); break;
      case 'rep-practice': closeLayer(); P.sec = repCursor.sec; P.cur[P.sec] = repCursor.n; P.f = { d: { E: 1, M: 1, H: 1 }, st: 'all', sk: '' }; save(); startPractice(); break;
      case 'drill': P.sec = t.getAttribute('data-sec'); P.f = { d: { E: 1, M: 1, H: 1 }, st: 'all', sk: t.getAttribute('data-sk') }; firstInList(); save(); startPractice(); break;
      case 'redo-mistakes': P.sec = t.getAttribute('data-sec'); P.f = { d: { E: 1, M: 1, H: 1 }, st: 'wrong', sk: '' }; firstInList(); save(); startPractice(); break;
      case 'share': shareCard(); break;
      case 'copy-share': copyText(shareText); break;
      case 'sec': switchSec(t.getAttribute('data-sec')); break;
      case 'mode': switchMode(); break;
      case 'mode-set': closeLayer(); setMode(t.getAttribute('data-mode')); break;
      case 'panel': togglePanel(); break;
      case 'goto': goTo(+t.getAttribute('data-n')); break;
      case 'fd': var k = t.getAttribute('data-d'); P.f.d[k] = P.f.d[k] ? 0 : 1; if (!P.f.d.E && !P.f.d.M && !P.f.d.H) P.f.d[k] = 1; save(); paintMap(); paintBottom(); break;
      case 'ftoggle': showFilters = !showFilters; paintMap(); break;
      case 'fclear': P.f = { d: { E: 1, M: 1, H: 1 }, st: 'all', sk: '' }; save(); paintMap(); paintBottom(); break;
      case 'choose': choose(t.getAttribute('data-letter')); break;
      case 'strike': strike(t.getAttribute('data-letter')); break;
      case 'abc': P.ui.abc = !P.ui.abc; save(); t.classList.toggle('on', P.ui.abc); t.innerHTML = abcIcon(P.ui.abc); paintAnswer(); renderMath($('#answerArea')); break;
      case 'mark': var r = rec(P.sec, curQ().n, true); r.mk = !r.mk; save(); t.classList.toggle('on', r.mk); t.innerHTML = (r.mk ? I.bookmarkOn : I.bookmark) + '<span>Mark for Review</span>'; paintMap(); break;
      case 'spr-key': insertSprKey(t.getAttribute('data-key')); break;
      case 'check': check(); break;
      case 'reveal': reveal(); break;
      case 'retry': retry(); break;
      case 'show-x': showExplanation(); break;
      case 'next': step(1); break;
      case 'back': step(-1); break;
      case 'calc': toggleCalc(); break;
      case 'reference': openReference(); break;
      case 'tutor': if (tutorOpen) closeTutor(); else openTutor(); break;
      case 'tutor-close': closeTutor(); break;
      case 'tutor-ask': if (!tutorOpen) openTutor(); break;
      case 'tutor-sugg': askTutor(t.textContent); break;
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if ($layer.classList.contains('open')) closeLayer(); else if ($app.classList.contains('map-open')) closePanel(); }
    if (!$('#stage') || $layer.classList.contains('open')) return;
    var tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1);
    else if (/^[a-dA-D]$/.test(e.key) && curQ().t === 'mcq') choose(e.key.toUpperCase());
    else if (e.key === 'Enter' && $('#checkBtn') && !$('#checkBtn').disabled) check();
  });
  function firstInList() { var list = BANK[P.sec] ? filtered(P.sec) : []; if (list.length && !list.some(function (q) { return q.n === P.cur[P.sec]; })) P.cur[P.sec] = list[0].n; }
  function goHome() { var q = $('#stage') && curQ(); if (q) { addTime(rec(P.sec, q.n, true)); save(); } closeTutor(true); sendSync(false); screenWelcome(); }
  function switchSec(s) {
    if (s === P.sec) return;
    var q = curQ(); if (q) { var r = rec(P.sec, q.n, false); if (r) { addTime(r); if (view.rushLeft != null && !r.rev) r.rl = view.rushLeft; } }
    P.sec = s; P.f.sk = ''; save(); closeTutor(true); startPractice();
  }
  function switchMode() {
    modal({ title: 'Practice mode', cls: 'narrow', body: '<div class="mode-pick col">' + modeCard('untimed', I.leaf, 'Untimed practice', 'No limits. A stopwatch shows how long each question takes.') + modeCard('rush', I.bolt, 'Rush mode', 'R&W: 50 / 70 / 90 s · Math: 70 / 95 / 120 s for Easy / Medium / Hard.') + '</div>' });
    $$('.modal .mode-card').forEach(function (b) { b.setAttribute('data-action', 'mode-set'); b.classList.toggle('on', b.getAttribute('data-mode') === P.mode); });
  }
  function setMode(m) {
    if (m === P.mode) return;
    var q = curQ(); if (q) { var r = rec(P.sec, q.n, false); if (r) { addTime(r); r.rl = null; } }
    P.mode = m; P.sync.dirty = true; save(); screenPractice();
    toast(m === 'rush' ? 'Rush mode on. Beat the clock!' : 'Untimed practice. Take your time.', 'ok');
  }


  /* =================================================================== boot */
  applyTheme();
  P = load();
  if (P.user) screenWelcome(); else screenWelcome();
})();
