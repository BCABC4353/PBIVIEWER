import { describe, it, expect } from 'vitest';
import {
  computeControlBands,
  bandSegments,
  formatDeltaGlyph,
  isAboveFlag,
  isBelowFlag,
  flagsAtIndex,
} from './bar-chart-vm';
import { DENIALS_BAR_DATA } from './denials-mock-data';
import type { RollingPoint } from '../enhance';

describe('computeControlBands', () => {
  it('returns insufficient for empty series', () => {
    const r = computeControlBands([], 4, 2);
    expect(r.kind).toBe('insufficient');
  });

  it('returns insufficient for window=0', () => {
    const r = computeControlBands([{ label: 'W1', value: 5 }], 0, 2);
    expect(r.kind).toBe('insufficient');
  });

  it('returns ok for valid single-point series', () => {
    const r = computeControlBands([{ label: 'W1', value: 10 }], 4, 2);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.data.band).toHaveLength(1);
    expect(r.data.flags).toHaveLength(0);
  });

  it('band length equals series length', () => {
    const pts = [1, 2, 3, 4, 5].map((v, i) => ({ label: `W${i}`, value: v }));
    const r = computeControlBands(pts, 3, 2);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.data.band).toHaveLength(5);
  });

  it('detects spike above band as anomaly flag', () => {
    const pts = [10, 10, 10, 10, 100].map((v, i) => ({ label: `W${i}`, value: v }));
    const r = computeControlBands(pts, 4, 1);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    const aboveFlags = r.data.flags.filter((f) => f.side === 'above');
    expect(aboveFlags.length).toBeGreaterThan(0);
  });

  it('all-equal series produces zero flags', () => {
    const pts = [5, 5, 5, 5, 5, 5].map((v, i) => ({ label: `W${i}`, value: v }));
    const r = computeControlBands(pts, 4, 2);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.data.flags).toHaveLength(0);
  });

  it('integrates correctly with DENIALS_BAR_DATA (12 weeks)', () => {
    const r = computeControlBands(DENIALS_BAR_DATA.points, 4, 2);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.data.band).toHaveLength(DENIALS_BAR_DATA.points.length);
    for (const pt of r.data.band) {
      expect(Number.isFinite(pt.mean)).toBe(true);
      expect(Number.isFinite(pt.upper)).toBe(true);
      expect(Number.isFinite(pt.lower)).toBe(true);
      expect(pt.upper).toBeGreaterThanOrEqual(pt.lower);
    }
  });

  it('all band upper values are >= lower values', () => {
    const pts = DENIALS_BAR_DATA.points;
    const r = computeControlBands(pts, 6, 2);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    for (const pt of r.data.band) {
      expect(pt.upper).toBeGreaterThanOrEqual(pt.lower);
    }
  });

  it('flags have valid indices within series length', () => {
    const pts = DENIALS_BAR_DATA.points;
    const r = computeControlBands(pts, 4, 1);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    for (const f of r.data.flags) {
      expect(f.index).toBeGreaterThanOrEqual(0);
      expect(f.index).toBeLessThan(pts.length);
    }
  });
});

describe('bandSegments', () => {
  const band: RollingPoint[] = [
    { mean: 6, stddev: 1, upper: 8, lower: 4 },
    { mean: 5, stddev: 1, upper: 9, lower: 1 },
  ];

  it('maps upper/lower to fractions of scale', () => {
    const segs = bandSegments(band, [], 10);
    expect(segs[0]!.upperFrac).toBeCloseTo(0.8);
    expect(segs[0]!.lowerFrac).toBeCloseTo(0.4);
    expect(segs[1]!.upperFrac).toBeCloseTo(0.9);
    expect(segs[1]!.lowerFrac).toBeCloseTo(0.1);
  });

  it('clamps fractions into [0,1]', () => {
    const wide: RollingPoint[] = [{ mean: 5, stddev: 5, upper: 20, lower: -5 }];
    const segs = bandSegments(wide, [], 10);
    expect(segs[0]!.upperFrac).toBe(1);
    expect(segs[0]!.lowerFrac).toBe(0);
  });

  it('guards scale<=0 by using denom 1', () => {
    const segs = bandSegments([{ mean: 0.5, stddev: 0.1, upper: 0.7, lower: 0.3 }], [], 0);
    expect(segs[0]!.upperFrac).toBeCloseTo(0.7);
    expect(segs[0]!.lowerFrac).toBeCloseTo(0.3);
  });

  it('upperFrac is never less than lowerFrac even if band inverted', () => {
    const inverted: RollingPoint[] = [{ mean: 5, stddev: 1, upper: 2, lower: 8 }];
    const segs = bandSegments(inverted, [], 10);
    expect(segs[0]!.upperFrac).toBeGreaterThanOrEqual(segs[0]!.lowerFrac);
  });

  it('marks the flagged index and only that index', () => {
    const segs = bandSegments(band, [{ index: 1, value: 99, side: 'above', magnitude: 5 }], 10);
    expect(segs[0]!.flagged).toBe(false);
    expect(segs[1]!.flagged).toBe(true);
  });

  it('returns one segment per band point', () => {
    expect(bandSegments(band, [], 10)).toHaveLength(2);
  });

  it('no flags means no segment is flagged', () => {
    const segs = bandSegments(band, [], 10);
    expect(segs.every((s) => !s.flagged)).toBe(true);
  });
});

describe('formatDeltaGlyph', () => {
  it('returns up glyph for positive delta', () => {
    expect(formatDeltaGlyph(5)).toBe('▲');
  });

  it('returns down glyph for negative delta', () => {
    expect(formatDeltaGlyph(-3)).toBe('▼');
  });

  it('returns flat glyph for zero delta', () => {
    expect(formatDeltaGlyph(0)).toBe('—');
  });

  it('returns up glyph for very small positive delta', () => {
    expect(formatDeltaGlyph(0.001)).toBe('▲');
  });

  it('returns down glyph for very small negative delta', () => {
    expect(formatDeltaGlyph(-0.001)).toBe('▼');
  });
});

describe('isAboveFlag / isBelowFlag', () => {
  it('isAboveFlag returns true only for above side', () => {
    expect(isAboveFlag({ index: 0, value: 10, side: 'above', magnitude: 2 })).toBe(true);
    expect(isAboveFlag({ index: 0, value: 10, side: 'below', magnitude: 2 })).toBe(false);
  });

  it('isBelowFlag returns true only for below side', () => {
    expect(isBelowFlag({ index: 0, value: 10, side: 'below', magnitude: 2 })).toBe(true);
    expect(isBelowFlag({ index: 0, value: 10, side: 'above', magnitude: 2 })).toBe(false);
  });
});

describe('flagsAtIndex', () => {
  const flags = [
    { index: 0, value: 5, side: 'above' as const, magnitude: 1 },
    { index: 2, value: 3, side: 'below' as const, magnitude: 0.5 },
    { index: 2, value: 8, side: 'above' as const, magnitude: 1.5 },
  ];

  it('returns flags matching the given index', () => {
    expect(flagsAtIndex(flags, 2)).toHaveLength(2);
  });

  it('returns empty array when no flags at index', () => {
    expect(flagsAtIndex(flags, 1)).toHaveLength(0);
  });

  it('returns single flag when exactly one matches', () => {
    const result = flagsAtIndex(flags, 0);
    expect(result).toHaveLength(1);
    expect(result[0]!.index).toBe(0);
  });

  it('returns empty array for out-of-range index', () => {
    expect(flagsAtIndex(flags, 99)).toHaveLength(0);
  });
});
