import { describe, it, expect } from 'vitest';
import {
  createMomentumSpring,
  createSpringTicker,
  MOMENTUM_DT_CAP_MS,
} from './luce-motion';

function makeScheduler() {
  let time = 0;
  let nextId = 1;
  const pending = new Map<number, () => void>();
  return {
    now: () => time,
    schedule(cb: () => void): number {
      const id = nextId++;
      pending.set(id, cb);
      return id;
    },
    cancel(id: number): void {
      pending.delete(id);
    },
    tick(ms: number): void {
      time += ms;
      const callbacks = [...pending.values()];
      pending.clear();
      for (const cb of callbacks) cb();
    },
    hasPending: () => pending.size > 0,
  };
}

describe('createMomentumSpring', () => {
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

  it('dt clamping prevents explosion on a single huge frame', () => {
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

    clock.tick(10000);

    expect(Number.isFinite(latestPos)).toBe(true);
    expect(Math.abs(latestPos)).toBeLessThan(1000);

    expect(Math.abs(latestPos - 100)).toBeLessThan(MOMENTUM_DT_CAP_MS);
  });

  it('set() jumps instantly, zeroes velocity, and cancels all pending frames', () => {
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

    clock.tick(100);

    spring.set(42);

    expect(updates[updates.length - 1]).toEqual({ pos: 42, vel: 0, done: true });
    expect(spring.value()).toBe(42);
    expect(spring.velocity()).toBe(0);
    expect(clock.hasPending()).toBe(false);

    const countAfterSet = updates.length;
    clock.tick(100);
    expect(updates.length).toBe(countAfterSet);
  });

  it('stop() cancels in-flight frames without changing position', () => {
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
    clock.tick(50);

    const posAtStop = latestPos;
    expect(clock.hasPending()).toBe(true);

    spring.stop();

    expect(clock.hasPending()).toBe(false);
    expect(spring.value()).toBeCloseTo(posAtStop, 5);
  });

  it('retarget to current value with zero velocity settles immediately', () => {
    const clock = makeScheduler();

    const updates: Array<{ pos: number; done: boolean }> = [];

    const spring = createMomentumSpring({
      initial: 50,
      onUpdate: (pos, _vel, done) => updates.push({ pos, done }),
      now: clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
    });

    spring.retarget(50);

    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({ pos: 50, done: true });
    expect(clock.hasPending()).toBe(false);
  });

  it('retarget mid-flight to the same current position but away from original target re-settles correctly', () => {
    const clock = makeScheduler();

    let latestPos = 0;
    let isDone = false;

    const spring = createMomentumSpring({
      initial: 0,
      onUpdate: (pos, _vel, done) => {
        latestPos = pos;
        isDone = done;
      },
      now: clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
    });

    spring.retarget(200);

    for (let i = 0; i < 200 && clock.hasPending(); i++) {
      clock.tick(16);
    }

    expect(isDone).toBe(true);
    expect(latestPos).toBeCloseTo(200, 0);
  });

  it('velocity() reflects the internal spring velocity', () => {
    const clock = makeScheduler();

    const spring = createMomentumSpring({
      initial: 0,
      onUpdate: () => {},
      now: clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
    });

    expect(spring.velocity()).toBe(0);

    spring.retarget(100);

    clock.tick(50);

    expect(spring.velocity()).toBeGreaterThan(0);

    for (let i = 0; i < 200 && clock.hasPending(); i++) {
      clock.tick(16);
    }

    expect(spring.velocity()).toBe(0);
  });
});
