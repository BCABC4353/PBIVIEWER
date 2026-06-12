import { describe, it, expect } from 'vitest';
import { computeWaterfallGeometry } from './waterfall-geometry';
import type { WaterfallStep } from '../enhance/bridge';

const OPTS = { width: 400, height: 200, padH: 12, padV: 20, gap: 4 };

function makeSteps(deltas: Array<{ key: string; delta: number }>): WaterfallStep[] {
  let acc = 0;
  return deltas.map(d => {
    const from = acc;
    acc += d.delta;
    return { key: d.key, from, to: acc, delta: d.delta, kind: 'changed' as const };
  });
}

describe('computeWaterfallGeometry', () => {
  it('returns empty bars for empty steps', () => {
    const geo = computeWaterfallGeometry([], OPTS);
    expect(geo.bars).toHaveLength(0);
    expect(geo.connectors).toHaveLength(0);
  });

  it('bar count matches step count', () => {
    const steps = makeSteps([{ key: 'A', delta: 10 }, { key: 'B', delta: -5 }, { key: 'C', delta: 8 }]);
    const geo = computeWaterfallGeometry(steps, OPTS);
    expect(geo.bars).toHaveLength(3);
  });

  it('connector count is bars.length - 1', () => {
    const steps = makeSteps([{ key: 'A', delta: 10 }, { key: 'B', delta: -5 }]);
    const geo = computeWaterfallGeometry(steps, OPTS);
    expect(geo.connectors).toHaveLength(1);
  });

  it('increment bar has kind increment', () => {
    const steps = makeSteps([{ key: 'A', delta: 20 }]);
    const geo = computeWaterfallGeometry(steps, OPTS);
    expect(geo.bars[0]!.kind).toBe('increment');
  });

  it('decrement bar has kind decrement', () => {
    const steps = makeSteps([{ key: 'A', delta: -15 }]);
    const geo = computeWaterfallGeometry(steps, OPTS);
    expect(geo.bars[0]!.kind).toBe('decrement');
  });

  it('bar in totals set has kind total', () => {
    const steps = makeSteps([{ key: 'Total', delta: 30 }]);
    const geo = computeWaterfallGeometry(steps, OPTS, new Set(['Total']));
    expect(geo.bars[0]!.kind).toBe('total');
  });

  it('bars have positive height', () => {
    const steps = makeSteps([
      { key: 'A', delta: 10 }, { key: 'B', delta: -5 }, { key: 'C', delta: 3 },
    ]);
    const geo = computeWaterfallGeometry(steps, OPTS);
    for (const bar of geo.bars) {
      expect(bar.h).toBeGreaterThan(0);
    }
  });

  it('bars fit within horizontal bounds', () => {
    const steps = makeSteps([
      { key: 'A', delta: 100 }, { key: 'B', delta: -40 }, { key: 'C', delta: 60 },
    ]);
    const geo = computeWaterfallGeometry(steps, OPTS);
    for (const bar of geo.bars) {
      expect(bar.x).toBeGreaterThanOrEqual(OPTS.padH);
      expect(bar.x + bar.w).toBeLessThanOrEqual(OPTS.width - OPTS.padH + 1);
    }
  });

  it('bar label matches step key', () => {
    const steps = makeSteps([{ key: 'Revenue', delta: 500 }]);
    const geo = computeWaterfallGeometry(steps, OPTS);
    expect(geo.bars[0]!.label).toBe('Revenue');
  });

  it('larger absolute delta produces taller bar', () => {
    const steps = makeSteps([{ key: 'big', delta: 100 }, { key: 'small', delta: -10 }]);
    const geo = computeWaterfallGeometry(steps, OPTS);
    expect(geo.bars[0]!.h).toBeGreaterThan(geo.bars[1]!.h);
  });

  it('connectors align horizontally at bar edges', () => {
    const steps = makeSteps([{ key: 'A', delta: 20 }, { key: 'B', delta: -10 }]);
    const geo = computeWaterfallGeometry(steps, OPTS);
    const conn = geo.connectors[0]!;
    const bar0 = geo.bars[0]!;
    const bar1 = geo.bars[1]!;
    expect(conn.x1).toBeCloseTo(bar0.x + bar0.w);
    expect(conn.x2).toBeCloseTo(bar1.x);
  });
});
