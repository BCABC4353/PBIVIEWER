import { executeDax, type CanvasSpec, type QueryResult, type ValueFormat, type VisualSpec } from './dax';
import type { TokenProvider } from './types';

export type DaxRunner = (dax: string, signal?: AbortSignal) => Promise<QueryResult>;

const MAX_VISUALS = 8;
const MAX_KPIS = 4;
const MAX_LINE_POINTS = 60;
const MAX_BAR_CATEGORIES = 8;
const MAX_DONUT_CATEGORIES = 6;
const MAX_CATEGORY_CARDINALITY = 30;
const MAX_TABLE_COLUMNS = 5;
const TABLE_TOP_N = 10;
const MAX_CARDINALITY_PROBES = 6;


export function escapeTableName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

export function escapeBracketName(name: string): string {
  return `[${name.replace(/]/g, ']]')}]`;
}

export function columnRef(table: string, column: string): string {
  return `${escapeTableName(table)}${escapeBracketName(column)}`;
}

export function measureRef(name: string): string {
  return escapeBracketName(name);
}

export function daxStringLiteral(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}


const DATATYPE_STRING = 2;
const DATATYPE_INT64 = 6;
const DATATYPE_DOUBLE = 8;
const DATATYPE_DATETIME = 9;
const DATATYPE_DECIMAL = 10;

interface ModelMeasure {
  id: number;
  name: string;
  formatString: string;
}
interface ModelColumn {
  table: string;
  name: string;
  dataType: number;
}
interface ModelTable {
  name: string;
  columns: ModelColumn[];
}
export interface ModelInfo {
  measures: ModelMeasure[];
  columns: ModelColumn[];
  tables: ModelTable[];
}

const isTruthy = (v: unknown): boolean => v === true || v === 1 || v === 'true';

const asNumber = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const asString = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v : null;

const isInternalTableName = (name: string): boolean =>
  name.startsWith('DateTableTemplate_') || name.startsWith('LocalDateTable_');

export async function discoverModel(run: DaxRunner): Promise<ModelInfo> {
  const [tablesR, columnsR, measuresR] = await Promise.all([
    run('EVALUATE INFO.TABLES()'),
    run('EVALUATE INFO.COLUMNS()'),
    run('EVALUATE INFO.MEASURES()'),
  ]);

  const tableNameById = new Map<number, string>();
  for (const row of tablesR.rows) {
    const id = asNumber(row['ID']);
    const name = asString(row['Name']);
    if (id === null || name === null) continue;
    if (isTruthy(row['IsHidden']) || isTruthy(row['IsPrivate'])) continue;
    if (isInternalTableName(name)) continue;
    tableNameById.set(id, name);
  }

  const tablesByName = new Map<string, ModelTable>();
  const columns: ModelColumn[] = [];
  for (const row of columnsR.rows) {
    const tableId = asNumber(row['TableID']);
    if (tableId === null) continue;
    const table = tableNameById.get(tableId);
    if (table === undefined) continue;
    const name = asString(row['ExplicitName']) ?? asString(row['InferredName']);
    if (name === null || name.startsWith('RowNumber')) continue;
    if (isTruthy(row['IsHidden'])) continue;
    const dataType = asNumber(row['ExplicitDataType']) ?? asNumber(row['InferredDataType']) ?? 0;
    const col: ModelColumn = { table, name, dataType };
    columns.push(col);
    let t = tablesByName.get(table);
    if (!t) {
      t = { name: table, columns: [] };
      tablesByName.set(table, t);
    }
    t.columns.push(col);
  }

  const measures: ModelMeasure[] = [];
  for (const row of measuresR.rows) {
    const name = asString(row['Name']);
    if (name === null || isTruthy(row['IsHidden'])) continue;
    measures.push({
      id: asNumber(row['ID']) ?? Number.MAX_SAFE_INTEGER,
      name,
      formatString: asString(row['FormatString']) ?? '',
    });
  }
  measures.sort((a, b) => a.id - b.id);

  return { measures, columns, tables: [...tablesByName.values()] };
}


export function guessFormat(name: string, formatString: string): ValueFormat {
  if (formatString.includes('%')) return 'percent';
  if (/[$€£¥¤]/.test(formatString)) return 'currency';
  if (/(^|[\s_-])(pct|percent|rate|ratio|margin)([\s_-]|$)/i.test(name)) return 'percent';
  if (/(^|[\s_-])(revenue|sales|cost|price|amount|spend|profit)([\s_-]|$)/i.test(name)) {
    return 'currency';
  }
  return 'number';
}

const isNumericType = (t: number): boolean =>
  t === DATATYPE_INT64 || t === DATATYPE_DOUBLE || t === DATATYPE_DECIMAL;

const looksLikeKey = (name: string): boolean =>
  /(^|[\s_-])(id|key|guid|code)$/i.test(name) ||
  /[a-z0-9](Id|ID|Key|KEY|Guid|GUID|Code|CODE)$/.test(name);

function dedupeTitles(visuals: VisualSpec[]): VisualSpec[] {
  const seen = new Map<string, number>();
  return visuals.map((v) => {
    const n = (seen.get(v.title) ?? 0) + 1;
    seen.set(v.title, n);
    return n === 1 ? v : { ...v, title: `${v.title} (${n})` };
  });
}

async function probeCardinality(
  run: DaxRunner,
  candidates: ModelColumn[],
): Promise<Map<ModelColumn, number> | null> {
  if (candidates.length === 0) return new Map();
  const parts = candidates.map(
    (c, i) => `${daxStringLiteral(`c${i}`)}, DISTINCTCOUNT(${columnRef(c.table, c.name)})`,
  );
  try {
    const r = await run(`EVALUATE ROW(${parts.join(', ')})`);
    const first = r.rows[0] ?? {};
    const out = new Map<ModelColumn, number>();
    candidates.forEach((c, i) => {
      const n = asNumber(first[`c${i}`]);
      if (n !== null) out.set(c, n);
    });
    return out;
  } catch {
    return null;
  }
}

export async function deriveFromModel(
  model: ModelInfo,
  run: DaxRunner,
  reportName: string,
): Promise<CanvasSpec> {
  const visuals: VisualSpec[] = [];

  const kpiMeasures = model.measures.slice(0, MAX_KPIS);
  for (const m of kpiMeasures) {
    visuals.push({
      kind: 'kpi',
      title: m.name,
      dax: `EVALUATE ROW("Value", ${measureRef(m.name)})`,
      valueField: 'Value',
      format: guessFormat(m.name, m.formatString),
    });
  }

  const primary = model.measures[0];
  const valueExpr = (fallbackTable: string): string =>
    primary ? measureRef(primary.name) : `COUNTROWS(${escapeTableName(fallbackTable)})`;
  const valueLabel = primary ? primary.name : 'Rows';
  const valueFormat: ValueFormat = primary
    ? guessFormat(primary.name, primary.formatString)
    : 'number';

  const dateCol = model.columns.find((c) => c.dataType === DATATYPE_DATETIME);
  if (dateCol) {
    const ref = columnRef(dateCol.table, dateCol.name);
    visuals.push({
      kind: 'line',
      title: `${valueLabel} by ${dateCol.name}`,
      dax:
        `EVALUATE TOPN(${MAX_LINE_POINTS}, ` +
        `SUMMARIZECOLUMNS(${ref}, "Value", ${valueExpr(dateCol.table)}), ${ref}, DESC) ` +
        `ORDER BY ${ref} ASC`,
      labelField: dateCol.name,
      valueField: 'Value',
      format: valueFormat,
    });
  }

  const candidates = model.columns
    .filter((c) => c.dataType === DATATYPE_STRING && !looksLikeKey(c.name))
    .slice(0, MAX_CARDINALITY_PROBES);
  const cardinality = await probeCardinality(run, candidates);
  let categoryCol: ModelColumn | undefined;
  let categoryCount: number | undefined;
  if (cardinality) {
    for (const c of candidates) {
      const n = cardinality.get(c);
      if (n !== undefined && n >= 2 && n <= MAX_CATEGORY_CARDINALITY) {
        categoryCol = c;
        categoryCount = n;
        break;
      }
    }
  } else {
    categoryCol = candidates[0];
  }
  if (categoryCol) {
    const ref = columnRef(categoryCol.table, categoryCol.name);
    const donut = categoryCount !== undefined && categoryCount <= MAX_DONUT_CATEGORIES;
    visuals.push({
      kind: donut ? 'donut' : 'bar',
      title: `${valueLabel} by ${categoryCol.name}`,
      dax: donut
        ? `EVALUATE SUMMARIZECOLUMNS(${ref}, "Value", ${valueExpr(categoryCol.table)}) ` +
          `ORDER BY [Value] DESC`
        : `EVALUATE TOPN(${MAX_BAR_CATEGORIES}, ` +
          `SUMMARIZECOLUMNS(${ref}, "Value", ${valueExpr(categoryCol.table)}), [Value], DESC) ` +
          `ORDER BY [Value] DESC`,
      labelField: categoryCol.name,
      valueField: 'Value',
      format: valueFormat,
    });
  }

  const widest = [...model.tables].sort((a, b) => b.columns.length - a.columns.length)[0];
  if (widest && widest.columns.length >= 2) {
    const cols = widest.columns.slice(0, MAX_TABLE_COLUMNS);
    const parts = cols.map(
      (c) => `${daxStringLiteral(c.name)}, ${columnRef(widest.name, c.name)}`,
    );
    visuals.push({
      kind: 'table',
      title: `${widest.name} — top rows`,
      dax: `EVALUATE TOPN(${TABLE_TOP_N}, SELECTCOLUMNS(${escapeTableName(widest.name)}, ${parts.join(', ')}))`,
    });
  }

  return { title: reportName, visuals: dedupeTitles(visuals.slice(0, MAX_VISUALS)) };
}


interface StatsColumn {
  table: string;
  name: string;
  min: unknown;
  max: unknown;
  cardinality: number | null;
  maxLength: number | null;
}

function statsKey(columns: string[], wanted: string): string | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_]/g, '');
  return columns.find((c) => norm(c) === norm(wanted));
}

const looksLikeDateValue = (v: unknown): boolean =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);

export function parseColumnStatistics(result: QueryResult): StatsColumn[] {
  const tableKey = statsKey(result.columns, 'Table Name');
  const columnKey = statsKey(result.columns, 'Column Name');
  if (tableKey === undefined || columnKey === undefined) return [];
  const minKey = statsKey(result.columns, 'Min');
  const maxKey = statsKey(result.columns, 'Max');
  const cardKey = statsKey(result.columns, 'Cardinality');
  const lenKey = statsKey(result.columns, 'Max Length');

  const out: StatsColumn[] = [];
  for (const row of result.rows) {
    const table = asString(row[tableKey]);
    const name = asString(row[columnKey]);
    if (table === null || name === null) continue;
    if (isInternalTableName(table) || name.startsWith('RowNumber')) continue;
    out.push({
      table,
      name,
      min: minKey !== undefined ? row[minKey] : undefined,
      max: maxKey !== undefined ? row[maxKey] : undefined,
      cardinality: cardKey !== undefined ? asNumber(row[cardKey]) : null,
      maxLength: lenKey !== undefined ? asNumber(row[lenKey]) : null,
    });
  }
  return out;
}

export function deriveFromStatistics(result: QueryResult, reportName: string): CanvasSpec {
  const stats = parseColumnStatistics(result);
  const visuals: VisualSpec[] = [];
  if (stats.length === 0) return { title: reportName, visuals };

  const byTable = new Map<string, StatsColumn[]>();
  for (const s of stats) {
    const list = byTable.get(s.table) ?? [];
    list.push(s);
    byTable.set(s.table, list);
  }
  const widest = [...byTable.entries()].sort((a, b) => b[1].length - a[1].length)[0]!;
  const [widestName, widestCols] = widest;

  visuals.push({
    kind: 'kpi',
    title: `${widestName} rows`,
    dax: `EVALUATE ROW("Value", COUNTROWS(${escapeTableName(widestName)}))`,
    valueField: 'Value',
    format: 'number',
  });

  const numeric = stats.filter(
    (s) => asNumber(s.min) !== null && asNumber(s.max) !== null && !looksLikeKey(s.name),
  );
  for (const s of numeric.slice(0, 2)) {
    visuals.push({
      kind: 'kpi',
      title: `${s.name} (sum)`,
      dax: `EVALUATE ROW("Value", SUM(${columnRef(s.table, s.name)}))`,
      valueField: 'Value',
      format: 'number',
    });
  }

  const dateCol = stats.find((s) => looksLikeDateValue(s.min) && looksLikeDateValue(s.max));
  if (dateCol) {
    const ref = columnRef(dateCol.table, dateCol.name);
    const owner = escapeTableName(dateCol.table);
    visuals.push({
      kind: 'line',
      title: `Rows by ${dateCol.name}`,
      dax:
        `EVALUATE TOPN(${MAX_LINE_POINTS}, ` +
        `SUMMARIZECOLUMNS(${ref}, "Value", COUNTROWS(${owner})), ${ref}, DESC) ` +
        `ORDER BY ${ref} ASC`,
      labelField: dateCol.name,
      valueField: 'Value',
      format: 'number',
    });
  }

  const category = stats.find(
    (s) =>
      (s.maxLength ?? 0) > 0 &&
      s.cardinality !== null &&
      s.cardinality >= 2 &&
      s.cardinality <= MAX_CATEGORY_CARDINALITY &&
      !looksLikeKey(s.name) &&
      !looksLikeDateValue(s.min),
  );
  if (category) {
    const ref = columnRef(category.table, category.name);
    const owner = escapeTableName(category.table);
    const donut = (category.cardinality ?? Infinity) <= MAX_DONUT_CATEGORIES;
    visuals.push({
      kind: donut ? 'donut' : 'bar',
      title: `Rows by ${category.name}`,
      dax: donut
        ? `EVALUATE SUMMARIZECOLUMNS(${ref}, "Value", COUNTROWS(${owner})) ORDER BY [Value] DESC`
        : `EVALUATE TOPN(${MAX_BAR_CATEGORIES}, ` +
          `SUMMARIZECOLUMNS(${ref}, "Value", COUNTROWS(${owner})), [Value], DESC) ` +
          `ORDER BY [Value] DESC`,
      labelField: category.name,
      valueField: 'Value',
      format: 'number',
    });
  }

  if (widestCols.length >= 2) {
    const cols = widestCols.slice(0, MAX_TABLE_COLUMNS);
    const parts = cols.map((c) => `${daxStringLiteral(c.name)}, ${columnRef(widestName, c.name)}`);
    visuals.push({
      kind: 'table',
      title: `${widestName} — top rows`,
      dax: `EVALUATE TOPN(${TABLE_TOP_N}, SELECTCOLUMNS(${escapeTableName(widestName)}, ${parts.join(', ')}))`,
    });
  }

  return { title: reportName, visuals: dedupeTitles(visuals.slice(0, MAX_VISUALS)) };
}


export class CanvasDerivationError extends Error {
  constructor(
    message: string,
    public readonly apiError: string,
  ) {
    super(message);
    this.name = 'CanvasDerivationError';
  }
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export type DeriveStep = 'model' | 'visuals' | 'stats';

export interface DeriveOptions {
  rungTimeoutMs?: number;
  totalTimeoutMs?: number;
  onStep?: (step: DeriveStep) => void;
}

export const RUNG_TIMEOUT_MS = 25_000;
export const TOTAL_TIMEOUT_MS = 60_000;

async function runRung<T>(
  label: string,
  ms: number,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new Error(`${label} timed out after ${Math.ceil(ms / 1000)}s`));
    }, ms);
  });
  const work = fn(ctrl.signal);
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
    work.catch(() => {});
  }
}

export async function deriveCanvasSpec(
  run: DaxRunner,
  reportName: string,
  opts: DeriveOptions = {},
): Promise<CanvasSpec> {
  const rungMs = opts.rungTimeoutMs ?? RUNG_TIMEOUT_MS;
  const totalMs = opts.totalTimeoutMs ?? TOTAL_TIMEOUT_MS;
  const startedAt = Date.now();
  const budget = (): number => Math.max(1, Math.min(rungMs, totalMs - (Date.now() - startedAt)));

  let infoError: unknown = null;
  try {
    opts.onStep?.('model');
    const model = await runRung('Reading the dataset model (INFO functions)', budget(), (signal) =>
      discoverModel((dax) => run(dax, signal)),
    );
    if (model.measures.length === 0 && model.columns.length === 0 && model.tables.length === 0) {
      throw new Error('INFO functions answered but exposed no visible tables, columns, or measures.');
    }
    opts.onStep?.('visuals');
    const spec = await runRung('Building visuals from the model', budget(), (signal) =>
      deriveFromModel(model, (dax) => run(dax, signal), reportName),
    );
    if (spec.visuals.length > 0) return spec;
    infoError = new Error('The dataset model exposed nothing chartable.');
  } catch (e) {
    infoError = e;
  }

  try {
    opts.onStep?.('stats');
    const stats = await runRung('Reading column statistics', budget(), (signal) =>
      run('EVALUATE COLUMNSTATISTICS()', signal),
    );
    const spec = deriveFromStatistics(stats, reportName);
    if (spec.visuals.length > 0) return spec;
  } catch (statsError) {
    throw new CanvasDerivationError(
      'This dataset can’t be queried from the app.',
      `${errText(infoError)} | COLUMNSTATISTICS: ${errText(statsError)}`,
    );
  }
  throw new CanvasDerivationError(
    'The dataset answered, but its model exposed nothing the app can chart.',
    errText(infoError),
  );
}

const specCache = new Map<string, CanvasSpec>();

export function clearCanvasSpecCache(): void {
  specCache.clear();
}

export async function deriveCanvasForDataset(
  tokens: TokenProvider,
  datasetId: string,
  reportName: string,
  opts: DeriveOptions = {},
): Promise<CanvasSpec> {
  const cached = specCache.get(datasetId);
  if (cached) return { ...cached, title: reportName };
  const run: DaxRunner = (dax, signal) => executeDax(tokens, datasetId, dax, signal);
  const spec = await deriveCanvasSpec(run, reportName, opts);
  specCache.set(datasetId, spec);
  return spec;
}
