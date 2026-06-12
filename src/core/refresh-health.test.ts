import { describe, it, expect } from 'vitest';
import {
  deriveDatasetHealth,
  deriveDataflowHealth,
  deriveScheduleInfo,
  sortWorstFirst,
  triggerLabel,
  relativeAge,
} from './refresh-health';
import type { Refreshable } from './types';

const NOW = Date.parse('2026-06-10T12:00:00Z');

describe('deriveDatasetHealth (delegates to the canonical module — src/core/refresh-health-core.ts)', () => {
  it('empty history → Never', () => {
    expect(deriveDatasetHealth([]).lastStatus).toBe('Never');
  });
  it('newest Failed keeps the earlier success and parses the error code', () => {
    const r = deriveDatasetHealth([
      { status: 'Failed', endTime: '2026-06-10T01:05:00Z', serviceExceptionJson: '{"errorCode":"CredsMissing"}' },
      { status: 'Completed', endTime: '2026-06-09T01:05:00Z' },
    ]);
    expect(r.lastStatus).toBe('Failed');
    expect(r.errorCode).toBe('CredsMissing');
    expect(r.lastSuccessTime).toBe('2026-06-09T01:05:00Z');
  });
  it('parses pbi.error-shaped payloads with no top-level errorCode (converged with the desktop parseServiceException — the old mobile port dropped these and showed a bare "Refresh failed")', () => {
    const r = deriveDatasetHealth([
      {
        status: 'Failed',
        endTime: '2026-06-10T01:05:00Z',
        serviceExceptionJson: JSON.stringify({
          'pbi.error': { code: 'Gateway_Offline', details: [{ detail: 'GW-EU-1 unreachable' }] },
        }),
      },
    ]);
    expect(r.lastStatus).toBe('Failed');
    expect(r.errorCode).toBe('Gateway_Offline');
  });
  it('Unknown without endTime → InProgress; with endTime → Completed', () => {
    expect(deriveDatasetHealth([{ status: 'Unknown', startTime: 'x' }]).lastStatus).toBe('InProgress');
    expect(deriveDatasetHealth([{ status: 'Unknown', endTime: 'x' }]).lastStatus).toBe('Completed');
  });
  it('malformed exception JSON is tolerated', () => {
    const r = deriveDatasetHealth([{ status: 'Failed', endTime: 'x', serviceExceptionJson: 'not-json{' }]);
    expect(r.lastStatus).toBe('Failed');
    expect(r.errorCode).toBeUndefined();
  });
});

describe('deriveDataflowHealth', () => {
  it('Success → Completed with last-success time', () => {
    const r = deriveDataflowHealth([
      { status: 'Success', endTime: '2026-06-10T01:10:00Z' },
      { status: 'Failed', endTime: '2026-06-09T01:10:00Z' },
    ]);
    expect(r.lastStatus).toBe('Completed');
    expect(r.lastSuccessTime).toBe('2026-06-10T01:10:00Z');
  });
  it('newest Failed keeps the earlier success', () => {
    const r = deriveDataflowHealth([
      { status: 'Failed', endTime: '2026-06-10T01:10:00Z' },
      { status: 'Success', endTime: '2026-06-09T01:10:00Z' },
    ]);
    expect(r.lastStatus).toBe('Failed');
    expect(r.lastSuccessTime).toBe('2026-06-09T01:10:00Z');
  });
});

describe('deriveScheduleInfo (overdue math)', () => {
  it('disabled or missing schedule → no fields', () => {
    expect(deriveScheduleInfo(null, undefined, NOW)).toEqual({});
    expect(deriveScheduleInfo({ enabled: false }, undefined, NOW)).toEqual({});
  });
  it('enabled with stale success → overdue, with a human summary', () => {
    const r = deriveScheduleInfo(
      { enabled: true, days: ['Monday', 'Tuesday'], times: ['06:00'] },
      '2026-05-01T06:00:00Z',
      NOW,
    );
    expect(r.scheduleSummary).toBe('Monday, Tuesday at 06:00');
    expect(r.scheduleOverdue).toBe(true);
  });
  it('enabled with a fresh success → not overdue', () => {
    const r = deriveScheduleInfo(
      { enabled: true, days: [], times: ['06:00'] },
      new Date(NOW - 2 * 3_600_000).toISOString(),
      NOW,
    );
    expect(r.scheduleOverdue).toBe(false);
    expect(r.scheduleSummary).toBe('Daily at 06:00');
  });
  it('enabled but never succeeded → overdue', () => {
    expect(deriveScheduleInfo({ enabled: true }, undefined, NOW).scheduleOverdue).toBe(true);
  });
});

describe('fleet ordering and labels', () => {
  const mk = (over: Partial<Refreshable>): Refreshable => ({
    kind: 'dataset', id: 'x', name: 'n', workspaceId: 'w', workspaceName: 'W',
    lastStatus: 'Completed', ...over,
  });
  it('sorts worst-first in the desktop board\'s Matt #4 order: Failed, Cancelled, Overdue, Never, Running, OK, Live', () => {
    const sorted = sortWorstFirst([
      mk({ id: 'ok', lastStatus: 'Completed' }),
      mk({ id: 'never', lastStatus: 'Never' }),
      mk({ id: 'bad', lastStatus: 'Failed' }),
      mk({ id: 'run', lastStatus: 'InProgress' }),
      mk({ id: 'late', lastStatus: 'Completed', scheduleOverdue: true }),
      mk({ id: 'cancel', lastStatus: 'Cancelled' }),
      mk({ id: 'live', lastStatus: 'Disabled' }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(['bad', 'cancel', 'late', 'never', 'run', 'ok', 'live']);
  });
  it('maps ViaApi to a human trigger label', () => {
    expect(triggerLabel('ViaApi')).toBe('Power Automate / API');
    expect(triggerLabel('OnDemand')).toBe('Manual');
    expect(triggerLabel(undefined)).toBe('—');
  });
  it('relativeAge renders sane buckets', () => {
    expect(relativeAge(new Date(NOW - 30_000).toISOString(), NOW)).toBe('just now');
    expect(relativeAge(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBe('5m ago');
    expect(relativeAge(new Date(NOW - 3 * 3_600_000).toISOString(), NOW)).toBe('3h ago');
    expect(relativeAge(new Date(NOW - 72 * 3_600_000).toISOString(), NOW)).toBe('3d ago');
  });
});

describe('native-visual fuel: refresh durations', () => {
  it('extracts successful-run durations oldest→newest, skipping failures', () => {
    const r = deriveDatasetHealth([
      { status: 'Completed', startTime: '2026-06-10T06:00:00Z', endTime: '2026-06-10T06:08:00Z' },
      { status: 'Failed', startTime: '2026-06-09T06:00:00Z', endTime: '2026-06-09T06:01:00Z' },
      { status: 'Completed', startTime: '2026-06-08T06:00:00Z', endTime: '2026-06-08T06:04:00Z' },
    ]);
    expect(r.recentDurationsMin).toEqual([4, 8]);
  });
  it('omits the series when no successful run has both timestamps', () => {
    expect(deriveDatasetHealth([{ status: 'Failed', endTime: 'x' }]).recentDurationsMin).toBeUndefined();
  });
});
