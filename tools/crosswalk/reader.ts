import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import type {
  Diagnostic,
  FieldExpr,
  Projection,
  QueryRole,
  FilterEntry,
  VisualRecord,
  VisualPosition,
  MobilePosition,
  PageRecord,
  ReportRecord,
} from './types.ts';

export type {
  Diagnostic,
  FieldExpr,
  FieldExprColumn,
  FieldExprMeasure,
  FieldExprAggregation,
  Projection,
  QueryRole,
  VisualQuery,
  FilterEntry,
  VisualRecord,
  VisualPosition,
  MobilePosition,
  PageRecord,
  ReportRecord,
} from './types.ts';

function diag(level: 'warn' | 'error', code: string, message: string, path: string): Diagnostic {
  return { level, code, message, path };
}

function parseFieldExpr(raw: unknown, ctxPath: string, diags: Diagnostic[]): FieldExpr | null {
  if (raw === null || typeof raw !== 'object') {
    diags.push(diag('warn', 'FIELD_NOT_OBJECT', 'field expression is not an object', ctxPath));
    return null;
  }
  const f = raw as Record<string, unknown>;

  if ('Column' in f) {
    const col = f['Column'] as Record<string, unknown>;
    const entity = (col?.['Expression'] as Record<string, unknown>)?.['SourceRef'] as Record<string, unknown>;
    const table = entity?.['Entity'];
    const property = col?.['Property'];
    if (typeof table !== 'string' || typeof property !== 'string') {
      diags.push(diag('warn', 'FIELD_COLUMN_INCOMPLETE', 'Column field missing Entity or Property', ctxPath));
      return null;
    }
    return { kind: 'Column', table, property };
  }

  if ('Measure' in f) {
    const m = f['Measure'] as Record<string, unknown>;
    const entity = (m?.['Expression'] as Record<string, unknown>)?.['SourceRef'] as Record<string, unknown>;
    const table = entity?.['Entity'];
    const property = m?.['Property'];
    if (typeof table !== 'string' || typeof property !== 'string') {
      diags.push(diag('warn', 'FIELD_MEASURE_INCOMPLETE', 'Measure field missing Entity or Property', ctxPath));
      return null;
    }
    return { kind: 'Measure', table, property };
  }

  if ('Aggregation' in f) {
    const agg = f['Aggregation'] as Record<string, unknown>;
    const innerCol = (agg?.['Expression'] as Record<string, unknown>)?.['Column'] as Record<string, unknown>;
    const entity = (innerCol?.['Expression'] as Record<string, unknown>)?.['SourceRef'] as Record<string, unknown>;
    const table = entity?.['Entity'];
    const property = innerCol?.['Property'];
    const fn = agg?.['Function'];
    if (typeof table !== 'string' || typeof property !== 'string' || typeof fn !== 'number') {
      diags.push(diag('warn', 'FIELD_AGG_INCOMPLETE', 'Aggregation field missing Entity, Property, or Function', ctxPath));
      return null;
    }
    return { kind: 'Aggregation', table, property, fn };
  }

  diags.push(diag('warn', 'FIELD_UNKNOWN_KIND', `unknown field expression kind: ${Object.keys(f).join(',')}`, ctxPath));
  return null;
}

function parseProjection(raw: unknown, ctxPath: string, diags: Diagnostic[]): Projection | null {
  if (raw === null || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const queryRef = typeof p['queryRef'] === 'string' ? p['queryRef'] : '';
  const field = parseFieldExpr(p['field'], ctxPath + '/field', diags);
  return {
    field,
    queryRef,
    nativeQueryRef: typeof p['nativeQueryRef'] === 'string' ? p['nativeQueryRef'] : undefined,
    displayName: typeof p['displayName'] === 'string' ? p['displayName'] : undefined,
    active: typeof p['active'] === 'boolean' ? p['active'] : undefined,
  };
}

function parseQueryState(raw: unknown, ctxPath: string, diags: Diagnostic[]): Record<string, QueryRole> {
  if (raw === null || typeof raw !== 'object') return {};
  const state = raw as Record<string, unknown>;
  const result: Record<string, QueryRole> = {};
  for (const [role, roleData] of Object.entries(state)) {
    if (roleData === null || typeof roleData !== 'object') continue;
    const rd = roleData as Record<string, unknown>;
    const rawProjs = rd['projections'];
    if (!Array.isArray(rawProjs)) continue;
    const projections: Projection[] = [];
    for (let i = 0; i < rawProjs.length; i++) {
      const proj = parseProjection(rawProjs[i], `${ctxPath}/${role}/projections/${i}`, diags);
      if (proj) projections.push(proj);
    }
    result[role] = { projections };
  }
  return result;
}

function parseFilterEntry(raw: unknown, ctxPath: string, diags: Diagnostic[]): FilterEntry | null {
  if (raw === null || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;
  const name = typeof f['name'] === 'string' ? f['name'] : '';
  const type = typeof f['type'] === 'string' ? f['type'] : '';
  const field = parseFieldExpr(f['field'], ctxPath + '/field', diags);

  let values: unknown[] | undefined;
  if (type === 'Categorical') {
    const filterBody = f['filter'] as Record<string, unknown> | undefined;
    if (filterBody) {
      const where = filterBody['Where'] as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(where)) {
        const inCond = where[0];
        const inVals = (inCond?.['Condition'] as Record<string, unknown>)?.['In'] as Record<string, unknown> | undefined;
        if (inVals?.['Values']) {
          values = (inVals['Values'] as unknown[][]).map((v) => (Array.isArray(v) ? v[0] : v));
        }
      }
    }
  }

  return { name, field, type, values };
}

function parseVisualJson(raw: unknown, visualPath: string, diags: Diagnostic[]): Partial<VisualRecord> | null {
  if (raw === null || typeof raw !== 'object') {
    diags.push(diag('error', 'VISUAL_NOT_OBJECT', 'visual.json root is not an object', visualPath));
    return null;
  }
  const v = raw as Record<string, unknown>;
  const name = typeof v['name'] === 'string' ? v['name'] : 'unknown';
  const pos = v['position'] as Record<string, unknown> | undefined;

  const position: VisualPosition = {
    x: typeof pos?.['x'] === 'number' ? pos['x'] : 0,
    y: typeof pos?.['y'] === 'number' ? pos['y'] : 0,
    z: typeof pos?.['z'] === 'number' ? pos['z'] : 0,
    width: typeof pos?.['width'] === 'number' ? pos['width'] : 0,
    height: typeof pos?.['height'] === 'number' ? pos['height'] : 0,
    tabOrder: typeof pos?.['tabOrder'] === 'number' ? pos['tabOrder'] : undefined,
  };

  const vis = v['visual'] as Record<string, unknown> | undefined;
  const visualType = typeof vis?.['visualType'] === 'string' ? vis['visualType'] : 'unknown';
  const queryState = parseQueryState(
    (vis?.['query'] as Record<string, unknown>)?.['queryState'],
    `${visualPath}/visual/query/queryState`,
    diags,
  );

  let filterConfig: { filters: FilterEntry[] } | undefined;
  const rawFilterConfig = v['filterConfig'] as Record<string, unknown> | undefined;
  if (rawFilterConfig?.['filters'] && Array.isArray(rawFilterConfig['filters'])) {
    const filters: FilterEntry[] = [];
    for (let i = 0; i < rawFilterConfig['filters'].length; i++) {
      const fe = parseFilterEntry(rawFilterConfig['filters'][i], `${visualPath}/filterConfig/filters/${i}`, diags);
      if (fe) filters.push(fe);
    }
    filterConfig = { filters };
  }

  return { name, position, visualType, query: { queryState }, isHidden: v['isHidden'] === true, filterConfig };
}

function readJsonFile(filePath: string, diags: Diagnostic[]): unknown {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (e) {
    diags.push(diag('error', 'JSON_PARSE_ERROR', `failed to parse ${filePath}: ${e instanceof Error ? e.message : String(e)}`, filePath));
    return null;
  }
}

function readMobile(visualDir: string, diags: Diagnostic[]): MobilePosition | undefined {
  const mobilePath = join(visualDir, 'mobile.json');
  if (!existsSync(mobilePath)) return undefined;
  const raw = readJsonFile(mobilePath, diags);
  if (!raw || typeof raw !== 'object') return undefined;
  const m = raw as Record<string, unknown>;
  const pos = m['position'] as Record<string, unknown> | undefined;
  if (!pos) return undefined;
  return {
    x: typeof pos['x'] === 'number' ? pos['x'] : 0,
    y: typeof pos['y'] === 'number' ? pos['y'] : 0,
    z: typeof pos['z'] === 'number' ? pos['z'] : 0,
    width: typeof pos['width'] === 'number' ? pos['width'] : 0,
    height: typeof pos['height'] === 'number' ? pos['height'] : 0,
  };
}

function readPage(pagesDir: string, pageHash: string, diags: Diagnostic[]): PageRecord | null {
  const pageDir = join(pagesDir, pageHash);
  const rawPage = readJsonFile(join(pageDir, 'page.json'), diags);
  if (!rawPage || typeof rawPage !== 'object') return null;
  const pg = rawPage as Record<string, unknown>;
  const name = typeof pg['name'] === 'string' ? pg['name'] : pageHash;
  const displayName = typeof pg['displayName'] === 'string' ? pg['displayName'] : pageHash;
  const width = typeof pg['width'] === 'number' ? pg['width'] : 1280;
  const height = typeof pg['height'] === 'number' ? pg['height'] : 720;

  const visualsDir = join(pageDir, 'visuals');
  const visuals: VisualRecord[] = [];
  if (!existsSync(visualsDir)) return { name, displayName, width, height, visuals };

  let visualHashes: string[] = [];
  try {
    visualHashes = readdirSync(visualsDir);
  } catch {
    diags.push(diag('warn', 'VISUALS_DIR_UNREADABLE', `cannot read visuals dir: ${visualsDir}`, visualsDir));
  }

  for (const vh of visualHashes) {
    const visualDir = join(visualsDir, vh);
    const visualJsonPath = join(visualDir, 'visual.json');
    if (!existsSync(visualJsonPath)) continue;
    const rawVisual = readJsonFile(visualJsonPath, diags);
    const partial = parseVisualJson(rawVisual, visualJsonPath, diags);
    if (!partial) continue;
    const mobile = readMobile(visualDir, diags);
    visuals.push({
      name: partial.name ?? vh,
      position: partial.position ?? { x: 0, y: 0, z: 0, width: 0, height: 0 },
      visualType: partial.visualType ?? 'unknown',
      query: partial.query ?? { queryState: {} },
      isHidden: partial.isHidden,
      filterConfig: partial.filterConfig,
      mobile,
    });
  }

  return { name, displayName, width, height, visuals };
}

export function readReport(reportDir: string): ReportRecord {
  const diags: Diagnostic[] = [];
  const pagesDir = join(reportDir, 'definition', 'pages');
  const rawPages = readJsonFile(join(pagesDir, 'pages.json'), diags);
  if (!rawPages || typeof rawPages !== 'object') return { reportDir, pages: [], diagnostics: diags };

  const pg = rawPages as Record<string, unknown>;
  const pageOrder = Array.isArray(pg['pageOrder']) ? (pg['pageOrder'] as string[]) : [];
  const pages: PageRecord[] = [];
  for (const hash of pageOrder) {
    const page = readPage(pagesDir, hash, diags);
    if (page) pages.push(page);
  }
  return { reportDir, pages, diagnostics: diags };
}
