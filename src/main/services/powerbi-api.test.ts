import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ARCH-B4: powerbi-api.ts imports auth/singleton.ts, which (lazily) reaches for
// the electron/MSAL-backed auth service. The DI factory means the SERVICE needs
// none of that, but the module's top-level imports still transitively load
// electron via the auth module graph. Stub electron so the import is clean.
vi.mock('electron', () => ({
  BrowserWindow: class {},
  session: {
    defaultSession: { clearStorageData: vi.fn().mockResolvedValue(undefined) },
    fromPartition: vi.fn(() => ({ clearStorageData: vi.fn().mockResolvedValue(undefined) })),
  },
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s, 'utf-8'),
    decryptString: (b: Buffer) => b.toString('utf-8'),
  },
  app: { getPath: () => '/tmp', getVersion: () => '0.0.0-test' },
}));

import {
  createPowerBIApiService,
  buildProductionApiDeps,
  type ApiAuthPort,
  type PowerBIApiDeps,
} from './powerbi-api';
import type { IPCResponse, TokenResult } from '../../shared/types';

function tokenOk(): IPCResponse<TokenResult> {
  return { success: true, data: { accessToken: 'test-access-token', expiresOn: null } };
}

function makeDeps(auth: ApiAuthPort): PowerBIApiDeps {
  return { auth };
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('powerbi-api module (ARCH-B4: DI factory)', () => {
  it('exposes the createPowerBIApiService factory and production deps builder', () => {
    expect(createPowerBIApiService).toBeTypeOf('function');
    expect(buildProductionApiDeps).toBeTypeOf('function');
    const svc = createPowerBIApiService(buildProductionApiDeps());
    expect(svc).toBeDefined();
    expect(svc.getWorkspaces).toBeTypeOf('function');
  });

  it('uses the injected auth port to authorize requests', async () => {
    const getAccessToken = vi.fn().mockResolvedValue(tokenOk());
    const svc = createPowerBIApiService(makeDeps({ getAccessToken }));

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ value: [] }), { status: 200 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await svc.getWorkspaces();
    expect(result.success).toBe(true);
    expect(getAccessToken).toHaveBeenCalled();

    // Bearer header carries the injected token.
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-access-token');
  });

  it('fails the call when the auth port cannot supply a token', async () => {
    const getAccessToken = vi.fn().mockResolvedValue({
      success: false,
      error: { code: 'NO_ACCOUNT', message: 'No authenticated account' },
    } satisfies IPCResponse<TokenResult>);
    const svc = createPowerBIApiService(makeDeps({ getAccessToken }));

    // fetch should never be reached; make it explode if it is.
    globalThis.fetch = vi.fn(() => {
      throw new Error('fetch should not be called when token acquisition fails');
    }) as unknown as typeof fetch;

    const result = await svc.getWorkspaces();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('WORKSPACES_FETCH_FAILED');
  });

  // PROD-S9: the data-freshness indicator (ReportViewer + DashboardViewer)
  // depends on getDatasetRefreshInfo distinguishing "no refresh history" from a
  // real timestamp. When the dataset has never refreshed, the API returns
  // success with empty data (no lastRefreshTime) so viewers render no indicator
  // rather than a blank/garbage value.
  it('getDatasetRefreshInfo returns empty data when there is no refresh history', async () => {
    const getAccessToken = vi.fn().mockResolvedValue(tokenOk());
    const svc = createPowerBIApiService(makeDeps({ getAccessToken }));

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ value: [] }), { status: 200 }),
    ) as unknown as typeof fetch;

    const result = await svc.getDatasetRefreshInfo('ds-1', 'ws-1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lastRefreshTime).toBeUndefined();
    }
  });

  it('getDatasetRefreshInfo surfaces the latest refresh time when history exists', async () => {
    const getAccessToken = vi.fn().mockResolvedValue(tokenOk());
    const svc = createPowerBIApiService(makeDeps({ getAccessToken }));

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          value: [
            {
              requestId: 'r1',
              id: '1',
              refreshType: 'Scheduled',
              startTime: '2026-06-01T00:00:00.000Z',
              endTime: '2026-06-01T00:05:00.000Z',
              status: 'Completed',
            },
          ],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const result = await svc.getDatasetRefreshInfo('ds-1', 'ws-1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lastRefreshTime).toBe('2026-06-01T00:05:00.000Z');
      expect(result.data.lastRefreshStatus).toBe('Completed');
    }
  });

  // PROD-S9: getDashboardDataFreshness derives a single freshness signal for a
  // whole dashboard by enumerating tiles, collecting distinct datasetIds,
  // querying each dataset's refresh history, and returning the OLDEST (stalest)
  // lastRefreshTime. The fetch mock below routes by URL: the tiles endpoint
  // returns the tile list; the per-dataset refreshes endpoints return history.
  function makeFreshnessFetch(
    tiles: Array<{ id: string; datasetId?: string }>,
    refreshes: Record<string, { value: unknown[] } | { status: number }>
  ): typeof fetch {
    return vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/tiles')) {
        return Promise.resolve(new Response(JSON.stringify({ value: tiles }), { status: 200 }));
      }
      // /datasets/<id>/refreshes
      const match = url.match(/datasets\/([^/]+)\/refreshes/);
      const datasetId = match?.[1] ?? '';
      const entry = refreshes[datasetId];
      if (entry && 'status' in entry) {
        return Promise.resolve(new Response('error body', { status: entry.status }));
      }
      return Promise.resolve(
        new Response(JSON.stringify(entry ?? { value: [] }), { status: 200 })
      );
    }) as unknown as typeof fetch;
  }

  function refreshAt(time: string) {
    return {
      value: [
        {
          requestId: 'r',
          id: '1',
          refreshType: 'Scheduled',
          startTime: time,
          endTime: time,
          status: 'Completed',
        },
      ],
    };
  }

  it('getDashboardDataFreshness returns the OLDEST refresh time across distinct tile datasets', async () => {
    const getAccessToken = vi.fn().mockResolvedValue(tokenOk());
    const svc = createPowerBIApiService(makeDeps({ getAccessToken }));

    globalThis.fetch = makeFreshnessFetch(
      [
        { id: 't1', datasetId: 'ds-new' },
        { id: 't2', datasetId: 'ds-old' },
        { id: 't3', datasetId: 'ds-new' }, // duplicate dataset → deduped
      ],
      {
        'ds-new': refreshAt('2026-06-05T00:00:00.000Z'),
        'ds-old': refreshAt('2026-06-01T00:00:00.000Z'),
      }
    );

    const result = await svc.getDashboardDataFreshness('db-1', 'ws-1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lastRefreshTime).toBe('2026-06-01T00:00:00.000Z');
    }
  });

  it('getDashboardDataFreshness returns empty data when no tile exposes a datasetId', async () => {
    const getAccessToken = vi.fn().mockResolvedValue(tokenOk());
    const svc = createPowerBIApiService(makeDeps({ getAccessToken }));

    globalThis.fetch = makeFreshnessFetch([{ id: 't1' }, { id: 't2' }], {});

    const result = await svc.getDashboardDataFreshness('db-1', 'ws-1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lastRefreshTime).toBeUndefined();
    }
  });

  it('getDashboardDataFreshness returns empty data when the tile list is empty', async () => {
    const getAccessToken = vi.fn().mockResolvedValue(tokenOk());
    const svc = createPowerBIApiService(makeDeps({ getAccessToken }));

    globalThis.fetch = makeFreshnessFetch([], {});

    const result = await svc.getDashboardDataFreshness('db-1', 'ws-1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lastRefreshTime).toBeUndefined();
    }
  });

  it('getDashboardDataFreshness skips a failing dataset query and returns the oldest of the rest', async () => {
    const getAccessToken = vi.fn().mockResolvedValue(tokenOk());
    const svc = createPowerBIApiService(makeDeps({ getAccessToken }));

    globalThis.fetch = makeFreshnessFetch(
      [
        { id: 't1', datasetId: 'ds-good-old' },
        { id: 't2', datasetId: 'ds-bad' },
        { id: 't3', datasetId: 'ds-good-new' },
      ],
      {
        'ds-good-old': refreshAt('2026-06-02T00:00:00.000Z'),
        'ds-bad': { status: 403 }, // inaccessible dataset — skipped, doesn't fail call
        'ds-good-new': refreshAt('2026-06-04T00:00:00.000Z'),
      }
    );

    const result = await svc.getDashboardDataFreshness('db-1', 'ws-1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lastRefreshTime).toBe('2026-06-02T00:00:00.000Z');
    }
  });

  // --- Freshness correctness: a FAILED refresh must not masquerade as fresh ----
  function refreshWith(time: string, status: string) {
    return {
      value: [{ requestId: 'r', id: '1', refreshType: 'Scheduled', startTime: time, endTime: time, status }],
    };
  }

  // Routes every getDataFreshness sub-call by URL: dataset refreshes, the
  // upstreamDataflows lineage link, the workspace dataflows list (fallback), and
  // per-dataflow transactions.
  function makeDataFreshnessFetch(opts: {
    refreshes?: Record<string, { value: unknown[] }>;
    upstream?: unknown[];
    dataflowsList?: unknown[];
    transactions?: Record<string, { value: unknown[] }>;
  }): typeof fetch {
    return vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('datasets/upstreamDataflows')) {
        return Promise.resolve(new Response(JSON.stringify({ value: opts.upstream ?? [] }), { status: 200 }));
      }
      const tx = url.match(/dataflows\/([^/]+)\/transactions/);
      if (tx) {
        const dfId = tx[1] ?? '';
        return Promise.resolve(
          new Response(JSON.stringify(opts.transactions?.[dfId] ?? { value: [] }), { status: 200 }),
        );
      }
      const r = url.match(/datasets\/([^/]+)\/refreshes/);
      if (r) {
        const dsId = r[1] ?? '';
        return Promise.resolve(
          new Response(JSON.stringify(opts.refreshes?.[dsId] ?? { value: [] }), { status: 200 }),
        );
      }
      if (/\/dataflows(\?|$)/.test(url)) {
        return Promise.resolve(new Response(JSON.stringify({ value: opts.dataflowsList ?? [] }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ value: [] }), { status: 200 }));
    }) as unknown as typeof fetch;
  }

  it('getDatasetRefreshInfo prefers the latest SUCCESSFUL refresh over a more-recent failed attempt', async () => {
    const svc = createPowerBIApiService(makeDeps({ getAccessToken: vi.fn().mockResolvedValue(tokenOk()) }));
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          value: [
            // newest-first: latest attempt FAILED, but an earlier one published data
            { requestId: 'r', id: '2', refreshType: 'Scheduled', startTime: '2026-06-08T00:00:00.000Z', endTime: '2026-06-08T00:01:00.000Z', status: 'Failed' },
            { requestId: 'r', id: '1', refreshType: 'Scheduled', startTime: '2026-06-07T00:00:00.000Z', endTime: '2026-06-07T00:05:00.000Z', status: 'Completed' },
          ],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const result = await svc.getDatasetRefreshInfo('ds-1', 'ws-1');
    expect(result.success).toBe(true);
    if (result.success) {
      // Show when data was actually published (the Completed one), not the failed attempt.
      expect(result.data.lastRefreshTime).toBe('2026-06-07T00:05:00.000Z');
      expect(result.data.lastRefreshStatus).toBe('Completed');
    }
  });

  it('getDatasetRefreshInfo falls back to the latest attempt so a stamp still appears when none succeeded', async () => {
    const svc = createPowerBIApiService(makeDeps({ getAccessToken: vi.fn().mockResolvedValue(tokenOk()) }));
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(refreshWith('2026-06-08T00:01:00.000Z', 'Failed')), { status: 200 }),
      ) as unknown as typeof fetch;

    const result = await svc.getDatasetRefreshInfo('ds-1', 'ws-1');
    expect(result.success).toBe(true);
    if (result.success) {
      // No success in history → still surface a timestamp (better than a blank stamp).
      expect(result.data.lastRefreshTime).toBe('2026-06-08T00:01:00.000Z');
      expect(result.data.lastRefreshStatus).toBe('Failed');
    }
  });

  it('getDatasetRefreshInfo surfaces the time for an Unknown status (completed on-demand refresh)', async () => {
    const svc = createPowerBIApiService(makeDeps({ getAccessToken: vi.fn().mockResolvedValue(tokenOk()) }));
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(refreshWith('2026-06-08T00:05:00.000Z', 'Unknown')), { status: 200 }),
      ) as unknown as typeof fetch;

    const result = await svc.getDatasetRefreshInfo('ds-1', 'ws-1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lastRefreshTime).toBe('2026-06-08T00:05:00.000Z');
      expect(result.data.lastRefreshStatus).toBe('Unknown');
    }
  });

  it('getDataFreshness returns the STALEST dataset refresh time across multiple datasets', async () => {
    const svc = createPowerBIApiService(makeDeps({ getAccessToken: vi.fn().mockResolvedValue(tokenOk()) }));
    globalThis.fetch = makeDataFreshnessFetch({
      refreshes: {
        'ds-new': refreshWith('2026-06-05T00:00:00.000Z', 'Completed'),
        'ds-old': refreshWith('2026-06-01T00:00:00.000Z', 'Completed'),
      },
      upstream: [],
      dataflowsList: [], // no dataflows → no fallback, no dataflow stamp
    });

    const result = await svc.getDataFreshness('ws-1', ['ds-new', 'ds-old']);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.datasetRefreshTime).toBe('2026-06-01T00:00:00.000Z');
      expect(result.data.dataflowRefreshTime).toBeNull();
      expect(result.data.datasetCount).toBe(2);
    }
  });

  it('getDataFreshness returns the STALEST dataflow last-SUCCESS and ignores non-Success transactions', async () => {
    const svc = createPowerBIApiService(makeDeps({ getAccessToken: vi.fn().mockResolvedValue(tokenOk()) }));
    globalThis.fetch = makeDataFreshnessFetch({
      refreshes: { 'ds-1': refreshWith('2026-06-06T00:00:00.000Z', 'Completed') },
      upstream: [
        { datasetObjectId: 'ds-1', dataflowObjectId: 'df-1', workspaceObjectId: 'ws-1' },
        { datasetObjectId: 'ds-1', dataflowObjectId: 'df-2', workspaceObjectId: 'ws-1' },
      ],
      transactions: {
        'df-1': { value: [{ status: 'Success', endTime: '2026-06-03T00:00:00.000Z' }] },
        'df-2': {
          value: [
            { status: 'Success', endTime: '2026-06-01T00:00:00.000Z' },
            { status: 'Failed', endTime: '2026-06-09T00:00:00.000Z' }, // newer but FAILED → ignored
            { status: 'InProgress' }, // no endTime → ignored
          ],
        },
      },
    });

    const result = await svc.getDataFreshness('ws-1', ['ds-1']);
    expect(result.success).toBe(true);
    if (result.success) {
      // stalest of df-1 (06-03) and df-2 (06-01, ignoring its newer Failed) = 06-01
      expect(result.data.dataflowRefreshTime).toBe('2026-06-01T00:00:00.000Z');
      expect(result.data.datasetRefreshTime).toBe('2026-06-06T00:00:00.000Z');
    }
  });

  it('terminates pagination when @odata.nextLink is circular instead of looping forever', async () => {
    const getAccessToken = vi.fn().mockResolvedValue(tokenOk());
    const svc = createPowerBIApiService(makeDeps({ getAccessToken }));

    // Every page points its nextLink back at the same URL — a hang before the
    // seen-URL guard existed.
    const circular = 'https://api.powerbi.com/v1.0/myorg/groups?$skip=1';
    // A fresh Response per call — a Response body is single-use.
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          value: [{ id: 'ws-1', name: 'W', isReadOnly: false, type: 'Workspace' }],
          '@odata.nextLink': circular,
        }),
        { status: 200 },
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await svc.getWorkspaces();
    expect(result.success).toBe(true);
    // First page + one visit to the circular link, then stop.
    expect(fetchMock.mock.calls.length).toBe(2);
  });

  it('follows @odata.nextLink across pages and concatenates results', async () => {
    const getAccessToken = vi.fn().mockResolvedValue(tokenOk());
    const svc = createPowerBIApiService(makeDeps({ getAccessToken }));

    const page2 = 'https://api.powerbi.com/v1.0/myorg/groups?$skip=100';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            value: [{ id: 'ws-1', name: 'A', isReadOnly: false, type: 'Workspace' }],
            '@odata.nextLink': page2,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            value: [{ id: 'ws-2', name: 'B', isReadOnly: false, type: 'Workspace' }],
          }),
          { status: 200 },
        ),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await svc.getWorkspaces();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.map((w) => w.id)).toEqual(['ws-1', 'ws-2']);
    }
    expect(fetchMock.mock.calls.length).toBe(2);
  });

  it('getEmbedToken returns the injected access token as the embed token', async () => {
    const getAccessToken = vi.fn().mockResolvedValue({
      success: true,
      data: { accessToken: 'embed-tok', expiresOn: '2030-01-01T00:00:00.000Z' },
    } satisfies IPCResponse<TokenResult>);
    const svc = createPowerBIApiService(makeDeps({ getAccessToken }));

    const result = await svc.getEmbedToken(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.token).toBe('embed-tok');
      expect(result.data.expiration).toBe('2030-01-01T00:00:00.000Z');
    }
  });
});
