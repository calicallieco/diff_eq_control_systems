/* main.js — wiring: state, controls, pointer interaction, animation loop */
(function () {
  'use strict';
  const DEQ = window.DEQ;
  const M = DEQ.Model, P = DEQ.Plots, RB = DEQ.Robot, MP = DEQ.MathPanel;
  const $ = id => document.getElementById(id);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const clone = o => JSON.parse(JSON.stringify(o));
  const DEG = M.DEG;

  const params = { 1: clone(M.DEFAULT_PARAMS[1]), 2: clone(M.DEFAULT_PARAMS[2]) };
  const cfg = { mode: 1, feedback: true, forced: false, nonlinear: false, saturate: false, p: params[1] };
  const sim = DEQ.createSim(); sim.reset(1);
  const D = { cfg: cfg, sim: sim, an: null, olAn: null, sol: null, trail: [] };
  const ui = { tab: 'poles', speed: 1, touched: false, dirty: true, prevFallen: false, enlarged: false, warnedOff: false, errored: false, chip: '' };
  let sliders = [];

  /* ---------- helpers ---------- */
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3400);
  }
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  const press = (id, on) => $(id).setAttribute('aria-pressed', on ? 'true' : 'false');
  const snap = (v, key) => { const r = M.RANGES[cfg.mode][key]; return clamp(Math.round(v / r[2]) * r[2], r[0], r[1]); };

  /* ---------- analysis refresh ---------- */
  function recompute() {
    D.an = M.analyze(cfg);
    D.olAn = M.analyze(Object.assign({}, cfg, { feedback: false }));
    D.sol = M.solution(cfg, D.an, sim.anchor.z);
    ui.dirty = true;
  }
  function pushTrail() {
    const an = D.an, p = cfg.p;
    const e = { eig: an.eig.map(x => ({ re: x.re, im: x.im })), tr: an.tr, det: an.det, gKp: p.Kp, gKd: p.Kd, gk: p.k };
    const l = D.trail[D.trail.length - 1];
    if (l && l.tr === e.tr && l.det === e.det && l.gKp === e.gKp && l.gKd === e.gKd && l.gk === e.gk) return;
    D.trail.push(e); if (D.trail.length > 40) D.trail.shift();
  }
  // call after ANY change of parameters / toggles / state: re-anchors the prediction
  function changed() {
    sim.setAnchor(); recompute(); pushTrail(); syncControls();
  }

  /* ---------- controls ---------- */
  function makeSlider(spec, parent) {
    const rg = M.RANGES[cfg.mode][spec.key], min = rg[0], max = rg[1], step = rg[2];
    const id = 's-' + spec.key, wrap = el('div', 'slider');
    wrap.innerHTML = '<label for="' + id + '">' + spec.label + '</label><output id="' + id + '-out"></output>' +
      '<div class="slider-track"><input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '"><span class="mark" hidden></span></div>' +
      '<div class="mark-caption" hidden></div>';
    parent.appendChild(wrap);
    const inp = wrap.querySelector('input'), out = wrap.querySelector('output'), mark = wrap.querySelector('.mark'), cap = wrap.querySelector('.mark-caption');
    inp.addEventListener('input', () => {
      cfg.p[spec.key] = parseFloat(inp.value);
      if (spec.gain && !cfg.feedback && !ui.warnedOff) { ui.warnedOff = true; toast('Feedback is OFF, so the gains have no effect yet. Turn it ON.'); }
      changed();
    });
    sliders.push({
      update: function () {
        const v = cfg.p[spec.key];
        if (document.activeElement !== inp) inp.value = v;
        out.textContent = M.ui(v, spec.d);
        if (spec.mark) {
          const mv = spec.mark(), f = (mv - min) / (max - min);
          cap.hidden = false;
          if (f >= 0 && f <= 1) { mark.hidden = false; mark.style.left = 'calc(11px + (100% - 22px) * ' + f + ')'; cap.textContent = '▲ ' + spec.markText(mv); }
          else { mark.hidden = true; cap.textContent = spec.markText(mv) + ' (off scale)'; }
        }
        if (spec.disabled) inp.disabled = spec.disabled();
      }
    });
  }
  function makeCheck(id, text, get, set, parent) {
    const lab = el('label', 'check', '<input type="checkbox" id="' + id + '"> ' + text);
    parent.appendChild(lab);
    const inp = lab.querySelector('input');
    inp.addEventListener('change', () => { set(inp.checked); changed(); });
    sliders.push({ update: () => { inp.checked = get(); } });
  }

  function buildControls() {
    const host = $('controls'); host.innerHTML = ''; sliders = [];
    const m1 = cfg.mode === 1;
    const main = el('div'); host.appendChild(main);
    if (m1) {
      makeSlider({ key: 'k', label: 'Feedback gain k', d: 2, gain: true,
        mark: () => cfg.p.a / cfg.p.b, markText: v => 'threshold k = a/b = ' + M.ui(v, 2) }, main);
    } else {
      makeSlider({ key: 'Kp', label: 'Kp: proportional gain (1/s²)', d: 1, gain: true,
        mark: () => M.G / cfg.p.L, markText: v => 'threshold Kp = g/L = ' + M.ui(v, 2) }, main);
      makeSlider({ key: 'Kd', label: 'Kd: derivative gain, damping (1/s)', d: 1, gain: true,
        mark: () => 0, markText: () => 'Kd = 0: no damping' }, main);
    }
    const grp = el('div', 'ctl-group'); grp.id = 'grp-forced';
    grp.innerHTML = '<div class="ctl-title">Disturbance (non-homogeneous)</div>';
    host.appendChild(grp);
    makeSlider({ key: 'd', label: m1 ? 'Disturbance d (m/s)' : 'Disturbance d (rad/s²)', d: 2 }, grp);

    const adv = el('details', 'adv', '<summary>Advanced</summary>'); host.appendChild(adv);
    if (m1) {
      makeSlider({ key: 'a', label: 'Instability rate a (1/s)', d: 2 }, adv);
      makeSlider({ key: 'b', label: 'Actuator gain b', d: 2 }, adv);
    } else {
      makeSlider({ key: 'L', label: 'Pendulum length L (m)', d: 2 }, adv);
    }
    makeCheck('chk-sat', 'Actuator saturation, |u| ≤ u_max', () => cfg.saturate, v => { cfg.saturate = v; }, adv);
    makeSlider({ key: 'umax', label: 'Limit u_max', d: 1, disabled: () => !cfg.saturate }, adv);
    if (!m1) makeCheck('chk-nl', 'Nonlinear dynamics (sin θ instead of θ)', () => cfg.nonlinear, v => { cfg.nonlinear = v; }, adv);
    buildPresets();
  }

  function buildPresets() {
    const host = $('presets'); host.innerHTML = '';
    const rg = M.RANGES[cfg.mode];
    function use(props, extra) {
      extra = extra || {};
      cfg.feedback = extra.fb !== false;
      cfg.saturate = !!extra.saturate;
      Object.keys(props).forEach(k => { cfg.p[k] = clamp(props[k], rg[k][0], rg[k][1]); });
      ui.warnedOff = false; changed();
    }
    let list;
    if (cfg.mode === 1) {
      const kc = () => cfg.p.a / cfg.p.b;
      list = [
        ['No control', () => use({}, { fb: false })],
        ['Too little gain', () => use({ k: 0.5 * kc() })],
        ['Marginal (k = a/b)', () => use({ k: kc() })],
        ['Stable (k = 2·a/b)', () => use({ k: 2 * kc() })],
        ['Fast (k = 5)', () => use({ k: 5 })],
        ['Saturates', () => use({ k: 6, umax: 1.5 }, { saturate: true })]
      ];
    } else {
      const gl = () => M.G / cfg.p.L;
      list = [
        ['No control', () => use({}, { fb: false })],
        ['Kp too low (saddle)', () => use({ Kp: 0.5 * gl(), Kd: 3 })],
        ['Marginal: P only', () => use({ Kp: gl() + 10, Kd: 0 })],
        ['Underdamped', () => use({ Kp: gl() + 10, Kd: 1.5 })],
        ['Critically damped', () => use({ Kp: gl() + 10, Kd: 2 * Math.sqrt(10) })],
        ['Overdamped', () => use({ Kp: gl() + 10, Kd: 9 })],
        ['Too aggressive (saturates)', () => use({ Kp: 40, Kd: 10, umax: 20 }, { saturate: true })]
      ];
    }
    list.forEach(it => { const b = el('button', 'btn', it[0]); b.addEventListener('click', it[1]); host.appendChild(b); });
  }

  function syncControls() {
    sliders.forEach(s => s.update());
    const g = $('grp-forced'); if (g) g.hidden = !cfg.forced;
    press('mode-1', cfg.mode === 1); press('mode-2', cfg.mode === 2);
    press('eq-hom', !cfg.forced); press('eq-non', cfg.forced);
    press('fb-toggle', cfg.feedback); $('fb-toggle').textContent = cfg.feedback ? 'ON' : 'OFF';
  }

  /* ---------- tabs ---------- */
  function tabsFor(mode) {
    return mode === 1
      ? [['poles', 'Poles'], ['phase', 'Phase line'], ['gain', 'Gain: λ vs k']]
      : [['poles', 'Poles'], ['phase', 'Phase portrait'], ['trdet', 'Trace–Det'], ['gain', 'Gain plane']];
  }
  const HINTS = {
    poles: 'Poles of the closed loop in the complex plane. The left half-plane (green) is stable. Move a gain and the ✕ moves, leaving a trail.',
    phase1: 'Phase line: x′ = f(x). Equilibria are where the curve crosses zero; a negative slope there means stable.',
    phase2: 'Phase portrait (θ, θ′). The orange dot is now. Dashed lines are the eigen-directions (real eigenvalues only).',
    trdet: 'Trace–determinant plane. The dot is (tr, det) of A−BK. Crossing det = 0 or tr = 0 changes stability; crossing the parabola changes node ↔ spiral.',
    gain1: 'λ = a − b·k is a straight line in k, and it is stable where it lies below 0. Click or drag to set k.',
    gain2: 'Click or drag in the plane to set (Kp, Kd). Regions show the eigenvalue classification.'
  };
  function buildTabs() {
    const host = $('plot-tabs'); host.innerHTML = '';
    const list = tabsFor(cfg.mode);
    if (!list.some(t => t[0] === ui.tab)) ui.tab = 'poles';
    list.forEach(t => {
      const b = el('button', null, t[1]); b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', t[0] === ui.tab ? 'true' : 'false');
      b.addEventListener('click', () => { ui.tab = t[0]; buildTabs(); });
      host.appendChild(b);
    });
    const key = ui.tab === 'phase' ? 'phase' + cfg.mode : ui.tab === 'gain' ? 'gain' + cfg.mode : ui.tab;
    $('plot-hint').textContent = HINTS[key];
  }

  /* ---------- mode / actions ---------- */
  function setMode(m) {
    if (cfg.mode === m) return;
    cfg.mode = m; cfg.p = params[m];
    sim.reset(m); P.resetRanges(); D.trail.length = 0; ui.touched = false;
    $('robot-title').textContent = m === 1 ? 'Cart on a rail' : 'Self-balancing robot (inverted pendulum)';
    buildControls(); buildTabs(); changed();
  }
  function doReset() { sim.reset(cfg.mode); P.resetRanges(); changed(); }
  function togglePause() { sim.paused = !sim.paused; $('btn-pause').textContent = sim.paused ? 'Resume' : 'Pause'; }
  function toggleFeedback() {
    cfg.feedback = !cfg.feedback; ui.warnedOff = false; changed();
  }
  function setForced(v) { cfg.forced = v; changed(); }
  function nudge(dir) {
    if (sim.fallen) { toast('Press Reset (R) first.'); return; }
    const z = sim.z.slice();
    if (cfg.mode === 1) z[0] = clamp(z[0] + dir * 0.3, -M.RAIL + 0.02, M.RAIL - 0.02);
    else z[1] += dir * 0.9;
    ui.touched = true;
    sim.setState(z); sim.sample(cfg, true); changed();
  }
  function toggleEnlarge(on) {
    ui.enlarged = on; $('plot-card').classList.toggle('enlarged', on);
    $('btn-enlarge').textContent = on ? '✕ Close' : '⤢ Enlarge';
  }

  /* ---------- pointer interaction: robot ---------- */
  const rc = $('robot-canvas'), pc = $('plot-canvas');
  const pos = (cv, e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left - cv.clientLeft, y: e.clientY - r.top - cv.clientTop }; };
  let dragging = false;
  function dragTo(pt) { const z = RB.pointerToState(cfg, pt.x, pt.y); if (z) sim.setState(z); }
  rc.addEventListener('pointerdown', e => {
    const pt = pos(rc, e);
    if (!RB.hit(cfg, pt.x, pt.y)) return;
    e.preventDefault(); rc.setPointerCapture(e.pointerId); rc.focus();
    dragging = true; sim.held = true; ui.touched = true; rc.classList.add('grabbing'); dragTo(pt);
  });
  rc.addEventListener('pointermove', e => {
    const pt = pos(rc, e);
    if (dragging) dragTo(pt); else rc.style.cursor = RB.hit(cfg, pt.x, pt.y) ? 'grab' : 'default';
  });
  function endDrag() {
    if (!dragging) return;
    dragging = false; sim.held = false; rc.classList.remove('grabbing');
    sim.sample(cfg, true); changed();
  }
  rc.addEventListener('pointerup', endDrag);
  rc.addEventListener('pointercancel', endDrag);

  /* ---------- pointer interaction: gain plane ---------- */
  let gDrag = false;
  function applyGain(e) {
    if (ui.tab !== 'gain') return;
    const pt = pos(pc, e), g = P.invGain(pt.x, pt.y);
    if (!g) return;
    Object.keys(g).forEach(k => { cfg.p[k] = snap(g[k], k); });
    if (!cfg.feedback) { cfg.feedback = true; toast('Feedback switched ON to apply these gains.'); }
    changed();
  }
  pc.addEventListener('pointerdown', e => { if (ui.tab !== 'gain') return; e.preventDefault(); pc.setPointerCapture(e.pointerId); gDrag = true; applyGain(e); });
  pc.addEventListener('pointermove', e => { if (gDrag) applyGain(e); });
  const gEnd = () => { gDrag = false; };
  pc.addEventListener('pointerup', gEnd); pc.addEventListener('pointercancel', gEnd);

  /* ---------- buttons and keys ---------- */
  $('mode-1').addEventListener('click', () => setMode(1));
  $('mode-2').addEventListener('click', () => setMode(2));
  $('eq-hom').addEventListener('click', () => setForced(false));
  $('eq-non').addEventListener('click', () => setForced(true));
  $('fb-toggle').addEventListener('click', toggleFeedback);
  $('btn-nudge-l').addEventListener('click', () => nudge(-1));
  $('btn-nudge-r').addEventListener('click', () => nudge(1));
  $('btn-pause').addEventListener('click', togglePause);
  $('btn-reset').addEventListener('click', doReset);
  $('speed').addEventListener('change', e => { ui.speed = parseFloat(e.target.value); });
  $('btn-enlarge').addEventListener('click', () => toggleEnlarge(!ui.enlarged));
  $('view-math').addEventListener('click', () => { document.body.dataset.view = 'math'; press('view-math', true); press('view-plots', false); });
  $('view-plots').addEventListener('click', () => { document.body.dataset.view = 'plots'; press('view-math', false); press('view-plots', true); });

  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { if (ui.enlarged) toggleEnlarge(false); return; }
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    switch (e.key) {
      case 'ArrowLeft': nudge(-1); break;
      case 'ArrowRight': nudge(1); break;
      case ' ': if (tag === 'BUTTON') return; togglePause(); break;
      case 'r': case 'R': doReset(); break;
      case 'f': case 'F': toggleFeedback(); break;
      default: return;
    }
    e.preventDefault();
  });

  /* ---------- status chip ---------- */
  function chipState() {
    const an = D.an, z = sim.z;
    if (sim.fallen) return ['bad', cfg.mode === 1 ? 'Off the rail: unstable' : 'Fallen: unstable'];
    if (sim.held) return ['warn', 'Release to start'];
    if (sim.paused) return ['warn', 'Paused'];
    let calm = false;
    if (an.hasEq) {
      if (cfg.mode === 1) calm = Math.abs(z[0] - an.xp) < 0.01;
      else calm = Math.abs(z[0] - an.thetaP) / DEG < 0.5 && Math.abs(z[1]) / DEG < 3;
    }
    if (calm) {
      if (an.stability === 'stable') return ['good', 'Balanced at equilibrium'];
      if (an.stability === 'unstable') return ['warn', 'At an unstable equilibrium: push it'];
      return ['warn', 'At rest (marginal)'];
    }
    if (an.stability === 'stable') return ['good', 'Recovering (stable)'];
    if (an.stability === 'unstable') return ['bad', 'Unstable: will diverge'];
    return ['warn', 'Marginal: no decay'];
  }
  function updateChip() {
    const s = chipState(), key = s[0] + s[1];
    if (key === ui.chip) return;
    ui.chip = key; const c = $('status-chip'); c.className = 'chip ' + s[0]; c.textContent = s[1];
  }

  /* ---------- main loop ---------- */
  let last = performance.now();
  function frame(now) {
    const dt = (now - last) / 1000; last = now;
    try {
      sim.advance(cfg, dt, ui.speed);
      if (sim.fallen && !ui.prevFallen) toast(cfg.mode === 1 ? 'The cart hit the end stop. Press Reset (R).' : 'The robot fell over. Press Reset (R).');
      ui.prevFallen = sim.fallen;
      if (ui.dirty) { MP.update(cfg, D.an, D.sol); ui.dirty = false; }
      MP.updateLive(cfg, sim, D.an);
      updateChip();
      RB.draw(rc, { cfg: cfg, sim: sim, an: D.an, showHint: !ui.touched });
      P.drawTab(ui.tab, pc, D);
      P.timeSeries($('time-canvas'), D);
    } catch (err) {
      if (!ui.errored) { ui.errored = true; console.error(err); }
    }
    requestAnimationFrame(frame);
  }

  /* ---------- start ---------- */
  $('robot-title').textContent = 'Cart on a rail';
  buildControls(); buildTabs(); recompute(); pushTrail(); syncControls();
  requestAnimationFrame(frame);
})();
