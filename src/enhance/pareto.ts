import { ok, insufficient, type Result } from './types';

export interface ParetoEntry {
  index: number;
  value: number;
  share: number;
  cumulativeShare: number;
}

export interface ParetoResult {
  entries: ParetoEntry[];
  thresholdIndex: number;
  threshold: number;
}

export function paretoAnalysis(
  values: number[],
  threshold: number = 0.8,
): Result<ParetoResult> {
  if (values.length === 0) {
    return insufficient('values must be non-empty');
  }

  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    return insufficient('threshold must be a finite number in (0, 1]');
  }

  for (const v of values) {
    if (!Number.isFinite(v)) {
      return insufficient('values contains non-finite entries');
    }
    if (v < 0) {
      return insufficient('pareto requires non-negative values');
    }
  }

  const indexed = values.map((value, index) => ({ value, index }));
  indexed.sort((a, b) => b.value - a.value);

  const total = indexed.reduce((s, e) => s + e.value, 0);

  if (total === 0) {
    const entries: ParetoEntry[] = indexed.map((e, rank) => ({
      index: e.index,
      value: e.value,
      share: 0,
      cumulativeShare: 0,
    }));
    return ok({ entries, thresholdIndex: 0, threshold });
  }

  const entries: ParetoEntry[] = [];
  let cumulative = 0;
  let thresholdIndex = indexed.length - 1;

  for (let rank = 0; rank < indexed.length; rank++) {
    const share = indexed[rank]!.value / total;
    cumulative += share;
    entries.push({
      index: indexed[rank]!.index,
      value: indexed[rank]!.value,
      share,
      cumulativeShare: cumulative,
    });
    if (cumulative >= threshold && thresholdIndex === indexed.length - 1) {
      thresholdIndex = rank;
    }
  }

  return ok({ entries, thresholdIndex, threshold });
}
