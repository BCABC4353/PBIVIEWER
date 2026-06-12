import { describe, it, expect } from 'vitest';
import { computeBarGeometry } from './bar-geometry';

const OPTS = { width: 400, height: 160, padH: 12, padV: 16, gap: 4 };

describe('computeBarGeometry', () => {
  it('returns empty bars and correct baseY for empty input', () => {
    const geo = computeBarGeometry({ values: [], labels: [] }, OPTS);
    expect(geo.bars).toHaveLength(0);
    expect(geo.baseY).toBe(OPTS.height - OPTS.padV);
  });

  it('single bar fills available plot height when value equals max', () => {
    const geo = computeBarGeometry({ values: [100], labels: ['A'] }, OPTS);
    expect(geo.bars).toHaveLength(1);
    const bar = geo.bars[0]!;
    const plotH = OPTS.height - OPTS.padV * 2;
    expect(bar.h).toBeCloseTo(plotH, 0);
    expect(bar.normalised).toBeCloseTo(1);
  });

  it('bar height is proportional to value', () => {
    const geo = computeBarGeometry({ values: [50, 100], labels: ['A', 'B'] }, OPTS);
    expect(geo.bars[1]!.h).toBeCloseTo(geo.bars[0]!.h * 2, 0);
  });

  it('zero value bar clamps to minimum height 2', () => {
    const geo = computeBarGeometry({ values: [0, 100], labels: ['A', 'B'] }, OPTS);
    expect(geo.bars[0]!.h).toBe(2);
  });

  it('negative values are treated as zero', () => {
    const geo = computeBarGeometry({ values: [-10, 50], labels: ['A', 'B'] }, OPTS);
    expect(geo.bars[0]!.normalised).toBe(0);
  });

  it('bars are horizontally distributed evenly', () => {
    const geo = computeBarGeometry({ values: [10, 20, 30], labels: ['A', 'B', 'C'] }, OPTS);
    const xs = geo.bars.map(b => b.x);
    const gaps = xs.slice(1).map((x, i) => x - xs[i]!);
    expect(gaps[0]).toBeCloseTo(gaps[1]!, 1);
  });

  it('maxValue is the largest positive value', () => {
    const geo = computeBarGeometry({ values: [5, 99, 42], labels: ['A', 'B', 'C'] }, OPTS);
    expect(geo.maxValue).toBe(99);
  });

  it('bars do not overflow the horizontal bounds', () => {
    const geo = computeBarGeometry({ values: [10, 20, 30, 40, 50], labels: ['A', 'B', 'C', 'D', 'E'] }, OPTS);
    for (const bar of geo.bars) {
      expect(bar.x).toBeGreaterThanOrEqual(OPTS.padH);
      expect(bar.x + bar.w).toBeLessThanOrEqual(OPTS.width - OPTS.padH + 1);
    }
  });

  it('bars are above the baseline', () => {
    const geo = computeBarGeometry({ values: [30, 60], labels: ['A', 'B'] }, OPTS);
    for (const bar of geo.bars) {
      expect(bar.y).toBeLessThan(geo.baseY);
      expect(bar.y + bar.h).toBeLessThanOrEqual(geo.baseY + 1);
    }
  });

  it('label is carried through to bar', () => {
    const geo = computeBarGeometry({ values: [100], labels: ['TestLabel'] }, OPTS);
    expect(geo.bars[0]!.label).toBe('TestLabel');
  });

  it('all-equal values produce bars with same height', () => {
    const geo = computeBarGeometry({ values: [50, 50, 50], labels: ['A', 'B', 'C'] }, OPTS);
    const heights = geo.bars.map(b => b.h);
    expect(heights[0]).toBeCloseTo(heights[1]!, 1);
    expect(heights[1]).toBeCloseTo(heights[2]!, 1);
  });
});
