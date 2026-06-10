import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Powerbi-api.ts imports auth/singleton.ts, which (lazily) reaches for
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

  // The data-freshness indicator (ReportViewer + DashboardViewer)
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

  // GetDashboardDataFreshness derives a single freshness signal for a
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

    // Every page points its nextLink back at the same URL — would hang
    // forever without the seen-URL guard.
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

describe('getInsightsSnapshot', () => {
  // Route fetch by URL (ordered regex routes, first match wins) so one mock
  // serves the whole insights fan-out.
  function insightsFetchMock(routes: Array<[RegExp, unknown]>) {
    return vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      for (const [pattern, body] of routes) {
        if (pattern.test(url)) {
          return new Response(JSON.stringify(body), { status: 200 });
        }
      }
      return new Response(JSON.stringify({ value: [] }), { status: 200 });
    });
  }

  const WS = '11111111-1111-1111-1111-111111111111';

  function makeInsightsSvc(routes: Array<[RegExp, unknown]>) {
    const getAccessToken = vi.fn().mockResolvedValue(tokenOk());
    globalThis.fetch = insightsFetchMock(routes) as unknown as typeof fetch;
    return createPowerBIApiService(makeDeps({ getAccessToken }));
  }

  // The workspaces list is the bare /groups URL (no trailing path segment).
  const workspacesRoute: [RegExp, unknown] = [
    /\/groups(\?|$)/,
    { value: [{ id: WS, name: 'Sales', isReadOnly: false, type: 'Workspace' }] },
  ];

  it('derives Failed-with-prior-success from refresh history and parses the error code', async () => {
    const svc = makeInsightsSvc([
      [
        /\/datasets\/ds-1\/refreshes/,
        {
          value: [
            {
              status: 'Failed',
              startTime: '2026-06-10T01:00:00Z',
              endTime: '2026-06-10T01:05:00Z',
              serviceExceptionJson: '{"errorCode":"ModelRefreshFailed_CredentialsNotSpecified"}',
            },
            { status: 'Completed', startTime: '2026-06-09T01:00:00Z', endTime: '2026-06-09T01:05:00Z' },
          ],
        },
      ],
      [
        /\/datasets(\?|$)/,
        { value: [{ id: 'ds-1', name: 'Sales Model', configuredBy: 'b@bc-abc.com', isRefreshable: true }] },
      ],
      [
        /\/users(\?|$)/,
        { value: [{ displayName: 'Brendan', emailAddress: 'b@bc-abc.com', groupUserAccessRight: 'Admin', principalType: 'User' }] },
      ],
      workspacesRoute,
    ]);

    const result = await svc.getInsightsSnapshot();
    expect(result.success).toBe(true);
    if (!result.success) return;

    const ds = result.data.refreshables.find((r) => r.kind === 'dataset');
    expect(ds).toBeDefined();
    expect(ds!.lastStatus).toBe('Failed');
    expect(ds!.errorCode).toBe('ModelRefreshFailed_CredentialsNotSpecified');
    expect(ds!.lastSuccessTime).toBe('2026-06-09T01:05:00Z');
    expect(ds!.configuredBy).toBe('b@bc-abc.com');

    const access = result.data.access.find((a) => a.workspaceId === WS);
    expect(access?.users).toEqual([
      { name: 'Brendan', email: 'b@bc-abc.com', role: 'Admin', type: 'User' },
    ]);
  });

  it('marks non-refreshable datasets Disabled without fetching their history', async () => {
    const svc = makeInsightsSvc([
      [/\/datasets(\?|$)/, { value: [{ id: 'ds-live', name: 'Live Model', isRefreshable: false }] }],
      workspacesRoute,
    ]);
    const result = await svc.getInsightsSnapshot();
    expect(result.success).toBe(true);
    if (!result.success) return;
    const ds = result.data.refreshables[0];
    expect(ds?.lastStatus).toBe('Disabled');
    // No /refreshes call was made for the disabled dataset.
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes('/refreshes'))).toBe(false);
  });

  it('returns access users:null when the user list is not visible to the caller', async () => {
    const getAccessToken = vi.fn().mockResolvedValue(tokenOk());
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/users')) return new Response('Unauthorized', { status: 401 });
      if (url.includes('/groups/')) return new Response(JSON.stringify({ value: [] }), { status: 200 });
      return new Response(
        JSON.stringify({ value: [{ id: WS, name: 'Sales', isReadOnly: false, type: 'Workspace' }] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const svc = createPowerBIApiService(makeDeps({ getAccessToken }));

    const result = await svc.getInsightsSnapshot();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.access[0]?.users).toBeNull();
  });

  it('serves the second call from cache and rebuilds with force=true', async () => {
    const svc = makeInsightsSvc([workspacesRoute]);
    const first = await svc.getInsightsSnapshot();
    expect(first.success).toBe(true);
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const callsAfterFirst = fetchMock.mock.calls.length;

    const second = await svc.getInsightsSnapshot();
    expect(second.success).toBe(true);
    if (second.success) expect(second.data.fromCache).toBe(true);
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);

    const third = await svc.getInsightsSnapshot(true);
    expect(third.success).toBe(true);
    if (third.success) expect(third.data.fromCache).toBe(false);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});

describe('getInsightsSnapshot — health derivation branches', () => {
  const WS = '11111111-1111-1111-1111-111111111111';
  const wsRoute: [RegExp, unknown] = [
    /\/groups(\?|$)/,
    { value: [{ id: WS, name: 'Sales', isReadOnly: false, type: 'Workspace' }] },
  ];

  function svcWith(routes: Array<[RegExp, unknown]>) {
    const getAccessToken = vi.fn().mockResolvedValue(tokenOk());
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      for (const [pattern, body] of routes) {
        if (pattern.test(url)) return new Response(JSON.stringify(body), { status: 200 });
      }
      return new Response(JSON.stringify({ value: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    return createPowerBIApiService(makeDeps({ getAccessToken }));
  }

  it('derives dataflow health: Success → Completed with last-success time', async () => {
    const svc = svcWith([
      [/\/transactions/, {
        value: [
          { status: 'Success', startTime: '2026-06-10T01:00:00Z', endTime: '2026-06-10T01:10:00Z' },
          { status: 'Failed', startTime: '2026-06-09T01:00:00Z', endTime: '2026-06-09T01:10:00Z' },
        ],
      }],
      [/\/dataflows(\?|$)/, { value: [{ objectId: 'df-1', name: 'Flow' }] }],
      wsRoute,
    ]);
    const result = await svc.getInsightsSnapshot();
    expect(result.success).toBe(true);
    if (!result.success) return;
    const df = result.data.refreshables.find((r) => r.kind === 'dataflow');
    expect(df?.lastStatus).toBe('Completed');
    expect(df?.lastSuccessTime).toBe('2026-06-10T01:10:00Z');
  });

  it('derives dataflow health: newest Failed → Failed, keeping the earlier success', async () => {
    const svc = svcWith([
      [/\/transactions/, {
        value: [
          { status: 'Failed', startTime: '2026-06-10T01:00:00Z', endTime: '2026-06-10T01:10:00Z' },
          { status: 'Success', startTime: '2026-06-09T01:00:00Z', endTime: '2026-06-09T01:10:00Z' },
        ],
      }],
      [/\/dataflows(\?|$)/, { value: [{ objectId: 'df-1', name: 'Flow' }] }],
      wsRoute,
    ]);
    const result = await svc.getInsightsSnapshot();
    expect(result.success).toBe(true);
    if (!result.success) return;
    const df = result.data.refreshables.find((r) => r.kind === 'dataflow');
    expect(df?.lastStatus).toBe('Failed');
    expect(df?.lastSuccessTime).toBe('2026-06-09T01:10:00Z');
  });

  it('treats an Unknown refresh with no endTime as InProgress and tolerates bad exception JSON', async () => {
    const svc = svcWith([
      [/\/datasets\/ds-run\/refreshes/, {
        value: [{ status: 'Unknown', startTime: '2026-06-10T01:00:00Z' }],
      }],
      [/\/datasets\/ds-badjson\/refreshes/, {
        value: [{ status: 'Failed', endTime: '2026-06-10T01:00:00Z', serviceExceptionJson: 'not-json{' }],
      }],
      [/\/datasets(\?|$)/, {
        value: [
          { id: 'ds-run', name: 'Running', isRefreshable: true },
          { id: 'ds-badjson', name: 'BadJson', isRefreshable: true },
        ],
      }],
      wsRoute,
    ]);
    const result = await svc.getInsightsSnapshot();
    expect(result.success).toBe(true);
    if (!result.success) return;
    const running = result.data.refreshables.find((r) => r.id === 'ds-run');
    expect(running?.lastStatus).toBe('InProgress');
    const bad = result.data.refreshables.find((r) => r.id === 'ds-badjson');
    expect(bad?.lastStatus).toBe('Failed');
    expect(bad?.errorCode).toBeUndefined();
  });

  it('returns a hard failure when EVERY workspace fails to read (not an empty board)', async () => {
    const getAccessToken = vi.fn().mockResolvedValue(tokenOk());
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (/\/datasets(\?|$)/.test(url) || /\/dataflows(\?|$)/.test(url)) {
        return new Response('forbidden', { status: 403 });
      }
      if (/\/groups\//.test(url)) return new Response(JSON.stringify({ value: [] }), { status: 200 });
      return new Response(
        JSON.stringify({ value: [{ id: WS, name: 'Sales', isReadOnly: false, type: 'Workspace' }] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const svc = createPowerBIApiService(makeDeps({ getAccessToken }));

    const result = await svc.getInsightsSnapshot();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INSIGHTS_FETCH_FAILED');
  });

  it('keeps partial success when SOME workspaces read and others fail', async () => {
    const WS2 = '22222222-2222-2222-2222-222222222222';
    const getAccessToken = vi.fn().mockResolvedValue(tokenOk());
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      // Workspace WS2's dataset/dataflow lists fail; WS reads fine (empty).
      if (url.includes(WS2) && (/\/datasets(\?|$)/.test(url) || /\/dataflows(\?|$)/.test(url))) {
        return new Response('forbidden', { status: 403 });
      }
      if (/\/groups\//.test(url)) return new Response(JSON.stringify({ value: [] }), { status: 200 });
      return new Response(
        JSON.stringify({
          value: [
            { id: WS, name: 'Sales', isReadOnly: false, type: 'Workspace' },
            { id: WS2, name: 'Ops', isReadOnly: false, type: 'Workspace' },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const svc = createPowerBIApiService(makeDeps({ getAccessToken }));

    const result = await svc.getInsightsSnapshot();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.partialFailure).toBe(true);
    expect(result.data.failedWorkspaces.map((w) => w.name)).toEqual(['Ops']);
  });

  it('clearCaches drops the cached snapshot so the next call rebuilds', async () => {
    const getAccessToken = vi.fn().mockResolvedValue(tokenOk());
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (/\/groups(\?|$)/.test(url)) {
        return new Response(
          JSON.stringify({ value: [{ id: WS, name: 'Sales', isReadOnly: false, type: 'Workspace' }] }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ value: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const svc = createPowerBIApiService(makeDeps({ getAccessToken }));

    await svc.getInsightsSnapshot();
    const cached = await svc.getInsightsSnapshot();
    expect(cached.success && cached.data.fromCache).toBe(true);

    svc.clearCaches();
    const rebuilt = await svc.getInsightsSnapshot();
    expect(rebuilt.success && rebuilt.data.fromCache).toBe(false);
  });
});

describe('getAdminInsights', () => {
  function adminAuth(overrides: Partial<ApiAuthPort> = {}): ApiAuthPort {
    return {
      getAccessToken: vi.fn().mockResolvedValue(tokenOk()),
      getAdminAccessToken: vi.fn().mockResolvedValue({
        success: true,
        data: { accessToken: 'admin-token', expiresOn: null },
      }),
      ...overrides,
    };
  }

  it('aggregates activity across continuation pages and maps app audiences', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('continuation-2')) {
        return new Response(
          JSON.stringify({
            activityEventEntities: [
              { UserId: 'a@client.com', ReportName: 'Sales Daily', CreationTime: '2026-06-10T10:00:00Z' },
            ],
            lastResultSet: true,
          }),
          { status: 200 },
        );
      }
      if (url.includes('/admin/activityevents')) {
        return new Response(
          JSON.stringify({
            activityEventEntities: [
              { UserId: 'a@client.com', ReportName: 'Sales Daily', CreationTime: '2026-06-10T09:00:00Z' },
              { UserId: 'b@client.com', ReportName: 'Ops Weekly', CreationTime: '2026-06-10T08:00:00Z' },
            ],
            continuationUri: 'https://api.powerbi.com/v1.0/myorg/admin/activityevents?continuation-2',
            lastResultSet: false,
          }),
          { status: 200 },
        );
      }
      if (url.includes('/admin/apps/')) {
        return new Response(
          JSON.stringify({
            value: [
              { displayName: 'Client A', emailAddress: 'a@client.com', appUserAccessRight: 'Viewer', principalType: 'User' },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes('/apps')) {
        return new Response(
          JSON.stringify({
            value: [{ id: 'app-1', name: 'BC Suite', description: '', publishedBy: 'me', lastUpdate: '' }],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ value: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const svc = createPowerBIApiService({ auth: adminAuth() });
    const result = await svc.getAdminInsights(1);
    expect(result.success).toBe(true);
    if (!result.success) return;

    // Continuation page was followed: a@client.com has 2 views.
    const userA = result.data.activityByUser.find((u) => u.user === 'a@client.com');
    expect(userA?.views).toBe(2);
    expect(userA?.lastActive).toBe('2026-06-10T10:00:00Z');
    const item = result.data.activityByItem.find((i) => i.name === 'Sales Daily');
    expect(item?.views).toBe(2);
    expect(item?.uniqueUsers).toBe(1);
    // Sorted by views descending: Sales Daily before Ops Weekly.
    expect(result.data.activityByItem[0]?.name).toBe('Sales Daily');

    expect(result.data.appAudiences[0]?.appName).toBe('BC Suite');
    expect(result.data.appAudiences[0]?.users?.[0]?.accessRight).toBe('Viewer');
    expect(result.data.failedDays).toBe(0);
  });

  it('maps an admin-endpoint 403 to ADMIN_REQUIRED', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/admin/')) return new Response('forbidden', { status: 403 });
      if (url.includes('/apps')) {
        return new Response(
          JSON.stringify({ value: [{ id: 'app-1', name: 'BC Suite', description: '', publishedBy: '', lastUpdate: '' }] }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ value: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const svc = createPowerBIApiService({ auth: adminAuth() });
    const result = await svc.getAdminInsights(1);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('ADMIN_REQUIRED');
  });

  it('propagates a declined consent as ADMIN_CONSENT_CANCELLED', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/apps')) {
        return new Response(
          JSON.stringify({ value: [{ id: 'app-1', name: 'BC Suite', description: '', publishedBy: '', lastUpdate: '' }] }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ value: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const svc = createPowerBIApiService({
      auth: adminAuth({
        getAdminAccessToken: vi.fn().mockResolvedValue({
          success: false,
          error: { code: 'ADMIN_CONSENT_CANCELLED', message: 'closed' },
        }),
      }),
    });
    const result = await svc.getAdminInsights(1);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('ADMIN_CONSENT_CANCELLED');
  });
});

describe('getAdminInsights — degradation and field-fallback branches', () => {
  function adminAuthOk(): ApiAuthPort {
    return {
      getAccessToken: vi.fn().mockResolvedValue(tokenOk()),
      getAdminAccessToken: vi.fn().mockResolvedValue({
        success: true,
        data: { accessToken: 'admin-token', expiresOn: null },
      }),
    };
  }

  it('tolerates events with fallback field names and counts a failed day as partial', async () => {
    let activityCall = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/admin/activityevents')) {
        activityCall++;
        if (activityCall === 1) {
          return new Response(
            JSON.stringify({
              activityEventEntities: [
                // No UserId → UserKey; no ReportName → ItemName; no CreationTime.
                { UserKey: 'key-1', ItemName: 'Fallback Item' },
                // Entirely empty event → Unknown buckets.
                {},
              ],
              lastResultSet: true,
            }),
            { status: 200 },
          );
        }
        // Second day: a non-admin failure (404) → that day is skipped.
        return new Response('gone', { status: 404 });
      }
      if (url.includes('/admin/apps/')) {
        // Audience read fails with a plain 404 → users:null degradation.
        return new Response('gone', { status: 404 });
      }
      if (url.includes('/apps')) {
        return new Response(
          JSON.stringify({ value: [{ id: 'app-1', name: 'BC Suite', description: '', publishedBy: '', lastUpdate: '' }] }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ value: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const svc = createPowerBIApiService({ auth: adminAuthOk() });
    const result = await svc.getAdminInsights(2);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.failedDays).toBe(1);
    expect(result.data.appAudiences[0]?.users).toBeNull();
    const fallbackUser = result.data.activityByUser.find((u) => u.user === 'key-1');
    expect(fallbackUser?.views).toBe(1);
    expect(result.data.activityByItem.some((i) => i.name === 'Fallback Item')).toBe(true);
    expect(result.data.activityByUser.some((u) => u.user === 'Unknown')).toBe(true);
  });

  it('serves the admin snapshot from cache and rebuilds with force', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/admin/activityevents')) {
        return new Response(JSON.stringify({ activityEventEntities: [], lastResultSet: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ value: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const svc = createPowerBIApiService({ auth: adminAuthOk() });
    const first = await svc.getAdminInsights(1);
    expect(first.success).toBe(true);
    const callsAfterFirst = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    const second = await svc.getAdminInsights(1);
    expect(second.success).toBe(true);
    if (second.success) expect(second.data.fromCache).toBe(true);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterFirst);

    const third = await svc.getAdminInsights(1, true);
    expect(third.success).toBe(true);
    if (third.success) expect(third.data.fromCache).toBe(false);
  });

  it('bounds the day window to 14 and fails cleanly when the admin port is not wired', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/admin/activityevents')) {
        return new Response(JSON.stringify({ activityEventEntities: [], lastResultSet: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ value: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const svc = createPowerBIApiService({ auth: adminAuthOk() });
    const bounded = await svc.getAdminInsights(99, true);
    expect(bounded.success).toBe(true);
    if (bounded.success) expect(bounded.data.days).toBe(14);

    const unwired = createPowerBIApiService(makeDeps({ getAccessToken: vi.fn().mockResolvedValue(tokenOk()) }));
    // No apps → no audience calls; activity request hits the unwired port.
    const result = await unwired.getAdminInsights(1);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('ADMIN_INSIGHTS_FAILED');
  });
});

describe('getInsightsSnapshot — schedule-vs-reality', () => {
  const WS = '11111111-1111-1111-1111-111111111111';

  it('flags an enabled schedule with a stale last success as Overdue', async () => {
    const getAccessToken = vi.fn().mockResolvedValue(tokenOk());
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/refreshSchedule')) {
        return new Response(
          JSON.stringify({ days: ['Monday', 'Tuesday'], times: ['06:00'], enabled: true, localTimeZoneId: 'UTC' }),
          { status: 200 },
        );
      }
      if (url.includes('/refreshes')) {
        return new Response(
          JSON.stringify({
            value: [{ status: 'Completed', refreshType: 'ViaApi', startTime: '2026-05-01T00:00:00Z', endTime: '2026-05-01T00:05:00Z' }],
          }),
          { status: 200 },
        );
      }
      if (/\/datasets(\?|$)/.test(url)) {
        return new Response(JSON.stringify({ value: [{ id: 'ds-1', name: 'Model', isRefreshable: true }] }), { status: 200 });
      }
      if (/\/groups\//.test(url)) return new Response(JSON.stringify({ value: [] }), { status: 200 });
      return new Response(
        JSON.stringify({ value: [{ id: WS, name: 'Sales', isReadOnly: false, type: 'Workspace' }] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const svc = createPowerBIApiService(makeDeps({ getAccessToken }));
    const result = await svc.getInsightsSnapshot();
    expect(result.success).toBe(true);
    if (!result.success) return;
    const ds = result.data.refreshables.find((r) => r.id === 'ds-1');
    expect(ds?.lastRefreshType).toBe('ViaApi');
    expect(ds?.scheduleSummary).toBe('Monday, Tuesday at 06:00');
    // Last success is weeks older than the 2-slot/week cadence → overdue.
    expect(ds?.scheduleOverdue).toBe(true);
  });
});

describe('getAdminInsights — continuation safety', () => {
  it('stops and marks the day partial when continuationUri loops', async () => {
    const loopUri = 'https://api.powerbi.com/v1.0/myorg/admin/activityevents?continuation-loop';
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/admin/activityevents')) {
        // Always return the SAME continuationUri with lastResultSet:false — a
        // server bug that would loop forever without the seen-URL guard.
        return new Response(
          JSON.stringify({
            activityEventEntities: [{ UserId: 'a@x.com', ReportName: 'R', CreationTime: '2026-06-10T01:00:00Z' }],
            continuationUri: loopUri,
            lastResultSet: false,
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ value: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const svc = createPowerBIApiService({
      auth: {
        getAccessToken: vi.fn().mockResolvedValue(tokenOk()),
        getAdminAccessToken: vi.fn().mockResolvedValue({ success: true, data: { accessToken: 't', expiresOn: null } }),
      },
    });
    const result = await svc.getAdminInsights(1);
    expect(result.success).toBe(true);
    if (!result.success) return;
    // The single day looped → counted as a failed (partial) day, not infinite.
    expect(result.data.failedDays).toBe(1);
  });
});
