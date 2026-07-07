import { describe, it, expect } from 'vitest';
import {
  interpolateRect,
  rectToCss,
  crossfadeOpacities,
} from './flip-geometry';
import type { Rect } from './flip-geometry';

const EPS = 1e-6;

function closeRect(a: Rect, b: Rect, eps = EPS): boolean {
  return (
    Math.abs(a.x - b.x) < eps &&
    Math.abs(a.y - b.y) < eps &&
    Math.abs(a.width - b.width) < eps &&
    Math.abs(a.height - b.height) < eps
  );
}

const tile: Rect = { x: 40, y: 80, width: 160, height: 90 };
const sheet: Rect = { x: 0, y: 0, width: 800, height: 600 };

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

describe('rectToCss', () => {
  it('produces left/top/width/height px strings from a Rect', () => {
    const r: Rect = { x: 40, y: 80, width: 160, height: 90 };
    const css = rectToCss(r);
    expect(css.left).toBe('40px');
    expect(css.top).toBe('80px');
    expect(css.width).toBe('160px');
    expect(css.height).toBe('90px');
  });

  it('contains no scale( string', () => {
    const r: Rect = { x: 10, y: 20, width: 300, height: 200 };
    const css = rectToCss(r);
    const joined = Object.values(css).join(' ');
    expect(joined).not.toContain('scale(');
    expect(joined).not.toContain('translate(');
  });

  it('interpolated rect at p=0 converts to tile pixel values', () => {
    const css = rectToCss(interpolateRect(tile, sheet, 0));
    expect(css.left).toBe(`${tile.x}px`);
    expect(css.top).toBe(`${tile.y}px`);
    expect(css.width).toBe(`${tile.width}px`);
    expect(css.height).toBe(`${tile.height}px`);
  });

  it('interpolated rect at p=1 converts to sheet pixel values', () => {
    const css = rectToCss(interpolateRect(tile, sheet, 1));
    expect(css.left).toBe(`${sheet.x}px`);
    expect(css.top).toBe(`${sheet.y}px`);
    expect(css.width).toBe(`${sheet.width}px`);
    expect(css.height).toBe(`${sheet.height}px`);
  });
});

describe('crossfadeOpacities', () => {
  it('at p=0 source=1 target=0', () => {
    const o = crossfadeOpacities(0);
    expect(o.source).toBeCloseTo(1, 6);
    expect(o.target).toBeCloseTo(0, 6);
  });

  it('at p=1 source=0 target=1', () => {
    const o = crossfadeOpacities(1);
    expect(o.source).toBeCloseTo(0, 6);
    expect(o.target).toBeCloseTo(1, 6);
  });

  it('source fades out by p=0.45 (compact gone before sheet visible)', () => {
    expect(crossfadeOpacities(0.45).source).toBeCloseTo(0, 6);
  });

  it('target is 0 at p=0.2 (detail fades in after 20% progress)', () => {
    expect(crossfadeOpacities(0.2).target).toBeCloseTo(0, 6);
  });

  it('target reaches 1 at p=0.8 (detail fully visible)', () => {
    expect(crossfadeOpacities(0.8).target).toBeCloseTo(1, 6);
  });

  it('source is monotonically decreasing across p', () => {
    const ps = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 1];
    const opacities = ps.map((p) => crossfadeOpacities(p).source);
    for (let i = 1; i < opacities.length; i++) {
      expect(opacities[i]!).toBeLessThanOrEqual(opacities[i - 1]! + 1e-9);
    }
  });

  it('target is monotonically increasing across p', () => {
    const ps = [0, 0.2, 0.3, 0.5, 0.8, 1];
    const opacities = ps.map((p) => crossfadeOpacities(p).target);
    for (let i = 1; i < opacities.length; i++) {
      expect(opacities[i]!).toBeGreaterThanOrEqual(opacities[i - 1]! - 1e-9);
    }
  });

  it('both clamp to [0, 1] range', () => {
    for (const p of [-0.5, 0, 0.5, 1, 1.5]) {
      const o = crossfadeOpacities(p);
      expect(o.source).toBeGreaterThanOrEqual(0);
      expect(o.source).toBeLessThanOrEqual(1);
      expect(o.target).toBeGreaterThanOrEqual(0);
      expect(o.target).toBeLessThanOrEqual(1);
    }
  });
});
