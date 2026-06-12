import { describe, it, expect } from 'vitest';
import {
  makeIdleAnim,
  startDrill,
  startReversal,
  tickAnim,
  morphProgressFromAnim,
  MORPH_SPRING,
  type DrillAnimState,
} from './denials-drill-vm';
import {
  springPosition,
  analyticVelocity,
  positionAfterReversal,
  velocityAfterReversal,
  buildReversalState,
  type MorphKeyframe,
} from './morph-choreo';

const KF: MorphKeyframe = {
  origin: { rect: { x: 0, y: 100, w: 390, h: 48 }, cornerRadius: 0 },
  target: { rect: { x: 0, y: 0, w: 390, h: 844 }, cornerRadius: 0 },
};

function progressAt(anim: DrillAnimState, tSec: number): number {
  return tickAnim(anim, tSec).progress;
}

function forwardSlope(anim: DrillAnimState, tSec: number, h: number): number {
  return (progressAt(anim, tSec + h) - progressAt(anim, tSec)) / h;
}

function backwardSlope(anim: DrillAnimState, tSec: number, h: number): number {
  return (progressAt(anim, tSec) - progressAt(anim, tSec - h)) / h;
}

describe('tickAnim — forward drilling progress', () => {
  it('progress grows from 0 toward 1 over time', () => {
    const drilled = startDrill(makeIdleAnim(false), 0, KF);
    const t1 = tickAnim(drilled, 0.05);
    const t2 = tickAnim(drilled, 0.2);
    expect(t1.progress).toBeGreaterThan(0);
    expect(t2.progress).toBeGreaterThan(t1.progress);
  });

  it('reaches open phase as progress nears 1', () => {
    const drilled = startDrill(makeIdleAnim(false), 0, KF);
    const settled = tickAnim(drilled, 3);
    expect(settled.phase).toBe('open');
    expect(settled.progress).toBeCloseTo(1, 2);
  });

  it('progress is bounded [0,1]', () => {
    const drilled = startDrill(makeIdleAnim(false), 0, KF);
    for (let t = 0; t <= 5; t += 0.1) {
      const a = tickAnim(drilled, t);
      expect(a.progress).toBeGreaterThanOrEqual(0);
      expect(a.progress).toBeLessThanOrEqual(1);
    }
  });
});

describe('tickAnim — reversing progress decreases toward 0', () => {
  it('progress decreases from 1 and eventually reaches idle', () => {
    const open: DrillAnimState = {
      phase: 'open', progress: 1, startTimeSec: 0, reversal: null, reduceMotion: false,
    };
    const tRev = 0.5;
    const rev = startReversal(open, tRev);
    const t1 = tickAnim(rev, tRev + 0.1);
    const t2 = tickAnim(rev, tRev + 0.5);
    expect(t1.progress).toBeLessThan(1);
    expect(t2.progress).toBeLessThan(t1.progress);
    const settled = tickAnim(rev, tRev + 5);
    expect(settled.phase).toBe('idle');
    expect(settled.progress).toBeCloseTo(0, 2);
  });
});

describe('mid-flight reversal — C0 and C1 continuity (the morph-choreo bar)', () => {
  it('VM-path C1 continuity: one-sided progress-velocities through startReversal converge as h shrinks (exercises startReversal revVel stitching, board-09 velocity-carry)', () => {
    const tRev = 0.1;
    const drilling = startDrill(makeIdleAnim(false), 0, KF);
    const justBefore = tickAnim(drilling, tRev - 1e-9);
    const rev = startReversal(justBefore, tRev);

    let prevGap = Infinity;
    let lastBefore = 0;
    let lastAfter = 0;
    for (const h of [1e-3, 1e-4, 1e-5, 1e-6]) {
      lastBefore = backwardSlope(drilling, tRev, h);
      lastAfter = forwardSlope(rev, tRev, h);
      const gap = Math.abs(lastBefore - lastAfter);
      expect(gap).toBeLessThan(prevGap + 1e-9);
      prevGap = gap;
    }
    expect(lastBefore).toBeGreaterThan(0);
    expect(lastAfter).toBeGreaterThan(0);
    expect(prevGap).toBeLessThan(1e-3);
  });

  it('VM-path C0 continuity: progress value through startReversal matches across tRev to tight tolerance', () => {
    const tRev = 0.1;
    const drilling = startDrill(makeIdleAnim(false), 0, KF);

    const justBefore = tickAnim(drilling, tRev - 1e-6);
    const rev = startReversal(justBefore, tRev);
    const justAfter = tickAnim(rev, tRev + 1e-6);

    expect(Math.abs(justAfter.progress - justBefore.progress)).toBeLessThan(1e-4);
  });

  it('VM-path: re-drill one-sided progress-velocities converge as h shrinks across tReDrill (exercises startDrill reversing branch springVel stitching)', () => {
    const tRev = 0.1;
    const tReDrill = 0.18;
    const drilling = startDrill(makeIdleAnim(false), 0, KF);
    const midDrill = tickAnim(drilling, tRev);
    const reversing = startReversal(midDrill, tRev);
    const justBefore = tickAnim(reversing, tReDrill - 1e-9);
    const reDrilling = startDrill(justBefore, tReDrill, KF);

    let prevGap = Infinity;
    let lastBefore = 0;
    let lastAfter = 0;
    for (const h of [1e-3, 1e-4, 1e-5, 1e-6]) {
      lastBefore = backwardSlope(reversing, tReDrill, h);
      lastAfter = forwardSlope(reDrilling, tReDrill, h);
      const gap = Math.abs(lastBefore - lastAfter);
      expect(gap).toBeLessThan(prevGap + 1e-9);
      prevGap = gap;
    }
    expect(lastBefore).toBeLessThan(0);
    expect(lastAfter).toBeLessThan(0);
    expect(prevGap).toBeLessThan(1e-3);
  });

  it('VM-path: re-drill progress value is continuous across tReDrill', () => {
    const tRev = 0.1;
    const tReDrill = 0.18;

    const drilling = startDrill(makeIdleAnim(false), 0, KF);
    const midDrill = tickAnim(drilling, tRev);
    const reversing = startReversal(midDrill, tRev);

    const justBefore = tickAnim(reversing, tReDrill - 1e-6);
    const reDrilling = startDrill(justBefore, tReDrill, KF);
    const justAfter = tickAnim(reDrilling, tReDrill + 1e-6);

    expect(Math.abs(justAfter.progress - justBefore.progress)).toBeLessThan(1e-4);
  });

  it('startReversal mid-drilling carries a non-null reversal state with finite position and velocity', () => {
    const drilling = startDrill(makeIdleAnim(false), 0, KF);
    const midFlight = tickAnim(drilling, 0.1);
    const rev = startReversal(midFlight, 0.1);
    expect(rev.phase).toBe('reversing');
    expect(rev.reversal).not.toBeNull();
    expect(Number.isFinite(positionAfterReversal(rev.reversal!, 0.1))).toBe(true);
    expect(Number.isFinite(velocityAfterReversal(rev.reversal!, 0.1))).toBe(true);
  });

  it('double-reversal (drill->reverse->drill) keeps progress between 0 and 1', () => {
    const tRev = 0.1;
    const tReDrill = 0.2;
    const drilling = startDrill(makeIdleAnim(false), 0, KF);
    const midDrill = tickAnim(drilling, tRev);
    const reversing = startReversal(midDrill, tRev);
    const midRev = tickAnim(reversing, tRev + 0.05);
    const reDrilling = startDrill(midRev, tReDrill, KF);
    expect(reDrilling.phase).toBe('drilling');
    expect(reDrilling.progress).toBeGreaterThan(0);
    expect(reDrilling.progress).toBeLessThan(1);
  });

  it('reversal from open (progress=1) progress decreases after reversal start', () => {
    const open: DrillAnimState = {
      phase: 'open', progress: 1, startTimeSec: 0, reversal: null, reduceMotion: false,
    };
    const tRev = 1.0;
    const rev = startReversal(open, tRev);
    const shortly = tickAnim(rev, tRev + 0.05);
    expect(shortly.progress).toBeLessThan(1);
  });

  it('morph-choreo library reversal is C0 at instant (baseline for the VM stitching the VM tests above verify)', () => {
    const tRev = 0.15;
    const state = buildReversalState(MORPH_SPRING, 1.0, 0.0, tRev);
    expect(positionAfterReversal(state, tRev)).toBeCloseTo(
      springPosition(MORPH_SPRING, 1.0, 0.0, tRev), 10,
    );
  });

  it('morph-choreo library reversal is C1 at instant (baseline for the VM stitching the VM tests above verify)', () => {
    const tRev = 0.15;
    const state = buildReversalState(MORPH_SPRING, 1.0, 0.0, tRev);
    expect(velocityAfterReversal(state, tRev)).toBeCloseTo(
      analyticVelocity(MORPH_SPRING, 1.0, 0.0, tRev), 10,
    );
  });
});

describe('morphProgressFromAnim reflects anim.progress', () => {
  it('idle gives 0', () => {
    expect(morphProgressFromAnim(makeIdleAnim(false))).toBe(0);
  });

  it('open gives 1', () => {
    const a: DrillAnimState = {
      phase: 'open', progress: 1, startTimeSec: 0, reversal: null, reduceMotion: false,
    };
    expect(morphProgressFromAnim(a)).toBe(1);
  });
});
