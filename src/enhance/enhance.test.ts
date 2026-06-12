import { describe, it, expect } from 'vitest';
import { rollingStats } from './rolling';
import { paretoAnalysis } from './pareto';
import { varianceBridge } from './bridge';
import { distributionStrip } from './distribution';
import { periodDeltas } from './deltas';
import { anomalyFlags } from './anomaly';
import { linearInterpolationPercentile, ok, insufficient, isOk, isInsufficient } from './types';

// ---------------------------------------------------------------------------
// types helpers
// ---------------------------------------------------------------------------
describe('types helpers', () => {
  it('ok wraps a value', () => {
    const r = ok(42);
    expect(r.kind).toBe('ok');
    expect(r.value).toBe(42);
  });

  it('insufficient wraps a reason', () => {
    const r = insufficient('missing data');
    expect(r.kind).toBe('insufficient');
    expect(r.reason).toBe('missing data');
  });

  it('isOk returns true for ok, false for insufficient', () => {
    expect(isOk(ok(1))).toBe(true);
    expect(isOk(insufficient('x'))).toBe(false);
  });

  it('isInsufficient returns true for insufficient, false for ok', () => {
    expect(isInsufficient(insufficient('y'))).toBe(true);
    expect(isInsufficient(ok(1))).toBe(false);
  });

  it('linearInterpolationPercentile single element returns that element', () => {
    expect(linearInterpolationPercentile([7], 0.5)).toBe(7);
  });

  it('linearInterpolationPercentile p=0 returns first element', () => {
    expect(linearInterpolationPercentile([1, 3, 5], 0)).toBe(1);
  });

  it('linearInterpolationPercentile p=1 returns last element', () => {
    expect(linearInterpolationPercentile([1, 3, 5], 1)).toBe(5);
  });

  it('linearInterpolationPercentile p=0.5 on [1,3,5] returns 3', () => {
    // idx = 0.5 * 2 = 1.0, lo=hi=1, sorted[1]=3
    expect(linearInterpolationPercentile([1, 3, 5], 0.5)).toBe(3);
  });

  it('linearInterpolationPercentile p=0.25 on [2,4,6,8] interpolates correctly', () => {
    // idx = 0.25 * 3 = 0.75, lo=0 (value 2), hi=1 (value 4), frac=0.75
    // 2 + 0.75*(4-2) = 2 + 1.5 = 3.5
    expect(linearInterpolationPercentile([2, 4, 6, 8], 0.25)).toBeCloseTo(3.5);
  });

  it('linearInterpolationPercentile([], p) returns null not NaN (H2)', () => {
    const r = linearInterpolationPercentile([], 0.5);
    expect(r).toBeNull();
    expect(Number.isNaN(r as unknown as number)).toBe(false);
  });

  it('linearInterpolationPercentile with non-finite p returns null (H2)', () => {
    expect(linearInterpolationPercentile([1, 2, 3], NaN)).toBeNull();
    expect(linearInterpolationPercentile([1, 2, 3], Infinity)).toBeNull();
  });

  it('linearInterpolationPercentile with p out of [0,1] returns null', () => {
    expect(linearInterpolationPercentile([1, 2, 3], -0.1)).toBeNull();
    expect(linearInterpolationPercentile([1, 2, 3], 1.5)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// rolling
// ---------------------------------------------------------------------------
describe('rollingStats', () => {
  it('returns insufficient for empty series', () => {
    const r = rollingStats([], 3, 2);
    expect(r.kind).toBe('insufficient');
  });

  it('returns insufficient when window=0', () => {
    const r = rollingStats([1, 2, 3], 0, 2);
    expect(r.kind).toBe('insufficient');
  });

  it('returns insufficient for NaN in series', () => {
    const r = rollingStats([1, NaN, 3], 3, 2);
    expect(r.kind).toBe('insufficient');
  });

  it('returns insufficient for Infinity in series', () => {
    const r = rollingStats([1, Infinity, 3], 3, 2);
    expect(r.kind).toBe('insufficient');
  });

  it('returns insufficient for non-finite sigmaMultiplier', () => {
    const r = rollingStats([1, 2, 3], 2, NaN);
    expect(r.kind).toBe('insufficient');
  });

  it('single-element series: mean=value, stddev=0, band at value', () => {
    const r = rollingStats([5], 3, 2);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.value.points).toHaveLength(1);
    const p = r.value.points[0]!;
    expect(p.mean).toBe(5);
    expect(p.stddev).toBe(0);
    expect(p.upper).toBe(5);
    expect(p.lower).toBe(5);
  });

  it('window larger than series uses full series as effective window', () => {
    // series=[2,4,6], window=10 -> effective=3
    const r = rollingStats([2, 4, 6], 10, 1);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.value.window).toBe(3);
  });

  it('hand-computed: window=3 on [2,4,6,8], sigma=1', () => {
    // i=0: slice=[2], mean=2, stddev=0, upper=2, lower=2
    // i=1: slice=[2,4], mean=3, sampleStddev=sqrt(((2-3)^2+(4-3)^2)/1)=sqrt(2)~1.4142
    //       upper=3+1.4142, lower=3-1.4142
    // i=2: slice=[2,4,6], mean=4, sampleStddev=sqrt(((2-4)^2+(4-4)^2+(6-4)^2)/2)=sqrt(8/2)=sqrt(4)=2
    //       upper=6, lower=2
    // i=3: slice=[4,6,8], mean=6, sampleStddev=sqrt(((4-6)^2+(6-6)^2+(8-6)^2)/2)=sqrt(8/2)=2
    //       upper=8, lower=4
    const r = rollingStats([2, 4, 6, 8], 3, 1);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    const pts = r.value.points;
    expect(pts[0]!.mean).toBeCloseTo(2);
    expect(pts[0]!.stddev).toBeCloseTo(0);
    expect(pts[1]!.mean).toBeCloseTo(3);
    expect(pts[1]!.stddev).toBeCloseTo(Math.sqrt(2));
    expect(pts[2]!.mean).toBeCloseTo(4);
    expect(pts[2]!.stddev).toBeCloseTo(2);
    expect(pts[2]!.upper).toBeCloseTo(6);
    expect(pts[2]!.lower).toBeCloseTo(2);
    expect(pts[3]!.mean).toBeCloseTo(6);
    expect(pts[3]!.stddev).toBeCloseTo(2);
    expect(pts[3]!.upper).toBeCloseTo(8);
    expect(pts[3]!.lower).toBeCloseTo(4);
  });

  it('all-equal series: stddev=0, band collapses to mean', () => {
    const r = rollingStats([5, 5, 5, 5], 3, 2);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    for (const p of r.value.points) {
      expect(p.stddev).toBe(0);
      expect(p.upper).toBe(5);
      expect(p.lower).toBe(5);
    }
  });

  it('sigma multiplier scales band proportionally', () => {
    // series=[1,3,5], window=3, sigma=2
    // at i=2: slice=[1,3,5], mean=3, sampleStddev=sqrt(((1-3)^2+(3-3)^2+(5-3)^2)/2)=sqrt(8/2)=2
    // upper=3+2*2=7, lower=3-2*2=-1
    const r = rollingStats([1, 3, 5], 3, 2);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    const last = r.value.points[2]!;
    expect(last.mean).toBeCloseTo(3);
    expect(last.stddev).toBeCloseTo(2);
    expect(last.upper).toBeCloseTo(7);
    expect(last.lower).toBeCloseTo(-1);
  });
});

// ---------------------------------------------------------------------------
// pareto
// ---------------------------------------------------------------------------
describe('paretoAnalysis', () => {
  it('returns insufficient for empty values', () => {
    expect(paretoAnalysis([]).kind).toBe('insufficient');
  });

  it('returns insufficient for NaN value', () => {
    expect(paretoAnalysis([1, NaN, 3]).kind).toBe('insufficient');
  });

  it('returns insufficient for Infinity value', () => {
    expect(paretoAnalysis([1, Infinity]).kind).toBe('insufficient');
  });

  it('returns insufficient for threshold out of range', () => {
    expect(paretoAnalysis([1, 2], 0).kind).toBe('insufficient');
    expect(paretoAnalysis([1, 2], 1.1).kind).toBe('insufficient');
    expect(paretoAnalysis([1, 2], NaN).kind).toBe('insufficient');
  });

  it('hand-computed: [40, 30, 20, 10] threshold=0.8', () => {
    // sorted desc: [40,30,20,10], total=100
    // shares: 0.4, 0.3, 0.2, 0.1
    // cumulative: 0.4, 0.7, 0.9, 1.0
    // threshold=0.8 crossed at rank 2 (cumulative 0.9 >= 0.8)
    const r = paretoAnalysis([40, 30, 20, 10], 0.8);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.value.entries[0]!.value).toBe(40);
    expect(r.value.entries[0]!.share).toBeCloseTo(0.4);
    expect(r.value.entries[0]!.cumulativeShare).toBeCloseTo(0.4);
    expect(r.value.entries[1]!.cumulativeShare).toBeCloseTo(0.7);
    expect(r.value.entries[2]!.cumulativeShare).toBeCloseTo(0.9);
    expect(r.value.thresholdIndex).toBe(2);
  });

  it('80% threshold hit exactly at boundary', () => {
    // [50, 30, 20]: total=100, shares=0.5,0.3,0.2, cumulative=0.5,0.8,1.0
    // threshold=0.8 crossed at rank 1 (cumulative=0.8 >= 0.8)
    const r = paretoAnalysis([50, 30, 20], 0.8);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.value.thresholdIndex).toBe(1);
    expect(r.value.entries[1]!.cumulativeShare).toBeCloseTo(0.8);
  });

  it('single-element series: thresholdIndex=0', () => {
    const r = paretoAnalysis([100]);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.value.thresholdIndex).toBe(0);
    expect(r.value.entries[0]!.cumulativeShare).toBeCloseTo(1);
  });

  it('all-equal values distributes shares equally', () => {
    // [10,10,10,10]: total=40, each share=0.25
    const r = paretoAnalysis([10, 10, 10, 10], 0.8);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.value.entries[0]!.share).toBeCloseTo(0.25);
    expect(r.value.entries[3]!.cumulativeShare).toBeCloseTo(1);
  });

  it('rejects negative values with insufficient (H3)', () => {
    // [10,-5,3] previously produced shares 1.25/0.375/-0.625 with
    // non-monotonic cumulative and threshold landing at rank 0 - meaningless.
    const r = paretoAnalysis([10, -5, 3], 0.8);
    expect(r.kind).toBe('insufficient');
    if (r.kind !== 'insufficient') return;
    expect(r.reason).toContain('non-negative');
  });

  it('rejects a single negative value', () => {
    expect(paretoAnalysis([-1]).kind).toBe('insufficient');
  });

  it('all-zero values returns entries with share=0', () => {
    const r = paretoAnalysis([0, 0, 0]);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    for (const e of r.value.entries) {
      expect(e.share).toBe(0);
      expect(e.cumulativeShare).toBe(0);
    }
  });

  it('custom threshold=1.0 always selects last rank', () => {
    const r = paretoAnalysis([10, 5, 3, 2], 1.0);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.value.entries[r.value.thresholdIndex]!.cumulativeShare).toBeCloseTo(1);
  });
});

// ---------------------------------------------------------------------------
// bridge
// ---------------------------------------------------------------------------
describe('varianceBridge', () => {
  it('returns insufficient when both series empty', () => {
    expect(varianceBridge(new Map(), new Map()).kind).toBe('insufficient');
  });

  it('returns insufficient for non-finite values in before', () => {
    expect(varianceBridge(new Map([['a', NaN]]), new Map([['a', 1]])).kind).toBe('insufficient');
  });

  it('returns insufficient for non-finite values in after', () => {
    expect(varianceBridge(new Map([['a', 1]]), new Map([['a', Infinity]])).kind).toBe('insufficient');
  });

  it('only-changed keys: correct deltas', () => {
    // before: a=10, b=20; after: a=15, b=18
    // a: delta=5 changed; b: delta=-2 changed
    const r = varianceBridge({ a: 10, b: 20 }, { a: 15, b: 18 });
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    const byKey = Object.fromEntries(r.value.steps.map((s) => [s.key, s]));
    expect(byKey['a']!.delta).toBe(5);
    expect(byKey['a']!.kind).toBe('changed');
    expect(byKey['b']!.delta).toBe(-2);
    expect(byKey['b']!.kind).toBe('changed');
  });

  it('only-new keys (present only in after)', () => {
    const r = varianceBridge(new Map(), new Map([['x', 42]]));
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.value.steps).toHaveLength(1);
    expect(r.value.steps[0]!.kind).toBe('new');
    expect(r.value.steps[0]!.from).toBe(0);
    expect(r.value.steps[0]!.to).toBe(42);
    expect(r.value.steps[0]!.delta).toBe(42);
  });

  it('only-dropped keys (present only in before)', () => {
    const r = varianceBridge(new Map([['y', 10]]), new Map());
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.value.steps).toHaveLength(1);
    expect(r.value.steps[0]!.kind).toBe('dropped');
    expect(r.value.steps[0]!.from).toBe(10);
    expect(r.value.steps[0]!.to).toBe(0);
    expect(r.value.steps[0]!.delta).toBe(-10);
  });

  it('mixed new, dropped, changed', () => {
    // before: kept=100, gone=50; after: kept=120, fresh=30
    const before = new Map([['kept', 100], ['gone', 50]]);
    const after = new Map([['kept', 120], ['fresh', 30]]);
    const r = varianceBridge(before, after);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    const byKey = Object.fromEntries(r.value.steps.map((s) => [s.key, s]));
    expect(byKey['kept']!.kind).toBe('changed');
    expect(byKey['kept']!.delta).toBe(20);
    expect(byKey['fresh']!.kind).toBe('new');
    expect(byKey['fresh']!.delta).toBe(30);
    expect(byKey['gone']!.kind).toBe('dropped');
    expect(byKey['gone']!.delta).toBe(-50);
  });

  it('accepts Record input as well as Map', () => {
    const r = varianceBridge({ a: 5 }, { a: 10 });
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.value.steps[0]!.delta).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// distribution
// ---------------------------------------------------------------------------
describe('distributionStrip', () => {
  it('returns insufficient for empty values', () => {
    expect(distributionStrip([]).kind).toBe('insufficient');
  });

  it('returns insufficient for NaN in values', () => {
    expect(distributionStrip([1, NaN]).kind).toBe('insufficient');
  });

  it('returns insufficient for Infinity in values', () => {
    expect(distributionStrip([1, Infinity]).kind).toBe('insufficient');
  });

  it('returns insufficient for non-finite current', () => {
    expect(distributionStrip([1, 2, 3], NaN).kind).toBe('insufficient');
  });

  it('single-element: min=max=median=p25=p75=that element', () => {
    const r = distributionStrip([7]);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.value.min).toBe(7);
    expect(r.value.max).toBe(7);
    expect(r.value.p25).toBe(7);
    expect(r.value.median).toBe(7);
    expect(r.value.p75).toBe(7);
  });

  it('hand-computed: [1,2,3,4,5]', () => {
    // sorted=[1,2,3,4,5], n=5
    // p25: idx=0.25*4=1.0 -> sorted[1]=2
    // median: idx=0.5*4=2.0 -> sorted[2]=3
    // p75: idx=0.75*4=3.0 -> sorted[3]=4
    const r = distributionStrip([3, 1, 5, 2, 4]);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.value.min).toBe(1);
    expect(r.value.max).toBe(5);
    expect(r.value.p25).toBeCloseTo(2);
    expect(r.value.median).toBeCloseTo(3);
    expect(r.value.p75).toBeCloseTo(4);
  });

  it('hand-computed p25 on [2,4,6,8]: 3.5', () => {
    // sorted=[2,4,6,8], idx=0.25*3=0.75, lo=0(2),hi=1(4),frac=0.75, 2+0.75*2=3.5
    const r = distributionStrip([8, 2, 4, 6]);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.value.p25).toBeCloseTo(3.5);
  });

  it('current at min returns position 0', () => {
    const r = distributionStrip([0, 5, 10], 0);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.value.currentPosition).toBeCloseTo(0);
  });

  it('current at max returns position 1', () => {
    const r = distributionStrip([0, 5, 10], 10);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.value.currentPosition).toBeCloseTo(1);
  });

  it('current at median [0,10] returns 0.5', () => {
    const r = distributionStrip([0, 10], 5);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.value.currentPosition).toBeCloseTo(0.5);
  });

  it('all-equal values: currentPosition=0.5 when current matches', () => {
    const r = distributionStrip([5, 5, 5], 5);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.value.currentPosition).toBeCloseTo(0.5);
  });

  it('no current provided: currentPosition is null', () => {
    const r = distributionStrip([1, 2, 3]);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.value.currentPosition).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// deltas
// ---------------------------------------------------------------------------
describe('periodDeltas', () => {
  it('returns insufficient for empty series', () => {
    expect(periodDeltas(new Map(), 'MoM').kind).toBe('insufficient');
  });

  it('returns insufficient for non-finite value in series', () => {
    expect(periodDeltas(new Map([['2024-01-01', NaN]]), 'MoM').kind).toBe('insufficient');
  });

  it('MoM: entry with no prior month returns insufficient delta', () => {
    // only 2024-01 present, no 2023-12
    const r = periodDeltas(new Map([['2024-01-01', 100]]), 'MoM');
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.value.entries[0]!.delta.kind).toBe('insufficient');
  });

  it('MoM hand-computed: [2024-01-01=100, 2024-02-01=120]', () => {
    // 2024-01: prior=2023-12 (missing) -> insufficient
    // 2024-02: prior=2024-01=100, delta=20, deltaPercent=20%
    const series = new Map([['2024-01-01', 100], ['2024-02-01', 120]]);
    const r = periodDeltas(series, 'MoM');
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    const byDate = Object.fromEntries(r.value.entries.map((e) => [e.date, e]));
    expect(byDate['2024-01-01']!.delta.kind).toBe('insufficient');
    const feb = byDate['2024-02-01']!.delta;
    expect(feb.kind).toBe('ok');
    if (feb.kind !== 'ok') return;
    expect(feb.value.delta).toBeCloseTo(20);
    expect(feb.value.deltaPercent).toBeCloseTo(20);
  });

  it('MoM missing period gap returns insufficient for the skipped date', () => {
    // 2024-01-01=100, 2024-03-01=150 (no Feb)
    // 2024-03 needs prior=2024-02 which is absent -> insufficient
    const series = new Map([['2024-01-01', 100], ['2024-03-01', 150]]);
    const r = periodDeltas(series, 'MoM');
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    const byDate = Object.fromEntries(r.value.entries.map((e) => [e.date, e]));
    expect(byDate['2024-03-01']!.delta.kind).toBe('insufficient');
  });

  it('YoY hand-computed: 2023 and 2024', () => {
    // 2023-01-01=200, 2024-01-01=250: delta=50, deltaPercent=25%
    const series = new Map([['2023-01-01', 200], ['2024-01-01', 250]]);
    const r = periodDeltas(series, 'YoY');
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    const byDate = Object.fromEntries(r.value.entries.map((e) => [e.date, e]));
    expect(byDate['2023-01-01']!.delta.kind).toBe('insufficient');
    const y24 = byDate['2024-01-01']!.delta;
    expect(y24.kind).toBe('ok');
    if (y24.kind !== 'ok') return;
    expect(y24.value.delta).toBeCloseTo(50);
    expect(y24.value.deltaPercent).toBeCloseTo(25);
  });

  it('deltaPercent is null when prior=0 (avoid division by zero)', () => {
    const series = new Map([['2024-01-01', 0], ['2024-02-01', 10]]);
    const r = periodDeltas(series, 'MoM');
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    const feb = r.value.entries.find((e) => e.date === '2024-02-01')!.delta;
    expect(feb.kind).toBe('ok');
    if (feb.kind !== 'ok') return;
    expect(feb.value.deltaPercent).toBeNull();
  });

  it('accepts Record input', () => {
    const r = periodDeltas({ '2024-01-01': 50, '2024-02-01': 60 }, 'MoM');
    expect(r.kind).toBe('ok');
  });

  it('MoM resolves on month-end keys spanning Feb (H1 regression)', () => {
    // Month-end snapshot keys: Jan 31, Feb 29 (leap), Mar 31.
    // Old addMonths(2024-03-31, -1) overflowed to 2024-03-02 and matched
    // nothing, so EVERY entry returned insufficient. Year-month matching fixes it.
    const series = new Map([
      ['2024-01-31', 100],
      ['2024-02-29', 130],
      ['2024-03-31', 160],
    ]);
    const r = periodDeltas(series, 'MoM');
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    const byDate = Object.fromEntries(r.value.entries.map((e) => [e.date, e]));
    expect(byDate['2024-01-31']!.delta.kind).toBe('insufficient');
    const feb = byDate['2024-02-29']!.delta;
    expect(feb.kind).toBe('ok');
    if (feb.kind !== 'ok') return;
    // 130 - 100 = 30; 30/100*100 = 30%
    expect(feb.value.delta).toBeCloseTo(30);
    expect(feb.value.deltaPercent).toBeCloseTo(30);
    const mar = byDate['2024-03-31']!.delta;
    expect(mar.kind).toBe('ok');
    if (mar.kind !== 'ok') return;
    // 160 - 130 = 30; 30/130*100 ~= 23.0769%
    expect(mar.value.delta).toBeCloseTo(30);
    expect(mar.value.deltaPercent).toBeCloseTo((30 / 130) * 100);
  });

  it('YoY resolves on month-end keys across a year (H1 regression)', () => {
    // 2023-02-28 (non-leap) -> 2024-02-29 (leap): prior month 2023-02 found.
    const series = new Map([
      ['2023-02-28', 200],
      ['2024-02-29', 260],
    ]);
    const r = periodDeltas(series, 'YoY');
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    const byDate = Object.fromEntries(r.value.entries.map((e) => [e.date, e]));
    expect(byDate['2023-02-28']!.delta.kind).toBe('insufficient');
    const y24 = byDate['2024-02-29']!.delta;
    expect(y24.kind).toBe('ok');
    if (y24.kind !== 'ok') return;
    // 260 - 200 = 60; 60/200*100 = 30%
    expect(y24.value.delta).toBeCloseTo(60);
    expect(y24.value.deltaPercent).toBeCloseTo(30);
  });

  it('YoY crosses year boundary correctly for December (H1)', () => {
    // 2023-12-15 -> 2024-12-15: prior year-month 2023-12 must resolve.
    const series = new Map([
      ['2023-12-15', 50],
      ['2024-12-15', 75],
    ]);
    const r = periodDeltas(series, 'YoY');
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    const dec24 = r.value.entries.find((e) => e.date === '2024-12-15')!.delta;
    expect(dec24.kind).toBe('ok');
    if (dec24.kind !== 'ok') return;
    expect(dec24.value.delta).toBeCloseTo(25);
  });

  it('MoM crosses January->December year boundary (H1)', () => {
    // 2024-01 prior month is 2023-12.
    const series = new Map([
      ['2023-12-01', 80],
      ['2024-01-01', 100],
    ]);
    const r = periodDeltas(series, 'MoM');
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    const jan = r.value.entries.find((e) => e.date === '2024-01-01')!.delta;
    expect(jan.kind).toBe('ok');
    if (jan.kind !== 'ok') return;
    expect(jan.value.delta).toBeCloseTo(20);
  });

  it('negative prior: deltaPercent semantics pinned to delta/abs(prior) (M1)', () => {
    // prior = -50 (Jan), value = -30 (Feb). delta = -30 - (-50) = 20.
    // Intended semantics: percent magnitude relative to |prior|, signed by delta.
    // 20 / abs(-50) * 100 = +40%. A move from -50 to -30 is a +20 absolute
    // improvement; percent is positive because delta is positive.
    const series = new Map([['2024-01-01', -50], ['2024-02-01', -30]]);
    const r = periodDeltas(series, 'MoM');
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    const feb = r.value.entries.find((e) => e.date === '2024-02-01')!.delta;
    expect(feb.kind).toBe('ok');
    if (feb.kind !== 'ok') return;
    expect(feb.value.prior).toBe(-50);
    expect(feb.value.delta).toBeCloseTo(20);
    expect(feb.value.deltaPercent).toBeCloseTo(40);
  });

  it('negative prior with further decline gives negative percent (M1)', () => {
    // prior = -50, value = -80. delta = -30. -30/abs(-50)*100 = -60%.
    const series = new Map([['2024-01-01', -50], ['2024-02-01', -80]]);
    const r = periodDeltas(series, 'MoM');
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    const feb = r.value.entries.find((e) => e.date === '2024-02-01')!.delta;
    expect(feb.kind).toBe('ok');
    if (feb.kind !== 'ok') return;
    expect(feb.value.deltaPercent).toBeCloseTo(-60);
  });

  it('returns insufficient for malformed date keys (H1 guard)', () => {
    const r = periodDeltas(new Map([['not-a-date', 5]]), 'MoM');
    expect(r.kind).toBe('insufficient');
  });
});

// ---------------------------------------------------------------------------
// anomaly
// ---------------------------------------------------------------------------
describe('anomalyFlags', () => {
  it('returns insufficient for empty series', () => {
    expect(anomalyFlags([], []).kind).toBe('insufficient');
  });

  it('returns insufficient when band is empty', () => {
    const r = rollingStats([1, 2, 3], 3, 2);
    expect(anomalyFlags([1, 2, 3], []).kind).toBe('insufficient');
  });

  it('returns insufficient when lengths differ', () => {
    const band = [{ mean: 5, stddev: 1, upper: 7, lower: 3 }];
    expect(anomalyFlags([1, 2], band).kind).toBe('insufficient');
  });

  it('returns insufficient for NaN in series', () => {
    const band = [{ mean: 0, stddev: 0, upper: 1, lower: -1 }];
    expect(anomalyFlags([NaN], band).kind).toBe('insufficient');
  });

  it('returns insufficient for non-finite band bounds', () => {
    const band = [{ mean: 0, stddev: 0, upper: Infinity, lower: 0 }];
    expect(anomalyFlags([5], band).kind).toBe('insufficient');
  });

  it('no anomalies when all values within band', () => {
    const band = [
      { mean: 5, stddev: 1, upper: 7, lower: 3 },
      { mean: 5, stddev: 1, upper: 7, lower: 3 },
    ];
    const r = anomalyFlags([5, 6], band);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.value.flags).toHaveLength(0);
  });

  it('flags point above upper band with correct magnitude', () => {
    // value=10, upper=7 -> magnitude=3, side=above
    const band = [{ mean: 5, stddev: 1, upper: 7, lower: 3 }];
    const r = anomalyFlags([10], band);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.value.flags).toHaveLength(1);
    expect(r.value.flags[0]!.side).toBe('above');
    expect(r.value.flags[0]!.magnitude).toBeCloseTo(3);
    expect(r.value.flags[0]!.index).toBe(0);
  });

  it('flags point below lower band with correct magnitude', () => {
    // value=1, lower=3 -> magnitude=2, side=below
    const band = [{ mean: 5, stddev: 1, upper: 7, lower: 3 }];
    const r = anomalyFlags([1], band);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.value.flags).toHaveLength(1);
    expect(r.value.flags[0]!.side).toBe('below');
    expect(r.value.flags[0]!.magnitude).toBeCloseTo(2);
  });

  it('value exactly on upper boundary is NOT flagged', () => {
    const band = [{ mean: 5, stddev: 1, upper: 7, lower: 3 }];
    const r = anomalyFlags([7], band);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.value.flags).toHaveLength(0);
  });

  it('value exactly on lower boundary is NOT flagged', () => {
    const band = [{ mean: 5, stddev: 1, upper: 7, lower: 3 }];
    const r = anomalyFlags([3], band);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.value.flags).toHaveLength(0);
  });

  it('mixed series: correct flags and indices', () => {
    // series=[5, 10, 4, 1], band: all upper=7, lower=3
    // index 1 (value=10 > 7): above, magnitude=3
    // index 3 (value=1 < 3): below, magnitude=2
    const band = Array(4).fill({ mean: 5, stddev: 1, upper: 7, lower: 3 });
    const r = anomalyFlags([5, 10, 4, 1], band);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.value.flags).toHaveLength(2);
    const f0 = r.value.flags[0]!;
    const f1 = r.value.flags[1]!;
    expect(f0.index).toBe(1);
    expect(f0.side).toBe('above');
    expect(f0.magnitude).toBeCloseTo(3);
    expect(f1.index).toBe(3);
    expect(f1.side).toBe('below');
    expect(f1.magnitude).toBeCloseTo(2);
  });

  it('integrates with rollingStats band output', () => {
    const series = [2, 4, 6, 8, 20];
    const rollingResult = rollingStats(series, 3, 1);
    expect(rollingResult.kind).toBe('ok');
    if (rollingResult.kind !== 'ok') return;
    const r = anomalyFlags(series, rollingResult.value.points);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    const lastFlag = r.value.flags.find((f) => f.index === 4);
    expect(lastFlag).toBeDefined();
    expect(lastFlag!.side).toBe('above');
  });
});
