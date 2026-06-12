import { describe, expect, it } from 'vitest';
import { bindTileData } from './manifest-binding';
import type { ManifestTile } from '../core/manifest-types';
import SYNTHETIC_RAW from '../../tools/crosswalk/example-synthetic.json';
import { parseManifest } from '../core/manifest-types';

const tile = (overrides: Partial<ManifestTile> = {}): ManifestTile => ({
  id: 'v0',
  source: 'columnChart',
  render: 'bar',
  layout: { x: 0, y: 0, w: 200, h: 100 },
  group: ["'SALES'[REGION]"],
  measure: ["SUM('SALES'[Revenue])"],
  ...overrides,
});

const rows = [
  { REGION: 'NORTH', Revenue: 100 },
  { REGION: 'SOUTH', Revenue: 200 },
  { REGION: 'WEST', Revenue: 150 },
];

describe('bindTileData — happy path', () => {
  it('extracts group values for each row', () => {
    const result = bindTileData(tile(), rows);
    expect(result.tileId).toBe('v0');
    expect(result.groups).toHaveLength(3);
    expect(result.groups[0]!['REGION']).toBe('NORTH');
    expect(result.groups[2]!['REGION']).toBe('WEST');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('extracts measure values by alias', () => {
    const result = bindTileData(tile(), rows);
    expect(result.measures['Revenue']).toEqual([100, 200, 150]);
  });

  it('handles multiple group columns', () => {
    const multiGroupTile = tile({
      group: ["'SALES'[REGION]", "'SALES'[PRODUCT]"],
      measure: [],
    });
    const multiRows = [
      { REGION: 'NORTH', PRODUCT: 'ALPHA', Revenue: 100 },
      { REGION: 'SOUTH', PRODUCT: 'BETA', Revenue: 200 },
    ];
    const result = bindTileData(multiGroupTile, multiRows);
    expect(result.groups[0]!['REGION']).toBe('NORTH');
    expect(result.groups[0]!['PRODUCT']).toBe('ALPHA');
    expect(result.groups[1]!['PRODUCT']).toBe('BETA');
  });

  it('handles multiple measure aliases', () => {
    const multiMeasureTile = tile({
      group: [],
      measure: ['[Revenue]', '[OrderCount_0]'],
    });
    const multiRows = [
      { Revenue: 500, OrderCount_0: 10 },
      { Revenue: 300, OrderCount_0: 6 },
    ];
    const result = bindTileData(multiMeasureTile, multiRows);
    expect(result.measures['Revenue']).toEqual([500, 300]);
    expect(result.measures['OrderCount_0']).toEqual([10, 6]);
  });

  it('preserves null values in groups and measures', () => {
    const nullRows = [
      { REGION: null, Revenue: 100 },
      { REGION: 'EAST', Revenue: null },
    ];
    const result = bindTileData(tile(), nullRows);
    expect(result.groups[0]!['REGION']).toBeNull();
    expect(result.measures['Revenue']![1]).toBeNull();
  });

  it('returns empty arrays for a tile with no rows', () => {
    const result = bindTileData(tile(), []);
    expect(result.groups).toEqual([]);
    expect(result.measures['Revenue']).toEqual([]);
    expect(result.diagnostics).toHaveLength(0);
  });
});

describe('bindTileData — diagnostic reporting', () => {
  it('reports missing group column as diagnostic, not throw', () => {
    const mismatchedTile = tile({ group: ["'SALES'[MISSING_COL]"], measure: [] });
    const result = bindTileData(mismatchedTile, [{ REGION: 'NORTH' }]);
    expect(result.diagnostics.some((d) => d.includes('MISSING_COL'))).toBe(true);
  });

  it('all non-group columns are treated as measures — no throw when manifest measure ref does not match result alias', () => {
    const mismatchedTile = tile({ group: [], measure: ['[GHOST_MEASURE]'] });
    const result = bindTileData(mismatchedTile, [{ Revenue: 100 }]);
    expect(() => bindTileData(mismatchedTile, [{ Revenue: 100 }])).not.toThrow();
    expect(result.measures['Revenue']).toEqual([100]);
  });

  it('fills missing column values with null instead of crashing', () => {
    const mismatchedTile = tile({ group: ["'SALES'[MISSING]"], measure: [] });
    const result = bindTileData(mismatchedTile, [{ REGION: 'NORTH' }]);
    expect(result.groups[0]!['MISSING']).toBeNull();
  });
});

describe('bindTileData — kpi tile (no group)', () => {
  it('binds a measure-only kpi tile correctly', () => {
    const kpiTile = tile({ id: 'v3', render: 'kpi', group: [], measure: ['[Revenue]'] });
    const kpiRows = [{ Revenue: 12345 }];
    const result = bindTileData(kpiTile, kpiRows);
    expect(result.tileId).toBe('v3');
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toEqual({});
    expect(result.measures['Revenue']).toEqual([12345]);
  });
});

describe('bindTileData — round-trip against synthetic manifest', () => {
  const manifest = parseManifest(SYNTHETIC_RAW);

  it('parsed manifest has the expected tile count', () => {
    expect(manifest.tiles.length).toBeGreaterThan(0);
    expect(manifest.malformed).toBe(0);
  });

  it('bar tile v0 binds synthetic rows correctly', () => {
    const v0 = manifest.tiles.find((t) => t.id === 'v0');
    expect(v0).toBeDefined();
    if (!v0) return;

    const syntheticRows = [
      { REGION: 'NORTH', Revenue_0: 100 },
      { REGION: 'SOUTH', Revenue_0: 200 },
    ];
    const result = bindTileData(v0, syntheticRows);
    expect(result.tileId).toBe('v0');
    expect(result.groups[0]!['REGION']).toBe('NORTH');
    expect(result.measures['Revenue_0']).toEqual([100, 200]);
  });

  it('ledger tile v1 binds multi-group synthetic rows', () => {
    const v1 = manifest.tiles.find((t) => t.id === 'v1');
    expect(v1).toBeDefined();
    if (!v1) return;

    const syntheticRows = [
      { REGION: 'NORTH', PRODUCT: 'ALPHA', OrderId_0: 10 },
      { REGION: 'SOUTH', PRODUCT: 'BETA', OrderId_0: 20 },
    ];
    const result = bindTileData(v1, syntheticRows);
    expect(result.groups[0]!['REGION']).toBe('NORTH');
    expect(result.groups[0]!['PRODUCT']).toBe('ALPHA');
    expect(result.measures['OrderId_0']).toEqual([10, 20]);
  });

  it('kpi tile v3 binds measure-only rows', () => {
    const v3 = manifest.tiles.find((t) => t.id === 'v3');
    expect(v3).toBeDefined();
    if (!v3) return;

    const syntheticRows = [{ Revenue_0: 9999 }];
    const result = bindTileData(v3, syntheticRows);
    expect(result.measures['Revenue_0']).toEqual([9999]);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('all tiles from the synthetic manifest bind without throwing', () => {
    for (const t of manifest.tiles) {
      expect(() => bindTileData(t, [])).not.toThrow();
    }
  });
});
