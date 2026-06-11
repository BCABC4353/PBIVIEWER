import { describe, it, expect } from 'vitest';
import { computeBlastRadius } from './blast-radius';
import type { InsightsRefreshable, InsightsSnapshot } from './types';


function dataset(
  id: string,
  lastStatus: InsightsRefreshable['lastStatus'],
  overrides: Partial<InsightsRefreshable> = {},
): InsightsRefreshable {
  return {
    kind: 'dataset',
    id,
    name: `Dataset ${id}`,
    workspaceId: 'ws-1',
    workspaceName: 'Sales',
    lastStatus,
    ...overrides,
  };
}

function dataflow(
  id: string,
  lastStatus: InsightsRefreshable['lastStatus'],
  overrides: Partial<InsightsRefreshable> = {},
): InsightsRefreshable {
  return {
    kind: 'dataflow',
    id,
    name: `Flow ${id}`,
    workspaceId: 'ws-1',
    workspaceName: 'Sales',
    lastStatus,
    ...overrides,
  };
}

function snapshot(
  refreshables: InsightsRefreshable[],
  reports: InsightsSnapshot['reports'] = [],
): InsightsSnapshot {
  return {
    generatedAt: '2026-06-11T00:00:00.000Z',
    fromCache: false,
    workspaceCount: 1,
    reportCount: reports.length,
    dashboardCount: 0,
    refreshables,
    reports,
    access: [],
    partialFailure: false,
    failedWorkspaces: [],
  };
}

const T1 = '2026-06-10T01:00:00.000Z';
const T2 = '2026-06-10T02:00:00.000Z';

describe('computeBlastRadius — cascade rule v1', () => {
  it('marks a Completed dataset suspect when an upstream dataflow Failed', () => {
    const ds = dataset('ds-1', 'Completed', {
      lastSuccessTime: T1,
      upstreamDataflowIds: ['df-1'],
    });
    const result = computeBlastRadius(
      snapshot([dataflow('df-1', 'Failed', { lastSuccessTime: T1 }), ds]),
    );
    expect(result.suspectDatasetIds).toEqual(new Set(['ds-1']));
    expect(result.suspectsByDataflow.get('df-1')).toEqual([ds]);
  });

  it('owner v6 — flow-then-dataset timing is the HAPPY PATH: timing alone NEVER implicates', () => {
    const ds = dataset('ds-1', 'Completed', {
      lastSuccessTime: T2,
      upstreamDataflowIds: ['df-1'],
    });
    const result = computeBlastRadius(
      snapshot([dataflow('df-1', 'Completed', { lastSuccessTime: T1 }), ds]),
    );
    expect(result.suspectDatasetIds.size).toBe(0);
    expect(result.suspectsByDataflow.size).toBe(0);
  });

  it('keeps a healthy chain empty (flow succeeded AFTER the dataset refreshed)', () => {
    const result = computeBlastRadius(
      snapshot([
        dataflow('df-1', 'Completed', { lastSuccessTime: T2 }),
        dataset('ds-1', 'Completed', { lastSuccessTime: T1, upstreamDataflowIds: ['df-1'] }),
      ]),
    );
    expect(result.suspectDatasetIds.size).toBe(0);
    expect(result.suspectsByDataflow.size).toBe(0);
    expect(result.reportsByDataset.size).toBe(0);
  });

  it('never suspects a dataset whose own lastStatus is not Completed — even under a Failed flow', () => {
    const result = computeBlastRadius(
      snapshot([
        dataflow('df-1', 'Failed'),
        dataset('ds-failed', 'Failed', { upstreamDataflowIds: ['df-1'] }),
        dataset('ds-running', 'InProgress', { upstreamDataflowIds: ['df-1'] }),
        dataset('ds-disabled', 'Disabled', { upstreamDataflowIds: ['df-1'] }),
        dataset('ds-never', 'Never', { upstreamDataflowIds: ['df-1'] }),
        dataset('ds-cancelled', 'Cancelled', { upstreamDataflowIds: ['df-1'] }),
      ]),
    );
    expect(result.suspectDatasetIds.size).toBe(0);
    expect(result.suspectsByDataflow.size).toBe(0);
  });

  it('ignores datasets with no upstream lineage (absent field and empty list)', () => {
    const result = computeBlastRadius(
      snapshot([
        dataflow('df-1', 'Failed'),
        dataset('ds-unknown', 'Completed', { lastSuccessTime: T2 }),
        dataset('ds-none', 'Completed', { lastSuccessTime: T2, upstreamDataflowIds: [] }),
      ]),
    );
    expect(result.suspectDatasetIds.size).toBe(0);
  });

  it('does NOT suspect on staleness when either lastSuccessTime is missing', () => {
    const result = computeBlastRadius(
      snapshot([
        dataflow('df-no-time', 'Completed'),
        dataset('ds-1', 'Completed', { lastSuccessTime: T2, upstreamDataflowIds: ['df-no-time'] }),
        dataflow('df-2', 'Completed', { lastSuccessTime: T1 }),
        dataset('ds-2', 'Completed', { upstreamDataflowIds: ['df-2'] }),
      ]),
    );
    expect(result.suspectDatasetIds.size).toBe(0);
  });

  it('does NOT suspect when flow and dataset succeeded at the SAME instant (strictly older required)', () => {
    const result = computeBlastRadius(
      snapshot([
        dataflow('df-1', 'Completed', { lastSuccessTime: T1 }),
        dataset('ds-1', 'Completed', { lastSuccessTime: T1, upstreamDataflowIds: ['df-1'] }),
      ]),
    );
    expect(result.suspectDatasetIds.size).toBe(0);
  });

  it('a Failed flow implicates even when timestamps are missing on both sides', () => {
    const result = computeBlastRadius(
      snapshot([
        dataflow('df-1', 'Failed'),
        dataset('ds-1', 'Completed', { upstreamDataflowIds: ['df-1'] }),
      ]),
    );
    expect(result.suspectDatasetIds.has('ds-1')).toBe(true);
  });

  it('ignores lineage pointing at a dataflow the snapshot cannot see', () => {
    const result = computeBlastRadius(
      snapshot([
        dataset('ds-1', 'Completed', { lastSuccessTime: T2, upstreamDataflowIds: ['df-ghost'] }),
      ]),
    );
    expect(result.suspectDatasetIds.size).toBe(0);
    expect(result.suspectsByDataflow.size).toBe(0);
  });

  it('multi-flow dataset: listed under EACH implicating flow, absent under the healthy one', () => {
    const ds = dataset('ds-1', 'Completed', {
      lastSuccessTime: T2,
      upstreamDataflowIds: ['df-failed', 'df-stale', 'df-healthy'],
    });
    const result = computeBlastRadius(
      snapshot([
        dataflow('df-failed', 'Failed'),
        dataflow('df-stale', 'Completed', { lastSuccessTime: T1 }),
        dataflow('df-healthy', 'Completed', { lastSuccessTime: '2026-06-10T03:00:00.000Z' }),
        ds,
      ]),
    );
    expect(result.suspectsByDataflow.get('df-failed')).toEqual([ds]);
    expect(result.suspectsByDataflow.has('df-stale')).toBe(false);
    expect(result.suspectsByDataflow.has('df-healthy')).toBe(false);
    expect(result.suspectDatasetIds).toEqual(new Set(['ds-1']));
  });

  it('one failed flow collects ALL its downstream Completed datasets', () => {
    const dsA = dataset('ds-a', 'Completed', { upstreamDataflowIds: ['df-1'] });
    const dsB = dataset('ds-b', 'Completed', { upstreamDataflowIds: ['df-1'] });
    const result = computeBlastRadius(snapshot([dataflow('df-1', 'Failed'), dsA, dsB]));
    expect(result.suspectsByDataflow.get('df-1')).toEqual([dsA, dsB]);
    expect(result.suspectDatasetIds).toEqual(new Set(['ds-a', 'ds-b']));
  });

  it('matches lineage ids to dataflows case-insensitively but keys by the canonical id', () => {
    const ds = dataset('ds-1', 'Completed', {
      upstreamDataflowIds: ['DF-ABC'],
    });
    const result = computeBlastRadius(snapshot([dataflow('df-abc', 'Failed'), ds]));
    expect(result.suspectsByDataflow.get('df-abc')).toEqual([ds]);
    expect(result.suspectsByDataflow.has('DF-ABC')).toBe(false);
  });

  it('lists a dataset only ONCE per flow when lineage carries duplicate ids (case variants)', () => {
    const ds = dataset('ds-1', 'Completed', {
      upstreamDataflowIds: ['df-1', 'DF-1'],
    });
    const result = computeBlastRadius(snapshot([dataflow('df-1', 'Failed'), ds]));
    expect(result.suspectsByDataflow.get('df-1')).toEqual([ds]);
    expect(result.suspectsByDataflow.size).toBe(1);
  });

  it('maps reports ONLY for suspect datasets — and groups them by dataset', () => {
    const result = computeBlastRadius(
      snapshot(
        [
          dataflow('df-1', 'Failed'),
          dataset('ds-bad', 'Completed', { upstreamDataflowIds: ['df-1'] }),
          dataset('ds-ok', 'Completed', { lastSuccessTime: T1 }),
        ],
        [
          { id: 'r-1', name: 'Sales Daily', workspaceId: 'ws-1', datasetId: 'ds-bad' },
          { id: 'r-2', name: 'Sales Weekly', workspaceId: 'ws-1', datasetId: 'ds-bad' },
          { id: 'r-3', name: 'Healthy Report', workspaceId: 'ws-1', datasetId: 'ds-ok' },
          { id: 'r-4', name: 'Unbound Paginated', workspaceId: 'ws-1' },
        ],
      ),
    );
    expect(result.reportsByDataset.get('ds-bad')).toEqual([
      { id: 'r-1', name: 'Sales Daily' },
      { id: 'r-2', name: 'Sales Weekly' },
    ]);
    expect(result.reportsByDataset.has('ds-ok')).toBe(false);
    expect(result.reportsByDataset.size).toBe(1);
  });

  it('tolerates a legacy snapshot shape that lacks the reports array entirely', () => {
    const legacy = snapshot([
      dataflow('df-1', 'Failed'),
      dataset('ds-1', 'Completed', { upstreamDataflowIds: ['df-1'] }),
    ]) as Partial<InsightsSnapshot>;
    delete legacy.reports;
    const result = computeBlastRadius(legacy as InsightsSnapshot);
    expect(result.suspectDatasetIds.has('ds-1')).toBe(true);
    expect(result.reportsByDataset.size).toBe(0);
  });

  it('returns all-empty structures for an empty snapshot', () => {
    const result = computeBlastRadius(snapshot([]));
    expect(result.suspectsByDataflow.size).toBe(0);
    expect(result.reportsByDataset.size).toBe(0);
    expect(result.suspectDatasetIds.size).toBe(0);
  });
});
