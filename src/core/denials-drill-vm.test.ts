import { describe, it, expect } from 'vitest';
import {
  makeIdleAnim,
  startDrill,
  startReversal,
  tickAnim,
  morphProgressFromAnim,
  buildDrillPayload,
  buildDrillKeyframe,
  buildDrillVm,
  MORPH_SPRING,
  type DrillAnimState,
} from './denials-drill-vm';
import {
  springPosition,
  analyticVelocity,
  positionAfterReversal,
  velocityAfterReversal,
  buildReversalState,
  interpolateMorph,
  type MorphKeyframe,
} from './morph-choreo';
import { buildTree } from './ledger-logic';
import type { LedgerRow } from './ledger-logic';

const ROWS: LedgerRow[] = [
  { groups: ['MEDICARE', 'Medicare A'], value: 312 },
  { groups: ['MEDICARE', 'Medicare B'], value: 198 },
  { groups: ['COMMERCIAL', 'Blue Cross'], value: 174 },
  { groups: ['COMMERCIAL', 'Aetna'], value: 112 },
];

const TREE = buildTree(ROWS, ['PAYOR CATEGORY', 'PAYOR']);
const MEDICARE_NODE = TREE.roots.find((n) => n.key === 'MEDICARE')!;

const KF: MorphKeyframe = {
  origin: { rect: { x: 0, y: 100, w: 390, h: 48 }, cornerRadius: 0 },
  target: { rect: { x: 0, y: 0, w: 390, h: 844 }, cornerRadius: 0 },
};

describe('makeIdleAnim', () => {
  it('produces phase idle with progress 0', () => {
    const a = makeIdleAnim(false);
    expect(a.phase).toBe('idle');
    expect(a.progress).toBe(0);
    expect(a.reversal).toBeNull();
  });

  it('reduceMotion flag propagates', () => {
    const a = makeIdleAnim(true);
    expect(a.reduceMotion).toBe(true);
  });
});

describe('startDrill — forward morph', () => {
  it('transitions to drilling phase', () => {
    const idle = makeIdleAnim(false);
    const drilled = startDrill(idle, 0, KF);
    expect(drilled.phase).toBe('drilling');
    expect(drilled.progress).toBe(0);
  });

  it('reduce motion collapses to open immediately', () => {
    const idle = makeIdleAnim(true);
    const drilled = startDrill(idle, 0, KF);
    expect(drilled.phase).toBe('open');
    expect(drilled.progress).toBe(1);
  });
});

describe('startReversal — back morph', () => {
  it('transitions from open to reversing', () => {
    const open: DrillAnimState = {
      phase: 'open',
      progress: 1,
      startTimeSec: 0,
      reversal: null,
      reduceMotion: false,
    };
    const rev = startReversal(open, 0.5);
    expect(rev.phase).toBe('reversing');
    expect(rev.reversal).not.toBeNull();
  });

  it('reduce motion collapses reversal to idle immediately', () => {
    const open: DrillAnimState = {
      phase: 'open',
      progress: 1,
      startTimeSec: 0,
      reversal: null,
      reduceMotion: true,
    };
    const rev = startReversal(open, 0.5);
    expect(rev.phase).toBe('idle');
    expect(rev.progress).toBe(0);
  });
});

describe('tickAnim — forward drilling progress', () => {
  it('progress grows from 0 toward 1 over time', () => {
    const idle = makeIdleAnim(false);
    const drilled = startDrill(idle, 0, KF);
    const t1 = tickAnim(drilled, 0.05);
    const t2 = tickAnim(drilled, 0.2);
    expect(t1.progress).toBeGreaterThan(0);
    expect(t2.progress).toBeGreaterThan(t1.progress);
  });

  it('reaches open phase as progress nears 1', () => {
    const idle = makeIdleAnim(false);
    const drilled = startDrill(idle, 0, KF);
    const settled = tickAnim(drilled, 3);
    expect(settled.phase).toBe('open');
    expect(settled.progress).toBeCloseTo(1, 2);
  });

  it('progress is bounded [0,1]', () => {
    const idle = makeIdleAnim(false);
    const drilled = startDrill(idle, 0, KF);
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
      phase: 'open',
      progress: 1,
      startTimeSec: 0,
      reversal: null,
      reduceMotion: false,
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
  it('NAMED-TODO [no shared-element navigator]: morph-choreo reversal C0 — position continuous at instant', () => {
    const tRev = 0.15;
    const forwardX0 = 1.0;
    const forwardV0 = 0.0;
    const state = buildReversalState(MORPH_SPRING, forwardX0, forwardV0, tRev);
    const posAtRev = springPosition(MORPH_SPRING, forwardX0, forwardV0, tRev);
    expect(positionAfterReversal(state, tRev)).toBeCloseTo(posAtRev, 10);
  });

  it('NAMED-TODO [no shared-element navigator]: morph-choreo reversal C1 — velocity continuous at instant', () => {
    const tRev = 0.15;
    const forwardX0 = 1.0;
    const forwardV0 = 0.0;
    const state = buildReversalState(MORPH_SPRING, forwardX0, forwardV0, tRev);
    const velAtRev = analyticVelocity(MORPH_SPRING, forwardX0, forwardV0, tRev);
    expect(velocityAfterReversal(state, tRev)).toBeCloseTo(velAtRev, 10);
  });

  it('position one-sided limits converge as epsilon shrinks (analytic reversal continuity proof)', () => {
    const tRev = 0.15;
    const forwardX0 = 1.0;
    const forwardV0 = 0.0;
    const state = buildReversalState(MORPH_SPRING, forwardX0, forwardV0, tRev);

    let prevGap = Infinity;
    for (const eps of [1e-2, 1e-3, 1e-4, 1e-5]) {
      const before = springPosition(MORPH_SPRING, forwardX0, forwardV0, tRev - eps);
      const after = positionAfterReversal(state, tRev + eps);
      const gap = Math.abs(before - after);
      expect(gap).toBeLessThan(prevGap + 1e-12);
      prevGap = gap;
    }
    expect(prevGap).toBeLessThan(1e-3);
  });

  it('velocity one-sided limits converge as epsilon shrinks (analytic reversal continuity proof)', () => {
    const tRev = 0.15;
    const forwardX0 = 1.0;
    const forwardV0 = 0.0;
    const state = buildReversalState(MORPH_SPRING, forwardX0, forwardV0, tRev);

    let prevGap = Infinity;
    for (const eps of [1e-2, 1e-3, 1e-4, 1e-5]) {
      const before = analyticVelocity(MORPH_SPRING, forwardX0, forwardV0, tRev - eps);
      const after = velocityAfterReversal(state, tRev + eps);
      const gap = Math.abs(before - after);
      expect(gap).toBeLessThan(prevGap + 1e-12);
      prevGap = gap;
    }
    expect(prevGap).toBeLessThan(1e-3);
  });

  it('startReversal mid-drilling carries a non-null reversal state with finite position and velocity', () => {
    const idle = makeIdleAnim(false);
    const drilling = startDrill(idle, 0, KF);
    const midFlight = tickAnim(drilling, 0.1);
    const rev = startReversal(midFlight, 0.1);
    expect(rev.phase).toBe('reversing');
    expect(rev.reversal).not.toBeNull();
    const posNow = positionAfterReversal(rev.reversal!, 0.1);
    expect(Number.isFinite(posNow)).toBe(true);
    const velNow = velocityAfterReversal(rev.reversal!, 0.1);
    expect(Number.isFinite(velNow)).toBe(true);
  });

  it('mid-drill reversal progress is C0 continuous: value matches just before reversal', () => {
    const tDrill = 0;
    const tRev = 0.1;
    const idle = makeIdleAnim(false);
    const drilling = startDrill(idle, tDrill, KF);

    const justBefore = tickAnim(drilling, tRev - 1e-6);
    const rev = startReversal(justBefore, tRev);
    const justAfter = tickAnim(rev, tRev + 1e-6);

    expect(Math.abs(justAfter.progress - justBefore.progress)).toBeLessThan(0.01);
  });

  it('double-reversal (drill->reverse->drill) keeps progress between 0 and 1', () => {
    const tDrill = 0;
    const tRev = 0.1;
    const tReDrill = 0.2;

    const idle = makeIdleAnim(false);
    const drilling = startDrill(idle, tDrill, KF);
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
      phase: 'open',
      progress: 1,
      startTimeSec: 0,
      reversal: null,
      reduceMotion: false,
    };
    const tRev = 1.0;
    const rev = startReversal(open, tRev);
    const shortly = tickAnim(rev, tRev + 0.05);
    expect(shortly.progress).toBeLessThan(1);
  });
});

describe('morphProgressFromAnim reflects anim.progress', () => {
  it('idle gives 0', () => {
    const a = makeIdleAnim(false);
    expect(morphProgressFromAnim(a)).toBe(0);
  });

  it('open gives 1', () => {
    const a: DrillAnimState = {
      phase: 'open',
      progress: 1,
      startTimeSec: 0,
      reversal: null,
      reduceMotion: false,
    };
    expect(morphProgressFromAnim(a)).toBe(1);
  });
});

describe('buildDrillPayload', () => {
  it('payor matches node key', () => {
    const p = buildDrillPayload(MEDICARE_NODE, TREE, 0);
    expect(p.payor).toBe('MEDICARE');
  });

  it('category is first path segment', () => {
    const p = buildDrillPayload(MEDICARE_NODE, TREE, 0);
    expect(p.category).toBe('MEDICARE');
  });

  it('slice points contain children', () => {
    const p = buildDrillPayload(MEDICARE_NODE, TREE, 0);
    expect(p.slicePoints.length).toBeGreaterThan(0);
    const labels = p.slicePoints.map((sp) => sp.label);
    expect(labels).toContain('Medicare A');
    expect(labels).toContain('Medicare B');
  });

  it('leaf rows code matches child key', () => {
    const p = buildDrillPayload(MEDICARE_NODE, TREE, 0);
    const codes = p.leafRows.map((r) => r.code);
    expect(codes).toContain('Medicare A');
    expect(codes).toContain('Medicare B');
  });

  it('totalClaims equals sum of leaf row claims', () => {
    const p = buildDrillPayload(MEDICARE_NODE, TREE, 0);
    const summed = p.leafRows.reduce((s, r) => s + r.claims, 0);
    expect(p.totalClaims).toBe(summed);
  });

  it('categoryIndex propagates to payload', () => {
    const p = buildDrillPayload(MEDICARE_NODE, TREE, 3);
    expect(p.categoryIndex).toBe(3);
  });
});

describe('buildDrillKeyframe', () => {
  it('origin rect matches row geometry', () => {
    const kf = buildDrillKeyframe(100, 48, 390, 844);
    expect(kf.origin.rect.y).toBe(100);
    expect(kf.origin.rect.h).toBe(48);
    expect(kf.origin.rect.w).toBe(390);
  });

  it('target rect spans full screen', () => {
    const kf = buildDrillKeyframe(100, 48, 390, 844);
    expect(kf.target.rect.h).toBe(844);
    expect(kf.target.rect.w).toBe(390);
    expect(kf.target.rect.y).toBe(0);
  });

  it('interpolateMorph at progress 0 is origin geometry', () => {
    const kf = buildDrillKeyframe(100, 48, 390, 844);
    const g = interpolateMorph(kf, 0);
    expect(g.rect.y).toBeCloseTo(100);
    expect(g.rect.h).toBeCloseTo(48);
  });

  it('interpolateMorph at progress 1 is target geometry', () => {
    const kf = buildDrillKeyframe(100, 48, 390, 844);
    const g = interpolateMorph(kf, 1);
    expect(g.rect.y).toBeCloseTo(0);
    expect(g.rect.h).toBeCloseTo(844);
  });
});

describe('buildDrillVm', () => {
  it('null node produces null payload', () => {
    const a = makeIdleAnim(false);
    const vm = buildDrillVm(null, TREE, 0, a, 0, 48, 390, 844);
    expect(vm.payload).toBeNull();
  });

  it('valid node produces non-null payload', () => {
    const a = makeIdleAnim(false);
    const vm = buildDrillVm(MEDICARE_NODE, TREE, 0, a, 100, 48, 390, 844);
    expect(vm.payload).not.toBeNull();
    expect(vm.payload?.payor).toBe('MEDICARE');
  });

  it('anim state propagates to vm', () => {
    const a = makeIdleAnim(false);
    const vm = buildDrillVm(MEDICARE_NODE, TREE, 0, a, 100, 48, 390, 844);
    expect(vm.anim.phase).toBe('idle');
  });
});

describe('NAMED-TODO [RN shared-element not yet wired]: morph geometry via interpolateMorph+spring', () => {
  it('interpolated rect during drill is between origin and target (stub: real shared-element morph requires native navigator)', () => {
    const kf = buildDrillKeyframe(100, 48, 390, 844);
    const midProgress = 0.5;
    const g = interpolateMorph(kf, midProgress);
    expect(g.rect.y).toBeGreaterThan(kf.target.rect.y);
    expect(g.rect.y).toBeLessThan(kf.origin.rect.y);
    expect(g.rect.h).toBeGreaterThan(kf.origin.rect.h);
    expect(g.rect.h).toBeLessThan(kf.target.rect.h);
  });

  it('spring-driven progress from MORPH_SPRING stays in [0,1] for all t in [0,3] (view-model correctness)', () => {
    const idle = makeIdleAnim(false);
    const drilling = startDrill(idle, 0, KF);
    for (let i = 0; i <= 60; i++) {
      const tSec = i * 0.05;
      const a = tickAnim(drilling, tSec);
      expect(a.progress).toBeGreaterThanOrEqual(0);
      expect(a.progress).toBeLessThanOrEqual(1);
    }
  });
});
