/* isatprep · Daily SAT Mock — application
   One page, no framework. State lives in one object that is saved to localStorage after every change,
   so a refresh, a closed tab, or a dead battery never loses answers. Timers use absolute end times. */
(function () {
  'use strict';
  var APP_BUILD = '600753b009'; // stamped by build/build.py — must match SATCore.BUILD in core.js
  var C = window.SATCore;
  var CFG = window.SAT_CONFIG || {};

  // Version handshake: if a browser cache ever pairs an old file with a new one, reload once with fresh files.
  // The stylesheet carries the same build id (--build); an old cached stylesheet has none or a different one.
  var cssBuild = null; try { cssBuild = getComputedStyle(document.documentElement).getPropertyValue('--build').replace(/["'\s]/g, ''); } catch (e) { }
  if (!C || C.BUILD !== APP_BUILD || typeof C.prepareTest !== 'function' || (cssBuild !== null && cssBuild !== APP_BUILD)) {
    var flag = 'isatprep:reloaded';
    var tried = false; try { tried = window.sessionStorage.getItem(flag) === '1'; window.sessionStorage.setItem(flag, '1'); } catch (e) { }
    if (!tried) {
      var sep = window.location.search ? '&' : '?';
      window.location.replace(window.location.pathname + window.location.search.replace(/[?&]_r=\d+/, '') + sep + '_r=' + Date.now() + window.location.hash);
    } else {
      document.getElementById('app').innerHTML = '<div class="boot"><p>A newer version of this page is available.</p><button class="btn primary" onclick="location.reload()">Refresh</button></div>';
    }
    return;
  }
  try { window.sessionStorage.removeItem('isatprep:reloaded'); } catch (e) { }
  try { if (/[?&]_r=\d+/.test(window.location.search)) history.replaceState(null, '', window.location.pathname + window.location.search.replace(/([?&])_r=\d+&?/, '$1').replace(/[?&]$/, '') + window.location.hash); } catch (e) { }
  var $app = document.getElementById('app');
  var $layer = document.getElementById('layer');
  var $toasts = document.getElementById('toasts');

  /* =================================================================== utilities */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function now() { return Date.now(); }
  function uid(n) { var a = 'abcdefghijkmnpqrstuvwxyz23456789', s = ''; for (var i = 0; i < (n || 12); i++) s += a.charAt(Math.floor(Math.random() * a.length)); return s; }
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  // Full screen is enforced on laptops/desktops only (phones and Telegram's in-app browser can't do it).
  var FS_OK = (function () {
    var d = document.documentElement;
    var coarse = false; try { coarse = window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches; } catch (e) { }
    return !!(d.requestFullscreen || d.webkitRequestFullscreen) && !coarse;
  })();
  function isFullscreen() {
    if (document.fullscreenElement || document.webkitFullscreenElement) return true;
    // F11 / the green macOS button make the window fill the screen without the Fullscreen API.
    return Math.abs(window.innerWidth - screen.width) <= 2 && Math.abs(window.innerHeight - screen.height) <= 2;
  }
  function enterFullscreen() {
    if (!FS_OK || isFullscreen()) return;
    var d = document.documentElement;
    try { var p = (d.requestFullscreen || d.webkitRequestFullscreen).call(d); if (p && p.catch) p.catch(function () { }); } catch (e) { }
  }
  function isNarrow() { return window.matchMedia('(max-width: 899px)').matches; }
  function renderMath(el) {
    if (!el || !window.renderMathInElement) return;
    try {
      window.renderMathInElement(el, {
        delimiters: [{ left: '\\(', right: '\\)', display: false }, { left: '\\[', right: '\\]', display: true }],
        throwOnError: false, ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'input']
      });
    } catch (e) { /* math stays as text; never block the test */ }
  }
  function fmtDateTime(iso) {
    try {
      return new Intl.DateTimeFormat('en-GB', { timeZone: CFG.timeZone || undefined, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
    } catch (e) { return new Date(iso).toLocaleString(); }
  }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  /* =================================================================== storage (never throws) */
  var Store = (function () {
    var ok = false, mem = {};
    try { var k = '__isat_probe__'; window.localStorage.setItem(k, '1'); window.localStorage.removeItem(k); ok = true; } catch (e) { ok = false; }
    return {
      ok: ok,
      get: function (k) { try { return ok ? window.localStorage.getItem(k) : (k in mem ? mem[k] : null); } catch (e) { return k in mem ? mem[k] : null; } },
      set: function (k, v) { mem[k] = v; if (!ok) return; try { window.localStorage.setItem(k, v); } catch (e) { /* quota: keep in memory */ } },
      del: function (k) { delete mem[k]; try { if (ok) window.localStorage.removeItem(k); } catch (e) { } }
    };
  })();
  function deviceId() {
    var id = Store.get('isatprep:device');
    if (!id) { id = 'd-' + uid(14); Store.set('isatprep:device', id); }
    return id;
  }

  /* =================================================================== icons */
  var I = {
    bookmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4.2-6.5 4.2v-16a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    bookmarkOn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4.2-6.5 4.2v-16a1 1 0 0 1 1-1z" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    calc: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="2.5" width="15" height="19" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="7.5" y="5.5" width="9" height="4" rx="1" fill="currentColor"/><circle cx="8.5" cy="13" r="1.2" fill="currentColor"/><circle cx="12" cy="13" r="1.2" fill="currentColor"/><circle cx="15.5" cy="13" r="1.2" fill="currentColor"/><circle cx="8.5" cy="17" r="1.2" fill="currentColor"/><circle cx="12" cy="17" r="1.2" fill="currentColor"/><circle cx="15.5" cy="17" r="1.2" fill="currentColor"/></svg>',
    ref: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.5h10l4 4v13H5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 11h8M8 14.5h8M8 18h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M14.5 3.5v4.5h4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    chevDown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevUp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevLeft: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevRight: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    cross: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" fill="currentColor"/><circle cx="12" cy="10" r="2.6" fill="#fff"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="1.9"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 11v6M12 7.5v.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" fill="none" stroke="currentColor" stroke-width="1.9"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 9.5a4.5 4.5 0 0 0 0 9z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3.5L10.5 13.5M21 3.5l-6.5 17-4-7-7-4z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    coffee: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 9h12v5.5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M16.5 10.5h1.5a2.5 2.5 0 0 1 0 5h-1.6M8 3.5c0 1.5 1.5 1.5 1.5 3M12 3.5c0 1.5 1.5 1.5 1.5 3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    sigma: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 5H6.5l6 7-6 7h11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" fill="currentColor"/></svg>',
    shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M8.5 12l2.5 2.5 4.5-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    route: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="18" r="2.5" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="18" cy="6" r="2.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M8.5 18h6a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7H15.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    laptop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="5" width="15" height="10.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M2.5 19h19" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>'
  };
  function abcIcon(on) {
    return '<span class="abc-ico' + (on ? ' on' : '') + '" aria-hidden="true">ABC<i></i></span>';
  }

  /* =================================================================== app state */
  var params; try { params = new URLSearchParams(window.location.search); } catch (e) { params = { get: function () { return null; } }; }
  var TEST_ID = (params.get('t') || '').trim();
  var PREVIEW = params.get('preview') === '1';
  var T = null;          // the test (content)
  var S = null;          // the student's state (persisted)
  var busy = false;      // guards stage transitions
  var lastShownClock = '';

  function stateKey() { return 'isatprep:attempt:' + T.id; }
  function save() { if (PREVIEW || !S) return; S.savedAt = now(); Store.set(stateKey(), JSON.stringify(S)); }
  function loadState() {
    if (PREVIEW) return null;
    var raw = Store.get(stateKey());
    if (!raw) return null;
    try {
      var s = JSON.parse(raw);
      if (!s || s.v !== 1 || s.testId !== T.id || !s.mods) return null;
      if (!s.integrity) s.integrity = { fsExits: 0, saveExits: 0 };
      return s;
    } catch (e) { return null; }
  }
  function freshState() {
    return { v: 1, testId: T.id, deviceId: deviceId(), student: null, status: 'welcome', stage: null, mods: {}, routes: {},
      breakEndsAt: null, startedAt: null, finishedAt: null, result: null, submission: null, ui: { timerHidden: false },
      gate: null, integrity: { fsExits: 0, saveExits: 0 } };
  }

  function routeFor(stage) { return stage === 'rw2' ? S.routes.rw : stage === 'm2' ? S.routes.math : null; }
  function modKey(stage) { return C.moduleKey(stage, routeFor(stage)); }
  function questionsFor(stage) { return T.modules[modKey(stage)] || []; }
  function curMod() { return S.mods[S.stage]; }
  function curQs() { return questionsFor(S.stage); }
  function nextStage(st) { var i = C.STAGES.indexOf(st); return i >= 0 && i < C.STAGES.length - 1 ? C.STAGES[i + 1] : null; }

  /* =================================================================== windows (open/close) */
  function windowStatus() {
    var t = now();
    if (PREVIEW) return 'open';
    if (T.opensAt && t < new Date(T.opensAt).getTime()) return 'notOpen';
    if (T.closesAt && t >= new Date(T.closesAt).getTime()) return 'closed';
    return 'open';
  }
  function answersUnlocked() {
    if (PREVIEW) return true;
    if (T.revealAnswers === 'afterSubmit' || !T.closesAt) return true;
    return now() >= new Date(T.closesAt).getTime();
  }

  /* =================================================================== boot */
  function boot() {
    if (!TEST_ID) return screenMessage('noTest');
    if (!/^[A-Za-z0-9_-]{3,64}$/.test(TEST_ID)) return screenMessage('notFound');
    loadTest(TEST_ID, function (err, test) {
      if (err || !test) return screenMessage('notFound');
      T = test;
      try { C.prepareTest(T); } catch (e) { console.error('Could not decode test file', e); return screenMessage('broken', ['decode']); }
      var problems = C.validateTest(T);
      if (problems.length) { console.error('Test file problems:', problems); return screenMessage('broken', problems); }
      document.title = (CFG.brand || 'isatprep') + ' · ' + T.title;
      S = loadState() || freshState();
      if (!S.ui) S.ui = { timerHidden: false };
      route();
      if (S.status === 'testing') {
        reconcileOnLoad();
        try { history.pushState({ isat: 1 }, ''); } catch (e) { }
        if (S.savedAt) toast('Welcome back — your answers were saved.', 'ok', 3500);
      }
      // Preview-only test hook (admins/QA): lets you fast-forward a timer. Never present for students.
      if (PREVIEW) window.__isatPreview = { expireIn: function (ms) { if (S.stage === 'break') S.breakEndsAt = now() + (ms || 2000); else if (S.stage && S.mods[S.stage]) S.mods[S.stage].endsAt = now() + (ms || 2000); }, state: function () { return S; } };
      setInterval(tick, 250);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
      window.addEventListener('online', function () { trySubmit(); });
      if (S.status === 'done') setTimeout(trySubmit, 600);
    });
  }

  function loadTest(id, cb) {
    window.SAT_TESTS = window.SAT_TESTS || {};
    if (window.SAT_TESTS[id]) return cb(null, window.SAT_TESTS[id]);
    var s = document.createElement('script');
    var done = false;
    var timer = setTimeout(function () { if (!done) { done = true; cb(new Error('timeout')); } }, 20000);
    s.src = 'tests/' + encodeURIComponent(id) + '.js?v=' + Math.floor(now() / 600000);
    s.onload = function () { if (done) return; done = true; clearTimeout(timer); cb(window.SAT_TESTS[id] ? null : new Error('missing'), window.SAT_TESTS[id]); };
    s.onerror = function () { if (done) return; done = true; clearTimeout(timer); cb(new Error('load')); };
    document.head.appendChild(s);
  }

  // After a reload: submit (once) a module whose time ran out while the page was closed; finish an expired break.
  function reconcileOnLoad() {
    var st = S.stage;
    if (!st || S.gate) return;
    if (st === 'break') { if (S.breakEndsAt && now() >= S.breakEndsAt) enterStage('m1', { quiet: true }); return; }
    var m = S.mods[st];
    if (m && !m.submittedAt && m.endsAt && now() >= m.endsAt) {
      submitStage('time', true);
      toast('Time ran out on ' + C.STAGE_INFO[st].short + ' while you were away. It was submitted, and your answers were kept.', 'warn', 7000);
    }
  }

  function route() {
    closeLayer();
    if (S.status === 'done') return screenResults();
    if (S.status === 'testing') return S.gate ? screenGate() : S.stage === 'break' ? screenBreak() : screenTest(true);
    var w = windowStatus();
    if (w === 'notOpen') return screenMessage('notOpen');
    if (w === 'closed') return screenMessage('closed');
    return screenWelcome();
  }

  /* =================================================================== flow */
  function newMod(stage) {
    return { key: modKey(stage), answers: {}, marked: {}, struck: {}, cur: 0, view: 'q', startedAt: null, endsAt: null, submittedAt: null, raw: null, warned: false, dirShown: false };
  }

  function startTest(name, tg) {
    if (S.status !== 'welcome') return;
    if (windowStatus() !== 'open') return route();
    S.student = { name: name, telegram: tg };
    S.status = 'testing';
    S.startedAt = now();
    try { history.pushState({ isat: 1 }, ''); } catch (e) { }
    enterStage('rw1');
  }

  function enterStage(stage, opts) {
    opts = opts || {};
    S.stage = stage;
    if (stage === 'break') {
      S.breakEndsAt = now() + C.BREAK_MINUTES * 60000;
      save();
      preloadDesmos();
      return screenBreak();
    }
    var m = S.mods[stage];
    if (!m) { m = S.mods[stage] = newMod(stage); }
    if (!m.endsAt) { m.startedAt = now(); m.endsAt = m.startedAt + C.STAGE_INFO[stage].minutes * 60000; }
    save();
    screenTest(true);
    if (C.STAGE_INFO[stage].moduleNo === 2 && !opts.quiet) toast(C.STAGE_INFO[stage].short + ' has started. The clock is running.', 'info', 4500);
    paintLock();
    if (C.STAGE_INFO[stage].moduleNo === 1 && !m.dirShown) { m.dirShown = true; save(); openDirections(); }
    if (stage === 'rw2' || stage === 'm1') preloadDesmos();
  }

  // Submit the current module (user or timer). Idempotent.
  function submitStage(reason, quiet) {
    if (busy) return;
    var st = S.stage, m = S.mods[st];
    if (!m || m.submittedAt) return;
    busy = true;
    try {
      m.submittedAt = Math.min(now(), m.endsAt || now());
      m.submitReason = reason;
      m.raw = C.rawScore(questionsFor(st), m.answers);
      if (st === 'rw1') S.routes.rw = C.route('rw', m.raw, T.routing);
      if (st === 'm1') S.routes.math = C.route('math', m.raw, T.routing);
      var nx = nextStage(st);
      save();
      closeLayer();
      if (nx === 'rw2' || nx === 'm2') openGate(nx);     // Module 2 waits until the student presses Start
      else if (nx) enterStage(nx, { quiet: quiet });
      else finish();
    } finally { busy = false; }
  }

  // Between modules: the next module's clock doesn't start until the student presses Start,
  // so this is the one place where they can Save and exit and come back later.
  function openGate(stage) {
    S.stage = stage;
    S.gate = stage;
    if (!S.mods[stage]) S.mods[stage] = newMod(stage);
    stopBreakMusic();
    save();
    screenGate();
  }
  function startFromGate() {
    if (!S.gate || busy) return;
    enterFullscreen();
    var st = S.gate;
    busy = true;
    try { S.gate = null; S.exited = false; enterStage(st); } finally { busy = false; }
  }
  function saveAndExit() {
    if (S.stage === 'break' && !S.gate) { S.breakEndsAt = null; openGate('m1'); }
    if (!S.gate) return;
    S.exited = true;
    S.integrity.saveExits = (S.integrity.saveExits || 0) + 1;
    save();
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (e) { }
    screenGate();
  }

  function finish() {
    S.status = 'done';
    S.finishedAt = now();
    S.result = computeResult();
    S.submission = { id: 's-' + uid(16), status: CFG.resultsUrl ? 'pending' : 'skipped', tries: 0 };
    save();
    detachDesmos();
    screenResults(true);
    trySubmit();
  }

  function computeResult() {
    var r = { mods: {}, domains: {}, routes: { rw: S.routes.rw, math: S.routes.math } };
    ['rw1', 'rw2', 'm1', 'm2'].forEach(function (st) {
      var qs = questionsFor(st), m = S.mods[st] || { answers: {} }, c = 0;
      qs.forEach(function (q) {
        var ok = C.isCorrect(q, m.answers[q.id]);
        if (ok) c++;
        var d = r.domains[q.domain] || (r.domains[q.domain] = { c: 0, t: 0, section: C.STAGE_INFO[st].section });
        d.t++; if (ok) d.c++;
      });
      var used = m.startedAt ? Math.max(0, Math.min(m.submittedAt || now(), m.endsAt || now()) - m.startedAt) : 0;
      r.mods[st] = { key: modKey(st), correct: c, total: qs.length, usedMs: used };
    });
    var sc = CFG.scoring || C.SCORING;
    r.rwCorrect = r.mods.rw1.correct + r.mods.rw2.correct; r.rwTotal = r.mods.rw1.total + r.mods.rw2.total;
    r.mathCorrect = r.mods.m1.correct + r.mods.m2.correct; r.mathTotal = r.mods.m1.total + r.mods.m2.total;
    r.rw = C.sectionScore(r.rwCorrect, r.rwTotal, S.routes.rw, sc);
    r.math = C.sectionScore(r.mathCorrect, r.mathTotal, S.routes.math, sc);
    r.total = r.rw + r.math;
    r.usedMs = r.mods.rw1.usedMs + r.mods.rw2.usedMs + r.mods.m1.usedMs + r.mods.m2.usedMs;
    return r;
  }

  /* =================================================================== timer */
  function tick() {
    if (!S || !T) return;
    if (S.status === 'welcome') {
      if (windowStatus() !== 'open' && !$('.msg-screen')) route();
      return;
    }
    if (S.status !== 'testing') return;
    paintLock();
    if (S.gate) return;
    if (S.stage === 'break') {
      var left = S.breakEndsAt - now();
      var el = $('#breakClock');
      if (el) el.textContent = C.fmtClock(left);
      var ring = $('#breakRing');
      if (ring) ring.style.strokeDashoffset = String(565.5 * (1 - Math.max(0, left) / (C.BREAK_MINUTES * 60000)));
      if (left <= 0 && !busy) { busy = true; try { stopBreakMusic(); enterStage('m1'); } finally { busy = false; } toast('Break is over. Math Module 1 has started.', 'info', 5000); }
      return;
    }
    var m = curMod();
    if (!m || m.submittedAt) return;
    var rem = m.endsAt - now();
    var clock = C.fmtClock(rem);
    if (clock !== lastShownClock) {
      lastShownClock = clock;
      var t = $('#clock'); if (t) t.textContent = clock;
      var box = $('#timerBox'); if (box) box.classList.toggle('urgent', rem <= 5 * 60000);
    }
    if (rem <= 5 * 60000 && !m.warned) {
      m.warned = true; save();
      if (S.ui.timerHidden) { S.ui.timerHidden = false; save(); paintTimerVisibility(); }
      toast('5 minutes remaining in this module.', 'warn', 6000);
    }
    if (rem <= 0) {
      toast('Time’s up — ' + C.STAGE_INFO[S.stage].short + ' was submitted automatically.', 'warn', 7000);
      submitStage('time');
    }
  }

  /* =================================================================== layer: modals, popovers, toasts */
  var layerOnClose = null;
  function openLayer(html, opts) {
    opts = opts || {};
    closeLayer();
    $layer.innerHTML = '<div class="scrim' + (opts.popover ? ' clear' : '') + '" data-action="layer-close"></div>' + html;
    $layer.classList.add('open');
    layerOnClose = opts.onClose || null;
    renderMath($layer);
    var f = $('[data-autofocus]', $layer) || $('.modal', $layer);
    if (f && f.focus) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) { } }, 30);
  }
  function closeLayer() {
    if (!$layer.classList.contains('open')) return;
    $layer.classList.remove('open');
    $layer.innerHTML = '';
    var cb = layerOnClose; layerOnClose = null;
    if (cb) cb();
  }
  function modal(o) {
    var acts = (o.actions || []).map(function (a) {
      return '<button class="btn ' + (a.kind || 'ghost') + '" data-action="' + a.action + '"' + (a.auto ? ' data-autofocus' : '') + '>' + a.label + '</button>';
    }).join('');
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
    setTimeout(function () { el.classList.remove('show'); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 400); }, ms || 3500);
  }

  /* =================================================================== screens: messages */
  function brandBar(extra) {
    return '<header class="brandbar"><a class="wordmark" href="#" data-action="noop" aria-label="' + esc(CFG.brand || 'isatprep') + '">' + wordmark() + '</a>' + (extra || '') + '</header>';
  }
  function wordmark() {
    return '<span class="wm-mark" aria-hidden="true"><svg viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="url(#wmg)"/><defs><linearGradient id="wmg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f5df0"/><stop offset="1" stop-color="#7a3cf0"/></linearGradient></defs><circle cx="16" cy="9" r="2.6" fill="#fff"/><rect x="13.6" y="13.2" width="4.8" height="11.5" rx="2.4" fill="#fff"/></svg></span><span class="wm-text">' + esc(CFG.brand || 'isatprep') + '</span>';
  }

  function screenMessage(kind, extra) {
    var title, body, icon = I.info;
    if (kind === 'noTest') { title = 'Open your daily link'; body = 'This page needs the link shared in the ' + esc(CFG.community || 'isatprep') + ' channel. Please open today’s mock from there.'; }
    else if (kind === 'notFound') { title = 'Mock not found'; body = 'We couldn’t find this mock. Please check that you opened the full link from the channel, or try again in a minute.'; }
    else if (kind === 'broken') { title = 'This mock is being fixed'; body = 'Something is wrong with this test file. Please let the admin know.'; }
    else if (kind === 'notOpen') { icon = I.clock; title = esc(T.title) + ' opens soon'; body = 'It opens on <b>' + esc(fmtDateTime(T.opensAt)) + '</b>.</p><div class="countdown" id="openCountdown"></div><p>Keep this page open — the test unlocks automatically.'; }
    else if (kind === 'closed') { icon = I.lock; title = esc(T.title) + ' has closed'; body = 'This mock closed on <b>' + esc(fmtDateTime(T.closesAt)) + '</b>. A new mock is posted in the channel every day — see you there!'; }
    $app.className = 'app page';
    $app.innerHTML = brandBar() + '<main class="msg-screen"><div class="msg-card"><div class="msg-ico">' + icon + '</div><h1>' + title + '</h1><p>' + body + '</p>' +
      (CFG.telegram ? '<a class="btn ghost" href="' + esc(CFG.telegram) + '" target="_blank" rel="noopener">' + I.send + ' Open the channel</a>' : '') + '</div></main>';
    if (kind === 'notOpen') {
      var paintCountdown = function () {
        var el = $('#openCountdown'); if (!el) { clearInterval(iv); return; }
        var ms = new Date(T.opensAt).getTime() - now();
        if (ms <= 0) { clearInterval(iv); route(); return; }
        var h = Math.floor(ms / 3600000), mi = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000);
        el.textContent = (h ? h + 'h ' : '') + mi + 'm ' + (s < 10 ? '0' : '') + s + 's';
      };
      var iv = setInterval(paintCountdown, 500);
      paintCountdown();
    }
  }

  /* =================================================================== screen: welcome */
  function screenWelcome() {
    $app.className = 'app page';
    var name = (S.student && S.student.name) || Store.get('isatprep:name') || '';
    var tg = (S.student && S.student.telegram) || Store.get('isatprep:tg') || '';
    var closes = T.closesAt ? '<div class="pill soft">' + I.clock + ' Open until ' + esc(fmtDateTime(T.closesAt)) + '</div>' : '';
    var rules = [
      [I.shield, 'Use your real name and Telegram username', 'That’s how your result is matched to you in the results list.'],
      [I.lock, 'No cheating, no AI', 'The test runs in full screen and hides itself if you leave it. Every exit is recorded.'],
      [I.clock, 'A module can’t be paused', 'Once a module starts, its timer keeps running. Between modules you can <b>Save and exit</b> and come back later on the same device.'],
      [I.send, 'Share your result', 'Post your score in the channel when you finish.']
    ];
    $app.innerHTML = brandBar(PREVIEW ? '<span class="pill warn">Preview mode — nothing is saved</span>' : '') +
      '<main class="welcome">' +
      '<section class="hero">' +
        '<div class="hero-copy">' +
          '<div class="eyebrow">' + I.spark + ' Daily SAT Mock</div>' +
          '<h1>' + esc(T.title) + '</h1>' +
          '<div class="chips"><span>' + I.book + ' 98 questions</span><span>' + I.clock + ' 2h 14m + 10 min break</span><span>' + I.route + ' Adaptive, like the real SAT</span></div>' + closes +
          '<div class="rules-card"><h2>Before you start</h2><ol class="rule-list">' + rules.map(function (r, i) {
            return '<li><span class="rl-ico">' + r[0] + '</span><div><b>' + (i + 1) + '. ' + r[1] + '</b><p>' + r[2] + '</p></div></li>';
          }).join('') + '</ol></div>' +
        '</div>' +
        '<form class="start-card" id="startForm" novalidate autocomplete="on">' +
          '<h2>Who’s testing?</h2>' +
          '<label class="field"><span>Full name</span><input id="fName" name="name" type="text" maxlength="40" autocomplete="name" placeholder="e.g. Aziza Karimova" value="' + esc(name) + '" required></label>' +
          '<label class="field"><span>Telegram username</span><div class="at-input"><b>@</b><input id="fTg" name="telegram" type="text" maxlength="33" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="username" value="' + esc(tg) + '" required></div></label>' +
          '<label class="agree"><input type="checkbox" id="fAgree"><span>I’ve read the rules and I’ll follow them.</span></label>' +
          '<p class="field-err" id="fErr" hidden></p>' +
          '<button class="btn primary big block" id="startBtn" type="submit" disabled><span class="spin" aria-hidden="true"></span><span class="lbl">Preparing test…</span></button>' +
          '<p class="fine">' + I.laptop + '<span>' + (FS_OK ? 'The test opens in <b>full screen</b>. Pick a time when you can focus for about 2.5 hours.' : 'Best on a laptop. On a phone, open the link in <b>Chrome</b> or <b>Safari</b>.') + '</span></p>' +
          (Store.ok || PREVIEW ? '' : '<p class="fine warn-text">' + I.info + '<span>Your browser is blocking storage (private mode?). The test works, but refreshing the page would lose your progress.</span></p>') +
        '</form>' +
      '</section>' +
      '<footer class="foot">Unofficial practice test. SAT® is a trademark of College Board, which is not affiliated with this site.</footer>' +
      '</main>';
    var form = $('#startForm'), btn = $('#startBtn'), nameIn = $('#fName'), tgIn = $('#fTg'), err = $('#fErr'), agree = $('#fAgree');
    var ready = false;
    function validName() { return nameIn.value.trim().replace(/\s+/g, ' ').length >= 2; }
    function validTg() { return /^[A-Za-z0-9_]{4,32}$/.test(tgIn.value.trim()); }
    function paint() { btn.disabled = !ready; if (ready) btn.querySelector('.lbl').textContent = 'Start the test'; btn.classList.toggle('loading', !ready); }
    nameIn.addEventListener('input', function () { err.hidden = true; });
    agree.addEventListener('change', function () { err.hidden = true; });
    tgIn.addEventListener('input', function () { err.hidden = true; var v = tgIn.value.replace(/^@+/, '').replace(/[^A-Za-z0-9_]/g, ''); if (v !== tgIn.value) tgIn.value = v; });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!ready) return;
      if (!validName()) { err.textContent = 'Please enter your real name (at least 2 letters).'; err.hidden = false; nameIn.focus(); return; }
      if (!validTg()) { err.textContent = 'Please enter your Telegram username (at least 4 letters, numbers or _).'; err.hidden = false; tgIn.focus(); return; }
      if (!agree.checked) { err.textContent = 'Please read the rules and tick the box.'; err.hidden = false; agree.focus(); return; }
      var nm = nameIn.value.trim().replace(/\s+/g, ' ').slice(0, 40), t = tgIn.value.trim().slice(0, 32);
      Store.set('isatprep:name', nm); Store.set('isatprep:tg', t);
      confirmStart(nm, t);
    });
    preloadAssets(function () { ready = true; paint(); });
    paint();
  }
  
  function confirmStart(nm, tg) {
    modal({
      title: 'Start ' + esc(T.title) + '?',
      body: '<p>Hi <b>' + esc(nm) + '</b>! The first module, <b>Reading &amp; Writing · Module 1</b>, starts as soon as you tap <b>Begin</b>. It runs for 32 minutes.</p>' +
        '<ul class="checks">' + (FS_OK ? '<li>The test switches to <b>full screen</b>. If you leave full screen, the questions are hidden (the timer keeps running).</li>' : '') +
        '<li>Keep scratch paper and a pencil nearby for Math.</li><li>You get one attempt — no restarts.</li></ul>',
      actions: [{ label: 'Not yet', action: 'layer-close' }, { label: 'Begin', action: 'begin', kind: 'primary', auto: true }],
      cls: 'narrow'
    });
    pendingStart = { name: nm, telegram: tg };
  }
  var pendingStart = null;

  // Load KaTeX fonts (by rendering sample math) so nothing pops in mid-test.
  function preloadAssets(cb) {
    var called = false; function done() { if (!called) { called = true; cb(); } }
    try {
      var probe = document.createElement('div');
      probe.className = 'font-probe';
      probe.innerHTML = '\\(x^2 + \\dfrac{a}{b} - \\sqrt{3} \\le \\pi \\theta\\)';
      document.body.appendChild(probe);
      renderMath(probe);
      void probe.offsetWidth;   // force layout so the browser actually requests the math fonts
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () { setTimeout(done, 50); }, done);
      } else setTimeout(done, 300);
      setTimeout(done, 4000);
    } catch (e) { done(); }
  }

  /* =================================================================== screen: test */
  function screenTest(full) {
    if (S.stage === 'break') return screenBreak();
    var info = C.STAGE_INFO[S.stage];
    var m = curMod();
    if (full || !$('#stage')) {
      $app.className = 'app test ' + info.section + (S.ui.calcOpen && info.section === 'math' ? ' calc-open' : '');
      lastShownClock = '';
      $app.innerHTML =
        (PREVIEW ? previewBar() : '') +
        '<header class="tb">' +
          '<div class="tb-left"><div class="tb-title"><span class="full">' + esc(info.title) + '</span><span class="short">' + esc(info.short) + '</span></div>' +
            '<button class="link-btn" data-action="directions">Directions ' + I.chevDown + '</button></div>' +
          '<div class="tb-center"><div class="timer" id="timerBox"><span class="clock" id="clock">' + C.fmtClock(m.endsAt - now()) + '</span><span class="clock-ico">' + I.clock + '</span></div>' +
            '<button class="pill-btn" id="timerToggle" data-action="toggle-timer">Hide</button></div>' +
          '<div class="tb-right">' + (info.section === 'math'
            ? '<button class="tool" data-action="calc" aria-pressed="' + (S.ui.calcOpen ? 'true' : 'false') + '">' + I.calc + '<span>Calculator</span></button>' +
              '<button class="tool" data-action="reference">' + I.ref + '<span>Reference</span></button>'
            : '<div class="tool-ghost"></div>') + '</div>' +
        '</header>' +
        '<div class="tb-rule" aria-hidden="true"></div>' +
        '<div class="work">' +
          (info.section === 'math' ? '<aside class="calc-dock" id="calcDock" aria-label="Desmos graphing calculator"><div class="calc-head"><b>' + I.calc + ' Calculator</b><button class="icon-btn" data-action="calc" aria-label="Close calculator">' + I.close + '</button></div><div class="calc-body" id="calcBody"></div><div class="calc-resize" id="calcResize" title="Drag to resize" aria-hidden="true"></div></aside>' : '') +
          '<main class="stage" id="stage"></main>' +
        '</div>' +
        '<footer class="bb" id="bb"></footer>';
      paintTimerVisibility();
      if (info.section === 'math') { mountDesmos(); setupCalcResize(); }
    }
    paintStage();
  }

  function previewBar() {
    var opts = [['rw1', 'R&W M1', ''], ['rw2', 'R&W M2 · easier', 'easy'], ['rw2', 'R&W M2 · harder', 'hard'], ['m1', 'Math M1', ''], ['m2', 'Math M2 · easier', 'easy'], ['m2', 'Math M2 · harder', 'hard'], ['break', 'Break', ''], ['done', 'Results', '']];
    return '<div class="preview-bar"><b>Preview</b><span>Nothing is saved or sent.</span><select id="pvJump" aria-label="Jump to module">' +
      opts.map(function (o, i) { return '<option value="' + i + '">' + o[1] + '</option>'; }).join('') + '</select><button class="pill-btn" data-action="pv-jump">Go</button></div>';
  }

  function paintTimerVisibility() {
    var box = $('#timerBox'), btn = $('#timerToggle');
    if (!box || !btn) return;
    box.classList.toggle('hidden-time', !!S.ui.timerHidden);
    btn.textContent = S.ui.timerHidden ? 'Show' : 'Hide';
    btn.setAttribute('aria-label', S.ui.timerHidden ? 'Show timer' : 'Hide timer');
  }

  function paintStage() {
    var m = curMod(), qs = curQs(), info = C.STAGE_INFO[S.stage];
    var stage = $('#stage');
    if (m.view === 'review') {
      stage.className = 'stage review-stage';
      stage.innerHTML = '<div class="review-wrap"><h1>Check Your Work</h1>' +
        '<p class="lede">Go to any question to review or change your answer. When you’re ready, select <b>Next</b> to finish this module.</p>' +
        '<div class="review-card"><div class="rc-head"><b>' + esc(info.title) + '</b>' + legend() + '</div>' + grid(qs, m, 'big') + '</div></div>';
      paintBottom();
      stage.scrollTop = 0;
      return;
    }
    if (m.cur >= qs.length) m.cur = qs.length - 1;
    if (m.cur < 0) m.cur = 0;
    var q = qs[m.cur];
    var hasPassage = info.section === 'rw';
    stage.className = 'stage ' + (hasPassage ? 'split' : 'single');
    var qhead = '<div class="qhead"><div class="qnum" aria-label="Question ' + (m.cur + 1) + '">' + (m.cur + 1) + '</div>' +
      '<button class="mark-btn' + (m.marked[q.id] ? ' on' : '') + '" data-action="mark" aria-pressed="' + (m.marked[q.id] ? 'true' : 'false') + '">' + (m.marked[q.id] ? I.bookmarkOn : I.bookmark) + '<span>Mark for Review</span></button>' +
      (q.type === 'mcq' ? '<button class="abc-btn' + (S.ui.abc ? ' on' : '') + '" data-action="abc" aria-pressed="' + (S.ui.abc ? 'true' : 'false') + '" title="Answer eliminator: cross out choices">' + abcIcon(S.ui.abc) + '</button>' : '') +
      '</div>';
    var answerArea = q.type === 'mcq' ? choicesHtml(q, m) : sprHtml(q, m);
    if (hasPassage) {
      stage.innerHTML = '<section class="pane passage-pane" id="pPane"><div class="passage">' + q.passage + '</div></section>' +
        '<div class="divider" aria-hidden="true"></div>' +
        '<section class="pane question-pane" id="qPane">' + qhead + '<div class="prompt">' + q.prompt + '</div>' + answerArea + '</section>';
    } else {
      stage.innerHTML = '<section class="pane question-pane math-pane" id="qPane"><div class="math-col">' + qhead + '<div class="prompt">' + q.prompt + '</div>' + answerArea + '</div></section>';
    }
    renderMath(stage);
    if (q.type === 'spr') bindSpr(q, m);
    paintBottom();
    $$('.pane', stage).forEach(function (p) { p.scrollTop = 0; });
    stage.scrollTop = 0;
  }

  function choicesHtml(q, m) {
    var a = m.answers[q.id], st = m.struck[q.id] || {};
    return '<div class="choices' + (S.ui.abc ? ' abc-mode' : '') + '" role="radiogroup" aria-label="Answer choices">' + q.choices.map(function (c, i) {
      var L = 'ABCD'.charAt(i), sel = a === L, x = !!st[L];
      return '<div class="choice-row' + (sel ? ' selected' : '') + (x ? ' struck' : '') + '" data-letter="' + L + '">' +
        '<div class="choice" role="radio" tabindex="0" aria-checked="' + (sel ? 'true' : 'false') + '" data-action="choose" data-letter="' + L + '">' +
          '<span class="letter">' + L + '</span><span class="ctext">' + c + '</span></div>' +
        '<button class="strike" data-action="strike" data-letter="' + L + '" aria-label="' + (x ? 'Undo cross-out of choice ' : 'Cross out choice ') + L + '">' + (x ? '<u>Undo</u>' : '<span class="strike-l">' + L + '</span>') + '</button>' +
      '</div>';
    }).join('') + '</div>';
  }

  function sprHtml(q, m) {
    var v = m.answers[q.id] || '';
    return '<div class="spr">' +
      '<label class="spr-label" for="sprIn">Your answer</label>' +
      '<div class="spr-row"><input id="sprIn" class="spr-input" type="text" inputmode="decimal" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" maxlength="6" value="' + esc(v) + '" aria-describedby="sprHelp">' +
        '<div class="spr-keys" aria-label="Insert symbol"><button type="button" class="key" data-action="spr-key" data-key="-" aria-label="Negative sign">−</button><button type="button" class="key" data-action="spr-key" data-key="/" aria-label="Fraction bar">/</button><button type="button" class="key" data-action="spr-key" data-key="." aria-label="Decimal point">.</button></div></div>' +
      '<div class="spr-preview" id="sprPrev" aria-live="polite"></div>' +
      '<p class="spr-hint" id="sprHint" hidden></p>' +
      '<details class="spr-help" id="sprHelp"><summary>' + I.info + ' How to enter your answer</summary>' + sprRules() + '</details>' +
      '</div>';
  }
  function sprRules() {
    return '<ul class="rules-list">' +
      '<li>If you find more than one correct answer, enter only one.</li>' +
      '<li>You can enter up to 5 characters for a positive answer and up to 6 characters (including the negative sign) for a negative answer.</li>' +
      '<li>If a fraction doesn’t fit, enter its decimal equivalent.</li>' +
      '<li>If a decimal doesn’t fit, enter it by truncating or rounding at the fourth digit.</li>' +
      '<li>Enter a mixed number such as \\(3\\tfrac{1}{2}\\) as an improper fraction (7/2) or a decimal (3.5).</li>' +
      '<li>Don’t include symbols such as %, $, or commas.</li></ul>' +
      '<table class="ex-table"><thead><tr><th>Answer</th><th>Acceptable ways to enter</th><th>Not acceptable</th></tr></thead><tbody>' +
      '<tr><td>3.5</td><td>3.5 · 3.50 · 7/2</td><td>31/2 · 3 1/2</td></tr>' +
      '<tr><td>\\(\\tfrac{2}{3}\\)</td><td>2/3 · .6666 · .6667 · 0.666 · 0.667</td><td>0.66 · .66 · 0.67 · .67</td></tr>' +
      '<tr><td>\\(-\\tfrac{1}{3}\\)</td><td>−1/3 · −.3333 · −0.333</td><td>−.33 · −0.33</td></tr></tbody></table>';
  }

  function bindSpr(q, m) {
    var inp = $('#sprIn'), prev = $('#sprPrev'), hint = $('#sprHint');
    var hintTimer = null;
    function showHint(msg) { hint.textContent = msg; hint.hidden = false; clearTimeout(hintTimer); hintTimer = setTimeout(function () { hint.hidden = true; }, 4500); }
    function paintPrev() {
      var p = C.sprPreview(inp.value);
      if (p.kind === 'empty') prev.innerHTML = '<span class="muted">Answer preview will appear here</span>';
      else if (p.kind === 'invalid') prev.innerHTML = '<span class="muted">Answer preview: </span><span class="bad">not a complete number yet</span>';
      else { prev.innerHTML = '<span class="muted">Answer preview: </span><span class="pv">\\(' + p.tex + '\\)</span>'; renderMath(prev); }
    }
    function commit() {
      var raw = inp.value, clean = C.sanitizeSpr(raw);
      if (clean !== raw) {
        var pos = Math.max(0, (inp.selectionStart || clean.length) - (raw.length - clean.length));
        inp.value = clean;
        try { inp.setSelectionRange(pos, pos); } catch (e) { }
        if (/\s/.test(raw)) showHint('Mixed numbers can’t be entered. Use an improper fraction (7/2) or a decimal (3.5).');
        else if (/[%$]/.test(raw)) showHint('Leave out symbols like % and $. Enter the number only.');
        else if (raw.replace(/[^0-9]/g, '').length && clean.length >= (clean.charAt(0) === '-' ? 6 : 5) && raw.length > clean.length) showHint('That’s the maximum: 5 characters (6 with a negative sign).');
        else showHint('Only digits, one decimal point, one fraction bar (/), and a leading negative sign are allowed.');
      }
      setAnswer(q, clean || null);
      paintPrev();
    }
    inp.addEventListener('input', commit);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
    paintPrev();
    sprCommitHook = commit;
  }
  var sprCommitHook = null;

  function insertSprKey(key) {
    var inp = $('#sprIn'); if (!inp) return;
    var v = inp.value;
    if (key === '-') { inp.value = v.charAt(0) === '-' ? v.slice(1) : '-' + v; }
    else {
      var s = typeof inp.selectionStart === 'number' ? inp.selectionStart : v.length, e2 = typeof inp.selectionEnd === 'number' ? inp.selectionEnd : v.length;
      inp.value = v.slice(0, s) + key + v.slice(e2);
      try { inp.setSelectionRange(s + 1, s + 1); } catch (e) { }
    }
    if (sprCommitHook) sprCommitHook();
  }

  function setAnswer(q, val) {
    var m = curMod();
    if (!m || m.submittedAt) return;
    if (val == null || val === '') delete m.answers[q.id]; else m.answers[q.id] = val;
    save();
    paintBottomCounts();
  }

  function legend() {
    return '<div class="legend"><span><i class="lg cur">' + I.pin + '</i>Current</span><span><i class="lg un"></i>Unanswered</span><span><i class="lg rv">' + I.bookmarkOn + '</i>For Review</span></div>';
  }
  function grid(qs, m, size) {
    return '<div class="qgrid ' + (size || '') + '">' + qs.map(function (q, i) {
      var ans = C.isAnswered(q, m.answers[q.id]), cur = i === m.cur && m.view !== 'review';
      return '<button class="qcell' + (ans ? ' ans' : ' un') + (m.marked[q.id] ? ' rv' : '') + (cur ? ' cur' : '') + '" data-action="goto" data-i="' + i + '" aria-label="Question ' + (i + 1) + (ans ? ', answered' : ', unanswered') + (m.marked[q.id] ? ', marked for review' : '') + '">' +
        (cur ? '<i class="pin">' + I.pin + '</i>' : '') + '<span>' + (i + 1) + '</span>' + (m.marked[q.id] ? '<i class="flag">' + I.bookmarkOn + '</i>' : '') + '</button>';
    }).join('') + '</div>';
  }

  function paintBottom() {
    var m = curMod(), qs = curQs();
    var review = m.view === 'review';
    var bb = $('#bb');
    bb.innerHTML = '<div class="bb-left"><span class="who">' + esc(S.student ? S.student.name : '') + '</span></div>' +
      '<div class="bb-center">' + (review ? '<span class="bb-note">Check Your Work</span>' :
        '<button class="qnav-btn" data-action="nav" aria-haspopup="dialog" aria-label="Question ' + (m.cur + 1) + ' of ' + qs.length + '. Open question navigator"><span class="qw">Question </span>' + (m.cur + 1) + ' of ' + qs.length + ' ' + I.chevUp + '</button>') + '</div>' +
      '<div class="bb-right">' +
        '<button class="btn ghost" data-action="back"' + (!review && m.cur === 0 ? ' disabled' : '') + '>' + I.chevLeft + '<span>Back</span></button>' +
        '<button class="btn primary" data-action="next"><span>Next</span>' + I.chevRight + '</button>' +
      '</div>' +
      '<div class="bb-progress" aria-hidden="true"><i style="width:' + Math.round(answeredCount() / qs.length * 100) + '%"></i></div>';
  }
  function answeredCount() { var m = curMod(), n = 0; curQs().forEach(function (q) { if (C.isAnswered(q, m.answers[q.id])) n++; }); return n; }
  function paintBottomCounts() {
    var bar = $('.bb-progress i'); if (bar) bar.style.width = Math.round(answeredCount() / curQs().length * 100) + '%';
  }

  function openNavigator() {
    var m = curMod(), qs = curQs(), info = C.STAGE_INFO[S.stage];
    openLayer('<div class="popover nav-pop" role="dialog" aria-label="Question navigator" tabindex="-1">' +
      '<div class="pop-head"><b>' + esc(info.title) + ' Questions</b><button class="icon-btn" data-action="layer-close" aria-label="Close">' + I.close + '</button></div>' +
      legend() + grid(qs, m) +
      '<div class="pop-foot"><button class="btn ghost" data-action="to-review">Go to Review Page</button></div></div>', { popover: true });
  }

  function goTo(i) {
    var m = curMod(); var qs = curQs();
    i = Math.max(0, Math.min(qs.length - 1, i));
    m.cur = i; m.view = 'q'; save();
    closeLayer();
    paintStage();
  }

  function onNext() {
    var m = curMod(), qs = curQs();
    if (m.view === 'review') return confirmSubmitModule();
    if (m.cur < qs.length - 1) return goTo(m.cur + 1);
    m.view = 'review'; save(); paintStage();
  }
  function onBack() {
    var m = curMod();
    if (m.view === 'review') { m.view = 'q'; m.cur = curQs().length - 1; save(); return paintStage(); }
    if (m.cur > 0) goTo(m.cur - 1);
  }

  function confirmSubmitModule() {
    var m = curMod(), qs = curQs(), info = C.STAGE_INFO[S.stage];
    var un = qs.filter(function (q) { return !C.isAnswered(q, m.answers[q.id]); }).length;
    var rv = qs.filter(function (q) { return m.marked[q.id]; }).length;
    var nx = nextStage(S.stage);
    var where = nx === 'break' ? 'your 10-minute break' : nx ? C.STAGE_INFO[nx].short : 'your results';
    modal({
      title: 'Finish ' + esc(info.short) + '?',
      body: (un ? '<p class="callout warn">' + I.info + ' You have <b>' + plural(un, 'unanswered question') + '</b>. There’s no penalty for guessing, so it’s better to answer every question.</p>' : '<p class="callout ok">' + I.check + ' All questions answered.</p>') +
        (rv ? '<p>' + (rv === 1 ? '1 question is' : rv + ' questions are') + ' still marked for review.</p>' : '') +
        '<p>After you continue to <b>' + where + '</b>, you can’t come back to this module.</p>',
      actions: [{ label: 'Keep reviewing', action: 'layer-close' }, { label: 'Yes, continue', action: 'submit-module', kind: 'primary', auto: true }],
      cls: 'narrow'
    });
  }

  function openDirections() {
    var info = C.STAGE_INFO[S.stage];
    var body = info.section === 'rw'
      ? '<p>Each question in this section comes with a short passage. Some have two passages, a table, or a graph. Read the passage and the question carefully, then choose the <b>single best answer</b> based on the passage.</p><p>Every question is multiple choice with four options. The module has <b>27 questions</b> and lasts <b>32 minutes</b>.</p>' +
        '<div class="tips"><div>' + I.bookmark + '<span><b>Mark for Review</b> flags a question so you can come back to it.</span></div><div>' + abcIcon(false) + '<span><b>ABC</b> lets you cross out choices you’ve ruled out.</span></div><div>' + I.chevUp + '<span><b>Question X of 27</b> opens a map of every question in the module.</span></div></div>'
      : '<p>This section tests key math skills. You may use the <b>calculator</b> and the <b>reference sheet</b> at any time. The module has <b>22 questions</b> and lasts <b>35 minutes</b>.</p>' +
        '<p>Unless a question says otherwise: all variables and expressions represent real numbers, figures are drawn to scale, all figures lie in a plane, and the domain of a function \\(f\\) is the set of all real numbers \\(x\\) for which \\(f(x)\\) is a real number.</p>' +
        '<p>For <b>multiple-choice</b> questions, choose the single best answer. For <b>student-produced response</b> questions, type your answer in the box:</p>' + sprRules();
    modal({ title: 'Directions', body: body, actions: [{ label: 'Close', action: 'layer-close', kind: 'primary', auto: true }], cls: 'wide' });
  }

  function openReference() {
    var f = function (tex) { return '<div class="rf-f">\\(' + tex + '\\)</div>'; };
    var shapes = [
      ['Circle', f('A = \\pi r^2') + f('C = 2\\pi r')],
      ['Rectangle', f('A = \\ell w')],
      ['Triangle', f('A = \\tfrac{1}{2}bh')],
      ['Pythagorean theorem', f('c^2 = a^2 + b^2')],
      ['Special right triangles', '<div class="rf-t">\\(30^\\circ\\)–\\(60^\\circ\\)–\\(90^\\circ\\): sides \\(x,\\ x\\sqrt{3},\\ 2x\\)</div><div class="rf-t">\\(45^\\circ\\)–\\(45^\\circ\\)–\\(90^\\circ\\): sides \\(s,\\ s,\\ s\\sqrt{2}\\)</div>'],
      ['Rectangular box', f('V = \\ell wh')],
      ['Cylinder', f('V = \\pi r^2 h')],
      ['Sphere', f('V = \\tfrac{4}{3}\\pi r^3')],
      ['Cone', f('V = \\tfrac{1}{3}\\pi r^2 h')],
      ['Pyramid', f('V = \\tfrac{1}{3}\\ell wh')]
    ];
    modal({
      title: 'Reference Sheet',
      body: '<div class="ref-grid">' + shapes.map(function (s) { return '<div class="ref-card"><b>' + s[0] + '</b>' + s[1] + '</div>'; }).join('') + '</div>' +
        '<ul class="ref-facts"><li>The number of degrees of arc in a circle is 360.</li><li>The number of radians of arc in a circle is \\(2\\pi\\).</li><li>The sum of the measures in degrees of the angles of a triangle is 180.</li></ul>',
      actions: [{ label: 'Close', action: 'layer-close', kind: 'primary', auto: true }], cls: 'wide'
    });
  }

  /* =================================================================== Desmos calculator */
  var D = { state: 'idle', calc: null, el: null, waiters: [] };
  function preloadDesmos() { if (D.state === 'idle') loadDesmos(function () { }); }
  function loadDesmos(cb) {
    if (D.state === 'ready') return cb(true);
    if (D.state === 'failed') return cb(false);
    D.waiters.push(cb);
    if (D.state === 'loading') return;
    D.state = 'loading';
    var s = document.createElement('script');
    var t = setTimeout(function () { fail(); }, 45000);   // the calculator script is large; give slow phones time
    function fail() { if (D.state !== 'loading') return; D.state = 'failed'; flush(false); }
    function flush(ok) { var w = D.waiters; D.waiters = []; w.forEach(function (f) { try { f(ok); } catch (e) { } }); }
    s.src = 'https://www.desmos.com/api/v1.11/calculator.js?apiKey=' + encodeURIComponent(CFG.desmosKey || '');
    s.async = true;
    s.onload = function () {
      clearTimeout(t);
      try {
        D.el = document.createElement('div'); D.el.className = 'desmos-host';
        D.calc = window.Desmos.GraphingCalculator(D.el, { keypad: true, expressions: true, settingsMenu: true, zoomButtons: true, expressionsTopbar: true, border: false, links: false, pasteGraphLink: false, images: false, folders: false, notes: false });
        D.state = 'ready'; flush(true);
      } catch (e) { D.state = 'failed'; flush(false); }
    };
    s.onerror = function () { clearTimeout(t); fail(); };
    document.head.appendChild(s);
  }
  function mountDesmos() {
    var body = $('#calcBody'); if (!body) return;
    if (D.state === 'ready') { body.innerHTML = ''; body.appendChild(D.el); setTimeout(function () { try { D.calc.resize(); } catch (e) { } }, 30); return; }
    if (D.state === 'failed') { body.innerHTML = desmosFallback(); return; }
    body.innerHTML = '<div class="calc-loading"><span class="spin dark"></span> Loading calculator…</div>';
    loadDesmos(function (ok) { var b = $('#calcBody'); if (!b) return; if (ok) { b.innerHTML = ''; b.appendChild(D.el); try { D.calc.resize(); } catch (e) { } } else b.innerHTML = desmosFallback(); });
  }
  function detachDesmos() { if (D.el && D.el.parentNode) D.el.parentNode.removeChild(D.el); }
  function desmosFallback() {
    return '<div class="calc-fail"><p>The calculator couldn’t load on this connection.</p><button class="btn primary" data-action="calc-retry">Try again</button><a class="btn ghost" href="https://www.desmos.com/calculator" target="_blank" rel="noopener">Open Desmos in a new tab</a><p class="muted">Your test keeps running here.</p></div>';
  }
  // A failed load (e.g. a brief network drop) is never permanent: reset and try again.
  function retryDesmos() {
    if (D.state !== 'failed') return;
    D.state = 'idle';
    $$('script[src*="desmos.com/api"]').forEach(function (s) { if (s.parentNode) s.parentNode.removeChild(s); });
    mountDesmos();
  }
  function toggleCalc() {
    S.ui.calcOpen = !S.ui.calcOpen; save();
    $app.classList.toggle('calc-open', !!S.ui.calcOpen);
    var b = $('[data-action="calc"].tool'); if (b) b.setAttribute('aria-pressed', S.ui.calcOpen ? 'true' : 'false');
    if (S.ui.calcOpen) { if (D.state === 'failed') retryDesmos(); else mountDesmos(); }
    setTimeout(function () { if (D.calc) try { D.calc.resize(); } catch (e) { } }, 60);
  }
  function setupCalcResize() {
    var h = $('#calcResize'), dock = $('#calcDock'); if (!h || !dock) return;
    if (S.ui.calcW) dock.style.width = S.ui.calcW + 'px';
    var startX = 0, startW = 0, dragging = false;
    h.addEventListener('pointerdown', function (e) { dragging = true; startX = e.clientX; startW = dock.getBoundingClientRect().width; try { h.setPointerCapture(e.pointerId); } catch (x) { } e.preventDefault(); });
    h.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var w = Math.max(300, Math.min(window.innerWidth * 0.7, startW + (e.clientX - startX)));
      dock.style.width = w + 'px'; S.ui.calcW = Math.round(w);
      if (D.calc) try { D.calc.resize(); } catch (x) { }
    });
    function end() { if (dragging) { dragging = false; save(); } }
    h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
  }

  /* =================================================================== screen: break */
  function screenBreak() {
    $app.className = 'app page break-page';
    var left = S.breakEndsAt - now();
    $app.innerHTML = (PREVIEW ? previewBar() : '') + brandBar() +
      '<main class="break-screen"><div class="break-card">' +
        '<div class="ring-wrap"><svg viewBox="0 0 200 200" class="ring"><circle cx="100" cy="100" r="90" class="ring-bg"/><circle id="breakRing" cx="100" cy="100" r="90" class="ring-fg" style="stroke-dasharray:565.5;stroke-dashoffset:' + (565.5 * (1 - Math.max(0, left) / (C.BREAK_MINUTES * 60000))) + '"/></svg>' +
          '<div class="ring-txt"><small>Break time</small><b id="breakClock">' + C.fmtClock(left) + '</b></div></div>' +
        '<h1>Nice work — Reading &amp; Writing is done!</h1>' +
        '<p class="lede">Take a short break. Stand up, stretch, and drink some water. When the timer reaches 0:00, <b>Math</b> starts automatically.</p>' +
        '<div class="next-up"><div>' + I.sigma + '</div><div><b>Up next: Math</b><span>2 modules · 22 questions each · 35 minutes each. The Desmos calculator and the reference sheet are available.</span></div></div>' +
        '<div class="brk-actions"><button class="btn primary big" data-action="resume">Resume testing now ' + I.chevRight + '</button>' +
        '<button class="btn ghost big" data-action="save-exit">Save and exit</button></div>' +
        '<div class="music"><div class="music-row"><button class="music-btn' + (Music.on ? ' on' : '') + '" id="musicBtn" data-action="music" aria-pressed="' + (Music.on ? 'true' : 'false') + '">' +
          '<span class="eqz" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="lbl">' + (Music.on ? 'Stop the beat' : 'isatprep phonk beat') + '</span></button>' +
          (CFG.breakMusicYoutube ? '<button class="music-btn" id="ytBtn" data-action="music-yt" aria-pressed="false"><span class="eqz" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="lbl">' + esc(CFG.breakMusicYoutubeLabel || 'Phonk mix (YouTube)') + '</span></button>' : '') +
          '</div><div class="yt-box" id="ytBox" hidden></div><small>Optional · plays only during the break</small></div>' +
      '</div></main>';
  }

  /* =================================================================== screen: between modules (gate) */
  function screenGate() {
    var st = S.gate, info = C.STAGE_INFO[st], n = questionsFor(st).length;
    var done = st === 'rw2' ? 'Reading and Writing Module 1 is done' : st === 'm1' ? 'Reading and Writing is done' : 'Math Module 1 is done';
    var nextUp = '<div class="next-up"><div>' + (info.section === 'math' ? I.sigma : I.book) + '</div><div><b>Up next: ' + esc(info.title) + '</b><span>' +
      n + ' questions · ' + info.minutes + ' minutes. The timer starts only when you press Start.</span></div></div>';
    $app.className = 'app page break-page';
    $app.innerHTML = (PREVIEW ? previewBar() : '') + brandBar() +
      '<main class="break-screen"><div class="break-card gate-card">' +
        (S.exited
          ? '<div class="gate-ico ok">' + I.check + '</div><h1>Your progress is saved</h1>' +
            '<p class="lede">You can close this page now. When you’re ready, open <b>the same link on this same device and browser</b> and you’ll be right back here.</p>' + nextUp +
            '<div class="brk-actions"><button class="btn primary big" data-action="gate-start">Start ' + esc(info.short) + ' now ' + I.chevRight + '</button></div>'
          : '<div class="gate-ico">' + I.check + '</div><h1>' + done + '!</h1>' +
            '<p class="lede">Need a pause? This is the moment: <b>Save and exit</b> now and finish later. Once a module starts, it can’t be paused.</p>' + nextUp +
            '<div class="brk-actions"><button class="btn primary big" data-action="gate-start">Start ' + esc(info.short) + ' ' + I.chevRight + '</button>' +
            '<button class="btn ghost big" data-action="save-exit">Save and exit</button></div>') +
      '</div></main>';
  }

  /* =================================================================== full-screen lock */
  var lockWas = null;
  function lockNeeded() { return FS_OK && S && S.status === 'testing' && !S.gate && S.stage && S.stage !== 'break'; }
  function paintLock() {
    var need = lockNeeded(), locked = need && !isFullscreen();
    var el = document.getElementById('fsLock');
    if (locked && !el) {
      el = document.createElement('div');
      el.id = 'fsLock'; el.className = 'fs-lock'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
      el.innerHTML = '<div class="fs-card"><div class="gate-ico warn">' + I.lock + '</div><h2>Full screen is required</h2>' +
        '<p>The questions are hidden while you’re outside full screen. <b>Your timer keeps running</b>, so come back quickly.</p>' +
        '<button class="btn primary big" data-action="fs-enter">Return to full screen</button><small>Each exit is recorded with your result.</small></div>';
      document.body.appendChild(el);
    }
    if (el) el.hidden = !locked;
    if (lockWas === false && locked && S.integrity) { S.integrity.fsExits = (S.integrity.fsExits || 0) + 1; save(); }
    lockWas = need ? locked : null;
  }
  document.addEventListener('fullscreenchange', paintLock);
  document.addEventListener('webkitfullscreenchange', paintLock);
  window.addEventListener('resize', function () { if (S) paintLock(); });

  /* =================================================================== break music (optional) */
  // An original phonk-style loop made live with the Web Audio API (cowbell riff, 808 bass, drums), so there is
  // nothing to download and no licensing issue. Set SAT_CONFIG.breakMusicUrl to play your own track instead.
  var Music = { on: false, ctx: null, timer: null, step: 0, next: 0, audio: null, master: null };
  function startBreakMusic() {
    if (Music.on) return;
    if (CFG.breakMusicUrl) {
      Music.audio = Music.audio || new Audio(CFG.breakMusicUrl);
      Music.audio.loop = true; Music.audio.volume = 0.6;
      var p = Music.audio.play(); if (p && p.catch) p.catch(function () { });
      Music.on = true; return paintMusic();
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { toast('Music isn’t supported in this browser.', 'info'); return; }
    if (!Music.ctx) {
      Music.ctx = new AC();
      Music.master = Music.ctx.createGain(); Music.master.gain.value = 0.32;
      var comp = Music.ctx.createDynamicsCompressor(); Music.master.connect(comp); comp.connect(Music.ctx.destination);
      var len = Music.ctx.sampleRate, buf = Music.ctx.createBuffer(1, len, Music.ctx.sampleRate), dd = buf.getChannelData(0);
      for (var i = 0; i < len; i++) dd[i] = Math.random() * 2 - 1;
      Music.noise = buf;
      var curve = new Float32Array(256); for (var k = 0; k < 256; k++) { var x = k / 128 - 1; curve[k] = Math.tanh(3 * x); }
      Music.curve = curve;
    }
    if (Music.ctx.state === 'suspended') Music.ctx.resume();
    Music.on = true; Music.step = 0; Music.next = Music.ctx.currentTime + 0.08;
    Music.timer = setInterval(schedMusic, 25);
    paintMusic();
  }
  function stopBreakMusic() {
    if (!Music.on) return;
    Music.on = false;
    clearInterval(Music.timer); Music.timer = null;
    if (Music.audio) try { Music.audio.pause(); } catch (e) { }
    if (Music.ctx) try { Music.ctx.suspend(); } catch (e) { }
    paintMusic();
  }
  function paintMusic() {
    var b = $('#musicBtn'); if (!b) return;
    b.classList.toggle('on', Music.on); b.setAttribute('aria-pressed', Music.on ? 'true' : 'false');
    b.querySelector('.lbl').textContent = Music.on ? 'Stop the beat' : 'isatprep phonk beat';
  }
  // A YouTube mix (SAT_CONFIG.breakMusicYoutube = video id), played through YouTube's own embedded player.
  function toggleYoutube() {
    var box = $('#ytBox'), btn = $('#ytBtn'); if (!box || !btn) return;
    var on = !box.hidden;
    if (on) { box.innerHTML = ''; box.hidden = true; }
    else {
      stopBreakMusic();
      box.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(CFG.breakMusicYoutube) + '?autoplay=1&rel=0&playsinline=1" title="Break music" ' +
        'allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';
      box.hidden = false;
    }
    btn.classList.toggle('on', !on); btn.setAttribute('aria-pressed', !on ? 'true' : 'false');
    btn.querySelector('.lbl').textContent = !on ? 'Stop the mix' : (CFG.breakMusicYoutubeLabel || 'Phonk mix (YouTube)');
  }
  function stopYoutube() { var box = $('#ytBox'); if (box && !box.hidden) toggleYoutube(); }
  var PH = {
    bpm: 132,
    // 32 sixteenth-steps (2 bars). Cowbell riff in semitones above the root (null = rest).
    bell: [0, null, 0, null, 3, null, 0, null, 7, null, 5, null, 3, null, 0, null, 0, null, 0, null, 3, null, 5, null, 8, null, 7, null, 5, null, 3, null],
    bass: [0, null, null, null, null, null, null, 0, null, null, 0, null, null, null, null, null, -2, null, null, null, null, null, null, -2, null, null, -4, null, null, null, null, null],
    kick: [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0],
    clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat:  [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0]
  };
  function schedMusic() {
    var c = Music.ctx, dt = 60 / PH.bpm / 4;
    while (Music.next < c.currentTime + 0.12) {
      var i = Music.step % 32, t = Music.next;
      if (PH.bell[i] !== null) cowbell(t, PH.bell[i]);
      if (PH.bass[i] !== null) bass808(t, PH.bass[i], dt * 6);
      if (PH.kick[i]) kick(t);
      if (PH.clap[i]) clap(t);
      if (PH.hat[i]) hat(t, i % 2 ? 0.05 : 0.09);
      Music.step++; Music.next += dt;
    }
  }
  function env(g, t, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  function cowbell(t, semi) {
    var c = Music.ctx, r = Math.pow(2, semi / 12), g = c.createGain(), bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 900 * r; bp.Q.value = 2.5;
    [540, 800].forEach(function (f) { var o = c.createOscillator(); o.type = 'square'; o.frequency.value = f * r; o.connect(bp); o.start(t); o.stop(t + 0.32); });
    bp.connect(g); g.connect(Music.master); env(g, t, 0.28, 0.3);
  }
  function bass808(t, semi, dur) {
    var c = Music.ctx, o = c.createOscillator(), g = c.createGain(), sh = c.createWaveShaper(), f = 43.65 * Math.pow(2, semi / 12);
    sh.curve = Music.curve; o.type = 'sine';
    o.frequency.setValueAtTime(f * 2.2, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    o.connect(sh); sh.connect(g); g.connect(Music.master); env(g, t, 0.55, dur); o.start(t); o.stop(t + dur + 0.05);
  }
  function kick(t) {
    var c = Music.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    o.connect(g); g.connect(Music.master); env(g, t, 0.9, 0.22); o.start(t); o.stop(t + 0.25);
  }
  function noiseHit(t, type, freq, peak, dur) {
    var c = Music.ctx, n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    n.buffer = Music.noise; f.type = type; f.frequency.value = freq;
    n.connect(f); f.connect(g); g.connect(Music.master); env(g, t, peak, dur); n.start(t, Math.random() * 0.5); n.stop(t + dur + 0.02);
  }
  function clap(t) { noiseHit(t, 'bandpass', 1500, 0.5, 0.16); noiseHit(t + 0.012, 'bandpass', 1200, 0.35, 0.12); }
  function hat(t, peak) { noiseHit(t, 'highpass', 7500, peak, 0.04); }

  /* =================================================================== screen: results */
  function screenResults(fresh) {
    var r = S.result || (S.result = computeResult());
    $app.className = 'app page results-page';
    var pct = (r.total - 400) / 1200;
    var unlocked = answersUnlocked();
    var tabs = [['rw1', 'R&W · Module 1'], ['rw2', 'R&W · Module 2'], ['m1', 'Math · Module 1'], ['m2', 'Math · Module 2']];
    var activeTab = S.ui.resTab || 'rw1';
    var mins = Math.round(r.usedMs / 60000);
    $app.innerHTML = (PREVIEW ? previewBar() : '') + brandBar('<span class="upload" id="upload"></span>') +
      '<main class="results">' +
        '<section class="score-hero">' +
          '<div class="sh-left">' +
            '<div class="eyebrow light">' + I.spark + ' ' + esc(T.title) + ' · complete</div>' +
            '<h1>' + (r.total >= 1400 ? 'Outstanding' : r.total >= 1200 ? 'Great job' : r.total >= 1000 ? 'Nice work' : 'Good effort') + ', ' + esc(firstName()) + '!</h1>' +
            '<p>Here’s your estimated score. Review every question below to learn from your mistakes.</p>' +
            '<div class="sh-actions"><button class="btn white" data-action="copy-result">' + I.copy + ' Copy my result</button>' +
              (CFG.telegram ? '<a class="btn glass" href="' + esc(CFG.telegram) + '" target="_blank" rel="noopener">' + I.send + ' Back to the channel</a>' : '') + '</div>' +
          '</div>' +
          '<div class="sh-score">' +
            '<svg viewBox="0 0 220 220" class="score-ring"><circle cx="110" cy="110" r="94" class="sr-bg"/><circle cx="110" cy="110" r="94" class="sr-fg" style="stroke-dasharray:590.6;stroke-dashoffset:' + (590.6 * (1 - pct)).toFixed(1) + '"/></svg>' +
            '<div class="sr-txt"><small>Estimated score</small><b class="count" data-to="' + r.total + '">' + r.total + '</b><span>out of 1600</span></div>' +
          '</div>' +
        '</section>' +
        '<section class="sec-cards">' + secCard('Reading and Writing', r.rw, r.routes.rw, r.mods.rw1, r.mods.rw2) + secCard('Math', r.math, r.routes.math, r.mods.m1, r.mods.m2) +
          '<div class="sec-card meta"><div class="meta-row"><span>' + I.clock + ' Time used</span><b>' + Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm</b></div>' +
          '<div class="meta-row"><span>' + I.check + ' Correct answers</span><b>' + (r.rwCorrect + r.mathCorrect) + ' / ' + (r.rwTotal + r.mathTotal) + '</b></div>' +
          '<p class="fine"><span>This score is an <b>estimate</b>. The real SAT uses a different scoring model that College Board doesn’t publish.</span></p></div>' +
        '</section>' +
        '<section class="panel"><h2>Skills breakdown</h2><div class="domains">' + domainBars(r) + '</div></section>' +
        '<section class="panel" id="reviewPanel"><div class="panel-head"><h2>Review your answers</h2>' +
          (unlocked ? '<div class="key-legend"><span class="k ok">' + I.check + ' Correct</span><span class="k bad">' + I.cross + ' Incorrect</span><span class="k om">— Omitted</span></div>' : '') + '</div>' +
          (unlocked
            ? '<div class="tabs" role="tablist">' + tabs.map(function (t) { return '<button role="tab" class="tab' + (t[0] === activeTab ? ' on' : '') + '" data-action="res-tab" data-tab="' + t[0] + '" aria-selected="' + (t[0] === activeTab) + '">' + t[1] + '</button>'; }).join('') + '</div><div id="resList">' + resultList(activeTab) + '</div>'
            : '<div class="locked">' + I.lock + '<div><b>Answers and explanations unlock at ' + esc(fmtDateTime(T.closesAt)) + '.</b><p>This keeps the mock fair for everyone still taking it. Come back to this link after it closes.</p></div></div>') +
        '</section>' +
        '<footer class="foot">Unofficial practice test. SAT® is a trademark of College Board, which is not affiliated with this site.</footer>' +
      '</main>';
    paintUpload();
    if (fresh) animateCount();
  }
  function firstName() { var n = (S.student && S.student.name) || 'there'; return n.split(' ')[0]; }
  function secCard(title, score, rt, a, b) {
    return '<div class="sec-card"><div class="sc-top"><span>' + title + '</span><span class="route ' + (rt === 'hard' ? 'hard' : 'easy') + '">' + I.route + ' Module 2: ' + (rt === 'hard' ? 'Harder' : 'Easier') + '</span></div>' +
      '<div class="sc-score">' + score + '<small>/ 800</small></div>' +
      '<div class="sc-bar"><i style="width:' + ((score - 200) / 6).toFixed(1) + '%"></i></div>' +
      '<div class="sc-mods"><div><small>Module 1</small><b>' + a.correct + '/' + a.total + '</b></div><div><small>Module 2</small><b>' + b.correct + '/' + b.total + '</b></div></div></div>';
  }
  function domainBars(r) {
    var order = ['Craft and Structure', 'Information and Ideas', 'Standard English Conventions', 'Expression of Ideas', 'Algebra', 'Advanced Math', 'Problem-Solving and Data Analysis', 'Geometry and Trigonometry'];
    return order.filter(function (d) { return r.domains[d]; }).map(function (d, i) {
      var x = r.domains[d], p = Math.round(x.c / x.t * 100);
      return (i === 0 ? '<h3>Reading and Writing</h3>' : i === 4 ? '<h3>Math</h3>' : '') +
        '<div class="dom"><div class="dom-top"><span>' + d + '</span><b>' + x.c + '/' + x.t + '</b></div><div class="dom-bar"><i class="' + (p >= 75 ? 'hi' : p >= 50 ? 'mid' : 'lo') + '" style="width:' + p + '%"></i></div></div>';
    }).join('');
  }
  function resultList(st) {
    var qs = questionsFor(st), m = S.mods[st] || { answers: {} };
    return '<div class="res-grid">' + qs.map(function (q, i) {
      var a = m.answers[q.id], ans = C.isAnswered(q, a), ok = C.isCorrect(q, a);
      return '<button class="res-cell ' + (ok ? 'ok' : ans ? 'bad' : 'om') + '" data-action="res-open" data-st="' + st + '" data-i="' + i + '" aria-label="Question ' + (i + 1) + ': ' + (ok ? 'correct' : ans ? 'incorrect' : 'omitted') + '"><span>' + (i + 1) + '</span><i>' + (ok ? I.check : ans ? I.cross : '') + '</i></button>';
    }).join('') + '</div>' +
      '<div class="res-rows">' + qs.map(function (q, i) {
        var a = m.answers[q.id], ans = C.isAnswered(q, a), ok = C.isCorrect(q, a);
        return '<button class="res-row" data-action="res-open" data-st="' + st + '" data-i="' + i + '"><span class="rr-n ' + (ok ? 'ok' : ans ? 'bad' : 'om') + '">' + (i + 1) + '</span><span class="rr-d">' + esc(q.domain) + (q.skill ? ' · ' + esc(q.skill) : '') + '</span>' +
          '<span class="rr-a">' + (ans ? 'You: <b>' + esc(a) + '</b>' : '<em>Omitted</em>') + ' · Correct: <b>' + esc(displayKey(q)) + '</b></span>' + I.chevRight + '</button>';
      }).join('') + '</div>';
  }
  function displayKey(q) { if (q.type === 'mcq') return q.answer; var k = Array.isArray(q.answer) ? q.answer[0] : q.answer; var r = C.parseRational(k); if (r && r.d !== 1) { var dec = r.n / r.d; if (String(dec).length <= 6) return k + ' or ' + String(dec).replace(/^0\./, '.').replace(/^-0\./, '-.'); } return k; }

  function openResultQuestion(st, i) {
    var qs = questionsFor(st), q = qs[i], m = S.mods[st] || { answers: {} };
    var a = m.answers[q.id], ans = C.isAnswered(q, a), ok = C.isCorrect(q, a);
    var info = C.STAGE_INFO[st];
    var choices = '';
    if (q.type === 'mcq') {
      choices = '<div class="choices review">' + q.choices.map(function (c, j) {
        var L = 'ABCD'.charAt(j), isKey = L === q.answer, mine = L === a;
        return '<div class="choice-row' + (isKey ? ' key' : '') + (mine && !isKey ? ' wrong' : '') + '"><div class="choice"><span class="letter">' + L + '</span><span class="ctext">' + c + '</span>' +
          (isKey ? '<span class="tag ok">' + I.check + ' Correct</span>' : mine ? '<span class="tag bad">' + I.cross + ' Your answer</span>' : '') + '</div></div>';
      }).join('') + '</div>';
    } else {
      choices = '<div class="spr-review"><div><small>Your answer</small><b class="' + (ok ? 'ok' : ans ? 'bad' : 'om') + '">' + (ans ? esc(a) : '—') + '</b></div><div><small>Correct answer</small><b class="ok">' + esc(displayKey(q)) + '</b></div></div>';
    }
    var head = '<div class="rq-meta"><span class="status ' + (ok ? 'ok' : ans ? 'bad' : 'om') + '">' + (ok ? I.check + ' Correct' : ans ? I.cross + ' Incorrect' : '— Omitted') + '</span><span class="chip">' + esc(q.domain) + '</span>' + (q.skill ? '<span class="chip">' + esc(q.skill) + '</span>' : '') + '</div>';
    var body = head + (q.passage ? '<div class="passage boxed">' + q.passage + '</div>' : '') + '<div class="prompt">' + q.prompt + '</div>' + choices +
      '<div class="explain"><b>' + I.spark + ' Explanation</b><div>' + q.explanation + '</div></div>';
    modal({
      title: esc(info.short) + ' · Question ' + (i + 1),
      body: body,
      cls: 'wide review-modal',
      actions: [{ label: I.chevLeft + ' Previous', action: 'res-prev' }, { label: 'Next ' + I.chevRight, action: 'res-next', kind: 'primary', auto: true }]
    });
    resCursor = { st: st, i: i };
    var prevBtn = $('[data-action="res-prev"]', $layer), nextBtn = $('[data-action="res-next"]', $layer);
    if (prevBtn) prevBtn.disabled = i === 0;
    if (nextBtn) nextBtn.disabled = i === qs.length - 1;
  }
  var resCursor = null;

  function animateCount() {
    var el = $('.count'); if (!el) return;
    var to = +el.getAttribute('data-to'), from = 400, t0 = null, dur = 1100;
    function step(ts) { if (!t0) t0 = ts; var p = Math.min(1, (ts - t0) / dur); var e = 1 - Math.pow(1 - p, 3); el.textContent = Math.round((from + (to - from) * e) / 10) * 10; if (p < 1) requestAnimationFrame(step); else el.textContent = to; }
    if (window.requestAnimationFrame) requestAnimationFrame(step);
  }

  function resultText() {
    var r = S.result;
    return (CFG.brand || 'isatprep') + ' · ' + T.title + '\n' +
      'Estimated score: ' + r.total + ' / 1600\n' +
      'Reading & Writing: ' + r.rw + ' (Module 2: ' + (r.routes.rw === 'hard' ? 'Harder' : 'Easier') + ')\n' +
      'Math: ' + r.math + ' (Module 2: ' + (r.routes.math === 'hard' ? 'Harder' : 'Easier') + ')\n' +
      'Correct: ' + (r.rwCorrect + r.mathCorrect) + '/' + (r.rwTotal + r.mathTotal);
  }
  function copyText(txt) {
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = txt; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { }
      document.body.removeChild(ta);
      toast(ok ? 'Result copied — paste it in the channel!' : 'Couldn’t copy automatically. Take a screenshot instead.', ok ? 'ok' : 'info');
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(function () { toast('Result copied — paste it in the channel!', 'ok'); }, fallback);
    else fallback();
  }

  /* =================================================================== submission (Google Sheet) */
  var submitting = false, retryTimer = null;
  function payload() {
    var r = S.result, ans = {};
    ['rw1', 'rw2', 'm1', 'm2'].forEach(function (st) { var m = S.mods[st] || { answers: {} }; ans[st] = questionsFor(st).map(function (q) { return m.answers[q.id] || ''; }).join(','); });
    return {
      submissionId: S.submission.id, testId: T.id, testTitle: T.title,
      name: S.student ? S.student.name : '', telegram: S.student && S.student.telegram ? '@' + S.student.telegram : '', deviceId: S.deviceId,
      startedAt: new Date(S.startedAt).toISOString(), finishedAt: new Date(S.finishedAt).toISOString(),
      total: r.total, rwScore: r.rw, mathScore: r.math, rwRoute: r.routes.rw, mathRoute: r.routes.math,
      rw1: r.mods.rw1.correct, rw2: r.mods.rw2.correct, m1: r.mods.m1.correct, m2: r.mods.m2.correct,
      minutesUsed: Math.round(r.usedMs / 60000), device: isNarrow() ? 'mobile' : 'desktop', userAgent: navigator.userAgent.slice(0, 180), answers: ans,
      fsExits: FS_OK ? (S.integrity && S.integrity.fsExits) || 0 : 'n/a (phone)', saveExits: (S.integrity && S.integrity.saveExits) || 0
    };
  }
  function trySubmit() {
    if (PREVIEW || !S || S.status !== 'done' || !S.submission) return;
    var sub = S.submission;
    if (!CFG.resultsUrl) { if (sub.status !== 'sent') { sub.status = 'skipped'; save(); paintUpload(); } return; }
    if (sub.status === 'sent' || submitting) return;
    submitting = true; sub.status = 'sending'; sub.tries = (sub.tries || 0) + 1; save(); paintUpload();
    var body = JSON.stringify(payload());
    var ctrl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctrl) ctrl.abort(); }, 30000);
    function done(verified) { clearTimeout(to); submitting = false; sub.status = 'sent'; sub.verified = verified; sub.sentAt = now(); save(); paintUpload(); }
    function failed() {
      clearTimeout(to); submitting = false; sub.status = 'failed'; save(); paintUpload();
      clearTimeout(retryTimer);
      var wait = Math.min(120000, 6000 * Math.pow(1.6, Math.min(8, sub.tries)));
      retryTimer = setTimeout(trySubmit, wait);
    }
    // Plain-text body = no CORS preflight. The sheet replies {"ok":true}; anything else (e.g. "busy") is retried.
    fetch(CFG.resultsUrl, { method: 'POST', body: body, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.text(); })
      .then(function (txt) {
        var j = null; try { j = JSON.parse(txt); } catch (e) { }
        if (j && j.ok) done(true); else failed();
      })
      .catch(function () {
        // The reply couldn't be read. After several tries, fall back to a send whose reply we can't see;
        // the sheet ignores repeats of the same submission, so this can never create duplicate rows.
        if (sub.tries >= 6) {
          fetch(CFG.resultsUrl, { method: 'POST', mode: 'no-cors', body: body }).then(function () { done(false); }, failed);
        } else failed();
      });
  }
  function paintUpload() {
    var el = $('#upload'); if (!el || !S.submission) return;
    var st = S.submission.status;
    var map = {
      sent: ['ok', I.check + ' Result saved'], sending: ['wait', '<span class="spin dark"></span> Saving result…'], pending: ['wait', '<span class="spin dark"></span> Saving result…'],
      failed: ['bad', I.cloud + ' Not sent yet <button class="mini-btn" data-action="retry-upload">Retry</button>'], skipped: ['muted', I.shield + ' Saved on this device']
    };
    var v = map[st] || map.pending;
    el.className = 'upload ' + v[0]; el.innerHTML = v[1];
  }

  /* =================================================================== preview helpers */
  function previewJump(idx) {
    var opts = [['rw1', ''], ['rw2', 'easy'], ['rw2', 'hard'], ['m1', ''], ['m2', 'easy'], ['m2', 'hard'], ['break', ''], ['done', '']];
    var o = opts[idx]; if (!o) return;
    S.gate = null; S.exited = false; stopBreakMusic(); closeLayer();
    if (!S.student) S.student = { name: 'Preview', telegram: '' };
    S.status = 'testing'; S.startedAt = S.startedAt || now();
    if (o[0] === 'rw2') S.routes.rw = o[1];
    if (o[0] === 'm2') S.routes.math = o[1];
    if (o[0] === 'done') {
      ['rw1', 'rw2', 'm1', 'm2'].forEach(function (st) { if (!S.mods[st]) { S.mods[st] = newMod(st); S.mods[st].startedAt = now(); S.mods[st].endsAt = now(); } });
      S.routes.rw = S.routes.rw || 'hard'; S.routes.math = S.routes.math || 'hard';
      S.status = 'done'; S.finishedAt = now(); S.result = computeResult(); S.submission = { id: 'preview', status: 'skipped' };
      return screenResults(true);
    }
    if (o[0] !== 'break') { S.mods[o[0]] = newMod(o[0]); S.mods[o[0]].dirShown = true; }
    enterStage(o[0], { quiet: true });
  }

  /* =================================================================== events */
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!t || t.disabled) return;
    var act = t.getAttribute('data-action');
    var m = S && S.status === 'testing' && S.stage !== 'break' && !S.gate ? curMod() : null;
    switch (act) {
      case 'noop': e.preventDefault(); break;
      case 'layer-close': closeLayer(); break;
      case 'begin': if (pendingStart) { var p = pendingStart; pendingStart = null; enterFullscreen(); closeLayer(); startTest(p.name, p.telegram); } break;
      case 'gate-start': startFromGate(); break;
      case 'save-exit': saveAndExit(); break;
      case 'fs-enter': enterFullscreen(); setTimeout(paintLock, 400); break;
      case 'music': if (Music.on) stopBreakMusic(); else { stopYoutube(); startBreakMusic(); } break;
      case 'music-yt': toggleYoutube(); break;
      case 'choose': if (m) choose(t.getAttribute('data-letter')); break;
      case 'strike': if (m) strike(t.getAttribute('data-letter')); break;
      case 'mark': if (m) toggleMark(); break;
      case 'abc': S.ui.abc = !S.ui.abc; save(); paintAbc(); break;
      case 'nav': openNavigator(); break;
      case 'goto': if (m) goTo(+t.getAttribute('data-i')); break;
      case 'to-review': if (m) { m.view = 'review'; save(); closeLayer(); paintStage(); } break;
      case 'next': if (m) onNext(); break;
      case 'back': if (m) onBack(); break;
      case 'submit-module': if (m) { closeLayer(); submitStage('user'); } break;
      case 'directions': openDirections(); break;
      case 'reference': openReference(); break;
      case 'calc': toggleCalc(); break;
      case 'calc-retry': retryDesmos(); break;
      case 'toggle-timer': S.ui.timerHidden = !S.ui.timerHidden; save(); paintTimerVisibility(); break;
      case 'spr-key': insertSprKey(t.getAttribute('data-key')); break;
      case 'resume': if (S.stage === 'break' && !S.gate && !busy) { enterFullscreen(); stopBreakMusic(); busy = true; try { enterStage('m1'); } finally { busy = false; } } break;
      case 'res-tab': S.ui.resTab = t.getAttribute('data-tab'); save(); $$('.tab').forEach(function (b) { var on = b.getAttribute('data-tab') === S.ui.resTab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }); $('#resList').innerHTML = resultList(S.ui.resTab); break;
      case 'res-open': openResultQuestion(t.getAttribute('data-st'), +t.getAttribute('data-i')); break;
      case 'res-prev': if (resCursor && resCursor.i > 0) openResultQuestion(resCursor.st, resCursor.i - 1); break;
      case 'res-next': if (resCursor && resCursor.i < questionsFor(resCursor.st).length - 1) openResultQuestion(resCursor.st, resCursor.i + 1); break;
      case 'copy-result': copyText(resultText()); break;
      case 'retry-upload': if (S.submission) { S.submission.status = 'pending'; trySubmit(); } break;
      case 'pv-jump': var sel = $('#pvJump'); if (sel) previewJump(+sel.value); break;
    }
  });
  // Keep focus in the answer box when tapping the − / . buttons (mobile keyboards stay open).
  document.addEventListener('mousedown', function (e) { if (e.target.closest && e.target.closest('[data-action="spr-key"]')) e.preventDefault(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $layer.classList.contains('open')) { closeLayer(); return; }
    var ch = e.target.closest ? e.target.closest('.choice[data-action="choose"]') : null;
    if (ch && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); choose(ch.getAttribute('data-letter')); }
  });
  window.addEventListener('beforeunload', function (e) {
    if (!PREVIEW && S && S.status === 'testing' && !S.gate) { save(); e.preventDefault(); e.returnValue = ''; return ''; }
  });
  window.addEventListener('pagehide', function () { save(); });
  window.addEventListener('popstate', function () {
    if (S && S.status === 'testing' && !S.gate && !PREVIEW) {
      try { history.pushState({ isat: 1 }, ''); } catch (e) { }
      toast('Use the Back and Next buttons at the bottom to move between questions.', 'info', 4000);
    }
  });
  window.addEventListener('resize', function () { if (D.calc && S && S.ui && S.ui.calcOpen) try { D.calc.resize(); } catch (e) { } });
  window.addEventListener('error', function (ev) {
    if (!S || S.status !== 'testing') return;
    // Only react to errors from this site's own code (ignore third-party scripts such as the calculator).
    if (!ev || !ev.filename || ev.filename.indexOf(window.location.origin) !== 0 || ev.filename.indexOf('/js/') === -1) return;
    try { save(); } catch (x) { }
    if ($('.crash')) return;
    var d = document.createElement('div'); d.className = 'crash';
    d.innerHTML = '<div><b>Something went wrong.</b> Your answers are saved. <button class="btn primary" onclick="location.reload()">Reload</button></div>';
    document.body.appendChild(d);
    console.error(ev.error || ev.message);
  });

  function choose(L) {
    var m = curMod(); if (!m || m.submittedAt || m.view !== 'q') return;
    var q = curQs()[m.cur]; if (q.type !== 'mcq') return;
    if (m.struck[q.id] && m.struck[q.id][L]) delete m.struck[q.id][L];
    m.answers[q.id] = L;
    save();
    paintChoices(q, m);
    paintBottomCounts();
  }
  function strike(L) {
    var m = curMod(); if (!m || m.submittedAt) return;
    var q = curQs()[m.cur];
    var st = m.struck[q.id] || (m.struck[q.id] = {});
    if (st[L]) delete st[L]; else { st[L] = 1; if (m.answers[q.id] === L) delete m.answers[q.id]; }
    save();
    paintChoices(q, m);
    paintBottomCounts();
  }
  function paintChoices(q, m) {
    var a = m.answers[q.id], st = m.struck[q.id] || {};
    $$('.choice-row').forEach(function (row) {
      var L = row.getAttribute('data-letter'), sel = a === L, x = !!st[L];
      row.classList.toggle('selected', sel); row.classList.toggle('struck', x);
      var c = $('.choice', row); c.setAttribute('aria-checked', sel ? 'true' : 'false');
      var b = $('.strike', row); b.innerHTML = x ? '<u>Undo</u>' : '<span class="strike-l">' + L + '</span>';
      b.setAttribute('aria-label', (x ? 'Undo cross-out of choice ' : 'Cross out choice ') + L);
    });
  }
  function paintAbc() {
    var b = $('.abc-btn'); if (b) { b.classList.toggle('on', !!S.ui.abc); b.setAttribute('aria-pressed', S.ui.abc ? 'true' : 'false'); b.innerHTML = abcIcon(S.ui.abc); }
    var c = $('.choices'); if (c) c.classList.toggle('abc-mode', !!S.ui.abc);
  }
  function toggleMark() {
    var m = curMod(), q = curQs()[m.cur];
    if (m.marked[q.id]) delete m.marked[q.id]; else m.marked[q.id] = 1;
    save();
    var b = $('.mark-btn'); if (b) { var on = !!m.marked[q.id]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.innerHTML = (on ? I.bookmarkOn : I.bookmark) + '<span>Mark for Review</span>'; }
  }

  boot();
})();
