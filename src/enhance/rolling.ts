import { ok, insufficient, type Result } from './types';

export interface RollingPoint {
  mean: number;
  stddev: number;
  upper: number;
  lower: number;
}

export interface RollingResult {
  points: RollingPoint[];
  window: number;
  sigmaMultiplier: number;
}

function hasNonFinite(values: number[]): boolean {
  return values.some((v) => !isFinite(v));
}

function windowMean(slice: number[]): number {
  let sum = 0;
  for (const v of slice) sum += v;
  return sum / slice.length;
}

function windowSampleStddev(slice: number[], mean: number): number {
  if (slice.length < 2) return 0;
  let sumSq = 0;
  for (const v of slice) sumSq += (v - mean) ** 2;
  return Math.sqrt(sumSq / (slice.length - 1));
}

export function rollingStats(
  series: number[],
  window: number,
  sigmaMultiplier: number,
): Result<RollingResult> {
  if (
    series.length === 0 ||
    window <= 0 ||
    !Number.isFinite(window) ||
    !Number.isFinite(sigmaMultiplier)
  ) {
    return insufficient('series must be non-empty and window/sigmaMultiplier must be finite positive');
  }

  if (hasNonFinite(series)) {
    return insufficient('series contains non-finite values');
  }

  const effectiveWindow = Math.min(Math.floor(window), series.length);
  const points: RollingPoint[] = [];

  for (let i = 0; i < series.length; i++) {
    const start = Math.max(0, i - effectiveWindow + 1);
    const slice = series.slice(start, i + 1);
    const mean = windowMean(slice);
    const stddev = windowSampleStddev(slice, mean);
    const band = sigmaMultiplier * stddev;
    points.push({ mean, stddev, upper: mean + band, lower: mean - band });
  }

  return ok({ points, window: effectiveWindow, sigmaMultiplier });
}
