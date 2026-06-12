import { ok, insufficient, type Result } from './types';

export type DeltaKind = 'MoM' | 'YoY';

export interface DeltaPoint {
  date: string;
  value: number;
  prior: number;
  delta: number;
  deltaPercent: number | null;
}

export interface DeltaEntry {
  date: string;
  delta: Result<DeltaPoint>;
}

export interface DeltasResult {
  kind: DeltaKind;
  entries: DeltaEntry[];
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function priorDateKey(dateStr: string, kind: DeltaKind): string {
  return kind === 'MoM' ? addMonths(dateStr, -1) : addMonths(dateStr, -12);
}

export function periodDeltas(
  series: Map<string, number> | Record<string, number>,
  kind: DeltaKind,
): Result<DeltasResult> {
  const map: Map<string, number> =
    series instanceof Map ? series : new Map(Object.entries(series));

  if (map.size === 0) {
    return insufficient('series must be non-empty');
  }

  for (const [, v] of map) {
    if (!Number.isFinite(v)) return insufficient('series contains non-finite values');
  }

  const sortedDates = [...map.keys()].sort();
  const entries: DeltaEntry[] = [];

  for (const date of sortedDates) {
    const value = map.get(date)!;
    const priorKey = priorDateKey(date, kind);

    if (!map.has(priorKey)) {
      entries.push({
        date,
        delta: insufficient(`no prior period found for ${date} (expected ${priorKey})`),
      });
      continue;
    }

    const prior = map.get(priorKey)!;
    const delta = value - prior;
    const deltaPercent = prior === 0 ? null : (delta / Math.abs(prior)) * 100;

    entries.push({
      date,
      delta: ok({ date, value, prior, delta, deltaPercent }),
    });
  }

  return ok({ kind, entries });
}
