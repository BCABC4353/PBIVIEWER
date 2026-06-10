import { describe, expect, it } from 'vitest';
import {
  CanvasDerivationError,
  columnRef,
  daxStringLiteral,
  deriveCanvasSpec,
  deriveFromStatistics,
  discoverModel,
  escapeBracketName,
  escapeTableName,
  guessFormat,
  measureRef,
  type DaxRunner,
} from './canvas-crosswalk';
import type { QueryResult } from './dax';

const r = (columns: string[], rows: Array<Record<string, unknown>>): QueryResult => ({
  columns,
  rows,
});

// ---------------------------------------------------------------------------
// DAX identifier escaping — nothing reaches a query string unsanitized.
// ---------------------------------------------------------------------------

describe('DAX escaping', () => {
  it('quotes table names and doubles embedded single quotes', () => {
    expect(escapeTableName('Sales')).toBe("'Sales'");
    expect(escapeTableName("Bob's Data")).toBe("'Bob''s Data'");
  });

  it('brackets column/measure names and doubles closing brackets', () => {
    expect(escapeBracketName('Amount')).toBe('[Amount]');
    expect(escapeBracketName('Weird]Name')).toBe('[Weird]]Name]');
    expect(measureRef('Total [net]')).toBe('[Total [net]]]');
  });

  it('builds fully-escaped column references', () => {
    expect(columnRef("Bob's Data", 'Weird]Name')).toBe("'Bob''s Data'[Weird]]Name]");
  });

  it('doubles quotes inside string literals', () => {
    expect(daxStringLiteral('plain')).toBe('"plain"');
    expect(daxStringLiteral('say "hi"')).toBe('"say ""hi"""');
  });
});

describe('guessFormat', () => {
  it('reads percent and currency from the format string first', () => {
    expect(guessFormat('Whatever', '0.0%')).toBe('percent');
    expect(guessFormat('Whatever', '$#,0')).toBe('currency');
    expect(guessFormat('Whatever', '#,0')).toBe('number');
  });
  it('falls back to name hints', () => {
    expect(guessFormat('Gross Margin', '')).toBe('percent');
    expect(guessFormat('Total Revenue', '')).toBe('currency');
    expect(guessFormat('Order Count', '')).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Spec derivation from fake INFO payloads.
// ---------------------------------------------------------------------------

const INFO_TABLES = r(
  ['ID', 'Name', 'IsHidden'],
  [
    { ID: 1, Name: 'Sales', IsHidden: false },
    { ID: 2, Name: 'Calendar', IsHidden: false },
    { ID: 3, Name: 'LocalDateTable_abc', IsHidden: true },
    { ID: 4, Name: 'Secrets', IsHidden: true },
  ],
);

const INFO_COLUMNS = r(
  ['TableID', 'ExplicitName', 'ExplicitDataType', 'IsHidden'],
  [
    { TableID: 1, ExplicitName: 'RowNumber-2662979B', ExplicitDataType: 6, IsHidden: true },
    { TableID: 1, ExplicitName: 'Region', ExplicitDataType: 2, IsHidden: false },
    { TableID: 1, ExplicitName: 'Product', ExplicitDataType: 2, IsHidden: false },
    { TableID: 1, ExplicitName: 'OrderKey', ExplicitDataType: 2, IsHidden: false },
    { TableID: 1, ExplicitName: 'Amount', ExplicitDataType: 8, IsHidden: false },
    { TableID: 1, ExplicitName: 'Hidden Col', ExplicitDataType: 2, IsHidden: true },
    { TableID: 2, ExplicitName: 'Date', ExplicitDataType: 9, IsHidden: false },
    { TableID: 3, ExplicitName: 'Date', ExplicitDataType: 9, IsHidden: false },
    { TableID: 4, ExplicitName: 'Token', ExplicitDataType: 2, IsHidden: false },
  ],
);

const INFO_MEASURES = r(
  ['ID', 'Name', 'FormatString', 'IsHidden'],
  [
    { ID: 11, Name: 'Total Revenue', FormatString: '$#,0', IsHidden: false },
    { ID: 12, Name: 'Margin %', FormatString: '0.0%', IsHidden: false },
    { ID: 13, Name: 'Internal Helper', FormatString: '', IsHidden: true },
    { ID: 9, Name: 'Order Count', FormatString: '', IsHidden: false },
  ],
);

/** Fake dataset that answers INFO queries and the cardinality probe. */
const infoRunner =
  (regionCardinality: number, opts: { failProbe?: boolean } = {}): DaxRunner =>
  async (dax) => {
    if (dax.includes('INFO.TABLES')) return INFO_TABLES;
    if (dax.includes('INFO.COLUMNS')) return INFO_COLUMNS;
    if (dax.includes('INFO.MEASURES')) return INFO_MEASURES;
    if (dax.includes('DISTINCTCOUNT')) {
      if (opts.failProbe) throw new Error('probe refused');
      // Candidates in model order: Region (c0), Product (c1).
      return r(['c0', 'c1'], [{ c0: regionCardinality, c1: 50 }]);
    }
    throw new Error(`unexpected query: ${dax}`);
  };

describe('deriveCanvasSpec — INFO rung', () => {
  it('derives KPIs, line, donut and table deterministically from the model', async () => {
    const spec = await deriveCanvasSpec(infoRunner(4), 'Exec Pulse');
    expect(spec.title).toBe('Exec Pulse');
    expect(spec.visuals.length).toBeLessThanOrEqual(8);

    // Visible measures in model (ID) order → KPI tiles with guessed formats.
    const kpis = spec.visuals.filter((v) => v.kind === 'kpi');
    expect(kpis.map((k) => k.title)).toEqual(['Order Count', 'Total Revenue', 'Margin %']);
    expect(kpis.map((k) => k.format)).toEqual(['number', 'currency', 'percent']);
    expect(kpis[0]!.dax).toBe('EVALUATE ROW("Value", [Order Count])');

    // First date-typed column (visible tables only) + primary measure → line.
    const line = spec.visuals.find((v) => v.kind === 'line');
    expect(line?.title).toBe('Order Count by Date');
    expect(line?.dax).toContain("'Calendar'[Date]");
    expect(line?.dax).toContain('[Order Count]');

    // Region has 4 categories → donut (≤6). Key-shaped OrderKey never charted.
    const donut = spec.visuals.find((v) => v.kind === 'donut');
    expect(donut?.title).toBe('Order Count by Region');
    expect(donut?.dax).toContain("'Sales'[Region]");
    // Key-shaped columns are never charted as categories (tables may show them).
    expect(donut?.dax).not.toContain('OrderKey');
    expect(spec.visuals.filter((v) => v.kind === 'bar' || v.kind === 'donut')
      .every((v) => !v.dax.includes('OrderKey'))).toBe(true);

    // Widest visible table → top rows; hidden tables/columns never leak.
    const table = spec.visuals.find((v) => v.kind === 'table');
    expect(table?.title).toBe('Sales — top rows');
    expect(table?.dax).toContain("TOPN(10, SELECTCOLUMNS('Sales'");
    const all = spec.visuals.map((v) => v.dax).join('\n');
    expect(all).not.toContain('Secrets');
    expect(all).not.toContain('LocalDateTable');
    expect(all).not.toContain('Hidden Col');
  });

  it('uses a bar instead of a donut when the category has more than 6 values', async () => {
    const spec = await deriveCanvasSpec(infoRunner(12), 'R');
    expect(spec.visuals.some((v) => v.kind === 'donut')).toBe(false);
    const bar = spec.visuals.find((v) => v.kind === 'bar');
    expect(bar?.dax).toContain('TOPN(8,');
  });

  it('degrades to a TOPN bar when the cardinality probe fails', async () => {
    const spec = await deriveCanvasSpec(infoRunner(4, { failProbe: true }), 'R');
    expect(spec.visuals.some((v) => v.kind === 'donut')).toBe(false);
    expect(spec.visuals.find((v) => v.kind === 'bar')?.dax).toContain("'Sales'[Region]");
  });

  it('escapes hostile identifiers everywhere they appear in queries', async () => {
    const run: DaxRunner = async (dax) => {
      if (dax.includes('INFO.TABLES')) {
        return r(['ID', 'Name', 'IsHidden'], [{ ID: 1, Name: "Bob's Data", IsHidden: false }]);
      }
      if (dax.includes('INFO.COLUMNS')) {
        return r(
          ['TableID', 'ExplicitName', 'ExplicitDataType', 'IsHidden'],
          [
            { TableID: 1, ExplicitName: 'Weird]Name', ExplicitDataType: 2, IsHidden: false },
            { TableID: 1, ExplicitName: 'When', ExplicitDataType: 9, IsHidden: false },
          ],
        );
      }
      if (dax.includes('INFO.MEASURES')) {
        return r(
          ['ID', 'Name', 'FormatString', 'IsHidden'],
          [{ ID: 1, Name: 'Total [net]', FormatString: '', IsHidden: false }],
        );
      }
      if (dax.includes('DISTINCTCOUNT')) return r(['c0'], [{ c0: 3 }]);
      throw new Error(`unexpected query: ${dax}`);
    };
    const spec = await deriveCanvasSpec(run, 'R');
    const all = spec.visuals.map((v) => v.dax).join('\n');
    expect(all).toContain("'Bob''s Data'[Weird]]Name]");
    expect(all).toContain('[Total [net]]]');
    // The raw, unescaped forms must never appear.
    expect(all).not.toMatch(/[^']'Bob's Data'/);
  });
});

describe('discoverModel', () => {
  it('throws when any INFO query fails (so the ladder can move on)', async () => {
    const run: DaxRunner = async (dax) => {
      if (dax.includes('INFO.MEASURES')) throw new Error('INFO not supported');
      return INFO_TABLES;
    };
    await expect(discoverModel(run)).rejects.toThrow('INFO not supported');
  });
});

// ---------------------------------------------------------------------------
// Fallback ladder
// ---------------------------------------------------------------------------

const STATS = r(
  ['Table Name', 'Column Name', 'Min', 'Max', 'Cardinality', 'Max Length'],
  [
    { 'Table Name': 'Orders', 'Column Name': 'RowNumber-1', Min: 1, Max: 100, Cardinality: 100, 'Max Length': 0 },
    { 'Table Name': 'Orders', 'Column Name': 'Status', Min: 'Cancelled', Max: 'Shipped', Cardinality: 4, 'Max Length': 9 },
    { 'Table Name': 'Orders', 'Column Name': 'Total', Min: 5, Max: 9000, Cardinality: 800, 'Max Length': 0 },
    { 'Table Name': 'Orders', 'Column Name': 'OrderDate', Min: '2024-01-02T00:00:00', Max: '2025-06-01T00:00:00', Cardinality: 400, 'Max Length': 0 },
  ],
);

describe('deriveCanvasSpec — fallback ladder', () => {
  it('falls back to COLUMNSTATISTICS when INFO functions fail', async () => {
    const run: DaxRunner = async (dax) => {
      if (dax.includes('INFO.')) throw new Error('INFO not available on this engine');
      if (dax.includes('COLUMNSTATISTICS')) return STATS;
      throw new Error(`unexpected query: ${dax}`);
    };
    const spec = await deriveCanvasSpec(run, 'Legacy');
    const kinds = spec.visuals.map((v) => v.kind);
    expect(kinds).toContain('kpi');
    expect(kinds).toContain('line');
    expect(kinds).toContain('donut'); // Status has 4 categories
    expect(kinds).toContain('table');
    expect(spec.visuals.find((v) => v.kind === 'line')?.dax).toContain("'Orders'[OrderDate]");
  });

  it('throws CanvasDerivationError carrying BOTH exact errors when every rung fails', async () => {
    const run: DaxRunner = async (dax) => {
      if (dax.includes('COLUMNSTATISTICS')) {
        throw new Error(
          'Execute Queries failed (HTTP 401) on dataset ds-1 — PowerBINotAuthorizedException: missing Build',
        );
      }
      throw new Error('Execute Queries failed (HTTP 401) on dataset ds-1 — INFO refused');
    };
    const err = await deriveCanvasSpec(run, 'R').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CanvasDerivationError);
    const e = err as CanvasDerivationError;
    expect(e.apiError).toContain('INFO refused');
    expect(e.apiError).toContain('PowerBINotAuthorizedException: missing Build');
  });

  it('is honest when the model is reachable but has nothing chartable', async () => {
    const run: DaxRunner = async (dax) => {
      if (dax.includes('COLUMNSTATISTICS')) return r([], []);
      return r([], []); // INFO answers, but empty
    };
    await expect(deriveCanvasSpec(run, 'R')).rejects.toThrow(/nothing the app can chart/);
  });
});

// ---------------------------------------------------------------------------
// Hard timeouts + step reporting — the ladder must ALWAYS settle, loudly.
// ---------------------------------------------------------------------------

describe('deriveCanvasSpec — hard timeouts', () => {
  const hangForever: DaxRunner = () => new Promise<never>(() => {});

  it('times out a hung rung and lands on a loud CanvasDerivationError', async () => {
    const err = await deriveCanvasSpec(hangForever, 'R', {
      rungTimeoutMs: 20,
      totalTimeoutMs: 100,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CanvasDerivationError);
    const e = err as CanvasDerivationError;
    expect(e.apiError).toMatch(/Reading the dataset model .* timed out/);
    expect(e.apiError).toMatch(/COLUMNSTATISTICS: Reading column statistics timed out/);
  });

  it('aborts the in-flight queries of a timed-out rung', async () => {
    const signals: AbortSignal[] = [];
    const run: DaxRunner = (_dax, signal) => {
      if (signal) signals.push(signal);
      return new Promise<never>(() => {});
    };
    await deriveCanvasSpec(run, 'R', { rungTimeoutMs: 15, totalTimeoutMs: 80 }).catch(() => {});
    expect(signals.length).toBeGreaterThan(0); // live runners receive the handle
    expect(signals.every((s) => s.aborted)).toBe(true); // …and it fired
  });

  it('caps the WHOLE walk at totalTimeoutMs even with a generous per-rung cap', async () => {
    const t0 = Date.now();
    await deriveCanvasSpec(hangForever, 'R', {
      rungTimeoutMs: 10_000,
      totalTimeoutMs: 60,
    }).catch(() => {});
    expect(Date.now() - t0).toBeLessThan(2_000); // nowhere near 2×10 s
  });

  it('a hung dataset still resolves the stats rung if it answers in time', async () => {
    const run: DaxRunner = async (dax) => {
      if (dax.includes('COLUMNSTATISTICS')) return STATS;
      return new Promise<never>(() => {}); // INFO hangs
    };
    const spec = await deriveCanvasSpec(run, 'Slow', { rungTimeoutMs: 20, totalTimeoutMs: 500 });
    expect(spec.visuals.length).toBeGreaterThan(0);
  });
});

describe('deriveCanvasSpec — step reporting + defensive INFO parsing', () => {
  it('reports model → visuals on the happy path', async () => {
    const steps: string[] = [];
    await deriveCanvasSpec(infoRunner(4), 'R', { onStep: (s) => steps.push(s) });
    expect(steps).toEqual(['model', 'visuals']);
  });

  it('reports model → stats when INFO is unavailable', async () => {
    const steps: string[] = [];
    const run: DaxRunner = async (dax) => {
      if (dax.includes('COLUMNSTATISTICS')) return STATS;
      throw new Error('INFO not supported');
    };
    await deriveCanvasSpec(run, 'R', { onStep: (s) => steps.push(s) });
    expect(steps).toEqual(['model', 'stats']);
  });

  it('an INFO response with zero rows falls to the stats rung, never a blank canvas', async () => {
    const run: DaxRunner = async (dax) => {
      if (dax.includes('COLUMNSTATISTICS')) return STATS;
      return r([], []); // 200 OK but empty — must NOT count as a usable model
    };
    const spec = await deriveCanvasSpec(run, 'Empty INFO');
    expect(spec.visuals.length).toBeGreaterThan(0);
    expect(spec.visuals[0]!.dax).toContain("'Orders'");
  });

  it('unexpected INFO shapes (rows without the known columns) also fall through', async () => {
    const run: DaxRunner = async (dax) => {
      if (dax.includes('COLUMNSTATISTICS')) return STATS;
      return r(['Bogus'], [{ Bogus: 1 }]); // shape the crosswalk cannot read
    };
    const spec = await deriveCanvasSpec(run, 'Weird INFO');
    expect(spec.visuals.length).toBeGreaterThan(0);
  });
});

describe('deriveFromStatistics', () => {
  it('keys off stats columns tolerantly and skips RowNumber columns', () => {
    const spec = deriveFromStatistics(STATS, 'Legacy');
    expect(spec.title).toBe('Legacy');
    expect(spec.visuals.map((v) => v.dax).join('\n')).not.toContain('RowNumber');
    const kpi = spec.visuals.find((v) => v.kind === 'kpi');
    expect(kpi?.dax).toBe("EVALUATE ROW(\"Value\", COUNTROWS('Orders'))");
  });

  it('returns an empty spec (not a throw) for an unrecognizable payload', () => {
    expect(deriveFromStatistics(r(['Nope'], [{ Nope: 1 }]), 'X').visuals).toEqual([]);
  });
});
