(function () {
  const lab = {};

  lab.reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  lab.spring = function (opts) {
    const from = opts.from;
    const to = opts.to;
    const response = opts.response ?? 0.3;
    const dampingRatio = opts.damping ?? 0.85;
    const onUpdate = opts.onUpdate;
    const onSettle = opts.onSettle;
    const v0 = opts.velocity ?? 0;

    if (lab.reduced) {
      onUpdate(to, 1);
      if (onSettle) onSettle();
      return { cancel() {} };
    }

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

  lab.lum = function (hex) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };

  lab.contrast = function (fg, bg) {
    const a = lab.lum(fg) + 0.05;
    const b = lab.lum(bg ?? '#000000') + 0.05;
    return a > b ? a / b : b / a;
  };

  const NS = 'http://www.w3.org/2000/svg';
  function eln(name, attrs, parent) {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  lab.eln = eln;

  const STRIP_SIZES = {
    large:  { pad: 22, base: 62, minor: 6, minute: 13, major: 20, caretW: 11, caretH: 9, fillW: 2, labels: true, value: true, valueSize: 16 },
    medium: { pad: 4,  base: 24, minor: 0, minute: 5,  major: 10, caretW: 8,  caretH: 6.5, fillW: 1.5, labels: false, value: false },
    small:  { pad: 2,  base: 12, minor: 0, minute: 3,  major: 6,  caretW: 6,  caretH: 5, fillW: 1, labels: false, value: false },
  };

  lab.strip = function (svg, opts) {
    const size = Object.assign({}, STRIP_SIZES[opts.size || 'large'], opts.sizeOverride || {});
    const w = opts.w;
    const cycle = opts.cycle ?? 15;
    const value = opts.value ?? 0;
    const overdue = opts.overdue ?? 0;
    const live = overdue > 0 ? '#FFB02E' : '#FF5F15';
    const x0 = size.pad;
    const x1 = w - size.pad;
    const span = x1 - x0;
    const mainW = overdue > 0 ? span * 0.74 : span;
    const xMark = x0 + mainW;
    const base = size.base;

    eln('line', { x1: x0 - 4, y1: base, x2: x1 + 4, y2: base, stroke: 'rgba(255,255,255,0.14)', 'stroke-width': 1 }, svg);

    const perMin = mainW / cycle;
    if (size.minor > 0) {
      for (let q = 0; q <= cycle * 4; q++) {
        if (q % 4 === 0) continue;
        const x = x0 + (perMin * q) / 4;
        eln('line', { x1: x, y1: base, x2: x, y2: base - size.minor, stroke: 'rgba(255,255,255,0.16)', 'stroke-width': 1 }, svg);
      }
    }
    for (let m = 0; m <= cycle; m++) {
      const x = x0 + perMin * m;
      const major = m % 5 === 0;
      const h = major ? size.major : size.minute;
      eln('line', { x1: x, y1: base, x2: x, y2: base - h, stroke: `rgba(255,255,255,${major ? 0.6 : 0.34})`, 'stroke-width': major ? 1.6 : 1 }, svg);
      if (size.labels && major) {
        const t = eln('text', { x, y: base + 17, 'text-anchor': 'middle', fill: '#80848F', 'font-size': 10.5, 'font-family': "'D-DIN PRO', sans-serif" }, svg);
        t.textContent = String(m);
      }
    }

    let xTarget;
    if (overdue > 0) {
      eln('line', { x1: xMark, y1: base + 3, x2: xMark, y2: base - size.major - 4, stroke: 'rgba(255,255,255,0.85)', 'stroke-width': 2 }, svg);
      const overW = x1 - xMark;
      const oSpan = opts.overflowSpan ?? 60;
      for (let m = 5; m < oSpan; m += 5) {
        const x = xMark + (overW * m) / oSpan;
        eln('line', { x1: x, y1: base, x2: x, y2: base - size.minute, stroke: 'rgba(255,176,46,0.3)', 'stroke-width': 1 }, svg);
      }
      xTarget = xMark + overW * Math.min(overdue / oSpan, 0.97);
      if (size.labels) {
        const t = eln('text', { x: x1, y: base + 17, 'text-anchor': 'end', fill: '#FFB02E', 'font-size': 9, 'letter-spacing': '1.6', 'font-family': "'D-DIN PRO', sans-serif" }, svg);
        t.textContent = '+' + String(opts.overflowSpan ?? 60);
      }
    } else {
      xTarget = x0 + perMin * value;
    }

    const fillA = eln('line', { x1: x0, y1: base, x2: x0, y2: base, stroke: '#C9CBD1', 'stroke-width': size.fillW, opacity: 0.75 }, svg);
    let fillB = null;
    if (overdue > 0) {
      fillB = eln('line', { x1: xMark, y1: base, x2: xMark, y2: base, stroke: '#FFB02E', 'stroke-width': size.fillW, opacity: 0.8 }, svg);
    }

    const caret = eln('g', {}, svg);
    const stemTop = base - size.major - (size.value ? 14 : 5);
    eln('polygon', { points: `${-size.caretW / 2},${stemTop - size.caretH} ${size.caretW / 2},${stemTop - size.caretH} 0,${stemTop}`, fill: live }, caret);
    eln('line', { x1: 0, y1: stemTop, x2: 0, y2: base, stroke: live, 'stroke-width': size.fillW === 1 ? 1 : 1.4 }, caret);
    if (size.value && opts.valueText) {
      const vt = eln('text', { x: 0, y: stemTop - size.caretH - 8, 'text-anchor': 'middle', fill: overdue > 0 ? '#FFB02E' : '#F2F3F5', 'font-size': size.valueSize, 'font-family': "'JetBrains Mono Variable', monospace", 'font-weight': 400 }, caret);
      vt.textContent = opts.valueText;
    }

    function set(frac) {
      const x = x0 + (xTarget - x0) * frac;
      caret.setAttribute('transform', `translate(${x} 0)`);
      fillA.setAttribute('x2', String(Math.min(x, xMark)));
      if (fillB) {
        fillB.setAttribute('x2', String(Math.max(x, xMark)));
        fillB.setAttribute('opacity', x > xMark ? '0.8' : '0');
      }
    }
    set(0);

    let anim = null;
    function arrive(springOpts) {
      if (anim) anim.cancel();
      anim = lab.spring(Object.assign({ from: 0, to: 1, response: 0.45, damping: 0.85, onUpdate: (v) => set(lab.clamp(v, 0, 1.04)) }, springOpts || {}));
    }

    return { set, arrive };
  };

  lab.api = {};

  window.__lab = lab;
})();
