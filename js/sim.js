/* sim.js — fixed-timestep simulator, decoupled from the display refresh rate */
(function (global) {
  'use strict';
  const DEQ = (global.DEQ = global.DEQ || {});
  const M = DEQ.Model;

  function createSim() {
    const DT = 0.002;        // RK4 step (s)
    const SAMPLE = 0.02;     // history sampling interval (s)
    const HIST = 14;         // seconds of history kept

    const s = {
      t: 0, z: [0], fallen: false, paused: false, held: false,
      hist: [], anchor: { t: 0, z: [0] },
      ctrl: { u: 0, uRaw: 0, terms: [0] },
      acc: 0, sampAcc: 0
    };

    s.reset = function (mode) {
      s.t = 0; s.z = mode === 1 ? [0] : [0, 0];
      s.fallen = false; s.held = false; s.acc = 0; s.sampAcc = 0; s.hist = [];
      s.anchor = { t: 0, z: s.z.slice() };
    };
    // the anchor = state at the last push / parameter change; predictions start from it
    s.setAnchor = function () { s.anchor = { t: s.t, z: s.z.slice() }; };

    s.sample = function (cfg, brk) {
      const c = M.control(cfg, s.z);
      s.hist.push({ t: s.t, z: s.z.slice(), u: c.u, brk: !!brk });
      const lim = s.t - HIST;
      while (s.hist.length > 2 && s.hist[0].t < lim) s.hist.shift();
    };

    s.setState = function (z) { s.z = z.slice(); s.fallen = false; };

    s.advance = function (cfg, dtWall, speed) {
      if (!(s.paused || s.held || s.fallen)) {
        s.acc += Math.min(dtWall, 0.1) * speed;
        while (s.acc >= DT) {
          s.acc -= DT;
          s.z = M.rk4(cfg, s.z, DT);
          s.t += DT;
          s.sampAcc += DT;
          if (M.checkFall(cfg, s.z)) { s.fallen = true; s.acc = 0; s.sample(cfg, false); break; }
          if (s.sampAcc >= SAMPLE) { s.sampAcc -= SAMPLE; s.sample(cfg, false); }
        }
      }
      s.ctrl = M.control(cfg, s.z);
    };

    return s;
  }

  DEQ.createSim = createSim;
})(window);
