import { describe, it, expect } from 'vitest';
import { computeKpiLayout, deltaDirection } from './kpi-geometry';

describe('computeKpiLayout', () => {
  it('valueY is below labelY', () => {
    const layout = computeKpiLayout({ width: 300, height: 120 });
    expect(layout.valueY).toBeGreaterThan(layout.labelY);
  });

  it('deltaY is below valueY', () => {
    const layout = computeKpiLayout({ width: 300, height: 120 });
    expect(layout.deltaY).toBeGreaterThan(layout.valueY);
  });

  it('valueFontSize is capped at 56', () => {
    const layout = computeKpiLayout({ width: 400, height: 400 });
    expect(layout.valueFontSize).toBeLessThanOrEqual(56);
  });

  it('valueFontSize scales with height up to cap', () => {
    const smallLayout = computeKpiLayout({ width: 300, height: 80 });
    const largeLayout = computeKpiLayout({ width: 300, height: 300 });
    expect(largeLayout.valueFontSize).toBeGreaterThanOrEqual(smallLayout.valueFontSize);
  });

  it('labelX and valueX are equal (left-aligned)', () => {
    const layout = computeKpiLayout({ width: 300, height: 120 });
    expect(layout.labelX).toBe(layout.valueX);
  });

  it('all coordinates are positive', () => {
    const layout = computeKpiLayout({ width: 200, height: 100 });
    expect(layout.labelY).toBeGreaterThan(0);
    expect(layout.valueY).toBeGreaterThan(0);
    expect(layout.deltaY).toBeGreaterThan(0);
  });
});

describe('deltaDirection', () => {
  it('returns flat for null', () => {
    expect(deltaDirection(null)).toBe('flat');
  });

  it('returns flat for zero', () => {
    expect(deltaDirection(0)).toBe('flat');
  });

  it('returns up for positive delta', () => {
    expect(deltaDirection(5.2)).toBe('up');
  });

  it('returns down for negative delta', () => {
    expect(deltaDirection(-3)).toBe('down');
  });

  it('returns up for very small positive', () => {
    expect(deltaDirection(0.001)).toBe('up');
  });

  it('returns down for very small negative', () => {
    expect(deltaDirection(-0.001)).toBe('down');
  });
});
