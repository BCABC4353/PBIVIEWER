import { describe, it, expect } from 'vitest';
import type { VisualRecord, PageRecord } from './reader';
import { buildPageManifest } from './manifest';
import { buildDax } from './dax-gen';

function makeVisual(overrides: Partial<VisualRecord> = {}): VisualRecord {
  return {
    name: 'test_visual',
    position: { x: 10, y: 20, z: 1000, width: 300, height: 200 },
    visualType: 'columnChart',
    query: { queryState: {} },
    isHidden: false,
    ...overrides,
  };
}

function makePage(visuals: VisualRecord[]): PageRecord {
  return {
    name: 'page1',
    displayName: 'Page One',
    width: 1280,
    height: 720,
    visuals,
  };
}

describe('Manifest building — type mapping', () => {
  const typeMapCases: Array<[string, string]> = [
    ['card', 'kpi'],
    ['cardVisual', 'kpi'],
    ['columnChart', 'bar'],
    ['clusteredColumnChart', 'bar'],
    ['barChart', 'bar'],
    ['clusteredBarChart', 'bar'],
    ['lineChart', 'line'],
    ['areaChart', 'area'],
    ['pieChart', 'donut'],
    ['donutChart', 'donut'],
    ['waterfallChart', 'waterfall'],
    ['tableEx', 'table'],
    ['pivotTable', 'ledger'],
    ['gauge', 'tickstrip'],
    ['slicer', 'filter'],
    ['textFilter', 'filter'],
    ['actionButton', 'chrome'],
    ['image', 'chrome'],
  ];

  for (const [source, expectedRender] of typeMapCases) {
    it(`${source} -> ${expectedRender}`, () => {
      const visual = makeVisual({ visualType: source, query: { queryState: {} } });
      const page = makePage([visual]);
      const manifest = buildPageManifest(page);
      expect(manifest.tiles.length).toBe(1);
      expect(manifest.tiles[0].render).toBe(expectedRender);
      expect(manifest.tiles[0].source).toBe(source);
    });
  }

  it('unknown visualType -> unsupported', () => {
    const visual = makeVisual({ visualType: 'FlowVisual_unknown123', query: { queryState: {} } });
    const page = makePage([visual]);
    const manifest = buildPageManifest(page);
    expect(manifest.tiles[0].render).toBe('unsupported');
  });

  it('custom Gantt with Task+StartDate roles -> timeline', () => {
    const visual = makeVisual({
      visualType: 'Gantt1448688115699',
      query: {
        queryState: {
          Task: { projections: [{ field: { kind: 'Column', table: 'T', property: 'Task' }, queryRef: 'T.Task' }] },
          StartDate: { projections: [{ field: { kind: 'Column', table: 'T', property: 'Start' }, queryRef: 'T.Start' }] },
        },
      },
    });
    const page = makePage([visual]);
    const manifest = buildPageManifest(page);
    expect(manifest.tiles[0].render).toBe('timeline');
  });

  it('bciCalendar with category + measure roles -> calendar', () => {
    const visual = makeVisual({
      visualType: 'bciCalendar',
      query: {
        queryState: {
          Category: { projections: [{ field: { kind: 'Column', table: 'T', property: 'Date' }, queryRef: 'T.Date' }] },
          Values: { projections: [{ field: { kind: 'Aggregation', table: 'T', property: 'Count', fn: 5 }, queryRef: 'COUNTA(T.Count)' }] },
        },
      },
    });
    const page = makePage([visual]);
    const manifest = buildPageManifest(page);
    expect(manifest.tiles[0].render).toBe('calendar');
  });

  it('bciCalendar without required roles -> unsupported', () => {
    const visual = makeVisual({ visualType: 'bciCalendar', query: { queryState: {} } });
    const page = makePage([visual]);
    const manifest = buildPageManifest(page);
    expect(manifest.tiles[0].render).toBe('unsupported');
  });

  it('asTimeline without required roles -> unsupported', () => {
    const visual = makeVisual({ visualType: 'asTimeline__v1', query: { queryState: { Values: { projections: [] } } } });
    const page = makePage([visual]);
    const manifest = buildPageManifest(page);
    expect(manifest.tiles[0].render).toBe('unsupported');
  });

  it('asTimeline with Task+StartDate roles -> timeline', () => {
    const visual = makeVisual({
      visualType: 'asTimeline__v1',
      query: {
        queryState: {
          Task: { projections: [{ field: { kind: 'Column', table: 'T', property: 'Name' }, queryRef: 'T.Name' }] },
          StartDate: { projections: [{ field: { kind: 'Column', table: 'T', property: 'Start' }, queryRef: 'T.Start' }] },
        },
      },
    });
    const page = makePage([visual]);
    const manifest = buildPageManifest(page);
    expect(manifest.tiles[0].render).toBe('timeline');
  });
});

describe('Manifest building — layout from position', () => {
  it('rounds x/y/width/height to integers', () => {
    const visual = makeVisual({
      position: { x: 9.8969, y: 0.5, z: 0, width: 1269.8969, height: 399.58 },
    });
    const page = makePage([visual]);
    const manifest = buildPageManifest(page);
    expect(manifest.tiles[0].layout).toEqual({ x: 10, y: 1, w: 1270, h: 400 });
  });
});

describe('Manifest building — mobile layout', () => {
  it('includes mobileLayout when mobile position present', () => {
    const visual = makeVisual({ mobile: { x: 0, y: 14, z: 2, width: 324, height: 96 } });
    const page = makePage([visual]);
    const manifest = buildPageManifest(page);
    expect(manifest.tiles[0].mobileLayout).toEqual({ x: 0, y: 14, w: 324, h: 96 });
  });

  it('mobileLayout absent when no mobile position', () => {
    const visual = makeVisual({ mobile: undefined });
    const page = makePage([visual]);
    const manifest = buildPageManifest(page);
    expect(manifest.tiles[0].mobileLayout).toBeUndefined();
  });
});

describe('Manifest building — hidden visuals skipped', () => {
  it('isHidden=true visuals are excluded from tiles', () => {
    const visible = makeVisual({ visualType: 'card', name: 'v1' });
    const hidden = makeVisual({ visualType: 'slicer', name: 'v2', isHidden: true });
    const page = makePage([visible, hidden]);
    const manifest = buildPageManifest(page);
    expect(manifest.tiles.length).toBe(1);
    expect(manifest.tiles[0].source).toBe('card');
  });
});

describe('Manifest building — missing binding gaps (no projections)', () => {
  it('tile with no query roles produces empty group and measure arrays', () => {
    const visual = makeVisual({ visualType: 'columnChart', query: { queryState: {} } });
    const page = makePage([visual]);
    const manifest = buildPageManifest(page);
    expect(manifest.tiles[0].group).toEqual([]);
    expect(manifest.tiles[0].measure).toEqual([]);
    expect(manifest.tiles[0].dax).toBeUndefined();
  });
});

describe('Manifest building — ledger rows/values', () => {
  it('ledger tile includes rows and values arrays', () => {
    const visual = makeVisual({
      visualType: 'pivotTable',
      query: {
        queryState: {
          Rows: {
            projections: [
              { field: { kind: 'Column', table: 'SALES', property: 'REGION' }, queryRef: 'SALES.REGION' },
              { field: { kind: 'Column', table: 'SALES', property: 'PRODUCT' }, queryRef: 'SALES.PRODUCT' },
            ],
          },
          Values: {
            projections: [
              { field: { kind: 'Aggregation', table: 'SALES', property: 'Revenue', fn: 0 }, queryRef: 'Sum(SALES.Revenue)' },
            ],
          },
        },
      },
    });
    const page = makePage([visual]);
    const manifest = buildPageManifest(page);
    const tile = manifest.tiles[0];
    expect(tile.render).toBe('ledger');
    expect(tile.rows).toEqual(["'SALES'[REGION]", "'SALES'[PRODUCT]"]);
    expect(tile.values).toEqual(["SUM('SALES'[Revenue])"]);
  });
});

describe('Manifest building — tile id sequence', () => {
  it('tile ids increment correctly for multiple visuals', () => {
    const visuals = [
      makeVisual({ name: 'a', visualType: 'card' }),
      makeVisual({ name: 'b', visualType: 'slicer' }),
      makeVisual({ name: 'c', visualType: 'tableEx' }),
    ];
    const page = makePage(visuals);
    const manifest = buildPageManifest(page);
    expect(manifest.tiles.map((t) => t.id)).toEqual(['v0', 'v1', 'v2']);
  });
});

describe('DAX generation — ledger / pivotTable with rows hierarchy', () => {
  it('emits all Rows columns as group expressions before Values', () => {
    const visual = makeVisual({
      visualType: 'pivotTable',
      query: {
        queryState: {
          Rows: {
            projections: [
              { field: { kind: 'Column', table: 'SALES', property: 'REGION' }, queryRef: 'SALES.REGION' },
              { field: { kind: 'Column', table: 'SALES', property: 'PRODUCT' }, queryRef: 'SALES.PRODUCT' },
            ],
          },
          Values: {
            projections: [
              { field: { kind: 'Aggregation', table: 'SALES', property: 'Revenue', fn: 5 }, queryRef: 'CountNonNull(SALES.Revenue)' },
            ],
          },
        },
      },
    });
    const diags: import('./reader').Diagnostic[] = [];
    const result = buildDax(visual, diags);
    expect(result.dax).toBe(
      "EVALUATE\nSUMMARIZECOLUMNS(\n  'SALES'[REGION],\n  'SALES'[PRODUCT],\n  \"Revenue_0\", COUNTA('SALES'[Revenue])\n)",
    );
  });
});
