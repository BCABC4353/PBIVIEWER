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

function yearMonth(dateStr: string): string | null {
  const match = /^(\d{4})-(\d{2})/.exec(dateStr);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}

function priorYearMonth(ym: string, monthsBack: number): string {
  const [yearStr, monthStr] = ym.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const zeroBased = (year * 12 + (month - 1)) - monthsBack;
  const priorYear = Math.floor(zeroBased / 12);
  const priorMonth = (zeroBased % 12) + 1;
  return `${String(priorYear).padStart(4, '0')}-${String(priorMonth).padStart(2, '0')}`;
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

  const byYearMonth = new Map<string, number>();
  for (const [date, value] of map) {
    const ym = yearMonth(date);
    if (ym === null) return insufficient(`date key is not YYYY-MM... format: ${date}`);
    byYearMonth.set(ym, value);
  }

  const monthsBack = kind === 'MoM' ? 1 : 12;
  const sortedDates = [...map.keys()].sort();
  const entries: DeltaEntry[] = [];

  for (const date of sortedDates) {
    const value = map.get(date)!;
    const ym = yearMonth(date)!;
    const priorYm = priorYearMonth(ym, monthsBack);

    if (!byYearMonth.has(priorYm)) {
      entries.push({
        date,
        delta: insufficient(`no prior period found for ${date} (expected month ${priorYm})`),
      });
      continue;
    }

    const prior = byYearMonth.get(priorYm)!;
    const delta = value - prior;
    const deltaPercent = prior === 0 ? null : (delta / Math.abs(prior)) * 100;

    entries.push({
      date,
      delta: ok({ date, value, prior, delta, deltaPercent }),
    });
  }

  return ok({ kind, entries });
}
