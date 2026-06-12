import type { ManifestTile } from '../core/manifest-types';

export interface BoundTileData {
  tileId: string;
  groups: Array<Record<string, unknown>>;
  measures: Record<string, unknown[]>;
  diagnostics: string[];
}

function normalizeGroupRef(ref: string): string {
  const m = /\[([^\]]+)\]\s*$/.exec(ref);
  if (m) return m[1]!;
  return ref;
}

function extractLastBracketContent(ref: string): string {
  const all: RegExpExecArray[] = [];
  const re = /\[([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ref)) !== null) all.push(m);
  if (all.length > 0) return all[all.length - 1]![1]!;
  return ref;
}

export function bindTileData(
  tile: ManifestTile,
  rows: Array<Record<string, unknown>>,
): BoundTileData {
  const diagnostics: string[] = [];

  const groupKeys = tile.group.map(normalizeGroupRef);
  const groupKeySet = new Set(groupKeys);

  const allColumns = rows.length > 0 ? Object.keys(rows[0]!) : [];

  for (const gk of groupKeys) {
    if (rows.length > 0 && !allColumns.includes(gk)) {
      diagnostics.push(`group ref "${gk}" not found in result columns`);
    }
  }

  const measureColumns = allColumns.filter((col) => !groupKeySet.has(col));

  const groups: Array<Record<string, unknown>> = rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const gk of groupKeys) {
      out[gk] = gk in row ? row[gk] : null;
    }
    return out;
  });

  const measures: Record<string, unknown[]> = {};
  for (const col of measureColumns) {
    measures[col] = rows.map((row) => (col in row ? row[col] : null));
  }

  if (rows.length === 0) {
    for (const ref of tile.measure) {
      const alias = extractLastBracketContent(ref);
      if (!(alias in measures)) {
        measures[alias] = [];
      }
    }
  }

  return { tileId: tile.id, groups, measures, diagnostics };
}
