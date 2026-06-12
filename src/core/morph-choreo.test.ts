import { describe, it, expect } from 'vitest';
import {
  interpolateMorph,
  springPosition,
  analyticVelocity,
  buildReversalState,
  positionAfterReversal,
  velocityAfterReversal,
  MORPH_SPRING,
  type MorphKeyframe,
  type DampedSpringParams,
} from './morph-choreo';
import { springFromResponse } from '../feel/motion-core';

const KEYFRAME: MorphKeyframe = {
  origin: { rect: { x: 0, y: 0, w: 100, h: 50 }, cornerRadius: 8 },
  target: { rect: { x: 200, y: 100, w: 300, h: 150 }, cornerRadius: 24 },
};

describe('interpolateMorph', () => {
  it('at progress 0 returns origin', () => {
    const g = interpolateMorph(KEYFRAME, 0);
    expect(g.rect.x).toBeCloseTo(0);
    expect(g.rect.y).toBeCloseTo(0);
    expect(g.rect.w).toBeCloseTo(100);
    expect(g.rect.h).toBeCloseTo(50);
    expect(g.cornerRadius).toBeCloseTo(8);
  });

  it('at progress 1 returns target', () => {
    const g = interpolateMorph(KEYFRAME, 1);
    expect(g.rect.x).toBeCloseTo(200);
    expect(g.rect.y).toBeCloseTo(100);
    expect(g.rect.w).toBeCloseTo(300);
    expect(g.rect.h).toBeCloseTo(150);
    expect(g.cornerRadius).toBeCloseTo(24);
  });

  it('at progress 0.5 returns midpoint', () => {
    const g = interpolateMorph(KEYFRAME, 0.5);
    expect(g.rect.x).toBeCloseTo(100);
    expect(g.rect.y).toBeCloseTo(50);
    expect(g.rect.w).toBeCloseTo(200);
    expect(g.rect.h).toBeCloseTo(100);
    expect(g.cornerRadius).toBeCloseTo(16);
  });

  it('clamps progress below 0 to origin', () => {
    const g = interpolateMorph(KEYFRAME, -0.5);
    expect(g.rect.x).toBeCloseTo(0);
  });

  it('clamps progress above 1 to target', () => {
    const g = interpolateMorph(KEYFRAME, 1.5);
    expect(g.rect.x).toBeCloseTo(200);
  });

  it('NaN progress falls back to origin without poisoning the rect', () => {
    const g = interpolateMorph(KEYFRAME, NaN);
    expect(Number.isFinite(g.rect.x)).toBe(true);
    expect(Number.isFinite(g.rect.y)).toBe(true);
    expect(Number.isFinite(g.rect.w)).toBe(true);
    expect(Number.isFinite(g.rect.h)).toBe(true);
    expect(Number.isFinite(g.cornerRadius)).toBe(true);
    expect(g.rect.x).toBeCloseTo(0);
    expect(g.cornerRadius).toBeCloseTo(8);
  });
});

describe('springPosition — closed-form damped oscillator', () => {
  const underDamped: DampedSpringParams = springFromResponse(0.42, 0.7);
  const overDamped: DampedSpringParams = springFromResponse(0.42, 1.5);
  const critDamped: DampedSpringParams = (() => {
    const p = springFromResponse(0.42, 1.0);
    return { ...p, damping: 2 * Math.sqrt(p.stiffness * p.mass) };
  })();

  it('at t=0 underdamped returns x0', () => {
    expect(springPosition(underDamped, 1, 0, 0)).toBeCloseTo(1);
  });

  it('at t=0 overdamped returns x0', () => {
    expect(springPosition(overDamped, 1, 0, 0)).toBeCloseTo(1);
  });

  it('underdamped spring decays toward 0 at t=5s', () => {
    const pos = springPosition(underDamped, 1, 0, 5);
    expect(Math.abs(pos)).toBeLessThan(0.01);
  });

  it('overdamped spring decays toward 0 at t=5s', () => {
    const pos = springPosition(overDamped, 1, 0, 5);
    expect(Math.abs(pos)).toBeLessThan(0.01);
  });

  it('critically damped decays toward 0 at t=5s', () => {
    const pos = springPosition(critDamped, 1, 0, 5);
    expect(Math.abs(pos)).toBeLessThan(0.01);
  });

  it('MORPH_SPRING at t=0 returns 1', () => {
    expect(springPosition(MORPH_SPRING, 1, 0, 0)).toBeCloseTo(1);
  });

  it('negative t returns x0', () => {
    expect(springPosition(underDamped, 0.5, 0, -1)).toBeCloseTo(0.5);
  });
});

describe('analyticVelocity — closed-form derivative validated against finite difference', () => {
  const fd = (params: DampedSpringParams, x0: number, v0: number, t: number): number => {
    const h = 1e-7;
    return (springPosition(params, x0, v0, t + h) - springPosition(params, x0, v0, t - h)) / (2 * h);
  };

  const underDamped: DampedSpringParams = springFromResponse(0.4, 0.7);
  const overDamped: DampedSpringParams = springFromResponse(0.4, 1.6);
  const critDamped: DampedSpringParams = (() => {
    const p = springFromResponse(0.4, 1.0);
    return { ...p, damping: 2 * Math.sqrt(p.stiffness * p.mass) };
  })();

  it('at t=0 returns v0 exactly (underdamped)', () => {
    expect(analyticVelocity(underDamped, 1, 0.5, 0)).toBeCloseTo(0.5, 9);
  });

  it('at t=0 returns v0 exactly (overdamped)', () => {
    expect(analyticVelocity(overDamped, 1, 0.5, 0)).toBeCloseTo(0.5, 9);
  });

  it('at t=0 returns v0 exactly (critically damped)', () => {
    expect(analyticVelocity(critDamped, 1, 0.5, 0)).toBeCloseTo(0.5, 9);
  });

  it('underdamped: analytic matches finite difference across a time sweep', () => {
    for (let i = 0; i <= 40; i++) {
      const t = i * 0.02;
      expect(analyticVelocity(underDamped, 1, 0, t)).toBeCloseTo(fd(underDamped, 1, 0, t), 4);
    }
  });

  it('overdamped: analytic matches finite difference across a time sweep', () => {
    for (let i = 0; i <= 40; i++) {
      const t = i * 0.02;
      expect(analyticVelocity(overDamped, 1, 0, t)).toBeCloseTo(fd(overDamped, 1, 0, t), 4);
    }
  });

  it('critically damped: analytic matches finite difference across a time sweep', () => {
    for (let i = 0; i <= 40; i++) {
      const t = i * 0.02;
      expect(analyticVelocity(critDamped, 1, 0, t)).toBeCloseTo(fd(critDamped, 1, 0, t), 4);
    }
  });

  it('at large t velocity is near zero', () => {
    expect(Math.abs(analyticVelocity(underDamped, 1, 0, 10))).toBeLessThan(0.001);
  });

  it('negative t returns v0', () => {
    expect(analyticVelocity(underDamped, 1, 0.3, -1)).toBeCloseTo(0.3, 9);
  });
});

describe('reversal continuity — one-sided-limit convergence proof', () => {
  const spring: DampedSpringParams = springFromResponse(0.42, 0.82);
  const forwardX0 = 1.0;
  const forwardV0 = 0.0;
  const tRev = 0.1;

  it('position one-sided limits converge as epsilon shrinks (true continuity)', () => {
    const state = buildReversalState(spring, forwardX0, forwardV0, tRev);
    let prevGap = Infinity;
    for (const eps of [1e-2, 1e-3, 1e-4, 1e-5]) {
      const before = springPosition(spring, forwardX0, forwardV0, tRev - eps);
      const after = positionAfterReversal(state, tRev + eps);
      const gap = Math.abs(before - after);
      expect(gap).toBeLessThan(prevGap + 1e-12);
      prevGap = gap;
    }
    expect(prevGap).toBeLessThan(1e-3);
  });

  it('velocity one-sided limits converge as epsilon shrinks (true continuity)', () => {
    const state = buildReversalState(spring, forwardX0, forwardV0, tRev);
    let prevGap = Infinity;
    for (const eps of [1e-2, 1e-3, 1e-4, 1e-5]) {
      const before = analyticVelocity(spring, forwardX0, forwardV0, tRev - eps);
      const after = velocityAfterReversal(state, tRev + eps);
      const gap = Math.abs(before - after);
      expect(gap).toBeLessThan(prevGap + 1e-12);
      prevGap = gap;
    }
    expect(prevGap).toBeLessThan(1e-3);
  });

  it('forward and reversal trajectories agree exactly at the reversal instant (C0)', () => {
    const state = buildReversalState(spring, forwardX0, forwardV0, tRev);
    expect(positionAfterReversal(state, tRev)).toBe(state.posAtReversal);
  });

  it('forward and reversal velocities agree exactly at the reversal instant (C1)', () => {
    const state = buildReversalState(spring, forwardX0, forwardV0, tRev);
    const forwardVel = analyticVelocity(spring, forwardX0, forwardV0, tRev);
    expect(velocityAfterReversal(state, tRev)).toBeCloseTo(forwardVel, 12);
  });

  it('reversal state captures true analytic velocity at tRev', () => {
    const state = buildReversalState(spring, forwardX0, forwardV0, tRev);
    expect(state.velAtReversal).toBeCloseTo(analyticVelocity(spring, forwardX0, forwardV0, tRev), 12);
  });

  it('after reversal spring decays toward 0', () => {
    const state = buildReversalState(spring, forwardX0, forwardV0, tRev);
    expect(Math.abs(positionAfterReversal(state, tRev + 5))).toBeLessThan(0.01);
  });

  it('reversal at t=0 gives x0 and v0 matching initial conditions', () => {
    const state = buildReversalState(spring, 1.0, 0.5, 0);
    expect(state.posAtReversal).toBeCloseTo(1.0, 9);
    expect(state.velAtReversal).toBeCloseTo(0.5, 9);
  });

  it('mid-flight reversal position is between origin and target', () => {
    const state = buildReversalState(spring, forwardX0, forwardV0, tRev);
    expect(state.posAtReversal).toBeLessThan(1.0);
    expect(state.posAtReversal).toBeGreaterThan(0);
  });
});
