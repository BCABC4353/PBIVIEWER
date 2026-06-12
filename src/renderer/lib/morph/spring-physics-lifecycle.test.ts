import { describe, it, expect } from 'vitest';
import { createMomentumSpring } from './spring-physics';
import { makeScheduler } from './spring-test-clock';

describe('createMomentumSpring — lifecycle', () => {
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
