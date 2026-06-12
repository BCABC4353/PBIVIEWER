import type { TokenProvider } from './types';

const BASE = 'https://api.powerbi.com/v1.0/myorg';

export interface QueryResult {
  columns: string[];
  rows: Array<Record<string, unknown>>;
}

export type VisualKind = 'kpi' | 'bar' | 'line' | 'donut' | 'table';
export type ValueFormat = 'number' | 'currency' | 'percent';

export interface VisualSpec {
  kind: VisualKind;
  title: string;
  dax: string;
  valueField?: string;
  labelField?: string;
  format?: ValueFormat;
}

export interface CanvasSpec {
  title: string;
  visuals: VisualSpec[];
}


export interface KpiData {
  value: number | null;
  label: string;
}
export interface SeriesPoint {
  label: string;
  value: number;
}
export interface SeriesData {
  points: SeriesPoint[];
}
export interface DonutData {
  slices: SeriesPoint[];
}
export interface TableData {
  columns: string[];
  rows: Array<Record<string, unknown>>;
}

export type ShapedVisual =
  | { kind: 'kpi'; data: KpiData }
  | { kind: 'bar'; data: SeriesData }
  | { kind: 'line'; data: SeriesData }
  | { kind: 'donut'; data: DonutData }
  | { kind: 'table'; data: TableData };


export function stripColumnName(raw: string): string {
  const m = /\[([^[\]]+)\]\s*$/.exec(raw);
  return m ? m[1]! : raw;
}

export function parseExecuteQueriesResponse(payload: unknown): QueryResult {
  const body = payload as
    | { results?: Array<{ tables?: Array<{ rows?: unknown }> }> }
    | null
    | undefined;
  const rawRows = body?.results?.[0]?.tables?.[0]?.rows;
  if (!Array.isArray(rawRows)) return { columns: [], rows: [] };

  const columns: string[] = [];
  const seen = new Set<string>();
  const rows = rawRows.map((raw) => {
    const out: Record<string, unknown> = {};
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        const name = stripColumnName(key);
        if (!seen.has(name)) {
          seen.add(name);
          columns.push(name);
        }
        out[name] = value;
      }
    }
    return out;
  });
  return { columns, rows };
}

export async function executeDax(
  tokens: TokenProvider,
  datasetId: string,
  dax: string,
  signal?: AbortSignal,
): Promise<QueryResult> {
  const token = await tokens.getAccessToken();
  const res = await fetch(`${BASE}/datasets/${datasetId}/executeQueries`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      queries: [{ query: dax }],
      serializerSettings: { includeNulls: true },
    }),
    signal,
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as {
        error?: { code?: string; message?: string };
      } | null;
      const code = body?.error?.code;
      const message = body?.error?.message;
      detail = [code, message].filter(Boolean).join(': ');
    } catch {
    }
    throw new Error(
      `Execute Queries failed (HTTP ${res.status}) on dataset ${datasetId}` +
        (detail ? ` — ${detail.slice(0, 400)}` : ''),
    );
  }
  return parseExecuteQueriesResponse(await res.json());
}


function toFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function resolveValueColumn(spec: VisualSpec, result: QueryResult): string | undefined {
  if (spec.valueField !== undefined) {
    return result.columns.includes(spec.valueField) ? spec.valueField : undefined;
  }
  for (const col of result.columns) {
    if (result.rows.some((r) => toFiniteNumber(r[col]) !== null)) return col;
  }
  return undefined;
}

function resolveLabelColumn(
  spec: VisualSpec,
  result: QueryResult,
  valueColumn: string | undefined,
): string | undefined {
  if (spec.labelField !== undefined) {
    return result.columns.includes(spec.labelField) ? spec.labelField : undefined;
  }
  return result.columns.find((c) => c !== valueColumn);
}

function shapePoints(spec: VisualSpec, result: QueryResult): SeriesPoint[] {
  const valueCol = resolveValueColumn(spec, result);
  if (valueCol === undefined) return [];
  const labelCol = resolveLabelColumn(spec, result, valueCol);
  const points: SeriesPoint[] = [];
  for (const row of result.rows) {
    const value = toFiniteNumber(row[valueCol]);
    if (value === null) continue;
    const rawLabel = labelCol !== undefined ? row[labelCol] : undefined;
    points.push({
      label: rawLabel === null || rawLabel === undefined ? '' : String(rawLabel),
      value,
    });
  }
  return points;
}

export function shapeForVisual(spec: VisualSpec, result: QueryResult): ShapedVisual {
  switch (spec.kind) {
    case 'kpi': {
      const valueCol = resolveValueColumn(spec, result);
      const first = result.rows[0];
      const value =
        valueCol !== undefined && first !== undefined ? toFiniteNumber(first[valueCol]) : null;
      return { kind: 'kpi', data: { value, label: spec.title } };
    }
    case 'bar':
      return { kind: 'bar', data: { points: shapePoints(spec, result) } };
    case 'line':
      return { kind: 'line', data: { points: shapePoints(spec, result) } };
    case 'donut':
      return { kind: 'donut', data: { slices: shapePoints(spec, result).filter((s) => s.value > 0) } };
    case 'table':
      return { kind: 'table', data: { columns: result.columns, rows: result.rows } };
  }
}


function compact(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const trim = (v: number): string => {
    const s = v.toFixed(1);
    return s.endsWith('.0') ? s.slice(0, -2) : s;
  };
  if (abs >= 1e12) return `${sign}${trim(abs / 1e12)}T`;
  if (abs >= 1e9) return `${sign}${trim(abs / 1e9)}B`;
  if (abs >= 1e6) return `${sign}${trim(abs / 1e6)}M`;
  if (abs >= 1e3) return `${sign}${trim(abs / 1e3)}K`;
  return `${sign}${trim(abs)}`;
}

export function formatValue(
  n: number | null | undefined,
  format: ValueFormat = 'number',
): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  switch (format) {
    case 'percent':
      return `${compact(n * 100)}%`;
    case 'currency':
      return n < 0 ? `-$${compact(Math.abs(n))}` : `$${compact(n)}`;
    case 'number':
      return compact(n);
  }
}
