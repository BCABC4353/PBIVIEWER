export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CrossfadeOpacities {
  source: number;
  target: number;
}

export function normalizeRect(r: Rect & { top?: number; left?: number }): Rect {
  return {
    x: r.x ?? r.left ?? 0,
    y: r.y ?? r.top ?? 0,
    width: r.width,
    height: r.height,
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

export function rectToCss(r: Rect): { left: string; top: string; width: string; height: string } {
  return {
    left: `${r.x}px`,
    top: `${r.y}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
  };
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

export function crossfadeOpacities(p: number): CrossfadeOpacities {
  return {
    source: 1 - clamp(p / 0.45, 0, 1),
    target: clamp((p - 0.2) / 0.6, 0, 1),
  };
}
