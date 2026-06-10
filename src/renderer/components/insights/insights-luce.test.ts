/**
 * Pure-function coverage for the Luce Insights helpers: down-for elapsed
 * labels, failure-rate captions, dot-strip padding, workspace grouping
 * (broken first, sane defaults), and the staged unlock copy.
 */
import { describe, it, expect } from 'vitest';
import type { InsightsRefreshable } from '../../../shared/types';
import {
  downForLabel,
  failureRateCaption,
  formatElapsed,
  dotStripCells,
  groupByWorkspace,
  groupSummaryLabel,
  unlockStageText,
  isDown,
} from './insights-luce';

const NOW = Date.parse('2026-06-10T12:00:00.000Z');

function item(overrides: Partial<InsightsRefreshable>): InsightsRefreshable {
  return {
    kind: 'dataset',
    id: 'ds-1',
    name: 'Model',
    workspaceId: 'ws-1',
    workspaceName: 'Sales',
    lastStatus: 'Completed',
    ...overrides,
  };
}

describe('downForLabel', () => {
  it('returns "down 26h" for a Failed item with a 26h-old last success', () => {
    const r = item({
      lastStatus: 'Failed',
      lastSuccessTime: new Date(NOW - 26 * 3600_000).toISOString(),
    });
    expect(downForLabel(r, NOW)).toBe('down 26h');
  });

  it('uses minutes under an hour and days from 48h up', () => {
    expect(
      downForLabel(item({ lastStatus: 'Cancelled', lastSuccessTime: new Date(NOW - 45 * 60_000).toISOString() }), NOW),
    ).toBe('down 45m');
    expect(
      downForLabel(item({ lastStatus: 'Failed', lastSuccessTime: new Date(NOW - 72 * 3600_000).toISOString() }), NOW),
    ).toBe('down 3d');
  });

  it('covers Overdue items even when the last attempt completed', () => {
    const r = item({
      lastStatus: 'Completed',
      scheduleOverdue: true,
      lastSuccessTime: new Date(NOW - 50 * 3600_000).toISOString(),
    });
    expect(isDown(r)).toBe(true);
    expect(downForLabel(r, NOW)).toBe('down 2d');
  });

  it('reports a never-succeeded broken item honestly', () => {
    expect(downForLabel(item({ lastStatus: 'Failed' }), NOW)).toBe('down — never succeeded');
  });

  it('returns null for healthy items and for unparseable/future success times', () => {
    expect(downForLabel(item({ lastStatus: 'Completed', lastSuccessTime: '2026-06-10T11:00:00Z' }), NOW)).toBeNull();
    expect(downForLabel(item({ lastStatus: 'Failed', lastSuccessTime: 'not-a-date' }), NOW)).toBeNull();
    expect(
      downForLabel(item({ lastStatus: 'Failed', lastSuccessTime: new Date(NOW + 3600_000).toISOString() }), NOW),
    ).toBeNull();
  });
});

describe('formatElapsed', () => {
  it('clamps tiny values to 0m', () => {
    expect(formatElapsed(5_000)).toBe('0m');
  });
});

describe('failureRateCaption', () => {
  it('is quiet (null) for empty, missing, or all-ok histories', () => {
    expect(failureRateCaption(undefined)).toBeNull();
    expect(failureRateCaption([])).toBeNull();
    expect(failureRateCaption([{ ok: true }, { ok: true }])).toBeNull();
  });

  it('reports "3 of last 12 runs failed"', () => {
    const runs = Array.from({ length: 12 }, (_, i) => ({ ok: i % 4 !== 0 }));
    expect(failureRateCaption(runs)).toBe('3 of last 12 runs failed');
  });
});

describe('dotStripCells', () => {
  it('pads short histories on the OLD side so the newest run is rightmost', () => {
    const cells = dotStripCells([{ ok: true, endTime: 't1' }, { ok: false, endTime: 't2' }]);
    expect(cells).toHaveLength(12);
    expect(cells.slice(0, 10).every((c) => c.state === 'none')).toBe(true);
    expect(cells[10]).toEqual({ state: 'ok', endTime: 't1' });
    expect(cells[11]).toEqual({ state: 'fail', endTime: 't2' });
  });

  it('keeps only the newest 12 of a longer history', () => {
    const runs = Array.from({ length: 15 }, (_, i) => ({ ok: i >= 3 }));
    const cells = dotStripCells(runs);
    expect(cells).toHaveLength(12);
    expect(cells.every((c) => c.state === 'ok')).toBe(true);
  });
});

describe('groupByWorkspace', () => {
  const refreshables: InsightsRefreshable[] = [
    item({ id: 'a', name: 'Zeta OK', workspaceId: 'ws-healthy', workspaceName: 'Calm Client' }),
    item({ id: 'b', name: 'Alpha OK', workspaceId: 'ws-healthy', workspaceName: 'Calm Client' }),
    item({ id: 'c', name: 'OK model', workspaceId: 'ws-broken', workspaceName: 'Troubled Client' }),
    item({ id: 'd', name: 'Dead model', workspaceId: 'ws-broken', workspaceName: 'Troubled Client', lastStatus: 'Failed' }),
    item({
      id: 'e',
      name: 'Stale model',
      workspaceId: 'ws-overdue',
      workspaceName: 'Behind Client',
      lastStatus: 'Completed',
      scheduleOverdue: true,
    }),
  ];

  it('sorts broken workspaces first, then overdue, then healthy', () => {
    const groups = groupByWorkspace(refreshables);
    expect(groups.map((g) => g.workspaceName)).toEqual([
      'Troubled Client',
      'Behind Client',
      'Calm Client',
    ]);
  });

  it('auto-expands troubled groups and collapses all-healthy ones', () => {
    const groups = groupByWorkspace(refreshables);
    expect(groups.find((g) => g.workspaceId === 'ws-broken')?.defaultExpanded).toBe(true);
    expect(groups.find((g) => g.workspaceId === 'ws-overdue')?.defaultExpanded).toBe(true);
    expect(groups.find((g) => g.workspaceId === 'ws-healthy')?.defaultExpanded).toBe(false);
  });

  it('sorts items worst-first inside a group, boosting overdue, and tracks the worst glyph status', () => {
    const groups = groupByWorkspace([
      ...refreshables,
      item({ id: 'f', name: 'Also OK', workspaceId: 'ws-overdue', workspaceName: 'Behind Client' }),
    ]);
    const broken = groups.find((g) => g.workspaceId === 'ws-broken')!;
    expect(broken.items.map((i) => i.name)).toEqual(['Dead model', 'OK model']);
    expect(broken.worst).toBe('Failed');

    const overdue = groups.find((g) => g.workspaceId === 'ws-overdue')!;
    expect(overdue.items[0]?.name).toBe('Stale model');

    const healthy = groups.find((g) => g.workspaceId === 'ws-healthy')!;
    // Equal rank → alphabetical.
    expect(healthy.items.map((i) => i.name)).toEqual(['Alpha OK', 'Zeta OK']);
    expect(healthy.worst).toBe('Completed');
  });

  it('builds the mini health summary, red parts first', () => {
    const groups = groupByWorkspace([
      ...refreshables,
      item({ id: 'g', name: 'Spinning', workspaceId: 'ws-broken', workspaceName: 'Troubled Client', lastStatus: 'InProgress' }),
      item({ id: 'h', name: 'Fresh', workspaceId: 'ws-broken', workspaceName: 'Troubled Client', lastStatus: 'Never' }),
    ]);
    const broken = groups.find((g) => g.workspaceId === 'ws-broken')!;
    expect(groupSummaryLabel(broken)).toBe('1 broken · 1 never run · 1 running · 1 OK');

    const healthy = groups.find((g) => g.workspaceId === 'ws-healthy')!;
    expect(groupSummaryLabel(healthy)).toBe('2 OK');
  });
});

describe('unlockStageText', () => {
  it('stages the honest copy at 0s / 10s / 30s', () => {
    expect(unlockStageText(0)).toBe('Opening Microsoft consent…');
    expect(unlockStageText(9_999)).toBe('Opening Microsoft consent…');
    expect(unlockStageText(10_000)).toBe('Reading App audiences…');
    expect(unlockStageText(29_999)).toBe('Reading App audiences…');
    expect(unlockStageText(30_000)).toBe(
      'Crunching activity log — large tenants can take a couple minutes…',
    );
  });
});
