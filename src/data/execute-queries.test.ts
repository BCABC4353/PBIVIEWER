import { describe, expect, it } from 'vitest';
import {
  buildExecuteQueriesBody,
  parseExecuteQueriesResponse,
} from './execute-queries';

describe('buildExecuteQueriesBody', () => {
  it('wraps the dax in the required envelope', () => {
    const body = buildExecuteQueriesBody('EVALUATE SUMMARIZECOLUMNS()');
    expect(body).toEqual({
      queries: [{ query: 'EVALUATE SUMMARIZECOLUMNS()' }],
      serializerSettings: { includeNulls: true },
    });
  });

  it('preserves multi-line dax verbatim', () => {
    const dax = 'EVALUATE\nSUMMARIZECOLUMNS(\n  T[A]\n)';
    const body = buildExecuteQueriesBody(dax);
    expect(body.queries[0]!.query).toBe(dax);
  });
});

describe('parseExecuteQueriesResponse — happy path', () => {
  it('parses a standard two-column table response', () => {
    const r = parseExecuteQueriesResponse({
      results: [
        {
          tables: [
            {
              rows: [
                { "'SALES'[REGION]": 'NORTH', 'Revenue_0': 100 },
                { "'SALES'[REGION]": 'SOUTH', 'Revenue_0': 200 },
              ],
            },
          ],
        },
      ],
    });
    expect(r.columns).toEqual(['REGION', 'Revenue_0']);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]!['REGION']).toBe('NORTH');
    expect(r.rows[1]!['Revenue_0']).toBe(200);
    expect(r.diagnostics).toHaveLength(0);
  });

  it('normalizes T[Col] style keys to the column name', () => {
    const r = parseExecuteQueriesResponse({
      results: [
        {
          tables: [
            {
              rows: [{ 'SALES[MONTH]': 'JAN', '[TotalRev_0]': 50 }],
            },
          ],
        },
      ],
    });
    expect(r.columns).toContain('MONTH');
    expect(r.columns).toContain('TotalRev_0');
    expect(r.rows[0]!['MONTH']).toBe('JAN');
    expect(r.rows[0]!['TotalRev_0']).toBe(50);
  });

  it('preserves null values in rows', () => {
    const r = parseExecuteQueriesResponse({
      results: [
        {
          tables: [
            {
              rows: [
                { 'T[A]': 1, '[B_0]': null },
                { 'T[A]': null, '[B_0]': 2 },
              ],
            },
          ],
        },
      ],
    });
    expect(r.rows[0]!['B_0']).toBeNull();
    expect(r.rows[1]!['A']).toBeNull();
  });

  it('handles an empty rows array gracefully', () => {
    const r = parseExecuteQueriesResponse({
      results: [{ tables: [{ rows: [] }] }],
    });
    expect(r.columns).toEqual([]);
    expect(r.rows).toEqual([]);
    expect(r.diagnostics).toHaveLength(0);
  });

  it('deduplicates column names across rows', () => {
    const r = parseExecuteQueriesResponse({
      results: [
        {
          tables: [
            {
              rows: [
                { 'T[X]': 1, '[Y_0]': 10 },
                { 'T[X]': 2, '[Y_0]': 20 },
              ],
            },
          ],
        },
      ],
    });
    expect(r.columns).toEqual(['X', 'Y_0']);
  });
});

describe('parseExecuteQueriesResponse — malformed inputs', () => {
  it('returns empty result for null', () => {
    const r = parseExecuteQueriesResponse(null);
    expect(r.columns).toEqual([]);
    expect(r.rows).toEqual([]);
    expect(r.diagnostics.length).toBeGreaterThan(0);
  });

  it('returns empty result for undefined', () => {
    const r = parseExecuteQueriesResponse(undefined);
    expect(r.columns).toEqual([]);
    expect(r.rows).toEqual([]);
    expect(r.diagnostics.length).toBeGreaterThan(0);
  });

  it('returns empty result for a plain string', () => {
    const r = parseExecuteQueriesResponse('garbage');
    expect(r.columns).toEqual([]);
    expect(r.rows).toEqual([]);
    expect(r.diagnostics.length).toBeGreaterThan(0);
  });

  it('returns empty result for an array', () => {
    const r = parseExecuteQueriesResponse([1, 2, 3]);
    expect(r.columns).toEqual([]);
    expect(r.rows).toEqual([]);
    expect(r.diagnostics.length).toBeGreaterThan(0);
  });

  it('returns empty result for empty object', () => {
    const r = parseExecuteQueriesResponse({});
    expect(r.columns).toEqual([]);
    expect(r.rows).toEqual([]);
    expect(r.diagnostics.length).toBeGreaterThan(0);
  });

  it('returns empty result when results array is empty', () => {
    const r = parseExecuteQueriesResponse({ results: [] });
    expect(r.columns).toEqual([]);
    expect(r.rows).toEqual([]);
    expect(r.diagnostics.length).toBeGreaterThan(0);
  });

  it('returns empty result when tables array is empty', () => {
    const r = parseExecuteQueriesResponse({ results: [{ tables: [] }] });
    expect(r.columns).toEqual([]);
    expect(r.rows).toEqual([]);
    expect(r.diagnostics.length).toBeGreaterThan(0);
  });

  it('returns empty result when results[0] is not an object', () => {
    const r = parseExecuteQueriesResponse({ results: ['nope'] });
    expect(r.columns).toEqual([]);
    expect(r.rows).toEqual([]);
    expect(r.diagnostics.length).toBeGreaterThan(0);
  });

  it('returns empty result when tables field is absent', () => {
    const r = parseExecuteQueriesResponse({ results: [{}] });
    expect(r.columns).toEqual([]);
    expect(r.rows).toEqual([]);
    expect(r.diagnostics.length).toBeGreaterThan(0);
  });

  it('tolerates non-object rows mixed in', () => {
    const r = parseExecuteQueriesResponse({
      results: [
        {
          tables: [
            {
              rows: [{ '[A_0]': 1 }, 'junk', null, [1, 2]],
            },
          ],
        },
      ],
    });
    expect(r.columns).toEqual(['A_0']);
    expect(r.rows).toHaveLength(4);
    expect(r.rows[0]!['A_0']).toBe(1);
    expect(r.rows[1]).toEqual({});
    expect(r.rows[2]).toEqual({});
    expect(r.rows[3]).toEqual({});
    expect(r.diagnostics.length).toBeGreaterThan(0);
  });

  it('never throws regardless of input shape', () => {
    const inputs = [
      42,
      true,
      { results: null },
      { results: [{ tables: null }] },
      { results: [{ tables: [null] }] },
      { results: [{ tables: [{ rows: null }] }] },
    ];
    for (const input of inputs) {
      expect(() => parseExecuteQueriesResponse(input)).not.toThrow();
    }
  });
});
