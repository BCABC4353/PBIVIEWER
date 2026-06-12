import { describe, it, expect } from 'vitest';
import {
  columnRef,
  measureRef,
  escapeTableName,
  escapeBracketName,
  daxStringLiteral,
} from './escape';
import type { VisualRecord, PageRecord, Diagnostic } from './reader';
import { buildDax, buildDaxFromProjections } from './dax-gen';
import { buildPageManifest } from './manifest';


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

describe('escaping primitives (DAX string safety)', () => {
  it('escapeTableName wraps in single quotes and doubles internal apostrophes', () => {
    expect(escapeTableName("O'Brien]X")).toBe("'O''Brien]X'");
  });

  it('escapeBracketName wraps in brackets and doubles internal brackets', () => {
    expect(escapeBracketName("O'Brien]X")).toBe("[O'Brien]]X]");
  });

  it('columnRef round-trips a tricky table+column', () => {
    expect(columnRef("O'Brien]X", "O'Brien]X")).toBe("'O''Brien]X'[O'Brien]]X]");
  });

  it('measureRef doubles closing bracket', () => {
    expect(measureRef("My]Measure")).toBe("[My]]Measure]");
  });

  it('daxStringLiteral doubles double-quotes', () => {
    expect(daxStringLiteral('Say "Hello"')).toBe('"Say ""Hello"""');
  });

  it('escapeTableName handles table with no special chars', () => {
    expect(escapeTableName('SALES')).toBe("'SALES'");
  });

  it('columnRef handles plain names', () => {
    expect(columnRef('SALES', 'REGION')).toBe("'SALES'[REGION]");
  });
});

describe('DAX generation — column chart (bar)', () => {
  const visual = makeVisual({
    visualType: 'columnChart',
    query: {
      queryState: {
        Category: {
          projections: [
            { field: { kind: 'Column', table: 'SALES', property: 'REGION' }, queryRef: 'SALES.REGION' },
          ],
        },
        Y: {
          projections: [
            { field: { kind: 'Aggregation', table: 'SALES', property: 'Revenue', fn: 0 }, queryRef: 'Sum(SALES.Revenue)' },
          ],
        },
      },
    },
  });

  it('produces SUMMARIZECOLUMNS with group and SUM measure', () => {
    const diags: Diagnostic[] = [];
    const result = buildDax(visual, diags);
    expect(result.dax).toBe(
      "EVALUATE\nSUMMARIZECOLUMNS(\n  'SALES'[REGION],\n  \"Revenue_0\", SUM('SALES'[Revenue])\n)",
    );
    expect(result.filtersIncomplete).toBe(false);
    expect(diags.length).toBe(0);
  });
});

describe('DAX generation — aggregation function mapping', () => {
  const aggCases: Array<[number, string]> = [
    [0, 'SUM'], [1, 'AVERAGE'], [2, 'MIN'], [3, 'MAX'],
    [4, 'COUNT'], [5, 'COUNTA'], [6, 'MEDIAN'], [7, 'STDEV.P'], [8, 'VAR.P'],
  ];

  for (const [fn, aggName] of aggCases) {
    it(`Function ${fn} -> ${aggName}`, () => {
      const visual = makeVisual({
        visualType: 'pivotTable',
        query: {
          queryState: {
            Rows: {
              projections: [
                { field: { kind: 'Column', table: 'SALES', property: 'REGION' }, queryRef: 'SALES.REGION' },
              ],
            },
            Values: {
              projections: [
                { field: { kind: 'Aggregation', table: 'SALES', property: 'Revenue', fn }, queryRef: `Agg${fn}(SALES.Revenue)` },
              ],
            },
          },
        },
      });
      const diags: Diagnostic[] = [];
      const result = buildDax(visual, diags);
      expect(result.dax).toContain(aggName);
    });
  }
});

describe('DAX generation — measure projection', () => {
  it('measure in Values role wraps in brackets (no aggregation function)', () => {
    const visual = makeVisual({
      visualType: 'card',
      query: {
        queryState: {
          Values: {
            projections: [
              { field: { kind: 'Measure', table: 'SALES', property: 'Revenue' }, queryRef: 'SALES.Revenue' },
            ],
          },
        },
      },
    });
    const diags: Diagnostic[] = [];
    const result = buildDax(visual, diags);
    expect(result.dax).toContain('[Revenue]');
    expect(result.dax).not.toContain('SUM(');
    expect(result.dax).not.toContain('AVERAGE(');
  });
});

describe('DAX generation — filter: Categorical In-values', () => {
  it('appends KEEPFILTERS(TREATAS(...)) for Categorical filter with values', () => {
    const visual = makeVisual({
      visualType: 'tableEx',
      query: {
        queryState: {
          Values: {
            projections: [
              { field: { kind: 'Column', table: 'SALES', property: 'REGION' }, queryRef: 'SALES.REGION' },
            ],
          },
        },
      },
      filterConfig: {
        filters: [
          { name: 'filter1', type: 'Categorical', field: { kind: 'Column', table: 'SALES', property: 'REGION' }, values: ['North', 'South'], status: 'in-values' },
        ],
      },
    });
    const diags: Diagnostic[] = [];
    const result = buildDax(visual, diags);
    expect(result.dax).toContain('KEEPFILTERS(TREATAS({"North", "South"}, \'SALES\'[REGION]))');
    expect(result.filtersIncomplete).toBe(false);
  });

  it('non-Categorical filter (Advanced) does not trigger filtersIncomplete', () => {
    const visual = makeVisual({
      visualType: 'columnChart',
      query: {
        queryState: {
          Category: {
            projections: [
              { field: { kind: 'Column', table: 'SALES', property: 'REGION' }, queryRef: 'SALES.REGION' },
            ],
          },
          Y: {
            projections: [
              { field: { kind: 'Aggregation', table: 'SALES', property: 'Revenue', fn: 0 }, queryRef: 'Sum(SALES.Revenue)' },
            ],
          },
        },
      },
      filterConfig: {
        filters: [{ name: 'advFilter', type: 'Advanced', field: null, values: undefined, status: 'not-applicable' }],
      },
    });
    const diags: Diagnostic[] = [];
    const result = buildDax(visual, diags);
    expect(result.filtersIncomplete).toBe(false);
    expect(result.dax).not.toContain('KEEPFILTERS');
  });
});

describe('DAX generation — adversarial escaping: O\'Brien]X', () => {
  it('correctly escapes table O\'Brien]X and column O\'Brien]X in SUMMARIZECOLUMNS', () => {
    const visual = makeVisual({
      visualType: 'columnChart',
      query: {
        queryState: {
          Category: {
            projections: [
              { field: { kind: 'Column', table: "O'Brien]X", property: "O'Brien]X" }, queryRef: "O'Brien]X.O'Brien]X" },
            ],
          },
          Y: {
            projections: [
              { field: { kind: 'Aggregation', table: "O'Brien]X", property: "Val", fn: 0 }, queryRef: "Sum(Val)" },
            ],
          },
        },
      },
    });
    const diags: Diagnostic[] = [];
    const result = buildDax(visual, diags);
    expect(result.dax).toBe(
      "EVALUATE\nSUMMARIZECOLUMNS(\n  'O''Brien]X'[O'Brien]]X],\n  \"Val_0\", SUM('O''Brien]X'[Val])\n)",
    );
  });
});

describe('buildDaxFromProjections helper', () => {
  it('correctly builds DAX from explicit projections and filter clauses', () => {
    const groupProjections = [
      { field: { kind: 'Column' as const, table: 'SALES', property: 'REGION' }, queryRef: 'SALES.REGION' },
    ];
    const valueProjections = [
      { field: { kind: 'Aggregation' as const, table: 'SALES', property: 'Revenue', fn: 0 }, queryRef: 'Sum(SALES.Revenue)' },
    ];
    const dax = buildDaxFromProjections(groupProjections, valueProjections, []);
    expect(dax).toBe(
      "EVALUATE\nSUMMARIZECOLUMNS(\n  'SALES'[REGION],\n  \"Revenue_0\", SUM('SALES'[Revenue])\n)",
    );
  });
});

describe('DAX generation — chrome visuals return null dax', () => {
  it('actionButton -> null dax', () => {
    const visual = makeVisual({ visualType: 'actionButton', query: { queryState: {} } });
    const diags: Diagnostic[] = [];
    expect(buildDax(visual, diags).dax).toBeNull();
  });

  it('image -> null dax', () => {
    const visual = makeVisual({ visualType: 'image', query: { queryState: {} } });
    const diags: Diagnostic[] = [];
    expect(buildDax(visual, diags).dax).toBeNull();
  });
});
