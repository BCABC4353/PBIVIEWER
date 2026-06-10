/**
 * motionCore — the PURE logic of the feel layer. No react-native, no expo
 * imports, ever: everything in here must run in plain node so it can be
 * unit-tested (see motionCore.test.ts). The RN-facing modules (springs.ts,
 * haptics.ts, primitives.tsx) are thin shells over these functions.
 */

// ---------------------------------------------------------------------------
// Spring translation: SwiftUI .spring(response:dampingFraction:) → RN Animated
// ---------------------------------------------------------------------------
//
// The craft spec (IOS-CRAFT-SPEC.md §4.1) gives springs as SwiftUI
// response/dampingFraction pairs. RN's Animated.spring supports three input
// vocabularies; we use the PHYSICAL one (stiffness/damping/mass) because it
// solves the identical damped-harmonic-oscillator model as CASpringAnimation
// (verified in react-native/Libraries/Animated/animations/SpringAnimation.js:
// ζ = damping / 2√(stiffness·mass), ω0 = √(stiffness/mass)).
//
// The mapping is therefore EXACT, not an approximation:
//   ω0        = 2π / response                 (undamped angular frequency)
//   stiffness = ω0² · mass                    (mass = 1)
//   damping   = dampingFraction · 2 · √(stiffness · mass)
//
// e.g. SwiftUI response 0.45 / damping 0.86 → stiffness ≈ 194.96, damping ≈ 24.02.

export interface SpringPhysics {
  stiffness: number;
  damping: number;
  mass: number;
}

/** Translate SwiftUI's (response seconds, dampingFraction 0..1) to RN spring physics. */
export function springFromResponse(responseSec: number, dampingFraction: number): SpringPhysics {
  if (responseSec <= 0) throw new Error('spring response must be > 0');
  if (dampingFraction <= 0) throw new Error('spring dampingFraction must be > 0');
  const mass = 1;
  const omega0 = (2 * Math.PI) / responseSec;
  const stiffness = omega0 * omega0 * mass;
  const damping = dampingFraction * 2 * Math.sqrt(stiffness * mass);
  return { stiffness, damping, mass };
}

// ---------------------------------------------------------------------------
// Stagger — per-item entrance delay
// ---------------------------------------------------------------------------

/**
 * Delay (ms) for the nth item of a staggered entrance. Clamped so a long list
 * never makes the last rows feel broken/late — after `maxItems` steps every
 * remaining item arrives together (one accent of motion, not a parade).
 */
export function staggerDelay(index: number, stepMs: number, maxItems = 8): number {
  if (!Number.isFinite(index) || index <= 0) return 0;
  return Math.min(Math.floor(index), maxItems) * stepMs;
}

// ---------------------------------------------------------------------------
// Rate limiter — the detent gate
// ---------------------------------------------------------------------------

/**
 * Leading-edge rate limiter: returns a gate function that yields true at most
 * `maxPerSecond` times per second. Used so scrub detents feel like machined
 * clicks under the finger and never buzz-saw the Taptic engine.
 *
 * `now` is injectable for tests (defaults to Date.now).
 */
export function createRateLimiter(maxPerSecond: number, now: () => number = Date.now): () => boolean {
  if (maxPerSecond <= 0) throw new Error('maxPerSecond must be > 0');
  const minIntervalMs = 1000 / maxPerSecond;
  let last = -Infinity;
  return () => {
    const t = now();
    if (t - last < minIntervalMs) return false;
    last = t;
    return true;
  };
}

// ---------------------------------------------------------------------------
// Reduce Motion cache — sync answer, async truth
// ---------------------------------------------------------------------------

export interface ReduceMotionSource {
  /** Async read of the OS setting (AccessibilityInfo.isReduceMotionEnabled). */
  getInitial: () => Promise<boolean>;
  /** Subscribe to changes; returns an unsubscribe fn. */
  subscribe: (onChange: (reduceMotion: boolean) => void) => () => void;
}

export interface ReduceMotionCache {
  /** Synchronous: true when full motion is allowed (Reduce Motion is OFF). */
  motionEnabled: () => boolean;
  /** Resolves once the initial async OS read has landed in the cache. */
  ready: Promise<void>;
  /** Tear down the OS subscription. */
  dispose: () => void;
}

/**
 * Animations need a SYNCHRONOUS answer at the moment they start, but the OS
 * setting is only readable async. Strategy: optimistically assume motion is
 * enabled (the common case), resolve the truth once, then stay correct forever
 * via subscription. Worst case is one full-motion animation in the first
 * frames for a Reduce Motion user — never the reverse lock-in.
 */
export function createReduceMotionCache(source: ReduceMotionSource): ReduceMotionCache {
  let reduceMotion = false;
  let disposed = false;

  const ready = source
    .getInitial()
    .then((value) => {
      if (!disposed) reduceMotion = value;
    })
    .catch(() => {
      /* unreadable (web/simulator edge) → keep optimistic default */
    });

  const unsubscribe = source.subscribe((value) => {
    if (!disposed) reduceMotion = value;
  });

  return {
    motionEnabled: () => !reduceMotion,
    ready,
    dispose: () => {
      disposed = true;
      try {
        unsubscribe();
      } catch {
        /* no-op */
      }
    },
  };
}

// ---------------------------------------------------------------------------
// AnimatedNumber formatting pipeline (pure)
// ---------------------------------------------------------------------------

export type NumberFormat = (n: number) => string;

/**
 * Default AnimatedNumber format: round to integer, group thousands with a
 * narrow comma. Deterministic (no locale dependence) so digits are stable
 * under tabular-nums and snapshots don't drift across devices.
 */
export function defaultNumberFormat(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  const digits = Math.abs(rounded).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return sign + grouped;
}

/**
 * The text shown for an in-flight animated value: clamp solver noise to the
 * [from, to] envelope (an easing/spring solver can micro-overshoot, and a
 * count-up must never print past its destination or before its origin), then
 * run it through the formatter. Pure so the count-up pipeline tests headless.
 */
export function formatAnimatedValue(
  current: number,
  from: number,
  to: number,
  format: NumberFormat = defaultNumberFormat,
): string {
  if (!Number.isFinite(current)) return format(to);
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  return format(Math.min(hi, Math.max(lo, current)));
}
