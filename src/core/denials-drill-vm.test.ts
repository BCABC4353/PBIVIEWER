import { describe, it, expect } from 'vitest';
import {
  makeIdleAnim,
  startDrill,
  startReversal,
  tickAnim,
  buildDrillPayload,
  buildDrillKeyframe,
  buildDrillVm,
  type DrillAnimState,
} from './denials-drill-vm';
import { interpolateMorph, type MorphKeyframe } from './morph-choreo';
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
    expect(makeIdleAnim(true).reduceMotion).toBe(true);
  });
});

describe('startDrill — forward morph', () => {
  it('transitions to drilling phase', () => {
    const drilled = startDrill(makeIdleAnim(false), 0, KF);
    expect(drilled.phase).toBe('drilling');
    expect(drilled.progress).toBe(0);
  });

  it('reduce motion collapses to open immediately', () => {
    const drilled = startDrill(makeIdleAnim(true), 0, KF);
    expect(drilled.phase).toBe('open');
    expect(drilled.progress).toBe(1);
  });
});

describe('startReversal — back morph', () => {
  it('transitions from open to reversing', () => {
    const open: DrillAnimState = {
      phase: 'open', progress: 1, startTimeSec: 0, reversal: null, reduceMotion: false,
    };
    const rev = startReversal(open, 0.5);
    expect(rev.phase).toBe('reversing');
    expect(rev.reversal).not.toBeNull();
  });

  it('reduce motion collapses reversal to idle immediately', () => {
    const open: DrillAnimState = {
      phase: 'open', progress: 1, startTimeSec: 0, reversal: null, reduceMotion: true,
    };
    const rev = startReversal(open, 0.5);
    expect(rev.phase).toBe('idle');
    expect(rev.progress).toBe(0);
  });
});

describe('buildDrillPayload', () => {
  it('payor matches node key', () => {
    expect(buildDrillPayload(MEDICARE_NODE, TREE, 0).payor).toBe('MEDICARE');
  });

  it('category is first path segment', () => {
    expect(buildDrillPayload(MEDICARE_NODE, TREE, 0).category).toBe('MEDICARE');
  });

  it('slice points contain children', () => {
    const p = buildDrillPayload(MEDICARE_NODE, TREE, 0);
    expect(p.slicePoints.length).toBeGreaterThan(0);
    const labels = p.slicePoints.map((sp) => sp.label);
    expect(labels).toContain('Medicare A');
    expect(labels).toContain('Medicare B');
  });

  it('leaf rows code matches child key', () => {
    const codes = buildDrillPayload(MEDICARE_NODE, TREE, 0).leafRows.map((r) => r.code);
    expect(codes).toContain('Medicare A');
    expect(codes).toContain('Medicare B');
  });

  it('totalClaims equals sum of leaf row claims', () => {
    const p = buildDrillPayload(MEDICARE_NODE, TREE, 0);
    const summed = p.leafRows.reduce((s, r) => s + r.claims, 0);
    expect(p.totalClaims).toBe(summed);
  });

  it('categoryIndex propagates to payload', () => {
    expect(buildDrillPayload(MEDICARE_NODE, TREE, 3).categoryIndex).toBe(3);
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
    const vm = buildDrillVm(null, TREE, 0, makeIdleAnim(false), 0, 48, 390, 844);
    expect(vm.payload).toBeNull();
  });

  it('valid node produces non-null payload', () => {
    const vm = buildDrillVm(MEDICARE_NODE, TREE, 0, makeIdleAnim(false), 100, 48, 390, 844);
    expect(vm.payload).not.toBeNull();
    expect(vm.payload?.payor).toBe('MEDICARE');
  });

  it('anim state propagates to vm', () => {
    const vm = buildDrillVm(MEDICARE_NODE, TREE, 0, makeIdleAnim(false), 100, 48, 390, 844);
    expect(vm.anim.phase).toBe('idle');
  });
});

describe('NAMED-TODO [RN shared-element not yet wired]: morph geometry via interpolateMorph+spring', () => {
  it('interpolated rect during drill is between origin and target (stub: real shared-element morph requires native navigator)', () => {
    const kf = buildDrillKeyframe(100, 48, 390, 844);
    const g = interpolateMorph(kf, 0.5);
    expect(g.rect.y).toBeGreaterThan(kf.target.rect.y);
    expect(g.rect.y).toBeLessThan(kf.origin.rect.y);
    expect(g.rect.h).toBeGreaterThan(kf.origin.rect.h);
    expect(g.rect.h).toBeLessThan(kf.target.rect.h);
  });

  it('spring-driven progress from MORPH_SPRING stays in [0,1] for all t in [0,3] (view-model correctness)', () => {
    const drilling = startDrill(makeIdleAnim(false), 0, KF);
    for (let i = 0; i <= 60; i++) {
      const a = tickAnim(drilling, i * 0.05);
      expect(a.progress).toBeGreaterThanOrEqual(0);
      expect(a.progress).toBeLessThanOrEqual(1);
    }
  });
});
