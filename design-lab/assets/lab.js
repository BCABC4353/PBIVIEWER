(function () {
  const lab = {};

  lab.spring = function (opts) {
    const from = opts.from;
    const to = opts.to;
    const response = opts.response ?? 0.3;
    const dampingRatio = opts.damping ?? 0.85;
    const onUpdate = opts.onUpdate;
    const onSettle = opts.onSettle;
    const v0 = opts.velocity ?? 0;

    const omega0 = (2 * Math.PI) / response;
    const zeta = dampingRatio;
    const x0 = from - to;
    let raf = null;
    let cancelled = false;
    const t0 = performance.now();

    function positionAt(t) {
      if (zeta < 1) {
        const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
        const A = x0;
        const B = (v0 + zeta * omega0 * x0) / omegaD;
        return Math.exp(-zeta * omega0 * t) * (A * Math.cos(omegaD * t) + B * Math.sin(omegaD * t));
      }
      const A = x0;
      const B = v0 + omega0 * x0;
      return Math.exp(-omega0 * t) * (A + B * t);
    }

    function frame(now) {
      if (cancelled) return;
      const t = (now - t0) / 1000;
      const x = positionAt(t);
      const xNext = positionAt(t + 1 / 60);
      const vel = (xNext - x) * 60;
      const settled = Math.abs(x) < Math.abs(x0 || 1) * 0.001 + 0.0005 && Math.abs(vel) < 0.01;
      if (settled || t > response * 8 + 2) {
        onUpdate(to, 1);
        if (onSettle) onSettle();
        return;
      }
      onUpdate(to + x, t / response);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return {
      cancel() {
        cancelled = true;
        if (raf) cancelAnimationFrame(raf);
      },
    };
  };

  let audioCtx = null;
  lab.tick = function (pitch) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = 'square';
      osc.frequency.value = pitch || 2300;
      filter.type = 'bandpass';
      filter.frequency.value = pitch || 2300;
      filter.Q.value = 1.4;
      gain.gain.setValueAtTime(0.16, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      osc.connect(filter).connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.05);
    } catch (e) {}
  };

  lab.clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  lab.api = {};

  window.__lab = lab;
})();
