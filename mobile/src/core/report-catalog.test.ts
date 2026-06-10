import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveReportCatalog, fetchLatestRefresh, listAllPages } from './report-catalog';

const tokens = { getAccessToken: async () => 'tok-1' };

describe('listAllPages', () => {
  it('drains @odata.nextLink chains in order', async () => {
    const pages: Record<string, unknown> = {
      '/groups': { value: [1, 2], '@odata.nextLink': 'https://api/page2' },
      'https://api/page2': { value: [3], '@odata.nextLink': 'https://api/page3' },
      'https://api/page3': { value: [4] },
    };
    const getJson = vi.fn(async (url: string) => pages[url]);
    expect(await listAllPages<number>(getJson, '/groups')).toEqual([1, 2, 3, 4]);
    expect(getJson).toHaveBeenCalledTimes(3);
  });

  it('stops on a repeated nextLink instead of looping forever', async () => {
    const getJson = async () => ({ value: [1], '@odata.nextLink': '/same' });
    expect(await listAllPages<number>(getJson, '/same')).toEqual([1]);
  });

  it('honors the page ceiling', async () => {
    let n = 0;
    const getJson = async () => ({ value: [n], '@odata.nextLink': `/p${++n}` });
    const out = await listAllPages<number>(getJson, '/p0', 5);
    expect(out).toHaveLength(5);
  });

  it('tolerates a page without a value array', async () => {
    expect(await listAllPages(async () => ({}), '/x')).toEqual([]);
  });
});

/** fetch stub: route → body (or status number for an error). */
function stubFetch(routes: Record<string, unknown | number>) {
  const calls: string[] = [];
  const mock = vi.fn(async (url: string) => {
    calls.push(url);
    const path = url.replace('https://api.powerbi.com/v1.0/myorg', '');
    const hit = path in routes ? routes[path] : routes[url];
    if (hit === undefined) return { ok: false, status: 404, headers: new Map(), json: async () => ({}) };
    if (typeof hit === 'number') {
      return { ok: false, status: hit, headers: { get: () => null }, json: async () => ({}) };
    }
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => hit };
  });
  vi.stubGlobal('fetch', mock);
  return { mock, calls };
}

afterEach(() => vi.unstubAllGlobals());

describe('LiveReportCatalog', () => {
  it('lists apps before workspaces, carries datasetId, and pages reports', async () => {
    stubFetch({
      '/apps': { value: [{ id: 'app1', name: 'Client App' }] },
      '/groups': { value: [{ id: 'ws1', name: 'WS One' }] },
      '/apps/app1/reports': {
        value: [{ id: 'r1', name: 'Exec Summary', datasetId: 'ds-app' }],
      },
      '/groups/ws1/reports': {
        value: [{ id: 'r2', name: 'Ops', datasetId: 'ds-ws' }],
        '@odata.nextLink': 'https://api.powerbi.com/v1.0/myorg/groups/ws1/reports?skip=1',
      },
      '/groups/ws1/reports?skip=1': {
        value: [{ id: 'r3', name: 'Paginated Thing' }], // no datasetId (RDL)
      },
    });

    const catalog = new LiveReportCatalog(tokens);
    const { groups, failedSources } = await catalog.listReports();

    expect(failedSources).toEqual([]);
    expect(groups.map((g) => g.kind)).toEqual(['app', 'workspace']);
    expect(groups[0]!.name).toBe('Client App');
    expect(groups[0]!.reports[0]).toMatchObject({
      id: 'r1',
      name: 'Exec Summary',
      datasetId: 'ds-app',
      sourceKind: 'app',
      sourceName: 'Client App',
    });
    // Paging followed the nextLink: both workspace reports landed.
    expect(groups[1]!.reports.map((r) => r.id)).toEqual(['r2', 'r3']);
    expect(groups[1]!.reports[0]!.workspaceId).toBe('ws1');
    expect(groups[1]!.reports[1]!.datasetId).toBeUndefined();
  });

  it('records a failed source without blanking the rest of the list', async () => {
    stubFetch({
      '/apps': { value: [] },
      '/groups': {
        value: [
          { id: 'ok', name: 'Good WS' },
          { id: 'bad', name: 'Broken WS' },
        ],
      },
      '/groups/ok/reports': { value: [{ id: 'r1', name: 'Fine', datasetId: 'd1' }] },
      '/groups/bad/reports': 403,
    });
    const { groups, failedSources } = await new LiveReportCatalog(tokens).listReports();
    expect(groups).toHaveLength(1);
    expect(groups[0]!.name).toBe('Good WS');
    expect(failedSources).toEqual(['Broken WS']);
  });

  it('throws only when both roots are unreachable', async () => {
    stubFetch({ '/apps': 500, '/groups': 500 });
    await expect(new LiveReportCatalog(tokens).listReports()).rejects.toThrow(
      /check sign-in and network/,
    );
  });

  it('caches per session; force refetches', async () => {
    const { mock } = stubFetch({
      '/apps': { value: [] },
      '/groups': { value: [{ id: 'ws1', name: 'W' }] },
      '/groups/ws1/reports': { value: [{ id: 'r1', name: 'R', datasetId: 'd' }] },
    });
    const catalog = new LiveReportCatalog(tokens);
    await catalog.listReports();
    const afterFirst = mock.mock.calls.length;
    await catalog.listReports(); // cached
    expect(mock.mock.calls.length).toBe(afterFirst);
    await catalog.listReports(true); // pull-to-refresh
    expect(mock.mock.calls.length).toBeGreaterThan(afterFirst);
  });

  it('drops empty sources from the grouped list', async () => {
    stubFetch({
      '/apps': { value: [{ id: 'a', name: 'Empty App' }] },
      '/groups': { value: [] },
      '/apps/a/reports': { value: [] },
    });
    const { groups } = await new LiveReportCatalog(tokens).listReports();
    expect(groups).toEqual([]);
  });
});

describe('fetchLatestRefresh', () => {
  it('prefers the workspace route and returns the latest status', async () => {
    stubFetch({
      '/groups/ws1/datasets/d1/refreshes?$top=1': {
        value: [{ status: 'Completed', endTime: '2026-06-10T01:00:00Z' }],
      },
    });
    expect(await fetchLatestRefresh(tokens, 'd1', 'ws1')).toEqual({
      status: 'Completed',
      endTime: '2026-06-10T01:00:00Z',
    });
  });

  it('returns null when no route answers (callers degrade quietly)', async () => {
    stubFetch({});
    expect(await fetchLatestRefresh(tokens, 'd1', 'ws1')).toBeNull();
  });
});
