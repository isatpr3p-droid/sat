/* isatprep · core logic (pure functions, no DOM). Shared by the app, check page, and unit tests. */
(function (root) {
  'use strict';

  var STAGES = ['rw1', 'rw2', 'break', 'm1', 'm2'];
  var STAGE_INFO = {
    rw1: { section: 'rw', sectionNo: 1, moduleNo: 1, minutes: 32, total: 27, title: 'Section 1, Module 1: Reading and Writing', short: 'Reading & Writing · Module 1' },
    rw2: { section: 'rw', sectionNo: 1, moduleNo: 2, minutes: 32, total: 27, title: 'Section 1, Module 2: Reading and Writing', short: 'Reading & Writing · Module 2' },
    m1: { section: 'math', sectionNo: 2, moduleNo: 1, minutes: 35, total: 22, title: 'Section 2, Module 1: Math', short: 'Math · Module 1' },
    m2: { section: 'math', sectionNo: 2, moduleNo: 2, minutes: 35, total: 22, title: 'Section 2, Module 2: Math', short: 'Math · Module 2' }
  };
  var BREAK_MINUTES = 10;

  /* ------------------------------------------------------------ student-produced response (SPR) */
  // Allowed characters: digits, one ".", one "/", optional leading "-". Max 5 chars (6 if negative).
  function sanitizeSpr(raw) {
    var s = String(raw == null ? '' : raw);
    var out = '', dot = false, slash = false;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === '−' || c === '–' || c === '—') c = '-';   // unicode minus / dashes from some keyboards
      if (c === ',' && !dot && !slash) { continue; }
      if (c >= '0' && c <= '9') out += c;
      else if (c === '-' && out.length === 0) out += c;
      else if (c === '.' && !dot) { dot = true; out += c; }
      else if (c === '/' && !slash) { slash = true; out += c; }
    }
    var max = out.charAt(0) === '-' ? 6 : 5;
    return out.slice(0, max);
  }

  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = b; b = a % b; a = t; } return a || 1; }

  // Parse to an exact rational {n, d} (d > 0), or null if not a complete number.
  function parseRational(str) {
    var s = String(str == null ? '' : str).trim().replace(/−/g, '-');
    if (!s) return null;
    var neg = false;
    if (s.charAt(0) === '-') { neg = true; s = s.slice(1); }
    if (!s) return null;
    var n, d;
    if (s.indexOf('/') !== -1) {
      var parts = s.split('/');
      if (parts.length !== 2 || !/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) return null;
      n = parseInt(parts[0], 10); d = parseInt(parts[1], 10);
      if (d === 0) return null;
    } else {
      if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return null;
      var dot = s.indexOf('.');
      if (dot === -1) { n = parseInt(s, 10); d = 1; }
      else {
        var ip = s.slice(0, dot) || '0', fp = s.slice(dot + 1);
        d = Math.pow(10, fp.length);
        n = parseInt(ip, 10) * d + (fp ? parseInt(fp, 10) : 0);
      }
    }
    if (neg) n = -n;
    var g = gcd(n, d);
    return { n: n / g, d: d / g };
  }

  function ratEq(a, b) { return !!a && !!b && a.n * b.d === b.n * a.d; }

  // Truncation toward zero and rounding half away from zero of a rational to `places` decimals, as an integer numerator over 10^places.
  function scaled(r, places, mode) {
    var p = Math.pow(10, places);
    var num = r.n * p, den = r.d;
    var sign = num < 0 ? -1 : 1, an = Math.abs(num);
    var q = Math.floor(an / den), rem = an - q * den;
    if (mode === 'round' && rem * 2 >= den) q += 1;
    return sign * q;
  }

  function isSprCorrect(input, key) {
    var s = sanitizeSpr(input);
    if (!s) return false;
    var keys = Array.isArray(key) ? key : [key];
    var k = parseRational(keys[0]);
    var val = parseRational(s);
    if (!val) return false;
    for (var i = 0; i < keys.length; i++) {
      var ki = parseRational(keys[i]);
      if (ratEq(val, ki)) return true;
    }
    // A decimal that fills every available space and equals the key truncated or rounded (e.g. 2/3 -> .6666, .6667, 0.666, 0.667).
    if (k && s.indexOf('/') === -1 && s.indexOf('.') !== -1) {
      var neg = s.charAt(0) === '-';
      if (s.length === (neg ? 6 : 5)) {
        var places = s.length - s.indexOf('.') - 1;
        var v = parseRational(s);
        var target = v.n * Math.pow(10, places) / v.d;      // exact integer since v has <= places decimals
        if (Math.round(target) === scaled(k, places, 'trunc') || Math.round(target) === scaled(k, places, 'round')) return true;
      }
    }
    return false;
  }

  function isAnswered(q, a) {
    if (a == null) return false;
    if (q.type === 'spr') return String(a).trim() !== '';
    return 'ABCD'.indexOf(a) !== -1 && String(a).length === 1;
  }

  function isCorrect(q, a) {
    if (!isAnswered(q, a)) return false;
    if (q.type === 'spr') return isSprCorrect(a, q.answer);
    return a === q.answer;
  }

  function sprPreview(str) {
    // Returns {kind:'empty'|'invalid'|'ok', tex}
    var s = sanitizeSpr(str);
    if (!s) return { kind: 'empty', tex: '' };
    var r = parseRational(s);
    if (!r) return { kind: 'invalid', tex: '' };
    var neg = s.charAt(0) === '-';
    var body = neg ? s.slice(1) : s;
    var tex;
    if (body.indexOf('/') !== -1) { var p = body.split('/'); tex = (neg ? '-' : '') + '\\dfrac{' + p[0] + '}{' + p[1] + '}'; }
    else tex = (neg ? '-' : '') + body;
    return { kind: 'ok', tex: tex };
  }

  /* ------------------------------------------------------------ routing & scoring */
  function rawScore(questions, answers) {
    var c = 0;
    for (var i = 0; i < questions.length; i++) if (isCorrect(questions[i], answers[questions[i].id])) c++;
    return c;
  }

  function route(section, m1Raw, routing) {
    var cut = section === 'rw' ? (routing && routing.rw != null ? routing.rw : 18) : (routing && routing.math != null ? routing.math : 15);
    return m1Raw >= cut ? 'hard' : 'easy';
  }

  var SCORING = { hardSpan: 600, easySpan: 430, easyCap: 630 };

  function sectionScore(correct, total, rt, cfg) {
    cfg = cfg || SCORING;
    var span = rt === 'hard' ? cfg.hardSpan : cfg.easySpan;
    var s = 200 + span * (correct / total);
    s = Math.round(s / 10) * 10;
    if (rt !== 'hard') s = Math.min(s, cfg.easyCap);
    return Math.max(200, Math.min(800, s));
  }

  function moduleKey(stage, rt) {
    if (stage === 'rw1') return 'rw1';
    if (stage === 'm1') return 'math1';
    if (stage === 'rw2') return rt === 'hard' ? 'rw2Hard' : 'rw2Easy';
    if (stage === 'm2') return rt === 'hard' ? 'math2Hard' : 'math2Easy';
    return null;
  }

  function fmtClock(ms) {
    var t = Math.max(0, Math.ceil(ms / 1000));
    var m = Math.floor(t / 60), s = t % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function validateTest(test) {
    var problems = [];
    var want = { rw1: 27, rw2Easy: 27, rw2Hard: 27, math1: 22, math2Easy: 22, math2Hard: 22 };
    var ids = {};
    if (!test || !test.modules) return ['Test file has no modules.'];
    Object.keys(want).forEach(function (k) {
      var arr = test.modules[k];
      if (!arr) { problems.push(k + ': module missing'); return; }
      if (arr.length !== want[k]) problems.push(k + ': has ' + arr.length + ' questions (expected ' + want[k] + ')');
      arr.forEach(function (q, i) {
        var where = k + ' Q' + (i + 1);
        if (!q.id) problems.push(where + ': missing id');
        else if (ids[q.id]) problems.push(where + ': duplicate id ' + q.id);
        ids[q.id] = 1;
        if (!q.domain) problems.push(where + ': missing domain');
        if (q.type === 'mcq') {
          if (!q.choices || q.choices.length !== 4) problems.push(where + ': needs exactly 4 choices');
          else q.choices.forEach(function (c, j) { if (!String(c).trim()) problems.push(where + ': choice ' + 'ABCD'[j] + ' is empty'); });
          if ('ABCD'.indexOf(q.answer) === -1 || String(q.answer).length !== 1) problems.push(where + ': answer must be A, B, C, or D (got ' + q.answer + ')');
        } else if (q.type === 'spr') {
          var keys = Array.isArray(q.answer) ? q.answer : [q.answer];
          keys.forEach(function (a) { if (!parseRational(a)) problems.push(where + ': SPR answer "' + a + '" is not a number'); });
          if (keys.length && parseRational(keys[0]) && !isSprCorrect(sanitizeSpr(keys[0]), q.answer) && !isSprCorrect(String(keys[0]), q.answer))
            problems.push(where + ': SPR key cannot be typed within 5/6 characters — add an "accept" form');
        } else problems.push(where + ': unknown type ' + q.type);
        if (!q.prompt) problems.push(where + ': missing prompt');
      });
    });
    if (test.opensAt && test.closesAt && new Date(test.opensAt) >= new Date(test.closesAt)) problems.push('opensAt must be before closesAt');
    return problems;
  }

  /* ------------------------------------------------------------ answer-key encoding
     Answers and explanations are stored encoded in the test file so they can't be read by simply opening it.
     (Not cryptography — just enough to stop casual peeking. Decoding happens in memory when the test loads.) */
  function utf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var s = unescape(encodeURIComponent(str)), out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function utf8Decode(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
    var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return decodeURIComponent(escape(s));
  }
  function decodeField(b64, key) {
    var bin = atob(b64), k = utf8Bytes(key), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) ^ k[i % k.length] ^ ((i * 73 + 41) & 255);
    return utf8Decode(out);
  }
  // Restores q.answer and q.explanation for an encoded test file. Safe to call more than once.
  function prepareTest(test) {
    if (!test || test._ready) return test;
    if (test.enc) {
      Object.keys(test.modules || {}).forEach(function (k) {
        (test.modules[k] || []).forEach(function (q) {
          if (q.x == null) return;
          var pair = JSON.parse(decodeField(q.x, test.id + ':' + q.id));
          q.answer = pair[0]; q.explanation = pair[1];
          delete q.x;
        });
      });
    }
    test._ready = true;
    return test;
  }

  var BUILD = '59b130d921'; // stamped by build/build.py — must match APP_BUILD in app.js

  var api = {
    BUILD: BUILD, STAGES: STAGES, prepareTest: prepareTest, STAGE_INFO: STAGE_INFO, BREAK_MINUTES: BREAK_MINUTES, SCORING: SCORING,
    sanitizeSpr: sanitizeSpr, parseRational: parseRational, isSprCorrect: isSprCorrect, sprPreview: sprPreview,
    isAnswered: isAnswered, isCorrect: isCorrect, rawScore: rawScore, route: route, sectionScore: sectionScore,
    moduleKey: moduleKey, fmtClock: fmtClock, validateTest: validateTest
  };
  root.SATCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
