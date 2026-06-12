import { springFromResponse } from '../feel/motion-core';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MorphGeometry {
  rect: Rect;
  cornerRadius: number;
}

export interface MorphKeyframe {
  origin: MorphGeometry;
  target: MorphGeometry;
}

export interface SpringState {
  position: number;
  velocity: number;
}

export interface DampedSpringParams {
  stiffness: number;
  damping: number;
  mass: number;
}

const MORPH_SPRING = springFromResponse(0.42, 0.82);

function lerpRect(a: Rect, b: Rect, t: number): Rect {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    w: a.w + (b.w - a.w) * t,
    h: a.h + (b.h - a.h) * t,
  };
}

export function interpolateMorph(keyframe: MorphKeyframe, progress: number): MorphGeometry {
  const t = Math.max(0, Math.min(1, progress));
  return {
    rect: lerpRect(keyframe.origin.rect, keyframe.target.rect, t),
    cornerRadius:
      keyframe.origin.cornerRadius + (keyframe.target.cornerRadius - keyframe.origin.cornerRadius) * t,
  };
}

export function springPosition(
  params: DampedSpringParams,
  x0: number,
  v0: number,
  tSec: number,
): number {
  const { stiffness, damping, mass } = params;
  const omega0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));

  if (tSec < 0) return x0;

  if (zeta < 1) {
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
    const A = x0;
    const B = (v0 + zeta * omega0 * x0) / omegaD;
    const decay = Math.exp(-zeta * omega0 * tSec);
    return decay * (A * Math.cos(omegaD * tSec) + B * Math.sin(omegaD * tSec));
  }

  if (zeta === 1) {
    const decay = Math.exp(-omega0 * tSec);
    return decay * (x0 + (v0 + omega0 * x0) * tSec);
  }

  const omegaPlus = -omega0 * (zeta + Math.sqrt(zeta * zeta - 1));
  const omegaMinus = -omega0 * (zeta - Math.sqrt(zeta * zeta - 1));
  const C2 = (v0 - omegaPlus * x0) / (omegaMinus - omegaPlus);
  const C1 = x0 - C2;
  return C1 * Math.exp(omegaPlus * tSec) + C2 * Math.exp(omegaMinus * tSec);
}

export function springVelocity(
  params: DampedSpringParams,
  x0: number,
  v0: number,
  tSec: number,
): number {
  const dt = 1e-6;
  const t1 = tSec + dt;
  const t0 = Math.max(0, tSec - dt);
  const actualDt = t1 - t0;
  const p1 = springPosition(params, x0, v0, t1);
  const p0 = springPosition(params, x0, v0, t0);
  return (p1 - p0) / actualDt;
}

export interface ReversalState {
  params: DampedSpringParams;
  reversalTimeSec: number;
  posAtReversal: number;
  velAtReversal: number;
}

export function buildReversalState(
  params: DampedSpringParams,
  forwardX0: number,
  forwardV0: number,
  tRevSec: number,
): ReversalState {
  const pos = springPosition(params, forwardX0, forwardV0, tRevSec);
  const vel = springVelocity(params, forwardX0, forwardV0, tRevSec);
  return { params, reversalTimeSec: tRevSec, posAtReversal: pos, velAtReversal: vel };
}

export function positionAfterReversal(state: ReversalState, tAbsSec: number): number {
  const dt = Math.max(0, tAbsSec - state.reversalTimeSec);
  return springPosition(state.params, state.posAtReversal, state.velAtReversal, dt);
}

export function velocityAfterReversal(state: ReversalState, tAbsSec: number): number {
  const dt = Math.max(0, tAbsSec - state.reversalTimeSec);
  return springVelocity(state.params, state.posAtReversal, state.velAtReversal, dt);
}

export function morphProgressFromSpring(
  params: DampedSpringParams,
  x0: number,
  v0: number,
  tSec: number,
): number {
  const raw = 1 - springPosition(params, x0, v0, tSec);
  return Math.max(0, Math.min(1, raw));
}

export { MORPH_SPRING };
