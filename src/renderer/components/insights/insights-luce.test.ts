/**
 * Pure-function coverage for the Luce Insights helpers: down-for elapsed
 * labels, failure-rate captions, dot-strip chronology, dormant detection,
 * tile filters, workspace grouping (broken first, everything collapsed),
 * and the staged unlock copy.
 */
import { describe, it, expect } from 'vitest';
import type { InsightsRefreshable } from '../../../shared/types';
import {
  downForLabel,
  dormantDownLabel,
  failureRateCaption,
  formatElapsed,
  dotStripCells,
  groupByWorkspace,
  groupSummaryLabel,
  triageSortGroups,
  workspaceSuspectCount,
  workspaceAffectedReportCount,
  cascadeReports,
  oldestSuccessIso,
  unlockStageText,
  isDown,
  isDormant,
  matchesTileFilter,
  kindDot,
  luce,
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
    expect(downForLabel(item({ lastStatus: 'Failed' }), NOW)).toBe('never succeeded');
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
  it('PARTIAL strips fill from the far LEFT, oldest→newest, hollow pads on the RIGHT (Matt #6)', () => {
    const cells = dotStripCells([{ ok: true, endTime: 't1' }, { ok: false, endTime: 't2' }]);
    expect(cells).toHaveLength(12);
    // Oldest run is the leftmost dot, newest follows it — never right-aligned.
    expect(cells[0]).toEqual({ state: 'ok', endTime: 't1' });
    expect(cells[1]).toEqual({ state: 'fail', endTime: 't2' });
    expect(cells.slice(2).every((c) => c.state === 'none')).toBe(true);
  });

  it('FULL strips stay oldest→newest left→right and keep only the newest 12', () => {
    const runs = Array.from({ length: 15 }, (_, i) => ({ ok: i !== 14, endTime: `t${i}` }));
    const cells = dotStripCells(runs);
    expect(cells).toHaveLength(12);
    expect(cells.every((c) => c.state !== 'none')).toBe(true);
    // Oldest surviving run (index 3) leftmost; the newest (failed) run rightmost.
    expect(cells[0]).toEqual({ state: 'ok', endTime: 't3' });
    expect(cells[11]).toEqual({ state: 'fail', endTime: 't14' });
  });

  it('carries errorCode/errorDetail through for failed-dot tooltips (Matt #5)', () => {
    const cells = dotStripCells([
      { ok: false, endTime: 't1', errorCode: 'ModelRefreshFailed', errorDetail: 'Credentials expired' },
    ]);
    expect(cells[0]).toEqual({
      state: 'fail',
      endTime: 't1',
      errorCode: 'ModelRefreshFailed',
      errorDetail: 'Credentials expired',
    });
  });
});

describe('isDormant / dormantDownLabel (Matt #4)', () => {
  it('flags items whose last attempt is more than 365 days old, regardless of lastStatus', () => {
    const old = new Date(NOW - 657 * 24 * 3600_000).toISOString();
    expect(isDormant(item({ lastStatus: 'Completed', lastAttemptTime: old }), NOW)).toBe(true);
    expect(isDormant(item({ lastStatus: 'Failed', lastAttemptTime: old }), NOW)).toBe(true);
  });

  it('falls back to lastSuccessTime when no attempt time is known', () => {
    const old = new Date(NOW - 400 * 24 * 3600_000).toISOString();
    expect(isDormant(item({ lastSuccessTime: old }), NOW)).toBe(true);
  });

  it('is quiet for recent items, items with no history, and unparseable times', () => {
    expect(isDormant(item({ lastAttemptTime: new Date(NOW - 364 * 24 * 3600_000).toISOString() }), NOW)).toBe(false);
    expect(isDormant(item({}), NOW)).toBe(false);
    expect(isDormant(item({ lastAttemptTime: 'not-a-date' }), NOW)).toBe(false);
  });

  it('labels dormancy in the existing down-for voice: "down 657d"', () => {
    const old = new Date(NOW - 657 * 24 * 3600_000).toISOString();
    expect(dormantDownLabel(item({ lastAttemptTime: old, lastSuccessTime: old }), NOW)).toBe('down 657d');
    expect(dormantDownLabel(item({ lastAttemptTime: old }), NOW)).toBe('never succeeded');
    expect(dormantDownLabel(item({ lastAttemptTime: new Date(NOW).toISOString() }), NOW)).toBeNull();
  });
});

describe('matchesTileFilter (Matt #2)', () => {
  it('maps each tile to its population', () => {
    const dormantOld = new Date(NOW - 400 * 24 * 3600_000).toISOString();
    expect(matchesTileFilter(item({ lastStatus: 'Failed' }), 'broken', NOW)).toBe(true);
    expect(matchesTileFilter(item({ lastStatus: 'Cancelled' }), 'broken', NOW)).toBe(true);
    expect(matchesTileFilter(item({ lastStatus: 'Completed' }), 'broken', NOW)).toBe(false);
    expect(matchesTileFilter(item({ scheduleOverdue: true }), 'overdue', NOW)).toBe(true);
    expect(matchesTileFilter(item({}), 'overdue', NOW)).toBe(false);
    expect(matchesTileFilter(item({ lastStatus: 'InProgress' }), 'running', NOW)).toBe(true);
    expect(matchesTileFilter(item({ lastStatus: 'Completed' }), 'healthy', NOW)).toBe(true);
    expect(matchesTileFilter(item({ lastStatus: 'Never' }), 'healthy', NOW)).toBe(false);
    expect(matchesTileFilter(item({ lastAttemptTime: dormantOld }), 'dormant', NOW)).toBe(true);
    expect(matchesTileFilter(item({}), 'dormant', NOW)).toBe(false);
  });
});

describe('kind dot tints (owner v3 #5: color-coded identity, no chips)', () => {
  it('uses violet for dataflows and slate for datasets — identity tints, never status hues', () => {
    expect(kindDot.dataflow).toBe('#A78BDB');
    expect(kindDot.dataset).toBe('#7E9CC9');
    // The two kinds must be distinguishable from each other…
    expect(kindDot.dataflow).not.toBe(kindDot.dataset);
    // …and may NOT borrow red/amber/green (or the chrome accent): identity
    // is not status.
    const statusHues = [luce.warn, luce.broken, luce.accent, '#3FB68B', '#E5484D', '#E8A33D'];
    expect(statusHues).not.toContain(kindDot.dataset);
    expect(statusHues).not.toContain(kindDot.dataflow);
    expect(statusHues).not.toContain(luce.dormant);
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
    const groups = groupByWorkspace(refreshables, NOW);
    expect(groups.map((g) => g.workspaceName)).toEqual([
      'Troubled Client',
      'Behind Client',
      'Calm Client',
    ]);
  });

  it('ranks dormant workspaces below overdue but above never-run and quiet ones', () => {
    const dormantTime = new Date(NOW - 657 * 24 * 3600_000).toISOString();
    const groups = groupByWorkspace(
      [
        ...refreshables,
        item({ id: 'z1', name: 'Abandoned', workspaceId: 'ws-dormant', workspaceName: 'Sleepy Client', lastAttemptTime: dormantTime }),
        item({ id: 'z2', name: 'Fresh', workspaceId: 'ws-never', workspaceName: 'New Client', lastStatus: 'Never' }),
      ],
      NOW,
    );
    expect(groups.map((g) => g.workspaceName)).toEqual([
      'Troubled Client',
      'Behind Client',
      'Sleepy Client',
      'New Client',
      'Calm Client',
    ]);
    expect(groups.find((g) => g.workspaceId === 'ws-dormant')?.counts.dormant).toBe(1);
  });

  it('sorts items in Matt #4 order: Failed, Cancelled, Overdue, Dormant, Never, Running, OK, Live', () => {
    const dormantTime = new Date(NOW - 400 * 24 * 3600_000).toISOString();
    const ws = { workspaceId: 'ws-mix', workspaceName: 'Mixed Client' };
    const groups = groupByWorkspace(
      [
        item({ ...ws, id: 'm1', name: 'Live one', lastStatus: 'Disabled' }),
        item({ ...ws, id: 'm2', name: 'OK one', lastStatus: 'Completed' }),
        item({ ...ws, id: 'm3', name: 'Running one', lastStatus: 'InProgress' }),
        item({ ...ws, id: 'm4', name: 'Never one', lastStatus: 'Never' }),
        item({ ...ws, id: 'm5', name: 'Dormant one', lastStatus: 'Completed', lastAttemptTime: dormantTime }),
        item({ ...ws, id: 'm6', name: 'Overdue one', lastStatus: 'Completed', scheduleOverdue: true }),
        item({ ...ws, id: 'm7', name: 'Cancelled one', lastStatus: 'Cancelled' }),
        item({ ...ws, id: 'm8', name: 'Failed one', lastStatus: 'Failed' }),
      ],
      NOW,
    );
    expect(groups[0]?.items.map((i) => i.name)).toEqual([
      'Failed one',
      'Cancelled one',
      'Overdue one',
      'Dormant one',
      'Never one',
      'Running one',
      'OK one',
      'Live one',
    ]);
  });

  it('sorts items worst-first inside a group, boosting overdue, and tracks the worst glyph status', () => {
    const groups = groupByWorkspace(
      [
        ...refreshables,
        item({ id: 'f', name: 'Also OK', workspaceId: 'ws-overdue', workspaceName: 'Behind Client' }),
      ],
      NOW,
    );
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

  it('builds the mini health summary, red parts first, including dormant', () => {
    const dormantTime = new Date(NOW - 500 * 24 * 3600_000).toISOString();
    const groups = groupByWorkspace(
      [
        ...refreshables,
        item({ id: 'g', name: 'Spinning', workspaceId: 'ws-broken', workspaceName: 'Troubled Client', lastStatus: 'InProgress' }),
        item({ id: 'h', name: 'Fresh', workspaceId: 'ws-broken', workspaceName: 'Troubled Client', lastStatus: 'Never' }),
        item({ id: 'i', name: 'Asleep', workspaceId: 'ws-broken', workspaceName: 'Troubled Client', lastAttemptTime: dormantTime }),
      ],
      NOW,
    );
    const broken = groups.find((g) => g.workspaceId === 'ws-broken')!;
    expect(groupSummaryLabel(broken)).toBe('1 broken · 1 dormant · 1 never run · 1 running · 2 OK');

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

describe('blast-radius derivations (DESIGN-CONTRACT §A/§B/§C)', () => {
  const groups = groupByWorkspace(
    [
      item({ id: 'a-ok', name: 'Alpha Model', workspaceId: 'ws-a', workspaceName: 'Alpha' }),
      item({ id: 'b-bad', name: 'Bravo Model', workspaceId: 'ws-b', workspaceName: 'Bravo', lastStatus: 'Failed' }),
      item({ id: 'c-sus', name: 'Charlie Model', workspaceId: 'ws-c', workspaceName: 'Charlie' }),
      item({ id: 'c-ok', name: 'Charlie Clean', workspaceId: 'ws-c', workspaceName: 'Charlie' }),
      item({ id: 'd-run', name: 'Delta Model', workspaceId: 'ws-d', workspaceName: 'Delta', lastStatus: 'InProgress' }),
      item({ id: 'e-due', name: 'Echo Model', workspaceId: 'ws-e', workspaceName: 'Echo', scheduleOverdue: true }),
    ],
    NOW,
  );
  const suspects = new Set(['c-sus']);

  it('counts a workspace\'s suspect datasets (and never dataflows)', () => {
    const charlie = groups.find((g) => g.workspaceId === 'ws-c')!;
    expect(workspaceSuspectCount(charlie, suspects)).toBe(1);
    const flowGroup = groupByWorkspace(
      [item({ id: 'c-sus', kind: 'dataflow', name: 'Flow', workspaceId: 'ws-c', workspaceName: 'Charlie' })],
      NOW,
    )[0]!;
    expect(workspaceSuspectCount(flowGroup, suspects)).toBe(0);
    expect(workspaceSuspectCount(groups.find((g) => g.workspaceId === 'ws-a')!, suspects)).toBe(0);
  });

  it('triage-sorts: broken desc → suspects desc → overdue desc → running → A–Z (§B)', () => {
    const order = triageSortGroups(groups, suspects).map((g) => g.workspaceName);
    // Bravo is broken; Charlie has NO broken flow but suspect datasets and
    // still sorts into the damage band; Echo overdue; Delta running; Alpha quiet.
    expect(order).toEqual(['Bravo', 'Charlie', 'Echo', 'Delta', 'Alpha']);
  });

  it('does not mutate the incoming group order (stable copy)', () => {
    const before = groups.map((g) => g.workspaceId);
    triageSortGroups(groups, suspects);
    expect(groups.map((g) => g.workspaceId)).toEqual(before);
  });

  it('counts DISTINCT affected reports for a workspace (§A blast line)', () => {
    const charlie = groups.find((g) => g.workspaceId === 'ws-c')!;
    const reportsByDataset = new Map([
      ['c-sus', [{ id: 'r1', name: 'Exec Daily' }, { id: 'r2', name: 'Claims' }]],
      ['c-ok', [{ id: 'r3', name: 'Unrelated' }]], // not a suspect — never counted
    ]);
    expect(workspaceAffectedReportCount(charlie, { suspectDatasetIds: suspects, reportsByDataset })).toBe(2);
    expect(
      workspaceAffectedReportCount(groups.find((g) => g.workspaceId === 'ws-a')!, {
        suspectDatasetIds: suspects,
        reportsByDataset,
      }),
    ).toBe(0);
  });

  it('dedupes cascade reports across a flow\'s suspects, preserving order (§C)', () => {
    const ds1 = item({ id: 'ds-1', name: 'One' });
    const ds2 = item({ id: 'ds-2', name: 'Two' });
    const reportsByDataset = new Map([
      ['ds-1', [{ id: 'r1', name: 'Shared' }, { id: 'r2', name: 'First Only' }]],
      ['ds-2', [{ id: 'r1', name: 'Shared' }, { id: 'r3', name: 'Second Only' }]],
    ]);
    expect(cascadeReports([ds1, ds2], reportsByDataset).map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
    expect(cascadeReports([ds1], new Map())).toEqual([]);
  });

  it('finds the OLDEST success for the hero freshness column (§A)', () => {
    expect(
      oldestSuccessIso([
        item({ lastSuccessTime: '2026-06-09T00:00:00.000Z' }),
        item({ lastSuccessTime: '2026-06-01T00:00:00.000Z' }),
        item({ lastSuccessTime: 'not-a-date' }),
        item({}),
      ]),
    ).toBe('2026-06-01T00:00:00.000Z');
    expect(oldestSuccessIso([item({})])).toBeUndefined();
  });
});
