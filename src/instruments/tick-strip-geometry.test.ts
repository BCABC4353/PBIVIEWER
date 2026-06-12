import { describe, it, expect } from 'vitest';
import { computeStripGeometry, STRIP_SIZES } from './tick-strip-geometry';

describe('computeStripGeometry', () => {
  it('x0 equals spec pad, x1 equals width - spec pad', () => {
    const geo = computeStripGeometry({ width: 400, size: 'large', value: 5 });
    const spec = STRIP_SIZES['large'];
    expect(geo.x0).toBe(spec.pad);
    expect(geo.x1).toBe(400 - spec.pad);
  });

  it('no overdue: xTarget is proportional to value in [x0, xMark]', () => {
    const geo = computeStripGeometry({ width: 400, size: 'large', cycle: 15, value: 7.5 });
    const expected = geo.x0 + (geo.mainW / 15) * 7.5;
    expect(geo.xTarget).toBeCloseTo(expected);
  });

  it('overdue > 0: mainW is 74% of span', () => {
    const geo = computeStripGeometry({ width: 400, size: 'large', cycle: 15, value: 15, overdue: 30 });
    const span = geo.x1 - geo.x0;
    expect(geo.mainW).toBeCloseTo(span * 0.74);
  });

  it('isOverdue is false when overdue=0', () => {
    const geo = computeStripGeometry({ width: 400, size: 'large', value: 5 });
    expect(geo.isOverdue).toBe(false);
  });

  it('isOverdue is true when overdue > 0', () => {
    const geo = computeStripGeometry({ width: 400, size: 'large', value: 15, overdue: 10 });
    expect(geo.isOverdue).toBe(true);
  });

  it('no overdue: overdueTicks is empty', () => {
    const geo = computeStripGeometry({ width: 400, size: 'large', value: 5 });
    expect(geo.overdueTicks).toHaveLength(0);
  });

  it('overdue: overdueTicks contains ticks in the overflow band', () => {
    const geo = computeStripGeometry({ width: 400, size: 'large', value: 15, overdue: 60, overflowSpan: 60 });
    expect(geo.overdueTicks.length).toBeGreaterThan(0);
    for (const tick of geo.overdueTicks) {
      expect(tick.x).toBeGreaterThan(geo.xMark);
      expect(tick.x).toBeLessThanOrEqual(geo.x1);
    }
  });

  it('large has 4 minor ticks per minute interval (quarter marks)', () => {
    const geo = computeStripGeometry({ width: 400, size: 'large', cycle: 15, value: 5 });
    expect(geo.minorTicks.length).toBeGreaterThan(0);
    const expected = 15 * 4 - 15;
    expect(geo.minorTicks).toHaveLength(expected);
  });

  it('medium has zero minor ticks', () => {
    const geo = computeStripGeometry({ width: 200, size: 'medium', cycle: 15, value: 5 });
    expect(geo.minorTicks).toHaveLength(0);
  });

  it('small has zero minor ticks', () => {
    const geo = computeStripGeometry({ width: 64, size: 'small', cycle: 15, value: 5 });
    expect(geo.minorTicks).toHaveLength(0);
  });

  it('major ticks appear every 5 minutes', () => {
    const geo = computeStripGeometry({ width: 400, size: 'large', cycle: 15, value: 5 });
    const majorTicks = geo.ticks.filter(t => t.isMajor);
    expect(majorTicks).toHaveLength(4);
    for (const mt of majorTicks) {
      expect(Number(mt.label) % 5).toBe(0);
    }
  });

  it('xTarget clamped at 97% of overflow when overdue exceeds overflowSpan', () => {
    const geo = computeStripGeometry({
      width: 400, size: 'large', value: 15, overdue: 120, overflowSpan: 60,
    });
    const maxX = geo.xMark + (geo.x1 - geo.xMark) * 0.97;
    expect(geo.xTarget).toBeCloseTo(maxX);
  });

  it('labels enabled for large, disabled for small', () => {
    const large = computeStripGeometry({ width: 400, size: 'large', value: 5 });
    const small = computeStripGeometry({ width: 64, size: 'small', value: 5 });
    expect(large.spec.labels).toBe(true);
    expect(small.spec.labels).toBe(false);
  });
});
