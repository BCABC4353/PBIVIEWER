/**
 * Execute Queries client + native canvas spec — pure TS, no React Native
 * imports (fully unit-testable).
 *
 * Doctrine: we NEVER embed Microsoft's report canvas. We pull DATA out of
 * Power BI with DAX and render it with the app's own visuals. This module is
 * the data half of that contract: run a query, strip Power BI's column-name
 * noise, and shape rows into exactly what each native visual consumes.
 */
import type { TokenProvider } from './types';

const BASE = 'https://api.powerbi.com/v1.0/myorg';

/** Tabular result of one DAX query, with column names stripped to bare names. */
export interface QueryResult {
  columns: string[];
  rows: Array<Record<string, unknown>>;
}

export type VisualKind = 'kpi' | 'bar' | 'line' | 'donut' | 'table';
export type ValueFormat = 'number' | 'currency' | 'percent';

/** One native visual on a canvas — a DAX query plus rendering hints. */
export interface VisualSpec {
  kind: VisualKind;
  title: string;
  dax: string;
  /** Column holding the numeric value. Defaults to the first numeric column. */
  valueField?: string;
  /** Column holding the category label. Defaults to the first non-value column. */
  labelField?: string;
  format?: ValueFormat;
}

/** A "report page" rendered natively — title + ordered visuals. */
export interface CanvasSpec {
  title: string;
  visuals: VisualSpec[];
}

// ---------------------------------------------------------------------------
// Shaped data — the typed contract each visual component consumes.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Execute Queries client
// ---------------------------------------------------------------------------

/** 'Sales[Month]' → 'Month'; '[Total]' → 'Total'; plain names pass through. */
export function stripColumnName(raw: string): string {
  const m = /\[([^[\]]+)\]\s*$/.exec(raw);
  return m ? m[1]! : raw;
}

/**
 * Parse the raw executeQueries response body into a QueryResult.
 * Tolerates any malformed shape by returning an empty result — never throws.
 */
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

/** Run one DAX query against a dataset via the Execute Queries REST endpoint. */
export async function executeDax(
  tokens: TokenProvider,
  datasetId: string,
  dax: string,
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
  });
  if (!res.ok) {
    throw new Error(`Execute Queries failed (HTTP ${res.status}) on dataset ${datasetId}`);
  }
  return parseExecuteQueriesResponse(await res.json());
}

// ---------------------------------------------------------------------------
// Shaping — rows → what each visual consumes. Defensive throughout: a spec
// pointing at fields that don't exist yields an EMPTY result, never a throw.
// ---------------------------------------------------------------------------

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Resolve the value column: explicit field if it exists, else first numeric. */
function resolveValueColumn(spec: VisualSpec, result: QueryResult): string | undefined {
  if (spec.valueField !== undefined) {
    return result.columns.includes(spec.valueField) ? spec.valueField : undefined;
  }
  for (const col of result.columns) {
    if (result.rows.some((r) => toFiniteNumber(r[col]) !== null)) return col;
  }
  return undefined;
}

/** Resolve the label column: explicit field if it exists, else first ≠ value. */
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

/** Shape a query result into the typed data its visual consumes. Never throws. */
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
      // Arcs only make sense for positive parts of a whole.
      return { kind: 'donut', data: { slices: shapePoints(spec, result).filter((s) => s.value > 0) } };
    case 'table':
      return { kind: 'table', data: { columns: result.columns, rows: result.rows } };
  }
}

// ---------------------------------------------------------------------------
// Formatting — compact, instrument-cluster numerals (1.2M, 45.3%, $1.2M).
// ---------------------------------------------------------------------------

/** 1234.5 → '1.2K'; trailing '.0' trimmed; sign preserved. */
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

/**
 * Format a value for display. 'percent' treats the input as a ratio
 * (0.453 → '45.3%'), matching what DIVIDE-style DAX measures return.
 * Non-finite / missing values render as an em dash.
 */
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
