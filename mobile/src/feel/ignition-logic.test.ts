import { afterEach, describe, expect, it } from 'vitest';
import {
  arcDashArray,
  arcSpan,
  clamp01,
  dashOffsetForFraction,
  gaugeTicks,
  ignitionHasPlayed,
  IGNITION_FADE_MS,
  IGNITION_KEYSET_MS,
  IGNITION_REVEAL_MS,
  IGNITION_SPRING,
  IGNITION_TOTAL_MS,
  markIgnitionPlayed,
  MAX_NEEDLE_FRACTION,
  needleAngleDeg,
  polarPoint,
  resetIgnitionForTests,
  springOvershootFraction,
  SWEEP_DEGREES,
  SWEEP_START_DEGREES,
  TICK_MAJOR_EVERY_NTH,
} from './ignition-logic';


describe('once-per-launch latch', () => {
  afterEach(() => resetIgnitionForTests());

  it('starts unplayed on a cold launch (fresh module state)', () => {
    expect(ignitionHasPlayed()).toBe(false);
  });

  it('latches once played', () => {
    markIgnitionPlayed();
    expect(ignitionHasPlayed()).toBe(true);
  });

  it('is idempotent — marking again changes nothing', () => {
    markIgnitionPlayed();
    markIgnitionPlayed();
    expect(ignitionHasPlayed()).toBe(true);
  });

  it('survives across callers: a second mount of ANY component sees played=true', () => {
    markIgnitionPlayed();
    const secondMountSeesPlayed = ignitionHasPlayed();
    const thirdMountSeesPlayed = ignitionHasPlayed();
    expect(secondMountSeesPlayed).toBe(true);
    expect(thirdMountSeesPlayed).toBe(true);
  });

  it('only the test reset (bundle restart stand-in) clears the latch', () => {
    markIgnitionPlayed();
    resetIgnitionForTests();
    expect(ignitionHasPlayed()).toBe(false);
  });
});


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


describe('arcSpan', () => {
  it('covers exactly the 270° gauge throw', () => {
    const s = arcSpan(46);
    expect(SWEEP_DEGREES).toBe(270);
    expect(s.circumference).toBeCloseTo(2 * Math.PI * 46, 10);
    expect(s.arcLength).toBeCloseTo(s.circumference * 0.75, 10);
  });

  it('rejects degenerate radii', () => {
    expect(() => arcSpan(0)).toThrow();
    expect(() => arcSpan(-10)).toThrow();
    expect(() => arcSpan(NaN)).toThrow();
  });
});

describe('arcDashArray', () => {
  it('is one sweep-length dash + a gap longer than the remainder (no wrap)', () => {
    const s = arcSpan(46);
    expect(arcDashArray(s)).toBe(`${s.arcLength} ${s.circumference}`);
  });
});

describe('dashOffsetForFraction', () => {
  const s = arcSpan(45);

  it('hides the whole arc at 0 and reveals all of it at 1', () => {
    expect(dashOffsetForFraction(s, 0)).toBeCloseTo(s.arcLength, 10);
    expect(dashOffsetForFraction(s, 1)).toBe(0);
  });

  it('is linear in the fraction', () => {
    expect(dashOffsetForFraction(s, 0.5)).toBeCloseTo(s.arcLength / 2, 10);
    expect(dashOffsetForFraction(s, 0.25)).toBeCloseTo(s.arcLength * 0.75, 10);
  });

  it('clamps wild fractions instead of drawing garbage', () => {
    expect(dashOffsetForFraction(s, -3)).toBeCloseTo(s.arcLength, 10);
    expect(dashOffsetForFraction(s, 42)).toBe(0);
    expect(dashOffsetForFraction(s, NaN)).toBeCloseTo(s.arcLength, 10);
  });
});


describe('needleAngleDeg', () => {
  it('rests at the gauge start and lands at full throw', () => {
    expect(needleAngleDeg(0)).toBe(SWEEP_START_DEGREES);
    expect(needleAngleDeg(1)).toBe(SWEEP_START_DEGREES + SWEEP_DEGREES);
  });

  it('allows the spring overshoot to carry past the end-stop…', () => {
    expect(needleAngleDeg(1.05)).toBeGreaterThan(SWEEP_START_DEGREES + SWEEP_DEGREES);
  });

  it('…but never past the mechanical stop', () => {
    expect(needleAngleDeg(9)).toBe(SWEEP_START_DEGREES + MAX_NEEDLE_FRACTION * SWEEP_DEGREES);
  });

  it('treats garbage as the rest position', () => {
    expect(needleAngleDeg(NaN)).toBe(SWEEP_START_DEGREES);
    expect(needleAngleDeg(-2)).toBe(SWEEP_START_DEGREES);
  });
});

describe('gaugeTicks', () => {
  const ticks = gaugeTicks();

  it('spans the full throw, ends inclusive', () => {
    expect(ticks[0]!.angleDeg).toBe(SWEEP_START_DEGREES);
    expect(ticks[ticks.length - 1]!.angleDeg).toBeCloseTo(SWEEP_START_DEGREES + SWEEP_DEGREES, 10);
    expect(ticks[0]!.fraction).toBe(0);
    expect(ticks[ticks.length - 1]!.fraction).toBe(1);
  });

  it('graduates: both end-stops are major, majors land every Nth tick', () => {
    expect(ticks[0]!.major).toBe(true);
    expect(ticks[ticks.length - 1]!.major).toBe(true);
    ticks.forEach((t, i) => expect(t.major).toBe(i % TICK_MAJOR_EVERY_NTH === 0));
  });

  it('default graduation reads as an instrument: 41 minors, 9 majors', () => {
    expect(ticks).toHaveLength(41);
    expect(ticks.filter((t) => t.major)).toHaveLength(9);
  });

  it('rejects degenerate graduations', () => {
    expect(() => gaugeTicks(0)).toThrow();
    expect(() => gaugeTicks(400)).toThrow();
    expect(() => gaugeTicks(9, 0)).toThrow();
    expect(() => gaugeTicks(9, 2.5)).toThrow();
  });
});

describe('polarPoint', () => {
  it('walks the compass correctly (SVG: 0° right, 90° down)', () => {
    const r = 10;
    expect(polarPoint(0, 0, r, 0).x).toBeCloseTo(10, 10);
    expect(polarPoint(0, 0, r, 0).y).toBeCloseTo(0, 10);
    expect(polarPoint(0, 0, r, 90).y).toBeCloseTo(10, 10);
    expect(polarPoint(0, 0, r, 180).x).toBeCloseTo(-10, 10);
  });

  it('offsets from the given center', () => {
    const p = polarPoint(50, 60, 10, 0);
    expect(p.x).toBeCloseTo(60, 10);
    expect(p.y).toBeCloseTo(60, 10);
  });
});


describe('ceremony timeline', () => {
  it('fits the D6 budget: the app is fully revealed within 1400 ms', () => {
    expect(IGNITION_TOTAL_MS).toBe(IGNITION_REVEAL_MS + IGNITION_FADE_MS);
    expect(IGNITION_TOTAL_MS).toBeLessThanOrEqual(1400);
  });

  it('light arrives before motion, and the fade is a real reveal', () => {
    expect(IGNITION_KEYSET_MS).toBeGreaterThan(0);
    expect(IGNITION_KEYSET_MS).toBeLessThan(IGNITION_REVEAL_MS);
    expect(IGNITION_FADE_MS).toBeGreaterThanOrEqual(200);
  });
});

describe('ignition spring', () => {
  it('is underdamped: ONE proud overshoot exists (the haptic apex)', () => {
    expect(springOvershootFraction(IGNITION_SPRING)).toBeGreaterThan(0.03);
  });

  it('overshoots with restraint — slight, not toy bounce', () => {
    expect(springOvershootFraction(IGNITION_SPRING)).toBeLessThan(0.1);
  });

  it('its overshoot fits inside the needle’s mechanical stop', () => {
    expect(1 + springOvershootFraction(IGNITION_SPRING)).toBeLessThan(MAX_NEEDLE_FRACTION);
  });

  it('reports zero overshoot for critically/over-damped springs', () => {
    expect(springOvershootFraction({ mass: 1, stiffness: 100, damping: 20 })).toBe(0);
    expect(springOvershootFraction({ mass: 1, stiffness: 100, damping: 25 })).toBe(0);
  });

  it('rejects an undamped spring (it would never settle)', () => {
    expect(() => springOvershootFraction({ mass: 1, stiffness: 100, damping: 0 })).toThrow();
  });
});
