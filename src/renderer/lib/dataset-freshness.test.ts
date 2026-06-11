import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getDatasetFreshness,
  clearDatasetFreshnessCache,
  describeFreshness,
} from './dataset-freshness';
import type { DatasetRefreshInfo, IPCResponse } from '../../shared/types';

const HOUR_MS = 60 * 60 * 1000;

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('getDatasetFreshness', () => {
  beforeEach(() => {
    clearDatasetFreshnessCache();
  });

  it('returns the refresh info and caches it per dataset', async () => {
    const mock = vi.mocked(window.electronAPI.content.getDatasetRefreshInfo);
    mock.mockResolvedValue({
      success: true,
      data: { lastRefreshTime: '2026-06-11T00:00:00Z', lastRefreshStatus: 'Completed' },
    });

    const first = await getDatasetFreshness('ds-1', 'ws-1');
    const second = await getDatasetFreshness('ds-1', 'ws-1');

    expect(first?.lastRefreshTime).toBe('2026-06-11T00:00:00Z');
    expect(second).toEqual(first);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent requests for the same dataset', async () => {
    const mock = vi.mocked(window.electronAPI.content.getDatasetRefreshInfo);
    let release!: (value: IPCResponse<DatasetRefreshInfo>) => void;
    mock.mockImplementation(
      () => new Promise<IPCResponse<DatasetRefreshInfo>>((resolve) => (release = resolve)),
    );

    const a = getDatasetFreshness('ds-1', 'ws-1');
    const b = getDatasetFreshness('ds-1', 'ws-1');
    await flush();
    release({ success: true, data: {} });

    await Promise.all([a, b]);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('keeps at most 3 lookups in flight', async () => {
    const mock = vi.mocked(window.electronAPI.content.getDatasetRefreshInfo);
    const resolvers: Array<(value: IPCResponse<DatasetRefreshInfo>) => void> = [];
    mock.mockImplementation(
      () =>
        new Promise<IPCResponse<DatasetRefreshInfo>>((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const tasks = ['ds-1', 'ds-2', 'ds-3', 'ds-4', 'ds-5'].map((id) =>
      getDatasetFreshness(id, 'ws-1'),
    );
    await flush();
    expect(mock).toHaveBeenCalledTimes(3);

    resolvers[0]!({ success: true, data: {} });
    await flush();
    expect(mock).toHaveBeenCalledTimes(4);

    for (const resolve of resolvers.slice(1)) resolve({ success: true, data: {} });
    await flush();
    for (const resolve of resolvers.slice(4)) resolve({ success: true, data: {} });
    await Promise.all(tasks);
    expect(mock).toHaveBeenCalledTimes(5);
  });

  it('returns null for failed lookups without caching the failure', async () => {
    const mock = vi.mocked(window.electronAPI.content.getDatasetRefreshInfo);
    mock.mockResolvedValue({
      success: false,
      error: { code: 'REFRESH_INFO_FAILED', message: 'nope' },
    });

    expect(await getDatasetFreshness('ds-1', 'ws-1')).toBeNull();
    expect(await getDatasetFreshness('ds-1', 'ws-1')).toBeNull();
    expect(mock).toHaveBeenCalledTimes(2);
  });
});

describe('describeFreshness', () => {
  const NOW = Date.parse('2026-06-11T12:00:00.000Z');

  it('returns null when there is no usable timestamp', () => {
    expect(describeFreshness(undefined, NOW)).toBeNull();
    expect(describeFreshness('not-a-date', NOW)).toBeNull();
  });

  it('labels a recent refresh and does not mark it stale', () => {
    const desc = describeFreshness(new Date(NOW - 4 * HOUR_MS).toISOString(), NOW);
    expect(desc).toEqual({ ageLabel: '4 hours', isStale: false });
  });

  it('marks data older than 24h as stale', () => {
    const desc = describeFreshness(new Date(NOW - 26 * HOUR_MS).toISOString(), NOW);
    expect(desc).toEqual({ ageLabel: '26 hours', isStale: true });
  });
});
