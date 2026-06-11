

let ignitionPlayed = false;

export function ignitionHasPlayed(): boolean {
  return ignitionPlayed;
}

export function markIgnitionPlayed(): void {
  ignitionPlayed = true;
}

export function resetIgnitionForTests(): void {
  ignitionPlayed = false;
}


export const SWEEP_DEGREES = 270;

export const SWEEP_START_DEGREES = 135;

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export interface ArcSpan {
  circumference: number;
  arcLength: number;
}

export function arcSpan(radius: number): ArcSpan {
  if (!(radius > 0)) throw new Error('arc radius must be > 0');
  const circumference = 2 * Math.PI * radius;
  return { circumference, arcLength: circumference * (SWEEP_DEGREES / 360) };
}

export function arcDashArray(span: ArcSpan): string {
  return `${span.arcLength} ${span.circumference}`;
}

export function dashOffsetForFraction(span: ArcSpan, fraction: number): number {
  return span.arcLength * (1 - clamp01(fraction));
}


export const MAX_NEEDLE_FRACTION = 1.12;

export function needleAngleDeg(fraction: number): number {
  const f = Number.isFinite(fraction)
    ? Math.min(MAX_NEEDLE_FRACTION, Math.max(0, fraction))
    : 0;
  return SWEEP_START_DEGREES + f * SWEEP_DEGREES;
}

export interface GaugeTick {
  fraction: number;
  angleDeg: number;
  major: boolean;
}

export const TICK_MINOR_STEP_DEG = 6.75;
export const TICK_MAJOR_EVERY_NTH = 5;

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

export function polarPoint(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number,
): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
}


export const IGNITION_KEYSET_MS = 120;
export const IGNITION_REVEAL_MS = 950;
export const IGNITION_FADE_MS = 300;
export const IGNITION_TOTAL_MS = IGNITION_REVEAL_MS + IGNITION_FADE_MS;

export const IGNITION_SPRING = { mass: 1, stiffness: 158, damping: 16.5 } as const;

export interface SpringPhysicsLike {
  mass: number;
  stiffness: number;
  damping: number;
}

export function springOvershootFraction(s: SpringPhysicsLike): number {
  const zeta = s.damping / (2 * Math.sqrt(s.stiffness * s.mass));
  if (!(zeta > 0)) throw new Error('spring must be damped');
  if (zeta >= 1) return 0;
  return Math.exp((-zeta * Math.PI) / Math.sqrt(1 - zeta * zeta));
}
