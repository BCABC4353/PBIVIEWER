/**
 * Luce motion system — D5/D6/D7 of docs/design/FERRARI-DASHBOARD-RND.md.
 *
 * Two named springs as CSS `linear()` strings (the same strings are valid
 * WAAPI `easing` values in Chromium 148), a JS sampler of those curves so
 * numeric elements can retarget mid-flight with mass (an interrupted needle
 * re-aims from its CURRENT position — it never snaps), the once-per-session
 * ignition ceremony, and the document-hidden pause for the idle movers.
 *
 * Pure logic (parser, ticker) is dependency-injectable so it is unit-testable
 * without a real clock or `requestAnimationFrame`; the React hooks are thin.
 */
import { useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// D5 — the two springs and the only four durations
// ---------------------------------------------------------------------------

/**
 * `--spring-needle`: damping ≈ 0.9 with ONE proud overshoot — the mass of a
 * physical needle. Reserved for gauge needles/values and the boot sweep.
 */
export const SPRING_NEEDLE =
  'linear(0, 0.009, 0.035 2.1%, 0.141 4.4%, 0.723 12.9%, 0.938 16.7%, ' +
  '1.017, 1.077, 1.121, 1.149 24.3%, 1.159, 1.163, 1.161, 1.154 29.9%, 1.129 32.8%, ' +
  '1.051 39.6%, 1.017 43.1%, 0.991, 0.977 51%, 0.974 53.8%, 0.975 57.1%, 0.997 69.8%, ' +
  '1.003 76.9%, 1.001 100%)';

/** `--spring-settle`: no visible overshoot — everything functional. */
export const SPRING_SETTLE =
  'linear(0, 0.013, 0.318 6.6%, 0.751 13.6%, 0.918 18.1%, 1.016 23%, ' +
  '1.052 27.2%, 1.057 30.5%, 1.026 38.2%, 0.999 45.4%, 0.995 53%, 1 100%)';

/** The duration scale. No physical move may use any other number. */
export const DUR = {
  /** needle / value moves */ needle: 700,
  /** panel / layout moves */ panel: 400,
  /** control feedback */ control: 250,
  /** press-down */ press: 80,
} as const;

// ---------------------------------------------------------------------------
// linear() sampler — so JS-driven values follow the EXACT same curve as CSS
// ---------------------------------------------------------------------------

export interface LinearStop {
  /** input progress 0..1 */
  t: number;
  /** output value (may overshoot past 1) */
  v: number;
}

/**
 * Parse a CSS `linear(...)` easing string into (progress, value) stops.
 * Entries without an explicit percentage are spread evenly between their
 * nearest positioned neighbours (first defaults to 0%, last to 100%) — the
 * css-easing-2 algorithm, reduced to the single-percentage form used here.
 */
export function parseLinearStops(easing: string): LinearStop[] {
  const inner = easing.replace(/^\s*linear\(/, '').replace(/\)\s*$/, '');
  const raw = inner.split(',').map((entry) => {
    const parts = entry.trim().split(/\s+/);
    const v = Number.parseFloat(parts[0] ?? '0');
    const pct = parts[1];
    return { v, t: pct !== undefined ? Number.parseFloat(pct) / 100 : null };
  });
  if (raw.length === 0) return [{ t: 0, v: 0 }, { t: 1, v: 1 }];
  if (raw[0] && raw[0].t === null) raw[0].t = 0;
  const last = raw[raw.length - 1];
  if (last && last.t === null) last.t = 1;
  // Fill unpositioned runs by even spread between the bracketing stops.
  let i = 0;
  while (i < raw.length) {
    const stop = raw[i];
    if (stop && stop.t === null) {
      let j = i;
      while (j < raw.length && raw[j]?.t === null) j++;
      const prevT = raw[i - 1]?.t ?? 0;
      const nextT = raw[j]?.t ?? 1;
      const span = j - i + 1;
      for (let k = i; k < j; k++) {
        const fill = raw[k];
        if (fill) fill.t = prevT + ((nextT - prevT) * (k - i + 1)) / span;
      }
      i = j;
    } else {
      i++;
    }
  }
  return raw.map((s) => ({ t: s.t ?? 0, v: s.v }));
}

/** Sample a parsed linear() curve at progress p (clamped to [0,1]). */
export function linearEasingAt(stops: LinearStop[], p: number): number {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return p;
  if (p <= first.t) return first.v;
  if (p >= last.t) return last.v;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    if (!a || !b) continue;
    if (p <= b.t) {
      if (b.t === a.t) return b.v;
      const f = (p - a.t) / (b.t - a.t);
      return a.v + (b.v - a.v) * f;
    }
  }
  return last.v;
}

// ---------------------------------------------------------------------------
// Spring ticker — retargetable numeric animation with mass
// ---------------------------------------------------------------------------

export interface SpringTickerOptions {
  initial: number;
  /** ms; defaults to DUR.needle */
  duration?: number;
  /** linear() string; defaults to SPRING_NEEDLE */
  easing?: string;
  onUpdate: (value: number, done: boolean) => void;
  /** injectable clock/scheduler for tests */
  now?: () => number;
  schedule?: (cb: () => void) => number;
  cancel?: (id: number) => void;
}

export interface SpringTicker {
  /** Aim at a new value. Mid-flight calls re-aim from the CURRENT value. */
  retarget(to: number): void;
  /** Jump instantly (reduced motion / teardown-safe). */
  set(value: number): void;
  stop(): void;
  value(): number;
}

export function createSpringTicker(opts: SpringTickerOptions): SpringTicker {
  const duration = opts.duration ?? DUR.needle;
  const stops = parseLinearStops(opts.easing ?? SPRING_NEEDLE);
  const now = opts.now ?? (() => performance.now());
  const schedule = opts.schedule ?? ((cb: () => void) => window.requestAnimationFrame(cb));
  const cancel = opts.cancel ?? ((id: number) => window.cancelAnimationFrame(id));

  let current = opts.initial;
  let from = opts.initial;
  let to = opts.initial;
  let start = 0;
  let frame: number | null = null;

  const tick = (): void => {
    frame = null;
    const p = Math.min((now() - start) / duration, 1);
    const done = p >= 1;
    current = done ? to : from + (to - from) * linearEasingAt(stops, p);
    opts.onUpdate(current, done);
    if (!done) frame = schedule(tick);
  };

  return {
    retarget(next: number): void {
      from = current; // mass: re-aim from wherever we are, never snap
      to = next;
      start = now();
      if (from === to) {
        if (frame !== null) {
          cancel(frame);
          frame = null;
        }
        opts.onUpdate(current, true);
        return;
      }
      if (frame === null) frame = schedule(tick);
    },
    set(value: number): void {
      if (frame !== null) {
        cancel(frame);
        frame = null;
      }
      current = from = to = value;
      opts.onUpdate(value, true);
    },
    stop(): void {
      if (frame !== null) {
        cancel(frame);
        frame = null;
      }
    },
    value: () => current,
  };
}

// ---------------------------------------------------------------------------
// Reduced motion — every animation collapses to instant
// ---------------------------------------------------------------------------

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ---------------------------------------------------------------------------
// WAAPI pulse — the subtle overshoot a retargeting numeral gives off
// ---------------------------------------------------------------------------

/**
 * One sprung scale pulse via WAAPI (`linear()` strings are valid `easing` in
 * Chromium 148). Guarded: jsdom and reduced-motion users get nothing.
 */
export function pulse(el: Element | null, duration: number = DUR.needle): void {
  if (!el || typeof el.animate !== 'function' || prefersReducedMotion()) return;
  el.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.02)', offset: 0.25 },
      { transform: 'scale(1)' },
    ],
    { duration, easing: SPRING_SETTLE },
  );
}

// ---------------------------------------------------------------------------
// useSpringNumber — numeric retargeting hook (D5 / D11 hero ticker)
// ---------------------------------------------------------------------------

export interface SpringNumberOptions {
  duration?: number;
  /** Ignition ceremony: count up from 0 on first mount (D6 stage 2). */
  startFromZero?: boolean;
}

export interface SpringNumberHandle {
  value: number;
  ref: React.RefObject<HTMLDivElement>;
}

export function useSpringNumber(target: number, opts: SpringNumberOptions = {}): SpringNumberHandle {
  const ref = useRef<HTMLDivElement>(null);
  const duration = opts.duration ?? DUR.needle;
  const initial = opts.startFromZero && !prefersReducedMotion() ? 0 : target;
  const [value, setValue] = useState(initial);
  const tickerRef = useRef<SpringTicker | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (prefersReducedMotion()) {
      tickerRef.current?.stop();
      setValue(target);
      return;
    }
    let ticker = tickerRef.current;
    if (!ticker) {
      ticker = createSpringTicker({
        initial,
        duration,
        onUpdate: (v) => setValue(v),
      });
      tickerRef.current = ticker;
    }
    if (!mountedRef.current) {
      mountedRef.current = true;
      if (ticker.value() === target) return; // settled at mount — no motion
    } else {
      pulse(ref.current, duration); // live retarget: WAAPI overshoot pulse
    }
    ticker.retarget(target);
    // `initial` is intentionally first-render-only (ceremony count-up).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  useEffect(() => () => tickerRef.current?.stop(), []);

  return { value, ref };
}

// ---------------------------------------------------------------------------
// useIgnition — the once-per-session ceremony flag (D6)
// ---------------------------------------------------------------------------

export const IGNITION_FLAG = 'luce-ignition-v1';
/** Whole ceremony budget; any input skips it early. */
export const IGNITION_MS = 1400;

function ignitionAlreadyRun(): boolean {
  try {
    return window.sessionStorage.getItem(IGNITION_FLAG) === '1';
  } catch {
    return true; // storage unavailable → never ceremony, never crash
  }
}

function markIgnitionRun(): void {
  try {
    window.sessionStorage.setItem(IGNITION_FLAG, '1');
  } catch {
    /* best-effort */
  }
}

/**
 * Returns true while the ignition ceremony plays. Plays at most once per
 * session (sessionStorage flag), never under reduced motion, and any input
 * (pointer, key, wheel) ends it immediately. The ceremony only ADDS staged
 * entrance classes — content is always present beneath it, never gated.
 *
 * Eligibility is decided synchronously on the FIRST render so the very first
 * frame that shows the board already carries the ceremony (the hero counts
 * up from 0 on its mount render — an effect would arrive one commit late).
 */
export function useIgnition(ready: boolean): boolean {
  const eligibleRef = useRef<boolean | null>(null);
  if (eligibleRef.current === null) {
    eligibleRef.current = !prefersReducedMotion() && !ignitionAlreadyRun();
  }
  const [ended, setEnded] = useState(false);
  const igniting = eligibleRef.current && ready && !ended;

  useEffect(() => {
    if (!igniting) return;
    markIgnitionRun();
    const end = (): void => setEnded(true);
    const timer = window.setTimeout(end, IGNITION_MS);
    window.addEventListener('pointerdown', end);
    window.addEventListener('keydown', end);
    window.addEventListener('wheel', end);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', end);
      window.removeEventListener('keydown', end);
      window.removeEventListener('wheel', end);
    };
  }, [igniting]);

  return igniting;
}

// ---------------------------------------------------------------------------
// useDocumentHidden — a parked car doesn't idle its tach (D7)
// ---------------------------------------------------------------------------

export function useDocumentHidden(): boolean {
  const [hidden, setHidden] = useState(typeof document !== 'undefined' && document.hidden);
  useEffect(() => {
    const onVisibility = (): void => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  return hidden;
}
