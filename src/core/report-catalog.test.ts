import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LiveReportCatalog,
  defaultExpandedKeys,
  fetchLatestRefresh,
  filterCatalogGroups,
  groupKey,
  listAllPages,
  sortCatalogGroups,
  type ReportGroup,
  type ReportRef,
} from './report-catalog';

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
        value: [{ id: 'r3', name: 'Paginated Thing' }],
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
    await catalog.listReports();
    expect(mock.mock.calls.length).toBe(afterFirst);
    await catalog.listReports(true);
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


const ref = (name: string, group: Pick<ReportGroup, 'kind' | 'id' | 'name'>): ReportRef => ({
  id: `id-${name}`,
  name,
  sourceKind: group.kind,
  sourceId: group.id,
  sourceName: group.name,
});

const group = (kind: 'app' | 'workspace', id: string, name: string, reports: string[]): ReportGroup => {
  const g = { kind, id, name };
  return { ...g, reports: reports.map((r) => ref(r, g)) };
};

describe('sortCatalogGroups', () => {
  it('orders apps first (alphabetical), then workspaces (alphabetical)', () => {
    const sorted = sortCatalogGroups([
      group('workspace', 'w2', 'zeta Ops', ['R']),
      group('app', 'a2', 'finance App', ['R']),
      group('workspace', 'w1', 'Alpha Ops', ['R']),
      group('app', 'a1', 'Exec App', ['R']),
    ]);
    expect(sorted.map((g) => `${g.kind}:${g.name}`)).toEqual([
      'app:Exec App',
      'app:finance App',
      'workspace:Alpha Ops',
      'workspace:zeta Ops',
    ]);
  });

  it('sorts reports alphabetically within a section, case-insensitively', () => {
    const sorted = sortCatalogGroups([
      group('app', 'a', 'App', ['zebra Margin', 'Alpha Sales', 'beta Costs', 'Beta Budget']),
    ]);
    expect(sorted[0]!.reports.map((r) => r.name)).toEqual([
      'Alpha Sales',
      'Beta Budget',
      'beta Costs',
      'zebra Margin',
    ]);
  });

  it('does not mutate the input', () => {
    const input = [group('workspace', 'w', 'W', ['b', 'a'])];
    const before = JSON.stringify(input);
    sortCatalogGroups(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('filterCatalogGroups', () => {
  const groups = [
    group('app', 'a', 'Finance App', ['Revenue', 'Margin']),
    group('workspace', 'w1', 'Operations', ['Throughput', 'Revenue by Site']),
    group('workspace', 'w2', 'HR', ['Headcount']),
  ];

  it('matches report names across all sections (case-insensitive)', () => {
    const hit = filterCatalogGroups(groups, 'revenue');
    expect(hit.map((g) => g.name)).toEqual(['Finance App', 'Operations']);
    expect(hit[0]!.reports.map((r) => r.name)).toEqual(['Revenue']);
    expect(hit[1]!.reports.map((r) => r.name)).toEqual(['Revenue by Site']);
  });

  it('a section-name match keeps the whole section', () => {
    const hit = filterCatalogGroups(groups, 'operations');
    expect(hit).toHaveLength(1);
    expect(hit[0]!.reports).toHaveLength(2);
  });

  it('empty or whitespace query filters nothing', () => {
    expect(filterCatalogGroups(groups, '')).toHaveLength(3);
    expect(filterCatalogGroups(groups, '   ')).toHaveLength(3);
  });

  it('no match → empty list (the screen shows its honest empty state)', () => {
    expect(filterCatalogGroups(groups, 'xyzzy')).toEqual([]);
  });
});

describe('defaultExpandedKeys', () => {
  it('expands everything when there are ≤3 sections', () => {
    const groups = [
      group('app', 'a', 'A', ['r']),
      group('workspace', 'w', 'W', ['r']),
    ];
    expect(defaultExpandedKeys(groups)).toEqual(new Set(['app-a', 'workspace-w']));
  });

  it('collapses everything when there are more than 3 sections', () => {
    const groups = ['a', 'b', 'c', 'd'].map((id) => group('workspace', id, id, ['r']));
    expect(defaultExpandedKeys(groups).size).toBe(0);
  });

  it('keys are kind-qualified so app/workspace id collisions cannot cross-toggle', () => {
    expect(groupKey({ kind: 'app', id: 'x' })).not.toBe(groupKey({ kind: 'workspace', id: 'x' }));
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

  it('falls through to the dataset route when the workspace route answers with no entries', async () => {
    const { calls } = stubFetch({
      '/groups/ws1/datasets/d1/refreshes?$top=1': { value: [] },
      '/datasets/d1/refreshes?$top=1': {
        value: [{ status: 'Failed', endTime: '2026-06-11T05:00:00Z' }],
      },
    });
    expect(await fetchLatestRefresh(tokens, 'd1', 'ws1')).toEqual({
      status: 'Failed',
      endTime: '2026-06-11T05:00:00Z',
    });
    expect(calls).toHaveLength(2);
  });

  it('returns null when every route answers but none has a usable entry', async () => {
    stubFetch({
      '/groups/ws1/datasets/d1/refreshes?$top=1': { value: [] },
      '/datasets/d1/refreshes?$top=1': { value: [{}] },
    });
    expect(await fetchLatestRefresh(tokens, 'd1', 'ws1')).toBeNull();
  });
});

import { pickDatasetIdFromReports } from './report-catalog';

describe('pickDatasetIdFromReports', () => {
  const reports = [
    { id: 'r-1', name: 'BELL - DASHBOARD', datasetId: 'ds-1' },
    { id: 'r-2', name: 'BELL - KPI', datasetId: 'ds-2' },
    { id: 'r-3', name: 'BELL - PAGINATED' },
  ];

  it('matches by original report id first', () => {
    expect(pickDatasetIdFromReports(reports, 'r-2', 'WRONG NAME')).toBe('ds-2');
  });

  it('falls back to a case-insensitive name match', () => {
    expect(pickDatasetIdFromReports(reports, 'missing-id', 'bell - dashboard')).toBe('ds-1');
    expect(pickDatasetIdFromReports(reports, undefined, 'BELL - kpi')).toBe('ds-2');
  });

  it('id match without a datasetId still falls through to the name match', () => {
    expect(pickDatasetIdFromReports(reports, 'r-3', 'BELL - KPI')).toBe('ds-2');
  });

  it('returns undefined when nothing matches or the match has no dataset', () => {
    expect(pickDatasetIdFromReports(reports, 'nope', 'ALSO NOPE')).toBeUndefined();
    expect(pickDatasetIdFromReports(reports, 'r-3', 'BELL - PAGINATED')).toBeUndefined();
    expect(pickDatasetIdFromReports([], 'r-1', 'BELL - DASHBOARD')).toBeUndefined();
  });
});
