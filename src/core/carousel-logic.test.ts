import { describe, it, expect } from 'vitest';
import {
  snapIndex,
  springTarget,
  advance,
  rewind,
  goTo,
  canAdvance,
  canRewind,
  projectedIndex,
} from './carousel-logic';

describe('snapIndex — basic snapping', () => {
  it('no drag returns current index', () => {
    expect(snapIndex({ currentIndex: 2, count: 5, dragOffset: 0, velocity: 0, itemWidth: 100 })).toBe(2);
  });

  it('half page drag right snaps forward', () => {
    const idx = snapIndex({ currentIndex: 0, count: 5, dragOffset: -55, velocity: 0, itemWidth: 100 });
    expect(idx).toBe(1);
  });

  it('half page drag left snaps backward', () => {
    const idx = snapIndex({ currentIndex: 2, count: 5, dragOffset: 55, velocity: 0, itemWidth: 100 });
    expect(idx).toBe(1);
  });

  it('clamps at first item (no wrap)', () => {
    const idx = snapIndex({ currentIndex: 0, count: 5, dragOffset: 200, velocity: 0, itemWidth: 100 });
    expect(idx).toBe(0);
  });

  it('clamps at last item (no wrap)', () => {
    const idx = snapIndex({ currentIndex: 4, count: 5, dragOffset: -200, velocity: 0, itemWidth: 100 });
    expect(idx).toBe(4);
  });

  it('zero count returns 0', () => {
    expect(snapIndex({ currentIndex: 0, count: 0, dragOffset: 0, velocity: 0, itemWidth: 100 })).toBe(0);
  });

  it('zero item width returns clamped current', () => {
    expect(snapIndex({ currentIndex: 2, count: 5, dragOffset: 50, velocity: 0, itemWidth: 0 })).toBe(2);
  });
});

describe('snapIndex — velocity bias', () => {
  it('fast rightward velocity (negative) biases toward next page', () => {
    const withVelocity = snapIndex({
      currentIndex: 0, count: 5, dragOffset: 0, velocity: -2000, itemWidth: 100, velocityBiasFactor: 0.25,
    });
    expect(withVelocity).toBeGreaterThanOrEqual(1);
  });

  it('fast leftward velocity (positive) at index 2 biases toward prev', () => {
    const withVelocity = snapIndex({
      currentIndex: 2, count: 5, dragOffset: 0, velocity: 2000, itemWidth: 100, velocityBiasFactor: 0.25,
    });
    expect(withVelocity).toBeLessThanOrEqual(1);
  });

  it('velocity bias clamped at boundary', () => {
    const idx = snapIndex({
      currentIndex: 0, count: 3, dragOffset: 0, velocity: 9999, itemWidth: 100,
    });
    expect(idx).toBe(0);
  });
});

describe('springTarget', () => {
  it('no drag returns zero offsetFromSnap', () => {
    const result = springTarget({ currentIndex: 1, count: 3, dragOffset: 0, velocity: 0, itemWidth: 100 });
    expect(result.index).toBe(1);
    expect(Math.abs(result.offsetFromSnap)).toBeLessThan(1e-10);
  });

  it('returns correct snap index with drag', () => {
    const result = springTarget({ currentIndex: 0, count: 5, dragOffset: -60, velocity: 0, itemWidth: 100 });
    expect(result.index).toBe(1);
  });

  it('offset is zero for exact snap position', () => {
    const result = springTarget({ currentIndex: 2, count: 5, dragOffset: 0, velocity: 0, itemWidth: 100 });
    expect(result.offsetFromSnap).toBeCloseTo(0, 9);
  });
});

describe('navigation state', () => {
  it('canAdvance returns true when not at end', () => {
    expect(canAdvance({ index: 1, count: 3 })).toBe(true);
  });

  it('canAdvance returns false at last item', () => {
    expect(canAdvance({ index: 2, count: 3 })).toBe(false);
  });

  it('canRewind returns true when not at start', () => {
    expect(canRewind({ index: 1, count: 3 })).toBe(true);
  });

  it('canRewind returns false at first item', () => {
    expect(canRewind({ index: 0, count: 3 })).toBe(false);
  });

  it('advance moves forward', () => {
    expect(advance({ index: 1, count: 3 }).index).toBe(2);
  });

  it('advance clamps at end', () => {
    expect(advance({ index: 2, count: 3 }).index).toBe(2);
  });

  it('rewind moves backward', () => {
    expect(rewind({ index: 2, count: 3 }).index).toBe(1);
  });

  it('rewind clamps at zero', () => {
    expect(rewind({ index: 0, count: 3 }).index).toBe(0);
  });

  it('goTo clamps to valid range', () => {
    expect(goTo({ index: 0, count: 3 }, 99).index).toBe(2);
    expect(goTo({ index: 2, count: 3 }, -5).index).toBe(0);
  });

  it('goTo sets exact valid index', () => {
    expect(goTo({ index: 0, count: 5 }, 3).index).toBe(3);
  });

  it('zero count — canAdvance false', () => {
    expect(canAdvance({ index: 0, count: 0 })).toBe(false);
  });

  it('zero count — canRewind false', () => {
    expect(canRewind({ index: 0, count: 0 })).toBe(false);
  });
});

describe('projectedIndex', () => {
  it('zero velocity returns current', () => {
    expect(projectedIndex(2, 5, 0, 100)).toBe(2);
  });

  it('fast rightward velocity advances', () => {
    const idx = projectedIndex(1, 5, -800, 100, 300);
    expect(idx).toBeGreaterThanOrEqual(2);
  });

  it('clamps at zero', () => {
    expect(projectedIndex(0, 5, 9999, 100, 300)).toBe(0);
  });

  it('clamps at count-1', () => {
    expect(projectedIndex(4, 5, -9999, 100, 300)).toBe(4);
  });
});
