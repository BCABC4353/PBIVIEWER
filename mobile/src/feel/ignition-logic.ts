/**
 * ignition-logic — the PURE brain of the Ignition ceremony (see
 * IgnitionSweep.tsx for the RN shell, src/feel/README.md "Ignition" for the
 * concept). Same contract as motionCore.ts: no react-native, no expo imports,
 * ever — everything here runs in plain node and is covered by
 * ignition-logic.test.ts.
 *
 * Four pure concerns live here:
 *   1. Once-per-launch latch — the ceremony plays exactly once per JS bundle
 *   2. Arc math             — gauge geometry for the SVG dash trick
 *   3. Instrument geometry  — needle throw, graduated tick marks
 *   4. Ceremony choreography — spring + timeline constants (D6: ≤ 1400 ms)
 */

// ---------------------------------------------------------------------------
// 1. Once-per-launch latch
// ---------------------------------------------------------------------------
//
// Module-level state ON PURPOSE: it survives component unmount/remount (tab
// switches, back-navigation, pull-to-refresh, data-mode switches) and resets
// ONLY when the JS bundle restarts — i.e. a cold app launch. "A ceremony
// repeated becomes a nuisance: never replay on navigation" (D6).

let ignitionPlayed = false;

/** Has the launch ceremony already played in this JS bundle's lifetime? */
export function ignitionHasPlayed(): boolean {
  return ignitionPlayed;
}

/** Latch the ceremony as played. Idempotent; there is no un-play. */
export function markIgnitionPlayed(): void {
  ignitionPlayed = true;
}

/** Test-only escape hatch — production code must never reset the latch. */
export function resetIgnitionForTests(): void {
  ignitionPlayed = false;
}

// ---------------------------------------------------------------------------
// 2. Arc math — a 270° tachometer arc, gap at the bottom
// ---------------------------------------------------------------------------

/** Angular span of the gauge arc. 270° like a car tachometer; gap faces down. */
export const SWEEP_DEGREES = 270;

/**
 * Angle (SVG degrees: 0° = 3 o'clock, clockwise positive) of the needle's
 * rest position. 135° puts zero at 7:30 and full throw at 4:30 — the classic
 * gauge stance.
 */
export const SWEEP_START_DEGREES = 135;

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export interface ArcSpan {
  /** Full circle circumference at the given radius. */
  circumference: number;
  /** Length along the circumference covered by the visible 270° sweep. */
  arcLength: number;
}

export function arcSpan(radius: number): ArcSpan {
  if (!(radius > 0)) throw new Error('arc radius must be > 0');
  const circumference = 2 * Math.PI * radius;
  return { circumference, arcLength: circumference * (SWEEP_DEGREES / 360) };
}

/**
 * strokeDasharray for the arc: one dash exactly as long as the 270° sweep,
 * then a gap longer than the rest of the circle so nothing wraps around.
 */
export function arcDashArray(span: ArcSpan): string {
  return `${span.arcLength} ${span.circumference}`;
}

/**
 * strokeDashoffset revealing `fraction` (0..1) of the sweep — the glow trail
 * chases THIS: offset arcLength → 0 as the needle sweeps 0 → 1.
 */
export function dashOffsetForFraction(span: ArcSpan, fraction: number): number {
  return span.arcLength * (1 - clamp01(fraction));
}

// ---------------------------------------------------------------------------
// 3. Instrument geometry — needle throw + graduated ticks
// ---------------------------------------------------------------------------

/**
 * Hard mechanical stop for the needle, a little past the end of the throw so
 * the spring's overshoot has somewhere real to go — but a wild value can never
 * spin the needle into the gauge's bottom gap.
 */
export const MAX_NEEDLE_FRACTION = 1.12;

/** Needle angle (SVG degrees) for a sweep fraction; overshoot allowed, capped. */
export function needleAngleDeg(fraction: number): number {
  const f = Number.isFinite(fraction)
    ? Math.min(MAX_NEEDLE_FRACTION, Math.max(0, fraction))
    : 0;
  return SWEEP_START_DEGREES + f * SWEEP_DEGREES;
}

export interface GaugeTick {
  /** Position along the throw, 0 (rest) .. 1 (end-stop). */
  fraction: number;
  /** Absolute SVG angle of the tick. */
  angleDeg: number;
  /** Major ticks are longer/brighter — the graduation hierarchy. */
  major: boolean;
}

/** Minor graduations every 6.75° → 41 ticks across the 270° throw. */
export const TICK_MINOR_STEP_DEG = 6.75;
/** Every 5th tick is major → 9 majors, like a 0–8 tachometer. */
export const TICK_MAJOR_EVERY_NTH = 5;

/** The graduated tick arc: minors with a major every Nth, ends always major. */
export function gaugeTicks(
  minorStepDeg: number = TICK_MINOR_STEP_DEG,
  majorEveryNth: number = TICK_MAJOR_EVERY_NTH,
): GaugeTick[] {
  if (!(minorStepDeg > 0) || minorStepDeg > SWEEP_DEGREES) {
    throw new Error('minorStepDeg must be > 0 and fit inside the sweep');
  }
  if (!Number.isInteger(majorEveryNth) || majorEveryNth < 1) {
    throw new Error('majorEveryNth must be a positive integer');
  }
  const count = Math.round(SWEEP_DEGREES / minorStepDeg);
  const ticks: GaugeTick[] = [];
  for (let i = 0; i <= count; i++) {
    const fraction = i / count;
    ticks.push({
      fraction,
      angleDeg: SWEEP_START_DEGREES + fraction * SWEEP_DEGREES,
      major: i % majorEveryNth === 0,
    });
  }
  return ticks;
}

/** Point on a circle — tick endpoints, needle tip/tail. */
export function polarPoint(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number,
): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
}

// ---------------------------------------------------------------------------
// 4. Ceremony choreography — one continuous sweep, then the veil lifts
// ---------------------------------------------------------------------------
//
// Timeline (D6: total ≤ 1400 ms, once per launch):
//   0 .. KEYSET            — light arrives first: the dial fades in
//   KEYSET .. ~820         — ONE underdamped spring: accelerate to full throw,
//                            slight overshoot (the apex — the one haptic),
//                            settle. Never staged hops, never retargeted.
//   REVEAL .. REVEAL+FADE  — the veil fades out, revealing content (or
//                            skeletons) already laid out beneath it.

/** Dial fade-in before the needle moves — illumination before motion. */
export const IGNITION_KEYSET_MS = 120;
/** When the veil starts lifting (sweep has settled by here). */
export const IGNITION_REVEAL_MS = 950;
/** Veil fade duration — content is visible from this moment on. */
export const IGNITION_FADE_MS = 300;
/** Full ceremony budget. MUST stay ≤ 1400 ms (D6). */
export const IGNITION_TOTAL_MS = IGNITION_REVEAL_MS + IGNITION_FADE_MS;

/**
 * The needle's spring: one continuous underdamped sweep 0 → 1. ζ ≈ 0.66 →
 * a single ~6.5% overshoot (≈ 18° of proud needle mass past the end-stop),
 * settled well inside the reveal window.
 */
export const IGNITION_SPRING = { mass: 1, stiffness: 158, damping: 16.5 } as const;

export interface SpringPhysicsLike {
  mass: number;
  stiffness: number;
  damping: number;
}

/**
 * First-overshoot magnitude of an underdamped spring released at 0 toward 1:
 * exp(−ζπ/√(1−ζ²)). Returns 0 for critically/over-damped springs (no apex).
 */
export function springOvershootFraction(s: SpringPhysicsLike): number {
  const zeta = s.damping / (2 * Math.sqrt(s.stiffness * s.mass));
  if (!(zeta > 0)) throw new Error('spring must be damped');
  if (zeta >= 1) return 0;
  return Math.exp((-zeta * Math.PI) / Math.sqrt(1 - zeta * zeta));
}
