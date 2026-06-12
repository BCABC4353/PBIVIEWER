import { buildExecuteQueriesBody, parseExecuteQueriesResponse, type ParsedQueryResult } from './execute-queries';

export interface QueryTransport {
  post(url: string, body: unknown, accessToken: string): Promise<{ status: number; json: unknown }>;
}

export interface TokenProvider {
  getAccessToken(): Promise<string>;
}

export type QueryError =
  | { kind: 'TOKEN_EXPIRED' }
  | { kind: 'FORBIDDEN' }
  | { kind: 'NOT_FOUND' }
  | { kind: 'THROTTLED'; retryAfterSeconds: number | null }
  | { kind: 'BAD_DAX'; detail: string }
  | { kind: 'TRANSPORT'; message: string };

export type QueryClientResult =
  | { ok: true; result: ParsedQueryResult }
  | { ok: false; error: QueryError };

export interface ExecuteForDatasetParams {
  groupId?: string;
  datasetId: string;
  dax: string;
}

export interface QueryClient {
  executeForDataset(params: ExecuteForDatasetParams): Promise<QueryClientResult>;
}

const BASE = 'https://api.powerbi.com/v1.0/myorg';

function buildUrl(groupId: string | undefined, datasetId: string): string {
  if (groupId) {
    return `${BASE}/groups/${groupId}/datasets/${datasetId}/executeQueries`;
  }
  return `${BASE}/datasets/${datasetId}/executeQueries`;
}

function extractErrorDetail(json: unknown): string {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return '';
  const obj = json as Record<string, unknown>;
  const err = obj['error'];
  if (err === null || typeof err !== 'object' || Array.isArray(err)) return '';
  const errObj = err as Record<string, unknown>;
  const parts = [errObj['code'], errObj['message']].filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );
  return parts.join(': ').slice(0, 400);
}

function extractRetryAfter(json: unknown): number | null {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return null;
  const obj = json as Record<string, unknown>;
  const v = obj['retryAfter'] ?? obj['retry_after'];
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export function createQueryClient(deps: {
  transport: QueryTransport;
  tokenProvider: TokenProvider;
}): QueryClient {
  const { transport, tokenProvider } = deps;

  return {
    async executeForDataset({ groupId, datasetId, dax }): Promise<QueryClientResult> {
      const url = buildUrl(groupId, datasetId);
      const body = buildExecuteQueriesBody(dax);

      let accessToken: string;
      try {
        accessToken = await tokenProvider.getAccessToken();
      } catch (e) {
        return {
          ok: false,
          error: { kind: 'TRANSPORT', message: e instanceof Error ? e.message : String(e) },
        };
      }

      let status: number;
      let json: unknown;
      try {
        const response = await transport.post(url, body, accessToken);
        status = response.status;
        json = response.json;
      } catch (e) {
        return {
          ok: false,
          error: { kind: 'TRANSPORT', message: e instanceof Error ? e.message : String(e) },
        };
      }

      if (status === 200) {
        const result = parseExecuteQueriesResponse(json);
        return { ok: true, result };
      }

      if (status === 401) {
        return { ok: false, error: { kind: 'TOKEN_EXPIRED' } };
      }

      if (status === 403) {
        return { ok: false, error: { kind: 'FORBIDDEN' } };
      }

      if (status === 404) {
        return { ok: false, error: { kind: 'NOT_FOUND' } };
      }

      if (status === 429) {
        return {
          ok: false,
          error: { kind: 'THROTTLED', retryAfterSeconds: extractRetryAfter(json) },
        };
      }

      if (status === 400) {
        return {
          ok: false,
          error: { kind: 'BAD_DAX', detail: extractErrorDetail(json) },
        };
      }

      return {
        ok: false,
        error: { kind: 'TRANSPORT', message: `Unexpected HTTP ${status}` },
      };
    },
  };
}
