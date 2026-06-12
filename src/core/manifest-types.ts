export type RenderType =
  | 'kpi'
  | 'bar'
  | 'bar (grouped)'
  | 'line'
  | 'area'
  | 'donut'
  | 'waterfall'
  | 'table'
  | 'ledger'
  | 'tickstrip'
  | 'filter'
  | 'text';

export interface TileLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ManifestTile {
  id: string;
  source: string;
  render: RenderType;
  layout: TileLayout;
  group: string[];
  measure: string[];
}

export interface ParsedManifest {
  tiles: ManifestTile[];
  unknownRenderIds: string[];
  malformed: number;
}

const KNOWN_RENDER_TYPES = new Set<string>([
  'kpi',
  'bar',
  'bar (grouped)',
  'line',
  'area',
  'donut',
  'waterfall',
  'table',
  'ledger',
  'tickstrip',
  'filter',
  'text',
]);

function isLayout(v: unknown): v is TileLayout {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj['x'] === 'number' &&
    typeof obj['y'] === 'number' &&
    typeof obj['w'] === 'number' &&
    typeof obj['h'] === 'number'
  );
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

export function parseManifest(raw: unknown): ParsedManifest {
  const tiles: ManifestTile[] = [];
  const unknownRenderIds: string[] = [];
  let malformed = 0;

  if (!Array.isArray(raw)) {
    return { tiles, unknownRenderIds, malformed: 1 };
  }

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) {
      malformed++;
      continue;
    }
    const obj = item as Record<string, unknown>;
    const id = typeof obj['id'] === 'string' ? obj['id'] : null;
    const source = typeof obj['source'] === 'string' ? obj['source'] : null;
    const render = typeof obj['render'] === 'string' ? obj['render'] : null;
    const layout = isLayout(obj['layout']) ? obj['layout'] : null;
    const group = isStringArray(obj['group']) ? obj['group'] : [];
    const measure = isStringArray(obj['measure']) ? obj['measure'] : [];

    if (id === null || source === null || render === null || layout === null) {
      malformed++;
      continue;
    }

    const renderType = KNOWN_RENDER_TYPES.has(render) ? (render as RenderType) : null;
    if (renderType === null) {
      unknownRenderIds.push(id);
      tiles.push({ id, source, render: 'text', layout, group, measure });
      continue;
    }

    tiles.push({ id, source, render: renderType, layout, group, measure });
  }

  return { tiles, unknownRenderIds, malformed };
}

export function tilesOfRender(manifest: ParsedManifest, render: RenderType): ManifestTile[] {
  return manifest.tiles.filter((t) => t.render === render);
}
