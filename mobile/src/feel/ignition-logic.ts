/**
 * ignition-logic — the PURE brain of the Ignition Sweep (see IgnitionSweep.tsx
 * for the RN shell, README.md "Ignition Sweep" for the concept). Same contract
 * as motionCore.ts: no react-native, no expo imports, ever — everything here
 * runs in plain node and is covered by ignition-logic.test.ts.
 *
 * Three pure concerns live here:
 *   1. Arc math       — gauge geometry for the SVG dash trick
 *   2. Detent logic   — "did real items land?" → how many haptic ticks
 *   3. Settle machine — sweeping → settled (clean) | caught (failures)
 */

// ---------------------------------------------------------------------------
// 1. Arc math — a 270° tachometer arc, gap at the bottom
// ---------------------------------------------------------------------------

/** Angular span of the gauge arc. 270° like a car tachometer; gap faces down. */
export const SWEEP_DEGREES = 270;

/**
 * Rotation applied to the SVG so the arc's zero sits at lower-left.
 * SVG dash arcs start at 3 o'clock (0°); +135° puts the start at 7:30 and the
 * end at 4:30 — the classic gauge stance.
 */
export const SWEEP_START_DEGREES = 135;

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export interface ArcGeometry {
  /** Center of the circle (== size / 2 on both axes). */
  center: number;
  /** Radius of the stroke centerline — inset so the stroke never clips. */
  radius: number;
  /** Full circle circumference at that radius. */
  circumference: number;
  /** Length along the circumference covered by the visible 270° sweep. */
  arcLength: number;
}

export function arcGeometry(size: number, strokeWidth: number): ArcGeometry {
  if (!(size > 0)) throw new Error('arc size must be > 0');
  if (!(strokeWidth > 0) || strokeWidth * 2 > size) {
    throw new Error('strokeWidth must be > 0 and fit inside size');
  }
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * (SWEEP_DEGREES / 360);
  return { center, radius, circumference, arcLength };
}

/**
 * strokeDasharray for the arc: one dash exactly as long as the 270° sweep,
 * then a gap longer than the rest of the circle so nothing wraps around.
 */
export function arcDashArray(geometry: ArcGeometry): string {
  return `${geometry.arcLength} ${geometry.circumference}`;
}

/**
 * strokeDashoffset revealing `fraction` (0..1) of the sweep. The Animated
 * value chasing progress interpolates THIS: offset arcLength → 0 as the
 * needle sweeps 0 → 1.
 */
export function dashOffsetForFraction(geometry: ArcGeometry, fraction: number): number {
  return geometry.arcLength * (1 - clamp01(fraction));
}

// ---------------------------------------------------------------------------
// 2. Detent logic — ticks only for REAL increments
// ---------------------------------------------------------------------------

/**
 * How many new items landed between two `itemsChecked` readings. Detents are
 * honest: a tick may ONLY be caused by a real API response landing, so
 * decreases (host reset) and garbage inputs yield zero — never a phantom tick.
 * The caller collapses any positive count into ONE gated detent() call (the
 * haptic layer rate-limits; a completion batch is one click, not a machine gun).
 */
export function detentTicks(prevChecked: number, nextChecked: number): number {
  if (!Number.isFinite(prevChecked) || !Number.isFinite(nextChecked)) return 0;
  const delta = Math.floor(nextChecked) - Math.floor(prevChecked);
  return delta > 0 ? delta : 0;
}

// ---------------------------------------------------------------------------
// 3. Settle-state machine
// ---------------------------------------------------------------------------

export type SweepPhase = 'sweeping' | 'settled' | 'caught';

export interface SweepState {
  phase: SweepPhase;
  /** Where the needle froze when the sweep caught; null unless phase==='caught'. */
  catchAt: number | null;
}

export type SweepHaptic = 'confirm' | 'fault' | null;

export interface SweepTransition {
  state: SweepState;
  /** Haptic to fire ON this transition (each fires at most once, ever). */
  haptic: SweepHaptic;
  /** True exactly on the sweeping→settled transition (host's onSettled cue). */
  justSettled: boolean;
  /** True exactly on the sweeping→caught transition (host's onCaught cue). */
  justCaught: boolean;
}

/**
 * A caught needle never lands flush on the end-stop: a full 270° sweep is the
 * visual signature of a CLEAN load, so the catch position is capped just shy
 * of it. With per-item progress the needle catches proportionally where the
 * failure surfaced; with a single-resolve DataSource (failed only known at
 * progress 1) it halts here — visibly short of complete.
 */
export const CATCH_CEILING = 0.92;

export function initialSweepState(): SweepState {
  return { phase: 'sweeping', catchAt: null };
}

/**
 * Advance the machine with the latest host readings. Terminal states
 * ('settled', 'caught') are absorbing: progress regressions or a late `failed`
 * flip can never un-settle a finished sweep — the gauge already spoke.
 *
 *   sweeping + failed          → caught  (fault haptic, needle freezes)
 *   sweeping + progress >= 1   → settled (confirm haptic as the hero lands)
 *   anything else              → keep sweeping
 */
export function advanceSweep(state: SweepState, progress: number, failed: boolean): SweepTransition {
  if (state.phase !== 'sweeping') {
    return { state, haptic: null, justSettled: false, justCaught: false };
  }
  const p = clamp01(progress);
  if (failed) {
    return {
      state: { phase: 'caught', catchAt: Math.min(p, CATCH_CEILING) },
      haptic: 'fault',
      justSettled: false,
      justCaught: true,
    };
  }
  if (p >= 1) {
    return {
      state: { phase: 'settled', catchAt: null },
      haptic: 'confirm',
      justSettled: true,
      justCaught: false,
    };
  }
  return { state, haptic: null, justSettled: false, justCaught: false };
}

/** Where the Animated value should chase to for a given state + live progress. */
export function arcTargetFraction(state: SweepState, progress: number): number {
  switch (state.phase) {
    case 'settled':
      return 1;
    case 'caught':
      return state.catchAt ?? CATCH_CEILING;
    case 'sweeping':
      return clamp01(progress);
  }
}
