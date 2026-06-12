export interface ExecuteQueriesBody {
  queries: Array<{ query: string }>;
  serializerSettings: { includeNulls: true };
}

export interface ParsedQueryResult {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  diagnostics: string[];
}

export function buildExecuteQueriesBody(dax: string): ExecuteQueriesBody {
  return {
    queries: [{ query: dax }],
    serializerSettings: { includeNulls: true },
  };
}

function normalizeKey(raw: string): string {
  const bracketMatch = /\[([^\]]+)\]\s*$/.exec(raw);
  if (bracketMatch) return bracketMatch[1]!;
  return raw;
}

export function parseExecuteQueriesResponse(json: unknown): ParsedQueryResult {
  const diagnostics: string[] = [];

  if (json === null || json === undefined || typeof json !== 'object' || Array.isArray(json)) {
    diagnostics.push('response root is not an object');
    return { columns: [], rows: [], diagnostics };
  }

  const root = json as Record<string, unknown>;

  if (!Array.isArray(root['results'])) {
    diagnostics.push('results field missing or not an array');
    return { columns: [], rows: [], diagnostics };
  }

  const results = root['results'] as unknown[];

  if (results.length === 0) {
    diagnostics.push('results array is empty');
    return { columns: [], rows: [], diagnostics };
  }

  const firstResult = results[0];
  if (firstResult === null || typeof firstResult !== 'object' || Array.isArray(firstResult)) {
    diagnostics.push('results[0] is not an object');
    return { columns: [], rows: [], diagnostics };
  }

  const resultObj = firstResult as Record<string, unknown>;

  if (!Array.isArray(resultObj['tables'])) {
    diagnostics.push('results[0].tables missing or not an array');
    return { columns: [], rows: [], diagnostics };
  }

  const tables = resultObj['tables'] as unknown[];

  if (tables.length === 0) {
    diagnostics.push('results[0].tables is empty');
    return { columns: [], rows: [], diagnostics };
  }

  const firstTable = tables[0];
  if (firstTable === null || typeof firstTable !== 'object' || Array.isArray(firstTable)) {
    diagnostics.push('results[0].tables[0] is not an object');
    return { columns: [], rows: [], diagnostics };
  }

  const tableObj = firstTable as Record<string, unknown>;

  if (!Array.isArray(tableObj['rows'])) {
    diagnostics.push('results[0].tables[0].rows missing or not an array');
    return { columns: [], rows: [], diagnostics };
  }

  const rawRows = tableObj['rows'] as unknown[];
  const columns: string[] = [];
  const seen = new Set<string>();

  const rows = rawRows.map((raw, idx) => {
    const out: Record<string, unknown> = {};
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      diagnostics.push(`row[${idx}] is not an object; substituted empty row`);
      return out;
    }
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const normalized = normalizeKey(key);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        columns.push(normalized);
      }
      out[normalized] = value;
    }
    return out;
  });

  return { columns, rows, diagnostics };
}
