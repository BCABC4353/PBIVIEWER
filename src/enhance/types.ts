export type InsufficientResult = {
  kind: 'insufficient';
  reason: string;
};

export type Ok<T> = {
  kind: 'ok';
  value: T;
};

export type Result<T> = Ok<T> | InsufficientResult;

export function ok<T>(value: T): Ok<T> {
  return { kind: 'ok', value };
}

export function insufficient(reason: string): InsufficientResult {
  return { kind: 'insufficient', reason };
}

export function isOk<T>(r: Result<T>): r is Ok<T> {
  return r.kind === 'ok';
}

export function isInsufficient<T>(r: Result<T>): r is InsufficientResult {
  return r.kind === 'insufficient';
}

export function linearInterpolationPercentile(sorted: number[], p: number): number | null {
  const n = sorted.length;
  if (n === 0 || !Number.isFinite(p) || p < 0 || p > 1) return null;
  if (n === 1) return sorted[0]!;
  const idx = p * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const frac = idx - lo;
  return sorted[lo]! + frac * (sorted[hi]! - sorted[lo]!);
}
