import { describe, it, expect } from 'vitest';
import { computeLineGeometry } from './line-geometry';

const OPTS = { width: 400, height: 160, padH: 12, padV: 16 };

describe('computeLineGeometry', () => {
  it('returns empty geometry for empty input', () => {
    const geo = computeLineGeometry([], OPTS);
    expect(geo.points).toHaveLength(0);
    expect(geo.linePath).toBe('');
    expect(geo.band).toBeNull();
  });

  it('single point is placed at center X', () => {
    const geo = computeLineGeometry([{ value: 50, label: 'A' }], OPTS);
    expect(geo.points).toHaveLength(1);
    expect(geo.points[0]!.x).toBeCloseTo(OPTS.width / 2);
  });

  it('first point is at padH, last is at width - padH', () => {
    const pts = Array.from({ length: 5 }, (_, i) => ({ value: i * 10, label: String(i) }));
    const geo = computeLineGeometry(pts, OPTS);
    expect(geo.points[0]!.x).toBeCloseTo(OPTS.padH);
    expect(geo.points[4]!.x).toBeCloseTo(OPTS.width - OPTS.padH);
  });

  it('max value is at padV (top), min value is at height - padV (bottom)', () => {
    const pts = [{ value: 0, label: 'lo' }, { value: 100, label: 'hi' }];
    const geo = computeLineGeometry(pts, OPTS);
    const plotH = OPTS.height - OPTS.padV * 2;
    expect(geo.points[1]!.y).toBeCloseTo(OPTS.padV);
    expect(geo.points[0]!.y).toBeCloseTo(OPTS.padV + plotH);
  });

  it('all-equal values produce flat y positions', () => {
    const pts = Array.from({ length: 4 }, () => ({ value: 50, label: 'X' }));
    const geo = computeLineGeometry(pts, OPTS);
    const ys = geo.points.map(p => p.y);
    for (const y of ys) {
      expect(y).toBeCloseTo(ys[0]!, 1);
    }
  });

  it('linePath starts with M', () => {
    const pts = [{ value: 10, label: 'A' }, { value: 20, label: 'B' }];
    const geo = computeLineGeometry(pts, OPTS);
    expect(geo.linePath.startsWith('M')).toBe(true);
  });

  it('areaPath closes with Z', () => {
    const pts = [{ value: 10, label: 'A' }, { value: 20, label: 'B' }];
    const geo = computeLineGeometry(pts, OPTS);
    expect(geo.areaPath.endsWith('Z')).toBe(true);
  });

  it('band is computed when enough points exist for window', () => {
    const pts = Array.from({ length: 8 }, (_, i) => ({ value: i * 5, label: String(i) }));
    const geo = computeLineGeometry(pts, OPTS, 3, 1);
    expect(geo.band).not.toBeNull();
    expect(geo.band!.length).toBe(pts.length);
  });

  it('band upper is above or equal to mean, lower is below or equal', () => {
    const pts = Array.from({ length: 6 }, (_, i) => ({ value: 10 + i * 5, label: String(i) }));
    const geo = computeLineGeometry(pts, OPTS, 3, 1);
    if (geo.band) {
      for (let i = 0; i < geo.band.length; i++) {
        expect(geo.band[i]!.upperY).toBeLessThanOrEqual(geo.points[i]!.y + 0.1);
      }
    }
  });

  it('minValue and maxValue reflect the input range', () => {
    const pts = [{ value: 7, label: 'lo' }, { value: 93, label: 'hi' }];
    const geo = computeLineGeometry(pts, OPTS);
    expect(geo.minValue).toBe(7);
    expect(geo.maxValue).toBe(93);
  });

  it('bandFillPath is non-empty when band exists', () => {
    const pts = Array.from({ length: 6 }, (_, i) => ({ value: i * 10, label: String(i) }));
    const geo = computeLineGeometry(pts, OPTS, 3, 1);
    if (geo.band) {
      expect(geo.bandFillPath.length).toBeGreaterThan(0);
      expect(geo.bandFillPath.endsWith('Z')).toBe(true);
    }
  });
});
