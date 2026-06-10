/**
 * Luce motion system unit tests — the D5/D6/D7 logic layer.
 *
 * The spring sampler and ticker are driven with an injected manual clock so
 * curve shape (one proud overshoot, dead settle) and mid-flight retargeting
 * (mass: re-aim from the CURRENT value, never snap) are asserted exactly.
 * jsdom lacks `element.animate`, so the WAAPI path is stubbed where needed.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  SPRING_NEEDLE,
  SPRING_SETTLE,
  DUR,
  parseLinearStops,
  linearEasingAt,
  createSpringTicker,
  prefersReducedMotion,
  pulse,
  useSpringNumber,
  useIgnition,
  useDocumentHidden,
  IGNITION_FLAG,
  IGNITION_MS,
} from './luce-motion';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Manual clock + scheduler so ticker time is fully deterministic. */
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
    /** Advance the clock and fire everything that was scheduled. */
    tick(ms: number): void {
      time += ms;
      const callbacks = [...pending.values()];
      pending.clear();
      for (const cb of callbacks) cb();
    },
    hasPending: () => pending.size > 0,
  };
}

function stubMatchMedia(reduceMatches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? reduceMatches : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.sessionStorage.clear();
});

// ---------------------------------------------------------------------------
// D5 — springs and durations
// ---------------------------------------------------------------------------

describe('spring curves + duration scale (D5)', () => {
  it('exposes exactly the four sanctioned durations', () => {
    expect(DUR).toEqual({ needle: 700, panel: 400, control: 250, press: 80 });
  });

  it('parses SPRING_NEEDLE: starts at 0, settles at ~1, overshoots once past 1', () => {
    const stops = parseLinearStops(SPRING_NEEDLE);
    expect(stops[0]).toEqual({ t: 0, v: 0 });
    expect(stops[stops.length - 1]?.t).toBe(1);
    expect(stops[stops.length - 1]?.v).toBeCloseTo(1, 1);
    // The needle's mass: a visible overshoot beyond the target…
    const peak = Math.max(...stops.map((s) => s.v));
    expect(peak).toBeGreaterThan(1.1);
    expect(peak).toBeLessThan(1.2);
    // …and progress stays monotonic.
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i]!.t).toBeGreaterThanOrEqual(stops[i - 1]!.t);
    }
  });

  it('parses SPRING_SETTLE: damping ≈ 0.9 with no proud overshoot', () => {
    const stops = parseLinearStops(SPRING_SETTLE);
    const peak = Math.max(...stops.map((s) => s.v));
    expect(peak).toBeGreaterThan(1); // it breathes past 1…
    expect(peak).toBeLessThan(1.08); // …but never visibly bounces
  });

  it('spreads unpositioned stops evenly (css-easing-2 behavior)', () => {
    const stops = parseLinearStops('linear(0, 0.5, 1)');
    expect(stops).toEqual([
      { t: 0, v: 0 },
      { t: 0.5, v: 0.5 },
      { t: 1, v: 1 },
    ]);
  });

  it('samples by linear interpolation and clamps outside [0,1]', () => {
    const stops = parseLinearStops('linear(0, 1)');
    expect(linearEasingAt(stops, 0.25)).toBeCloseTo(0.25);
    expect(linearEasingAt(stops, -1)).toBe(0);
    expect(linearEasingAt(stops, 2)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Spring ticker — retargeting with mass
// ---------------------------------------------------------------------------

describe('createSpringTicker', () => {
  it('animates to the exact target and reports done at the end of the duration', () => {
    const clock = makeScheduler();
    const seen: Array<{ v: number; done: boolean }> = [];
    const ticker = createSpringTicker({
      initial: 0,
      duration: 700,
      onUpdate: (v, done) => seen.push({ v, done }),
      now: clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
    });
    ticker.retarget(100);
    for (let i = 0; i < 50 && clock.hasPending(); i++) clock.tick(50);
    const last = seen[seen.length - 1];
    expect(last).toEqual({ v: 100, done: true });
    expect(clock.hasPending()).toBe(false); // settles dead — no zombie frames
  });

  it('overshoots the target once (needle mass) before settling', () => {
    const clock = makeScheduler();
    const values: number[] = [];
    const ticker = createSpringTicker({
      initial: 0,
      duration: 700,
      easing: SPRING_NEEDLE,
      onUpdate: (v) => values.push(v),
      now: clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
    });
    ticker.retarget(100);
    for (let i = 0; i < 50 && clock.hasPending(); i++) clock.tick(20);
    expect(Math.max(...values)).toBeGreaterThan(105);
    expect(values[values.length - 1]).toBe(100);
  });

  it('retargets mid-flight from the CURRENT value — never snaps', () => {
    const clock = makeScheduler();
    let current = 0;
    const ticker = createSpringTicker({
      initial: 0,
      duration: 700,
      onUpdate: (v) => {
        current = v;
      },
      now: clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
    });
    ticker.retarget(100);
    clock.tick(100); // mid-flight, before the overshoot crests
    const midway = current;
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(100);

    ticker.retarget(0); // interrupted — re-aim like a real needle
    clock.tick(16); // first frame of the new leg
    expect(Math.abs(current - midway)).toBeLessThan(midway * 0.2); // continuity, no snap
    for (let i = 0; i < 60 && clock.hasPending(); i++) clock.tick(50);
    expect(current).toBe(0);
  });

  it('set() jumps instantly and cancels in-flight frames', () => {
    const clock = makeScheduler();
    const seen: Array<{ v: number; done: boolean }> = [];
    const ticker = createSpringTicker({
      initial: 5,
      onUpdate: (v, done) => seen.push({ v, done }),
      now: clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
    });
    ticker.retarget(50);
    ticker.set(7);
    expect(seen[seen.length - 1]).toEqual({ v: 7, done: true });
    expect(clock.hasPending()).toBe(false);
    expect(ticker.value()).toBe(7);
  });

  it('retargeting to the value it already holds settles immediately', () => {
    const clock = makeScheduler();
    const seen: Array<{ v: number; done: boolean }> = [];
    const ticker = createSpringTicker({
      initial: 42,
      onUpdate: (v, done) => seen.push({ v, done }),
      now: clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
    });
    ticker.retarget(42);
    expect(seen).toEqual([{ v: 42, done: true }]);
    expect(clock.hasPending()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Reduced motion + WAAPI pulse
// ---------------------------------------------------------------------------

describe('prefersReducedMotion / pulse', () => {
  it('reflects the prefers-reduced-motion media query', () => {
    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
  });

  it('is false when matchMedia is unavailable', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: undefined,
    });
    expect(prefersReducedMotion()).toBe(false);
    stubMatchMedia(false); // restore for following assertions
  });

  it('pulses via WAAPI on the settle spring', () => {
    stubMatchMedia(false);
    const animate = vi.fn();
    const el = { animate } as unknown as Element;
    pulse(el, 700);
    expect(animate).toHaveBeenCalledTimes(1);
    const [, options] = animate.mock.calls[0] as [unknown, KeyframeAnimationOptions];
    expect(options.duration).toBe(700);
    expect(options.easing).toBe(SPRING_SETTLE);
  });

  it('is a no-op without element.animate (jsdom) and under reduced motion', () => {
    stubMatchMedia(false);
    expect(() => pulse({} as Element)).not.toThrow();
    expect(() => pulse(null)).not.toThrow();
    stubMatchMedia(true);
    const animate = vi.fn();
    pulse({ animate } as unknown as Element);
    expect(animate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useSpringNumber — the hero numeral hook (D5 / D11)
// ---------------------------------------------------------------------------

describe('useSpringNumber', () => {
  function stubFrames() {
    const frames: FrameRequestCallback[] = [];
    let now = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    return {
      advanceTo(ms: number) {
        now = ms;
        const pending = frames.splice(0);
        for (const cb of pending) cb(now);
      },
    };
  }

  it('mounts already settled at the target — no motion on first paint', () => {
    stubMatchMedia(false);
    stubFrames();
    const { result } = renderHook(() => useSpringNumber(42));
    expect(result.current.value).toBe(42);
  });

  it('counts up from 0 on mount during the ignition ceremony', () => {
    stubMatchMedia(false);
    const clock = stubFrames();
    const { result } = renderHook(() => useSpringNumber(80, { startFromZero: true }));
    expect(result.current.value).toBe(0);
    act(() => clock.advanceTo(DUR.needle));
    expect(result.current.value).toBe(80);
  });

  it('retargets a live value with spring mass when the target changes', () => {
    stubMatchMedia(false);
    const clock = stubFrames();
    const { result, rerender } = renderHook(({ t }) => useSpringNumber(t), {
      initialProps: { t: 0 },
    });
    rerender({ t: 100 });
    act(() => clock.advanceTo(350));
    expect(result.current.value).toBeGreaterThan(50);
    expect(result.current.value).not.toBe(100); // mid-flight, not a snap
    act(() => clock.advanceTo(700));
    expect(result.current.value).toBe(100);
  });

  it('collapses to instant under prefers-reduced-motion', () => {
    stubMatchMedia(true);
    stubFrames();
    const { result, rerender } = renderHook(({ t }) => useSpringNumber(t, { startFromZero: true }), {
      initialProps: { t: 60 },
    });
    expect(result.current.value).toBe(60); // no count-up ceremony
    rerender({ t: 25 });
    expect(result.current.value).toBe(25); // no spring, no frames
  });
});

// ---------------------------------------------------------------------------
// useIgnition — once-per-session ceremony (D6)
// ---------------------------------------------------------------------------

describe('useIgnition', () => {
  it('plays once when the board is ready, marks the session, ends after 1400ms', () => {
    vi.useFakeTimers();
    stubMatchMedia(false);
    window.sessionStorage.removeItem(IGNITION_FLAG);
    const { result } = renderHook(() => useIgnition(true));
    expect(result.current).toBe(true);
    expect(window.sessionStorage.getItem(IGNITION_FLAG)).toBe('1');
    act(() => {
      vi.advanceTimersByTime(IGNITION_MS);
    });
    expect(result.current).toBe(false);
  });

  it('waits for ready before igniting', () => {
    stubMatchMedia(false);
    window.sessionStorage.removeItem(IGNITION_FLAG);
    const { result, rerender } = renderHook(({ ready }) => useIgnition(ready), {
      initialProps: { ready: false },
    });
    expect(result.current).toBe(false);
    rerender({ ready: true });
    expect(result.current).toBe(true);
  });

  it('never replays within a session (a repeated ceremony is a nuisance)', () => {
    stubMatchMedia(false);
    window.sessionStorage.setItem(IGNITION_FLAG, '1');
    const { result } = renderHook(() => useIgnition(true));
    expect(result.current).toBe(false);
  });

  it('is skipped entirely under prefers-reduced-motion', () => {
    stubMatchMedia(true);
    window.sessionStorage.removeItem(IGNITION_FLAG);
    const { result } = renderHook(() => useIgnition(true));
    expect(result.current).toBe(false);
    // The session is not consumed — flag stays unset.
    expect(window.sessionStorage.getItem(IGNITION_FLAG)).toBeNull();
  });

  it('any input skips the ceremony immediately', () => {
    vi.useFakeTimers();
    stubMatchMedia(false);
    window.sessionStorage.removeItem(IGNITION_FLAG);
    const { result } = renderHook(() => useIgnition(true));
    expect(result.current).toBe(true);
    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
    });
    expect(result.current).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// useDocumentHidden — idle movers pause when the window hides (D7)
// ---------------------------------------------------------------------------

describe('useDocumentHidden', () => {
  it('tracks visibilitychange', () => {
    const { result } = renderHook(() => useDocumentHidden());
    expect(result.current).toBe(false);

    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe(true);

    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe(false);
  });
});
