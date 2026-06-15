export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Transform {
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
}

export interface CrossfadeOpacities {
  source: number;
  target: number;
}

const EPSILON = 1e-9;

function safeScale(numerator: number, denominator: number): number {
  if (Math.abs(denominator) < EPSILON) return 1;
  return numerator / denominator;
}

export function normalizeRect(r: Rect & { top?: number; left?: number }): Rect {
  return {
    x: r.x ?? r.left ?? 0,
    y: r.y ?? r.top ?? 0,
    width: r.width,
    height: r.height,
  };
}

export function invert(from: Rect, to: Rect): Transform {
  const scaleX = safeScale(from.width, to.width);
  const scaleY = safeScale(from.height, to.height);
  const translateX = from.x - to.x * scaleX;
  const translateY = from.y - to.y * scaleY;
  return { translateX, translateY, scaleX, scaleY };
}

export function applyTransform(rect: Rect, t: Transform): Rect {
  return {
    x: t.translateX + rect.x * t.scaleX,
    y: t.translateY + rect.y * t.scaleY,
    width: rect.width * t.scaleX,
    height: rect.height * t.scaleY,
  };
}

export function interpolateRect(a: Rect, b: Rect, p: number): Rect {
  const q = 1 - p;
  return {
    x: a.x * q + b.x * p,
    y: a.y * q + b.y * p,
    width: a.width * q + b.width * p,
    height: a.height * q + b.height * p,
  };
}

export function transformFromRects(current: Rect, target: Rect): Transform {
  const scaleX = safeScale(current.width, target.width);
  const scaleY = safeScale(current.height, target.height);
  const translateX = current.x - target.x * scaleX;
  const translateY = current.y - target.y * scaleY;
  return { translateX, translateY, scaleX, scaleY };
}

export function transformToCss(t: Transform): string {
  return `translate(${t.translateX}px, ${t.translateY}px) scale(${t.scaleX}, ${t.scaleY})`;
}

export function morphTransformAt(tileRect: Rect, sheetRect: Rect, p: number): Transform {
  const current = interpolateRect(tileRect, sheetRect, p);
  return transformFromRects(current, sheetRect);
}

export function crossfadeOpacities(p: number): CrossfadeOpacities {
  return {
    source: 1 - p,
    target: p,
  };
}
