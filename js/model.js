/* model.js — pure math (no DOM): dynamics, RK4, eigen-analysis, closed-form solutions.
   Mode 2 state is always z = [theta, omega, x, v]  (x, v = wheel position / speed).
   Without "hold", the wheel does not feed back, so (theta, omega) is exactly the 2nd-order system. */
(function (global) {
  'use strict';
  const DEQ = (global.DEQ = global.DEQ || {});

  const G = 9.81;
  const EPS = 1e-3;
  const DEG = Math.PI / 180;
  const RAIL = 2.0;
  const FALL = Math.PI / 2;

  const DEFAULT_PARAMS = {
    1: { a: 1.0, b: 1.0, k: 2.0, d: 0.5, umax: 3.0 },
    2: { L: 1.0, Kp: 20.0, Kd: 4.0, Kx: 1.0, Kv: 1.2, d: 2.0, umax: 30.0 }
  };
  // [min, max, step]
  const RANGES = {
    1: { k: [0, 6, 0.05], a: [0.2, 3, 0.05], b: [0.5, 3, 0.05], d: [-1, 1, 0.05], umax: [0.5, 10, 0.1] },
    2: { Kp: [0, 40, 0.1], Kd: [-2, 10, 0.1], Kx: [0, 5, 0.05], Kv: [0, 5, 0.05], L: [0.4, 1.5, 0.05], d: [-5, 5, 0.1], umax: [5, 100, 1] }
  };

  function fmt(x, d) {
    if (d === undefined) d = 2;
    if (!isFinite(x)) return x > 0 ? '\\infty' : x < 0 ? '-\\infty' : '0';
    let s = x.toFixed(d);
    if (Number(s) === 0) s = (0).toFixed(d);
    return s;
  }
  function ui(x, d) {
    if (d === undefined) d = 2;
    if (!isFinite(x)) return x > 0 ? '∞' : x < 0 ? '−∞' : '—';
    return fmt(x, d).replace('-', '\u2212');
  }

  const holdOn = cfg => cfg.mode === 2 && !!cfg.hold;
  const wheelsOn = cfg => cfg.mode === 2 && (cfg.wheels || (cfg.hold && cfg.feedback));

  /* ---------- dynamics ---------- */
  function control(cfg, z) {
    const p = cfg.p;
    let terms, uRaw;
    if (!cfg.feedback) {
      terms = cfg.mode === 1 ? [0] : (holdOn(cfg) ? [0, 0, 0, 0] : [0, 0]); uRaw = 0;
    } else if (cfg.mode === 1) {
      terms = [-p.k * z[0]]; uRaw = terms[0];
    } else {
      terms = [-p.Kp * z[0], -p.Kd * z[1]];
      if (holdOn(cfg)) terms.push(-p.Kx * (z[2] || 0), -p.Kv * (z[3] || 0));
      uRaw = terms.reduce((a, b) => a + b, 0);
    }
    const u = cfg.saturate ? Math.max(-p.umax, Math.min(p.umax, uRaw)) : uRaw;
    return { u, uRaw, terms };
  }

  function deriv(cfg, z) {
    const p = cfg.p, u = control(cfg, z).u, d = cfg.forced ? p.d : 0;
    if (cfg.mode === 1) return [p.a * z[0] + p.b * u + d];
    const s = cfg.nonlinear ? Math.sin(z[0]) : z[0];
    const c = cfg.nonlinear ? Math.max(0.2, Math.cos(z[0])) : 1;
    // wheel acceleration needed to produce u:  theta'' = (g/L) sin(theta) - (a/L) cos(theta)  =>  a = -L u / cos(theta)
    return [z[1], (G / p.L) * s + u + d, z[3] || 0, -p.L * u / c];
  }

  function rk4(cfg, z, dt) {
    const n = z.length, tmp = new Array(n), out = new Array(n);
    const k1 = deriv(cfg, z);
    for (let i = 0; i < n; i++) tmp[i] = z[i] + 0.5 * dt * k1[i];
    const k2 = deriv(cfg, tmp);
    for (let i = 0; i < n; i++) tmp[i] = z[i] + 0.5 * dt * k2[i];
    const k3 = deriv(cfg, tmp);
    for (let i = 0; i < n; i++) tmp[i] = z[i] + dt * k3[i];
    const k4 = deriv(cfg, tmp);
    for (let i = 0; i < n; i++) out[i] = z[i] + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    return out;
  }

  function checkFall(cfg, z) {
    if (!isFinite(z[0])) { for (let i = 0; i < z.length; i++) z[i] = 0; return true; }
    if (cfg.mode === 1) {
      if (Math.abs(z[0]) >= RAIL) { z[0] = Math.sign(z[0]) * RAIL; return true; }
      return false;
    }
    if (Math.abs(z[0]) >= FALL) { z[0] = Math.sign(z[0]) * FALL; z[1] = 0; return true; }
    return false;
  }

  /* ---------- numeric roots of s^4 + c3 s^3 + c2 s^2 + c1 s + c0 (Durand–Kerner) ---------- */
  function roots4(c3, c2, c1, c0) {
    const co = [1, c3, c2, c1, c0], zr = [], zi = [];
    const r0 = Math.max(1, Math.pow(Math.abs(c0), 0.25), Math.abs(c3) / 4 + 0.5);
    for (let k = 0; k < 4; k++) { const a = 0.7 + k * Math.PI / 2; zr.push(r0 * Math.cos(a)); zi.push(r0 * Math.sin(a)); }
    for (let it = 0; it < 500; it++) {
      let delta = 0;
      for (let i = 0; i < 4; i++) {
        let pr = 1, pi = 0;
        for (let m = 1; m < 5; m++) { const nr = pr * zr[i] - pi * zi[i] + co[m]; pi = pr * zi[i] + pi * zr[i]; pr = nr; }
        let dr = 1, di = 0;
        for (let j = 0; j < 4; j++) if (j !== i) {
          const er = zr[i] - zr[j], ei = zi[i] - zi[j], nr = dr * er - di * ei;
          di = dr * ei + di * er; dr = nr;
        }
        const den = dr * dr + di * di || 1e-30;
        const qr = (pr * dr + pi * di) / den, qi = (pi * dr - pr * di) / den;
        zr[i] -= qr; zi[i] -= qi;
        delta = Math.max(delta, Math.abs(qr) + Math.abs(qi));
      }
      if (delta < 1e-13) break;
    }
    const out = [];
    for (let i = 0; i < 4; i++) {
      let re = zr[i], im = zi[i];
      if (!isFinite(re) || !isFinite(im)) { re = 0; im = 0; }
      if (Math.abs(im) < 1e-4 * (1 + Math.abs(re))) im = 0;
      out.push({ re, im });
    }
    out.sort((a, b) => (b.re - a.re) || (b.im - a.im));
    return out;
  }

  /* ---------- linear analysis of the closed loop (ignores saturation / sin) ---------- */
  function classify2(tr, det, disc) {
    if (det < -EPS) return { key: 'saddle', label: 'Saddle', stability: 'unstable' };
    if (Math.abs(det) <= EPS) return { key: 'zero', label: 'Zero eigenvalue', stability: tr > EPS ? 'unstable' : 'marginal' };
    if (Math.abs(tr) <= EPS) return { key: 'center', label: 'Center', stability: 'marginal' };
    const st = tr < 0 ? 'stable' : 'unstable', S = tr < 0 ? 'Stable' : 'Unstable';
    if (disc > EPS) return { key: st + '-node', label: S + ' node', stability: st };
    if (disc < -EPS) return { key: st + '-spiral', label: S + ' spiral', stability: st };
    return { key: st + '-degenerate', label: S + ' node (repeated λ)', stability: st };
  }

  function analyzeHold(cfg) {
    const p = cfg.p, L = p.L, gl = G / L, d = cfg.forced ? p.d : 0;
    const Kp = p.Kp, Kd = p.Kd, Kx = p.Kx, Kv = p.Kv;
    const a3 = Kd - L * Kv, a2 = Kp - gl - L * Kx, a1 = G * Kv, a0 = G * Kx;
    const eig = roots4(a3, a2, a1, a0);
    const maxRe = Math.max.apply(null, eig.map(e => e.re));
    const stability = maxRe < -EPS ? 'stable' : maxRe > EPS ? 'unstable' : 'marginal';
    const word = stability === 'stable' ? 'Stable' : stability === 'unstable' ? 'Unstable' : 'Marginal';
    const hasEq = Math.abs(a0) > 1e-9;
    const thetaP = -d / gl;
    return {
      mode: 2, hold: true, fb: true, d, gl, L, Kp, Kd, Kx, Kv, a: [a3, a2, a1, a0], eig, type: 'hold', maxRe,
      tr: -a3, det: a0, disc: NaN,
      A: [[0, 1, 0, 0], [gl - Kp, -Kd, -Kx, -Kv], [0, 0, 0, 1], [L * Kp, L * Kd, L * Kx, L * Kv]],
      klass: { key: 'hold-' + stability, label: word + ' · 4 poles, hold on', stability }, stability,
      hasEq, thetaP, xP: hasEq ? -Kp * thetaP / Kx : NaN, omegaN: NaN, zeta: NaN
    };
  }

  function analyze(cfg) {
    const p = cfg.p, fb = cfg.feedback;
    const d = cfg.forced ? p.d : 0;

    if (cfg.mode === 1) {
      const k = fb ? p.k : 0;
      const lam = p.a - p.b * k;
      const stability = lam < -EPS ? 'stable' : lam > EPS ? 'unstable' : 'marginal';
      const hasEq = Math.abs(lam) > 1e-9;
      const label = stability === 'stable' ? 'Stable (decaying exponential)'
                  : stability === 'unstable' ? 'Unstable (growing exponential)' : 'Marginal (λ ≈ 0)';
      return {
        mode: 1, fb, d, k, a: p.a, b: p.b, lam, type: 'first',
        eig: [{ re: lam, im: 0 }], tr: lam, det: null, disc: null,
        stability, klass: { key: stability, label, stability },
        hasEq, xp: hasEq ? -d / lam : NaN,
        thresh: p.a / p.b, margin: k - p.a / p.b,
        tau: hasEq ? 1 / Math.abs(lam) : Infinity
      };
    }

    if (fb && cfg.hold) return analyzeHold(cfg);

    const gl = G / p.L;
    const Kp = fb ? p.Kp : 0, Kd = fb ? p.Kd : 0;
    const tr = -Kd, det = Kp - gl, disc = tr * tr - 4 * det;
    let eig, type;
    if (disc > EPS) {
      const s = Math.sqrt(disc);
      eig = [{ re: (tr + s) / 2, im: 0 }, { re: (tr - s) / 2, im: 0 }]; type = 'real';
    } else if (disc < -EPS) {
      const s = Math.sqrt(-disc) / 2;
      eig = [{ re: tr / 2, im: s }, { re: tr / 2, im: -s }]; type = 'complex';
    } else {
      eig = [{ re: tr / 2, im: 0 }, { re: tr / 2, im: 0 }]; type = 'repeated';
    }
    const klass = classify2(tr, det, disc);
    const hasEq = Math.abs(det) > 1e-9;
    const omegaN = det > 0 ? Math.sqrt(det) : NaN;
    return {
      mode: 2, hold: false, fb, d, gl, Kp, Kd, tr, det, disc, eig, type,
      A: [[0, 1], [gl - Kp, -Kd]],
      klass, stability: klass.stability,
      hasEq, thetaP: hasEq ? d / det : NaN,
      omegaN, zeta: det > 0 ? Kd / (2 * omegaN) : NaN
    };
  }

  /* ---------- predicted solution of the linear closed loop from the anchor state ---------- */
  function holdSolution(an, z0) {
    if (!an.hasEq) return null;
    const e = [an.thetaP, 0, an.xP, 0], A = an.A, dt = 0.01, N = 3000, tab = new Float64Array(N + 1);
    let y = [0, 1, 2, 3].map(i => (z0[i] || 0) - e[i]);
    const mv = v => A.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2] + r[3] * v[3]);
    const add = (v, k, s) => v.map((q, i) => q + s * k[i]);
    const lim = v => Math.max(-1e9, Math.min(1e9, isFinite(v) ? v : 0));
    tab[0] = y[0] + e[0];
    for (let i = 0; i < N; i++) {
      const k1 = mv(y), k2 = mv(add(y, k1, dt / 2)), k3 = mv(add(y, k2, dt / 2)), k4 = mv(add(y, k3, dt));
      y = y.map((q, j) => lim(q + dt / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j])));
      tab[i + 1] = y[0] + e[0];
    }
    return {
      mode: 2, type: 'hold', center: an.thetaP, thetaP: an.thetaP, xP: an.xP, noEnv: true,
      th0: z0[0], w0: z0[1], x0: z0[2] || 0, v0: z0[3] || 0,
      f: s => { if (s <= 0) return tab[0]; const q = s / dt; if (q >= N) return tab[N]; const i = Math.floor(q), fr = q - i; return tab[i] * (1 - fr) + tab[i + 1] * fr; },
      bound: () => NaN
    };
  }

  function solution(cfg, an, z0) {
    if (an.mode === 1) {
      const x0 = z0[0], d = an.d;
      if (!an.hasEq) {
        return { mode: 1, type: 'zero', center: 0, x0, d, f: s => x0 + d * s, bound: s => Math.abs(x0) + Math.abs(d) * s };
      }
      const lam = an.lam, xp = an.xp, c = x0 - xp;
      return {
        mode: 1, type: 'first', center: xp, xp, x0, c, lam,
        f: s => xp + c * Math.exp(lam * s),
        bound: s => Math.abs(c) * Math.exp(lam * s)
      };
    }
    if (an.hold) return holdSolution(an, z0);
    if (!an.hasEq) return null;
    const tp = an.thetaP, y1 = z0[0] - tp, y2 = z0[1];
    const base = { mode: 2, center: tp, thetaP: tp, y0: y1, th0: z0[0], w0: z0[1] };

    if (an.type === 'complex') {
      const al = an.eig[0].re, be = an.eig[0].im;
      const C1 = y1, C2 = (y2 - al * y1) / be, R = Math.hypot(C1, C2);
      return Object.assign(base, {
        type: 'complex', al, be, C1, C2,
        f: s => tp + Math.exp(al * s) * (C1 * Math.cos(be * s) + C2 * Math.sin(be * s)),
        bound: s => R * Math.exp(al * s)
      });
    }
    if (an.type === 'repeated') {
      const lam = an.eig[0].re, c1 = y1, c2 = y2 - lam * y1;
      return Object.assign(base, {
        type: 'repeated', lam, c1, c2,
        f: s => tp + (c1 + c2 * s) * Math.exp(lam * s),
        bound: s => (Math.abs(c1) + Math.abs(c2) * s) * Math.exp(lam * s)
      });
    }
    const l1 = an.eig[0].re, l2 = an.eig[1].re;
    const c1 = (y2 - l2 * y1) / (l1 - l2), c2 = (l1 * y1 - y2) / (l1 - l2);
    return Object.assign(base, {
      type: 'real', l1, l2, c1, c2,
      f: s => tp + c1 * Math.exp(l1 * s) + c2 * Math.exp(l2 * s),
      bound: s => Math.abs(c1) * Math.exp(l1 * s) + Math.abs(c2) * Math.exp(l2 * s)
    });
  }

  DEQ.Model = { G, EPS, DEG, RAIL, FALL, DEFAULT_PARAMS, RANGES, fmt, ui, holdOn, wheelsOn, control, deriv, rk4, checkFall, analyze, solution };
})(window);
