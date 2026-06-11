import { describe, it, expect, vi } from 'vitest';
import { PowerBIFreshnessApi, type FreshnessPort } from './freshness';

const HOUR_MS = 60 * 60 * 1000;

function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

function everyThirtyMinutes(): { enabled: boolean; days: string[]; times: string[] } {
  const times: string[] = [];
  for (let h = 0; h < 24; h++) {
    times.push(`${String(h).padStart(2, '0')}:00`, `${String(h).padStart(2, '0')}:30`);
  }
  return { enabled: true, days: [], times };
}

interface PortOptions {
  refreshEndTime?: string;
  schedule?: unknown | (() => unknown);
  getCacheEpoch?: () => number;
}

function makeApi(opts: PortOptions = {}): {
  api: PowerBIFreshnessApi;
  request: ReturnType<typeof vi.fn>;
  scheduleCalls: () => number;
} {
  const request = vi.fn(async (endpoint: string): Promise<unknown> => {
    if (endpoint.includes('/refreshSchedule')) {
      const s = opts.schedule;
      if (typeof s === 'function') return (s as () => unknown)();
      if (s === undefined) throw new Error('schedule endpoint not stubbed');
      return s;
    }
    if (endpoint.includes('/refreshes')) {
      if (!opts.refreshEndTime) return { value: [] };
      return {
        value: [
          {
            status: 'Completed',
            startTime: opts.refreshEndTime,
            endTime: opts.refreshEndTime,
            refreshType: 'Scheduled',
          },
        ],
      };
    }
    return { value: [] };
  });

  const port: FreshnessPort = {
    request: request as unknown as FreshnessPort['request'],
    getApp: vi.fn(async () => ({
      success: false as const,
      error: { code: 'NOT_STUBBED', message: 'not stubbed' },
    })),
    getCacheEpoch: opts.getCacheEpoch ?? (() => 0),
  };

  return {
    api: new PowerBIFreshnessApi(port),
    request,
    scheduleCalls: () =>
      request.mock.calls.filter((c) => String(c[0]).includes('/refreshSchedule')).length,
  };
}

describe('PowerBIFreshnessApi schedule-aware getDataFreshness', () => {
  it('flags a single dataset as behind schedule when it trails its cadence but is under 24h old', async () => {
    const { api } = makeApi({
      refreshEndTime: isoAgo(8 * HOUR_MS),
      schedule: everyThirtyMinutes(),
    });

    const result = await api.getDataFreshness('ws-1', ['ds-1']);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.datasetCount).toBe(1);
      expect(result.data.scheduleOverdue).toBe(true);
      expect(result.data.scheduleSummary).toContain('Daily at');
    }
  });

  it('reports an on-cadence dataset as not overdue', async () => {
    const { api } = makeApi({
      refreshEndTime: isoAgo(10 * 60 * 1000),
      schedule: { enabled: true, days: [], times: ['06:00'] },
    });

    const result = await api.getDataFreshness('ws-1', ['ds-1']);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scheduleOverdue).toBe(false);
      expect(result.data.scheduleSummary).toBe('Daily at 06:00');
    }
  });

  it('does not fetch schedules for multi-dataset aggregates', async () => {
    const { api, scheduleCalls } = makeApi({ refreshEndTime: isoAgo(HOUR_MS) });

    const result = await api.getDataFreshness('ws-1', ['ds-1', 'ds-2']);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scheduleOverdue).toBeUndefined();
      expect(result.data.scheduleSummary).toBeUndefined();
    }
    expect(scheduleCalls()).toBe(0);
  });

  it('degrades silently when the schedule call fails', async () => {
    const { api } = makeApi({
      refreshEndTime: isoAgo(HOUR_MS),
      schedule: () => {
        throw new Error('boom');
      },
    });

    const result = await api.getDataFreshness('ws-1', ['ds-1']);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.datasetRefreshTime).not.toBeNull();
      expect(result.data.scheduleOverdue).toBeUndefined();
      expect(result.data.scheduleSummary).toBeUndefined();
    }
  });

  it('caches the schedule lookup across calls', async () => {
    const { api, scheduleCalls } = makeApi({
      refreshEndTime: isoAgo(HOUR_MS),
      schedule: { enabled: true, days: [], times: ['06:00'] },
    });

    await api.getDataFreshness('ws-1', ['ds-1']);
    await api.getDataFreshness('ws-1', ['ds-1']);
    expect(scheduleCalls()).toBe(1);
  });

  it('refetches the schedule after clearCaches()', async () => {
    const { api, scheduleCalls } = makeApi({
      refreshEndTime: isoAgo(HOUR_MS),
      schedule: { enabled: true, days: [], times: ['06:00'] },
    });

    await api.getDataFreshness('ws-1', ['ds-1']);
    api.clearCaches();
    await api.getDataFreshness('ws-1', ['ds-1']);
    expect(scheduleCalls()).toBe(2);
  });

  it('does not cache a schedule fetched while the cache epoch advanced', async () => {
    let epoch = 0;
    const { api, scheduleCalls } = makeApi({
      refreshEndTime: isoAgo(HOUR_MS),
      schedule: () => {
        epoch++;
        return { enabled: true, days: [], times: ['06:00'] };
      },
      getCacheEpoch: () => epoch,
    });

    await api.getDataFreshness('ws-1', ['ds-1']);
    await api.getDataFreshness('ws-1', ['ds-1']);
    expect(scheduleCalls()).toBe(2);
  });
});
