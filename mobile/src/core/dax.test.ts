import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  executeDax,
  formatValue,
  parseExecuteQueriesResponse,
  shapeForVisual,
  stripColumnName,
  type QueryResult,
  type VisualSpec,
} from './dax';

const result = (columns: string[], rows: Array<Record<string, unknown>>): QueryResult => ({
  columns,
  rows,
});

describe('stripColumnName', () => {
  it("strips 'Table[Col]' to 'Col'", () => {
    expect(stripColumnName('Sales[Month]')).toBe('Month');
    expect(stripColumnName("'Date Table'[Fiscal Year]")).toBe('Fiscal Year');
  });
  it("strips bare measure brackets '[Total]' to 'Total'", () => {
    expect(stripColumnName('[Total Revenue]')).toBe('Total Revenue');
  });
  it('passes plain names through untouched', () => {
    expect(stripColumnName('Month')).toBe('Month');
    expect(stripColumnName('')).toBe('');
  });
});

describe('parseExecuteQueriesResponse', () => {
  it('parses rows and strips column names', () => {
    const r = parseExecuteQueriesResponse({
      results: [
        {
          tables: [
            {
              rows: [
                { 'Sales[Month]': 'Jan', '[Revenue]': 100 },
                { 'Sales[Month]': 'Feb', '[Revenue]': null },
              ],
            },
          ],
        },
      ],
    });
    expect(r.columns).toEqual(['Month', 'Revenue']);
    expect(r.rows).toEqual([
      { Month: 'Jan', Revenue: 100 },
      { Month: 'Feb', Revenue: null },
    ]);
  });

  it('tolerates malformed payloads without throwing', () => {
    const empty = { columns: [], rows: [] };
    expect(parseExecuteQueriesResponse(undefined)).toEqual(empty);
    expect(parseExecuteQueriesResponse(null)).toEqual(empty);
    expect(parseExecuteQueriesResponse('garbage')).toEqual(empty);
    expect(parseExecuteQueriesResponse({})).toEqual(empty);
    expect(parseExecuteQueriesResponse({ results: [] })).toEqual(empty);
    expect(parseExecuteQueriesResponse({ results: [{ tables: [] }] })).toEqual(empty);
    expect(parseExecuteQueriesResponse({ results: [{ tables: [{ rows: 'nope' }] }] })).toEqual(empty);
  });

  it('tolerates non-object rows mixed into the table', () => {
    const r = parseExecuteQueriesResponse({
      results: [{ tables: [{ rows: [{ '[A]': 1 }, 'junk', null, [1, 2]] }] }],
    });
    expect(r.columns).toEqual(['A']);
    expect(r.rows).toEqual([{ A: 1 }, {}, {}, {}]);
  });
});

describe('executeDax', () => {
  afterEach(() => vi.unstubAllGlobals());

  const tokens = { getAccessToken: async () => 'tok-123' };

  it('POSTs the query with auth and parses the response', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        results: [{ tables: [{ rows: [{ 'T[X]': 7 }] }] }],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const r = await executeDax(tokens, 'ds-9', 'EVALUATE ROW("X", 7)');
    expect(r).toEqual({ columns: ['X'], rows: [{ X: 7 }] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.powerbi.com/v1.0/myorg/datasets/ds-9/executeQueries');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
    expect(JSON.parse(init.body as string)).toEqual({
      queries: [{ query: 'EVALUATE ROW("X", 7)' }],
      serializerSettings: { includeNulls: true },
    });
  });

  it('throws a readable error on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })));
    await expect(executeDax(tokens, 'ds-9', 'EVALUATE X')).rejects.toThrow(/403.*ds-9/);
  });

  it('surfaces the EXACT API error code and message when the body carries one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({
          error: { code: 'PowerBINotAuthorizedException', message: 'Build permission required' },
        }),
      })),
    );
    await expect(executeDax(tokens, 'ds-9', 'EVALUATE X')).rejects.toThrow(
      /PowerBINotAuthorizedException: Build permission required/,
    );
  });

  it('still throws cleanly when the error body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('not json');
        },
      })),
    );
    await expect(executeDax(tokens, 'ds-9', 'EVALUATE X')).rejects.toThrow(/HTTP 500.*ds-9/);
  });
});

describe('shapeForVisual', () => {
  const spec = (over: Partial<VisualSpec>): VisualSpec => ({
    kind: 'kpi',
    title: 'T',
    dax: 'EVALUATE X',
    ...over,
  });

  it('kpi: picks the named value field from the first row', () => {
    const s = shapeForVisual(
      spec({ kind: 'kpi', title: 'Revenue', valueField: 'Revenue' }),
      result(['Revenue'], [{ Revenue: 1234 }]),
    );
    expect(s).toEqual({ kind: 'kpi', data: { value: 1234, label: 'Revenue' } });
  });

  it('kpi: auto-picks the first numeric column when no valueField given', () => {
    const s = shapeForVisual(
      spec({ kind: 'kpi', title: 'K' }),
      result(['Name', 'Count'], [{ Name: 'x', Count: 9 }]),
    );
    expect(s.kind === 'kpi' && s.data.value).toBe(9);
  });

  it('kpi: missing field or empty rows → null value, never a throw', () => {
    expect(
      shapeForVisual(spec({ kind: 'kpi', valueField: 'Nope' }), result(['A'], [{ A: 1 }])),
    ).toEqual({ kind: 'kpi', data: { value: null, label: 'T' } });
    expect(shapeForVisual(spec({ kind: 'kpi' }), result([], []))).toEqual({
      kind: 'kpi',
      data: { value: null, label: 'T' },
    });
  });

  it('bar/line: shapes label/value points and skips non-numeric rows', () => {
    const r = result(
      ['Month', 'Revenue'],
      [
        { Month: 'Jan', Revenue: 10 },
        { Month: 'Feb', Revenue: null },
        { Month: 'Mar', Revenue: '30' },
      ],
    );
    const bar = shapeForVisual(spec({ kind: 'bar', labelField: 'Month', valueField: 'Revenue' }), r);
    expect(bar).toEqual({
      kind: 'bar',
      data: {
        points: [
          { label: 'Jan', value: 10 },
          { label: 'Mar', value: 30 },
        ],
      },
    });
    const line = shapeForVisual(spec({ kind: 'line' }), r); // auto field resolution
    expect(line.kind === 'line' && line.data.points.map((p) => p.value)).toEqual([10, 30]);
  });

  it('bar: a valueField that does not exist → empty points', () => {
    const s = shapeForVisual(
      spec({ kind: 'bar', valueField: 'Ghost' }),
      result(['A'], [{ A: 1 }]),
    );
    expect(s).toEqual({ kind: 'bar', data: { points: [] } });
  });

  it('donut: keeps only positive slices', () => {
    const s = shapeForVisual(
      spec({ kind: 'donut', labelField: 'Ch', valueField: 'V' }),
      result(
        ['Ch', 'V'],
        [
          { Ch: 'Online', V: 60 },
          { Ch: 'Refunds', V: -5 },
          { Ch: 'Retail', V: 0 },
          { Ch: 'Partner', V: 40 },
        ],
      ),
    );
    expect(s).toEqual({
      kind: 'donut',
      data: {
        slices: [
          { label: 'Online', value: 60 },
          { label: 'Partner', value: 40 },
        ],
      },
    });
  });

  it('table: passes columns and rows through', () => {
    const r = result(['A', 'B'], [{ A: 1, B: 'x' }]);
    expect(shapeForVisual(spec({ kind: 'table' }), r)).toEqual({
      kind: 'table',
      data: { columns: ['A', 'B'], rows: [{ A: 1, B: 'x' }] },
    });
  });
});

describe('formatValue', () => {
  it('compacts plain numbers', () => {
    expect(formatValue(0)).toBe('0');
    expect(formatValue(7)).toBe('7');
    expect(formatValue(45.34)).toBe('45.3');
    expect(formatValue(999)).toBe('999');
    expect(formatValue(1234)).toBe('1.2K');
    expect(formatValue(1_200_000)).toBe('1.2M');
    expect(formatValue(2_000_000_000)).toBe('2B');
    expect(formatValue(3_400_000_000_000)).toBe('3.4T');
    expect(formatValue(-1234)).toBe('-1.2K');
  });

  it('formats currency with the sign outside the symbol', () => {
    expect(formatValue(1_200_000, 'currency')).toBe('$1.2M');
    expect(formatValue(950, 'currency')).toBe('$950');
    expect(formatValue(-1_200_000, 'currency')).toBe('-$1.2M');
  });

  it('formats percent from a ratio', () => {
    expect(formatValue(0.453, 'percent')).toBe('45.3%');
    expect(formatValue(1, 'percent')).toBe('100%');
    expect(formatValue(-0.062, 'percent')).toBe('-6.2%');
  });

  it('renders missing / non-finite values as an em dash', () => {
    expect(formatValue(null)).toBe('—');
    expect(formatValue(undefined)).toBe('—');
    expect(formatValue(Number.NaN)).toBe('—');
    expect(formatValue(Number.POSITIVE_INFINITY)).toBe('—');
  });
});
