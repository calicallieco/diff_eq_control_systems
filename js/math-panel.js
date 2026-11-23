/* math-panel.js — KaTeX equation stepper, summary strip, parameter tests, "what to notice", control-law bars */
(function (global) {
  'use strict';
  const DEQ = (global.DEQ = global.DEQ || {});
  const M = DEQ.Model;
  const DEG = M.DEG, EPS = M.EPS;
  const R = String.raw;
  const $ = id => document.getElementById(id);
  const n = (x, d) => M.fmt(x, d);          // ASCII, for TeX
  const U = (x, d) => M.ui(x, d);           // unicode minus, for HTML
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function sgn(x, d) {
    const s = n(Math.abs(x), d);
    return (x < 0 && Number(s) !== 0 ? ' - ' : ' + ') + s;
  }
  function lin(terms, d) {
    let out = '';
    terms.forEach(function (t, i) {
      const c = t[0], v = t[1], txt = n(Math.abs(c), d), neg = c < 0 && Number(txt) !== 0;
      const body = v ? txt + '\\,' + v : txt;
      out += i === 0 ? (neg ? '-' : '') + body : (neg ? ' - ' : ' + ') + body;
    });
    return out;
  }
  const TH = '\\theta', THP = "\\theta'";

  /* ---------- equation rows: mode 1 ---------- */
  function rows1(cfg, an, sol) {
    const p = cfg.p, f = cfg.forced, d = f ? p.d : 0, rows = [];
    const c = p.b * an.k - p.a;

    rows.push({ id: 'model', label: 'Physical model', tex:
      R`\begin{aligned} x' &= a\,x + b\,u${f ? ' + d' : ''}\\ &= ${n(p.a)}\,x + ${n(p.b)}\,u${f ? sgn(p.d) : ''} \end{aligned}` });

    let ctl;
    if (!an.fb) ctl = R`u = 0 \qquad \text{(feedback off)}`;
    else if (cfg.saturate) ctl = R`u = \mathrm{sat}_{\pm ${n(p.umax, 1)}}\!\left(-k\,x\right),\quad k = ${n(p.k)}`;
    else ctl = R`u = -k\,x = -${n(p.k)}\,x`;
    rows.push({ id: 'ctl', label: 'Control law', tex: ctl });

    rows.push({ id: 'cl', label: 'Closed-loop ODE', tex:
      R`\begin{aligned} x' + (bk - a)\,x &= ${f ? 'd' : '0'}\\ x'${sgn(c)}\,x &= ${n(d)} \end{aligned}` });

    let ch = R`\begin{aligned} \lambda + (bk - a) &= 0\\ \lambda &= a - bk\\ &= ${n(p.a)} - ${n(p.b)}\cdot ${n(an.k)}\\ &= ${n(an.lam)}`;
    if (an.stability === 'stable') ch += R`\\ \tau &= \frac{1}{|\lambda|} = ${n(an.tau)}\ \text{s}`;
    else if (an.stability === 'unstable') ch += R`\\ t_{2} &= \frac{\ln 2}{\lambda} = ${n(Math.LN2 / an.lam)}\ \text{s (doubling time)}`;
    ch += R` \end{aligned}`;
    rows.push({ id: 'char', label: 'Characteristic equation and eigenvalue', tex: ch });

    if (f) {
      rows.push({ id: 'part', label: 'Particular solution (the shifted equilibrium)', tex: an.hasEq
        ? R`x_p = \frac{d}{bk - a} = \frac{${n(d)}}{${n(c)}} = ${n(an.xp)}\ \text{m}`
        : R`bk - a = 0:\ \text{no constant particular solution}` });
    }

    let g;
    if (sol && sol.type === 'first') {
      g = f
        ? R`\begin{aligned} x(0) &= ${n(sol.x0)}\ \text{m}\\ x(t) &= \underbrace{(x_0 - x_p)\,e^{\lambda t}}_{\text{homogeneous}} + \underbrace{x_p}_{\text{particular}}\\ &= ${n(sol.c)}\,e^{${n(an.lam)}\,t}${sgn(sol.xp)} \end{aligned}`
        : R`\begin{aligned} x(0) &= ${n(sol.x0)}\ \text{m}\\ x(t) &= x_0\,e^{\lambda t}\\ &= ${n(sol.x0)}\,e^{${n(an.lam)}\,t} \end{aligned}`;
    } else if (sol) {
      g = R`x(t) = x_0 + d\,t = ${n(sol.x0)}${sgn(d)}\,t`;
    } else g = R`\text{(no solution available)}`;
    rows.push({ id: 'sol', label: 'General solution (t measured from your last push)', tex: g });
    return rows;
  }

  /* ---------- equation rows: mode 2 (plain 2nd-order system, hold off) ---------- */
  function rows2(cfg, an, sol) {
    const p = cfg.p, f = cfg.forced, d = f ? p.d : 0, gl = an.gl, rows = [];
    const dT = f ? ' + d' : '', dN = f ? sgn(p.d) : '';
    const Kp = an.Kp, Kd = an.Kd;

    rows.push({ id: 'model', label: cfg.nonlinear ? 'Physical model (simulated)' : 'Physical model', tex:
      R`\theta'' = \frac{g}{L}\sin\theta + u${dT},\qquad \frac{g}{L} = \frac{${n(M.G)}}{${n(p.L)}} = ${n(gl)}` });
    rows.push({ id: 'lin', label: cfg.nonlinear ? 'Linearized near θ = 0 (used for the analysis)' : 'Linearization sin θ ≈ θ (simulated model)', tex:
      R`\sin\theta \approx \theta \;\Rightarrow\; \theta'' = ${n(gl)}\,\theta + u${dN}` });

    let ctl;
    if (!an.fb) ctl = R`u = 0 \qquad \text{(feedback off)}`;
    else if (cfg.saturate) ctl = R`u = \mathrm{sat}_{\pm ${n(p.umax, 1)}}\!\left(-K_p\theta - K_d\theta'\right)`;
    else ctl = R`u = -K_p\,\theta - K_d\,\theta' = ${lin([[-Kp, TH], [-Kd, THP]], 2)}`;
    rows.push({ id: 'ctl', label: 'Control law', tex: ctl });

    rows.push({ id: 'cl', label: 'Closed-loop ODE', tex:
      R`\begin{aligned} \theta'' + K_d\,\theta' + \left(K_p - \tfrac{g}{L}\right)\theta &= ${f ? 'd' : '0'}\\ \theta''${sgn(Kd)}\,\theta'${sgn(an.det)}\,\theta &= ${n(d)} \end{aligned}` });

    rows.push({ id: 'ss', label: 'State-space form, x = (θ, θ′)', tex:
      R`\begin{aligned} \mathbf{x}' &= (A - BK)\,\mathbf{x}${f ? R` + \begin{bmatrix}0\\ 1\end{bmatrix} d` : ''}\\ A - BK &= \begin{bmatrix}0 & 1\\ ${n(gl)} & 0\end{bmatrix} - \begin{bmatrix}0\\ 1\end{bmatrix}\begin{bmatrix}${n(Kp)} & ${n(Kd)}\end{bmatrix} = \begin{bmatrix}0 & 1\\ ${n(gl - Kp)} & ${n(-Kd)}\end{bmatrix} \end{aligned}` });

    rows.push({ id: 'char', label: 'Characteristic equation', tex:
      R`\begin{aligned} \det\!\big(\lambda I - (A-BK)\big) = \lambda^2 + K_d\lambda + \left(K_p - \tfrac{g}{L}\right) &= 0\\ \lambda^2${sgn(Kd)}\,\lambda${sgn(an.det)} &= 0 \end{aligned}` });

    let ev = R`\begin{aligned} \mathrm{tr} &= -K_d = ${n(an.tr)},\quad \det = K_p - \tfrac{g}{L} = ${n(an.det)}\\ \Delta &= \mathrm{tr}^2 - 4\det = ${n(an.disc)}\\ `;
    if (an.type === 'complex') ev += R`\lambda &= \frac{\mathrm{tr} \pm \sqrt{\Delta}}{2} = ${n(an.eig[0].re)} \pm ${n(Math.abs(an.eig[0].im))}\,i`;
    else if (an.type === 'real') ev += R`\lambda_{1,2} &= \frac{\mathrm{tr} \pm \sqrt{\Delta}}{2}:\ \lambda_1 = ${n(an.eig[0].re)},\ \lambda_2 = ${n(an.eig[1].re)}`;
    else ev += R`\lambda_{1,2} &= \frac{\mathrm{tr}}{2} = ${n(an.eig[0].re)}\ \text{(repeated)}`;
    ev += R` \end{aligned}`;
    rows.push({ id: 'eig', label: 'Eigenvalues', tex: ev });

    if (an.type !== 'complex') {
      const vec = l => R`\begin{bmatrix}1\\ ${n(l)}\end{bmatrix}`;
      rows.push({ id: 'vec', label: 'Eigenvectors (dashed lines on the phase portrait)', tex: an.type === 'real'
        ? R`\mathbf{v}_i = \begin{bmatrix}1\\ \lambda_i\end{bmatrix}:\quad \mathbf{v}_1 = ${vec(an.eig[0].re)},\ \mathbf{v}_2 = ${vec(an.eig[1].re)}`
        : R`\mathbf{v} = \begin{bmatrix}1\\ \lambda\end{bmatrix} = ${vec(an.eig[0].re)}\ \text{(only one independent eigenvector)}` });
    }
    if (an.det > EPS) {
      let s = R`\omega_n = \sqrt{\det} = ${n(an.omegaN)}\ \text{rad/s},\quad \zeta = \frac{K_d}{2\omega_n} = ${n(an.zeta)}`;
      if (an.type === 'complex') s += R`,\quad T_d = \frac{2\pi}{\beta} = ${n(2 * Math.PI / an.eig[0].im)}\ \text{s}`;
      rows.push({ id: 'damp', label: 'Natural frequency and damping', tex: s });
    }
    if (f) {
      rows.push({ id: 'part', label: 'Particular solution (the shifted equilibrium)', tex: an.hasEq
        ? R`\theta_p = \frac{d}{K_p - g/L} = \frac{${n(d)}}{${n(an.det)}} = ${n(an.thetaP, 3)}\ \text{rad} = ${n(an.thetaP / DEG, 1)}^\circ`
        : R`\det = 0:\ \text{no constant particular solution}` });
    }

    let g;
    if (!sol) {
      g = R`\det(A-BK) = 0 \;\Rightarrow\; \lambda = 0\ \text{is an eigenvalue; no isolated equilibrium}`;
    } else {
      const ic = R`\theta(0) = ${n(sol.th0, 3)}\ \text{rad},\quad \theta'(0) = ${n(sol.w0, 3)}\ \text{rad/s}`;
      const lead = f ? n(sol.thetaP, 3) + ' + ' : '';
      const tpS = f ? R`\theta_p + ` : '';
      const tpM = f ? R` - \theta_p` : '';
      if (sol.type === 'complex') {
        g = R`\begin{aligned} ${ic}\\ \theta(t) &= ${tpS}e^{\alpha t}\big(C_1\cos\beta t + C_2\sin\beta t\big)\\ &= ${lead}e^{${n(sol.al)}\,t}\big(${n(sol.C1, 3)}\cos ${n(sol.be)}t${sgn(sol.C2, 3)}\sin ${n(sol.be)}t\big)\\ C_1 &= \theta(0)${tpM},\quad C_2 = \frac{\theta'(0) - \alpha C_1}{\beta} \end{aligned}`;
      } else if (sol.type === 'real') {
        g = R`\begin{aligned} ${ic}\\ \theta(t) &= ${tpS}c_1 e^{\lambda_1 t} + c_2 e^{\lambda_2 t}\\ &= ${lin([[sol.thetaP * (f ? 1 : 0), ''], [sol.c1, 'e^{' + n(sol.l1) + '\\,t}'], [sol.c2, 'e^{' + n(sol.l2) + '\\,t}']].slice(f ? 0 : 1), 3)} \end{aligned}`;
      } else {
        g = R`\begin{aligned} ${ic}\\ \theta(t) &= ${tpS}(c_1 + c_2 t)\,e^{\lambda t}\\ &= ${lead}\left(${lin([[sol.c1, ''], [sol.c2, 't']], 3)}\right)e^{${n(sol.lam)}\,t} \end{aligned}`;
      }
    }
    rows.push({ id: 'sol', label: 'General solution (t measured from your last push)', tex: g });
    return rows;
  }

  /* ---------- equation rows: mode 2 with "hold position" (4th order) ---------- */
  function rowsHold(cfg, an, sol) {
    const p = cfg.p, f = cfg.forced, d = f ? p.d : 0, gl = an.gl, L = p.L, rows = [];
    const Kp = an.Kp, Kd = an.Kd, Kx = an.Kx, Kv = an.Kv, a = an.a;

    rows.push({ id: 'model', label: cfg.nonlinear ? 'Physical model: tilt and wheel (simulated)' : 'Physical model: tilt and wheel', tex:
      R`\begin{aligned} \theta'' &= \frac{g}{L}\sin\theta + u${f ? ' + d' : ''}\\ x'' &= -L\,u${cfg.nonlinear ? R`\,/\cos\theta` : ''}\\ \tfrac{g}{L} &= ${n(gl)},\quad L = ${n(L)}\ \text{m} \end{aligned}` });

    let ctl;
    if (cfg.saturate) ctl = R`u = \mathrm{sat}_{\pm ${n(p.umax, 1)}}\!\left(-K_p\theta - K_d\theta' - K_x x - K_v x'\right)`;
    else ctl = R`\begin{aligned} u &= -K_p\theta - K_d\theta' - K_x x - K_v x'\\ &= ${lin([[-Kp, TH], [-Kd, THP], [-Kx, 'x'], [-Kv, "x'"]], 2)} \end{aligned}`;
    rows.push({ id: 'ctl', label: 'Control law (angle and wheel feedback)', tex: ctl });

    rows.push({ id: 'cl', label: 'Closed-loop ODEs: the θ-equation is still 2nd order', tex:
      R`\begin{aligned} \theta'' + K_d\theta' + \left(K_p - \tfrac{g}{L}\right)\theta &= -K_x x - K_v x'${f ? ' + d' : ''}\\ \theta''${sgn(Kd)}\,\theta'${sgn(Kp - gl)}\,\theta &= ${lin([[-Kx, 'x'], [-Kv, "x'"]], 2)}${f ? sgn(d) : ''}\\ x'' &= ${n(L)}\left(${lin([[Kp, TH], [Kd, THP], [Kx, 'x'], [Kv, "x'"]], 2)}\right) \end{aligned}` });

    const m = x => n(x);
    rows.push({ id: 'ss', label: 'State-space form, x = (θ, θ′, x, x′)', tex:
      R`\begin{aligned} \mathbf{x}' &= (A - BK)\,\mathbf{x}${f ? R` + \begin{bmatrix}0\\ 1\\ 0\\ 0\end{bmatrix} d` : ''}\\ A - BK &= \begin{bmatrix}0 & 1 & 0 & 0\\ ${m(gl - Kp)} & ${m(-Kd)} & ${m(-Kx)} & ${m(-Kv)}\\ 0 & 0 & 0 & 1\\ ${m(L * Kp)} & ${m(L * Kd)} & ${m(L * Kx)} & ${m(L * Kv)}\end{bmatrix} \end{aligned}` });

    rows.push({ id: 'char', label: 'Characteristic equation (4th order)', tex:
      R`\begin{aligned} \lambda^4 + (K_d - LK_v)\lambda^3 + \left(K_p - \tfrac{g}{L} - LK_x\right)\lambda^2 + gK_v\lambda + gK_x &= 0\\ \lambda^4${sgn(a[0])}\,\lambda^3${sgn(a[1])}\,\lambda^2${sgn(a[2])}\,\lambda${sgn(a[3])} &= 0 \end{aligned}` });

    const ev = an.eig.map((e, i) => R`\lambda_{${i + 1}} &= ${n(e.re)}${Math.abs(e.im) > 1e-9 ? (e.im < 0 ? ' - ' : ' + ') + n(Math.abs(e.im)) + '\\,i' : ''}`);
    rows.push({ id: 'eig', label: 'Eigenvalues (computed numerically)', tex:
      R`\begin{aligned} ${ev[0]} \quad & ${ev[1]}\\ ${ev[2]} \quad & ${ev[3]}\\ \max\mathrm{Re}\,\lambda &= ${n(an.maxRe)} \end{aligned}` });

    if (f) {
      rows.push({ id: 'part', label: 'Particular solution (where it parks)', tex: an.hasEq
        ? R`\begin{aligned} \theta_p &= -\frac{dL}{g} = ${n(an.thetaP, 3)}\ \text{rad} = ${n(an.thetaP / DEG, 1)}^\circ\\ x_p &= -\frac{K_p\,\theta_p}{K_x} = ${n(an.xP)}\ \text{m} \end{aligned}`
        : R`K_x = 0:\ \text{no isolated equilibrium (the wheel is free to drift)}` });
    }

    let g;
    if (!sol) {
      g = R`K_x = 0 \;\Rightarrow\; \lambda = 0\ \text{is an eigenvalue: wheel position is not held, so there is no single equilibrium}`;
    } else {
      g = R`\begin{aligned} \theta(0) &= ${n(sol.th0, 3)},\ \theta'(0) = ${n(sol.w0, 3)},\ x(0) = ${n(sol.x0, 2)},\ x'(0) = ${n(sol.v0, 2)}\\ \theta(t) &= ${f ? R`\theta_p + ` : ''}\sum_{i=1}^{4} c_i\,e^{\lambda_i t}\quad (c_i\text{ fixed by the 4 initial conditions}) \end{aligned}`;
    }
    rows.push({ id: 'sol', label: 'General solution (t measured from your last push)', tex: g });
    return rows;
  }

  /* ---------- KaTeX rendering ---------- */
  function renderTeX(el, tex) {
    if (global.katex) {
      try {
        global.katex.render(tex, el, { displayMode: true, throwOnError: false, strict: 'ignore' });
        el.classList.remove('raw'); return;
      } catch (e) { /* fall through to raw */ }
    }
    el.textContent = tex; el.classList.add('raw');
  }
  function flash(el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }

  /* ---------- equation stepper (one equation at a time) ---------- */
  const st = { rows: [], id: null, sig: '', shownId: null, shownTex: null };
  function buildDots() {
    const host = $('eq-dots'); host.innerHTML = '';
    st.rows.forEach((r, i) => {
      const b = document.createElement('button'); b.className = 'dot'; b.title = r.label; b.setAttribute('aria-label', r.label);
      b.addEventListener('click', () => showRow(i));
      host.appendChild(b);
    });
  }
  function showRow(idx) {
    const r = st.rows[idx]; if (!r) return;
    st.id = r.id;
    $('eq-label').textContent = r.label;
    $('eq-count').textContent = (idx + 1) + ' / ' + st.rows.length;
    $('eq-prev').disabled = idx === 0; $('eq-next').disabled = idx === st.rows.length - 1;
    Array.prototype.forEach.call($('eq-dots').children, (b, i) => b.setAttribute('aria-current', i === idx ? 'true' : 'false'));
    if (st.shownTex !== r.tex || st.shownId !== r.id) {
      renderTeX($('eq-body'), r.tex);
      if (st.shownId === r.id && st.shownTex !== null) flash($('eq-stage'));
      st.shownId = r.id; st.shownTex = r.tex;
    }
  }
  function updateEq(rows) {
    st.rows = rows;
    const sig = rows.map(r => r.id).join('|');
    let idx = rows.findIndex(r => r.id === st.id); if (idx < 0) idx = 0;
    if (sig !== st.sig) { st.sig = sig; buildDots(); }
    showRow(idx);
  }
  function stepBy(dir) {
    const idx = st.rows.findIndex(r => r.id === st.id);
    showRow(clamp(idx + dir, 0, st.rows.length - 1));
  }
  $('eq-prev').addEventListener('click', () => stepBy(-1));
  $('eq-next').addEventListener('click', () => stepBy(1));

  /* ---------- summary strip ---------- */
  function eigStr(an) {
    if (an.hold) {
      const e = an.eig, used = e.map(() => false), out = [];
      for (let i = 0; i < e.length; i++) {
        if (used[i]) continue; used[i] = true;
        if (Math.abs(e[i].im) > 1e-9) {
          for (let j = i + 1; j < e.length; j++) if (!used[j] && Math.abs(e[j].im + e[i].im) < 1e-6 && Math.abs(e[j].re - e[i].re) < 1e-6) { used[j] = true; break; }
          out.push(U(e[i].re, 2) + ' ± ' + U(Math.abs(e[i].im), 2) + 'i');
        } else out.push(U(e[i].re, 2));
      }
      return 'λ = ' + out.join(', ');
    }
    if (an.mode === 1) return 'λ = ' + U(an.lam, 2);
    if (an.type === 'complex') return 'λ = ' + U(an.eig[0].re, 2) + ' ± ' + U(Math.abs(an.eig[0].im), 2) + ' i';
    return 'λ₁ = ' + U(an.eig[0].re, 2) + ', λ₂ = ' + U(an.eig[1].re, 2);
  }
  function verdict(cls, text) { return '<div class="verdict ' + cls + '">' + text + '</div>'; }

  const sumCache = { ode: '', v: '' };
  function updateSummary(cfg, an) {
    const f = cfg.forced, rhs = f ? n(cfg.p.d) : '0';
    let tex;
    if (cfg.mode === 1) tex = R`x'${sgn(cfg.p.b * an.k - cfg.p.a)}\,x = ${rhs}`;
    else if (an.hold) tex = R`\theta''${sgn(an.Kd)}\,\theta'${sgn(an.Kp - an.gl)}\,\theta = ${lin([[-an.Kx, 'x'], [-an.Kv, "x'"]], 2)}${f ? sgn(cfg.p.d) : ''}`;
    else tex = R`\theta''${sgn(an.Kd)}\,\theta'${sgn(an.det)}\,\theta = ${rhs}`;
    if (tex !== sumCache.ode) { renderTeX($('sum-ode'), tex); sumCache.ode = tex; }
    const cls = an.stability === 'stable' ? 'good' : an.stability === 'unstable' ? 'bad' : 'warn';
    const html = verdict(cls, an.klass.label.toUpperCase() + ' · ' + eigStr(an));
    if (html !== sumCache.v) { $('sum-verdict').innerHTML = html; sumCache.v = html; }
  }

  /* ---------- parameter tests ---------- */
  function test(cls, badge, main, cond, note) {
    return '<li class="test ' + cls + '"><span class="badge">' + badge + '</span><div><span>' + main + '</span>' +
      (cond ? '<span class="cond">' + cond + '</span>' : '') + (note ? '<span class="note">' + note + '</span>' : '') + '</div></li>';
  }
  const PASS = '✓ pass', FAIL = '✗ fail', INFO = 'info';
  const signed = (x, d) => (x >= 0 ? '+' : '') + U(x, d);

  function tests1(cfg, an) {
    const p = cfg.p, items = [], margin = an.margin;
    items.push(test(an.lam < -EPS ? 'pass' : 'fail', an.lam < -EPS ? PASS : FAIL,
      'λ = a − b·k = ' + U(p.a) + ' − (' + U(p.b) + ')(' + U(an.k) + ') = ' + U(an.lam), 'need λ &lt; 0',
      Math.abs(an.lam) <= EPS ? 'λ ≈ 0: marginal' : ''));
    items.push(test(margin > EPS ? 'pass' : 'fail', margin > EPS ? PASS : FAIL,
      (an.fb ? 'k = ' + U(an.k) : 'k = 0 (feedback off)') + ' vs. threshold a/b = ' + U(an.thresh), 'need k &gt; a/b',
      'margin k − a/b = ' + signed(margin, 2)));
    if (an.stability === 'stable') items.push(test('info', INFO, 'time constant τ = 1/|λ| = ' + U(an.tau) + ' s', '', 'about 3τ = ' + U(3 * an.tau, 1) + ' s to settle within 5%'));
    else if (an.stability === 'unstable') items.push(test('info', INFO, 'doubling time = ln 2 / λ = ' + U(Math.LN2 / an.lam) + ' s', '', 'deviations grow like e^{λt}'));
    if (cfg.forced) items.push(test('info', INFO, an.hasEq ? 'equilibrium x_p = d/(bk − a) = ' + U(an.xp) + ' m' : 'bk − a = 0: no constant equilibrium', '', 'd moves the equilibrium; it does not change λ'));
    if (cfg.saturate && an.fb && an.k > 0) items.push(test('info', INFO, '|u| ≤ ' + U(p.umax, 1) + ' ⇒ linear law holds while |x| &lt; u_max/k = ' + U(p.umax / an.k) + ' m', '', 'beyond that the actuator saturates'));
    let v;
    if (an.stability === 'stable') v = verdict('good', 'STABLE: λ = ' + U(an.lam) + ' &lt; 0, so x → ' + (cfg.forced ? 'x_p' : '0') + ' exponentially');
    else if (an.stability === 'unstable') v = verdict('bad', 'UNSTABLE: λ = ' + U(an.lam) + ' &gt; 0, so deviations grow exponentially');
    else v = verdict('warn', 'MARGINAL: λ ≈ 0, so there is no restoring action');
    return '<ul class="tests">' + items.join('') + '</ul>' + v;
  }

  function tests2(cfg, an) {
    const items = [];
    items.push(test(an.tr < -EPS ? 'pass' : 'fail', an.tr < -EPS ? PASS : FAIL,
      'tr(A−BK) = −Kd = ' + U(an.tr), 'need tr &lt; 0 ⇔ Kd &gt; 0', Math.abs(an.tr) <= EPS ? 'tr = 0: no damping' : ''));
    items.push(test(an.det > EPS ? 'pass' : 'fail', an.det > EPS ? PASS : FAIL,
      'det(A−BK) = Kp − g/L = ' + U(an.Kp) + ' − ' + U(an.gl) + ' = ' + U(an.det), 'need det &gt; 0 ⇔ Kp &gt; g/L = ' + U(an.gl),
      Math.abs(an.det) <= EPS ? 'det = 0: a zero eigenvalue' : ''));
    const dtxt = an.disc > EPS ? 'Δ &gt; 0: real eigenvalues (node)' : an.disc < -EPS ? 'Δ &lt; 0: complex eigenvalues (spiral)' : 'Δ ≈ 0: repeated eigenvalue';
    items.push(test('info', INFO, 'Δ = tr² − 4·det = ' + U(an.disc), '', dtxt));
    if (cfg.forced) items.push(test('info', INFO, an.hasEq ? 'equilibrium θp = d/(Kp − g/L) = ' + U(an.thetaP / DEG, 1) + '°' : 'det = 0: no constant equilibrium', '', 'd moves the equilibrium; it does not change λ'));
    const note = an.fb ? '' : '<p class="hint">Feedback is OFF: showing the open loop (Kp = Kd = 0).</p>';
    const cls = an.stability === 'stable' ? 'good' : an.stability === 'unstable' ? 'bad' : 'warn';
    const tail = an.stability === 'stable' ? ': tr &lt; 0 and det &gt; 0 ⇒ every Re λ &lt; 0' : an.stability === 'unstable' ? ': at least one Re λ &gt; 0' : ': Re λ = 0 (no decay)';
    return note + '<ul class="tests">' + items.join('') + '</ul>' + verdict(cls, an.klass.label.toUpperCase() + tail + '<br><span style="font-weight:400">' + eigStr(an) + '</span>');
  }

  function testsHold(cfg, an) {
    const a3 = an.a[0], a2 = an.a[1], a1 = an.a[2], a0 = an.a[3];
    const D2 = a3 * a2 - a1, D3 = a1 * D2 - a3 * a3 * a0;
    const c = (v, txt) => (v > EPS ? txt : '<b style="color:#b91c1c">' + txt + '</b>');
    const items = [];
    const allPos = a3 > EPS && a2 > EPS && a1 > EPS && a0 > EPS;
    items.push(test(allPos ? 'pass' : 'fail', allPos ? PASS : FAIL,
      'λ⁴ + a₃λ³ + a₂λ² + a₁λ + a₀:  ' +
      c(a3, 'a₃ = Kd − L·Kv = ' + U(a3)) + ' · ' + c(a2, 'a₂ = Kp − g/L − L·Kx = ' + U(a2)) + ' · ' +
      c(a1, 'a₁ = g·Kv = ' + U(a1)) + ' · ' + c(a0, 'a₀ = g·Kx = ' + U(a0)), 'need all four &gt; 0', ''));
    items.push(test(D2 > EPS ? 'pass' : 'fail', D2 > EPS ? PASS : FAIL, 'Δ₂ = a₃·a₂ − a₁ = ' + U(D2), 'need Δ₂ &gt; 0', ''));
    items.push(test(D3 > EPS ? 'pass' : 'fail', D3 > EPS ? PASS : FAIL, 'Δ₃ = a₁·Δ₂ − a₃²·a₀ = ' + U(D3), 'need Δ₃ &gt; 0', 'Routh–Hurwitz for a quartic'));
    items.push(test('info', INFO, 'max Re λ = ' + U(an.maxRe) + ' (numerical roots)', '', 'the slowest pole sets how long the wheel takes to settle'));
    if (cfg.forced) items.push(test('info', INFO, an.hasEq ? 'parks at x_p = ' + U(an.xP) + ' m with lean θp = ' + U(an.thetaP / DEG, 1) + '°' : 'Kx = 0: no isolated equilibrium', '', 'the lean is −d·L/g: it does not shrink with Kp'));
    const cls = an.stability === 'stable' ? 'good' : an.stability === 'unstable' ? 'bad' : 'warn';
    return '<ul class="tests">' + items.join('') + '</ul>' + verdict(cls, an.klass.label.toUpperCase() + '<br><span style="font-weight:400">' + eigStr(an) + '</span>');
  }

  /* ---------- "what to notice" ---------- */
  function notice1(cfg, an) {
    const out = [], p = cfg.p;
    if (!an.fb) out.push('With no feedback, λ = a = ' + U(p.a) + ' &gt; 0. Any push grows like e<sup>λt</sup>. Turn feedback on and raise k past a/b = ' + U(an.thresh) + '.');
    else if (an.stability === 'stable') out.push('k &gt; a/b, so λ = a − bk &lt; 0 and the push decays with time constant τ = ' + U(an.tau) + ' s. A larger k decays faster, but it also needs a bigger u (watch the bars).');
    else if (an.stability === 'unstable') out.push('k is below the threshold a/b = ' + U(an.thresh) + ', so λ is still positive. The feedback slows the escape but cannot stop it.');
    else out.push('k = a/b gives λ = 0: the restoring term exactly cancels the instability, so nothing pulls the cart back.');
    if (cfg.forced) out.push(an.stability === 'stable'
      ? 'd ≠ 0: λ has not changed. Only the equilibrium moved, to x_p = d/(bk − a) = ' + U(an.xp) + ' m. Raise k to shrink the offset; it never reaches 0.'
      : 'd ≠ 0 shifts the equilibrium to x_p, but stability depends only on λ, so the cart still leaves it.');
    if (cfg.saturate) out.push('Saturation is on: λ &lt; 0 only guarantees recovery for small pushes. A large enough push can overwhelm the actuator.');
    return out.map(s => '<p>' + s + '</p>').join('');
  }

  function notice2(cfg, an) {
    const out = [], gl = an.gl, p = cfg.p;
    if (an.hold) {
      if (an.stability === 'stable') out.push('Hold position is on: the wheel position x and speed x′ are fed back too, so after the catch the robot rolls back toward its start and stops. The θ-equation is still 2nd order, but it is now driven by −Kx·x − Kv·x′, so stability is decided by four eigenvalues.');
      else out.push('Hold position is on but the 4-pole loop is not stable. Needed: Kd &gt; L·Kv = ' + U(p.L * p.Kv) + ' and Kp − g/L &gt; L·Kx = ' + U(p.L * p.Kx) + ', plus Δ₂, Δ₃ &gt; 0 (see the tests above). Try the “Self-stabilizing (hold)” preset.');
      if (cfg.forced) out.push('With d ≠ 0 the robot parks at x_p = ' + U(an.xP) + ' m, leaning θp = −dL/g = ' + U(an.thetaP / DEG, 1) + '°. At rest u = 0, so gravity alone must balance d, and raising Kp does not remove the lean.');
    } else {
      if (!an.fb) {
        out.push('With no feedback, λ = ±√(g/L) = ±' + U(Math.sqrt(gl)) + ' s⁻¹: a saddle. The positive eigenvalue makes any tilt grow. A longer pendulum (smaller g/L) falls more slowly.');
      } else {
        switch (an.klass.key) {
          case 'saddle': out.push('det = Kp − g/L &lt; 0: gravity beats the restoring term. One eigenvalue is positive real (a saddle), and no Kd can fix that. Raise Kp above g/L = ' + U(gl) + '.'); break;
          case 'zero': out.push('Kp ≈ g/L gives a zero eigenvalue: no net restoring force.'); break;
          case 'center': out.push('Kd ≈ 0: λ = ±i√(Kp − g/L) is purely imaginary, so the robot oscillates forever at ω = ' + U(Math.sqrt(Math.max(an.det, 0))) + ' rad/s. Proportional control alone cannot stabilize it; add Kd.'); break;
          case 'stable-spiral': out.push('Complex λ = α ± iβ with α = −Kd/2 = ' + U(an.eig[0].re) + ': the oscillation shrinks like e<sup>αt</sup>. Raising Kd moves the poles left until Δ = 0 (critical damping), where they meet on the real axis.'); break;
          case 'stable-node': case 'stable-degenerate': out.push('Δ ≥ 0: real negative eigenvalues, no oscillation. The slower one (' + U(Math.max(an.eig[0].re, an.eig[1].re)) + ') dominates. Raising Kd further makes it slower, not faster, so compare with the critically damped case.'); break;
          case 'unstable-spiral': out.push('Kd &lt; 0 is negative damping: it pumps energy in, so the oscillation grows like e<sup>αt</sup> with α = ' + U(an.eig[0].re) + '.'); break;
          default: out.push('Kd &lt; 0 gives a positive real eigenvalue: the tilt grows without oscillating.');
        }
      }
      if (an.fb && an.stability === 'stable' && M.wheelsOn(cfg)) out.push('The wheel keeps rolling at constant speed after the recovery, because the controller only measures the angle. Turn on “Hold position” to feed the wheel back too.');
      if (cfg.forced) out.push(an.stability === 'stable'
        ? 'd ≠ 0: the eigenvalues have not changed, and only the equilibrium moved, to θp = ' + U(an.thetaP / DEG, 1) + '°. Raise Kp to shrink the lean; with proportional action it never reaches 0.'
        : 'd ≠ 0 shifts the equilibrium, but it is still unstable, because stability depends only on the eigenvalues.');
    }
    if (cfg.nonlinear) out.push('sin θ is on: the dashed prediction assumes sin θ ≈ θ, so it drifts away from the simulation at large angles.');
    if (cfg.saturate) out.push('Saturation is on: a stable linear design can still fall if a big push demands more than u_max = ' + U(p.umax, 0) + '.');
    return out.map(s => '<p>' + s + '</p>').join('');
  }

  /* ---------- main update (called when parameters or the anchor change) ---------- */
  const cache = { tests: '', notice: '' };
  function update(cfg, an, sol) {
    const rows = cfg.mode === 1 ? rows1(cfg, an, sol) : (an.hold ? rowsHold(cfg, an, sol) : rows2(cfg, an, sol));
    updateEq(rows);
    updateSummary(cfg, an);
    const t = cfg.mode === 1 ? tests1(cfg, an) : (an.hold ? testsHold(cfg, an) : tests2(cfg, an));
    if (t !== cache.tests) { $('tests').innerHTML = t; cache.tests = t; }
    const nt = cfg.mode === 1 ? notice1(cfg, an) : notice2(cfg, an);
    if (nt !== cache.notice) { $('notice').innerHTML = nt; cache.notice = nt; }
    const b = $('approx-badge'), parts = [];
    if (cfg.saturate) parts.push('saturation');
    if (cfg.mode === 2 && cfg.nonlinear) parts.push('sin θ');
    if (parts.length) { b.hidden = false; b.textContent = 'Linear analysis is approximate (' + parts.join(' + ') + ')'; } else b.hidden = true;
  }

  /* ---------- live control-law bars + readout (every frame, DOM-cheap) ---------- */
  const live = { key: '', rows: [], scale: 1, html: '' };
  function buildBars(cfg, key) {
    const host = $('bars'); host.innerHTML = ''; live.rows = []; live.key = key; live.scale = 1;
    let names;
    if (cfg.mode === 1) names = ['−k·x', 'u (total)'];
    else names = (cfg.hold ? ['−Kp·θ', '−Kd·θ′', '−Kx·x', '−Kv·x′'] : ['−Kp·θ', '−Kd·θ′']).concat(['u (total)']);
    names.forEach((nm, i) => {
      const row = document.createElement('div'); row.className = 'bar-row' + (i === names.length - 1 ? ' total' : '');
      row.innerHTML = '<span class="bar-label">' + nm + '</span><span class="bar-track"><span class="bar-fill pos"></span></span><span class="bar-val"></span>';
      host.appendChild(row);
      live.rows.push({ fill: row.querySelector('.bar-fill'), val: row.querySelector('.bar-val') });
    });
  }
  function updateLive(cfg, sim) {
    const key = cfg.mode + (cfg.mode === 2 && cfg.hold ? 'h' : '');
    if (live.key !== key) buildBars(cfg, key);
    const c = sim.ctrl || M.control(cfg, sim.z);
    const vals = c.terms.concat([c.u]);
    let mx = 0; vals.forEach(v => { mx = Math.max(mx, Math.abs(v)); }); mx = Math.max(mx, Math.abs(c.uRaw));
    const floor = cfg.saturate ? cfg.p.umax * 1.1 : (cfg.mode === 1 ? 1 : 5);
    live.scale = Math.max(mx * 1.1, live.scale * 0.995, floor);
    vals.forEach((v, i) => {
      const r = live.rows[i]; if (!r) return;
      const pct = clamp(Math.abs(v) / live.scale, 0, 1) * 50;
      r.fill.className = 'bar-fill ' + (v >= 0 ? 'pos' : 'neg');
      r.fill.style.left = (v >= 0 ? 50 : 50 - pct) + '%';
      r.fill.style.width = pct + '%';
      r.val.textContent = U(v, 2);
    });
    const clipped = cfg.saturate && Math.abs(c.uRaw) > cfg.p.umax;
    let html = '<span>t = ' + sim.t.toFixed(2) + ' s</span>';
    if (cfg.mode === 1) {
      html += '<span>x = ' + U(sim.z[0], 3) + ' m</span><span>x′ = ' + U(M.deriv(cfg, sim.z)[0], 3) + ' m/s</span>';
    } else {
      html += '<span>θ = ' + U(sim.z[0] / DEG, 1) + '°</span><span>θ′ = ' + U(sim.z[1] / DEG, 1) + '°/s</span>';
      if (M.wheelsOn(cfg)) html += '<span>wheel x = ' + U(sim.z[2], 2) + ' m</span><span>x′ = ' + U(sim.z[3], 2) + ' m/s</span>';
    }
    if (clipped) html += '<span style="color:#b91c1c">u would be ' + U(c.uRaw, 1) + ' → clipped to ' + U(c.u, 1) + '</span>';
    if (html !== live.html) { $('readout').innerHTML = html; live.html = html; }
  }

  DEQ.MathPanel = { update, updateLive };
})(window);
