import { describe, it, expect } from 'vitest';
import { createMomentumSpring, MOMENTUM_DT_CAP_MS } from './spring-physics';
import { createSpringTicker } from '../../components/insights/luce-motion';
import { makeScheduler } from './spring-test-clock';

describe('createMomentumSpring — momentum + retarget', () => {
  it('springs to the exact target and reports done with no pending frames', () => {
    const clock = makeScheduler();
    const updates: Array<{ pos: number; vel: number; done: boolean }> = [];

    const spring = createMomentumSpring({
      initial: 0,
      onUpdate: (pos, vel, done) => updates.push({ pos, vel, done }),
      now: clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
    });

    spring.retarget(100);

    for (let i = 0; i < 200 && clock.hasPending(); i++) {
      clock.tick(16);
    }

    const last = updates[updates.length - 1];
    expect(last).toBeDefined();
    expect(last!.done).toBe(true);
    expect(last!.pos).toBe(100);
    expect(last!.vel).toBe(0);
    expect(clock.hasPending()).toBe(false);
  });

  it('MONEY TEST — carries velocity through retarget: momentum does NOT reset to zero', () => {
    const clock = makeScheduler();

    let latestPos = 0;
    let latestVel = 0;

    const spring = createMomentumSpring({
      initial: 0,
      onUpdate: (pos, vel) => {
        latestPos = pos;
        latestVel = vel;
      },
      now: clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
    });

    spring.retarget(100);

    for (let i = 0; i < 5; i++) {
      clock.tick(16);
    }

    const posBeforeRetarget = latestPos;
    const velBeforeRetarget = latestVel;

    expect(velBeforeRetarget).toBeGreaterThan(5);
    expect(posBeforeRetarget).toBeGreaterThan(0);
    expect(posBeforeRetarget).toBeLessThan(80);

    spring.retarget(0);

    expect(spring.velocity()).toBeCloseTo(velBeforeRetarget, 5);

    clock.tick(1);

    const posAfter1ms = latestPos;
    const velAfter1ms = latestVel;

    expect(posAfter1ms).toBeGreaterThan(posBeforeRetarget);

    expect(velAfter1ms).toBeGreaterThan(0);

    for (let i = 0; i < 200; i++) {
      clock.tick(16);
      if (!clock.hasPending()) break;
    }

    expect(latestPos).toBeCloseTo(0, 0);
    expect(clock.hasPending()).toBe(false);
  });

  it('CONTRAST — naive createSpringTicker LOSES velocity on retarget (documents the old behavior)', () => {
    const clock = makeScheduler();

    let latestValue = 0;
    const updates: number[] = [];

    const ticker = createSpringTicker({
      initial: 0,
      duration: 700,
      onUpdate: (v) => {
        latestValue = v;
        updates.push(v);
      },
      now: clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
    });

    ticker.retarget(100);

    for (let i = 0; i < 10; i++) {
      clock.tick(16);
    }

    const posBeforeRetarget = latestValue;
    expect(posBeforeRetarget).toBeGreaterThan(0);

    const countBefore = updates.length;
    ticker.retarget(0);

    clock.tick(16);

    const posFirstTickAfter = updates[countBefore] ?? latestValue;

    expect(posFirstTickAfter).toBeLessThan(posBeforeRetarget);
  });

  it('position is continuous across retarget — no snap', () => {
    const clock = makeScheduler();

    let latestPos = 0;

    const spring = createMomentumSpring({
      initial: 0,
      onUpdate: (pos) => { latestPos = pos; },
      now: clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
    });

    spring.retarget(100);

    for (let i = 0; i < 8; i++) {
      clock.tick(16);
    }

    const posJustBefore = latestPos;

    spring.retarget(0);

    clock.tick(1);

    expect(Math.abs(latestPos - posJustBefore)).toBeLessThan(5);
  });

  it('dt clamping caps a single huge frame to one capped step, not the whole journey', () => {
    const clock = makeScheduler();

    let latestPos = 0;
    let latestDone = false;

    const spring = createMomentumSpring({
      initial: 0,
      onUpdate: (pos, _vel, done) => { latestPos = pos; latestDone = done; },
      now: clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
    });

    spring.retarget(100);

    clock.tick(10000);
    const afterFirstHugeFrame = latestPos;

    expect(Number.isFinite(afterFirstHugeFrame)).toBe(true);
    expect(latestDone).toBe(false);
    expect(afterFirstHugeFrame).toBeGreaterThan(0);
    expect(afterFirstHugeFrame).toBeLessThan(60);

    clock.tick(10000);
    const afterSecondHugeFrame = latestPos;
    expect(afterSecondHugeFrame).toBeGreaterThan(afterFirstHugeFrame);

    for (let i = 0; i < 200 && clock.hasPending(); i++) clock.tick(MOMENTUM_DT_CAP_MS);
    expect(latestPos).toBe(100);
  });
});
