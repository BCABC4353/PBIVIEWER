import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { readReport } from './reader';
import { buildDax } from './dax-gen';
import { buildPageManifest } from './manifest';
import type { VisualRecord } from './reader';

let root: string;

function colField(table: string, property: string) {
  return { Column: { Expression: { SourceRef: { Entity: table } }, Property: property } };
}

function srcCol(source: string, property: string) {
  return { Column: { Expression: { SourceRef: { Source: source } }, Property: property } };
}

function literal(v: string) {
  return { Literal: { Value: v } };
}

function writeReport(reportName: string, visualName: string, visualJson: unknown): string {
  const reportDir = join(root, `${reportName}.Report`);
  const pageHash = 'pagehash01';
  const pagesDir = join(reportDir, 'definition', 'pages');
  const pageDir = join(pagesDir, pageHash);
  const visualDir = join(pageDir, 'visuals', visualName);
  mkdirSync(visualDir, { recursive: true });
  writeFileSync(join(pagesDir, 'pages.json'), JSON.stringify({ pageOrder: [pageHash], activePageName: pageHash }));
  writeFileSync(join(pageDir, 'page.json'), JSON.stringify({ name: pageHash, displayName: 'P', width: 1280, height: 720 }));
  writeFileSync(join(visualDir, 'visual.json'), JSON.stringify(visualJson));
  return reportDir;
}

function readVisual(reportName: string, visualName: string, visualJson: unknown): VisualRecord {
  const dir = writeReport(reportName, visualName, visualJson);
  const report = readReport(dir);
  return report.pages[0].visuals[0];
}

function chartVisual(filters: unknown[]): unknown {
  return {
    name: 'v',
    position: { x: 0, y: 0, z: 0, width: 100, height: 100 },
    visual: {
      visualType: 'columnChart',
      query: {
        queryState: {
          Category: { projections: [{ field: colField('SALES', 'REGION'), queryRef: 'SALES.REGION' }] },
          Y: { projections: [{ field: { Aggregation: { Expression: { Column: colField('SALES', 'Revenue').Column }, Function: 0 } }, queryRef: 'Sum(SALES.Revenue)' }] },
        },
      },
    },
    filterConfig: { filters },
  };
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'crosswalk-filter-'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('C1 — real PBIR Categorical In-filter: nested Literal.Value is unwrapped', () => {
  it('reader extracts literal string values from [[ {Literal:{Value}} ]] shape', () => {
    const filter = {
      name: 'f1',
      field: colField('SALES', 'STATUS'),
      type: 'Categorical',
      filter: {
        Version: 2,
        From: [{ Name: 'q', Entity: 'SALES', Type: 0 }],
        Where: [
          {
            Condition: {
              In: {
                Expressions: [srcCol('q', 'STATUS')],
                Values: [[literal("'FALSE'")], [literal("'TRUE'")]],
              },
            },
          },
        ],
      },
    };
    const visual = readVisual('c1a', 'v1', chartVisual([filter]));
    const fe = visual.filterConfig!.filters[0];
    expect(fe.status).toBe('in-values');
    expect(fe.values).toEqual(['FALSE', 'TRUE']);

    const result = buildDax(visual, []);
    expect(result.dax).toContain('KEEPFILTERS(TREATAS({"FALSE", "TRUE"}, \'SALES\'[STATUS]))');
    expect(result.dax).not.toContain('[object Object]');
    expect(result.filtersIncomplete).toBe(false);
  });

  it('numeric literal suffixes (L/D) are stripped from values', () => {
    const filter = {
      name: 'f2',
      field: colField('SALES', 'YEAR'),
      type: 'Categorical',
      filter: {
        Where: [{ Condition: { In: { Expressions: [srcCol('q', 'YEAR')], Values: [[literal('2024L')], [literal('2025L')]] } } }],
      },
    };
    const visual = readVisual('c1b', 'v1', chartVisual([filter]));
    expect(visual.filterConfig!.filters[0].values).toEqual(['2024', '2025']);
    const result = buildDax(visual, []);
    expect(result.dax).toContain('TREATAS({"2024", "2025"}');
  });

  it('escaped single quotes inside a literal are unescaped correctly', () => {
    const filter = {
      name: 'f3',
      field: colField('SALES', 'NAME'),
      type: 'Categorical',
      filter: {
        Where: [{ Condition: { In: { Expressions: [srcCol('q', 'NAME')], Values: [[literal("'O''Brien'")]] } } }],
      },
    };
    const visual = readVisual('c1c', 'v1', chartVisual([filter]));
    expect(visual.filterConfig!.filters[0].values).toEqual(["O'Brien"]);
    const result = buildDax(visual, []);
    expect(result.dax).toContain('TREATAS({"O\'Brien"}');
  });
});

describe('C2 — empty / non-In Categorical filter is flagged, never silently dropped', () => {
  it('Comparison-only Categorical filter -> filtersIncomplete + diagnostic', () => {
    const filter = {
      name: 'cmp',
      field: colField('SALES', 'AMOUNT'),
      type: 'Categorical',
      filter: {
        Where: [
          {
            Condition: {
              Comparison: {
                ComparisonKind: 0,
                Left: srcCol('q', 'AMOUNT'),
                Right: { Literal: { Value: '100L' } },
              },
            },
          },
        ],
      },
    };
    const visual = readVisual('c2a', 'v1', chartVisual([filter]));
    expect(visual.filterConfig!.filters[0].status).toBe('unparseable');
    const diags: import('./reader').Diagnostic[] = [];
    const result = buildDax(visual, diags);
    expect(result.filtersIncomplete).toBe(true);
    expect(result.dax).not.toContain('KEEPFILTERS');
    expect(diags.some((d) => d.code === 'FILTER_OMITTED')).toBe(true);
  });

  it('empty Where Categorical filter -> filtersIncomplete + diagnostic', () => {
    const filter = { name: 'empty', field: colField('SALES', 'STATUS'), type: 'Categorical', filter: { Where: [] } };
    const visual = readVisual('c2b', 'v1', chartVisual([filter]));
    expect(visual.filterConfig!.filters[0].status).toBe('unparseable');
    const diags: import('./reader').Diagnostic[] = [];
    const result = buildDax(visual, diags);
    expect(result.filtersIncomplete).toBe(true);
    expect(diags.some((d) => d.code === 'FILTER_OMITTED')).toBe(true);
  });

  it('In condition with empty Values -> filtersIncomplete + diagnostic', () => {
    const filter = {
      name: 'noVals',
      field: colField('SALES', 'STATUS'),
      type: 'Categorical',
      filter: { Where: [{ Condition: { In: { Expressions: [srcCol('q', 'STATUS')], Values: [] } } }] },
    };
    const visual = readVisual('c2c', 'v1', chartVisual([filter]));
    expect(visual.filterConfig!.filters[0].status).toBe('unparseable');
    const diags: import('./reader').Diagnostic[] = [];
    const result = buildDax(visual, diags);
    expect(result.filtersIncomplete).toBe(true);
  });
});

describe('C3 — Not(In) exclude filter is flagged, never silently inverted', () => {
  it('negated In condition -> unparseable + filtersIncomplete + diagnostic', () => {
    const filter = {
      name: 'notin',
      field: colField('SALES', 'CATEGORY'),
      type: 'Categorical',
      filter: {
        Where: [
          {
            Condition: {
              Not: {
                Expression: {
                  In: {
                    Expressions: [srcCol('q', 'CATEGORY')],
                    Values: [[literal("'ALPHA'")], [literal("'BRAVO'")]],
                  },
                },
              },
            },
          },
        ],
      },
    };
    const visual = readVisual('c3a', 'v1', chartVisual([filter]));
    expect(visual.filterConfig!.filters[0].status).toBe('unparseable');
    expect(visual.filterConfig!.filters[0].reason).toContain('Not');
    const diags: import('./reader').Diagnostic[] = [];
    const result = buildDax(visual, diags);
    expect(result.filtersIncomplete).toBe(true);
    expect(result.dax).not.toContain('KEEPFILTERS');
    expect(result.dax).not.toContain('ALPHA');
    expect(diags.some((d) => d.code === 'FILTER_OMITTED')).toBe(true);
  });
});

describe('H2 — compound multi-condition Where is flagged, conditions not silently dropped', () => {
  it('multi-Where Categorical filter -> unparseable + filtersIncomplete', () => {
    const filter = {
      name: 'compound',
      field: colField('SALES', 'STATUS'),
      type: 'Categorical',
      filter: {
        Where: [
          { Condition: { In: { Expressions: [srcCol('q', 'STATUS')], Values: [[literal("'A'")]] } } },
          { Condition: { In: { Expressions: [srcCol('q', 'REGION')], Values: [[literal("'North'")]] } } },
        ],
      },
    };
    const visual = readVisual('h2a', 'v1', chartVisual([filter]));
    expect(visual.filterConfig!.filters[0].status).toBe('unparseable');
    expect(visual.filterConfig!.filters[0].reason).toContain('compound');
    const result = buildDax(visual, []);
    expect(result.filtersIncomplete).toBe(true);
    expect(result.dax).not.toContain('KEEPFILTERS');
  });

  it('And-condition Categorical filter -> unparseable', () => {
    const filter = {
      name: 'andcond',
      field: colField('SALES', 'STATUS'),
      type: 'Categorical',
      filter: { Where: [{ Condition: { And: { Left: {}, Right: {} } } }] },
    };
    const visual = readVisual('h2b', 'v1', chartVisual([filter]));
    expect(visual.filterConfig!.filters[0].status).toBe('unparseable');
    expect(buildDax(visual, []).filtersIncomplete).toBe(true);
  });
});

describe('non-Categorical filters stay not-applicable (no false filtersIncomplete)', () => {
  it('RelativeDate filter is not-applicable and does not flag the tile', () => {
    const filter = { name: 'rd', field: colField('SALES', 'DATE'), type: 'RelativeDate', filter: { Where: [{ Condition: { Comparison: {} } }] } };
    const visual = readVisual('na1', 'v1', chartVisual([filter]));
    expect(visual.filterConfig!.filters[0].status).toBe('not-applicable');
    const result = buildDax(visual, []);
    expect(result.filtersIncomplete).toBe(false);
    expect(result.dax).not.toContain('KEEPFILTERS');
  });
});

describe('H1 — GUID-suffixed textFilter maps to filter render target', () => {
  it('textFilter25A4896A... -> filter', () => {
    const visualJson = {
      name: 'v',
      position: { x: 0, y: 0, z: 0, width: 100, height: 100 },
      visual: { visualType: 'textFilter25A4896A83E0487089E2B90C9AE57C8A', query: { queryState: {} } },
    };
    const dir = writeReport('h1a', 'v1', visualJson);
    const report = readReport(dir);
    const manifest = buildPageManifest(report.pages[0]);
    expect(manifest.tiles[0].render).toBe('filter');
  });
});
