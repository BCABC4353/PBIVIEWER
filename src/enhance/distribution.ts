import { ok, insufficient, linearInterpolationPercentile, type Result } from './types';

export interface DistributionStrip {
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  currentPosition: number | null;
}

export function distributionStrip(
  values: number[],
  current?: number,
): Result<DistributionStrip> {
  if (values.length === 0) {
    return insufficient('values must be non-empty');
  }

  for (const v of values) {
    if (!Number.isFinite(v)) {
      return insufficient('values contains non-finite entries');
    }
  }

  if (current !== undefined && !Number.isFinite(current)) {
    return insufficient('current must be finite when provided');
  }

  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const p25 = linearInterpolationPercentile(sorted, 0.25);
  const median = linearInterpolationPercentile(sorted, 0.5);
  const p75 = linearInterpolationPercentile(sorted, 0.75);

  let currentPosition: number | null = null;
  if (current !== undefined) {
    if (max === min) {
      currentPosition = 0.5;
    } else {
      currentPosition = Math.max(0, Math.min(1, (current - min) / (max - min)));
    }
  }

  return ok({ min, p25, median, p75, max, currentPosition });
}
