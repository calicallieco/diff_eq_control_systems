/* robot.js — draws the cart (mode 1) and balancing robot (mode 2); hit-testing and drag mapping */
(function (global) {
  'use strict';
  const DEQ = (global.DEQ = global.DEQ || {});
  const M = DEQ.Model;
  const DEG = M.DEG;
  const FAM = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  const COL = {
    ink: '#111827', axis: '#374151', blue: '#1d4ed8', body: '#dbeafe', edge: '#1e3a8a',
    purple: '#7e22ce', amber: '#b45309', red: '#b91c1c', green: '#15803d', orange: '#c2410c',
    ground: '#e2e8f0', rail: '#475569'
  };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  let geo = null;

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
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function label(ctx, text, x, y, o) {
    o = o || {};
    ctx.save(); ctx.font = o.font || ('14px ' + FAM);
    const tw = ctx.measureText(text).width, pad = 5, th = 17;
    let bx = x; if (o.align === 'right') bx = x - tw; else if (o.align === 'center') bx = x - tw / 2;
    const by = o.base === 'bottom' ? y - th : y;
    ctx.fillStyle = o.bg || 'rgba(255,255,255,0.88)'; ctx.fillRect(bx - pad, by - 1, tw + 2 * pad, th + 2);
    ctx.fillStyle = o.color || COL.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(text, bx, by);
    ctx.restore();
  }
  function harrow(ctx, x0, y, len, color, lw) {
    if (Math.abs(len) < 2) return;
    const x1 = x0 + len, s = Math.sign(len);
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1 - s * 8, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x1 - s * 16, y - 9); ctx.lineTo(x1 - s * 16, y + 9); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function banner(ctx, w, y, text) {
    ctx.save(); ctx.font = 'bold 20px ' + FAM;
    const tw = ctx.measureText(text).width + 36;
    ctx.fillStyle = 'rgba(254,226,226,0.95)'; ctx.strokeStyle = COL.red; ctx.lineWidth = 3;
    rr(ctx, w / 2 - tw / 2, y, tw, 40, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = COL.red; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, y + 21);
    ctx.restore();
  }
  function segDist(px, py, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
    const t = l2 ? clamp(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1) : 0;
    return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
  }
  const stabColor = an => (an.stability === 'stable' ? COL.green : an.stability === 'unstable' ? COL.red : COL.amber);

  /* ---------- mode 1: cart on a rail ---------- */
  function drawCart(ctx, w, h, D) {
    const { cfg, sim, an } = D, p = cfg.p, R = M.RAIL;
    const margin = 80, cx = w / 2, railY = Math.round(h * 0.62), ppm = (w - 2 * margin) / (2 * R);
    const X = x => cx + x * ppm;

    ctx.fillStyle = '#f1f5f9'; ctx.fillRect(0, railY + 8, w, h - railY - 8);
    // rail, ticks, end stops
    ctx.strokeStyle = COL.rail; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(X(-R), railY); ctx.lineTo(X(R), railY); ctx.stroke();
    ctx.lineWidth = 2; ctx.fillStyle = COL.axis; ctx.font = '14px ' + FAM; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let i = -4; i <= 4; i++) {
      const x = i * 0.5, whole = i % 2 === 0;
      ctx.beginPath(); ctx.moveTo(X(x), railY + 4); ctx.lineTo(X(x), railY + (whole ? 14 : 10)); ctx.stroke();
      if (whole) ctx.fillText(M.ui(x, 0), X(x), railY + 16);
    }
    ctx.textAlign = 'left'; ctx.fillText('x (m)', X(R) + 14, railY - 8);
    ctx.fillStyle = COL.red;
    for (const s of [-1, 1]) ctx.fillRect(X(s * R) - 5, railY - 34, 10, 44);

    // equilibrium marker
    if (an.hasEq && Math.abs(an.xp) <= R) {
      const ex = X(an.xp), ey = railY + 50, col = stabColor(an);
      ctx.fillStyle = an.stability === 'stable' ? col : '#fff'; ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(ex, ey - 9); ctx.lineTo(ex + 9, ey); ctx.lineTo(ex, ey + 9); ctx.lineTo(ex - 9, ey); ctx.closePath(); ctx.fill(); ctx.stroke();
      label(ctx, 'equilibrium' + (cfg.forced ? ' x_p = ' + M.ui(an.xp, 2) : '') + ' (' + an.stability + ')', ex, ey + 14, { align: 'center', color: col });
    }

    // cart
    const x = clamp(sim.z[0], -R, R), px = X(x);
    const wheelR = 11, wy = railY - wheelR - 3, bw = 92, bh = 46, by = wy - 8 - bh;
    ctx.fillStyle = '#e5e7eb'; ctx.strokeStyle = COL.ink; ctx.lineWidth = 3;
    for (const dx of [-28, 28]) { ctx.beginPath(); ctx.arc(px + dx, wy, wheelR, 0, 7); ctx.fill(); ctx.stroke(); }
    ctx.strokeStyle = COL.edge; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px, by); ctx.lineTo(px, by - 16); ctx.stroke();
    ctx.fillStyle = COL.orange; ctx.beginPath(); ctx.arc(px, by - 20, 5, 0, 7); ctx.fill();
    ctx.fillStyle = COL.body; ctx.strokeStyle = COL.edge; ctx.lineWidth = 4;
    rr(ctx, px - bw / 2, by, bw, bh, 10); ctx.fill(); ctx.stroke();
    const v = M.deriv(cfg, sim.z)[0], off = clamp(v * 3, -3, 3);
    for (const dx of [-16, 16]) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = COL.ink; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px + dx, by + 18, 8, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(px + dx + off, by + 18, 3.5, 0, 7); ctx.fill();
    }
    ctx.fillStyle = cfg.feedback ? COL.green : '#9ca3af';
    ctx.beginPath(); ctx.arc(px, by + bh - 10, 5, 0, 7); ctx.fill();
    geo = { mode: 1, X, cx, ppm, px, top: by - 30, bottom: railY + 10 };

    // control arrow
    const u = sim.ctrl ? sim.ctrl.u : 0, Un = Math.max(0.5, cfg.saturate ? p.umax : 3);
    const ay = by - 38, len = 120 * Math.tanh(u / Un);
    if (Math.abs(len) >= 2) {
      harrow(ctx, px, ay, len, COL.purple, 5);
      label(ctx, 'u = ' + M.ui(u, 2), px + len / 2, ay - 26, { align: 'center', color: COL.purple, font: 'bold 14px ' + FAM });
    } else label(ctx, 'u = 0', px, ay - 14, { align: 'center', color: COL.purple });

    // disturbance
    if (cfg.forced) {
      const dl = 80 * Math.tanh(p.d / 1), dy = Math.max(46, railY - 150);
      harrow(ctx, 90 - dl / 2, dy, dl, COL.amber, 6);
      label(ctx, 'disturbance d = ' + M.ui(p.d, 2) + ' m/s', 20, dy - 30, { color: COL.amber, font: 'bold 14px ' + FAM });
    }
    label(ctx, 'Open loop: the cart is pushed away from x = 0', 12, 10, { color: COL.axis });
    if (sim.fallen) banner(ctx, w, 44, 'Hit the end stop: unstable. Press Reset (R)');
    else if (D.showHint) label(ctx, 'Drag the cart, then release', w / 2, h - 14, { align: 'center', base: 'bottom', font: 'bold 16px ' + FAM, color: COL.blue });
  }

  /* ---------- mode 2: self-balancing robot on an inverted pendulum ---------- */
  function drawRobot(ctx, w, h, D) {
    const { cfg, sim, an } = D, p = cfg.p;
    const cx = w / 2, groundY = h - 46, wheelR = 24, pivotY = groundY - wheelR;
    const availH = pivotY - 64;
    const len = Math.min(availH, Math.max(110, availH * (0.45 + 0.55 * (p.L - 0.4) / 1.1)));
    const th = sim.z[0], tipX = cx + len * Math.sin(th), tipY = pivotY - len * Math.cos(th);
    geo = { mode: 2, cx, pivotY, len, tipX, tipY };

    // ground
    ctx.fillStyle = COL.ground; ctx.fillRect(0, groundY, w, h - groundY);
    ctx.strokeStyle = COL.rail; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(w, groundY); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = '#94a3b8';
    for (let x = 0; x < w; x += 22) { ctx.beginPath(); ctx.moveTo(x, groundY + 2); ctx.lineTo(x - 10, groundY + 14); ctx.stroke(); }

    // fall limits and upright reference
    ctx.setLineDash([8, 6]); ctx.lineWidth = 2; ctx.strokeStyle = COL.red;
    ctx.beginPath(); ctx.moveTo(cx - len - 30, pivotY); ctx.lineTo(cx - wheelR - 4, pivotY);
    ctx.moveTo(cx + wheelR + 4, pivotY); ctx.lineTo(cx + len + 30, pivotY); ctx.stroke();
    ctx.strokeStyle = '#6b7280'; ctx.beginPath(); ctx.moveTo(cx, pivotY); ctx.lineTo(cx, pivotY - len - 34); ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, 'lies down at ±90°', cx - len - 30, pivotY - 24, { color: COL.red });

    // shifted equilibrium (non-homogeneous)
    if (cfg.forced && an.hasEq && Math.abs(an.thetaP) < M.FALL) {
      const gx = cx + len * Math.sin(an.thetaP), gy = pivotY - len * Math.cos(an.thetaP), col = stabColor(an);
      ctx.save(); ctx.globalAlpha = 0.7; ctx.setLineDash([3, 8]); ctx.lineCap = 'round'; ctx.lineWidth = 8; ctx.strokeStyle = col;
      ctx.beginPath(); ctx.moveTo(cx, pivotY); ctx.lineTo(gx, gy); ctx.stroke(); ctx.restore();
      label(ctx, 'equilibrium θp = ' + M.ui(an.thetaP / DEG, 1) + '° (' + an.stability + ')', gx, gy - 28, { align: 'center', color: col });
    }

    // angle arc
    if (Math.abs(th) > 0.01) {
      ctx.strokeStyle = COL.orange; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, pivotY, 62, -Math.PI / 2, -Math.PI / 2 + th, th < 0); ctx.stroke();
      const am = -Math.PI / 2 + th / 2;
      label(ctx, 'θ = ' + M.ui(th / DEG, 1) + '°', cx + 92 * Math.cos(am), pivotY + 92 * Math.sin(am) - 8, { align: 'center', color: COL.orange, font: 'bold 14px ' + FAM });
    }

    // body
    ctx.save(); ctx.translate(cx, pivotY); ctx.rotate(th);
    ctx.strokeStyle = COL.edge; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -len); ctx.lineTo(0, -len - 14); ctx.stroke();
    ctx.fillStyle = COL.orange; ctx.beginPath(); ctx.arc(0, -len - 18, 5, 0, 7); ctx.fill();
    ctx.fillStyle = COL.body; ctx.strokeStyle = COL.edge; ctx.lineWidth = 4;
    rr(ctx, -17, -len + 30, 34, len - 34, 6); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 2;
    for (let y = -len + 52; y < -24; y += 20) { ctx.beginPath(); ctx.moveTo(-9, y); ctx.lineTo(9, y); ctx.stroke(); }
    rr(ctx, -24, -len, 48, 34, 8); ctx.fill(); ctx.lineWidth = 4; ctx.stroke();
    for (const dx of [-9, 9]) {
      const ey = -len + 17;
      if (sim.fallen) {
        ctx.strokeStyle = COL.red; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(dx - 5, ey - 5); ctx.lineTo(dx + 5, ey + 5); ctx.moveTo(dx + 5, ey - 5); ctx.lineTo(dx - 5, ey + 5); ctx.stroke();
      } else {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = COL.ink; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(dx, ey, 6, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(dx, ey, 2.5, 0, 7); ctx.fill();
      }
    }
    ctx.restore();

    // wheel
    ctx.fillStyle = '#e5e7eb'; ctx.strokeStyle = COL.ink; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, pivotY, wheelR, 0, 7); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 4;
      ctx.beginPath(); ctx.moveTo(cx - wheelR * Math.cos(a), pivotY - wheelR * Math.sin(a)); ctx.lineTo(cx + wheelR * Math.cos(a), pivotY + wheelR * Math.sin(a)); ctx.stroke();
    }
    ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(cx, pivotY, 6, 0, 7); ctx.fill();

    // control arrow (direction in which u pushes θ)
    const u = sim.ctrl ? sim.ctrl.u : 0, Un = Math.max(1, cfg.saturate ? p.umax : 30);
    const ay = Math.max(24, tipY - 44), al = 120 * Math.tanh(u / Un);
    if (Math.abs(al) >= 2) {
      harrow(ctx, tipX, ay, al, COL.purple, 5);
      label(ctx, 'u = ' + M.ui(u, 2), tipX + al / 2, ay - 26, { align: 'center', color: COL.purple, font: 'bold 14px ' + FAM });
    } else label(ctx, 'u = 0', tipX, ay - 14, { align: 'center', color: COL.purple });

    // disturbance
    if (cfg.forced) {
      const dl = 80 * Math.tanh(p.d / 4), dy = pivotY - len * 0.55;
      harrow(ctx, 70 - dl / 2, dy, dl, COL.amber, 6);
      label(ctx, 'disturbance d = ' + M.ui(p.d, 2) + ' rad/s²', 14, dy - 30, { color: COL.amber, font: 'bold 14px ' + FAM });
    }
    label(ctx, 'purple arrow: control push u · positive θ = lean right', w - 10, 10, { align: 'right', color: COL.axis });
    if (sim.fallen) banner(ctx, w, 44, 'Fallen: unstable. Press Reset (R)');
    else if (D.showHint) label(ctx, 'Drag the robot, then release', w / 2, groundY + 34, { align: 'center', base: 'bottom', font: 'bold 16px ' + FAM, color: COL.blue });
  }

  function draw(canvas, D) {
    const F = fit(canvas);
    if (!F) { geo = null; return; }
    if (D.cfg.mode === 1) drawCart(F.ctx, F.w, F.h, D); else drawRobot(F.ctx, F.w, F.h, D);
  }

  function hit(cfg, px, py) {
    if (!geo || geo.mode !== cfg.mode) return false;
    if (geo.mode === 1) return Math.abs(px - geo.px) < 56 && py > geo.top && py < geo.bottom;
    return segDist(px, py, geo.cx, geo.pivotY, geo.tipX, geo.tipY) < 34 || Math.hypot(px - geo.tipX, py - geo.tipY) < 40;
  }

  // pointer position -> initial state (velocity zero)
  function pointerToState(cfg, px, py) {
    if (!geo || geo.mode !== cfg.mode) return null;
    if (geo.mode === 1) return [clamp((px - geo.cx) / geo.ppm, -M.RAIL + 0.02, M.RAIL - 0.02)];
    const th = Math.atan2(px - geo.cx, geo.pivotY - py);
    return [clamp(th, -M.FALL + 0.02, M.FALL - 0.02), 0];
  }

  DEQ.Robot = { draw, hit, pointerToState };
})(window);
