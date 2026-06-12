import { describe, it, expect } from 'vitest';
import { scale, scaleFactor, scaleLinear, scaleClamp, scaleWithMeta, type ScaleConfig } from './fluid-scale';

const CONFIG: ScaleConfig = { minWidth: 320, maxWidth: 1440, minScale: 0.75, maxScale: 1.5 };

describe('scaleFactor — boundary values', () => {
  it('at minWidth returns minScale', () => {
    expect(scaleFactor(320, CONFIG)).toBeCloseTo(0.75);
  });

  it('at maxWidth returns maxScale', () => {
    expect(scaleFactor(1440, CONFIG)).toBeCloseTo(1.5);
  });

  it('below minWidth clamps to minScale', () => {
    expect(scaleFactor(0, CONFIG)).toBeCloseTo(0.75);
    expect(scaleFactor(100, CONFIG)).toBeCloseTo(0.75);
  });

  it('above maxWidth clamps to maxScale', () => {
    expect(scaleFactor(2000, CONFIG)).toBeCloseTo(1.5);
  });

  it('midpoint is exactly between min and max', () => {
    const mid = (320 + 1440) / 2;
    expect(scaleFactor(mid, CONFIG)).toBeCloseTo((0.75 + 1.5) / 2);
  });

  it('degenerate: maxWidth <= minWidth returns minScale', () => {
    expect(scaleFactor(500, { minWidth: 500, maxWidth: 500, minScale: 0.8, maxScale: 1.2 })).toBeCloseTo(0.8);
  });
});

describe('scale — basic arithmetic', () => {
  it('scales value by minScale at minWidth', () => {
    expect(scale(100, 320, CONFIG)).toBeCloseTo(75);
  });

  it('scales value by maxScale at maxWidth', () => {
    expect(scale(100, 1440, CONFIG)).toBeCloseTo(150);
  });

  it('zero value always produces zero', () => {
    expect(scale(0, 800, CONFIG)).toBe(0);
  });
});

describe('scaleWithMeta', () => {
  it('marks clamped true at boundary', () => {
    const { clamped } = scaleWithMeta(10, 320, CONFIG);
    expect(clamped).toBe(true);
  });

  it('marks clamped false in middle range', () => {
    const { clamped } = scaleWithMeta(10, 880, CONFIG);
    expect(clamped).toBe(false);
  });
});

describe('scaleLinear', () => {
  it('at minWidth returns fromValue', () => {
    expect(scaleLinear(320, 12, 24, CONFIG)).toBeCloseTo(12);
  });

  it('at maxWidth returns toValue', () => {
    expect(scaleLinear(1440, 12, 24, CONFIG)).toBeCloseTo(24);
  });

  it('below min clamps to fromValue', () => {
    expect(scaleLinear(0, 12, 24, CONFIG)).toBeCloseTo(12);
  });
});

describe('scaleClamp', () => {
  it('clamps result to minResult', () => {
    expect(scaleClamp(10, 0, 8, 200, CONFIG)).toBe(8);
  });

  it('clamps result to maxResult', () => {
    expect(scaleClamp(200, 9999, 0, 100, CONFIG)).toBe(100);
  });
});

describe('fluid-scale — CONSTITUTIONAL monotonicity and continuity sweep', () => {
  it('scaleFactor is monotonically non-decreasing across 2000 width steps', () => {
    const steps = 2000;
    const minW = 0;
    const maxW = 2000;
    let prev = scaleFactor(minW, CONFIG);
    for (let i = 1; i <= steps; i++) {
      const w = minW + (i / steps) * (maxW - minW);
      const curr = scaleFactor(w, CONFIG);
      expect(curr).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = curr;
    }
  });

  it('scaleFactor has no discontinuities across 2000 width steps (max step-to-step delta bounded)', () => {
    const steps = 2000;
    const minW = 0;
    const maxW = 2000;
    const maxAllowedDelta = (CONFIG.maxScale - CONFIG.minScale) * 10 / steps;
    let prev = scaleFactor(minW, CONFIG);
    for (let i = 1; i <= steps; i++) {
      const w = minW + (i / steps) * (maxW - minW);
      const curr = scaleFactor(w, CONFIG);
      expect(Math.abs(curr - prev)).toBeLessThanOrEqual(maxAllowedDelta + 1e-12);
      prev = curr;
    }
  });

  it('scale(value) is monotonically non-decreasing in width for positive value', () => {
    const steps = 500;
    const value = 16;
    let prev = scale(value, 0, CONFIG);
    for (let i = 1; i <= steps; i++) {
      const w = i * 4;
      const curr = scale(value, w, CONFIG);
      expect(curr).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = curr;
    }
  });

  it('scale output remains bounded in [minScale*value, maxScale*value]', () => {
    const value = 20;
    for (let w = 0; w <= 3000; w += 50) {
      const s = scale(value, w, CONFIG);
      expect(s).toBeGreaterThanOrEqual(CONFIG.minScale * value - 1e-10);
      expect(s).toBeLessThanOrEqual(CONFIG.maxScale * value + 1e-10);
    }
  });
});
