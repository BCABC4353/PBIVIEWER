import { describe, expect, it } from 'vitest';
import {
  createRateLimiter,
  createReduceMotionCache,
  defaultNumberFormat,
  formatAnimatedValue,
  springFromResponse,
  staggerDelay,
} from './motionCore';


describe('springFromResponse', () => {
  it('converts the spec nav spring (0.45 / 0.86) exactly', () => {
    const s = springFromResponse(0.45, 0.86);
    expect(s.stiffness).toBeCloseTo(194.96, 1);
    expect(s.damping).toBeCloseTo(24.02, 1);
    expect(s.mass).toBe(1);
  });

  it('round-trips the damping fraction (ζ = damping / 2√(k·m))', () => {
    for (const [response, zeta] of [
      [0.42, 0.82],
      [0.15, 0.86],
      [0.4, 0.8],
    ] as const) {
      const s = springFromResponse(response, zeta);
      const recoveredZeta = s.damping / (2 * Math.sqrt(s.stiffness * s.mass));
      expect(recoveredZeta).toBeCloseTo(zeta, 10);
      const recoveredResponse = (2 * Math.PI) / Math.sqrt(s.stiffness / s.mass);
      expect(recoveredResponse).toBeCloseTo(response, 10);
    }
  });

  it('a faster response means a stiffer spring', () => {
    expect(springFromResponse(0.15, 0.86).stiffness).toBeGreaterThan(
      springFromResponse(0.45, 0.86).stiffness,
    );
  });

  it('rejects nonsense inputs', () => {
    expect(() => springFromResponse(0, 0.8)).toThrow();
    expect(() => springFromResponse(-1, 0.8)).toThrow();
    expect(() => springFromResponse(0.4, 0)).toThrow();
  });
});


describe('staggerDelay', () => {
  it('is zero for the first item', () => {
    expect(staggerDelay(0, 45)).toBe(0);
  });

  it('steps linearly per item', () => {
    expect(staggerDelay(1, 45)).toBe(45);
    expect(staggerDelay(3, 45)).toBe(135);
  });

  it('clamps long lists so late rows arrive together', () => {
    expect(staggerDelay(8, 45)).toBe(360);
    expect(staggerDelay(50, 45)).toBe(360);
    expect(staggerDelay(50, 45, 4)).toBe(180);
  });

  it('treats negative / non-finite indices as the first item', () => {
    expect(staggerDelay(-2, 45)).toBe(0);
    expect(staggerDelay(Number.NaN, 45)).toBe(0);
  });

  it('floors fractional indices', () => {
    expect(staggerDelay(2.7, 45)).toBe(90);
  });
});


describe('createRateLimiter', () => {
  function fakeClock(start = 0) {
    let t = start;
    return { now: () => t, advance: (ms: number) => (t += ms) };
  }

  it('allows the first call immediately', () => {
    const clock = fakeClock();
    const gate = createRateLimiter(30, clock.now);
    expect(gate()).toBe(true);
  });

  it('blocks calls inside the minimum interval and reopens after it', () => {
    const clock = fakeClock();
    const gate = createRateLimiter(30, clock.now);
    expect(gate()).toBe(true);
    clock.advance(20);
    expect(gate()).toBe(false);
    clock.advance(14);
    expect(gate()).toBe(true);
  });

  it('never exceeds maxPerSecond under a buzz-saw of calls', () => {
    const clock = fakeClock();
    const gate = createRateLimiter(30, clock.now);
    let fired = 0;
    for (let i = 0; i < 500; i++) {
      if (gate()) fired++;
      clock.advance(2);
    }
    expect(fired).toBeLessThanOrEqual(30);
    expect(fired).toBeGreaterThanOrEqual(28);
  });

  it('measures from the last ALLOWED call (leading edge), not the last attempt', () => {
    const clock = fakeClock();
    const gate = createRateLimiter(10, clock.now);
    expect(gate()).toBe(true);
    clock.advance(90);
    expect(gate()).toBe(false);
    clock.advance(10);
    expect(gate()).toBe(true);
  });

  it('rejects a non-positive rate', () => {
    expect(() => createRateLimiter(0)).toThrow();
  });
});


describe('createReduceMotionCache', () => {
  function fakeSource(initial: boolean) {
    let listener: ((v: boolean) => void) | null = null;
    let resolveInitial!: (v: boolean) => void;
    const initialPromise = new Promise<boolean>((res) => (resolveInitial = res));
    return {
      source: {
        getInitial: () => initialPromise,
        subscribe: (cb: (v: boolean) => void) => {
          listener = cb;
          return () => {
            listener = null;
          };
        },
      },
      resolveInitial: () => resolveInitial(initial),
      emit: (v: boolean) => listener?.(v),
      hasListener: () => listener !== null,
    };
  }

  it('is optimistically motion-enabled before the async OS read lands', () => {
    const f = fakeSource(true);
    const cache = createReduceMotionCache(f.source);
    expect(cache.motionEnabled()).toBe(true);
  });

  it('caches the initial OS value once it resolves', async () => {
    const f = fakeSource(true);
    const cache = createReduceMotionCache(f.source);
    f.resolveInitial();
    await cache.ready;
    expect(cache.motionEnabled()).toBe(false);
  });

  it('tracks live changes from the subscription', async () => {
    const f = fakeSource(false);
    const cache = createReduceMotionCache(f.source);
    f.resolveInitial();
    await cache.ready;
    expect(cache.motionEnabled()).toBe(true);
    f.emit(true);
    expect(cache.motionEnabled()).toBe(false);
    f.emit(false);
    expect(cache.motionEnabled()).toBe(true);
  });

  it('ignores updates after dispose and unsubscribes', async () => {
    const f = fakeSource(false);
    const cache = createReduceMotionCache(f.source);
    cache.dispose();
    expect(f.hasListener()).toBe(false);
    f.resolveInitial();
    await cache.ready;
    expect(cache.motionEnabled()).toBe(true);
  });

  it('keeps the optimistic default when the OS read fails', async () => {
    const cache = createReduceMotionCache({
      getInitial: () => Promise.reject(new Error('no a11y bridge')),
      subscribe: () => () => {},
    });
    await cache.ready;
    expect(cache.motionEnabled()).toBe(true);
  });
});


describe('defaultNumberFormat', () => {
  it('rounds to integers', () => {
    expect(defaultNumberFormat(3.4)).toBe('3');
    expect(defaultNumberFormat(3.6)).toBe('4');
  });

  it('groups thousands', () => {
    expect(defaultNumberFormat(1234567)).toBe('1,234,567');
    expect(defaultNumberFormat(999)).toBe('999');
    expect(defaultNumberFormat(1000)).toBe('1,000');
  });

  it('handles zero and negatives', () => {
    expect(defaultNumberFormat(0)).toBe('0');
    expect(defaultNumberFormat(-1234.4)).toBe('-1,234');
  });

  it('renders non-finite input as an em dash, never NaN', () => {
    expect(defaultNumberFormat(Number.NaN)).toBe('—');
    expect(defaultNumberFormat(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('formatAnimatedValue', () => {
  it('formats an in-flight value', () => {
    expect(formatAnimatedValue(1500.2, 0, 2000)).toBe('1,500');
  });

  it('never prints past the destination (overshoot clamps to target)', () => {
    expect(formatAnimatedValue(2000.6, 0, 2000)).toBe('2,000');
    expect(formatAnimatedValue(-0.4, 100, 0)).toBe('0');
  });

  it('never prints before the origin', () => {
    expect(formatAnimatedValue(-3, 0, 2000)).toBe('0');
  });

  it('works when counting down (from > to)', () => {
    expect(formatAnimatedValue(50, 100, 0)).toBe('50');
    expect(formatAnimatedValue(120, 100, 0)).toBe('100');
  });

  it('falls back to the target for non-finite in-flight values', () => {
    expect(formatAnimatedValue(Number.NaN, 0, 42)).toBe('42');
  });

  it('pipes through a custom formatter', () => {
    const pct = (n: number) => `${Math.round(n)}%`;
    expect(formatAnimatedValue(97.6, 0, 100, pct)).toBe('98%');
  });
});
