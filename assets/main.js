(function () {
  'use strict';
  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- theme toggle ---------------- */
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  function isDark() {
    var t = root.dataset.theme;
    return t ? t === 'dark' : mq.matches;
  }
  document.getElementById('themeToggle').addEventListener('click', function () {
    var next = isDark() ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
    readColors(); drawDemo();
  });
  mq.addEventListener && mq.addEventListener('change', function () { readColors(); drawDemo(); });

  var C = {};
  function readColors() {
    var s = getComputedStyle(root);
    C.accent = s.getPropertyValue('--accent').trim();
    C.accent2 = s.getPropertyValue('--accent-2').trim();
    C.ink3 = s.getPropertyValue('--ink-3').trim();
    C.line = s.getPropertyValue('--line').trim();
    C.bg = s.getPropertyValue('--bg').trim();
  }
  readColors();

  /* ---------------- nav border + reveal ---------------- */
  var nav = document.querySelector('.nav');
  function onScroll() { nav.classList.toggle('scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();


  /* ---------------- active section highlight ---------------- */
  var spyLinks = document.querySelectorAll('[data-sec]');
  var secs = ['publications', 'research', 'experience', 'skills', 'contact']
    .map(function (id) { return document.getElementById(id); });
  function spy() {
    var y = window.scrollY + window.innerHeight * 0.35, cur = null;
    secs.forEach(function (s) { if (s && s.offsetTop <= y) cur = s.id; });
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = 'contact';
    spyLinks.forEach(function (a) { a.classList.toggle('active', a.dataset.sec === cur); });
  }
  window.addEventListener('scroll', spy, { passive: true }); spy();

  document.getElementById('yr').textContent = new Date().getFullYear();

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.08 });
    document.querySelectorAll('.section-head, .project, .pub, .tl-item, .skill-card, .about-grid, .contact-card')
      .forEach(function (el) { el.classList.add('reveal'); io.observe(el); });
  }

  /* ---------------- tiny Gaussian process ---------------- */
  function gp(xs, ys, grid, ell, sf2, sn2) {
    var n = xs.length, i, j, k;
    if (n === 0) return grid.map(function () { return { m: 0, s: Math.sqrt(sf2) }; });
    var kern = function (a, b) { var d = (a - b) / ell; return sf2 * Math.exp(-0.5 * d * d); };
    // Cholesky of K + sn2 I
    var L = [];
    for (i = 0; i < n; i++) { L.push(new Array(n).fill(0)); }
    for (i = 0; i < n; i++) {
      for (j = 0; j <= i; j++) {
        var sum = kern(xs[i], xs[j]) + (i === j ? sn2 : 0);
        for (k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
        L[i][j] = i === j ? Math.sqrt(Math.max(sum, 1e-12)) : sum / L[j][j];
      }
    }
    function fwd(b) { var z = []; for (var i = 0; i < n; i++) { var s = b[i]; for (var k = 0; k < i; k++) s -= L[i][k] * z[k]; z.push(s / L[i][i]); } return z; }
    function bwd(b) { var z = new Array(n); for (var i = n - 1; i >= 0; i--) { var s = b[i]; for (var k = i + 1; k < n; k++) s -= L[k][i] * z[k]; z[i] = s / L[i][i]; } return z; }
    var alpha = bwd(fwd(ys));
    return grid.map(function (x) {
      var ks = xs.map(function (xi) { return kern(x, xi); });
      var m = 0; for (var i = 0; i < n; i++) m += ks[i] * alpha[i];
      var v = fwd(ks), vv = 0; for (i = 0; i < n; i++) vv += v[i] * v[i];
      return { m: m, s: Math.sqrt(Math.max(sf2 - vv, 1e-9)) };
    });
  }

  function setupCanvas(cv) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = cv.getBoundingClientRect();
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: r.width, h: r.height };
  }

  function drawGP(ctx, w, h, xs, ys, opts) {
    var N = 140, grid = [];
    for (var i = 0; i <= N; i++) grid.push(i / N);
    var post = gp(xs, ys, grid, opts.ell, opts.sf2 || 1, opts.noise);
    var X = function (x) { return opts.padL + x * (w - opts.padL - opts.padR); };
    var Y = function (y) { return h / 2 - y * opts.yScale; };
    var bands = opts.bands || [1.96];
    bands.forEach(function (z, bi) {
      ctx.beginPath();
      post.forEach(function (p, i) { var px = X(grid[i]), py = Y(p.m + z * p.s); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      for (var i = post.length - 1; i >= 0; i--) ctx.lineTo(X(grid[i]), Y(post[i].m - z * post[i].s));
      ctx.closePath();
      ctx.globalAlpha = opts.bandAlpha[bi];
      ctx.fillStyle = C.accent; ctx.fill();
      ctx.globalAlpha = 1;
    });
    // band edges
    ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.strokeStyle = C.accent; ctx.globalAlpha = opts.edgeAlpha;
    [1, -1].forEach(function (sgn) {
      ctx.beginPath();
      post.forEach(function (p, i) { var px = X(grid[i]), py = Y(p.m + sgn * bands[0] * p.s); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.stroke();
    });
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    // mean
    ctx.beginPath();
    post.forEach(function (p, i) { var px = X(grid[i]), py = Y(p.m); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.strokeStyle = C.accent; ctx.lineWidth = opts.meanWidth; ctx.globalAlpha = opts.meanAlpha; ctx.stroke(); ctx.globalAlpha = 1;
    // points
    for (i = 0; i < xs.length; i++) {
      ctx.beginPath(); ctx.arc(X(xs[i]), Y(ys[i]), opts.r, 0, Math.PI * 2);
      ctx.fillStyle = C.bg; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.accent2; ctx.globalAlpha = opts.pointAlpha; ctx.stroke(); ctx.globalAlpha = 1;
    }
  }

  /* ---------------- hero background ---------------- */
  var hero = document.getElementById('heroCanvas'), H, heroVisible = true;
  var base = [0.38, 0.47, 0.6, 0.66, 0.79, 0.9];
  var trueF = function (x, t) { return 0.9 * Math.sin(6 * x + t * 0.35) + 0.35 * Math.sin(17 * x - t * 0.6); };
  function drawHero(t) {
    var ctx = H.ctx; ctx.clearRect(0, 0, H.w, H.h);
    var xs = base.map(function (b, i) { return b + 0.035 * Math.sin(t * (0.25 + i * 0.07) + i); });
    var ys = xs.map(function (x) { return trueF(x, t); });
    drawGP(ctx, H.w, H.h, xs, ys, {
      ell: 0.075, noise: 0.004, padL: -20, padR: -20, yScale: Math.min(H.h * 0.22, 120),
      bands: [1.96, 1.0], bandAlpha: [0.12, 0.12], edgeAlpha: 0.45, meanWidth: 2, meanAlpha: 0.85, r: 4.5, pointAlpha: 0.95
    });
  }
  function sizeHero() { H = setupCanvas(hero); }
  sizeHero();
  var t0 = performance.now();
  function loop(now) {
    if (heroVisible) drawHero((now - t0) / 1000);
    requestAnimationFrame(loop);
  }
  if (reduceMotion) { drawHero(2); } else { requestAnimationFrame(loop); }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { heroVisible = es[0].isIntersecting; }).observe(hero);
  }

  /* ---------------- interactive demo ---------------- */
  var demo = document.getElementById('demoCanvas'), D;
  var initial = function () { return { xs: [0.15, 0.5, 0.82], ys: [-0.35, 0.55, -0.2] }; };
  var pts = initial();
  function drawDemo() {
    if (!D) return;
    var ctx = D.ctx; ctx.clearRect(0, 0, D.w, D.h);
    // faint grid
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    for (var i = 1; i < 6; i++) { var gx = (D.w * i) / 6; ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, D.h); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(0, D.h / 2); ctx.lineTo(D.w, D.h / 2); ctx.stroke();
    drawGP(ctx, D.w, D.h, pts.xs, pts.ys, {
      ell: 0.13, sf2: 0.35, noise: 0.003, padL: 0, padR: 0, yScale: D.h * 0.32,
      bands: [1.96], bandAlpha: [0.18], edgeAlpha: 0.7, meanWidth: 2, meanAlpha: 1, r: 4.5, pointAlpha: 1
    });
    ctx.font = '11px "JetBrains Mono", monospace'; ctx.fillStyle = C.ink3;
    ctx.fillText('n = ' + pts.xs.length + '   ·   mean ± 1.96σ', 10, 18);
  }
  function sizeDemo() { D = setupCanvas(demo); drawDemo(); }
  sizeDemo();
  demo.addEventListener('click', function (e) {
    var r = demo.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width;
    var y = (D.h / 2 - (e.clientY - r.top)) / (D.h * 0.32);
    if (pts.xs.length >= 30) { pts.xs.shift(); pts.ys.shift(); }
    pts.xs.push(x); pts.ys.push(Math.max(-1.5, Math.min(1.5, y)));
    drawDemo();
  });
  document.getElementById('demoReset').addEventListener('click', function () { pts = initial(); drawDemo(); });

  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { sizeHero(); if (reduceMotion) drawHero(2); sizeDemo(); }, 120);
  });
  document.fonts && document.fonts.ready.then(drawDemo);
})();
