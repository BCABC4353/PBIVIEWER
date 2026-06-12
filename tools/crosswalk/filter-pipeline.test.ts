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
  it('Comparison-Equal Categorical filter is now translated to KEEPFILTERS(FILTER(ALL(...), ...))', () => {
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
    expect(visual.filterConfig!.filters[0].status).toBe('comparison');
    const diags: import('./reader').Diagnostic[] = [];
    const result = buildDax(visual, diags);
    expect(result.filtersIncomplete).toBe(false);
    expect(result.dax).toContain("KEEPFILTERS(FILTER(ALL('SALES'[AMOUNT]), 'SALES'[AMOUNT] = 100))");
    expect(result.dax).not.toContain('[object Object]');
    expect(diags.some((d) => d.code === 'FILTER_OMITTED')).toBe(false);
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

describe('C3 — Not(In) exclude filter is now translated, never silently inverted', () => {
  it('negated In condition -> not-in status + KEEPFILTERS(FILTER(ALL(...), NOT(...IN...)))', () => {
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
    expect(visual.filterConfig!.filters[0].status).toBe('not-in');
    const diags: import('./reader').Diagnostic[] = [];
    const result = buildDax(visual, diags);
    expect(result.filtersIncomplete).toBe(false);
    expect(result.dax).toContain("KEEPFILTERS(FILTER(ALL('SALES'[CATEGORY]), NOT('SALES'[CATEGORY] IN {\"ALPHA\", \"BRAVO\"})))");
    expect(result.dax).not.toContain('[object Object]');
    expect(diags.some((d) => d.code === 'FILTER_OMITTED')).toBe(false);
  });

  it('Not wrapping a non-In condition is still refused and flagged', () => {
    const filter = {
      name: 'notcmp',
      field: colField('SALES', 'AMOUNT'),
      type: 'Categorical',
      filter: {
        Where: [
          {
            Condition: {
              Not: {
                Expression: {
                  Comparison: {
                    ComparisonKind: 1,
                    Left: srcCol('q', 'AMOUNT'),
                    Right: { Literal: { Value: '500L' } },
                  },
                },
              },
            },
          },
        ],
      },
    };
    const visual = readVisual('c3b', 'v1', chartVisual([filter]));
    expect(visual.filterConfig!.filters[0].status).toBe('unparseable');
    expect(visual.filterConfig!.filters[0].reason).toContain('Not');
    const diags: import('./reader').Diagnostic[] = [];
    const result = buildDax(visual, diags);
    expect(result.filtersIncomplete).toBe(true);
    expect(result.dax).not.toContain('KEEPFILTERS');
    expect(result.dax).not.toContain('500');
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

describe('C4 — Comparison filter shapes translate to correct DAX predicates', () => {
  function comparisonFilter(name: string, col: string, kind: number, rawValue: string) {
    return {
      name,
      field: colField('SALES', col),
      type: 'Categorical',
      filter: {
        Where: [
          {
            Condition: {
              Comparison: {
                ComparisonKind: kind,
                Left: srcCol('q', col),
                Right: { Literal: { Value: rawValue } },
              },
            },
          },
        ],
      },
    };
  }

  it('GreaterThan (kind=1) integer -> FILTER(ALL(...), col > val)', () => {
    const visual = readVisual('c4a', 'v1', chartVisual([comparisonFilter('f', 'AMOUNT', 1, '200L')]));
    expect(visual.filterConfig!.filters[0].status).toBe('comparison');
    const result = buildDax(visual, []);
    expect(result.filtersIncomplete).toBe(false);
    expect(result.dax).toContain("KEEPFILTERS(FILTER(ALL('SALES'[AMOUNT]), 'SALES'[AMOUNT] > 200))");
    expect(result.dax).not.toContain('[object Object]');
  });

  it('GreaterThanOrEqual (kind=2) decimal -> FILTER(ALL(...), col >= val)', () => {
    const visual = readVisual('c4b', 'v1', chartVisual([comparisonFilter('f', 'SCORE', 2, '3.14D')]));
    expect(visual.filterConfig!.filters[0].status).toBe('comparison');
    const result = buildDax(visual, []);
    expect(result.filtersIncomplete).toBe(false);
    expect(result.dax).toContain("KEEPFILTERS(FILTER(ALL('SALES'[SCORE]), 'SALES'[SCORE] >= 3.14))");
  });

  it('LessThan (kind=3) -> FILTER(ALL(...), col < val)', () => {
    const visual = readVisual('c4c', 'v1', chartVisual([comparisonFilter('f', 'AMOUNT', 3, '999L')]));
    expect(visual.filterConfig!.filters[0].status).toBe('comparison');
    const result = buildDax(visual, []);
    expect(result.dax).toContain("'SALES'[AMOUNT] < 999");
  });

  it('LessThanOrEqual (kind=4) -> FILTER(ALL(...), col <= val)', () => {
    const visual = readVisual('c4d', 'v1', chartVisual([comparisonFilter('f', 'AMOUNT', 4, '50L')]));
    expect(visual.filterConfig!.filters[0].status).toBe('comparison');
    const result = buildDax(visual, []);
    expect(result.dax).toContain("'SALES'[AMOUNT] <= 50");
  });

  it('Equal (kind=0) string value -> FILTER(ALL(...), col = "val")', () => {
    const visual = readVisual('c4e', 'v1', chartVisual([comparisonFilter('f', 'REGION', 0, "'NORTH'")]));
    expect(visual.filterConfig!.filters[0].status).toBe('comparison');
    const result = buildDax(visual, []);
    expect(result.filtersIncomplete).toBe(false);
    expect(result.dax).toContain(`KEEPFILTERS(FILTER(ALL('SALES'[REGION]), 'SALES'[REGION] = "NORTH"))`);
  });

  it('datetime midnight -> DATE(yyyy,mm,dd)', () => {
    const visual = readVisual('c4f', 'v1', chartVisual([comparisonFilter('f', 'ORDERDATE', 2, "datetime'2024-01-15'")]));
    expect(visual.filterConfig!.filters[0].status).toBe('comparison');
    const result = buildDax(visual, []);
    expect(result.filtersIncomplete).toBe(false);
    expect(result.dax).toContain("'SALES'[ORDERDATE] >= DATE(2024,01,15)");
  });

  it('datetime with non-midnight time -> omitted and flagged', () => {
    const visual = readVisual('c4g', 'v1', chartVisual([comparisonFilter('f', 'ORDERDATE', 2, "datetime'2024-01-15T13:30:00'")]));
    expect(visual.filterConfig!.filters[0].status).toBe('unparseable');
    const diags: import('./reader').Diagnostic[] = [];
    const result = buildDax(visual, diags);
    expect(result.filtersIncomplete).toBe(true);
    expect(result.dax).not.toContain('KEEPFILTERS');
    expect(result.dax).not.toContain('13:30');
    expect(diags.some((d) => d.code === 'FILTER_OMITTED')).toBe(true);
  });

  it('Comparison with unrecognised ComparisonKind -> omitted and flagged', () => {
    const visual = readVisual('c4h', 'v1', chartVisual([comparisonFilter('f', 'AMOUNT', 99, '100L')]));
    expect(visual.filterConfig!.filters[0].status).toBe('unparseable');
    const diags: import('./reader').Diagnostic[] = [];
    const result = buildDax(visual, diags);
    expect(result.filtersIncomplete).toBe(true);
    expect(result.dax).not.toContain('KEEPFILTERS');
    expect(result.dax).not.toContain('100');
    expect(diags.some((d) => d.code === 'FILTER_OMITTED')).toBe(true);
  });
});

describe('C5 — Between filter shape translates to dual-predicate FILTER', () => {
  function betweenFilter(name: string, col: string, lo: string, hi: string) {
    return {
      name,
      field: colField('SALES', col),
      type: 'Categorical',
      filter: {
        Where: [
          {
            Condition: {
              Between: {
                Expression: srcCol('q', col),
                Lower: { Literal: { Value: lo } },
                Upper: { Literal: { Value: hi } },
              },
            },
          },
        ],
      },
    };
  }

  it('integer range -> KEEPFILTERS(FILTER(ALL(col), col >= lo && col <= hi))', () => {
    const visual = readVisual('c5a', 'v1', chartVisual([betweenFilter('f', 'AMOUNT', '100L', '500L')]));
    expect(visual.filterConfig!.filters[0].status).toBe('between');
    const result = buildDax(visual, []);
    expect(result.filtersIncomplete).toBe(false);
    expect(result.dax).toContain("KEEPFILTERS(FILTER(ALL('SALES'[AMOUNT]), 'SALES'[AMOUNT] >= 100 && 'SALES'[AMOUNT] <= 500))");
    expect(result.dax).not.toContain('[object Object]');
  });

  it('string range -> KEEPFILTERS(FILTER(ALL(col), col >= "lo" && col <= "hi"))', () => {
    const visual = readVisual('c5b', 'v1', chartVisual([betweenFilter('f', 'REGION', "'ALPHA'", "'ZULU'")]));
    expect(visual.filterConfig!.filters[0].status).toBe('between');
    const result = buildDax(visual, []);
    expect(result.filtersIncomplete).toBe(false);
    expect(result.dax).toContain(`'SALES'[REGION] >= "ALPHA" && 'SALES'[REGION] <= "ZULU"`);
  });

  it('datetime midnight bounds -> DATE()', () => {
    const visual = readVisual('c5c', 'v1', chartVisual([betweenFilter('f', 'ORDERDATE', "datetime'2023-01-01'", "datetime'2023-12-31'")]));
    expect(visual.filterConfig!.filters[0].status).toBe('between');
    const result = buildDax(visual, []);
    expect(result.filtersIncomplete).toBe(false);
    expect(result.dax).toContain("DATE(2023,01,01)");
    expect(result.dax).toContain("DATE(2023,12,31)");
  });

  it('Between with non-literal bound -> omitted and flagged, no value leakage', () => {
    const filter = {
      name: 'badbet',
      field: colField('SALES', 'AMOUNT'),
      type: 'Categorical',
      filter: {
        Where: [
          {
            Condition: {
              Between: {
                Expression: srcCol('q', 'AMOUNT'),
                Lower: { Literal: { Value: "datetime'2024-01-15T09:00:00'" } },
                Upper: { Literal: { Value: '500L' } },
              },
            },
          },
        ],
      },
    };
    const visual = readVisual('c5d', 'v1', chartVisual([filter]));
    expect(visual.filterConfig!.filters[0].status).toBe('unparseable');
    const diags: import('./reader').Diagnostic[] = [];
    const result = buildDax(visual, diags);
    expect(result.filtersIncomplete).toBe(true);
    expect(result.dax).not.toContain('KEEPFILTERS');
    expect(result.dax).not.toContain('09:00');
    expect(diags.some((d) => d.code === 'FILTER_OMITTED')).toBe(true);
  });
});

describe('C6 — And/Or composition of leaf shapes', () => {
  function andFilter(name: string, col: string, lo: string, hi: string) {
    return {
      name,
      field: colField('SALES', col),
      type: 'Categorical',
      filter: {
        Where: [
          {
            Condition: {
              And: {
                Left: {
                  Comparison: {
                    ComparisonKind: 2,
                    Left: srcCol('q', col),
                    Right: { Literal: { Value: lo } },
                  },
                },
                Right: {
                  Comparison: {
                    ComparisonKind: 4,
                    Left: srcCol('q', col),
                    Right: { Literal: { Value: hi } },
                  },
                },
              },
            },
          },
        ],
      },
    };
  }

  it('And of two Comparisons on same column -> (col >= lo) && (col <= hi)', () => {
    const visual = readVisual('c6a', 'v1', chartVisual([andFilter('f', 'AMOUNT', '10L', '90L')]));
    expect(visual.filterConfig!.filters[0].status).toBe('and-or');
    const result = buildDax(visual, []);
    expect(result.filtersIncomplete).toBe(false);
    expect(result.dax).toContain("KEEPFILTERS(FILTER(ALL('SALES'[AMOUNT]), ('SALES'[AMOUNT] >= 10) && ('SALES'[AMOUNT] <= 90)))");
    expect(result.dax).not.toContain('[object Object]');
  });

  it('Or of two Comparisons on same column -> (col < lo) || (col > hi)', () => {
    const filter = {
      name: 'orf',
      field: colField('SALES', 'SCORE'),
      type: 'Categorical',
      filter: {
        Where: [
          {
            Condition: {
              Or: {
                Left: {
                  Comparison: {
                    ComparisonKind: 3,
                    Left: srcCol('q', 'SCORE'),
                    Right: { Literal: { Value: '10L' } },
                  },
                },
                Right: {
                  Comparison: {
                    ComparisonKind: 1,
                    Left: srcCol('q', 'SCORE'),
                    Right: { Literal: { Value: '90L' } },
                  },
                },
              },
            },
          },
        ],
      },
    };
    const visual = readVisual('c6b', 'v1', chartVisual([filter]));
    expect(visual.filterConfig!.filters[0].status).toBe('and-or');
    const result = buildDax(visual, []);
    expect(result.filtersIncomplete).toBe(false);
    expect(result.dax).toContain("KEEPFILTERS(FILTER(ALL('SALES'[SCORE]), ('SALES'[SCORE] < 10) || ('SALES'[SCORE] > 90)))");
  });

  it('And on DIFFERENT columns -> omitted and flagged (cross-column guard)', () => {
    const filter = {
      name: 'crosscol',
      field: colField('SALES', 'AMOUNT'),
      type: 'Categorical',
      filter: {
        Where: [
          {
            Condition: {
              And: {
                Left: {
                  Comparison: {
                    ComparisonKind: 2,
                    Left: srcCol('q', 'AMOUNT'),
                    Right: { Literal: { Value: '10L' } },
                  },
                },
                Right: {
                  Comparison: {
                    ComparisonKind: 4,
                    Left: srcCol('q', 'REGION'),
                    Right: { Literal: { Value: '90L' } },
                  },
                },
              },
            },
          },
        ],
      },
    };
    const visual = readVisual('c6c', 'v1', chartVisual([filter]));
    expect(visual.filterConfig!.filters[0].status).toBe('unparseable');
    expect(visual.filterConfig!.filters[0].reason).toContain('cross-column');
    const diags: import('./reader').Diagnostic[] = [];
    const result = buildDax(visual, diags);
    expect(result.filtersIncomplete).toBe(true);
    expect(result.dax).not.toContain('KEEPFILTERS');
    expect(result.dax).not.toContain('10');
    expect(result.dax).not.toContain('90');
    expect(diags.some((d) => d.code === 'FILTER_OMITTED')).toBe(true);
  });

  it('And/Or depth > 3 -> omitted and flagged', () => {
    const filter = {
      name: 'deep',
      field: colField('SALES', 'AMOUNT'),
      type: 'Categorical',
      filter: {
        Where: [
          {
            Condition: {
              And: {
                Left: {
                  And: {
                    Left: {
                      And: {
                        Left: {
                          Comparison: { ComparisonKind: 2, Left: srcCol('q', 'AMOUNT'), Right: { Literal: { Value: '1L' } } },
                        },
                        Right: {
                          Comparison: { ComparisonKind: 4, Left: srcCol('q', 'AMOUNT'), Right: { Literal: { Value: '2L' } } },
                        },
                      },
                    },
                    Right: {
                      Comparison: { ComparisonKind: 4, Left: srcCol('q', 'AMOUNT'), Right: { Literal: { Value: '3L' } } },
                    },
                  },
                },
                Right: {
                  Comparison: { ComparisonKind: 4, Left: srcCol('q', 'AMOUNT'), Right: { Literal: { Value: '4L' } } },
                },
              },
            },
          },
        ],
      },
    };
    const visual = readVisual('c6d', 'v1', chartVisual([filter]));
    expect(visual.filterConfig!.filters[0].status).toBe('unparseable');
    const diags: import('./reader').Diagnostic[] = [];
    const result = buildDax(visual, diags);
    expect(result.filtersIncomplete).toBe(true);
    expect(result.dax).not.toContain('KEEPFILTERS');
    expect(diags.some((d) => d.code === 'FILTER_OMITTED')).toBe(true);
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
