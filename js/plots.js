/* plots.js — canvas plots: poles, phase, trace–det, gain plane, time series */
(function (global) {
  'use strict';
  const DEQ = (global.DEQ = global.DEQ || {});
  const M = DEQ.Model;
  const DEG = M.DEG;

  const C = {
    ink: '#111827', axis: '#374151', grid: '#e5e7eb',
    blue: '#1d4ed8', orange: '#c2410c', purple: '#7e22ce', green: '#15803d', red: '#b91c1c',
    teal: '#0f766e', magenta: '#a21caf', amber: '#b45309',
    stableBg: 'rgba(22,163,74,0.14)', unstableBg: 'rgba(220,38,38,0.11)'
  };
  const FAM = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  const FONT = '14px ' + FAM, FONT_B = 'bold 15px ' + FAM;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const ui = M.ui;

  /* ---------- helpers ---------- */
  function fit(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w < 20 || h < 20) return null;
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }
  const box0 = (w, h, l, r, t, b) => ({ x: l, y: t, w: w - l - r, h: h - t - b });
  function mapper(box, xr, yr) {
    const sx = box.w / (xr[1] - xr[0]), sy = box.h / (yr[1] - yr[0]);
    return {
      X: v => box.x + (v - xr[0]) * sx,
      Y: v => box.y + box.h - (v - yr[0]) * sy,
      ix: px => xr[0] + (px - box.x) / sx,
      iy: py => yr[0] + (box.y + box.h - py) / sy
    };
  }
  function niceCeil(v) {
    if (!(v > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }
  function pick(list, v) { for (const x of list) if (v <= x) return x; return list[list.length - 1]; }
  function ticks(lo, hi, n) {
    const raw = (hi - lo) / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    const st = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
    const out = [];
    for (let v = Math.ceil(lo / st - 1e-9) * st; v <= hi + 1e-9; v += st) out.push(Math.abs(v) < 1e-12 ? 0 : v);
    out.step = st;
    return out;
  }
  function lab(v, step) {
    const dec = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step) - 1e-9));
    return v.toFixed(dec).replace('-', '\u2212');
  }

  function axes(ctx, box, m, xr, yr, o) {
    o = o || {};
    const xt = ticks(xr[0], xr[1], o.nx || 6), yt = ticks(yr[0], yr[1], o.ny || 5);
    ctx.save();
    ctx.font = FONT; ctx.lineWidth = 1; ctx.strokeStyle = C.grid; ctx.fillStyle = C.axis;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const v of xt) {
      const px = m.X(v);
      ctx.beginPath(); ctx.moveTo(px, box.y); ctx.lineTo(px, box.y + box.h); ctx.stroke();
      if (!o.hideX) ctx.fillText(lab(v, xt.step), px, box.y + box.h + 6);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const v of yt) {
      const py = m.Y(v);
      ctx.beginPath(); ctx.moveTo(box.x, py); ctx.lineTo(box.x + box.w, py); ctx.stroke();
      ctx.fillText(lab(v, yt.step), box.x - 6, py);
    }
    ctx.strokeStyle = C.axis; ctx.lineWidth = 1.6;
    if (xr[0] < 0 && xr[1] > 0) { const px = m.X(0); ctx.beginPath(); ctx.moveTo(px, box.y); ctx.lineTo(px, box.y + box.h); ctx.stroke(); }
    if (yr[0] < 0 && yr[1] > 0) { const py = m.Y(0); ctx.beginPath(); ctx.moveTo(box.x, py); ctx.lineTo(box.x + box.w, py); ctx.stroke(); }
    ctx.lineWidth = 1.2; ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.fillStyle = C.ink; ctx.font = FONT_B;
    if (o.xlabel && !o.hideX) { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(o.xlabel, box.x + box.w / 2, box.y + box.h + 26); }
    if (o.ylabel) {
      ctx.save(); ctx.translate(4, box.y + box.h / 2); ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(o.ylabel, 0, 0); ctx.restore();
    }
    ctx.restore();
  }

  function clipTo(ctx, box) { ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip(); }

  // text with a translucent white backing (readable on a projector)
  function tag(ctx, text, x, y, o) {
    o = o || {};
    ctx.save();
    ctx.font = o.font || FONT;
    const tw = ctx.measureText(text).width, pad = 4, th = 16;
    let bx = x; if (o.align === 'right') bx = x - tw; else if (o.align === 'center') bx = x - tw / 2;
    let by = y; if (o.base === 'bottom') by = y - th; else if (o.base === 'middle') by = y - th / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(bx - pad, by - 1, tw + 2 * pad, th + 2);
    ctx.fillStyle = o.color || C.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(text, bx, by);
    ctx.restore();
  }

  function head(ctx, x, y, dx, dy, size, color) {
    const a = Math.atan2(dy, dx);
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * size, y + Math.sin(a) * size);
    ctx.lineTo(x + Math.cos(a + 2.5) * size, y + Math.sin(a + 2.5) * size);
    ctx.lineTo(x + Math.cos(a - 2.5) * size, y + Math.sin(a - 2.5) * size);
    ctx.closePath(); ctx.fill();
  }
  function arrow(ctx, x0, y0, x1, y1, color, lw, hd) {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    if (len < 1.5) return;
    ctx.strokeStyle = color; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - dx / len * 2, y1 - dy / len * 2); ctx.stroke();
    head(ctx, x1, y1, dx, dy, Math.min(hd || 10, len * 0.7), color);
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function poly(ctx, m, pts, fill) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(m.X(p[0]), m.Y(p[1])) : ctx.moveTo(m.X(p[0]), m.Y(p[1]))));
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }
  function eigText(an) {
    if (an.mode === 1) return 'λ = ' + ui(an.lam, 2);
    if (an.type === 'complex') return 'λ = ' + ui(an.eig[0].re, 2) + ' ± ' + ui(Math.abs(an.eig[0].im), 2) + ' i';
    return 'λ₁ = ' + ui(an.eig[0].re, 2) + ',  λ₂ = ' + ui(an.eig[1].re, 2);
  }

  /* ---------- poles in the complex plane ---------- */
  function poles(canvas, D) {
    const F = fit(canvas); if (!F) return;
    const { ctx, w, h } = F, an = D.an, ol = D.olAn;
    let mag = 1;
    for (const e of an.eig.concat(ol.eig)) mag = Math.max(mag, Math.hypot(e.re, e.im));
    const R = pick([4, 6, 8, 10, 15, 20, 30, 40, 60], mag * 1.2);
    const b0 = box0(w, h, 64, 16, 14, 50), s = Math.min(b0.w, b0.h);
    const box = { x: b0.x + (b0.w - s) / 2, y: b0.y + (b0.h - s) / 2, w: s, h: s };
    const m = mapper(box, [-R, R], [-R, R]);

    ctx.fillStyle = C.stableBg; ctx.fillRect(box.x, box.y, box.w / 2, box.h);
    ctx.fillStyle = C.unstableBg; ctx.fillRect(box.x + box.w / 2, box.y, box.w / 2, box.h);
    axes(ctx, box, m, [-R, R], [-R, R], { xlabel: 'Re λ  (1/s)', ylabel: 'Im λ  (1/s)', nx: 8, ny: 8 });

    clipTo(ctx, box);
    const n = D.trail.length;
    D.trail.forEach((t, i) => {
      ctx.fillStyle = 'rgba(29,78,216,' + (0.07 + 0.45 * (i + 1) / n).toFixed(3) + ')';
      for (const e of t.eig) { ctx.beginPath(); ctx.arc(m.X(e.re), m.Y(e.im), 3.5, 0, 7); ctx.fill(); }
    });
    ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 2.5;
    for (const e of ol.eig) { ctx.beginPath(); ctx.arc(m.X(e.re), m.Y(e.im), 9, 0, 7); ctx.stroke(); }
    ctx.strokeStyle = C.blue; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (const e of an.eig) {
      const x = m.X(e.re), y = m.Y(e.im), q = 8;
      ctx.beginPath(); ctx.moveTo(x - q, y - q); ctx.lineTo(x + q, y + q); ctx.moveTo(x + q, y - q); ctx.lineTo(x - q, y + q); ctx.stroke();
    }
    ctx.restore();

    ctx.font = FONT_B;
    tag(ctx, 'STABLE · Re λ < 0', box.x + 8, box.y + 8, { color: C.green, font: FONT_B });
    tag(ctx, 'UNSTABLE · Re λ > 0', box.x + box.w - 8, box.y + 8, { color: C.red, font: FONT_B, align: 'right' });
    tag(ctx, eigText(an), box.x + 8, box.y + box.h - 34, { font: FONT_B });
    tag(ctx, '×  closed-loop pole     ○  open-loop pole (no feedback)', box.x + 8, box.y + box.h - 10, { base: 'bottom', color: C.axis });
  }

  /* ---------- phase portrait (mode 2) ---------- */
  function phase2(canvas, D) {
    const F = fit(canvas); if (!F) return;
    const { ctx, w, h } = F, { cfg, sim, an } = D;
    let mT = 0, mW = 0;
    for (const s of sim.hist) { mT = Math.max(mT, Math.abs(s.z[0])); mW = Math.max(mW, Math.abs(s.z[1])); }
    mT = Math.max(mT, Math.abs(sim.z[0]), Math.abs(sim.anchor.z[0]));
    mW = Math.max(mW, Math.abs(sim.z[1]), Math.abs(sim.anchor.z[1]));
    if (an.hasEq) mT = Math.max(mT, Math.min(Math.abs(an.thetaP), M.FALL));
    const thR = pick([20, 30, 45, 60, 90, 120], Math.max(20, mT / DEG * 1.25));
    const omR = pick([60, 100, 150, 200, 300, 500, 800, 1200, 2000], Math.max(60, mW / DEG * 1.25));
    const box = box0(w, h, 66, 16, 14, 50), xr = [-thR, thR], yr = [-omR, omR], m = mapper(box, xr, yr);
    axes(ctx, box, m, xr, yr, { xlabel: 'θ  (deg)', ylabel: 'θ′  (deg/s)' });

    clipTo(ctx, box);
    if (thR >= 90) {
      ctx.setLineDash([8, 6]); ctx.strokeStyle = C.red; ctx.lineWidth = 2;
      for (const v of [-90, 90]) { ctx.beginPath(); ctx.moveTo(m.X(v), box.y); ctx.lineTo(m.X(v), box.y + box.h); ctx.stroke(); }
      ctx.setLineDash([]);
    }
    // vector field of the *actual* system (includes sin θ / saturation if enabled)
    const nx = 17, ny = 12;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const thd = xr[0] + (i + 0.5) * 2 * thR / nx, wd = yr[0] + (j + 0.5) * 2 * omR / ny;
      const dz = M.deriv(cfg, [thd * DEG, wd * DEG]);
      const sx = dz[0] / DEG / (2 * thR) * box.w, sy = -dz[1] / DEG / (2 * omR) * box.h;
      const len = Math.hypot(sx, sy); if (len < 1e-9) continue;
      const ux = sx / len, uy = sy / len, cx = m.X(thd), cy = m.Y(wd), hf = 7;
      arrow(ctx, cx - ux * hf, cy - uy * hf, cx + ux * hf, cy + uy * hf, 'rgba(55,65,81,0.5)', 1.5, 5);
    }
    // eigen-directions (1, λ) through the equilibrium
    const cx0 = an.hasEq ? an.thetaP / DEG : 0;
    if (an.type === 'real' || an.type === 'repeated') {
      const list = an.type === 'real' ? an.eig : [an.eig[0]], L = thR * 4;
      ctx.setLineDash([9, 6]); ctx.lineWidth = 2.5;
      for (const e of list) {
        ctx.strokeStyle = e.re < 0 ? C.teal : C.magenta;
        ctx.beginPath(); ctx.moveTo(m.X(cx0 - L), m.Y(-e.re * L)); ctx.lineTo(m.X(cx0 + L), m.Y(e.re * L)); ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    // trajectory
    ctx.strokeStyle = C.blue; ctx.lineWidth = 3.5; ctx.lineJoin = 'round';
    ctx.beginPath();
    let pen = false;
    for (const s of sim.hist) {
      const x = m.X(s.z[0] / DEG), y = m.Y(s.z[1] / DEG);
      if (!pen || s.brk) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      pen = true;
    }
    if (!sim.held && pen) ctx.lineTo(m.X(sim.z[0] / DEG), m.Y(sim.z[1] / DEG));
    ctx.stroke();
    // equilibrium
    if (an.hasEq) {
      const ex = m.X(cx0), ey = m.Y(0);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(ex, ey - 9); ctx.lineTo(ex + 9, ey); ctx.lineTo(ex, ey + 9); ctx.lineTo(ex - 9, ey); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // current state
    ctx.fillStyle = C.orange; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(m.X(sim.z[0] / DEG), m.Y(sim.z[1] / DEG), 8, 0, 7); ctx.fill(); ctx.stroke();
    ctx.restore();

    tag(ctx, an.klass.label + (cfg.forced ? '  (equilibrium ◇ shifted to θp)' : ''), box.x + 8, box.y + 8, { font: FONT_B });
    let ly = box.y + 30;
    if (an.type === 'real') {
      an.eig.forEach((e, i) => {
        tag(ctx, '┄ eigen-direction (1, λ' + (i ? '₂' : '₁') + ') · λ = ' + ui(e.re, 2) + (e.re < 0 ? ' (stable)' : ' (unstable)'),
          box.x + 8, ly, { color: e.re < 0 ? C.teal : C.magenta }); ly += 22;
      });
    } else if (an.type === 'repeated') {
      tag(ctx, '┄ eigen-direction (1, λ) · λ = ' + ui(an.eig[0].re, 2), box.x + 8, ly, { color: C.teal });
    }
    tag(ctx, 'arrows: flow direction    ● now', box.x + 8, box.y + box.h - 10, { base: 'bottom', color: C.axis });
  }

  /* ---------- phase line (mode 1) ---------- */
  function phase1(canvas, D) {
    const F = fit(canvas); if (!F) return;
    const { ctx, w, h } = F, { cfg, sim, an } = D, R = M.RAIL;
    const N = 161, xs = [], fs = [];
    let fmax = 0.5;
    for (let i = 0; i < N; i++) {
      const x = -R + 2 * R * i / (N - 1), f = M.deriv(cfg, [x])[0];
      xs.push(x); fs.push(f); fmax = Math.max(fmax, Math.abs(f));
    }
    const Y = niceCeil(fmax * 1.15);
    const xr = [-R * 1.1, R * 1.1], yr = [-Y, Y], box = box0(w, h, 66, 16, 14, 50), m = mapper(box, xr, yr);
    axes(ctx, box, m, xr, yr, { xlabel: 'x  (m)', ylabel: 'x′  (m/s)' });

    clipTo(ctx, box);
    ctx.setLineDash([8, 6]); ctx.strokeStyle = C.red; ctx.lineWidth = 2;
    for (const v of [-R, R]) { ctx.beginPath(); ctx.moveTo(m.X(v), box.y); ctx.lineTo(m.X(v), box.y + box.h); ctx.stroke(); }
    ctx.setLineDash([]);
    for (let x = -R + 0.2; x <= R - 0.19; x += 0.4) {          // flow arrows on the x-axis
      const f = M.deriv(cfg, [x])[0]; if (Math.abs(f) < 1e-6) continue;
      const dir = f > 0 ? 1 : -1, px = m.X(x), py = m.Y(0);
      arrow(ctx, px - dir * 9, py, px + dir * 9, py, C.purple, 3, 8);
    }
    ctx.strokeStyle = C.blue; ctx.lineWidth = 3.5; ctx.beginPath();
    xs.forEach((x, i) => (i ? ctx.lineTo(m.X(x), m.Y(fs[i])) : ctx.moveTo(m.X(x), m.Y(fs[i]))));
    ctx.stroke();
    for (let i = 0; i < N - 1; i++) {                           // equilibria = zero crossings
      if (fs[i] * fs[i + 1] < 0) {
        const x = xs[i] - fs[i] * (xs[i + 1] - xs[i]) / (fs[i + 1] - fs[i]), stable = fs[i + 1] < fs[i];
        ctx.lineWidth = 3.5; ctx.strokeStyle = C.ink; ctx.fillStyle = stable ? C.ink : '#fff';
        ctx.beginPath(); ctx.arc(m.X(x), m.Y(0), 8, 0, 7); ctx.fill(); ctx.stroke();
        tag(ctx, stable ? 'stable equilibrium' : 'unstable equilibrium', m.X(x), m.Y(0) + 14, { align: 'center' });
      }
    }
    const xc = sim.z[0], fc = M.deriv(cfg, [xc])[0];
    ctx.setLineDash([4, 4]); ctx.strokeStyle = C.orange; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(m.X(xc), m.Y(0)); ctx.lineTo(m.X(xc), m.Y(fc)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = C.orange; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(m.X(xc), m.Y(clamp(fc, -Y, Y)), 8, 0, 7); ctx.fill(); ctx.stroke();
    ctx.restore();

    tag(ctx, 'x′ = f(x): slope at the equilibrium is λ = ' + ui(an.lam, 2) + (cfg.forced ? '   (d shifts the line up/down)' : ''), box.x + 8, box.y + 8, { font: FONT_B });
    tag(ctx, 'purple arrows: direction of motion', box.x + 8, box.y + box.h - 10, { base: 'bottom', color: C.axis });
  }

  /* ---------- trace–determinant plane (mode 2) ---------- */
  function trdet(canvas, D) {
    const F = fit(canvas); if (!F) return;
    const { ctx, w, h } = F, an = D.an;
    const xr = [-12, 12], yr = [-40, 40], box = box0(w, h, 64, 16, 14, 50), m = mapper(box, xr, yr);
    const par = (a, b) => { const o = []; for (let i = 0; i <= 48; i++) { const t = a + (b - a) * i / 48; o.push([t, t * t / 4]); } return o; };

    poly(ctx, m, [[-12, 0], [12, 0], [12, -40], [-12, -40]], 'rgba(220,38,38,0.14)');
    poly(ctx, m, par(-12, 0).concat([[0, 40], [-12, 40]]), 'rgba(22,163,74,0.20)');
    poly(ctx, m, [[-12, 0], [0, 0]].concat(par(0, -12)), 'rgba(13,148,136,0.20)');
    poly(ctx, m, par(0, 12).concat([[12, 40], [0, 40]]), 'rgba(234,88,12,0.18)');
    poly(ctx, m, [[0, 0], [12, 0]].concat(par(12, 0)), 'rgba(202,138,4,0.18)');
    axes(ctx, box, m, xr, yr, { xlabel: 'trace  tr(A−BK) = −Kd', ylabel: 'determinant  det(A−BK) = Kp − g/L', nx: 8, ny: 8 });

    clipTo(ctx, box);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.beginPath();
    par(-12, 12).forEach((p, i) => (i ? ctx.lineTo(m.X(p[0]), m.Y(p[1])) : ctx.moveTo(m.X(p[0]), m.Y(p[1]))));
    ctx.stroke();
    ctx.strokeStyle = C.amber; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(m.X(0), m.Y(0)); ctx.lineTo(m.X(0), m.Y(40)); ctx.stroke();
    const n = D.trail.length;
    D.trail.forEach((t, i) => {
      ctx.fillStyle = 'rgba(17,24,39,' + (0.08 + 0.4 * (i + 1) / n).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(m.X(t.tr), m.Y(t.det), 3.5, 0, 7); ctx.fill();
    });
    ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 2.5;                       // open loop
    ctx.beginPath(); ctx.arc(m.X(D.olAn.tr), m.Y(D.olAn.det), 8, 0, 7); ctx.stroke();
    const px = m.X(clamp(an.tr, -12, 12)), py = m.Y(clamp(an.det, -40, 40));
    ctx.fillStyle = C.ink; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(px, py, 9, 0, 7); ctx.fill(); ctx.stroke();
    ctx.restore();

    const lb = { align: 'center', font: FONT_B };
    tag(ctx, 'Saddle (unstable)', m.X(0), m.Y(-30), lb);
    tag(ctx, 'Stable spiral', m.X(-6), m.Y(28), Object.assign({ color: C.green }, lb));
    tag(ctx, 'Stable node', m.X(-8.5), m.Y(7), Object.assign({ color: C.teal }, lb));
    tag(ctx, 'Unstable spiral', m.X(6), m.Y(28), Object.assign({ color: C.orange }, lb));
    tag(ctx, 'Unstable node', m.X(8.5), m.Y(7), Object.assign({ color: C.amber }, lb));
    tag(ctx, 'Center: tr = 0', m.X(0.4), m.Y(37), { color: C.amber });
    tag(ctx, 'Δ = 0:  det = tr²/4', m.X(-11.5), m.Y(33), { color: C.ink });
    tag(ctx, '● now (tr, det) = (' + ui(an.tr, 2) + ', ' + ui(an.det, 2) + ')   ○ no feedback', box.x + 8, box.y + box.h - 10, { base: 'bottom', font: FONT_B });
  }

  /* ---------- gain planes (draggable) ---------- */
  let lastGain = null;
  function gain2(canvas, D) {
    const F = fit(canvas); if (!F) return;
    const { ctx, w, h } = F, { cfg, an } = D, p = cfg.p, gl = an.gl;
    const rg = M.RANGES[2], xr = [rg.Kp[0], rg.Kp[1]], yr = [rg.Kd[0], rg.Kd[1]];
    const box = box0(w, h, 64, 16, 14, 50), m = mapper(box, xr, yr);
    const curve = [];
    for (let i = 0; i <= 80; i++) { const kp = gl + (xr[1] - gl) * i / 80; curve.push([kp, 2 * Math.sqrt(Math.max(0, kp - gl))]); }

    clipTo(ctx, box);
    ctx.fillStyle = 'rgba(220,38,38,0.14)'; ctx.fillRect(box.x, box.y, box.w, box.h);
    poly(ctx, m, [[gl, yr[0]], [xr[1], yr[0]], [xr[1], 0], [gl, 0]], 'rgba(234,88,12,0.18)');
    poly(ctx, m, [[gl, 0]].concat(curve, [[xr[1], 0]]), 'rgba(22,163,74,0.20)');
    poly(ctx, m, curve.concat([[xr[1], 14], [gl, 14]]), 'rgba(13,148,136,0.22)');
    ctx.restore();
    axes(ctx, box, m, xr, yr, { xlabel: 'Kp  (1/s²)', ylabel: 'Kd  (1/s)', nx: 8, ny: 6 });

    clipTo(ctx, box);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5;
    ctx.beginPath(); curve.forEach((q, i) => (i ? ctx.lineTo(m.X(q[0]), m.Y(q[1])) : ctx.moveTo(m.X(q[0]), m.Y(q[1])))); ctx.stroke();
    ctx.setLineDash([8, 6]); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(m.X(gl), box.y); ctx.lineTo(m.X(gl), box.y + box.h); ctx.stroke(); ctx.setLineDash([]);
    const n = D.trail.length;
    D.trail.forEach((t, i) => {
      ctx.fillStyle = 'rgba(17,24,39,' + (0.08 + 0.4 * (i + 1) / n).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(m.X(t.gKp), m.Y(t.gKd), 3.5, 0, 7); ctx.fill();
    });
    const px = m.X(p.Kp), py = m.Y(p.Kd);
    ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.fillStyle = cfg.feedback ? C.ink : '#fff';
    ctx.beginPath(); ctx.arc(px, py, 10, 0, 7); ctx.fill(); ctx.stroke();
    if (!cfg.feedback) { ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(px, py, 10, 0, 7); ctx.stroke(); }
    ctx.restore();

    const span = xr[1] - gl;
    tag(ctx, 'Unstable (saddle): Kp < g/L', box.x + 6, m.Y(9.2), { color: C.red, font: FONT_B });
    tag(ctx, 'Unstable (Kd < 0)', m.X(gl + span * 0.5), m.Y(-1.0), { align: 'center', color: C.orange, font: FONT_B });
    tag(ctx, 'Stable spiral (oscillatory)', m.X(gl + span * 0.62), m.Y(1.2), { align: 'center', color: C.green, font: FONT_B });
    tag(ctx, 'Stable node (overdamped)', m.X(gl + span * 0.35), m.Y(8.6), { align: 'center', color: C.teal, font: FONT_B });
    tag(ctx, 'Kp = g/L = ' + ui(gl, 2), m.X(gl) + 6, box.y + 8, { color: C.ink });
    tag(ctx, 'Kd² = 4(Kp − g/L)', m.X(xr[1]) - 8, m.Y(10.2), { align: 'right', color: C.ink });
    tag(ctx, (cfg.feedback ? '●' : '○ (feedback off)') + ' gains (Kp, Kd) = (' + ui(p.Kp, 1) + ', ' + ui(p.Kd, 1) + ')   — click or drag to set', box.x + 8, box.y + box.h - 10, { base: 'bottom', font: FONT_B });
    lastGain = { mode: 2, m, xr, yr };
  }

  function gain1(canvas, D) {
    const F = fit(canvas); if (!F) return;
    const { ctx, w, h } = F, { cfg, an } = D, p = cfg.p;
    const kr = M.RANGES[1].k, xr = [kr[0], kr[1]];
    const yr = [Math.min(-1, p.a - p.b * xr[1]) - 0.5, Math.max(p.a, 0) + 1];
    const box = box0(w, h, 66, 16, 14, 50), m = mapper(box, xr, yr);

    ctx.fillStyle = C.stableBg; ctx.fillRect(box.x, m.Y(0), box.w, box.y + box.h - m.Y(0));
    ctx.fillStyle = C.unstableBg; ctx.fillRect(box.x, box.y, box.w, m.Y(0) - box.y);
    axes(ctx, box, m, xr, yr, { xlabel: 'gain  k', ylabel: 'eigenvalue  λ = a − b·k  (1/s)', nx: 6, ny: 6 });

    clipTo(ctx, box);
    ctx.strokeStyle = C.blue; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(m.X(xr[0]), m.Y(p.a)); ctx.lineTo(m.X(xr[1]), m.Y(p.a - p.b * xr[1])); ctx.stroke();
    const kc = p.a / p.b;
    if (kc <= xr[1]) {
      ctx.setLineDash([8, 6]); ctx.strokeStyle = C.red; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(m.X(kc), box.y); ctx.lineTo(m.X(kc), box.y + box.h); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(m.X(0), m.Y(p.a), 9, 0, 7); ctx.stroke();
    const n = D.trail.length;
    D.trail.forEach((t, i) => {
      ctx.fillStyle = 'rgba(17,24,39,' + (0.08 + 0.4 * (i + 1) / n).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(m.X(t.gk), m.Y(p.a - p.b * t.gk), 3.5, 0, 7); ctx.fill();
    });
    const px = m.X(p.k), py = m.Y(p.a - p.b * p.k);
    ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.fillStyle = cfg.feedback ? C.ink : '#fff';
    ctx.beginPath(); ctx.arc(px, py, 10, 0, 7); ctx.fill(); ctx.stroke();
    if (!cfg.feedback) { ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(px, py, 10, 0, 7); ctx.stroke(); }
    ctx.restore();

    tag(ctx, 'STABLE: λ < 0', box.x + 8, box.y + box.h - 34, { color: C.green, font: FONT_B });
    tag(ctx, 'UNSTABLE: λ > 0', box.x + 8, box.y + 8, { color: C.red, font: FONT_B });
    if (kc <= xr[1]) tag(ctx, 'threshold k = a/b = ' + ui(kc, 2), m.X(kc) + 6, box.y + 32, { color: C.red });
    tag(ctx, (cfg.feedback ? '●' : '○ (feedback off)') + ' k = ' + ui(p.k, 2) + ' → λ = ' + ui(p.a - p.b * p.k, 2) + '   ○ open loop (k = 0) — click or drag', box.x + 8, box.y + box.h - 10, { base: 'bottom', font: FONT_B });
    lastGain = { mode: 1, m, xr, yr };
  }

  function invGain(px, py) {
    if (!lastGain) return null;
    const g = lastGain, x = g.m.ix(px), y = g.m.iy(py);
    if (g.mode === 1) return { k: clamp(x, g.xr[0], g.xr[1]) };
    return { Kp: clamp(x, g.xr[0], g.xr[1]), Kd: clamp(y, g.yr[0], g.yr[1]) };
  }

  function drawTab(tab, canvas, D) {
    lastGain = null;
    const m1 = D.cfg.mode === 1;
    if (tab === 'poles') poles(canvas, D);
    else if (tab === 'phase') (m1 ? phase1 : phase2)(canvas, D);
    else if (tab === 'trdet') trdet(canvas, D);
    else if (tab === 'gain') (m1 ? gain1 : gain2)(canvas, D);
  }

  /* ---------- time series: simulation vs prediction ---------- */
  const ts = { a: null, b: null };
  const smooth = (cur, target) => (cur == null ? target : target > cur ? target : cur + (target - cur) * 0.06);
  function resetRanges() { ts.a = null; ts.b = null; }

  function legend(ctx, x, y, items) {
    ctx.save(); ctx.font = FONT;
    const ws = items.map(it => ctx.measureText(it.label).width + 36), total = ws.reduce((a, b) => a + b, 0);
    ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.fillRect(x - 4, y - 2, total + 8, 21);
    let cx = x;
    items.forEach((it, i) => {
      if (it.fill) { ctx.globalAlpha = 0.3; ctx.fillStyle = it.color; ctx.fillRect(cx, y + 3, 22, 12); ctx.globalAlpha = 1; }
      else { ctx.strokeStyle = it.color; ctx.lineWidth = 3; ctx.setLineDash(it.dash || []); ctx.beginPath(); ctx.moveTo(cx, y + 9); ctx.lineTo(cx + 22, y + 9); ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle = C.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(it.label, cx + 27, y + 2);
      cx += ws[i];
    });
    ctx.restore();
  }

  function timeSeries(canvas, D) {
    const F = fit(canvas); if (!F) return;
    const { ctx, w, h } = F, { cfg, sim, sol } = D;
    const m2 = cfg.mode === 2, k = m2 ? 1 / DEG : 1, lim = m2 ? 90 : M.RAIL;
    const t0 = Math.max(0, sim.t - 6), t1 = t0 + 10, A = sim.anchor;

    const top = 10, bottom = 50, gap = 16, avail = h - top - bottom - gap;
    const hA = avail * 0.62, hB = avail - hA, padL = 66, padR = 16;
    const boxA = { x: padL, y: top, w: w - padL - padR, h: hA };
    const boxB = { x: padL, y: top + hA + gap, w: boxA.w, h: hB };

    // ranges
    let mx = m2 ? 5 : 0.25;
    for (const s of sim.hist) if (s.t >= t0) mx = Math.max(mx, Math.abs(s.z[0]) * k);
    mx = Math.max(mx, Math.abs(sim.z[0]) * k);
    const pred = [];
    if (sol) {
      const ta = Math.max(A.t, t0), NP = 140;
      for (let i = 0; i <= NP; i++) {
        const t = ta + (t1 - ta) * i / NP, v = sol.f(t - A.t) * k, b = sol.bound(t - A.t) * k;
        pred.push({ t, v, b });
        if (isFinite(v)) mx = Math.max(mx, Math.min(Math.abs(v), lim));
      }
      if (isFinite(sol.center)) mx = Math.max(mx, Math.min(Math.abs(sol.center * k), lim));
    }
    ts.a = smooth(ts.a, niceCeil(mx * 1.15));
    let mu = 1;
    for (const s of sim.hist) if (s.t >= t0) mu = Math.max(mu, Math.abs(s.u));
    if (cfg.saturate) mu = Math.max(mu, cfg.p.umax);
    ts.b = smooth(ts.b, niceCeil(mu * 1.15));

    const Ya = ts.a, Yb = ts.b, xr = [t0, t1];
    const mA = mapper(boxA, xr, [-Ya, Ya]), mB = mapper(boxB, xr, [-Yb, Yb]);
    const cl = v => clamp(v, -3 * Ya, 3 * Ya);

    // panel A: state
    axes(ctx, boxA, mA, xr, [-Ya, Ya], { ylabel: m2 ? 'θ  (deg)' : 'x  (m)', hideX: true, nx: 10, ny: 4 });
    clipTo(ctx, boxA);
    if (lim < Ya) {
      ctx.setLineDash([8, 6]); ctx.strokeStyle = C.red; ctx.lineWidth = 2;
      for (const v of [-lim, lim]) { ctx.beginPath(); ctx.moveTo(boxA.x, mA.Y(v)); ctx.lineTo(boxA.x + boxA.w, mA.Y(v)); ctx.stroke(); }
      ctx.setLineDash([]);
    }
    if (cfg.forced && isFinite(sol && sol.center) && Math.abs(sol.center * k) < Ya * 3) {
      ctx.setLineDash([2, 5]); ctx.strokeStyle = C.axis; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(boxA.x, mA.Y(sol.center * k)); ctx.lineTo(boxA.x + boxA.w, mA.Y(sol.center * k)); ctx.stroke(); ctx.setLineDash([]);
    }
    if (pred.length) {                                         // envelope
      const c = isFinite(sol.center) ? sol.center * k : 0;
      ctx.fillStyle = 'rgba(194,65,12,0.12)'; ctx.beginPath();
      pred.forEach((q, i) => { const x = mA.X(q.t), y = mA.Y(cl(c + q.b)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      for (let i = pred.length - 1; i >= 0; i--) ctx.lineTo(mA.X(pred[i].t), mA.Y(cl(c - pred[i].b)));
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = C.blue; ctx.lineWidth = 3.5; ctx.lineJoin = 'round'; ctx.beginPath();     // simulation
    let pen = false;
    for (const s of sim.hist) {
      if (s.t < t0 - 0.3) continue;
      const x = mA.X(s.t), y = mA.Y(cl(s.z[0] * k)); pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y); pen = true;
    }
    ctx.lineTo(mA.X(sim.t), mA.Y(cl(sim.z[0] * k))); ctx.stroke();
    if (pred.length) {                                         // prediction
      ctx.strokeStyle = C.orange; ctx.lineWidth = 2.8; ctx.setLineDash([9, 6]); ctx.beginPath();
      let first = true;
      for (const q of pred) { if (!isFinite(q.v)) continue; const x = mA.X(q.t), y = mA.Y(cl(q.v)); first ? ctx.moveTo(x, y) : ctx.lineTo(x, y); first = false; }
      ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 2;                                           // now / anchor
    ctx.beginPath(); ctx.moveTo(mA.X(sim.t), boxA.y); ctx.lineTo(mA.X(sim.t), boxA.y + boxA.h); ctx.stroke();
    ctx.setLineDash([2, 4]); ctx.strokeStyle = C.orange;
    ctx.beginPath(); ctx.moveTo(mA.X(A.t), boxA.y); ctx.lineTo(mA.X(A.t), boxA.y + boxA.h); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();

    const items = [{ label: 'simulation', color: C.blue }];
    if (sol) { items.push({ label: 'linear prediction from λ', color: C.orange, dash: [9, 6] }); items.push({ label: 'envelope', color: C.orange, fill: true }); }
    legend(ctx, boxA.x + 8, boxA.y + 6, items);
    if (cfg.forced && sol) tag(ctx, (m2 ? 'θp' : 'xp') + ' (particular solution)', boxA.x + boxA.w - 8, boxA.y + boxA.h - 8, { align: 'right', base: 'bottom', color: C.axis });
    tag(ctx, 
