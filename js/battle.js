/* isatprep · Battle Mode
   Hub (player card, XP + level, rank, badges) → mode (Quick Match / Challenge a Friend / vs Bot) → subject → opponent
   → matchmaking → VS → 3·2·1 → battle (tug-of-war score, combos, live opponent status) → rewards.
   Same look as Practice Mode (css/app.css + css/practice.css + css/battle.css) and the same 355-question bank.
   Both players get the same questions. Scoring: correct = 100 + up to 50 speed bonus + combo bonus; wrong or no answer = 0.
   Online modes need the backend (CFG.battleOnline). Until then they show "Soon"; with ?preview=1 they are simulated.
   A battle in progress is saved, so a refresh continues where it stopped (timers use absolute times). */
(function () {
  'use strict';
  var C = window.SATCore;
  var CFG = window.SAT_CONFIG || {};
  var BANK = window.PRACTICE_BANK = window.PRACTICE_BANK || {};
  var $app = document.getElementById('app'), $layer = document.getElementById('layer'), $toasts = document.getElementById('toasts');
  var BANK_VER = (document.querySelector('meta[name="bank-version"]') || {}).content || '1';
  var QS = location.search;
  var PREVIEW = /[?&]preview=1/.test(QS);
  // Online battles run on Supabase (CFG.supabaseUrl / supabaseKey). CFG.battleOnline switches them on for everyone;
  // ?online=1 switches them on just for this visit (for testing before going live).
  var ONLINE = !!(CFG.battleOnline || /[?&]online=1/.test(QS)) && !!CFG.supabaseUrl && !!CFG.supabaseKey;
  var SLOT = (QS.match(/[?&]slot=([A-Za-z0-9]{1,8})/) || [])[1] || '';   // testing: ?slot=2 = a second player in the same browser
  var KSUF = SLOT ? ':' + SLOT : '';
  var DEMO = PREVIEW && !ONLINE;                 // preview: online modes are simulated so the flow can be seen
  var EMPTY = /[?&]empty=1/.test(QS);            // preview: nobody is found (shows the 1.5-minute fallback)
  var FALLBACK_MS = 90000;                       // Quick Match: after 1.5 minutes offer a bot or an invite link
  var RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* =================================================================== settings */
  var SEC = { rw: { name: 'Reading & Writing', short: 'R&W' }, math: { name: 'Math', short: 'Math' } };
  var DIFF = { E: 'Easy', M: 'Medium', H: 'Hard' };
  var LIMIT = { rw: { E: 50, M: 70, H: 90 }, math: { E: 70, M: 95, H: 120 } };          // seconds per question (same as Rush)
  var FORMATS = {
    rw: { name: 'Reading & Writing', n: 5, mix: [['rw', 5]], blurb: '5 questions', mins: '~5 min' },
    math: { name: 'Math', n: 10, mix: [['math', 10]], blurb: '10 questions', mins: '~12 min' },
    mixed: { name: 'Mixed', n: 8, mix: [['rw', 4], ['math', 4]], blurb: '8 questions · 4 + 4', mins: '~9 min' }
  };
  var BOTS = {
    rookie: { name: 'Rookie', level: 'Easy', stars: 1, xp: 20, acc: 0.55, t: [0.55, 0.95], skip: 0.08, dist: { E: 0.6, M: 0.3, H: 0.1 }, tag: 'Learns fast, still makes mistakes.' },
    ace: { name: 'Ace', level: 'Medium', stars: 2, xp: 30, acc: 0.72, t: [0.4, 0.8], skip: 0.03, dist: { E: 0.3, M: 0.45, H: 0.25 }, tag: 'Solid and steady. Beat it to prove you’re ready.' },
    legend: { name: 'Legend', level: 'Hard', stars: 3, xp: 40, acc: 0.88, t: [0.25, 0.6], skip: 0, dist: { E: 0.15, M: 0.4, H: 0.45 }, tag: 'Fast and rarely wrong. Good luck.' }
  };
  var ADJ = { E: 0.12, M: 0, H: -0.15 };            // the bot finds easy questions easier, like everyone
  var KEY = 'isatprep:battle:v1' + KSUF, STATS = 'isatprep:battle:stats' + KSUF, RECENT = 'isatprep:battle:recent' + KSUF, PKEY = 'isatprep:battle:profile' + KSUF;
  var KHEX = '3ecfa63da7d6047e8b1b5b694cac2db0bc8f1335bbf514537a0acf2ac2bf13b0';
  var AVATARS = [['🦊', '#ff8a3d'], ['🐼', '#5b6170'], ['🐯', '#f2a516'], ['🦉', '#8a5cf6'], ['🐸', '#22b26b'], ['🐙', '#e8508a'],
    ['🦁', '#d9902b'], ['🐧', '#3f7be8'], ['🐲', '#16a39a'], ['🦄', '#b45cf0'], ['🐺', '#6a7a99'], ['🐨', '#8f9bb3']];
  // Ranks come from the Quick Match rating (everyone starts at 1000).
  var RANKS = [
    { id: 'bronze', name: 'Bronze', min: 0, c: '#c98a4b', c2: '#8a5a2b' },
    { id: 'silver', name: 'Silver', min: 1100, c: '#aab4c5', c2: '#6c778a' },
    { id: 'gold', name: 'Gold', min: 1250, c: '#f2c230', c2: '#b8860b' },
    { id: 'diamond', name: 'Diamond', min: 1400, c: '#56cdf5', c2: '#1d8fc4' },
    { id: 'mythic', name: 'Mythic', min: 1550, c: '#b26cff', c2: '#7a2fd6' },
    { id: 'legendary', name: 'Legendary', min: 1700, c: '#ff8a2a', c2: '#d1490a' },
    { id: 'top', name: '1600', min: 1850, c: '#ff4d6d', c2: '#9b1239' }
  ];
  var BADGES = [
    ['first', '🥇', 'First win', 'Win your first battle'],
    ['streak3', '🔥', 'On fire', 'Win 3 battles in a row'],
    ['streak10', '☄️', 'Unstoppable', 'Win 10 battles in a row'],
    ['legend', '👑', 'Legend slayer', 'Beat the Legend bot'],
    ['perfect', '💯', 'Flawless', 'Win with every answer correct'],
    ['combo5', '🌪️', 'Combo master', 'Get 5 right in a row in one battle'],
    ['speed', '⚡', 'Lightning', 'Answer correctly in under 10 seconds'],
    ['comeback', '🔄', 'Comeback', 'Win after trailing at halftime'],
    ['b10', '🎖️', 'Regular', 'Play 10 battles'],
    ['b50', '🏅', 'Veteran', 'Play 50 battles'],
    ['owl', '🦉', 'Night owl', 'Finish a battle after 11 pm']
  ];
  var DEMO_NICKS = ['Aziza_07', 'MathGod', 'bekzod.sat', 'Nilu1500', 'Javo_x', 'Shoxrux', 'Madina.r', 'Timur1490', 'Sevara', 'Diyor_99', 'Kamola', 'Sardor.uz'];

  /* =================================================================== utilities */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function now() { return Date.now(); }
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function fmtS(ms) { var s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + s % 60; }
  function wait(ms) { return RM ? Math.min(ms, 150) : ms; }
  function dayKey() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
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
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 11v6M12 7.5v.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    robot: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="2.8" r="1.4" fill="currentColor"/><rect x="4" y="6.5" width="16" height="13" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="12.5" r="1.7" fill="currentColor"/><circle cx="15" cy="12.5" r="1.7" fill="currentColor"/><path d="M9.5 16.3h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M2 11.5v3M22 11.5v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5l4 4L8 20H4v-4z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h4l5-4v13l-5-4H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h4l5-4v13l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="1.9"/></svg>',
    tg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 4.5L2.8 11.4c-.9.4-.9 1.6.1 1.9l4.6 1.5 1.8 5.3c.3.8 1.3 1 1.9.4l2.6-2.4 4.6 3.4c.7.5 1.7.1 1.9-.8L23 5.9c.2-1-.9-1.8-2-1.4zM9.6 14.4l8.6-6.6-6.9 7.6-.3 3.1z" fill="currentColor"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" fill="none" stroke="currentColor" stroke-width="1.9"/></svg>',
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-6.5 8 6.5v9h-5.5v-5.5h-5V20H4z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" fill="currentColor"/></svg>'
  };
  function botFace(id, size) {
    var c = { rookie: ['#19a974', '#e3f6e8'], ace: ['#e9a21a', '#fdf1cc'], legend: ['#e0484d', '#fbe1e1'] }[id];
    var eyes = id === 'legend' ? '<path d="M13 21l5 2M27 21l-5 2" stroke="' + c[0] + '" stroke-width="2.4" stroke-linecap="round"/><circle cx="16" cy="25" r="2.6" fill="' + c[0] + '"/><circle cx="24" cy="25" r="2.6" fill="' + c[0] + '"/>'
      : '<circle cx="15.5" cy="24" r="2.8" fill="' + c[0] + '"/><circle cx="24.5" cy="24" r="2.8" fill="' + c[0] + '"/>';
    var mouth = id === 'rookie' ? '<path d="M16 30c2.5 2 5.5 2 8 0" fill="none" stroke="' + c[0] + '" stroke-width="2.2" stroke-linecap="round"/>' : id === 'ace' ? '<path d="M16 30.5h8" stroke="' + c[0] + '" stroke-width="2.2" stroke-linecap="round"/>' : '<path d="M15.5 31c3-1.6 6-1.6 9 0" fill="none" stroke="' + c[0] + '" stroke-width="2.2" stroke-linecap="round"/>';
    return '<svg class="bot-face" viewBox="0 0 40 40" width="' + (size || 40) + '" height="' + (size || 40) + '" aria-hidden="true"><rect width="40" height="40" rx="12" fill="' + c[1] + '"/><path d="M20 6v5" stroke="' + c[0] + '" stroke-width="2.4" stroke-linecap="round"/><circle cx="20" cy="5.5" r="2.4" fill="' + c[0] + '"/>' +
      '<rect x="8" y="12" width="24" height="23" rx="7" fill="#fff" stroke="' + c[0] + '" stroke-width="2.4"/>' + eyes + mouth + '</svg>';
  }
  function avatar(av, size, cls) {
    var a = AVATARS[av] || AVATARS[0], s = size || 40;
    return '<span class="av' + (cls ? ' ' + cls : '') + '" style="--av:' + a[1] + ';width:' + s + 'px;height:' + s + 'px;font-size:' + Math.round(s * 0.56) + 'px" aria-hidden="true">' + a[0] + '</span>';
  }
  function rankOf(rating) { var r = RANKS[0]; RANKS.forEach(function (x) { if (rating >= x.min) r = x; }); return r; }
  function rankBadge(rank, size) {
    var s = size || 28;
    if (!rank) return '<svg class="rank-badge" viewBox="0 0 40 44" width="' + s + '" height="' + Math.round(s * 1.1) + '" aria-hidden="true"><path d="M20 2l16 7v13c0 9.5-7 16-16 20C11 38 4 31.5 4 22V9z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-dasharray="4 3" opacity=".55"/><text x="20" y="27" text-anchor="middle" font-size="15" font-weight="800" fill="currentColor" opacity=".6" font-family="system-ui,sans-serif">?</text></svg>';
    var gid = 'rg' + rank.id + s;
    var inner = rank.id === 'top' ? '<text x="20" y="26.5" text-anchor="middle" font-size="10.5" font-weight="900" fill="#fff" font-family="system-ui,sans-serif">1600</text>'
      : '<path d="M20 12.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4L20 24.9l-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" fill="#fff" opacity=".95"/>';
    var pips = ''; var idx = RANKS.indexOf(rank);
    if (rank.id !== 'top') for (var k = 0; k <= Math.min(idx, 4); k++) pips += '<circle cx="' + (20 - Math.min(idx, 4) * 2.6 + k * 5.2) + '" cy="33" r="1.5" fill="#fff" opacity=".9"/>';
    return '<svg class="rank-badge" viewBox="0 0 40 44" width="' + s + '" height="' + Math.round(s * 1.1) + '" aria-hidden="true"><defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + rank.c + '"/><stop offset="1" stop-color="' + rank.c2 + '"/></linearGradient></defs>' +
      '<path d="M20 2l16 7v13c0 9.5-7 16-16 20C11 38 4 31.5 4 22V9z" fill="url(#' + gid + ')" stroke="rgba(255,255,255,.55)" stroke-width="1.5"/>' + inner + pips + '</svg>';
  }

  /* =================================================================== sound (WebAudio, no files) */
  var SND = { on: Store.get('isatprep:battle:sound') !== 'off', ctx: null };
  function actx() {
    if (!SND.ctx) { try { SND.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (SND.ctx.state === 'suspended') { try { SND.ctx.resume(); } catch (e) { } }
    return SND.ctx;
  }
  function tone(f, t0, dur, type, vol, f2) {
    var c = actx(); if (!c) return;
    var o = c.createOscillator(), g = c.createGain(), st = c.currentTime + t0;
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, st); if (f2) o.frequency.exponentialRampToValueAtTime(f2, st + dur);
    g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(vol || 0.12, st + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, st + dur);
    o.connect(g); g.connect(c.destination); o.start(st); o.stop(st + dur + 0.05);
  }
  function noise(t0, dur, vol, from, to) {
    var c = actx(); if (!c) return;
    var len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var src = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain(), st = c.currentTime + t0;
    src.buffer = buf; bp.type = 'bandpass'; bp.Q.value = 1.2; bp.frequency.setValueAtTime(from || 400, st); bp.frequency.exponentialRampToValueAtTime(to || 2400, st + dur);
    g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(vol || 0.1, st + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, st + dur);
    src.connect(bp); bp.connect(g); g.connect(c.destination); src.start(st); src.stop(st + dur + 0.05);
  }
  var SFX = {
    tap: function () { tone(520, 0, 0.06, 'triangle', 0.06); },
    pick: function () { tone(660, 0, 0.08, 'triangle', 0.09); tone(990, 0.06, 0.12, 'triangle', 0.08); },
    whoosh: function () { noise(0, 0.32, 0.09, 300, 3000); },
    roll: function () { tone(900 + Math.random() * 300, 0, 0.03, 'square', 0.025); },
    found: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.07, 0.2, 'triangle', 0.1); }); },
    slam: function () { tone(160, 0, 0.4, 'sawtooth', 0.14, 45); noise(0, 0.28, 0.16, 2000, 200); },
    count: function () { tone(440, 0, 0.16, 'square', 0.07); },
    go: function () { tone(880, 0, 0.1, 'square', 0.08); tone(1320, 0.09, 0.32, 'square', 0.08); },
    tick: function () { tone(1250, 0, 0.035, 'square', 0.03); },
    oppIn: function () { tone(620, 0, 0.07, 'sine', 0.06); tone(820, 0.05, 0.07, 'sine', 0.05); },
    lock: function () { tone(330, 0, 0.07, 'triangle', 0.08); tone(495, 0.05, 0.09, 'triangle', 0.07); },
    ok: function () { tone(784, 0, 0.1, 'sine', 0.13); tone(1175, 0.08, 0.22, 'sine', 0.13); },
    bad: function () { tone(220, 0, 0.26, 'sawtooth', 0.08, 130); },
    combo: function () { [880, 1109, 1319].forEach(function (f, i) { tone(f, i * 0.05, 0.12, 'triangle', 0.07); }); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.11, 0.24, 'triangle', 0.11); }); [523, 784, 1047].forEach(function (f) { tone(f, 0.48, 0.7, 'triangle', 0.07); }); },
    lose: function () { [392, 349, 311, 262].forEach(function (f, i) { tone(f, i * 0.16, 0.3, 'triangle', 0.09); }); },
    draw: function () { tone(523, 0, 0.2, 'triangle', 0.09); tone(523, 0.22, 0.3, 'triangle', 0.09); },
    xp: function () { tone(1400 + Math.random() * 400, 0, 0.03, 'sine', 0.03); },
    level: function () { [523, 659, 784, 1047, 1319, 1568].forEach(function (f, i) { tone(f, i * 0.06, 0.25, 'triangle', 0.08); }); },
    badge: function () { tone(1319, 0, 0.12, 'sine', 0.1); tone(1760, 0.1, 0.3, 'sine', 0.09); }
  };
  function sfx(n) { if (!SND.on || !SFX[n]) return; try { SFX[n](); } catch (e) { } }
  function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { } }
  function soundBtn() { return '<button class="theme-pill snd-pill" data-action="sound" aria-pressed="' + SND.on + '" aria-label="' + (SND.on ? 'Mute sounds' : 'Turn sounds on') + '">' + (SND.on ? I.sound : I.mute) + '<span>' + (SND.on ? 'Sound' : 'Muted') + '</span></button>'; }
  function toggleSound() {
    SND.on = !SND.on; Store.set('isatprep:battle:sound', SND.on ? 'on' : 'off'); if (SND.on) sfx('pick');
    $$('[data-action="sound"]').forEach(function (b) { b.outerHTML = soundBtn(); });
  }

  /* =================================================================== layer / toast / fx */
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
  function brandbar() {
    return (DEMO ? '<div class="demo-bar"><b>Preview</b> Online modes are simulated here. Nobody else sees this.</div>' : '') +
      '<header class="brandbar"><a class="wordmark" href="practice.html">' + wordmark() + '</a><div class="rb-actions">' + soundBtn() + themeBtn('theme-pill') + '<a class="btn ghost" href="practice.html">' + I.book + ' Practice</a></div></header>';
  }
  // timers that belong to the current screen (cleared when the screen changes)
  var timers = [];
  function later(fn, ms) { var id = setTimeout(fn, ms); timers.push(id); return id; }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function countTo(el, from, to, dur, onStep) {
    if (!el) return; if (RM || dur <= 0) { el.textContent = to; return; }
    var t0 = performance.now();
    (function step(t) { var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3), v = Math.round(from + (to - from) * e); if (el.textContent !== String(v) && onStep) onStep(); el.textContent = v; if (k < 1) requestAnimationFrame(step); })(t0);
  }
  function floatText(txt, fromEl, toEl, cls) {
    if (!fromEl || RM) return;
    var a = fromEl.getBoundingClientRect(), el = document.createElement('span');
    el.className = 'floatpt ' + (cls || ''); el.textContent = txt; document.body.appendChild(el);
    var x0 = a.left + a.width / 2, y0 = a.top + Math.min(a.height / 2, 60), x1 = x0, y1 = y0 - 80;
    if (toEl) { var b = toEl.getBoundingClientRect(); x1 = b.left + b.width / 2; y1 = b.top + b.height / 2; }
    el.style.left = x0 + 'px'; el.style.top = y0 + 'px';
    var anim = el.animate([{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-90%) scale(1.25)', opacity: 1, offset: 0.25 },
      { transform: 'translate(calc(-50% + ' + (x1 - x0) + 'px), calc(-50% + ' + (y1 - y0) + 'px)) scale(.7)', opacity: 0.2 }], { duration: 900, easing: 'cubic-bezier(.4,0,.2,1)' });
    anim.onfinish = function () { if (el.parentNode) el.parentNode.removeChild(el); };
  }
  function confetti(n) {
    if (RM) return;
    var cv = document.createElement('canvas'), ctx = cv.getContext('2d'), W = cv.width = window.innerWidth, H = cv.height = window.innerHeight;
    cv.className = 'confetti'; document.body.appendChild(cv);
    var cols = ['#4352e8', '#7a3cf0', '#ffb703', '#ff4d6d', '#19c37d', '#38bdf8'], ps = [];
    for (var i = 0; i < (n || 160); i++) ps.push({ x: W / 2 + rnd(-W * 0.15, W * 0.15), y: H * 0.32, vx: rnd(-9, 9), vy: rnd(-15, -5), s: rnd(5, 10), r: rnd(0, 6), vr: rnd(-0.3, 0.3), c: pick(cols), sh: Math.random() < 0.5 });
    var t0 = performance.now();
    (function frame(t) {
      var el = (t - t0) / 1000; ctx.clearRect(0, 0, W, H);
      ps.forEach(function (p) { p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.max(0, 1 - el / 2.8); ctx.fillStyle = p.c; if (p.sh) ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); else { ctx.beginPath(); ctx.arc(0, 0, p.s / 2.6, 0, 7); ctx.fill(); } ctx.restore(); });
      if (el < 2.9) requestAnimationFrame(frame); else if (cv.parentNode) cv.parentNode.removeChild(cv);
    })(t0);
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

  /* =================================================================== player profile (this device for now; moves to the account later) */
  function cleanNick(s) {
    s = String(s || '').trim().replace(/\s+/g, ' ');
    try { s = s.replace(/[^\p{L}\p{N}_. -]/gu, ''); } catch (e) { s = s.replace(/[^A-Za-z0-9_. -]/g, ''); }
    return s.slice(0, 16).trim();
  }
  function newProfile() { return { v: 1, nick: '', av: Math.floor(Math.random() * AVATARS.length), xp: 0, w: 0, l: 0, d: 0, battles: 0, streak: 0, best: 0, correct: 0, answered: 0, fastest: 0, bestCombo: 0, badges: {}, lastWinDay: '', recent: [], rating: null }; }
  var P = getJSON(PKEY, null);
  var S = getJSON(STATS, {});          // { rookie: {w,l,d}, ... } record against each bot
  if (!P || typeof P !== 'object') {
    P = newProfile();
    var oldName = SLOT ? '' : cleanNick(Store.get('isatprep:name') || ''); if (oldName.length >= 3) P.nick = oldName;
    Object.keys(BOTS).forEach(function (k) { var r = S[k]; if (r) { P.w += r.w || 0; P.l += r.l || 0; P.d += r.d || 0; } });
    P.battles = P.w + P.l + P.d;
    setJSON(PKEY, P);
  }
  function saveP() { setJSON(PKEY, P); }
  function lvl(xp) { var L = 1, need = 100; xp = xp || 0; while (xp >= need) { xp -= need; L++; need = 100 + 50 * (L - 1); } return { L: L, into: xp, need: need }; }
  function record(id) { return S[id] || { w: 0, l: 0, d: 0 }; }
  function nickOr() { return P.nick || 'You'; }

  /* =================================================================== state */
  var B = getJSON(KEY, null);          // the battle in progress (or just finished)
  if (B && !B.opp && B.bot) { B.opp = { kind: 'bot', id: B.bot }; B.mode = 'bot'; }
  var choice = { fmt: Store.get('isatprep:battle:fmt') || 'mixed', bot: Store.get('isatprep:battle:bot') || 'ace' };
  if (!FORMATS[choice.fmt]) choice.fmt = 'mixed';
  if (!BOTS[choice.bot]) choice.bot = 'ace';
  var flow = { mode: 'bot', fmt: choice.fmt, bot: choice.bot, opp: null, room: '' };
  function saveB() { setJSON(KEY, B); }
  function oppName() { return B.opp.kind === 'bot' ? BOTS[B.opp.id].name : B.opp.nick; }
  function oppFace(size) { return B.opp.kind === 'bot' ? botFace(B.opp.id, size) : avatar(B.opp.av, size); }
  function meFace(size, cls) { return avatar(P.av, size, cls); }

  /* =================================================================== online (Supabase)
     Players sign in anonymously the first time they save a battle card (Google/Telegram sign-in can be linked later).
     Everything goes through the bm_* database functions in supabase/battle.sql, which check answers, time them,
     score them and update ratings on the server. The page only shows results instantly (checked locally first)
     and then takes the server's numbers. Answers are sent in order through a small queue that survives a refresh. */
  var SB_LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.js';
  var NET = { sb: null, loading: null, auth: null, ready: null, me: null, board: {}, scope: 'week' };
  function noop() { }
  function sbClient() {
    if (NET.sb) return Promise.resolve(NET.sb);
    if (NET.loading) return NET.loading;
    NET.loading = new Promise(function (res, rej) {
      var go = function () {
        try {
          NET.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { storageKey: 'isatprep-auth' + (SLOT ? '-' + SLOT : ''), persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
          res(NET.sb);
        } catch (e) { NET.loading = null; rej(e); }
      };
      if (window.supabase && window.supabase.createClient) { go(); return; }
      var s = document.createElement('script'); s.src = SB_LIB; s.async = true;
      s.onload = go; s.onerror = function () { NET.loading = null; if (s.parentNode) s.parentNode.removeChild(s); rej(new Error('offline')); };
      document.head.appendChild(s);
    });
    return NET.loading;
  }
  var ERR_CODES = ['room_done', 'nick_taken', 'bad_nick', 'room_not_found', 'room_full', 'own_room', 'match_not_found', 'no_profile', 'not_signed_in', 'out_of_order', 'bad_format'];
  function errCode(e) { var m = String((e && (e.message || e.details || e.hint)) || ''); for (var i = 0; i < ERR_CODES.length; i++) if (m.indexOf(ERR_CODES[i]) !== -1) return ERR_CODES[i]; return m || 'error'; }
  function rpc(fn, args) {
    return sbClient().then(function (sb) { return sb.rpc(fn, args || {}); }).then(function (r) {
      if (r.error) { var e = new Error(errCode(r.error)); e.raw = r.error; throw e; }
      return r.data;
    });
  }
  // A session (anonymous the first time).
  function netAuth() {
    if (NET.auth) return NET.auth;
    NET.auth = sbClient().then(function (sb) {
      return sb.auth.getSession().then(function (r) {
        if (r.data && r.data.session) return r.data.session;
        return sb.auth.signInAnonymously().then(function (x) { if (x.error) throw new Error(errCode(x.error)); return x.data.session; });
      });
    });
    NET.auth.catch(function () { NET.auth = null; });
    return NET.auth;
  }
  function hasSession() { return sbClient().then(function (sb) { return sb.auth.getSession(); }).then(function (r) { return !!(r.data && r.data.session); }); }
  // Signed in, with the battle card saved on the server. Resolves to the server profile (null if there is no card yet).
  function netReady() {
    if (NET.ready) return NET.ready;
    NET.ready = netAuth().then(function () { return rpc('bm_me'); }).then(function (me) {
      if (me) { adoptServer(me); return me; }
      if (!P.nick) return null;
      return rpc('bm_save_profile', { p_nick: P.nick, p_av: P.av }).then(function (me2) { adoptServer(me2); pushProgress(); return me2; });
    });
    NET.ready.then(function (me) { if (!me) NET.ready = null; }, function () { NET.ready = null; });
    return NET.ready;
  }
  function netSaveNick(nk, av) {
    return netAuth().then(function () { return rpc('bm_save_profile', { p_nick: nk, p_av: av }); }).then(function (me) {
      var first = !NET.me; adoptServer(me); NET.ready = Promise.resolve(me); if (first) pushProgress(); return me;
    });
  }
  // The server's card wins for name, avatar and rating; XP/badges come from whichever side has more XP.
  function adoptServer(me) {
    NET.me = me;
    var pr = me.progress || {};
    if ((pr.xp || 0) > (P.xp || 0)) ['xp', 'w', 'l', 'd', 'battles', 'streak', 'best', 'correct', 'answered', 'fastest', 'bestCombo', 'badges', 'lastWinDay', 'recent'].forEach(function (k) { if (pr[k] != null) P[k] = pr[k]; });
    P.nick = me.nick; P.av = me.av;
    P.rating = (me.rw + me.rl + me.rd) > 0 ? me.rating : null;
    saveP();
  }
  function pushProgress() {
    if (!NET.me) return;
    var p = {}; Object.keys(P).forEach(function (k) { if (k !== 'rating') p[k] = P[k]; });
    rpc('bm_sync', { p_progress: p }).catch(noop);
  }
  function oppFromMatch(m) { var o = m.opp || {}; return { kind: 'human', nick: o.nick || 'Player', av: o.av || 0, lvl: lvl(o.xp || 0).L, rating: o.ranked ? o.rating : null, match: m }; }
  function netErrText(e) {
    var c = e && e.message;
    return { room_not_found: 'That room doesn’t exist anymore. Ask your friend for a new link.', room_full: 'That room is already full.', room_done: 'That battle is already over. Ask your friend for a new link.', own_room: 'This is your own room link. Send it to a friend!' }[c] ||
      'Couldn’t connect. Check your internet and try again.';
  }
  function bankN(it) {
    var arr = BANK[it.sec] || [];
    if (arr[it.n - 1] && arr[it.n - 1].id === it.id) return it.n;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === it.id) return i + 1;
    return it.n;
  }
  function pendingOpp() { return { pending: true, ms: 0, ok: false, a: null, pts: 0, combo: 0 }; }
  function blankRound() { return { done: true, a: null, ok: false, pts: 0, ms: 0, combo: 0, bot: pendingOpp() }; }

  // ---- live match: realtime ping + a poll every 2.5 s, both ending in netSync()
  var watch = { ch: null, iv: null, busy: false, again: false };
  function netWatch() {
    netUnwatch();
    if (!B || !B.net || B.net.final) return;
    var id = B.net.id;
    sbClient().then(function (sb) {
      if (!B || !B.net || B.net.id !== id) return;
      watch.ch = sb.channel('m-' + id).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: 'id=eq.' + id }, function () { netSync(); }).subscribe();
    }).catch(noop);
    watch.iv = setInterval(netSync, 2500);
    netSync();
  }
  function netUnwatch() {
    if (watch.iv) clearInterval(watch.iv); watch.iv = null;
    if (watch.ch && NET.sb) { try { NET.sb.removeChannel(watch.ch); } catch (e) { } }
    watch.ch = null;
  }
  function netSync() {
    if (!B || !B.net || B.net.final) { netUnwatch(); return; }
    if (watch.busy) { watch.again = true; return; }
    watch.busy = true; var id = B.net.id;
    rpc('bm_match', { p_id: id }).then(function (m) {
      watch.busy = false;
      if (B && B.net && B.net.id === id) applyMatch(m);
      if (watch.again) { watch.again = false; netSync(); }
    }, function () { watch.busy = false; });
  }
  function applyMatch(m) {
    var N = B.net; if (!N || N.final) return;
    N.oppN = m.opp_n || 0;
    var done = m.status === 'done' || m.status === 'cancelled';
    if (done) for (var k = 0; k < B.list.length; k++) if (!B.rounds[k]) B.rounds[k] = blankRound();
    (m.my_rounds || []).forEach(function (x) { var r = B.rounds[x.idx]; if (r && r.done) { r.ok = x.ok; r.pts = x.pts; r.ms = x.ms; r.combo = x.combo; } });
    (m.opp_rounds || []).forEach(fillOpp);
    var r = B.rounds[B.i], st = $('#botStatus');
    if (st && r && !r.done && N.oppN > B.i && !st.classList.contains('in')) { st.classList.add('in'); st.innerHTML = oppStatus('in'); sfx('oppIn'); }
    paintWait(m);
    if (done) {
      N.final = { result: m.result || 'd', delta: m.delta, rating: m.rating, forfeit: m.forfeit };
      B.rounds.forEach(function (x) { if (!x.done) { x.done = true; x.a = null; x.ok = false; x.pts = 0; } });
      saveB(); netUnwatch();
      if (B.status === 'live') {
        if (m.forfeit === 'opp') toast(oppName() + ' left the battle. You win!');
        finishBattle();
      }
    } else saveB();
  }
  // The opponent's answer to question idx (only sent once you've answered it yourself).
  function fillOpp(x) {
    var r = B.rounds[x.idx]; if (!r) return;
    var had = r.bot && !r.bot.pending;
    r.bot = { ms: x.ms, ok: x.ok, a: x.a, pts: x.pts, combo: x.combo };
    if (!had && x.idx === B.i && r.done && $('#roundBox') && B.status === 'live') {
      var from = $('#botStatus') || $('.rc-side.opp') || $('#roundBox');
      floatText('+' + x.pts, from, $('#sbBot'), x.ok ? 'opp' : 'zero');
      paintAnswer(); paintRound(); renderMath($('#answerArea'));
      later(paintScore, wait(300));
    }
  }
  // ---- answers and "question shown" go to the server one at a time, in order
  var qBusy = false;
  function netOp(op) { B.net.q.push(op); saveB(); netFlush(); }
  function netFlush() {
    if (qBusy || !B || !B.net || !B.net.q || !B.net.q.length) return;
    qBusy = true; var N = B.net, op = N.q[0];
    var p = op.op === 'open' ? rpc('bm_open', { p_id: N.id, p_idx: op.idx }) : rpc('bm_answer', { p_id: N.id, p_idx: op.idx, p_answer: op.a == null ? null : String(op.a) });
    p.then(function (res) {
      qBusy = false; if (!B || B.net !== N) return;
      N.q.shift(); if (op.op === 'answer' && res) gotAnswer(res); saveB(); netFlush();
    }, function (e) {
      qBusy = false; if (!B || B.net !== N) return;
      if (e.message === 'out_of_order' || e.message === 'match_not_found') { N.q.shift(); saveB(); netFlush(); return; }   // retrying can't fix these
      setTimeout(netFlush, 2500);
    });
  }
  function gotAnswer(res) {
    if (res.closed) { netSync(); return; }
    var r = B.rounds[res.idx]; if (!r) return;
    var changed = r.pts !== res.pts || r.ok !== res.ok;
    r.ok = res.ok; r.pts = res.pts; r.ms = res.ms; r.combo = res.combo;
    if (changed && res.idx === B.i && $('#roundBox') && r.done) { paintRound(); var a = $('#sbYou'); if (a) a.textContent = totals().y; }
    if (res.opp) fillOpp(res.opp);
  }
  // Waiting for the opponent after your last answer.
  function screenWaitOpp() {
    stopTicker(); clearTimers(); closeLayer();
    $app.className = 'app page battle-page mm-page';
    $app.innerHTML = '<main class="mm m-' + B.mode + '" id="waitOpp">' +
      '<button class="mm-cancel" data-action="quit">' + I.close + ' Leave</button>' +
      '<div class="mm-stage"><div class="radar"><i></i><i></i><i></i><span class="radar-sweep"></span><div class="radar-me">' + oppFace(92) + '</div></div></div>' +
      '<h1 class="mm-title">Waiting for ' + esc(oppName()) + '</h1>' +
      '<p class="mm-sub" id="waitTxt">' + waitText(B.net.oppN) + '</p>' +
      '<div class="mm-timer">' + totals().y + ' pts</div>' +
      '<p class="mm-fb">Your answers are in. The result shows up as soon as they finish or their time runs out.</p></main>';
    netWatch();
    later(function tryFinish() {
      if (!B || !B.net || B.net.final) return;
      rpc('bm_finish', { p_id: B.net.id }).then(function (m) { if (B && B.net && !B.net.final) applyMatch(m); }, noop);
      later(tryFinish, 6000);
    }, 1200);
  }
  function waitText(n) { return n >= B.list.length ? 'They’re done. Adding up the scores…' : 'They’re on question ' + Math.min(n + 1, B.list.length) + ' of ' + B.list.length; }
  function paintWait(m) { var t = $('#waitTxt'); if (t) t.textContent = waitText(m.opp_n || 0); }
  function oppIn(r) { return B.net ? (B.net.oppN || 0) > B.i : (now() - B.qStart >= r.bot.ms && r.bot.ms <= limitOf(curItem())); }

  // ---- league table on the hub
  function loadBoard(scope) {
    if (!ONLINE) return;
    rpc('bm_leaderboard', { p_scope: scope }).then(function (b) { NET.board[scope] = b; if (NET.scope === scope && $('#lb')) $('#lb').innerHTML = boardHTML(); }, function () {
      if (NET.scope === scope && $('#lb') && !NET.board[scope]) $('#lb').innerHTML = '<p class="hp-empty">Couldn’t load the league right now.</p>';
    });
  }
  function boardHTML() {
    var sc = NET.scope, b = NET.board[sc];
    if (!b) return '<p class="hp-empty">Loading the league…</p>';
    if (!b.top.length) return '<p class="hp-empty">' + (sc === 'week' ? 'No Quick Match wins yet this week. Be the first on the board!' : 'No ranked players yet. Win a Quick Match to be the first!') + '</p>';
    var mine = P.nick, inTop = false;
    var rows = b.top.slice(0, 10).map(function (x) {
      var me = mine && x.nick === mine; if (me) inTop = true;
      return '<div class="lb-row' + (me ? ' me' : '') + '"><span class="lb-pos p' + x.pos + '">' + x.pos + '</span>' + avatar(x.av, 28) + '<b>' + esc(x.nick) + '</b>' +
        (x.ranked ? rankBadge(rankOf(x.rating), 18) : '') + '<span class="lb-pts">' + (sc === 'week' ? x.pts + ' pts' : x.rating) + '</span></div>';
    }).join('');
    if (!inTop && b.me && b.me.pos) rows += '<div class="lb-row me sep"><span class="lb-pos">' + b.me.pos + '</span>' + meFace(28) + '<b>' + esc(nickOr()) + '</b><span class="lb-pts">' + (sc === 'week' ? b.me.pts + ' pts' : b.me.pts) + '</span></div>';
    return '<div class="lb-rows">' + rows + '</div>' + (sc === 'week' ? '<p class="lb-note">Quick Match win = 3 pts, draw = 1. A new league starts every Monday.</p>' : '');
  }
  function leagueHTML() {
    return '<div class="hpanel league"><div class="hp-head"><h3>' + I.trophy + ' League</h3><div class="lb-tabs">' +
      '<button class="lbt' + (NET.scope === 'week' ? ' on' : '') + '" data-action="lb" data-id="week">This week</button>' +
      '<button class="lbt' + (NET.scope === 'all' ? ' on' : '') + '" data-action="lb" data-id="all">All-time</button></div></div>' +
      '<div class="lb" id="lb">' + boardHTML() + '</div>' +
      '<button class="link-btn" data-action="ranks">How ranks work ' + I.chevRight + '</button></div>';
  }

  // Pick questions: the opponent's level sets the difficulty mix; questions seen in recent battles are skipped.
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
  // Combo: the 2nd correct answer in a row adds +10, the 3rd +20, then +30 for each one after that.
  function streakBefore(i, who) { var s = 0; for (var k = i - 1; k >= 0; k--) { var r = B.rounds[k]; if (!r || !(who === 'me' ? r.ok : r.bot.ok)) break; s++; } return s; }
  function comboBonus(prev) { return Math.min(30, prev * 10); }
  function limitOf(item) { var q = qOf(item); return LIMIT[item.sec][q.d] * 1000; }
  function totals(upTo) {
    var y = 0, b = 0, yc = 0, bc = 0, end = upTo == null ? (B.rounds || []).length : upTo;
    (B.rounds || []).forEach(function (r, k) { if (!r || !r.done || k >= end) return; y += r.pts; b += r.bot.pts; if (r.ok) yc++; if (r.bot.ok) bc++; });
    return { y: y, b: b, yc: yc, bc: bc };
  }

  /* =================================================================== hub */
  var MODES = {
    quick: { name: 'Quick Match', sub: 'Ranked · real players', ico: I.bolt, online: true, desc: 'Get matched with a player at your level. Wins push your rank up.' },
    friend: { name: 'Challenge a Friend', sub: 'Invite link · just for fun', ico: I.link, online: true, desc: 'Send a link on Telegram. Same questions, winner takes the bragging rights.' },
    bot: { name: 'vs Bot', sub: 'Practice · earn XP', ico: I.robot, online: false, desc: 'Rookie, Ace or Legend. Always online, always ready.' }
  };
  function modeOpen(id) { return !MODES[id].online || ONLINE || DEMO; }
  function screenHub() {
    stopTicker(); clearTimers(); closeLayer();
    var lv = lvl(P.xp), live = B && B.status === 'live' && B.list, rk = P.rating ? rankOf(P.rating) : null;
    var played = P.w + P.l + P.d, nb = Object.keys(P.badges || {}).length;
    $app.className = 'app page battle-page';
    $app.innerHTML = brandbar() +
      '<main class="hub">' +
      (live ? '<div class="resume-card"><div class="rs-l">' + oppFace(40) + '<div><b>Battle in progress</b><span>vs ' + esc(oppName()) + ' · ' + FORMATS[B.fmt].name + ' · question ' + Math.min(B.i + 1, B.list.length) + ' of ' + B.list.length + '</span></div></div><button class="gbtn sm" data-action="resume">Continue ' + I.chevRight + '</button></div>' : '') +
      '<section class="pcard">' +
        '<div class="pc-glow" aria-hidden="true"></div>' +
        '<div class="pc-id">' +
          '<button class="pc-av" data-action="profile" aria-label="Edit your battle card">' + lvRing(lv) + meFace(78) + '<span class="pc-lvl">' + lv.L + '</span></button>' +
          '<div class="pc-main"><div class="pc-name">' + (P.nick ? esc(P.nick) : 'New player') + '<button class="pc-edit" data-action="profile" aria-label="Edit name and avatar">' + I.edit + '</button></div>' +
            '<div class="pc-lv">Level ' + lv.L + ' <span>' + lv.into + ' / ' + lv.need + ' XP</span></div>' +
            '<div class="xpbar"><i style="width:' + pct(lv.into, lv.need) + '%"></i></div>' +
            '<button class="pc-rank" data-action="ranks">' + rankBadge(rk, 22) + '<span>' + (rk ? rk.name + ' · ' + P.rating : 'Unranked') + '</span>' + I.chevRight + '</button></div>' +
        '</div>' +
        '<div class="pc-stats">' +
          stat(P.w, 'Wins') + stat(played ? pct(P.w, played) + '%' : '–', 'Win rate') + stat((P.streak >= 2 ? '🔥' : '') + P.streak, 'Win streak') + stat(P.answered ? pct(P.correct, P.answered) + '%' : '–', 'Accuracy') +
        '</div>' +
      '</section>' +
      '<div class="hub-h"><h2>Choose your battle</h2>' + (P.lastWinDay !== dayKey() ? '<span class="daily">' + I.spark + ' First win today = double XP</span>' : '') + '</div>' +
      '<section class="modes">' + Object.keys(MODES).map(function (id, i) {
        var m = MODES[id], open = modeOpen(id);
        return '<button class="mode m-' + id + (open ? '' : ' soon') + '" data-action="mode" data-id="' + id + '" style="--i:' + i + '">' +
          '<span class="mode-art"><span class="mode-ico">' + m.ico + '</span></span>' +
          '<span class="mode-txt"><b>' + m.name + '</b><small>' + m.sub + '</small><span class="mode-desc">' + m.desc + '</span></span>' +
          (open ? '<span class="mode-cta">Play ' + I.chevRight + '</span>' : '<span class="mode-soon">' + I.lock + ' Soon</span>') + '</button>';
      }).join('') + '</section>' +
      '<section class="hub-grid">' +
        (ONLINE ? leagueHTML() :
        '<div class="hpanel league"><div class="hp-head"><h3>' + I.trophy + ' Weekly league</h3><span class="chip-soft">Opens with online battles</span></div>' +
          '<p class="hp-p">Every Quick Match win earns league points. The top players each week get a crown on their card.</p>' +
          '<div class="ladder">' + RANKS.map(function (r) { return '<span class="ld" title="' + r.name + '">' + rankBadge(r, 30) + '<small>' + r.name + '</small></span>'; }).join('') + '</div>' +
          '<button class="link-btn" data-action="ranks">How ranks work ' + I.chevRight + '</button></div>') +
        '<div class="hpanel"><div class="hp-head"><h3>' + I.star + ' Badges</h3><span class="chip-soft">' + nb + ' / ' + BADGES.length + '</span></div><div class="bdg-grid">' +
          BADGES.map(function (b) { var got = P.badges && P.badges[b[0]]; return '<span class="bdg' + (got ? ' got' : '') + '" title="' + esc(b[2] + ': ' + b[3]) + '"><i>' + b[1] + '</i><small>' + b[2] + '</small></span>'; }).join('') + '</div></div>' +
        '<div class="hpanel"><div class="hp-head"><h3>' + I.swords + ' Recent battles</h3></div>' +
          ((P.recent || []).length ? '<div class="recent">' + P.recent.map(function (r) {
            return '<div class="rc-row"><span class="rc-res ' + r.res + '">' + (r.res === 'w' ? 'W' : r.res === 'l' ? 'L' : 'D') + '</span><span class="rc-face">' + (r.bot ? botFace(r.bot, 26) : avatar(r.av, 26)) + '</span><span class="rc-txt"><b>vs ' + esc(r.opp) + '</b><small>' + esc(FORMATS[r.fmt] ? FORMATS[r.fmt].name : '') + '</small></span><span class="rc-sc">' + r.y + '–' + r.b + '</span></div>';
          }).join('') + '</div>' : '<p class="hp-empty">Your battles will show up here. Win one to start a streak!</p>') + '</div>' +
      '</section>' +
      '<details class="howto"><summary>' + I.info + ' How scoring works</summary><ul>' +
        '<li><b>Same questions</b> for both players, with a timer on every question.</li>' +
        '<li><b>Correct = 100 points + up to 50</b> for answering fast. Wrong or no answer = 0. Your first answer locks in.</li>' +
        '<li><b>Combos:</b> 2 right in a row +10, 3 in a row +20, then +30 each.</li>' +
        '<li><b>XP:</b> win 20–40 (harder opponents give more), draw 15, loss 8, +2 per correct answer. Your first win each day counts double.</li>' +
        '<li><b>Rank</b> comes from Quick Match only. Friend and bot battles never change it.</li>' +
      '</ul></details>' +
      '<footer class="foot">Unofficial practice. SAT® is a trademark of College Board, which is not affiliated with this site.</footer>' +
      '</main>';
    if (ONLINE) loadBoard(NET.scope);
  }
  function stat(v, l) { return '<div class="st"><b>' + v + '</b><small>' + l + '</small></div>'; }
  function lvRing(lv) {
    var r = 46, c = 2 * Math.PI * r, k = lv.into / lv.need;
    return '<svg class="lv-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="' + r + '" class="lr-bg"/><circle cx="50" cy="50" r="' + r + '" class="lr-fg" style="stroke-dasharray:' + c + ';stroke-dashoffset:' + c * (1 - k) + '"/></svg>';
  }

  /* --------------------------------------------------------------- profile + ranks */
  var afterProfile = null, pfAv = 0;
  function openProfile(after, first, err) {
    afterProfile = after || null; pfAv = P.av || 0;
    modal({ title: first ? 'Create your battle card' : 'Your battle card', cls: 'narrow pf-modal',
      body: '<div class="pf-top"><span id="pfPrev">' + avatar(pfAv, 72) + '</span><div><b id="pfNickPrev">' + esc(P.nick || 'Your name') + '</b><small>Level ' + lvl(P.xp).L + '</small></div></div>' +
        '<label class="field"><span>Nickname</span><input id="pfNick" type="text" maxlength="16" autocomplete="nickname" spellcheck="false" placeholder="e.g. Aziza_07" value="' + esc(P.nick) + '"></label>' +
        '<p class="field-err" id="pfErr" hidden></p>' +
        '<span class="field-lbl">Avatar</span><div class="pf-avs">' + AVATARS.map(function (a, i) { return '<button type="button" class="pf-av' + (i === pfAv ? ' on' : '') + '" data-action="pf-av" data-i="' + i + '" aria-label="Avatar ' + (i + 1) + '">' + avatar(i, 40) + '</button>'; }).join('') + '</div>' +
        '<p class="fine pf-note">' + I.info + '<span>3–16 letters or numbers. Other players see this name in online battles. ' + (ONLINE ? 'Your card is saved to your account in this browser. Google and Telegram sign-in are coming, so it can follow you to other devices.' : 'Signing in with Telegram or Google comes with online battles, so your level and badges can follow you to any device.') + '</span></p>',
      actions: [{ label: first ? 'Let’s go ' + I.chevRight : 'Save', action: 'pf-save', kind: 'primary' }] });
    var inp = $('#pfNick');
    inp.addEventListener('input', function () { $('#pfNickPrev').textContent = cleanNick(inp.value) || 'Your name'; });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); saveProfile(); } });
    if (err) { var er0 = $('#pfErr'); er0.textContent = err; er0.hidden = false; }
    setTimeout(function () { try { inp.focus(); } catch (e) { } }, 60);
  }
  var NICK_TAKEN = 'That nickname is taken. Try another one.';
  function saveProfile() {
    var inp = $('#pfNick'), nk = cleanNick(inp ? inp.value : ''), er = $('#pfErr');
    if (nk.length < 3) { er.textContent = 'Pick a nickname with at least 3 letters or numbers.'; er.hidden = false; if (inp) inp.focus(); sfx('bad'); return; }
    if (ONLINE) {
      var btn = $('[data-action="pf-save"]'); if (btn) { if (btn.disabled) return; btn.disabled = true; }
      netSaveNick(nk, pfAv).then(function () { profileSaved(nk); }, function (e) {
        if (btn) btn.disabled = false;
        if (e.message === 'nick_taken' || e.message === 'bad_nick') { er.textContent = e.message === 'nick_taken' ? NICK_TAKEN : 'Use only letters, numbers, spaces, dots and underscores.'; er.hidden = false; sfx('bad'); if (inp) inp.focus(); return; }
        profileSaved(nk);        // offline: kept on this device and saved online next time
      });
      return;
    }
    profileSaved(nk);
  }
  function profileSaved(nk) {
    P.nick = nk; P.av = pfAv; saveP(); if (!SLOT) Store.set('isatprep:name', nk); sfx('pick'); closeLayer();
    var f = afterProfile; afterProfile = null;
    if (f) f(); else screenHub();
  }
  function openRanks() {
    modal({ title: 'Ranks', cls: 'narrow',
      body: '<p class="rk-intro">Your rank comes from <b>Quick Match</b>. Everyone starts at <b>1000</b> rating in Bronze. Beat players to climb. Beating someone stronger gives more, losing to someone weaker costs more.</p>' +
        '<div class="rk-list">' + RANKS.slice().reverse().map(function (r) { return '<div class="rk-row">' + rankBadge(r, 34) + '<b>' + r.name + '</b><span>' + (r.min ? r.min + '+' : 'Start') + '</span></div>'; }).join('') + '</div>' +
        '<p class="fine">' + I.info + '<span>Friend battles and bot battles give XP but never change your rank.</span></p>',
      actions: [{ label: 'Got it', action: 'layer-close', kind: 'primary' }] });
  }

  /* --------------------------------------------------------------- mode → subject → opponent */
  function pickMode(id, card) {
    if (!modeOpen(id)) {
      sfx('bad'); card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      toast(id === 'quick' ? 'Quick Match opens soon. Battle a bot for now!' : 'Friend battles open soon. Battle a bot for now!'); return;
    }
    if (!P.nick) { openProfile(function () { pickMode(id, $('.mode[data-id="' + id + '"]') || card); }, true); return; }
    if (MODES[id].online && ONLINE && !NET.me) {
      if (card) card.classList.add('busy');
      netReady().then(function () {
        if (card) card.classList.remove('busy');
        if (NET.me) pickMode(id, $('.mode[data-id="' + id + '"]') || card);
      }, function (e) {
        if (card) card.classList.remove('busy');
        if (e.message === 'nick_taken') openProfile(function () { pickMode(id, $('.mode[data-id="' + id + '"]') || card); }, false, NICK_TAKEN);
        else toast(netErrText(e));
      });
      return;
    }
    if (B && B.status === 'live') {
      modal({ title: 'Start a new battle?', cls: 'narrow', body: '<p>Your battle against <b>' + esc(oppName()) + '</b> isn’t finished. Starting a new one ends it without a result.</p>', actions: [{ label: 'Continue old battle', action: 'resume' }, { label: 'Start new battle', action: 'drop-go', kind: 'primary' }] });
      flow.pendingMode = id; return;
    }
    flow.mode = id; sfx('pick'); sfx('whoosh');
    if (card) card.classList.add('launch');
    $$('.mode').forEach(function (m) { if (m !== card) m.classList.add('dim'); });
    later(screenSubject, wait(320));
  }
  function flowTop(step, of) {
    var m = MODES[flow.mode];
    return '<div class="flow-top"><button class="back-btn" data-action="' + (step > 1 ? 'back-subj' : 'hub') + '">' + I.chevLeft + ' Back</button><span class="flow-step m-' + flow.mode + '"><i>' + m.ico + '</i>' + m.name + (of > 1 ? ' · step ' + step + ' of ' + of : '') + '</span></div>';
  }
  function screenSubject() {
    clearTimers(); closeLayer();
    $app.className = 'app page battle-page';
    var icons = { rw: I.book, math: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 4H7l6 8-6 8h10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>', mixed: I.bolt };
    $app.innerHTML = brandbar() + '<main class="flow">' + flowTop(1, flow.mode === 'bot' ? 2 : 1) +
      '<h1 class="flow-title">Pick your subject</h1><p class="flow-sub">' + (flow.mode === 'quick' ? 'You’ll be matched with someone playing the same subject.' : flow.mode === 'friend' ? 'Your friend gets the same questions.' : 'The bot gets the same questions you do.') + '</p>' +
      '<div class="subj-grid">' + Object.keys(FORMATS).map(function (id, i) {
        var f = FORMATS[id];
        return '<button class="subj s-' + id + (flow.fmt === id ? ' last' : '') + '" data-action="pick-subj" data-id="' + id + '" style="--i:' + i + '"><span class="subj-ico">' + icons[id] + '</span><b>' + f.name + '</b><small>' + f.blurb + '</small><span class="subj-time">' + I.clock + f.mins + '</span>' + (flow.fmt === id ? '<span class="subj-last">Last played</span>' : '') + '</button>';
      }).join('') + '</div></main>';
  }
  function pickSubject(id, tile) {
    flow.fmt = id; choice.fmt = id; Store.set('isatprep:battle:fmt', id); sfx('pick');
    $$('.subj').forEach(function (t) { t.classList.add(t === tile ? 'chosen' : 'fade'); });
    later(function () { if (flow.mode === 'bot') screenOpponent(); else if (flow.mode === 'friend') screenInvite(); else screenSearch(); }, wait(480));
  }
  function screenOpponent() {
    clearTimers(); closeLayer();
    $app.className = 'app page battle-page';
    $app.innerHTML = brandbar() + '<main class="flow">' + flowTop(2, 2) +
      '<h1 class="flow-title">Pick your opponent</h1><p class="flow-sub">' + FORMATS[flow.fmt].name + ' · ' + FORMATS[flow.fmt].blurb + '</p>' +
      '<div class="opp-grid">' + Object.keys(BOTS).map(function (id, i) {
        var b = BOTS[id], r = record(id), stars = '';
        for (var k = 0; k < 3; k++) stars += '<i class="' + (k < b.stars ? 'on' : '') + '">' + I.star + '</i>';
        return '<button class="oc o-' + id + (flow.bot === id ? ' last' : '') + '" data-action="pick-opp" data-id="' + id + '" style="--i:' + i + '"><span class="opp-face">' + botFace(id, 72) + '</span>' +
          '<b>' + b.name + '</b><span class="opp-stars" aria-label="' + b.level + '">' + stars + '</span><small>' + b.tag + '</small>' +
          '<span class="opp-foot"><span class="opp-xp">+' + b.xp + ' XP win</span><span class="opp-rec">' + r.w + 'W · ' + r.l + 'L</span></span></button>';
      }).join('') + '</div></main>';
  }
  function pickOpponent(id, card) {
    flow.bot = id; choice.bot = id; Store.set('isatprep:battle:bot', id); sfx('pick');
    $$('.oc').forEach(function (t) { t.classList.add(t === card ? 'chosen' : 'fade'); });
    later(screenSearch, wait(480));
  }

  /* --------------------------------------------------------------- matchmaking */
  var mm = null;
  function screenSearch() {
    clearTimers(); closeLayer();
    var isBot = flow.mode === 'bot', f = FORMATS[flow.fmt];
    mm = { t0: now(), found: null, banks: false, iv: null };
    $app.className = 'app page battle-page mm-page';
    $app.innerHTML = '<main class="mm m-' + flow.mode + '">' +
      '<button class="mm-cancel" data-action="cancel-search">' + I.close + ' Cancel</button>' +
      '<div class="mm-stage" id="mmStage"><div class="radar"><i></i><i></i><i></i><span class="radar-sweep"></span><div class="radar-me">' + meFace(92) + '</div></div></div>' +
      '<h1 class="mm-title" id="mmTitle">' + (isBot ? 'Waking up ' + BOTS[flow.bot].name + '…' : 'Finding an opponent') + '</h1>' +
      '<p class="mm-sub">' + f.name + ' · ' + f.blurb + '</p>' +
      '<div class="mm-timer" id="mmTimer">0:00</div>' +
      '<div class="mm-extra" id="mmExtra">' + (isBot ? '' : '<span class="mm-online"><i></i>' + (DEMO ? 'Demo: simulated players' : 'Searching players at your level') + '</span>') + '</div>' +
      '</main>';
    mm.iv = setInterval(function () { var el = $('#mmTimer'); if (!el) { clearInterval(mm.iv); return; } el.textContent = fmtS(now() - mm.t0); }, 250);
    var secs = f.mix.map(function (m) { return m[0]; });
    loadBanks(secs, function (ok) {
      if (!ok) { clearInterval(mm.iv); $app.innerHTML = '<div class="boot"><p>Couldn’t load the questions. Check your connection.</p><button class="btn primary" onclick="location.reload()">Try again</button></div>'; return; }
      mm.banks = true; maybeFound();
    });
    if (isBot) later(function () { rollTo({ kind: 'bot', id: flow.bot }); }, wait(1300));
    else findHuman(function (opp) { rollTo(opp); });
  }
  // Quick Match. The real version asks the server for a player near your rating; the preview fakes one.
  function findHuman(cb) {
    later(fallback, FALLBACK_MS);
    if (DEMO) { if (!EMPTY) later(function () { cb(demoPlayer()); }, wait(Math.round(rnd(3200, 6000)))); return; }
    var fmt = flow.fmt, my = mm;
    my.stop = function () { if (my.stopped) return; my.stopped = true; if (!my.found) rpc('bm_leave_queue').catch(noop); };
    (function poll() {
      if (my.stopped || mm !== my || my.found) return;
      rpc('bm_queue', { p_fmt: fmt }).then(function (m) {
        if (!m) { later(poll, 2000); return; }
        if (my.stopped || mm !== my) { rpc('bm_forfeit', { p_id: m.id }).catch(noop); return; }
        cb(oppFromMatch(m));
      }, function () { later(poll, 4000); });
    })();
  }
  function demoPlayer() { return { kind: 'human', nick: pick(DEMO_NICKS), av: Math.floor(Math.random() * AVATARS.length), lvl: Math.floor(rnd(2, 16)), as: 'ace' }; }
  function fallback() {
    if (!mm || mm.found || !$('#mmExtra')) return;
    sfx('bad'); clearInterval(mm.iv); if (mm.stop) mm.stop();
    $('#mmTitle').textContent = 'No one’s online right now';
    $('.radar') && $('.radar').classList.add('idle');
    $('#mmExtra').innerHTML = '<p class="mm-fb">Battle a bot while you wait, or send a friend an invite link.</p><div class="mm-fb-acts"><button class="gbtn" data-action="fb-bot">' + I.robot + ' Play a bot</button><button class="gbtn white" data-action="fb-friend">' + I.link + ' Invite a friend</button></div><button class="link-btn" data-action="fb-again">Keep searching ' + I.redo + '</button>';
  }
  // The slot-machine roll that lands on the opponent.
  function rollTo(opp) {
    if (!mm || mm.found || !$('#mmStage')) return;
    mm.found = opp;
    var stage = $('#mmStage'), isBot = opp.kind === 'bot';
    stage.innerHTML = '<div class="roll"><div class="roll-me">' + meFace(84) + '<b>' + esc(nickOr()) + '</b></div><span class="roll-vs">VS</span><div class="roll-slot" id="rollSlot"><div class="roll-card" id="rollCard"></div></div></div>';
    $('#mmTitle').textContent = isBot ? 'Opponent ready' : 'Opponent found!';
    var faces = isBot ? Object.keys(BOTS).map(function (k) { return { html: botFace(k, 84), name: BOTS[k].name }; })
      : DEMO ? DEMO_NICKS.map(function (n, i) { return { html: avatar((i * 5) % AVATARS.length, 84), name: n }; })
      : AVATARS.map(function (a, i) { return { html: avatar(i, 84), name: '???' }; });
    var final = isBot ? { html: botFace(opp.id, 84), name: BOTS[opp.id].name } : { html: avatar(opp.av, 84), name: opp.nick };
    var gaps = RM ? [] : [55, 60, 65, 70, 80, 90, 105, 120, 140, 165, 195, 230], k = 0, card = $('#rollCard');
    (function spin() {
      if (!$('#rollCard')) return;
      if (k < gaps.length) {
        var f = faces[(k * 7 + 3) % faces.length]; card.innerHTML = f.html + '<b>' + esc(f.name) + '</b>'; card.classList.remove('tick'); void card.offsetWidth; card.classList.add('tick'); sfx('roll');
        later(spin, gaps[k++]);
      } else {
        card.innerHTML = final.html + '<b>' + esc(final.name) + '</b>' + (isBot ? '<small>' + BOTS[opp.id].level + ' bot</small>' : '<small>' + humanSub(opp) + '</small>');
        card.classList.remove('tick'); card.classList.add('land'); $('#rollSlot').classList.add('locked'); sfx('found');
        mm.rolled = true; later(maybeFound, wait(900));
      }
    })();
  }
  function maybeFound() {
    if (!mm || !mm.found || !mm.banks || !mm.rolled) return;
    clearInterval(mm.iv);
    var opp = mm.found; mm = null;
    startBattle(opp);
  }
  function stopSearch() { if (mm) { clearInterval(mm.iv); if (mm.stop) mm.stop(); } mm = null; }
  function cancelSearch() {
    stopSearch(); clearTimers(); sfx('tap');
    if (flow.roomId) { rpc('bm_cancel_room', { p_id: flow.roomId }).catch(noop); flow.roomId = null; }
    screenHub();
  }
  function humanSub(opp) { return 'Level ' + opp.lvl + (opp.rating ? ' · ' + rankOf(opp.rating).name : ''); }

  /* --------------------------------------------------------------- friend invite */
  function roomUrl(code) { return location.origin + location.pathname + '?room=' + code + (SLOT ? '&slot=' + (SLOT === '2' ? '3' : '2') : '') + (ONLINE && !CFG.battleOnline ? '&online=1' : ''); }
  function screenInvite() {
    clearTimers(); closeLayer();
    var f = FORMATS[flow.fmt], code = '';
    if (ONLINE) code = '·····';
    else for (var i = 0; i < 5; i++) code += 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.charAt(Math.floor(Math.random() * 32));
    flow.room = code; flow.roomId = null;
    var url = roomUrl(code);
    var tg = 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent('⚔️ 1v1 me in isatprep Battle Mode (' + f.name + '). Tap to join!');
    $app.className = 'app page battle-page mm-page';
    $app.innerHTML = '<main class="mm m-friend invite">' +
      '<button class="mm-cancel" data-action="cancel-search">' + I.close + ' Cancel</button>' +
      '<h1 class="mm-title">Challenge a friend</h1><p class="mm-sub">' + f.name + ' · ' + f.blurb + ' · the battle starts when they join</p>' +
      '<div class="inv-slots"><div class="islot me">' + meFace(84) + '<b>' + esc(nickOr()) + '</b><small>Ready</small></div><span class="roll-vs">VS</span>' +
        '<div class="islot wait" id="friendSlot"><span class="islot-q">?</span><b>Waiting…</b><small>Share the link</small></div></div>' +
      '<div class="inv-code"><small>Room code</small><b id="invCode">' + code.split('').map(function (ch) { return '<i>' + ch + '</i>'; }).join('') + '</b></div>' +
      '<div class="inv-link"><code id="invUrl">' + (ONLINE ? 'Creating your room…' : esc(url.replace(/^https?:\/\//, ''))) + '</code></div>' +
      '<div class="inv-acts' + (ONLINE ? ' wait' : '') + '" id="invActs"><a class="gbtn tg" id="invTg" href="' + tg + '" target="_blank" rel="noopener">' + I.tg + ' Share on Telegram</a><button class="gbtn white" id="invCopy" data-action="copy-link" data-url="' + esc(url) + '">' + I.copy + ' Copy link</button></div>' +
      '</main>';
    if (ONLINE) openRoom(f);
    if (DEMO && !EMPTY) later(function () { friendJoined({ kind: 'human', nick: pick(DEMO_NICKS), av: Math.floor(Math.random() * AVATARS.length), lvl: Math.floor(rnd(2, 16)), as: 'ace' }); }, wait(6000));
    loadBanks(f.mix.map(function (m) { return m[0]; }), function () { });
  }
  function openRoom(f) {
    netReady().then(function () { return rpc('bm_create_room', { p_fmt: flow.fmt }); }).then(function (m) {
      if (!$('#friendSlot')) { rpc('bm_cancel_room', { p_id: m.id }).catch(noop); return; }
      flow.roomId = m.id; flow.room = m.code;
      var url = roomUrl(m.code);
      $('#invCode').innerHTML = m.code.split('').map(function (ch) { return '<i>' + ch + '</i>'; }).join('');
      $('#invUrl').textContent = url.replace(/^https?:\/\//, '');
      $('#invTg').href = 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent('⚔️ 1v1 me in isatprep Battle Mode (' + f.name + '). Tap to join!');
      $('#invCopy').setAttribute('data-url', url); $('#invActs').classList.remove('wait'); sfx('pick');
      later(function check() {
        if (!$('#friendSlot') || flow.roomId !== m.id) return;
        rpc('bm_match', { p_id: m.id }).then(function (v) {
          if (!$('#friendSlot') || flow.roomId !== m.id) return;
          if (v.status === 'live' && v.opp) { flow.roomId = null; friendJoined(oppFromMatch(v)); }
          else if (v.status === 'waiting') later(check, 2000);
        }, function () { later(check, 4000); });
      }, 2000);
    }, function (e) {
      if (!$('#friendSlot')) return;
      if (e.message === 'nick_taken') { openProfile(function () { screenInvite(); }, false, NICK_TAKEN); return; }
      $('#invUrl').textContent = netErrText(e);
    });
  }
  // Opening a friend's ?room= link
  function joinRoom(code) {
    if (!P.nick) { openProfile(function () { joinRoom(code); }, true); return; }
    clearTimers(); closeLayer();
    $app.className = 'app page battle-page mm-page';
    $app.innerHTML = '<main class="mm m-friend invite">' +
      '<button class="mm-cancel" data-action="hub">' + I.close + ' Cancel</button>' +
      '<h1 class="mm-title" id="mmTitle">Joining room ' + esc(code) + '…</h1><p class="mm-sub" id="joinSub">Connecting</p>' +
      '<div class="inv-slots"><div class="islot wait" id="hostSlot"><span class="islot-q">?</span><b>Your friend</b><small>…</small></div><span class="roll-vs">VS</span>' +
        '<div class="islot me">' + meFace(84) + '<b>' + esc(nickOr()) + '</b><small>Ready</small></div></div></main>';
    netReady().then(function () { return rpc('bm_join_room', { p_code: code }); }).then(function (m) {
      if (!$('#hostSlot')) { rpc('bm_forfeit', { p_id: m.id }).catch(noop); return; }
      flow.mode = 'friend'; flow.fmt = m.fmt;
      var opp = oppFromMatch(m), f = FORMATS[m.fmt], slot = $('#hostSlot');
      slot.className = 'islot joined'; slot.innerHTML = avatar(opp.av, 84) + '<b>' + esc(opp.nick) + '</b><small>' + humanSub(opp) + '</small>';
      $('#mmTitle').textContent = 'You joined ' + opp.nick + '’s room!'; $('#joinSub').textContent = f.name + ' · ' + f.blurb; sfx('found');
      loadBanks(f.mix.map(function (x) { return x[0]; }), function (ok) {
        if (!ok) { toast('Couldn’t load the questions. Check your connection.'); return; }
        later(function () { startBattle(opp); }, wait(1400));
      });
    }, function (e) {
      if (e.message === 'nick_taken') { openProfile(function () { joinRoom(code); }, false, NICK_TAKEN); return; }
      toast(netErrText(e)); screenHub();
    });
  }
  function friendJoined(opp) {
    var slot = $('#friendSlot'); if (!slot) return;
    slot.className = 'islot joined'; slot.innerHTML = avatar(opp.av, 84) + '<b>' + esc(opp.nick) + '</b><small>' + humanSub(opp) + ' · joined!</small>'; sfx('found');
    later(function () { var f = FORMATS[flow.fmt]; loadBanks(f.mix.map(function (m) { return m[0]; }), function (ok) { if (ok) startBattle(opp); }); }, wait(1400));
  }
  function copyLink(url, btn) {
    var done = function () { if (btn) { btn.innerHTML = I.check + ' Copied!'; setTimeout(function () { if (btn.isConnected) btn.innerHTML = I.copy + ' Copy link'; }, 1600); } sfx('pick'); };
    try { navigator.clipboard.writeText(url).then(done, function () { toast(url); }); } catch (e) { toast(url); }
  }

  /* --------------------------------------------------------------- start + VS */
  function startBattle(opp) {
    var m = opp.match, list;
    if (m) {
      delete opp.match;
      list = m.items.map(function (it) { return { sec: it.sec, n: bankN(it), id: it.id }; });
      B = { v: 2, mode: m.kind, fmt: m.fmt, bot: null, opp: opp, list: list, i: 0, rounds: [], status: 'live', startedAt: now(), qStart: 0, seen: false,
        net: { id: m.id, side: m.side, oppN: m.opp_n || 0, q: [], final: null } };
    } else {
      var behave = opp.kind === 'bot' ? opp.id : (opp.as || 'ace');
      list = pickQuestions(flow.fmt, behave);
      B = { v: 2, mode: flow.mode, fmt: flow.fmt, bot: behave, opp: opp, list: list, i: 0, rounds: [], status: 'live', startedAt: now(), qStart: 0, seen: false };
    }
    var recent = getJSON(RECENT, []).concat(list.map(function (it) { return qOf(it).id; })).slice(-150); setJSON(RECENT, recent);
    saveB();
    if (B.net) netWatch();
    screenVS(beginQuestion);
  }
  function screenVS(cb) {
    clearTimers(); closeLayer();
    var lv = lvl(P.xp), rk = P.rating ? rankOf(P.rating) : null;
    var oppSub = B.opp.kind === 'bot' ? BOTS[B.opp.id].level + ' bot' : humanSub(B.opp);
    $app.className = 'app page battle-page vs-page';
    $app.innerHTML = '<main class="vs2" id="vs2">' +
      '<div class="vs2-half you"><div class="vs2-card">' + meFace(116, 'big') + '<b>' + esc(nickOr()) + '</b><small>Level ' + lv.L + ' · ' + (rk ? rk.name : 'Unranked') + '</small></div></div>' +
      '<div class="vs2-half opp"><div class="vs2-card">' + oppFace(116) + '<b>' + esc(oppName()) + '</b><small>' + oppSub + '</small></div></div>' +
      '<div class="vs2-badge" id="vsBadge">VS</div>' +
      '<div class="vs2-info">' + MODES[B.mode].name + ' · ' + FORMATS[B.fmt].name + ' · ' + B.list.length + ' questions</div>' +
      '<div class="vs2-count" id="vsCount" aria-live="assertive"></div>' +
      '</main>';
    sfx('whoosh');
    later(function () { var m = $('#vs2'); if (!m) return; m.classList.add('slam'); sfx('slam'); buzz(30); }, wait(520));
    var seq = ['3', '2', '1', 'GO!'], k = 0;
    later(function count() {
      var el = $('#vsCount'); if (!el) return;
      if (k < seq.length) {
        el.textContent = seq[k]; el.className = 'vs2-count show' + (seq[k] === 'GO!' ? ' go' : ''); void el.offsetWidth; el.classList.add('pop');
        sfx(seq[k] === 'GO!' ? 'go' : 'count'); k++;
        later(count, wait(seq[k - 1] === 'GO!' ? 520 : 720));
      } else cb();
    }, wait(1500));
  }

  /* =================================================================== battle screen */
  var view = { ticker: null, pending: null, revealTimer: null, calcOpen: false, lastSec: -1 };
  function curItem() { return B.list[B.i]; }
  function beginQuestion() {
    if (B.net) {
      B.qStart = now();
      B.rounds[B.i] = { done: false, a: null, ok: false, pts: 0, ms: 0, combo: 0, bot: pendingOpp() };
      saveB(); view.pending = null; screenBattle();
      netOp({ op: 'open', idx: B.i });
      return;
    }
    var it = curItem(), q = qOf(it), lim = limitOf(it);
    B.qStart = now();
    var bot = botAttempt(B.bot, it.sec, q, lim);
    if (bot.ms > lim) bot.ok = false;
    var prev = streakBefore(B.i, 'bot');
    bot.combo = bot.ok ? prev + 1 : 0;
    bot.pts = bot.ok ? points(true, bot.ms, lim) + comboBonus(prev) : 0;
    B.rounds[B.i] = { done: false, a: null, ok: false, pts: 0, ms: 0, combo: 0, bot: bot };
    saveB(); view.pending = null; screenBattle();
  }
  function dotsHTML(who) {
    return '<div class="sb-dots ' + who + '">' + B.list.map(function (x, k) { var rr = B.rounds[k], ok = rr && rr.done && (who === 'me' || !rr.bot.pending) ? (who === 'me' ? rr.ok : rr.bot.ok) : null; return '<i class="' + (k === B.i && who === 'me' ? 'cur ' : '') + (ok === null ? '' : ok ? 'ok' : 'bad') + '"></i>'; }).join('') + '</div>';
  }
  function share(tt) { var s = tt.y + tt.b; return s ? Math.max(8, Math.min(92, tt.y / s * 100)) : 50; }
  function screenBattle() {
    var it = curItem(), q = qOf(it), sec = it.sec, tt = totals(), isMath = sec === 'math';
    var myC = streakBefore(B.rounds[B.i].done ? B.i + 1 : B.i, 'me');
    $app.className = 'app test practice battle ' + (isMath ? 'math' : 'rw') + (view.calcOpen && isMath ? ' calc-open' : '');
    $app.innerHTML =
      '<header class="tb btb">' +
        '<div class="tb-left"><button class="icon-btn" data-action="quit" aria-label="Quit battle" title="Quit">' + I.close + '</button><span class="btb-fmt">' + FORMATS[B.fmt].name + '</span></div>' +
        '<div class="tb-center"><div class="tug">' +
          '<div class="tug-side me' + (myC >= 3 ? ' fire' : '') + '">' + meFace(36) + '<div class="tug-who"><small>' + esc(nickOr()) + '</small><b id="sbYou">' + tt.y + '</b></div><span class="combo" id="comboMe">' + (myC >= 2 ? '🔥×' + myC : '') + '</span></div>' +
          '<div class="tug-mid"><div class="tug-bar"><i id="tugFill" style="width:' + share(tt) + '%"></i><span class="tug-knot" id="tugKnot" style="left:' + share(tt) + '%"></span></div>' + dotsHTML('me') + dotsHTML('opp') + '</div>' +
          '<div class="tug-side opp"><span class="combo" id="comboOpp"></span><div class="tug-who"><small>' + esc(oppName()) + '</small><b id="sbBot">' + tt.b + '</b></div>' + oppFace(36) + '</div>' +
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
    if (sec === 'rw') { stage.className = 'stage split q-enter'; stage.innerHTML = '<section class="pane passage-pane"><div class="passage">' + q.p + '</div></section><div class="divider" aria-hidden="true"></div><section class="pane question-pane" id="qPane">' + body + '</section>'; }
    else { stage.className = 'stage single q-enter'; stage.innerHTML = '<section class="pane question-pane math-pane" id="qPane"><div class="math-col">' + body + '</div></section>'; }
    paintAnswer(); paintRound(); renderMath(stage);
    if (isMath && view.calcOpen) mountDesmos();
    view.lastSec = -1; startTicker(); tick();
  }
  function paintAnswer() {
    var it = curItem(), q = qOf(it), sec = it.sec, r = B.rounds[B.i], box = $('#answerArea'), done = r.done, key = done ? keyOf(sec, q) : null;
    var mine = done ? r.a : view.pending, on = oppName();
    if (q.t === 'mcq') {
      box.innerHTML = '<div class="choices' + (done ? ' review' : '') + '" role="radiogroup" aria-label="Answer choices">' + q.c.map(function (c, i) {
        var L = 'ABCD'.charAt(i), sel = mine === L, isKey = done && L === key, wrong = done && sel && !isKey, botHere = done && r.bot.a === L;
        return '<div class="choice-row' + (sel && !done ? ' selected' : '') + (isKey ? ' key' : '') + (wrong ? ' wrong' : '') + '"><div class="choice" role="radio" tabindex="0" aria-checked="' + sel + '" data-action="choose" data-letter="' + L + '"><span class="letter">' + L + '</span><span class="ctext">' + c + '</span>' +
          '<span class="ctags">' + (done && sel ? '<span class="who-tag you">' + (isKey ? I.check : I.cross) + ' You</span>' : '') + (botHere ? '<span class="who-tag bot ' + (isKey ? 'ok' : 'bad') + '">' + esc(on) + '</span>' : '') + (isKey && !sel ? '<span class="tag ok">' + I.check + ' Correct</span>' : '') + '</span></div></div>';
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
  function oppStatus(state) {
    var on = esc(oppName());
    if (state === 'in') return oppFace(26) + '<span>' + on + ' locked in ' + I.check + '</span>';
    if (state === 'answering') return oppFace(26) + '<span>' + on + ' is answering<i class="dots"><b></b><b></b><b></b></i></span>';
    return oppFace(26) + '<span>' + on + ' is thinking<i class="dots"><b></b><b></b><b></b></i></span>';
  }
  function paintRound() {
    var it = curItem(), q = qOf(it), r = B.rounds[B.i], box = $('#roundBox'), on = esc(oppName());
    if (!r.done) {
      var botIn = oppIn(r);
      box.innerHTML = '<div class="lock-row"><button class="gbtn lock-btn" id="lockBtn" data-action="lock">' + I.check + ' Lock in answer</button>' +
        '<span class="bot-status' + (botIn ? ' in' : '') + '" id="botStatus">' + oppStatus(botIn ? 'in' : 'think') + '</span></div>';
      paintLock(); return;
    }
    var last = B.i === B.list.length - 1;
    var you = r.a == null ? '<span class="rr-res to">' + I.clock + ' No answer</span>' : r.ok ? '<span class="rr-res ok">' + I.check + ' Correct</span>' : '<span class="rr-res bad">' + I.cross + ' Wrong</span>';
    var pend = !!r.bot.pending, oppLate = !pend && (B.net ? r.bot.a == null : r.bot.ms > limitOf(it));
    var bres = pend ? '<span class="rr-res wait">' + (B.net && B.net.final ? 'No answer' : 'Answering<i class="dots"><b></b><b></b><b></b></i>') + '</span>' : oppLate ? '<span class="rr-res to">' + I.clock + ' No answer</span>' : r.bot.ok ? '<span class="rr-res ok">' + I.check + ' Correct</span>' : '<span class="rr-res bad">' + I.cross + ' Wrong</span>';
    box.innerHTML = '<div class="round-card">' +
      '<div class="rc-side' + (r.ok ? ' ok' : ' bad') + '">' + meFace(32) + '<div><small>You · ' + (r.a == null ? 'time ran out' : fmtS(r.ms)) + '</small>' + you + (r.combo >= 2 ? '<span class="rc-combo">🔥 ×' + r.combo + '</span>' : '') + '</div><b class="rc-pts">+' + r.pts + '</b></div>' +
      '<div class="rc-side opp' + (pend ? ' wait' : r.bot.ok ? ' ok' : ' bad') + '">' + oppFace(32) + '<div><small>' + on + (pend ? '' : ' · ' + (oppLate ? 'time ran out' : fmtS(r.bot.ms))) + '</small>' + bres + (r.bot.combo >= 2 ? '<span class="rc-combo">🔥 ×' + r.bot.combo + '</span>' : '') + '</div><b class="rc-pts">' + (pend ? '…' : '+' + r.bot.pts) + '</b></div>' +
      '</div>' +
      (view.showX ? '<div class="explain"><b>' + I.spark + ' Explanation</b><div>' + q.x + '</div></div>' : '') +
      '<div class="fb-actions">' + (view.showX ? '' : '<button class="btn ghost" data-action="show-x">' + I.spark + ' Show explanation</button>') +
      '<button class="gbtn" data-action="next-q">' + (last ? I.trophy + ' See results' : 'Next question ' + I.chevRight) + '</button></div>';
    renderMath(box);
  }
  function paintLock() { var b = $('#lockBtn'); if (b) b.disabled = !view.pending; }
  function choose(L) {
    var r = B.rounds[B.i]; if (r.done) return;
    view.pending = L; sfx('tap');
    $$('.choice-row').forEach(function (row) { var on = row.querySelector('[data-letter]').getAttribute('data-letter') === L; row.classList.toggle('selected', on); row.querySelector('.choice').setAttribute('aria-checked', on); });
    paintLock();
  }
  function lockIn(timedOut) {
    var it = curItem(), q = qOf(it), r = B.rounds[B.i], lim = limitOf(it); if (r.done) return;
    var ms = Math.min(now() - B.qStart, lim), prev = streakBefore(B.i, 'me');
    r.a = timedOut ? null : view.pending; r.ms = ms;
    r.ok = !timedOut && isRight(it.sec, q, r.a);
    r.combo = r.ok ? prev + 1 : 0;
    r.pts = r.ok ? points(true, ms, lim) + comboBonus(prev) : 0;
    stopTicker();
    var finish = function () {
      r.done = true; view.showX = false; saveB();
      var from = $('#answerArea');
      paintAnswer(); paintRound(); renderMath($('#answerArea'));
      sfx(r.ok ? 'ok' : 'bad'); if (!r.ok) buzz(60);
      if (r.combo >= 2) later(function () { sfx('combo'); }, 180);
      floatText('+' + r.pts, from, $('#sbYou'), r.ok ? 'ok' : 'zero');
      if (!r.bot.pending) later(function () { floatText('+' + r.bot.pts, $('#botStatus') || $('#roundBox'), $('#sbBot'), r.bot.ok ? 'opp' : 'zero'); }, 220);
      later(paintScore, wait(300));
    };
    // Reveal straight away (checked here first); online, the server's check and timing replace these numbers a moment later.
    saveB(); finish();
    if (B.net) netOp({ op: 'answer', idx: B.i, a: r.a });
  }
  function paintScore() {
    var tt = totals(), before = totals(B.i), a = $('#sbYou'), b = $('#sbBot'), r = B.rounds[B.i];
    if (a) { countTo(a, before.y, tt.y, 600); a.classList.remove('bump'); void a.offsetWidth; a.classList.add('bump'); }
    if (b) { countTo(b, before.b, tt.b, 600); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
    var w = share(tt), fill = $('#tugFill'), knot = $('#tugKnot');
    if (fill) fill.style.width = w + '%'; if (knot) { knot.style.left = w + '%'; knot.classList.remove('jolt'); void knot.offsetWidth; knot.classList.add('jolt'); }
    var dots = $$('.sb-dots.me i'), bdots = $$('.sb-dots.opp i');
    if (dots[B.i]) dots[B.i].className = 'cur ' + (r.ok ? 'ok' : 'bad');
    if (bdots[B.i] && !r.bot.pending) bdots[B.i].className = r.bot.ok ? 'ok' : 'bad';
    var cm = $('#comboMe'), co = $('#comboOpp'), side = $('.tug-side.me');
    if (cm) { cm.textContent = r.combo >= 2 ? '🔥×' + r.combo : ''; if (r.combo >= 2) { cm.classList.remove('pop'); void cm.offsetWidth; cm.classList.add('pop'); } }
    if (co) { co.textContent = r.bot.combo >= 2 ? '🔥×' + r.bot.combo : ''; if (r.bot.combo >= 2) { co.classList.remove('pop'); void co.offsetWidth; co.classList.add('pop'); } }
    if (side) side.classList.toggle('fire', r.combo >= 3);
  }
  function nextQuestion() {
    clearTimeout(view.revealTimer); clearTimers();
    if (B.i >= B.list.length - 1) { finishBattle(); return; }
    B.i++; saveB(); sfx('whoosh'); beginQuestion();
  }
  function startTicker() { stopTicker(); view.ticker = setInterval(tick, 200); }
  function stopTicker() { if (view.ticker) clearInterval(view.ticker); view.ticker = null; }
  function tick() {
    if (!B || B.status !== 'live' || !$('#bqTimer')) return stopTicker();
    var it = curItem(), r = B.rounds[B.i], lim = limitOf(it);
    var left = r.done ? Math.max(0, lim - r.ms) : Math.max(0, lim - (now() - B.qStart));
    var fg = $('#bqFg'), tx = $('#bqTxt'), c = 2 * Math.PI * 17, secs = Math.ceil(left / 1000);
    if (fg) { fg.style.strokeDasharray = c; fg.style.strokeDashoffset = c * (1 - left / lim); }
    if (tx) tx.textContent = secs;
    $('#bqTimer').classList.toggle('urgent', left < 10000 && !r.done);
    $('#bqTimer').classList.toggle('final', left <= 5000 && !r.done);
    if (r.done) return stopTicker();
    if (left <= 5000 && left > 0 && secs !== view.lastSec) { view.lastSec = secs; sfx('tick'); }
    var st = $('#botStatus');
    if (st && !st.classList.contains('in') && oppIn(r)) {
      st.classList.add('in'); st.innerHTML = oppStatus('in'); sfx('oppIn');
    }
    if (left <= 0) lockIn(true);
  }

  /* =================================================================== results + rewards */
  function finishBattle() {
    if (B.net && !B.net.final) { screenWaitOpp(); return; }
    if (B.net) for (var k = 0; k < B.list.length; k++) if (!B.rounds[k]) B.rounds[k] = blankRound();
    var tt = totals(), res = B.net ? B.net.final.result : tt.y > tt.b ? 'w' : tt.y < tt.b ? 'l' : 'd';
    if (B.status !== 'done') {
      B.status = 'done'; B.result = res; B.endedAt = now();
      if (B.opp.kind === 'bot') { var r = S[B.opp.id] || { w: 0, l: 0, d: 0 }; r[res]++; S[B.opp.id] = r; setJSON(STATS, S); }
      if (B.net && B.mode === 'quick' && B.net.final.rating) P.rating = B.net.final.rating;
      B.rewards = applyRewards(res, tt);
      saveB(); saveP(); pushProgress();
    }
    screenResult();
  }
  function applyRewards(res, tt) {
    var n = B.list.length, lines = [], winXp = B.opp.kind === 'bot' ? BOTS[B.opp.id].xp : 30;
    var bestC = 0, fastest = 0; B.rounds.forEach(function (r) { if (r.combo > bestC) bestC = r.combo; if (r.ok && (!fastest || r.ms < fastest)) fastest = r.ms; });
    lines.push(res === 'w' ? ['Victory', winXp] : res === 'd' ? ['Draw', 15] : ['Good fight', 8]);
    if (tt.yc) lines.push(['Correct answers × ' + tt.yc, tt.yc * 2]);
    if (bestC >= 3) lines.push(['Best combo ×' + bestC, Math.min(25, 5 * (bestC - 2))]);
    if (res === 'w' && P.lastWinDay !== dayKey()) { lines.push(['First win of the day', winXp]); P.lastWinDay = dayKey(); }
    var total = 0; lines.forEach(function (l) { total += l[1]; });
    var xp0 = P.xp || 0;
    P.xp = xp0 + total; P.battles = (P.battles || 0) + 1; P[res] = (P[res] || 0) + 1;
    if (res === 'w') { P.streak = (P.streak || 0) + 1; if (P.streak > (P.best || 0)) P.best = P.streak; } else if (res === 'l') P.streak = 0;
    P.correct = (P.correct || 0) + tt.yc; P.answered = (P.answered || 0) + n;
    if (fastest && (!P.fastest || fastest < P.fastest)) P.fastest = fastest;
    if (bestC > (P.bestCombo || 0)) P.bestCombo = bestC;
    // badges
    var half = Math.floor(n / 2), ht = totals(half), hr = new Date().getHours(), got = [];
    var checks = { first: res === 'w', streak3: P.streak >= 3, streak10: P.streak >= 10, legend: res === 'w' && B.opp.kind === 'bot' && B.opp.id === 'legend', perfect: res === 'w' && tt.yc === n,
      combo5: bestC >= 5, speed: !!fastest && fastest < 10000, comeback: res === 'w' && half > 0 && ht.y < ht.b, b10: P.battles >= 10, b50: P.battles >= 50, owl: hr >= 23 || hr < 4 };
    P.badges = P.badges || {};
    BADGES.forEach(function (b) { if (checks[b[0]] && !P.badges[b[0]]) { P.badges[b[0]] = now(); got.push(b[0]); } });
    P.recent = [{ res: res, opp: oppName(), bot: B.opp.kind === 'bot' ? B.opp.id : null, av: B.opp.av, fmt: B.fmt, y: tt.y, b: tt.b, at: now() }].concat(P.recent || []).slice(0, 6);
    return { lines: lines, total: total, xp0: xp0, xp1: P.xp, badges: got };
  }
  function screenResult() {
    stopTicker(); clearTimers(); closeLayer();
    var tt = totals(), on = oppName(), res = B.result || (tt.y > tt.b ? 'w' : tt.y < tt.b ? 'l' : 'd'), n = B.list.length, rw = B.rewards || { lines: [], total: 0, xp0: P.xp, xp1: P.xp, badges: [] };
    var anim = !B.seen, word = res === 'w' ? 'VICTORY' : res === 'l' ? 'DEFEAT' : 'DRAW';
    var fin = B.net && B.net.final;
    var sub = fin && fin.forfeit === 'opp' ? esc(on) + ' left the battle, so the win is yours!' : fin && fin.forfeit === 'me' ? 'You left the battle.' :
      res === 'w' ? 'You beat ' + esc(on) + '!' + (B.opp.kind === 'bot' && B.opp.id !== 'legend' ? ' Ready for a tougher opponent?' : '') : res === 'l' ? esc(on) + ' won this one. Check the explanations, then take your revenge.' : 'Dead even. Rematch to settle it.';
    var yTime = 0, bTime = 0; B.rounds.forEach(function (r, k) { yTime += r.ms; bTime += Math.min(r.bot.ms, limitOf(B.list[k])); });
    var L0 = lvl(rw.xp0), L1 = lvl(rw.xp1);
    var tgText = (res === 'w' ? '⚔️ I beat ' + on + ' ' + tt.y + '–' + tt.b : res === 'l' ? '⚔️ ' + on + ' beat me ' + tt.b + '–' + tt.y + '. Revenge soon' : '⚔️ ' + tt.y + '–' + tt.y + ' draw vs ' + on) + ' in isatprep Battle Mode (' + FORMATS[B.fmt].name + '). Can you do better?';
    var tg = 'https://t.me/share/url?url=' + encodeURIComponent(location.origin + location.pathname) + '&text=' + encodeURIComponent(tgText);
    $app.className = 'app page battle-page';
    $app.innerHTML = brandbar() +
      '<main class="results battle-res' + (anim ? ' anim' : '') + '">' +
      '<section class="res-top ' + res + '">' +
        '<div class="res-banner" aria-label="' + word + '">' + word.split('').map(function (ch, i) { return '<span style="--i:' + i + '">' + ch + '</span>'; }).join('') + '</div>' +
        '<p class="res-sub">' + sub + '</p>' +
        '<div class="final-board"><div class="fb-side' + (res === 'w' ? ' win' : '') + '">' + (res === 'w' ? '<span class="crown">👑</span>' : '') + meFace(64) + '<b id="fbY">' + (anim ? 0 : tt.y) + '</b><small>' + esc(nickOr()) + '</small></div><span class="fb-vs">VS</span>' +
          '<div class="fb-side' + (res === 'l' ? ' win' : '') + '">' + (res === 'l' ? '<span class="crown">👑</span>' : '') + oppFace(64) + '<b id="fbB">' + (anim ? 0 : tt.b) + '</b><small>' + esc(on) + '</small></div></div>' +
        '<div class="res-acts"><button class="gbtn white" data-action="rematch">' + I.redo + ' Rematch</button><button class="gbtn glass3" data-action="hub">' + I.home + ' Battle Mode</button><a class="gbtn tg" href="' + tg + '" target="_blank" rel="noopener">' + I.tg + ' Share</a></div>' +
      '</section>' +
      '<div class="res-grid">' +
        '<section class="hpanel rewards"><div class="hp-head"><h3>' + I.spark + ' Rewards</h3><b class="rw-total">+<span id="rwTotal">' + (anim ? 0 : rw.total) + '</span> XP</b></div>' +
          '<div class="rw-lines">' + rw.lines.map(function (l, i) { return '<div class="rw-line" style="--i:' + i + '"><span>' + esc(l[0]) + '</span><b>+' + l[1] + '</b></div>'; }).join('') + '</div>' +
          '<div class="rw-level"><span class="rw-lv" id="rwLv">Level ' + (anim ? L0.L : L1.L) + '</span><span class="rw-xp" id="rwXp">' + (anim ? L0.into : L1.into) + ' / ' + (anim ? L0.need : L1.need) + ' XP</span></div>' +
          '<div class="xpbar big"><i id="rwBar" style="width:' + pct(anim ? L0.into : L1.into, anim ? L0.need : L1.need) + '%"></i></div>' +
          (rw.badges.length ? '<div class="new-badges"><small>New badge' + (rw.badges.length > 1 ? 's' : '') + '!</small><div>' + rw.badges.map(function (id, i) { var b = BADGES.filter(function (x) { return x[0] === id; })[0]; return '<span class="bdg got nb" style="--i:' + i + '" title="' + esc(b[3]) + '"><i>' + b[1] + '</i><small>' + b[2] + '</small></span>'; }).join('') + '</div></div>' : '') +
          '<div class="rw-rank">' + rankBadge(P.rating ? rankOf(P.rating) : null, 26) + '<span>' + (fin && B.mode === 'quick' && fin.rating ? 'Rating <b class="' + (fin.delta >= 0 ? 'okc' : 'badc') + '">' + (fin.delta >= 0 ? '+' : '') + (fin.delta || 0) + '</b> · now ' + fin.rating + ' (' + rankOf(fin.rating).name + ')' : B.mode === 'quick' && !ONLINE ? 'Ranked rating starts when online battles open.' : 'Unranked battle. Play Quick Match to earn a rank.') + '</span></div>' +
        '</section>' +
        '<section class="hpanel"><div class="hp-head"><h3>' + I.trophy + ' Battle stats</h3></div><div class="bstats">' +
          bstat('Correct', tt.yc + '/' + n, tt.bc + '/' + n) + bstat('Avg. time', fmtS(yTime / n), fmtS(bTime / n)) +
          bstat('Best combo', maxCombo('me') ? '×' + maxCombo('me') : '–', maxCombo('opp') ? '×' + maxCombo('opp') : '–') +
          '<div class="bs-foot"><span>' + meFace(20) + ' You</span><span>' + oppFace(20) + ' ' + esc(on) + '</span></div>' +
        '</div></section>' +
      '</div>' +
      '<section class="panel"><div class="panel-head"><h2>Question by question</h2><small class="muted">Tap a question to see it with the explanation</small></div><div class="res-rows">' +
        B.list.map(function (it, k) {
          var q = qOf(it), r = B.rounds[k];
          return '<button class="res-row br-row" data-action="open-q" data-k="' + k + '"><span class="rr-n ' + (r.ok ? 'ok' : 'bad') + '">' + (k + 1) + '</span><span class="rr-d">' + SEC[it.sec].short + ' · ' + esc(q.sk) + ' · ' + DIFF[q.d] + '</span>' +
            '<span class="rr-a">You <b class="' + (r.ok ? 'okc' : 'badc') + '">+' + r.pts + '</b> · ' + esc(on) + ' <b class="' + (r.bot.ok ? 'okc' : 'badc') + '">+' + r.bot.pts + '</b></span>' + I.chevRight + '</button>';
        }).join('') + '</div></section>' +
      '<footer class="foot">Correct = 100 points + up to 50 for speed + combo bonus · wrong or no answer = 0.</footer></main>';
    if (anim) { B.seen = true; saveB(); playRewards(res, tt, rw, L0, L1); }
  }
  function maxCombo(who) { var m = 0; B.rounds.forEach(function (r) { var c = who === 'me' ? r.combo : r.bot.combo; if (c > m) m = c; }); return m; }
  function bstat(l, a, b) { return '<div class="bs-row"><b>' + a + '</b><span>' + l + '</span><b>' + b + '</b></div>'; }
  function playRewards(res, tt, rw, L0, L1) {
    later(function () { sfx(res === 'w' ? 'win' : res === 'l' ? 'lose' : 'draw'); if (res === 'w') { confetti(170); buzz([30, 50, 30]); } }, wait(250));
    later(function () { countTo($('#fbY'), 0, tt.y, 900); countTo($('#fbB'), 0, tt.b, 900); }, wait(700));
    var t = 1500 + rw.lines.length * 260;
    later(function () { countTo($('#rwTotal'), 0, rw.total, 700, function () { sfx('xp'); }); }, wait(1500));
    later(function () { fillXp(L0, L1); }, wait(t));
    if (rw.badges.length) later(function () { var nb = $('.new-badges'); if (nb) nb.classList.add('show'); sfx('badge'); }, wait(t + (L1.L > L0.L ? 2600 : 1100)));
  }
  function fillXp(L0, L1) {
    var bar = $('#rwBar'), lv = $('#rwLv'), xp = $('#rwXp'); if (!bar) return;
    if (L1.L > L0.L) {
      bar.style.width = '100%';
      later(function () {
        sfx('level'); levelUp(L1.L);
        if (lv) { lv.textContent = 'Level ' + L1.L; lv.classList.add('up'); }
        bar.style.transition = 'none'; bar.style.width = '0%'; void bar.offsetWidth; bar.style.transition = '';
        later(function () { bar.style.width = pct(L1.into, L1.need) + '%'; if (xp) xp.textContent = L1.into + ' / ' + L1.need + ' XP'; }, 120);
      }, wait(900));
    } else { bar.style.width = pct(L1.into, L1.need) + '%'; if (xp) xp.textContent = L1.into + ' / ' + L1.need + ' XP'; }
  }
  function levelUp(L) {
    if (RM) { toast('Level up! You’re now level ' + L + '.'); return; }
    var el = document.createElement('div'); el.className = 'lvlup'; el.setAttribute('role', 'status');
    el.innerHTML = '<div class="lu-rays"></div><div class="lu-card"><small>LEVEL UP!</small><b>' + L + '</b><span>Keep battling to climb.</span></div>';
    document.body.appendChild(el); el.addEventListener('click', function () { if (el.parentNode) el.parentNode.removeChild(el); });
    setTimeout(function () { el.classList.add('out'); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 400); }, 2000);
  }
  function openQuestion(k) {
    var it = B.list[k], q = qOf(it), sec = it.sec, r = B.rounds[k], key = keyOf(sec, q), on = esc(oppName());
    var ch = q.t === 'mcq' ? '<div class="choices review">' + q.c.map(function (c, j) {
      var L = 'ABCD'.charAt(j), isKey = L === key, mine = L === r.a;
      return '<div class="choice-row' + (isKey ? ' key' : '') + (mine && !isKey ? ' wrong' : '') + '"><div class="choice"><span class="letter">' + L + '</span><span class="ctext">' + c + '</span><span class="ctags">' + (mine ? '<span class="who-tag you">' + (isKey ? I.check : I.cross) + ' You</span>' : '') + (r.bot.a === L ? '<span class="who-tag bot ' + (isKey ? 'ok' : 'bad') + '">' + on + '</span>' : '') + (isKey && !mine ? '<span class="tag ok">' + I.check + ' Correct</span>' : '') + '</span></div></div>';
    }).join('') + '</div>' : '<div class="spr-review"><div><small>Your answer</small><b class="' + (r.ok ? 'ok' : r.a ? 'bad' : 'om') + '">' + esc(r.a || '—') + '</b></div><div><small>Correct answer</small><b class="ok">' + esc(keyText(sec, q)) + '</b></div></div>';
    modal({ title: 'Question ' + (k + 1) + ' · ' + SEC[sec].short, cls: 'wide review-modal',
      body: '<div class="rq-meta"><span class="dtag ' + q.d.toLowerCase() + '"><i></i>' + DIFF[q.d] + '</span><span class="chip">' + esc(q.sk) + '</span></div>' + (q.p ? '<div class="passage boxed">' + q.p + '</div>' : '') + '<div class="prompt">' + q.q + '</div>' + ch +
        '<div class="explain"><b>' + I.spark + ' Explanation</b><div>' + q.x + '</div></div>',
      actions: (sec === 'math' ? [{ label: I.calc + ' Desmos', action: 'rev-calc', kind: 'ghost calc-btn' }] : []).concat([{ label: 'Close', action: 'layer-close', kind: 'primary' }]) });
  }
  function resumeBattle() {
    closeLayer(); clearTimers();
    var secs = {}; B.list.forEach(function (it) { secs[it.sec] = 1; });
    $app.className = 'app page'; $app.innerHTML = '<div class="boot"><div class="boot-mark"></div><p>Loading your battle…</p></div>';
    loadBanks(Object.keys(secs), function (ok) {
      if (!ok) { $app.innerHTML = '<div class="boot"><p>Couldn’t load the questions.</p><button class="btn primary" onclick="location.reload()">Try again</button></div>'; return; }
      if (B.status === 'done') return screenResult();
      if (B.net) { netWatch(); netFlush(); if (B.net.final || (B.i >= B.list.length - 1 && B.rounds[B.i] && B.rounds[B.i].done)) return finishBattle(); }
      var r = B.rounds[B.i];
      if (!r || !B.qStart) beginQuestion(); else screenBattle();
    });
  }
  function quitNet() {
    if (!B || !B.net || B.net.final || B.status !== 'live') return;
    netUnwatch();
    var isQuick = B.mode === 'quick';
    rpc('bm_forfeit', { p_id: B.net.id }).then(function (m) { if (isQuick && m && m.rating) { P.rating = m.rating; saveP(); if ($('.hub') && !$layer.classList.contains('open')) screenHub(); } pushProgress(); }, noop);
    var tt = totals();
    P.l = (P.l || 0) + 1; P.battles = (P.battles || 0) + 1; P.streak = 0;
    P.recent = [{ res: 'l', opp: oppName(), bot: null, av: B.opp.av, fmt: B.fmt, y: tt.y, b: tt.b, at: now() }].concat(P.recent || []).slice(0, 6);
    saveP();
  }
  function rematch() {
    if (!B) return screenHub();
    if (B.net) { flow.mode = B.mode; flow.fmt = B.fmt; if (B.mode === 'quick') screenSearch(); else screenInvite(); return; }
    flow.mode = B.mode; flow.fmt = B.fmt;
    var opp = B.opp, f = FORMATS[B.fmt];
    loadBanks(f.mix.map(function (m) { return m[0]; }), function (ok) { if (ok) startBattle(opp); });
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

  // Desmos inside a review pop-up (Math questions): the calculator opens beside the question and explanation.
  function toggleReviewCalc(btn) {
    var m = $('.modal', $layer); if (!m) return;
    var on = !m.classList.contains('calc-on');
    m.classList.toggle('calc-on', on);
    if (btn) { btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', on); }
    var box = $('#revCalc', m);
    if (on) {
      if (!box) { box = document.createElement('div'); box.id = 'revCalc'; box.className = 'rev-calc'; m.insertBefore(box, $('.modal-body', m)); }
      box.innerHTML = '<div class="calc-loading"><span class="spin dark"></span> Loading calculator…</div>';
      loadDesmos(function (ok) {
        var b = $('#revCalc'); if (!b) return;
        if (ok) { b.innerHTML = ''; b.appendChild(D.el); setTimeout(function () { try { D.calc.resize(); } catch (e) { } }, 30); }
        else b.innerHTML = '<div class="calc-fail"><p>The calculator couldn’t load.</p><a class="btn ghost" href="https://www.desmos.com/calculator" target="_blank" rel="noopener">Open Desmos in a new tab</a></div>';
      });
    } else if (box) { box.parentNode.removeChild(box); }
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
      case 'rev-calc': toggleReviewCalc(t); break;
      case 'theme': toggleTheme(); break;
      case 'sound': toggleSound(); break;
      case 'mode': pickMode(t.getAttribute('data-id'), t); break;
      case 'drop-go': closeLayer(); Store.del(KEY); B = null; var pm = flow.pendingMode; flow.pendingMode = null; screenHub(); if (pm) pickMode(pm, $('.mode[data-id="' + pm + '"]')); break;
      case 'pick-subj': pickSubject(t.getAttribute('data-id'), t); break;
      case 'pick-opp': pickOpponent(t.getAttribute('data-id'), t); break;
      case 'back-subj': sfx('tap'); screenSubject(); break;
      case 'hub': sfx('tap'); screenHub(); break;
      case 'cancel-search': cancelSearch(); break;
      case 'fb-bot': stopSearch(); flow.mode = 'bot'; sfx('pick'); screenOpponent(); break;
      case 'fb-friend': stopSearch(); flow.mode = 'friend'; sfx('pick'); screenInvite(); break;
      case 'lb': NET.scope = t.getAttribute('data-id'); sfx('tap'); $$('.lbt').forEach(function (b) { b.classList.toggle('on', b === t); }); if ($('#lb')) $('#lb').innerHTML = boardHTML(); loadBoard(NET.scope); break;
      case 'fb-again': sfx('tap'); screenSearch(); break;
      case 'copy-link': copyLink(t.getAttribute('data-url'), t); break;
      case 'profile': sfx('tap'); openProfile(null, false); break;
      case 'pf-av': pfAv = +t.getAttribute('data-i'); sfx('tap'); $$('.pf-av').forEach(function (b) { b.classList.toggle('on', b === t); }); var pv = $('#pfPrev'); if (pv) pv.innerHTML = avatar(pfAv, 72); break;
      case 'pf-save': saveProfile(); break;
      case 'ranks': sfx('tap'); openRanks(); break;
      case 'resume': resumeBattle(); break;
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
      case 'quit': modal({ title: 'Quit this battle?', cls: 'narrow', body: B && B.net ? '<p>Leaving counts as a <b>loss</b>' + (B.mode === 'quick' ? ' and lowers your rating' : '') + '. ' + esc(oppName()) + ' gets the win.</p>' : '<p>The battle ends without a result. You get no XP and your record doesn’t change.</p>', actions: [{ label: 'Keep playing', action: 'layer-close' }, { label: 'Quit', action: 'quit-yes', kind: 'primary' }] }); break;
      case 'quit-yes': closeLayer(); stopTicker(); clearTimeout(view.revealTimer); quitNet(); Store.del(KEY); B = null; screenHub(); break;
      case 'rematch': sfx('pick'); rematch(); break;
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
  if (PREVIEW) window.__battle = { fallbackNow: fallback, levelUp: levelUp, profile: function () { return P; }, battle: function () { return B; } };
  var roomCode = (QS.match(/[?&]room=([A-Za-z0-9]{4,8})/) || [])[1];
  if (roomCode && window.history && history.replaceState) history.replaceState(null, '', location.pathname + QS.replace(/([?&])room=[^&]*&?/, '$1').replace(/[?&]$/, ''));
  if (B && B.status === 'live' && B.list && B.list.length) { resumeBattle(); if (roomCode) toast('Finish this battle first, then open the room link again.'); }
  else if (roomCode && ONLINE) { screenHub(); joinRoom(roomCode.toUpperCase()); }
  else {
    screenHub();
    if (roomCode) toast('Friend battles open soon. Battle a bot for now!');
  }
  // Signed in before? Load the card from the account (rating, XP from other devices).
  if (ONLINE) hasSession().then(function (yes) {
    if (!yes) return;
    netReady().then(function () { if ($('.hub') && !$layer.classList.contains('open')) screenHub(); }, noop);
  }, noop);
})();
