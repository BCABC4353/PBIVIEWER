/**
 * ignition-logic.test — pure node tests for the Ignition Sweep brain.
 * No react-native, no expo, no mocks of either: if anything in here needs a
 * native import, the logic has leaked out of the pure layer.
 */
import { describe, expect, it } from 'vitest';
import {
  advanceSweep,
  arcDashArray,
  arcGeometry,
  arcTargetFraction,
  CATCH_CEILING,
  clamp01,
  dashOffsetForFraction,
  detentTicks,
  initialSweepState,
  SWEEP_DEGREES,
  type SweepState,
} from './ignition-logic';

// ---------------------------------------------------------------------------
// clamp01
// ---------------------------------------------------------------------------

describe('clamp01', () => {
  it('passes in-range values through', () => {
    expect(clamp01(0)).toBe(0);
    expect(clamp01(0.37)).toBe(0.37);
    expect(clamp01(1)).toBe(1);
  });

  it('clamps out-of-range values', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
  });

  it('treats non-finite input as zero — never a NaN needle', () => {
    expect(clamp01(NaN)).toBe(0);
    expect(clamp01(Infinity)).toBe(0);
    expect(clamp01(-Infinity)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Arc math
// ---------------------------------------------------------------------------

describe('arcGeometry', () => {
  it('insets the radius so the stroke never clips the viewbox', () => {
    const g = arcGeometry(100, 8);
    expect(g.center).toBe(50);
    expect(g.radius).toBe(46); // (100 - 8) / 2
    expect(g.circumference).toBeCloseTo(2 * Math.PI * 46, 10);
  });

  it('covers exactly the 270° gauge throw', () => {
    const g = arcGeometry(96, 6);
    expect(SWEEP_DEGREES).toBe(270);
    expect(g.arcLength).toBeCloseTo(g.circumference * 0.75, 10);
  });

  it('rejects degenerate inputs', () => {
    expect(() => arcGeometry(0, 4)).toThrow();
    expect(() => arcGeometry(-10, 4)).toThrow();
    expect(() => arcGeometry(100, 0)).toThrow();
    expect(() => arcGeometry(100, 60)).toThrow(); // stroke can't fit
  });
});

describe('arcDashArray', () => {
  it('is one sweep-length dash + a gap longer than the remainder (no wrap)', () => {
    const g = arcGeometry(100, 8);
    expect(arcDashArray(g)).toBe(`${g.arcLength} ${g.circumference}`);
  });
});

describe('dashOffsetForFraction', () => {
  const g = arcGeometry(96, 6);

  it('hides the whole arc at 0 and reveals all of it at 1', () => {
    expect(dashOffsetForFraction(g, 0)).toBeCloseTo(g.arcLength, 10);
    expect(dashOffsetForFraction(g, 1)).toBe(0);
  });

  it('is linear in the fraction', () => {
    expect(dashOffsetForFraction(g, 0.5)).toBeCloseTo(g.arcLength / 2, 10);
    expect(dashOffsetForFraction(g, 0.25)).toBeCloseTo(g.arcLength * 0.75, 10);
  });

  it('clamps wild fractions instead of drawing garbage', () => {
    expect(dashOffsetForFraction(g, -3)).toBeCloseTo(g.arcLength, 10);
    expect(dashOffsetForFraction(g, 42)).toBe(0);
    expect(dashOffsetForFraction(g, NaN)).toBeCloseTo(g.arcLength, 10);
  });
});

// ---------------------------------------------------------------------------
// Detent logic — honest ticks only
// ---------------------------------------------------------------------------

describe('detentTicks', () => {
  it('counts new items landing', () => {
    expect(detentTicks(0, 1)).toBe(1);
    expect(detentTicks(3, 7)).toBe(4);
  });

  it('never ticks when nothing new landed', () => {
    expect(detentTicks(5, 5)).toBe(0);
  });

  it('never ticks on a reset/decrease — no phantom detents', () => {
    expect(detentTicks(8, 0)).toBe(0);
    expect(detentTicks(3, 2)).toBe(0);
  });

  it('floors fractional counts (only whole real items click)', () => {
    expect(detentTicks(0.9, 1.2)).toBe(1);
    expect(detentTicks(1.1, 1.9)).toBe(0);
  });

  it('treats garbage as silence', () => {
    expect(detentTicks(NaN, 4)).toBe(0);
    expect(detentTicks(0, Infinity)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Settle-state machine
// ---------------------------------------------------------------------------

describe('advanceSweep', () => {
  it('starts sweeping with no catch position', () => {
    expect(initialSweepState()).toEqual({ phase: 'sweeping', catchAt: null });
  });

  it('keeps sweeping silently while loading is honest and incomplete', () => {
    const r = advanceSweep(initialSweepState(), 0.4, false);
    expect(r.state.phase).toBe('sweeping');
    expect(r.haptic).toBeNull();
    expect(r.justSettled).toBe(false);
    expect(r.justCaught).toBe(false);
  });

  it('settles clean at progress 1: confirm haptic + onSettled cue, exactly once', () => {
    const first = advanceSweep(initialSweepState(), 1, false);
    expect(first.state.phase).toBe('settled');
    expect(first.haptic).toBe('confirm');
    expect(first.justSettled).toBe(true);

    // Re-advance with the same readings: terminal, silent, no double haptic.
    const again = advanceSweep(first.state, 1, false);
    expect(again.state.phase).toBe('settled');
    expect(again.haptic).toBeNull();
    expect(again.justSettled).toBe(false);
  });

  it('catches mid-sweep at the proportional position with a fault', () => {
    const r = advanceSweep(initialSweepState(), 0.4, true);
    expect(r.state).toEqual({ phase: 'caught', catchAt: 0.4 });
    expect(r.haptic).toBe('fault');
    expect(r.justCaught).toBe(true);
    expect(r.justSettled).toBe(false);
  });

  it('a catch at completion halts visibly short of the clean end-stop', () => {
    // Single-resolve DataSource: failure only known at progress 1.
    const r = advanceSweep(initialSweepState(), 1, true);
    expect(r.state.phase).toBe('caught');
    expect(r.state.catchAt).toBe(CATCH_CEILING);
    expect(CATCH_CEILING).toBeLessThan(1);
  });

  it('failure outranks completion when both arrive together', () => {
    const r = advanceSweep(initialSweepState(), 1, true);
    expect(r.state.phase).toBe('caught');
    expect(r.haptic).toBe('fault');
  });

  it('caught is absorbing: later readings cannot revive the needle', () => {
    const caught = advanceSweep(initialSweepState(), 0.6, true).state;
    const r = advanceSweep(caught, 1, false);
    expect(r.state).toEqual(caught);
    expect(r.haptic).toBeNull();
    expect(r.justSettled).toBe(false);
    expect(r.justCaught).toBe(false);
  });

  it('settled is absorbing: a late failed flip cannot un-settle the gauge', () => {
    const settled = advanceSweep(initialSweepState(), 1, false).state;
    const r = advanceSweep(settled, 0.2, true);
    expect(r.state).toEqual(settled);
    expect(r.haptic).toBeNull();
    expect(r.justCaught).toBe(false);
  });

  it('clamps insane progress before judging completion', () => {
    expect(advanceSweep(initialSweepState(), 7, false).state.phase).toBe('settled');
    expect(advanceSweep(initialSweepState(), NaN, false).state.phase).toBe('sweeping');
    expect(advanceSweep(initialSweepState(), -2, true).state.catchAt).toBe(0);
  });
});

describe('arcTargetFraction', () => {
  it('chases live progress while sweeping (clamped)', () => {
    const s = initialSweepState();
    expect(arcTargetFraction(s, 0.3)).toBe(0.3);
    expect(arcTargetFraction(s, -1)).toBe(0);
    expect(arcTargetFraction(s, 2)).toBe(1);
  });

  it('pins to the end-stop when settled, regardless of prop noise', () => {
    const settled = advanceSweep(initialSweepState(), 1, false).state;
    expect(arcTargetFraction(settled, 0.1)).toBe(1);
  });

  it('freezes at the catch position when caught', () => {
    const caught = advanceSweep(initialSweepState(), 0.55, true).state;
    expect(arcTargetFraction(caught, 1)).toBe(0.55);
  });

  it('falls back to the ceiling if a caught state lost its position', () => {
    const weird: SweepState = { phase: 'caught', catchAt: null };
    expect(arcTargetFraction(weird, 1)).toBe(CATCH_CEILING);
  });
});
