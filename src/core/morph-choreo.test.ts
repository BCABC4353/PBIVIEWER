import { describe, it, expect } from 'vitest';
import {
  interpolateMorph,
  springPosition,
  springVelocity,
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

describe('springVelocity — numerical derivative', () => {
  const spring: DampedSpringParams = springFromResponse(0.4, 0.8);

  it('at t=0 with zero initial velocity, velocity is close to initial v0', () => {
    const v = springVelocity(spring, 1, 0, 0);
    expect(v).toBeCloseTo(0, 1);
  });

  it('at large t velocity is near zero', () => {
    const v = springVelocity(spring, 1, 0, 10);
    expect(Math.abs(v)).toBeLessThan(0.001);
  });
});

describe('reversal continuity — CONSTITUTIONAL PROOF', () => {
  const spring: DampedSpringParams = springFromResponse(0.42, 0.82);

  const forwardX0 = 1.0;
  const forwardV0 = 0.0;
  const tRev = 0.1;
  const eps = 1e-4;

  it('position is continuous at reversal moment (no jump)', () => {
    const state = buildReversalState(spring, forwardX0, forwardV0, tRev);
    const posJustBefore = springPosition(spring, forwardX0, forwardV0, tRev - eps);
    const posJustAfter = positionAfterReversal(state, tRev + eps);
    expect(Math.abs(posJustBefore - posJustAfter)).toBeLessThan(0.02);
  });

  it('position at exact reversal matches forward position', () => {
    const state = buildReversalState(spring, forwardX0, forwardV0, tRev);
    const forwardPos = springPosition(spring, forwardX0, forwardV0, tRev);
    const reversalPos = positionAfterReversal(state, tRev);
    expect(Math.abs(forwardPos - reversalPos)).toBeLessThan(1e-10);
  });

  it('velocity is continuous at reversal moment (no jump)', () => {
    const state = buildReversalState(spring, forwardX0, forwardV0, tRev);
    const velBefore = springVelocity(spring, forwardX0, forwardV0, tRev);
    const velAfter = velocityAfterReversal(state, tRev);
    expect(Math.abs(velBefore - velAfter)).toBeLessThan(0.05);
  });

  it('velocity at exact reversal stored correctly', () => {
    const state = buildReversalState(spring, forwardX0, forwardV0, tRev);
    const forwardVel = springVelocity(spring, forwardX0, forwardV0, tRev);
    expect(Math.abs(state.velAtReversal - forwardVel)).toBeLessThan(0.01);
  });

  it('after reversal spring decays toward 0', () => {
    const state = buildReversalState(spring, forwardX0, forwardV0, tRev);
    const posLater = positionAfterReversal(state, tRev + 5);
    expect(Math.abs(posLater)).toBeLessThan(0.01);
  });

  it('reversal at t=0 gives x0 and v0 matching initial conditions', () => {
    const state = buildReversalState(spring, 1.0, 0.5, 0);
    expect(state.posAtReversal).toBeCloseTo(1.0);
    expect(state.velAtReversal).toBeCloseTo(0.5, 1);
  });

  it('mid-flight reversal position is between origin and target', () => {
    const state = buildReversalState(spring, forwardX0, forwardV0, tRev);
    expect(state.posAtReversal).toBeLessThan(1.0);
    expect(state.posAtReversal).toBeGreaterThan(0);
  });
});
