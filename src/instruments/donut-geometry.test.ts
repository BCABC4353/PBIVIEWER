import { describe, it, expect } from 'vitest';
import { computeDonutGeometry, arcPathString } from './donut-geometry';

const OPTS = { size: 200, strokeWidth: 18, gapAngle: 0.05 };

describe('computeDonutGeometry', () => {
  it('returns empty arcs and total=0 for empty slices', () => {
    const geo = computeDonutGeometry([], OPTS);
    expect(geo.arcs).toHaveLength(0);
    expect(geo.total).toBe(0);
  });

  it('returns empty arcs when all values are zero', () => {
    const geo = computeDonutGeometry([{ value: 0, label: 'A' }], OPTS);
    expect(geo.arcs).toHaveLength(0);
  });

  it('single slice spans nearly full circle minus gap', () => {
    const geo = computeDonutGeometry([{ value: 100, label: 'A' }], OPTS);
    expect(geo.arcs).toHaveLength(1);
    const sweep = geo.arcs[0]!.endAngle - geo.arcs[0]!.startAngle;
    expect(sweep).toBeGreaterThan(Math.PI * 2 * 0.9);
  });

  it('total equals sum of positive values', () => {
    const geo = computeDonutGeometry(
      [{ value: 40, label: 'A' }, { value: 60, label: 'B' }],
      OPTS,
    );
    expect(geo.total).toBeCloseTo(100);
  });

  it('share of each arc equals value/total', () => {
    const slices = [{ value: 30, label: 'A' }, { value: 70, label: 'B' }];
    const geo = computeDonutGeometry(slices, OPTS);
    expect(geo.arcs[0]!.share).toBeCloseTo(0.3);
    expect(geo.arcs[1]!.share).toBeCloseTo(0.7);
  });

  it('arcs sum of sweeps is close to 2*PI minus total gap', () => {
    const slices = [
      { value: 25, label: 'A' }, { value: 25, label: 'B' },
      { value: 25, label: 'C' }, { value: 25, label: 'D' },
    ];
    const geo = computeDonutGeometry(slices, OPTS);
    const totalSweep = geo.arcs.reduce((s, a) => s + (a.endAngle - a.startAngle), 0);
    const expectedGap = OPTS.gapAngle * slices.length;
    expect(totalSweep).toBeCloseTo(Math.PI * 2 - expectedGap, 1);
  });

  it('radius is computed correctly from size and strokeWidth', () => {
    const geo = computeDonutGeometry([{ value: 1, label: 'A' }], OPTS);
    expect(geo.radius).toBeCloseTo((OPTS.size - OPTS.strokeWidth) / 2);
  });

  it('cx and cy are at center of size', () => {
    const geo = computeDonutGeometry([{ value: 1, label: 'A' }], OPTS);
    expect(geo.cx).toBeCloseTo(OPTS.size / 2);
    expect(geo.cy).toBeCloseTo(OPTS.size / 2);
  });

  it('slices with zero value are filtered out', () => {
    const slices = [
      { value: 0, label: 'skip' },
      { value: 50, label: 'A' },
      { value: 50, label: 'B' },
    ];
    const geo = computeDonutGeometry(slices, OPTS);
    expect(geo.arcs).toHaveLength(2);
  });
});

describe('arcPathString', () => {
  it('produces a string starting with M', () => {
    const path = arcPathString(100, 100, 80, 0, Math.PI);
    expect(path.startsWith('M')).toBe(true);
  });

  it('contains A (arc) command', () => {
    const path = arcPathString(100, 100, 80, 0, Math.PI);
    expect(path).toContain('A');
  });

  it('large-arc flag is 1 when sweep > PI', () => {
    const path = arcPathString(100, 100, 80, 0, Math.PI * 1.5);
    expect(path).toContain('1 1');
  });

  it('large-arc flag is 0 when sweep <= PI', () => {
    const path = arcPathString(100, 100, 80, 0, Math.PI * 0.5);
    expect(path).toContain('0 1');
  });
});
