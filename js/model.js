/* model.js — pure math (no DOM): dynamics, RK4, eigen-analysis, closed-form solutions */
(function (global) {
  'use strict';
  const DEQ = (global.DEQ = global.DEQ || {});

  const G = 9.81;
  const EPS = 1e-3;                 // tolerance for "zero" in classification
  const DEG = Math.PI / 180;
  const RAIL = 2.0;                 // Mode 1: half-length of the rail (m)
  const FALL = Math.PI / 2;         // Mode 2: |theta| at which the robot lies down

  const DEFAULT_PARAMS = {
    1: { a: 1.0, b: 1.0, k: 2.0, d: 0.5, umax: 3.0 },
    2: { L: 1.0, Kp: 20.0, Kd: 4.0, d: 2.0, umax: 30.0 }
  };
  // [min, max, step]
  const RANGES = {
    1: { k: [0, 6, 0.05], a: [0.2, 3, 0.05], b: [0.5, 3, 0.05], d: [-1, 1, 0.05], umax: [0.5, 10, 0.1] },
    2: { Kp: [0, 40, 0.1], Kd: [-2, 10, 0.1], L: [0.4, 1.5, 0.05], d: [-5, 5, 0.1], umax: [5, 100, 1] }
  };

  /* number formatting: fmt() -> ASCII for TeX, ui() -> unicode minus for HTML/canvas */
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

  /* ---------- dynamics ---------- */
  // cfg = { mode, feedback, forced, nonlinear, saturate, p }
  function control(cfg, z) {
    const p = cfg.p;
    let terms, uRaw;
    if (!cfg.feedback) { terms = cfg.mode === 1 ? [0] : [0, 0]; uRaw = 0; }
    else if (cfg.mode === 1) { terms = [-p.k * z[0]]; uRaw = terms[0]; }
    else { terms = [-p.Kp * z[0], -p.Kd * z[1]]; uRaw = terms[0] + terms[1]; }
    const u = cfg.saturate ? Math.max(-p.umax, Math.min(p.umax, uRaw)) : uRaw;
    return { u, uRaw, terms };
  }

  function deriv(cfg, z) {
    const p = cfg.p, u = control(cfg, z).u, d = cfg.forced ? p.d : 0;
    if (cfg.mode === 1) return [p.a * z[0] + p.b * u + d];
    const s = cfg.nonlinear ? Math.sin(z[0]) : z[0];
    return [z[1], (G / p.L) * s + u + d];
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

  // mutates z (clamps) and returns true if the robot has fallen / left the rail
  function checkFall(cfg, z) {
    if (!isFinite(z[0])) { z[0] = 0; if (z.length > 1) z[1] = 0; return true; }
    if (cfg.mode === 1) {
      if (Math.abs(z[0]) >= RAIL) { z[0] = Math.sign(z[0]) * RAIL; return true; }
      return false;
    }
    if (Math.abs(z[0]) >= FALL) { z[0] = Math.sign(z[0]) * FALL; z[1] = 0; return true; }
    return false;
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
      mode: 2, fb, d, gl, Kp, Kd, tr, det, disc, eig, type,
      A: [[0, 1], [gl - Kp, -Kd]],
      klass, stability: klass.stability,
      hasEq, thetaP: hasEq ? d / det : NaN,
      omegaN, zeta: det > 0 ? Kd / (2 * omegaN) : NaN
    };
  }

  /* ---------- closed-form solution from an initial state z0 (the "anchor") ---------- */
  // Returns { f(s), bound(s), center, type, coefficients... } where s = t - t0, or null.
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

  DEQ.Model = { G, EPS, DEG, RAIL, FALL, DEFAULT_PARAMS, RANGES, fmt, ui, control, deriv, rk4, checkFall, analyze, solution };
})(window);
