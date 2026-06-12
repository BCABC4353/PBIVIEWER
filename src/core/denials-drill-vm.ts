import {
  MORPH_SPRING,
  springPosition,
  analyticVelocity,
  morphProgressFromSpring,
  positionAfterReversal,
  velocityAfterReversal,
  type DampedSpringParams,
  type MorphKeyframe,
  type ReversalState,
} from './morph-choreo';
import type { LedgerNode, LedgerTree } from './ledger-logic';

export type DrillPhase = 'idle' | 'drilling' | 'reversing' | 'open';

export interface DrillLeafRow {
  code: string;
  description: string;
  claims: number;
  deniedDollars: string;
}

export interface DrillSlicePoint {
  label: string;
  value: number;
}

export interface DrillPayload {
  payor: string;
  category: string;
  categoryIndex: number;
  slicePoints: DrillSlicePoint[];
  leafRows: DrillLeafRow[];
  totalClaims: number;
  totalDenied: string;
}

export interface DrillAnimState {
  phase: DrillPhase;
  progress: number;
  startTimeSec: number;
  reversal: ReversalState | null;
  reduceMotion: boolean;
}

export interface DrillVm {
  payload: DrillPayload | null;
  anim: DrillAnimState;
  keyframe: MorphKeyframe;
}

const IDLE_KF: MorphKeyframe = {
  origin: { rect: { x: 0, y: 0, w: 1, h: 48 }, cornerRadius: 0 },
  target: { rect: { x: 0, y: 0, w: 1, h: 1 }, cornerRadius: 0 },
};

function makeReversalAt(
  params: DampedSpringParams,
  pos: number,
  vel: number,
  nowSec: number,
): ReversalState {
  return { params, reversalTimeSec: nowSec, posAtReversal: pos, velAtReversal: vel };
}

export function makeIdleAnim(reduceMotion: boolean): DrillAnimState {
  return {
    phase: 'idle',
    progress: 0,
    startTimeSec: 0,
    reversal: null,
    reduceMotion,
  };
}

function drillSpringAtTime(
  anim: DrillAnimState,
  nowSec: number,
  params: DampedSpringParams,
): { pos: number; vel: number } {
  if (anim.reversal !== null) {
    return {
      pos: positionAfterReversal(anim.reversal, nowSec),
      vel: velocityAfterReversal(anim.reversal, nowSec),
    };
  }
  const elapsed = nowSec - anim.startTimeSec;
  return {
    pos: springPosition(params, 1, 0, elapsed),
    vel: analyticVelocity(params, 1, 0, elapsed),
  };
}

function revProgressAtTime(anim: DrillAnimState, nowSec: number): number {
  if (anim.reversal === null) return anim.progress;
  return Math.max(0, Math.min(1, positionAfterReversal(anim.reversal, nowSec)));
}

export function startDrill(
  prevAnim: DrillAnimState,
  nowSec: number,
  keyframe: MorphKeyframe,
  params: DampedSpringParams = MORPH_SPRING,
): DrillAnimState {
  if (prevAnim.reduceMotion) {
    return { ...prevAnim, phase: 'open', progress: 1, startTimeSec: nowSec, reversal: null };
  }

  if (prevAnim.phase === 'reversing') {
    const progNow = revProgressAtTime(prevAnim, nowSec);
    const revVel = prevAnim.reversal !== null
      ? velocityAfterReversal(prevAnim.reversal, nowSec)
      : 0;
    const springPos = 1 - progNow;
    const springVel = -revVel;
    const newRev = makeReversalAt(params, springPos, springVel, nowSec);
    return {
      phase: 'drilling',
      progress: progNow,
      startTimeSec: nowSec,
      reversal: newRev,
      reduceMotion: prevAnim.reduceMotion,
    };
  }

  return {
    phase: 'drilling',
    progress: 0,
    startTimeSec: nowSec,
    reversal: null,
    reduceMotion: prevAnim.reduceMotion,
  };
}

export function startReversal(
  prevAnim: DrillAnimState,
  nowSec: number,
  params: DampedSpringParams = MORPH_SPRING,
): DrillAnimState {
  if (prevAnim.reduceMotion) {
    return { ...prevAnim, phase: 'idle', progress: 0, startTimeSec: nowSec, reversal: null };
  }

  if (prevAnim.phase === 'open') {
    const state = makeReversalAt(params, 1.0, 0.0, nowSec);
    return {
      phase: 'reversing',
      progress: 1,
      startTimeSec: nowSec,
      reversal: state,
      reduceMotion: prevAnim.reduceMotion,
    };
  }

  if (prevAnim.phase === 'drilling') {
    const { pos: springPos, vel: springVel } = drillSpringAtTime(prevAnim, nowSec, params);
    const progNow = Math.max(0, Math.min(1, 1 - springPos));
    const revPos = progNow;
    const revVel = -springVel;
    const state = makeReversalAt(params, revPos, revVel, nowSec);
    return {
      phase: 'reversing',
      progress: progNow,
      startTimeSec: nowSec,
      reversal: state,
      reduceMotion: prevAnim.reduceMotion,
    };
  }

  return { ...prevAnim, phase: 'idle', progress: 0, startTimeSec: nowSec, reversal: null };
}

export function tickAnim(
  anim: DrillAnimState,
  nowSec: number,
  params: DampedSpringParams = MORPH_SPRING,
): DrillAnimState {
  if (anim.reduceMotion) return anim;

  if (anim.phase === 'drilling') {
    const { pos: springPos } = drillSpringAtTime(anim, nowSec, params);
    const progress = Math.max(0, Math.min(1, 1 - springPos));
    const phase: DrillPhase = progress >= 0.999 ? 'open' : 'drilling';
    return { ...anim, progress, phase };
  }

  if (anim.phase === 'reversing') {
    const progress = revProgressAtTime(anim, nowSec);
    const phase: DrillPhase = progress <= 0.001 ? 'idle' : 'reversing';
    return { ...anim, progress, phase };
  }

  return anim;
}

export function morphProgressFromAnim(anim: DrillAnimState): number {
  return anim.progress;
}

export function buildDrillPayload(
  node: LedgerNode,
  tree: LedgerTree,
  categoryIndex: number,
): DrillPayload {
  const payor = node.key;
  const category = node.fullPath[0] ?? '';

  const slicePoints: DrillSlicePoint[] = node.children.length > 0
    ? node.children.map((child) => ({ label: child.key, value: child.value }))
    : [{ label: payor, value: node.value }];

  const leafRows: DrillLeafRow[] = node.children.length > 0
    ? node.children.map((child) => ({
        code: child.key,
        description: child.key,
        claims: child.value,
        deniedDollars: '$' + child.value.toLocaleString('en-US'),
      }))
    : [{
        code: node.key,
        description: node.key,
        claims: node.value,
        deniedDollars: '$' + node.value.toLocaleString('en-US'),
      }];

  const totalClaims = leafRows.reduce((s, r) => s + r.claims, 0);
  const totalDenied = '$' + totalClaims.toLocaleString('en-US');

  return {
    payor,
    category,
    categoryIndex,
    slicePoints,
    leafRows,
    totalClaims,
    totalDenied,
  };
}

export function buildDrillKeyframe(
  rowY: number,
  rowHeight: number,
  screenWidth: number,
  screenHeight: number,
): MorphKeyframe {
  return {
    origin: {
      rect: { x: 0, y: rowY, w: screenWidth, h: rowHeight },
      cornerRadius: 0,
    },
    target: {
      rect: { x: 0, y: 0, w: screenWidth, h: screenHeight },
      cornerRadius: 0,
    },
  };
}

export function buildDrillVm(
  node: LedgerNode | null,
  tree: LedgerTree,
  categoryIndex: number,
  anim: DrillAnimState,
  rowY: number,
  rowHeight: number,
  screenWidth: number,
  screenHeight: number,
): DrillVm {
  const payload = node !== null ? buildDrillPayload(node, tree, categoryIndex) : null;
  const keyframe = node !== null
    ? buildDrillKeyframe(rowY, rowHeight, screenWidth, screenHeight)
    : IDLE_KF;
  return { payload, anim, keyframe };
}

export { MORPH_SPRING };
