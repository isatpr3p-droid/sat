/* isatprep · 1v1 Battle (vs Bot)
   Same look as Practice Mode (css/app.css + css/practice.css + css/battle.css) and the same 355-question bank.
   Both players get the same questions; the bot "answers" with a speed and accuracy that match its level.
   Scoring: correct = 100 + up to 50 speed bonus; wrong or no answer = 0. The first answer locks in.
   A battle in progress is saved, so a refresh continues where it stopped (timers use absolute times). */
(function () {
  'use strict';
  var C = window.SATCore;
  var CFG = window.SAT_CONFIG || {};
  var BANK = window.PRACTICE_BANK = window.PRACTICE_BANK || {};
  var $app = document.getElementById('app'), $layer = document.getElementById('layer'), $toasts = document.getElementById('toasts');
  var BANK_VER = (document.querySelector('meta[name="bank-version"]') || {}).content || '1';

  /* =================================================================== settings */
  var SEC = { rw: { name: 'Reading & Writing', short: 'R&W' }, math: { name: 'Math', short: 'Math' } };
  var DIFF = { E: 'Easy', M: 'Medium', H: 'Hard' };
  var LIMIT = { rw: { E: 50, M: 70, H: 90 }, math: { E: 70, M: 95, H: 120 } };          // seconds per question (same as Rush)
  var FORMATS = {
    rw: { name: 'Reading & Writing', n: 5, mix: [['rw', 5]], blurb: '5 questions' },
    math: { name: 'Math', n: 10, mix: [['math', 10]], blurb: '10 questions' },
    mixed: { name: 'Mixed', n: 8, mix: [['rw', 4], ['math', 4]], blurb: '8 questions · 4 + 4' }
  };
  var BOTS = {
    rookie: { name: 'Rookie', level: 'Easy', acc: 0.55, t: [0.55, 0.95], skip: 0.08, dist: { E: 0.6, M: 0.3, H: 0.1 }, tag: 'Learns fast, still makes mistakes.' },
    ace: { name: 'Ace', level: 'Medium', acc: 0.72, t: [0.4, 0.8], skip: 0.03, dist: { E: 0.3, M: 0.45, H: 0.25 }, tag: 'Solid and steady. Beat it to prove you’re ready.' },
    legend: { name: 'Legend', level: 'Hard', acc: 0.88, t: [0.25, 0.6], skip: 0, dist: { E: 0.15, M: 0.4, H: 0.45 }, tag: 'Fast and rarely wrong. Good luck.' }
  };
  var ADJ = { E: 0.12, M: 0, H: -0.15 };            // the bot finds easy questions easier, like everyone
  var KEY = 'isatprep:battle:v1', STATS = 'isatprep:battle:stats', RECENT = 'isatprep:battle:recent';
  var KHEX = '3ecfa63da7d6047e8b1b5b694cac2db0bc8f1335bbf514537a0acf2ac2bf13b0';

  /* =================================================================== utilities */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function now() { return Date.now(); }
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function fmtS(ms) { var s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + s % 60; }
  function renderMath(el) {
    if (!el || !window.renderMathInElement) return;
    try { window.renderMathInElement(el, { delimiters: [{ left: '\\(', right: '\\)', display: false }, { left: '\\[', right: '\\]', display: true }], throwOnError: false, ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'input'] }); } catch (e) { }
  }
  var Store = (function () {
    var ok = false, mem = {};
    try { var k = '__isat_probe__'; localStorage.setItem(k, '1'); localStorage.removeItem(k); ok = true; } catch (e) { }
    return {
      get: function (k) { try { return ok ? localStorage.getItem(k) : (k in mem ? mem[k] : null); } catch (e) { return k in mem ? mem[k] : null; } },
      set: function (k, v) { mem[k] = v; if (!ok) return; try { localStorage.setItem(k, v); } catch (e) { } },
      del: function (k) { delete mem[k]; try { if (ok) localStorage.removeItem(k); } catch (e) { } }
    };
  })();
  function getJSON(k, d) { try { var v = JSON.parse(Store.get(k)); return v == null ? d : v; } catch (e) { return d; } }
  function setJSON(k, v) { Store.set(k, JSON.stringify(v)); }
  var KB = (function () { var a = []; for (var i = 0; i < KHEX.length; i += 2) a.push(parseInt(KHEX.substr(i, 2), 16)); return a; })();
  var keyCache = {};
  function keyOf(sec, q) {
    var ck = sec + q.n; if (ck in keyCache) return keyCache[ck];
    var bin = atob(q.k), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) ^ KB[i % KB.length];
    var s = new TextDecoder('utf-8').decode(bytes);
    return (keyCache[ck] = q.t === 'mcq' ? s : JSON.parse(s));
  }
  function isRight(sec, q, a) { if (a == null || a === '') return false; var k = keyOf(sec, q); return q.t === 'mcq' ? a === k : C.isSprCorrect(a, k); }
  function keyText(sec, q) { var k = keyOf(sec, q); return q.t === 'mcq' ? k : k.join(' or '); }
  function theme() { return Store.get('isatprep:theme') === 'dark' ? 'dark' : 'light'; }
  function applyTheme() { document.documentElement.setAttribute('data-theme', theme()); }
  function themeBtn(cls) { var d = theme() === 'dark'; return '<button class="' + cls + '" data-action="theme" aria-label="' + (d ? 'Switch to light mode' : 'Switch to night mode') + '">' + (d ? I.sun : I.moon) + '<span>' + (d ? 'Light' : 'Night') + '</span></button>'; }
  function toggleTheme() {
    Store.set('isatprep:theme', theme() === 'dark' ? 'light' : 'dark'); applyTheme();
    $$('[data-action="theme"]').forEach(function (b) { var d = theme() === 'dark'; b.innerHTML = (d ? I.sun : I.moon) + '<span>' + (d ? 'Light' : 'Night') + '</span>'; });
  }

  /* =================================================================== icons */
  var I = {
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    cross: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    chevRight: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevLeft: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    calc: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="2.5" width="15" height="19" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="7.5" y="5.5" width="9" height="4" rx="1" fill="currentColor"/><circle cx="8.5" cy="13" r="1.2" fill="currentColor"/><circle cx="12" cy="13" r="1.2" fill="currentColor"/><circle cx="15.5" cy="13" r="1.2" fill="currentColor"/><circle cx="8.5" cy="17" r="1.2" fill="currentColor"/><circle cx="12" cy="17" r="1.2" fill="currentColor"/><circle cx="15.5" cy="17" r="1.2" fill="currentColor"/></svg>',
    ref: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.5h10l4 4v13H5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 11h8M8 14.5h8M8 18h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    swords: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M9.5 6.5L13 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20.5h7M10 17h4l.5 3.5h-5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" fill="currentColor"/></svg>',
    book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z" fill="currentColor"/></svg>',
    redo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8.5A7.5 7.5 0 1 0 19.5 15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M19.5 4v5h-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 11v6M12 7.5v.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
  };
  function botFace(id, size) {
    var c = { rookie: ['#19a974', '#e3f6e8'], ace: ['#e9a21a', '#fdf1cc'], legend: ['#e0484d', '#fbe1e1'] }[id];
    var eyes = id === 'legend' ? '<path d="M13 21l5 2M27 21l-5 2" stroke="' + c[0] + '" stroke-width="2.4" stroke-linecap="round"/><circle cx="16" cy="25" r="2.6" fill="' + c[0] + '"/><circle cx="24" cy="25" r="2.6" fill="' + c[0] + '"/>'
      : '<circle cx="15.5" cy="24" r="2.8" fill="' + c[0] + '"/><circle cx="24.5" cy="24" r="2.8" fill="' + c[0] + '"/>';
    var mouth = id === 'rookie' ? '<path d="M16 30c2.5 2 5.5 2 8 0" fill="none" stroke="' + c[0] + '" stroke-width="2.2" stroke-linecap="round"/>' : id === 'ace' ? '<path d="M16 30.5h8" stroke="' + c[0] + '" stroke-width="2.2" stroke-linecap="round"/>' : '<path d="M15.5 31c3-1.6 6-1.6 9 0" fill="none" stroke="' + c[0] + '" stroke-width="2.2" stroke-linecap="round"/>';
    return '<svg class="bot-face" viewBox="0 0 40 40" width="' + (size || 40) + '" height="' + (size || 40) + '" aria-hidden="true"><rect width="40" height="40" rx="12" fill="' + c[1] + '"/><path d="M20 6v5" stroke="' + c[0] + '" stroke-width="2.4" stroke-linecap="round"/><circle cx="20" cy="5.5" r="2.4" fill="' + c[0] + '"/>' +
      '<rect x="8" y="12" width="24" height="23" rx="7" fill="#fff" stroke="' + c[0] + '" stroke-width="2.4"/>' + eyes + mouth + '</svg>';
  }
  function youFace(name, size) {
    var ini = (String(name || 'You').trim().charAt(0) || 'Y').toUpperCase();
    return '<span class="you-face" style="width:' + (size || 40) + 'px;height:' + (size || 40) + 'px">' + esc(ini) + '</span>';
  }

  /* =================================================================== layer / toast */
  function openLayer(html) { closeLayer(); $layer.innerHTML = '<div class="scrim" data-action="layer-close"></div>' + html; $layer.classList.add('open'); renderMath($layer); }
  function closeLayer() { if (!$layer.classList.contains('open')) return; $layer.classList.remove('open'); $layer.innerHTML = ''; }
  function modal(o) {
    var acts = (o.actions || []).map(function (a) { return '<button class="btn ' + (a.kind || 'ghost') + '" data-action="' + a.action + '">' + a.label + '</button>'; }).join('');
    openLayer('<div class="modal ' + (o.cls || '') + '" role="dialog" aria-modal="true" tabindex="-1"><div class="modal-head"><h2>' + o.title + '</h2><button class="icon-btn" data-action="layer-close" aria-label="Close">' + I.close + '</button></div>' +
      '<div class="modal-body">' + o.body + '</div>' + (acts ? '<div class="modal-foot">' + acts + '</div>' : '') + '</div>');
  }
  function toast(msg) {
    var el = document.createElement('div'); el.className = 'toast info'; el.innerHTML = '<span class="toast-ico">' + I.info + '</span><span>' + esc(msg) + '</span>';
    $toasts.appendChild(el); setTimeout(function () { el.classList.add('show'); }, 10);
    setTimeout(function () { el.classList.remove('show'); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 400); }, 3200);
  }
  function wordmark() {
    return '<span class="wm-mark" aria-hidden="true"><svg viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="url(#wmg)"/><defs><linearGradient id="wmg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f5df0"/><stop offset="1" stop-color="#7a3cf0"/></linearGradient></defs><circle cx="16" cy="9" r="2.6" fill="#fff"/><rect x="13.6" y="13.2" width="4.8" height="11.5" rx="2.4" fill="#fff"/></svg></span><span class="wm-text">' + esc(CFG.brand || 'isatprep') + '</span>';
  }

  /* =================================================================== bank */
  var loading = {};
  function loadBank(sec, cb) {
    if (BANK[sec]) return cb(true);
    if (loading[sec]) { loading[sec].push(cb); return; }
    loading[sec] = [cb];
    var s = document.createElement('script');
    s.src = 'practice/bank-' + sec + '.js?v=' + BANK_VER;
    s.onload = function () { var w = loading[sec]; loading[sec] = null; w.forEach(function (f) { f(!!BANK[sec]); }); };
    s.onerror = function () { var w = loading[sec]; loading[sec] = null; if (s.parentNode) s.parentNode.removeChild(s); w.forEach(function (f) { f(false); }); };
    document.head.appendChild(s);
  }
  function loadBanks(secs, cb) {
    var left = secs.length, okAll = true;
    secs.forEach(function (s) { loadBank(s, function (ok) { okAll = okAll && ok; if (--left === 0) cb(okAll); }); });
  }
  function qOf(item) { return (BANK[item.sec] || [])[item.n - 1]; }

  /* =================================================================== state */
  var B = getJSON(KEY, null);          // the battle in progress (or just finished)
  var S = getJSON(STATS, {});          // { rookie: {w,l,d}, ... }
  var choice = { fmt: Store.get('isatprep:battle:fmt') || 'mixed', bot: Store.get('isatprep:battle:bot') || 'ace' };
  if (!FORMATS[choice.fmt]) choice.fmt = 'mixed';
  if (!BOTS[choice.bot]) choice.bot = 'ace';
  function saveB() { setJSON(KEY, B); }
  function record(id) { var r = S[id] || { w: 0, l: 0, d: 0 }; return r; }
  function playerName() { return Store.get('isatprep:name') || ''; }

  // Pick questions: the bot's level sets the difficulty mix; questions seen in recent battles are skipped.
  function pickQuestions(fmtId, botId) {
    var recent = getJSON(RECENT, []), seen = {}; recent.forEach(function (id) { seen[id] = 1; });
    var dist = BOTS[botId].dist, out = [];
    FORMATS[fmtId].mix.forEach(function (m) {
      var sec = m[0], need = m[1], pool = (BANK[sec] || []).slice(), picked = [];
      for (var i = 0; i < need; i++) {
        var r = Math.random(), d = r < dist.E ? 'E' : r < dist.E + dist.M ? 'M' : 'H';
        var cand = pool.filter(function (q) { return q.d === d && !seen[q.id]; });
        if (!cand.length) cand = pool.filter(function (q) { return !seen[q.id]; });
        if (!cand.length) cand = pool;
        var q = cand[Math.floor(Math.random() * cand.length)];
        picked.push({ sec: sec, n: q.n }); seen[q.id] = 1;
        pool = pool.filter(function (x) { return x.id !== q.id; });
      }
      out.push(picked);
    });
    var list = [];
    if (out.length === 1) list = out[0];
    else { for (var j = 0; j < Math.max(out[0].length, out[1].length); j++) { if (out[0][j]) list.push(out[0][j]); if (out[1][j]) list.push(out[1][j]); } }  // R&W, Math, R&W, Math…
    return list;
  }
  function botAttempt(botId, sec, q, limitMs) {
    var bot = BOTS[botId];
    if (Math.random() < bot.skip) return { ms: limitMs + 1, ok: false, a: null };   // ran out of time
    var p = Math.max(0.15, Math.min(0.97, bot.acc + ADJ[q.d]));
    var ok = Math.random() < p, ms = Math.round(limitMs * rnd(bot.t[0], bot.t[1]));
    var a = null;
    if (q.t === 'mcq') { var k = keyOf(sec, q); if (ok) a = k; else { var wrong = 'ABCD'.split('').filter(function (L) { return L !== k; }); a = wrong[Math.floor(Math.random() * 3)]; } }
    return { ms: ms, ok: ok, a: a };
  }
  function points(ok, ms, limitMs) { return ok ? 100 + Math.round(50 * Math.max(0, limitMs - ms) / limitMs) : 0; }
  function limitOf(item) { var q = qOf(item); return LIMIT[item.sec][q.d] * 1000; }
  function totals() {
    var y = 0, b = 0, yc = 0, bc = 0;
    (B.rounds || []).forEach(function (r) { if (!r || !r.done) return; y += r.pts; b += r.bot.pts; if (r.ok) yc++; if (r.bot.ok) bc++; });
    return { y: y, b: b, yc: yc, bc: bc };
  }

  /* =================================================================== start screen */
  function screenStart() {
    stopTicker();
    $app.className = 'app page';
    var name = playerName(), live = B && B.status === 'live';
    $app.innerHTML = '<header class="brandbar"><a class="wordmark" href="practice.html">' + wordmark() + '</a><div class="rb-actions">' + themeBtn('theme-pill') + '<a class="btn ghost" href="practice.html">' + I.book + ' Practice</a></div></header>' +
      '<main class="welcome">' +
      '<section class="hero">' +
        '<div class="hero-copy">' +
          '<div class="eyebrow">' + I.swords + ' 1v1 Battle</div>' +
          '<h1>Battle a bot</h1>' +
          '<div class="chips"><span>' + I.bolt + ' Same questions for both</span><span>' + I.clock + ' A timer on every question</span><span>' + I.trophy + ' Speed counts</span></div>' +
          '<div class="rules-card"><h2>How it works</h2><ol class="rule-list">' +
            rule(I.swords, 'Pick a subject and an opponent', 'Reading & Writing (5 questions), Math (10) or Mixed (8).') +
            rule(I.check, 'Your first answer locks in', 'No second tries in a battle. Read carefully, then lock it in.') +
            rule(I.bolt, 'Correct = 100 + speed bonus', 'Up to 50 extra points for answering fast. Wrong or no answer = 0.') +
            rule(I.trophy, 'Most points wins', 'See every explanation at the end, then go for a rematch.') +
          '</ol></div>' +
        '</div>' +
        '<form class="start-card" id="bForm" novalidate>' +
          (live ? '<div class="resume-card"><div><b>Battle in progress</b><span>vs ' + BOTS[B.bot].name + ' · ' + FORMATS[B.fmt].name + ' · question ' + Math.min(B.i + 1, B.list.length) + ' of ' + B.list.length + '</span></div><button type="button" class="btn primary" data-action="resume">Continue</button></div>' : '') +
          '<h2>Set up your battle</h2>' +
          (name ? '' : '<label class="field"><span>Your name</span><input id="bName" type="text" maxlength="40" autocomplete="name" placeholder="e.g. Aziza"></label>') +
          '<span class="field-lbl">Subject</span><div class="fmt-pick">' + Object.keys(FORMATS).map(function (id) {
            var f = FORMATS[id]; return '<button type="button" class="fmt-card' + (choice.fmt === id ? ' on' : '') + '" data-action="pick-fmt" data-id="' + id + '"><b>' + f.name + '</b><small>' + f.blurb + '</small></button>';
          }).join('') + '</div>' +
          '<span class="field-lbl">Opponent</span><div class="bot-pick">' + Object.keys(BOTS).map(function (id) {
            var b = BOTS[id], r = record(id);
            return '<button type="button" class="bot-card' + (choice.bot === id ? ' on' : '') + '" data-action="pick-bot" data-id="' + id + '">' + botFace(id, 44) +
              '<span class="bc-txt"><b>' + b.name + ' <em class="lvl ' + id + '">' + b.level + '</em></b><small>' + b.tag + '</small></span>' +
              '<span class="bc-rec" title="Your record against ' + b.name + '"><b>' + r.w + '–' + r.l + (r.d ? '–' + r.d : '') + '</b><small>W–L</small></span></button>';
          }).join('') + '</div>' +
          '<p class="field-err" id="bErr" hidden></p>' +
          '<button class="btn primary big block" type="submit">' + I.swords + ' Start battle</button>' +
          '<p class="fine">' + I.info + '<span>Math questions come with the Desmos calculator and the reference sheet, like the real test.</span></p>' +
        '</form>' +
      '</section>' +
      '<footer class="foot">Unofficial practice. SAT® is a trademark of College Board, which is not affiliated with this site.</footer>' +
      '</main>';
    $('#bForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var nIn = $('#bName');
      if (nIn) { var nm = nIn.value.trim().replace(/\s+/g, ' '); if (nm.length < 2) { var er = $('#bErr'); er.textContent = 'Please enter your name (at least 2 letters).'; er.hidden = false; nIn.focus(); return; } Store.set('isatprep:name', nm.slice(0, 40)); }
      if (live) { modal({ title: 'Start a new battle?', cls: 'narrow', body: '<p>Your battle against <b>' + BOTS[B.bot].name + '</b> isn’t finished. Starting a new one ends it without a result.</p>', actions: [{ label: 'Continue old battle', action: 'resume' }, { label: 'Start new battle', action: 'start-new', kind: 'primary' }] }); return; }
      startBattle();
    });
  }
  function rule(ic, t, d) { return '<li><span class="rl-ico">' + ic + '</span><div><b>' + t + '</b><p>' + d + '</p></div></li>'; }

  function startBattle() {
    closeLayer();
    var f = FORMATS[choice.fmt], secs = f.mix.map(function (m) { return m[0]; });
    $app.className = 'app page'; $app.innerHTML = '<div class="boot"><div class="boot-mark"></div><p>Finding questions…</p></div>';
    loadBanks(secs, function (ok) {
      if (!ok) { $app.innerHTML = '<div class="boot"><p>Couldn’t load the questions. Check your connection.</p><button class="btn primary" onclick="location.reload()">Try again</button></div>'; return; }
      var list = pickQuestions(choice.fmt, choice.bot);
      B = { v: 1, fmt: choice.fmt, bot: choice.bot, list: list, i: 0, rounds: [], status: 'live', startedAt: now(), qStart: 0 };
      var recent = getJSON(RECENT, []).concat(list.map(function (it) { return qOf(it).id; })).slice(-150); setJSON(RECENT, recent);
      saveB(); countdownThen(function () { beginQuestion(); });
    });
  }
  function resumeBattle() {
    closeLayer();
    var secs = {}; B.list.forEach(function (it) { secs[it.sec] = 1; });
    $app.className = 'app page'; $app.innerHTML = '<div class="boot"><div class="boot-mark"></div><p>Loading your battle…</p></div>';
    loadBanks(Object.keys(secs), function (ok) {
      if (!ok) { $app.innerHTML = '<div class="boot"><p>Couldn’t load the questions.</p><button class="btn primary" onclick="location.reload()">Try again</button></div>'; return; }
      if (B.status === 'done') return screenResult();
      var r = B.rounds[B.i];
      if (!r || !B.qStart) beginQuestion(); else screenBattle();
    });
  }
  function countdownThen(cb) {
    $app.className = 'app page';
    var bot = BOTS[B.bot], name = playerName() || 'You';
    $app.innerHTML = '<main class="vs-screen"><div class="vs-card"><div class="vs-side">' + youFace(name, 72) + '<b>' + esc(name.split(' ')[0]) + '</b></div><div class="vs-mid"><span>VS</span><b id="vsCount">3</b></div>' +
      '<div class="vs-side">' + botFace(B.bot, 72) + '<b>' + bot.name + '</b></div></div><p class="vs-sub">' + FORMATS[B.fmt].name + ' · ' + B.list.length + ' questions</p></main>';
    var n = 3, el = $('#vsCount');
    var iv = setInterval(function () { n--; if (n > 0) { el.textContent = n; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); } else { clearInterval(iv); cb(); } }, 800);
  }

  /* =================================================================== battle screen */
  var view = { ticker: null, pending: null, revealTimer: null, calcOpen: false };
  function curItem() { return B.list[B.i]; }
  function beginQuestion() {
    var it = curItem(), q = qOf(it), lim = limitOf(it);
    B.qStart = now();
    B.rounds[B.i] = { done: false, a: null, ok: false, pts: 0, ms: 0, bot: botAttempt(B.bot, it.sec, q, lim) };
    B.rounds[B.i].bot.pts = points(B.rounds[B.i].bot.ok && B.rounds[B.i].bot.ms <= lim, B.rounds[B.i].bot.ms, lim);
    if (B.rounds[B.i].bot.ms > lim) B.rounds[B.i].bot.ok = false;
    saveB(); view.pending = null; screenBattle();
  }
  function screenBattle() {
    var it = curItem(), q = qOf(it), sec = it.sec, r = B.rounds[B.i], name = playerName() || 'You', bot = BOTS[B.bot], tt = totals();
    var isMath = sec === 'math';
    $app.className = 'app test practice battle ' + (isMath ? 'math' : 'rw') + (view.calcOpen && isMath ? ' calc-open' : '');
    $app.innerHTML =
      '<header class="tb btb">' +
        '<div class="tb-left"><button class="icon-btn" data-action="quit" aria-label="Quit battle" title="Quit">' + I.close + '</button><span class="btb-fmt">' + FORMATS[B.fmt].name + '</span></div>' +
        '<div class="tb-center"><div class="scoreboard">' +
          '<div class="sb-side you">' + youFace(name, 34) + '<div><small>' + esc(name.split(' ')[0]) + '</small><b id="sbYou">' + tt.y + '</b></div></div>' +
          '<div class="sb-mid"><div class="sb-dots">' + B.list.map(function (x, k) { var rr = B.rounds[k]; return '<i class="' + (k === B.i ? 'cur ' : '') + (rr && rr.done ? (rr.ok ? 'ok' : 'bad') : '') + '"></i>'; }).join('') + '</div>' +
            '<div class="sb-dots bot">' + B.list.map(function (x, k) { var rr = B.rounds[k]; return '<i class="' + (rr && rr.done ? (rr.bot.ok ? 'ok' : 'bad') : '') + '"></i>'; }).join('') + '</div></div>' +
          '<div class="sb-side bot"><div><small>' + bot.name + '</small><b id="sbBot">' + tt.b + '</b></div>' + botFace(B.bot, 34) + '</div>' +
        '</div></div>' +
        '<div class="tb-right">' + (isMath ? '<button class="tool" data-action="calc" aria-pressed="' + view.calcOpen + '">' + I.calc + '<span>Calculator</span></button><button class="tool" data-action="reference">' + I.ref + '<span>Reference</span></button>' : '') + themeBtn('tool theme-tool') + '</div>' +
      '</header>' +
      '<div class="tb-rule" aria-hidden="true"></div>' +
      '<div class="work">' +
        (isMath ? '<aside class="calc-dock" id="calcDock" aria-label="Desmos graphing calculator"><div class="calc-head"><b>' + I.calc + ' Calculator</b><button class="icon-btn" data-action="calc" aria-label="Close calculator">' + I.close + '</button></div><div class="calc-body" id="calcBody"></div></aside>' : '') +
        '<main class="stage" id="stage"></main>' +
      '</div>';
    var head = '<div class="qhead bq-head"><div class="qnum">' + (B.i + 1) + '</div><span class="bq-of">of ' + B.list.length + '</span>' +
      '<span class="dtag ' + q.d.toLowerCase() + '"><i></i>' + DIFF[q.d] + '</span><span class="sktag">' + SEC[sec].short + ' · ' + esc(q.sk) + '</span>' +
      '<div class="bq-timer" id="bqTimer"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" class="rc-bg"/><circle cx="20" cy="20" r="17" class="rc-fg" id="bqFg"/></svg><b id="bqTxt"></b></div></div>';
    var body = head + '<div class="prompt">' + q.q + '</div><div id="answerArea"></div><div id="roundBox"></div>';
    var stage = $('#stage');
    if (sec === 'rw') { stage.className = 'stage split'; stage.innerHTML = '<section class="pane passage-pane"><div class="passage">' + q.p + '</div></section><div class="divider" aria-hidden="true"></div><section class="pane question-pane" id="qPane">' + body + '</section>'; }
    else { stage.className = 'stage single'; stage.innerHTML = '<section class="pane question-pane math-pane" id="qPane"><div class="math-col">' + body + '</div></section>'; }
    paintAnswer(); paintRound(); renderMath(stage);
    if (isMath && view.calcOpen) mountDesmos();
    startTicker(); tick();
  }
  function paintAnswer() {
    var it = curItem(), q = qOf(it), sec = it.sec, r = B.rounds[B.i], box = $('#answerArea'), done = r.done, key = done ? keyOf(sec, q) : null;
    var mine = done ? r.a : view.pending;
    if (q.t === 'mcq') {
      box.innerHTML = '<div class="choices' + (done ? ' review' : '') + '" role="radiogroup" aria-label="Answer choices">' + q.c.map(function (c, i) {
        var L = 'ABCD'.charAt(i), sel = mine === L, isKey = done && L === key, wrong = done && sel && !isKey, botHere = done && r.bot.a === L;
        return '<div class="choice-row' + (sel && !done ? ' selected' : '') + (isKey ? ' key' : '') + (wrong ? ' wrong' : '') + '"><div class="choice" role="radio" tabindex="0" aria-checked="' + sel + '" data-action="choose" data-letter="' + L + '"><span class="letter">' + L + '</span><span class="ctext">' + c + '</span>' +
          '<span class="ctags">' + (done && sel ? '<span class="who-tag you">' + (isKey ? I.check : I.cross) + ' You</span>' : '') + (botHere ? '<span class="who-tag bot ' + (isKey ? 'ok' : 'bad') + '">' + BOTS[B.bot].name + '</span>' : '') + (isKey && !sel ? '<span class="tag ok">' + I.check + ' Correct</span>' : '') + '</span></div></div>';
      }).join('') + '</div>';
    } else if (done) {
      box.innerHTML = '<div class="spr-review"><div><small>Your answer</small><b class="' + (r.ok ? 'ok' : r.a ? 'bad' : 'om') + '">' + (r.a ? esc(r.a) : '—') + '</b></div><div><small>Correct answer</small><b class="ok">' + esc(keyText(sec, q)) + '</b></div></div>';
    } else {
      box.innerHTML = '<div class="spr"><label class="spr-label" for="sprIn">Your answer</label><div class="spr-row"><input id="sprIn" class="spr-input" type="text" inputmode="decimal" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" maxlength="6" value="' + esc(mine || '') + '">' +
        '<div class="spr-keys"><button type="button" class="key" data-action="spr-key" data-key="-" aria-label="Negative sign">−</button><button type="button" class="key" data-action="spr-key" data-key="/" aria-label="Fraction bar">/</button><button type="button" class="key" data-action="spr-key" data-key="." aria-label="Decimal point">.</button></div></div><div class="spr-preview" id="sprPrev"></div></div>';
      var inp = $('#sprIn'), prev = $('#sprPrev');
      var paintPrev = function () { var p = C.sprPreview(inp.value); prev.innerHTML = p.kind === 'ok' ? '<span class="muted">Answer preview: </span><span class="pv">\\(' + p.tex + '\\)</span>' : p.kind === 'invalid' ? '<span class="muted">Answer preview: </span><span class="bad">not a complete number yet</span>' : '<span class="muted">Answer preview will appear here</span>'; renderMath(prev); };
      var commit = function () { var c = C.sanitizeSpr(inp.value); if (c !== inp.value) inp.value = c; view.pending = c || null; paintLock(); paintPrev(); };
      inp.addEventListener('input', commit);
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (view.pending) lockIn(); } });
      view.sprCommit = commit; paintPrev();
    }
  }
  function paintRound() {
    var it = curItem(), q = qOf(it), sec = it.sec, r = B.rounds[B.i], box = $('#roundBox'), bot = BOTS[B.bot];
    if (!r.done) {
      var botIn = now() - B.qStart >= r.bot.ms && r.bot.ms <= limitOf(it);
      box.innerHTML = '<div class="lock-row"><button class="btn primary big" id="lockBtn" data-action="lock">' + I.check + ' Lock in answer</button>' +
        '<span class="bot-status" id="botStatus">' + botFace(B.bot, 26) + '<span>' + (botIn ? bot.name + ' has answered' : bot.name + ' is thinking<i class="dots"><b></b><b></b><b></b></i>') + '</span></span></div>';
      paintLock(); return;
    }
    var last = B.i === B.list.length - 1;
    var you = r.a == null ? '<span class="rr-res to">' + I.clock + ' No answer</span>' : r.ok ? '<span class="rr-res ok">' + I.check + ' Correct</span>' : '<span class="rr-res bad">' + I.cross + ' Wrong</span>';
    var bres = r.bot.ms > limitOf(it) ? '<span class="rr-res to">' + I.clock + ' No answer</span>' : r.bot.ok ? '<span class="rr-res ok">' + I.check + ' Correct</span>' : '<span class="rr-res bad">' + I.cross + ' Wrong</span>';
    box.innerHTML = '<div class="round-card">' +
      '<div class="rc-side">' + youFace(playerName() || 'You', 30) + '<div><small>You · ' + (r.a == null ? 'time ran out' : fmtS(r.ms)) + '</small>' + you + '</div><b class="rc-pts">+' + r.pts + '</b></div>' +
      '<div class="rc-side">' + botFace(B.bot, 30) + '<div><small>' + bot.name + ' · ' + (r.bot.ms > limitOf(it) ? 'time ran out' : fmtS(r.bot.ms)) + '</small>' + bres + '</div><b class="rc-pts">+' + r.bot.pts + '</b></div>' +
      '</div>' +
      (view.showX ? '<div class="explain"><b>' + I.spark + ' Explanation</b><div>' + q.x + '</div></div>' : '') +
      '<div class="fb-actions">' + (view.showX ? '' : '<button class="btn ghost" data-action="show-x">' + I.spark + ' Show explanation</button>') +
      '<button class="btn primary" data-action="next-q">' + (last ? I.trophy + ' See results' : 'Next question ' + I.chevRight) + '</button></div>';
    renderMath(box);
  }
  function paintLock() { var b = $('#lockBtn'); if (b) b.disabled = !view.pending; }
  function choose(L) {
    var r = B.rounds[B.i]; if (r.done) return;
    view.pending = L;
    $$('.choice-row').forEach(function (row) { var on = row.querySelector('[data-letter]').getAttribute('data-letter') === L; row.classList.toggle('selected', on); row.querySelector('.choice').setAttribute('aria-checked', on); });
    paintLock();
  }
  function lockIn(timedOut) {
    var it = curItem(), q = qOf(it), r = B.rounds[B.i], lim = limitOf(it); if (r.done) return;
    var ms = Math.min(now() - B.qStart, lim);
    r.a = timedOut ? null : view.pending; r.ms = ms;
    r.ok = !timedOut && isRight(it.sec, q, r.a);
    r.pts = points(r.ok, ms, lim);
    stopTicker();
    var botLate = r.bot.ms > ms && r.bot.ms <= lim;
    var finish = function () { r.done = true; view.showX = false; saveB(); paintAnswer(); paintRound(); renderMath($('#answerArea')); paintScore(); };
    saveB();
    if (botLate && !timedOut) {          // the bot hasn't answered yet: a short "answering…" moment, its time still counts as rolled
      var st = $('#botStatus'); if (st) st.innerHTML = botFace(B.bot, 26) + '<span>' + BOTS[B.bot].name + ' is answering<i class="dots"><b></b><b></b><b></b></i></span>';
      var lb = $('#lockBtn'); if (lb) { lb.disabled = true; lb.innerHTML = I.check + ' Locked in'; }
      $$('.choice').forEach(function (c) { c.setAttribute('data-action', ''); });
      view.revealTimer = setTimeout(finish, 900);
    } else finish();
  }
  function paintScore() {
    var tt = totals(), a = $('#sbYou'), b = $('#sbBot');
    if (a) { a.textContent = tt.y; a.classList.remove('bump'); void a.offsetWidth; a.classList.add('bump'); }
    if (b) { b.textContent = tt.b; b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
    var dots = $$('.sb-dots:not(.bot) i'), bdots = $$('.sb-dots.bot i'), r = B.rounds[B.i];
    if (dots[B.i]) dots[B.i].className = 'cur ' + (r.ok ? 'ok' : 'bad');
    if (bdots[B.i]) bdots[B.i].className = r.bot.ok ? 'ok' : 'bad';
  }
  function nextQuestion() {
    clearTimeout(view.revealTimer);
    if (B.i >= B.list.length - 1) { finishBattle(); return; }
    B.i++; saveB(); beginQuestion();
  }
  function startTicker() { stopTicker(); view.ticker = setInterval(tick, 200); }
  function stopTicker() { if (view.ticker) clearInterval(view.ticker); view.ticker = null; }
  function tick() {
    if (!B || B.status !== 'live' || !$('#bqTimer')) return stopTicker();
    var it = curItem(), r = B.rounds[B.i], lim = limitOf(it);
    var left = r.done ? Math.max(0, lim - r.ms) : Math.max(0, lim - (now() - B.qStart));
    var fg = $('#bqFg'), tx = $('#bqTxt'), c = 2 * Math.PI * 17;
    if (fg) { fg.style.strokeDasharray = c; fg.style.strokeDashoffset = c * (1 - left / lim); }
    if (tx) tx.textContent = Math.ceil(left / 1000);
    $('#bqTimer').classList.toggle('urgent', left < 10000 && !r.done);
    if (r.done) return stopTicker();
    var st = $('#botStatus');
    if (st && !st.classList.contains('in') && now() - B.qStart >= r.bot.ms && r.bot.ms <= lim) {
      st.classList.add('in'); st.innerHTML = botFace(B.bot, 26) + '<span>' + BOTS[B.bot].name + ' has answered</span>';
    }
    if (left <= 0) lockIn(true);
  }

  /* =================================================================== results */
  function finishBattle() {
    var tt = totals(), res = tt.y > tt.b ? 'w' : tt.y < tt.b ? 'l' : 'd';
    if (B.status !== 'done') {
      B.status = 'done'; B.result = res; B.endedAt = now(); saveB();
      var r = S[B.bot] || { w: 0, l: 0, d: 0 }; r[res]++; S[B.bot] = r; setJSON(STATS, S);
    }
    screenResult();
  }
  function screenResult() {
    stopTicker();
    var tt = totals(), bot = BOTS[B.bot], name = playerName() || 'You', res = B.result || (tt.y > tt.b ? 'w' : tt.y < tt.b ? 'l' : 'd'), n = B.list.length;
    var title = res === 'w' ? 'You win! 🏆' : res === 'l' ? bot.name + ' wins' : 'It’s a draw';
    var sub = res === 'w' ? 'You beat ' + bot.name + ' (' + bot.level + ' bot). ' + (B.bot !== 'legend' ? 'Ready for a tougher opponent?' : 'You beat the Legend!') : res === 'l' ? 'Read the explanations below, then take your revenge.' : 'Dead even. Rematch to settle it.';
    var yTime = 0, bTime = 0; B.rounds.forEach(function (r) { yTime += r.ms; bTime += Math.min(r.bot.ms, limitOf(B.list[B.rounds.indexOf(r)])); });
    var rec = record(B.bot);
    $app.className = 'app page';
    $app.innerHTML = '<header class="brandbar"><a class="wordmark" href="practice.html">' + wordmark() + '</a><div class="rb-actions">' + themeBtn('theme-pill') + '<a class="btn ghost" href="practice.html">' + I.book + ' Practice</a></div></header>' +
      '<main class="results battle-res">' +
      '<section class="score-hero res-hero ' + res + '"><div><div class="eyebrow light">' + I.swords + ' Battle result · ' + FORMATS[B.fmt].name + '</div><h1>' + title + '</h1><p>' + sub + '</p>' +
        '<div class="sh-actions"><button class="btn white" data-action="rematch">' + I.redo + ' Rematch</button><button class="btn glass" data-action="new-battle">Change opponent</button></div></div>' +
        '<div class="final-board"><div class="fb-side' + (res === 'w' ? ' win' : '') + '">' + youFace(name, 56) + '<b>' + tt.y + '</b><small>' + esc(name.split(' ')[0]) + '</small></div><span class="fb-vs">vs</span>' +
        '<div class="fb-side' + (res === 'l' ? ' win' : '') + '">' + botFace(B.bot, 56) + '<b>' + tt.b + '</b><small>' + bot.name + '</small></div></div></section>' +
      '<div class="sec-cards">' +
        '<div class="sec-card"><div class="sc-top"><span>Correct</span></div><div class="sc-score">' + tt.yc + '<small>/ ' + n + '</small></div><div class="sc-bar"><i style="width:' + pct(tt.yc, n) + '%"></i></div><p class="fine">' + bot.name + ': ' + tt.bc + ' / ' + n + '</p></div>' +
        '<div class="sec-card"><div class="sc-top"><span>Average time</span></div><div class="sc-score">' + fmtS(yTime / n) + '</div><p class="fine">' + bot.name + ': ' + fmtS(bTime / n) + ' per question</p></div>' +
        '<div class="sec-card meta"><div class="meta-row"><span>' + I.trophy + 'Record vs ' + bot.name + '</span><b>' + rec.w + 'W · ' + rec.l + 'L' + (rec.d ? ' · ' + rec.d + 'D' : '') + '</b></div>' +
          Object.keys(BOTS).filter(function (k) { return k !== B.bot; }).map(function (k) { var x = record(k); return '<div class="meta-row"><span>' + botFace(k, 18) + ' vs ' + BOTS[k].name + '</span><b>' + x.w + 'W · ' + x.l + 'L' + (x.d ? ' · ' + x.d + 'D' : '') + '</b></div>'; }).join('') + '</div>' +
      '</div>' +
      '<section class="panel"><div class="panel-head"><h2>Question by question</h2><small class="muted">Tap a question to see it with the explanation</small></div><div class="res-rows">' +
        B.list.map(function (it, k) {
          var q = qOf(it), r = B.rounds[k];
          return '<button class="res-row br-row" data-action="open-q" data-k="' + k + '"><span class="rr-n ' + (r.ok ? 'ok' : 'bad') + '">' + (k + 1) + '</span><span class="rr-d">' + SEC[it.sec].short + ' · ' + esc(q.sk) + ' · ' + DIFF[q.d] + '</span>' +
            '<span class="rr-a">You <b class="' + (r.ok ? 'okc' : 'badc') + '">+' + r.pts + '</b> · ' + bot.name + ' <b class="' + (r.bot.ok ? 'okc' : 'badc') + '">+' + r.bot.pts + '</b></span>' + I.chevRight + '</button>';
        }).join('') + '</div></section>' +
      '<footer class="foot">Correct = 100 points + up to 50 for speed · wrong or no answer = 0.</footer></main>';
  }
  function openQuestion(k) {
    var it = B.list[k], q = qOf(it), sec = it.sec, r = B.rounds[k], key = keyOf(sec, q), bot = BOTS[B.bot];
    var ch = q.t === 'mcq' ? '<div class="choices review">' + q.c.map(function (c, j) {
      var L = 'ABCD'.charAt(j), isKey = L === key, mine = L === r.a;
      return '<div class="choice-row' + (isKey ? ' key' : '') + (mine && !isKey ? ' wrong' : '') + '"><div class="choice"><span class="letter">' + L + '</span><span class="ctext">' + c + '</span><span class="ctags">' + (mine ? '<span class="who-tag you">' + (isKey ? I.check : I.cross) + ' You</span>' : '') + (r.bot.a === L ? '<span class="who-tag bot ' + (isKey ? 'ok' : 'bad') + '">' + bot.name + '</span>' : '') + (isKey && !mine ? '<span class="tag ok">' + I.check + ' Correct</span>' : '') + '</span></div></div>';
    }).join('') + '</div>' : '<div class="spr-review"><div><small>Your answer</small><b class="' + (r.ok ? 'ok' : r.a ? 'bad' : 'om') + '">' + esc(r.a || '—') + '</b></div><div><small>Correct answer</small><b class="ok">' + esc(keyText(sec, q)) + '</b></div></div>';
    modal({ title: 'Question ' + (k + 1) + ' · ' + SEC[sec].short, cls: 'wide review-modal',
      body: '<div class="rq-meta"><span class="dtag ' + q.d.toLowerCase() + '"><i></i>' + DIFF[q.d] + '</span><span class="chip">' + esc(q.sk) + '</span></div>' + (q.p ? '<div class="passage boxed">' + q.p + '</div>' : '') + '<div class="prompt">' + q.q + '</div>' + ch +
        '<div class="explain"><b>' + I.spark + ' Explanation</b><div>' + q.x + '</div></div>',
      actions: [{ label: 'Close', action: 'layer-close', kind: 'primary' }] });
  }

  /* =================================================================== reference + Desmos */
  function openReference() {
    var f = function (t) { return '<div class="rf-f">\\(' + t + '\\)</div>'; };
    var sh = [['Circle', f('A = \\pi r^2') + f('C = 2\\pi r')], ['Rectangle', f('A = \\ell w')], ['Triangle', f('A = \\tfrac{1}{2}bh')], ['Pythagorean theorem', f('c^2 = a^2 + b^2')],
      ['Special right triangles', '<div class="rf-t">\\(30^\\circ\\)–\\(60^\\circ\\)–\\(90^\\circ\\): sides \\(x,\\ x\\sqrt{3},\\ 2x\\)</div><div class="rf-t">\\(45^\\circ\\)–\\(45^\\circ\\)–\\(90^\\circ\\): sides \\(s,\\ s,\\ s\\sqrt{2}\\)</div>'],
      ['Rectangular box', f('V = \\ell wh')], ['Cylinder', f('V = \\pi r^2 h')], ['Sphere', f('V = \\tfrac{4}{3}\\pi r^3')], ['Cone', f('V = \\tfrac{1}{3}\\pi r^2 h')], ['Pyramid', f('V = \\tfrac{1}{3}\\ell wh')]];
    modal({ title: 'Reference Sheet', cls: 'wide', body: '<div class="ref-grid">' + sh.map(function (s) { return '<div class="ref-card"><b>' + s[0] + '</b>' + s[1] + '</div>'; }).join('') + '</div><ul class="ref-facts"><li>The number of degrees of arc in a circle is 360.</li><li>The number of radians of arc in a circle is \\(2\\pi\\).</li><li>The sum of the measures in degrees of the angles of a triangle is 180.</li></ul>', actions: [{ label: 'Close', action: 'layer-close', kind: 'primary' }] });
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
    var body = $('#calcBody'); if (!body) return;
    if (D.state === 'ready') { body.innerHTML = ''; body.appendChild(D.el); setTimeout(function () { try { D.calc.resize(); } catch (e) { } }, 30); return; }
    body.innerHTML = '<div class="calc-loading"><span class="spin dark"></span> Loading calculator…</div>';
    loadDesmos(function (ok) { var b = $('#calcBody'); if (!b) return; if (ok) { b.innerHTML = ''; b.appendChild(D.el); try { D.calc.resize(); } catch (e) { } } else b.innerHTML = '<div class="calc-fail"><p>The calculator couldn’t load.</p><a class="btn ghost" href="https://www.desmos.com/calculator" target="_blank" rel="noopener">Open Desmos in a new tab</a></div>'; });
  }
  function toggleCalc() {
    view.calcOpen = !view.calcOpen; $app.classList.toggle('calc-open', view.calcOpen);
    var b = $('[data-action="calc"].tool'); if (b) b.setAttribute('aria-pressed', view.calcOpen);
    if (view.calcOpen) mountDesmos();
    setTimeout(function () { if (D.calc) try { D.calc.resize(); } catch (e) { } }, 60);
  }

  /* =================================================================== events */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-action]'); if (!t) return;
    var a = t.getAttribute('data-action');
    switch (a) {
      case 'layer-close': closeLayer(); break;
      case 'theme': toggleTheme(); break;
      case 'pick-fmt': choice.fmt = t.getAttribute('data-id'); Store.set('isatprep:battle:fmt', choice.fmt); $$('.fmt-card').forEach(function (b) { b.classList.toggle('on', b === t); }); break;
      case 'pick-bot': choice.bot = t.getAttribute('data-id'); Store.set('isatprep:battle:bot', choice.bot); $$('.bot-card').forEach(function (b) { b.classList.toggle('on', b === t); }); break;
      case 'resume': resumeBattle(); break;
      case 'start-new': startBattle(); break;
      case 'choose': choose(t.getAttribute('data-letter')); break;
      case 'spr-key':
        var inp = $('#sprIn'); if (!inp) break; var k = t.getAttribute('data-key'), v = inp.value;
        if (k === '-') inp.value = v.charAt(0) === '-' ? v.slice(1) : '-' + v; else inp.value = v + k;
        if (view.sprCommit) view.sprCommit(); break;
      case 'lock': if (view.pending) lockIn(false); break;
      case 'show-x': view.showX = true; paintRound(); break;
      case 'next-q': nextQuestion(); break;
      case 'calc': toggleCalc(); break;
      case 'reference': openReference(); break;
      case 'quit': modal({ title: 'Quit this battle?', cls: 'narrow', body: '<p>The battle ends without a result. Your record doesn’t change.</p>', actions: [{ label: 'Keep playing', action: 'layer-close' }, { label: 'Quit', action: 'quit-yes', kind: 'primary' }] }); break;
      case 'quit-yes': closeLayer(); stopTicker(); clearTimeout(view.revealTimer); Store.del(KEY); B = null; screenStart(); break;
      case 'rematch': choice.fmt = B.fmt; choice.bot = B.bot; startBattle(); break;
      case 'new-battle': screenStart(); break;
      case 'open-q': openQuestion(+t.getAttribute('data-k')); break;
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $layer.classList.contains('open')) { closeLayer(); return; }
    if (!B || B.status !== 'live' || !$('#stage') || $layer.classList.contains('open')) return;
    var tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'textarea') return;
    var r = B.rounds[B.i]; if (!r) return;
    if (!r.done && /^[a-dA-D]$/.test(e.key) && qOf(curItem()).t === 'mcq') choose(e.key.toUpperCase());
    else if (e.key === 'Enter') { if (!r.done && view.pending) lockIn(false); else if (r.done) nextQuestion(); }
  });

  /* =================================================================== boot */
  applyTheme();
  if (B && B.status === 'live' && B.list && B.list.length) resumeBattle(); else screenStart();
})();
