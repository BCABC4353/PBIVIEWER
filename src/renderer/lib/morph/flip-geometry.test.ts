import { describe, it, expect } from 'vitest';
import {
  invert,
  applyTransform,
  interpolateRect,
  transformFromRects,
  transformToCss,
  morphTransformAt,
  crossfadeOpacities,
} from './flip-geometry';
import type { Rect, Transform } from './flip-geometry';

const EPS = 1e-6;

function closeRect(a: Rect, b: Rect, eps = EPS): boolean {
  return (
    Math.abs(a.x - b.x) < eps &&
    Math.abs(a.y - b.y) < eps &&
    Math.abs(a.width - b.width) < eps &&
    Math.abs(a.height - b.height) < eps
  );
}

function closeTransform(a: Transform, b: Transform, eps = EPS): boolean {
  return (
    Math.abs(a.translateX - b.translateX) < eps &&
    Math.abs(a.translateY - b.translateY) < eps &&
    Math.abs(a.scaleX - b.scaleX) < eps &&
    Math.abs(a.scaleY - b.scaleY) < eps
  );
}

const tile: Rect = { x: 40, y: 80, width: 160, height: 90 };
const sheet: Rect = { x: 0, y: 0, width: 800, height: 600 };
const offset: Rect = { x: 200, y: 300, width: 300, height: 200 };
const tall: Rect = { x: 10, y: 10, width: 50, height: 400 };
const zeroBoth: Rect = { x: 5, y: 5, width: 0, height: 0 };

describe('invert + applyTransform round-trip', () => {
  it('round-trips tile->sheet', () => {
    expect(closeRect(applyTransform(sheet, invert(tile, sheet)), tile)).toBe(true);
  });

  it('round-trips offset->sheet', () => {
    expect(closeRect(applyTransform(sheet, invert(offset, sheet)), offset)).toBe(true);
  });

  it('round-trips tall->sheet (different aspect ratios)', () => {
    expect(closeRect(applyTransform(sheet, invert(tall, sheet)), tall)).toBe(true);
  });

  it('round-trips when from and to have same dimensions (translation only)', () => {
    const a: Rect = { x: 10, y: 20, width: 100, height: 50 };
    const b: Rect = { x: 50, y: 70, width: 100, height: 50 };
    expect(closeRect(applyTransform(b, invert(a, b)), a)).toBe(true);
  });

  it('round-trips when from equals to (identity)', () => {
    expect(closeRect(applyTransform(tile, invert(tile, tile)), tile)).toBe(true);
  });

  it('invert is NOT trivially identity: scale components differ when rects differ in size', () => {
    const t = invert(tile, sheet);
    expect(Math.abs(t.scaleX - 1) > 0.01 || Math.abs(t.scaleY - 1) > 0.01).toBe(true);
  });
});

describe('interpolateRect', () => {
  it('at p=0 returns a exactly', () => {
    expect(closeRect(interpolateRect(tile, sheet, 0), tile)).toBe(true);
  });

  it('at p=1 returns b exactly', () => {
    expect(closeRect(interpolateRect(tile, sheet, 1), sheet)).toBe(true);
  });

  it('at p=0.5 returns midpoint', () => {
    const r = interpolateRect(tile, sheet, 0.5);
    expect(r.x).toBeCloseTo((tile.x + sheet.x) / 2, 6);
    expect(r.y).toBeCloseTo((tile.y + sheet.y) / 2, 6);
    expect(r.width).toBeCloseTo((tile.width + sheet.width) / 2, 6);
    expect(r.height).toBeCloseTo((tile.height + sheet.height) / 2, 6);
  });

  it('is monotonic across p={0,0.25,0.5,0.75,1} when a < b', () => {
    const a: Rect = { x: 0, y: 0, width: 10, height: 10 };
    const b: Rect = { x: 100, y: 200, width: 500, height: 400 };
    const rects = [0, 0.25, 0.5, 0.75, 1].map((p) => interpolateRect(a, b, p));
    for (let i = 1; i < rects.length; i++) {
      expect(rects[i]!.x).toBeGreaterThanOrEqual(rects[i - 1]!.x);
      expect(rects[i]!.y).toBeGreaterThanOrEqual(rects[i - 1]!.y);
      expect(rects[i]!.width).toBeGreaterThanOrEqual(rects[i - 1]!.width);
      expect(rects[i]!.height).toBeGreaterThanOrEqual(rects[i - 1]!.height);
    }
  });

  it('is monotonic when a > b (shrinking path)', () => {
    const a: Rect = { x: 100, y: 200, width: 500, height: 400 };
    const b: Rect = { x: 0, y: 0, width: 10, height: 10 };
    const rects = [0, 0.25, 0.5, 0.75, 1].map((p) => interpolateRect(a, b, p));
    for (let i = 1; i < rects.length; i++) {
      expect(rects[i]!.x).toBeLessThanOrEqual(rects[i - 1]!.x);
      expect(rects[i]!.width).toBeLessThanOrEqual(rects[i - 1]!.width);
    }
  });
});

describe('morphTransformAt', () => {
  it('at p=0 the visual rect equals tileRect', () => {
    expect(closeRect(applyTransform(sheet, morphTransformAt(tile, sheet, 0)), tile)).toBe(true);
  });

  it('at p=1 the visual rect equals sheetRect (identity transform)', () => {
    expect(closeRect(applyTransform(sheet, morphTransformAt(tile, sheet, 1)), sheet)).toBe(true);
  });

  it('produced visual rect sequence is monotonic per axis (open direction)', () => {
    const rects = [0, 0.25, 0.5, 0.75, 1].map((p) =>
      applyTransform(sheet, morphTransformAt(tile, sheet, p)),
    );
    for (let i = 1; i < rects.length; i++) {
      expect(rects[i]!.x).toBeLessThanOrEqual(rects[i - 1]!.x + EPS);
      expect(rects[i]!.width).toBeGreaterThanOrEqual(rects[i - 1]!.width - EPS);
    }
  });

  it('gap between consecutive visual rects never exceeds total axis delta', () => {
    const totalDx = Math.abs(sheet.x - tile.x);
    const rects = [0, 0.25, 0.5, 0.75, 1].map((p) =>
      applyTransform(sheet, morphTransformAt(tile, sheet, p)),
    );
    for (let i = 1; i < rects.length; i++) {
      expect(Math.abs(rects[i]!.x - rects[i - 1]!.x)).toBeLessThanOrEqual(totalDx + EPS);
    }
  });

  it('close is exact inverse of open: forward p and reverse (1-p) describe same on-screen rect', () => {
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      const forward = applyTransform(sheet, morphTransformAt(tile, sheet, p));
      const reverse = applyTransform(tile, morphTransformAt(sheet, tile, 1 - p));
      expect(closeRect(forward, reverse)).toBe(true);
    }
  });
});

describe('transformFromRects', () => {
  it('maps target layout box to current desired position', () => {
    expect(closeRect(applyTransform(sheet, transformFromRects(offset, sheet)), offset)).toBe(true);
  });

  it('identity when current equals target', () => {
    const t = transformFromRects(tile, tile);
    expect(closeTransform(t, { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 })).toBe(true);
  });
});

describe('transformToCss', () => {
  it('produces translate(Xpx, Ypx) scale(sx, sy) format', () => {
    const t: Transform = { translateX: 10, translateY: -20, scaleX: 0.5, scaleY: 2 };
    expect(transformToCss(t)).toBe('translate(10px, -20px) scale(0.5, 2)');
  });

  it('translate comes before scale in the string', () => {
    const css = transformToCss({ translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 });
    expect(css.indexOf('translate')).toBeLessThan(css.indexOf('scale'));
  });

  it('encodes exact numeric values from invert result', () => {
    const t = invert(tile, sheet);
    const css = transformToCss(t);
    expect(css).toContain(t.translateX.toString());
    expect(css).toContain(t.scaleX.toString());
  });

  it('identity transform produces canonical zero/one literals', () => {
    expect(transformToCss({ translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 })).toBe(
      'translate(0px, 0px) scale(1, 1)',
    );
  });
});

describe('degenerate / zero-dimension rects', () => {
  it('invert with zero-width target does not produce NaN or Infinity', () => {
    const t = invert(tile, { x: 10, y: 20, width: 0, height: 100 });
    expect(Number.isFinite(t.scaleX)).toBe(true);
    expect(Number.isFinite(t.scaleY)).toBe(true);
  });

  it('invert with zero-height target does not produce NaN or Infinity', () => {
    const t = invert(tile, { x: 10, y: 20, width: 100, height: 0 });
    expect(Number.isFinite(t.scaleX)).toBe(true);
    expect(Number.isFinite(t.scaleY)).toBe(true);
  });

  it('invert with zero both dimensions falls back to scaleX=1 and scaleY=1', () => {
    const t = invert(tile, zeroBoth);
    expect(t.scaleX).toBe(1);
    expect(t.scaleY).toBe(1);
  });

  it('morphTransformAt with zero-dimension sheet stays finite at all p', () => {
    for (const p of [0, 0.5, 1]) {
      const t = morphTransformAt(tile, zeroBoth, p);
      expect(Number.isFinite(t.translateX)).toBe(true);
      expect(Number.isFinite(t.scaleX)).toBe(true);
    }
  });

  it('transformToCss with degenerate transform contains no NaN or Infinity', () => {
    const css = transformToCss(invert(tile, zeroBoth));
    expect(css).not.toContain('NaN');
    expect(css).not.toContain('Infinity');
  });
});

describe('negative / large offsets', () => {
  it('handles element scrolled off-screen (negative coords)', () => {
    const offScreen: Rect = { x: -500, y: -300, width: 120, height: 80 };
    expect(closeRect(applyTransform(sheet, invert(offScreen, sheet)), offScreen)).toBe(true);
  });

  it('handles very large sheet rect', () => {
    const bigSheet: Rect = { x: 0, y: 0, width: 8000, height: 6000 };
    expect(closeRect(applyTransform(bigSheet, invert(tile, bigSheet)), tile)).toBe(true);
  });

  it('handles large offsets and extreme aspect ratios without overflow', () => {
    const a: Rect = { x: 9000, y: 7000, width: 1, height: 5000 };
    const b: Rect = { x: 0, y: 0, width: 10000, height: 1 };
    const t = invert(a, b);
    expect(Number.isFinite(t.scaleX)).toBe(true);
    expect(Number.isFinite(t.scaleY)).toBe(true);
    expect(closeRect(applyTransform(b, t), a)).toBe(true);
  });

  it('morphTransformAt stays finite with large negative tile offset', () => {
    const negTile: Rect = { x: -2000, y: -1500, width: 200, height: 150 };
    for (const p of [0, 0.5, 1]) {
      const t = morphTransformAt(negTile, sheet, p);
      expect(Number.isFinite(t.translateX)).toBe(true);
      expect(Number.isFinite(t.scaleX)).toBe(true);
    }
  });
});

describe('crossfadeOpacities', () => {
  it('at p=0 source=1 target=0; at p=1 source=0 target=1', () => {
    expect(crossfadeOpacities(0)).toEqual({ source: 1, target: 0 });
    expect(crossfadeOpacities(1)).toEqual({ source: 0, target: 1 });
  });

  it('at p=0.5 both are 0.5', () => {
    const o = crossfadeOpacities(0.5);
    expect(o.source).toBeCloseTo(0.5, 6);
    expect(o.target).toBeCloseTo(0.5, 6);
  });

  it('source + target always sums to 1', () => {
    for (const p of [0, 0.1, 0.3, 0.7, 0.9, 1]) {
      const o = crossfadeOpacities(p);
      expect(o.source + o.target).toBeCloseTo(1, 6);
    }
  });
});
