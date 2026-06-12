import type {
  PageRecord,
  VisualRecord,
  Projection,
  FieldExpr,
  Diagnostic,
} from './reader.ts';
import {
  columnRef,
  measureRef,
  escapeTableName,
} from './escape.ts';
import { buildDax } from './dax-gen.ts';

export interface TileLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MobileTileLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Tile {
  id: string;
  source: string;
  render: string;
  layout: TileLayout;
  group: string[];
  measure: string[];
  rows?: string[];
  values?: string[];
  mobileLayout?: MobileTileLayout;
  filtersIncomplete?: true;
  dax?: string;
  diagnostics?: Diagnostic[];
}

export interface PageManifest {
  page: string;
  displayName: string;
  tiles: Tile[];
  diagnostics: Diagnostic[];
}

const CHROME_TYPES = new Set(['actionButton', 'image', 'textbox', 'text']);

function mapRender(visualType: string, queryState: Record<string, { projections: Projection[] }>): string {
  const vt = visualType.toLowerCase();

  if (vt === 'card' || vt === 'cardvisual') return 'kpi';
  if (vt === 'kpi') return 'kpi';

  if (vt === 'columnchart' || vt === 'clusteredcolumnchart') return 'bar';
  if (vt === 'barchart' || vt === 'clusteredbarchart') return 'bar';

  if (vt === 'linechart') return 'line';
  if (vt === 'areachart') return 'area';

  if (vt === 'piechart' || vt === 'donutchart') return 'donut';

  if (vt === 'waterfallchart') return 'waterfall';

  if (vt === 'tableex') return 'table';

  if (vt === 'pivottable') return 'ledger';

  if (vt === 'gauge') return 'tickstrip';

  if (vt === 'slicer' || vt === 'textfilter') return 'filter';

  if (CHROME_TYPES.has(visualType)) return 'chrome';

  if (visualType.toLowerCase().includes('gantt') || visualType.toLowerCase().includes('gantt1448688115699')) {
    const roles = Object.keys(queryState);
    const hasTimeline = roles.some((r) => r === 'Task') && roles.some((r) => r === 'StartDate');
    if (hasTimeline) return 'timeline';
    return 'unsupported';
  }

  if (visualType.toLowerCase().startsWith('astimeline')) {
    const roles = Object.keys(queryState);
    const hasTimeline = roles.some((r) => r === 'Task') && roles.some((r) => r === 'StartDate');
    if (hasTimeline) return 'timeline';
    return 'unsupported';
  }

  if (
    visualType.toLowerCase().startsWith('bcicalendar') ||
    visualType.toLowerCase().startsWith('heatmapcalendar')
  ) {
    const roles = Object.keys(queryState);
    const hasDate = roles.some((r) => r.toLowerCase().includes('category') || r === 'Date');
    const hasMeasure = roles.some((r) => r === 'Values' || r === 'Measure');
    if (hasDate && hasMeasure) return 'calendar';
    return 'unsupported';
  }

  if (
    visualType.toLowerCase().startsWith('flowvisual') ||
    !(/^[a-z]/.test(vt))
  ) {
    return 'unsupported';
  }

  return 'unsupported';
}

function fieldExprToRef(field: FieldExpr): string {
  if (field.kind === 'Column') {
    return columnRef(field.table, field.property);
  }
  if (field.kind === 'Measure') {
    return measureRef(field.property);
  }
  const AGG_NAMES: Record<number, string> = {
    0: 'SUM',
    1: 'AVERAGE',
    2: 'MIN',
    3: 'MAX',
    4: 'COUNT',
    5: 'COUNTA',
    6: 'MEDIAN',
    7: 'STDEV.P',
    8: 'VAR.P',
  };
  const aggName = AGG_NAMES[field.fn] ?? 'SUM';
  const inner = columnRef(field.table, field.property);
  return `${aggName}(${inner})`;
}

function collectRoleRefs(
  queryState: Record<string, { projections: Projection[] }>,
  roleNames: string[],
): string[] {
  const refs: string[] = [];
  for (const role of roleNames) {
    const roleData = queryState[role];
    if (!roleData) continue;
    for (const proj of roleData.projections) {
      if (!proj.field) continue;
      refs.push(fieldExprToRef(proj.field));
    }
  }
  return refs;
}

const GROUP_ROLES = new Set(['Category', 'Axis', 'Rows', 'Columns', 'Data', 'Legend', 'Series', 'Location']);
const MEASURE_ROLES = new Set(['Y', 'Values', 'Value', 'X', 'Size', 'Tooltips', 'Measure']);

function buildTile(visual: VisualRecord, idx: number, diags: Diagnostic[]): Tile {
  const id = `v${idx}`;
  const { visualType, position, query, filterConfig, mobile } = visual;
  const qs = query.queryState;

  const render = mapRender(visualType, qs);

  const layout: TileLayout = {
    x: Math.round(position.x),
    y: Math.round(position.y),
    w: Math.round(position.width),
    h: Math.round(position.height),
  };

  let mobileLayout: MobileTileLayout | undefined;
  if (mobile) {
    mobileLayout = {
      x: Math.round(mobile.x),
      y: Math.round(mobile.y),
      w: Math.round(mobile.width),
      h: Math.round(mobile.height),
    };
  }

  if (render === 'chrome') {
    return { id, source: visualType, render, layout, group: [], measure: [], mobileLayout };
  }

  const group: string[] = [];
  const measure: string[] = [];
  const rows: string[] = [];
  const values: string[] = [];

  for (const [role, roleData] of Object.entries(qs)) {
    const isGroup = GROUP_ROLES.has(role);
    const isMeasure = MEASURE_ROLES.has(role);
    const isRows = role === 'Rows';
    const isValues = role === 'Values';

    for (const proj of roleData.projections) {
      if (!proj.field) continue;
      const ref = fieldExprToRef(proj.field);

      if (isRows) {
        rows.push(ref);
        group.push(ref);
      } else if (isValues) {
        values.push(ref);
        measure.push(ref);
      } else if (isGroup) {
        group.push(ref);
      } else if (isMeasure) {
        measure.push(ref);
      }
    }
  }

  let filtersIncomplete: true | undefined;
  const daxResult = buildDax(visual, diags);
  if (daxResult.filtersIncomplete) filtersIncomplete = true;

  const tile: Tile = {
    id,
    source: visualType,
    render,
    layout,
    group,
    measure,
  };

  if (render === 'ledger' && (rows.length > 0 || values.length > 0)) {
    tile.rows = rows;
    tile.values = values;
  }

  if (mobileLayout) tile.mobileLayout = mobileLayout;
  if (filtersIncomplete) tile.filtersIncomplete = true;
  if (daxResult.dax) tile.dax = daxResult.dax;
  if (daxResult.diagnostics && daxResult.diagnostics.length > 0) {
    tile.diagnostics = daxResult.diagnostics;
  }

  return tile;
}

export function buildPageManifest(page: PageRecord): PageManifest {
  const diags: Diagnostic[] = [];
  const tiles: Tile[] = [];
  let idx = 0;

  for (const visual of page.visuals) {
    if (visual.isHidden) continue;
    const tile = buildTile(visual, idx, diags);
    tiles.push(tile);
    idx++;
  }

  return {
    page: page.name,
    displayName: page.displayName,
    tiles,
    diagnostics: diags,
  };
}

export function buildReportManifests(
  pages: PageRecord[],
): { manifests: PageManifest[]; tallies: Record<string, number> } {
  const tallies: Record<string, number> = {};
  const manifests: PageManifest[] = [];

  for (const page of pages) {
    const pm = buildPageManifest(page);
    manifests.push(pm);
    for (const tile of pm.tiles) {
      tallies[tile.source] = (tallies[tile.source] ?? 0) + 1;
    }
  }

  return { manifests, tallies };
}

export { escapeTableName };
