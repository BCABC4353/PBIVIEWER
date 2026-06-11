import { describe, it, expect } from 'vitest';
import {
  groupFleetByWorkspace,
  itemSeverity,
  sheetSections,
  tileCountsLine,
} from './workspace-tiles';
import type { Refreshable } from './types';

function make(over: Partial<Refreshable>): Refreshable {
  return {
    kind: 'dataset',
    id: 'id',
    name: 'Item',
    workspaceId: 'w1',
    workspaceName: 'Workspace One',
    lastStatus: 'Completed',
    ...over,
  };
}

describe('itemSeverity (red is sacred)', () => {
  it('Failed → broken; only Failed is ever broken', () => {
    expect(itemSeverity(make({ lastStatus: 'Failed' }))).toBe('broken');
    expect(itemSeverity(make({ lastStatus: 'Cancelled' }))).not.toBe('broken');
    expect(itemSeverity(make({ lastStatus: 'Completed', scheduleOverdue: true }))).not.toBe('broken');
  });
  it('Cancelled / Never / overdue → attention (the amber band)', () => {
    expect(itemSeverity(make({ lastStatus: 'Cancelled' }))).toBe('attention');
    expect(itemSeverity(make({ lastStatus: 'Never' }))).toBe('attention');
    expect(itemSeverity(make({ lastStatus: 'Completed', scheduleOverdue: true }))).toBe('attention');
  });
  it('healthy, running, and live stay quiet', () => {
    expect(itemSeverity(make({ lastStatus: 'Completed' }))).toBe('quiet');
    expect(itemSeverity(make({ lastStatus: 'InProgress' }))).toBe('quiet');
    expect(itemSeverity(make({ lastStatus: 'Disabled' }))).toBe('quiet');
  });
});

describe('groupFleetByWorkspace', () => {
  const fleet: Refreshable[] = [
    make({ id: 'a', name: 'Healthy A', workspaceId: 'calm', workspaceName: 'Calm', lastStatus: 'Completed' }),
    make({ id: 'b', name: 'Late B', workspaceId: 'late', workspaceName: 'Late', scheduleOverdue: true }),
    make({ id: 'c', name: 'Broken C', workspaceId: 'fire', workspaceName: 'Fire', lastStatus: 'Failed' }),
    make({ id: 'd', name: 'Fine D', workspaceId: 'fire', workspaceName: 'Fire', kind: 'dataflow' }),
    make({ id: 'e', name: 'Fine E', workspaceId: 'calm', workspaceName: 'Calm', kind: 'dataflow' }),
  ];

  it('one tile per workspace, every item kept', () => {
    const tiles = groupFleetByWorkspace(fleet);
    expect(tiles).toHaveLength(3);
    expect(tiles.reduce((n, t) => n + t.items.length, 0)).toBe(fleet.length);
  });

  it('tiles rank worst workspace first: broken, then attention, then quiet', () => {
    const tiles = groupFleetByWorkspace(fleet);
    expect(tiles.map((t) => t.workspaceName)).toEqual(['Fire', 'Late', 'Calm']);
    expect(tiles.map((t) => t.severity)).toEqual(['broken', 'attention', 'quiet']);
  });

  it('within a tile, items are worst-first and `worst` is the front item', () => {
    const fire = groupFleetByWorkspace(fleet).find((t) => t.workspaceId === 'fire')!;
    expect(fire.items.map((i) => i.id)).toEqual(['c', 'd']);
    expect(fire.worst.id).toBe('c');
  });

  it('overdue-but-completed outranks healthy when statuses tie (board ordering)', () => {
    const tiles = groupFleetByWorkspace([
      make({ id: 'x', workspaceId: 'wA', workspaceName: 'A', lastStatus: 'Completed' }),
      make({ id: 'y', workspaceId: 'wB', workspaceName: 'B', lastStatus: 'Completed', scheduleOverdue: true }),
    ]);
    expect(tiles.map((t) => t.workspaceName)).toEqual(['B', 'A']);
  });

  it('an overdue tile outranks quiet Never and Running tiles (Matt #4 order)', () => {
    const tiles = groupFleetByWorkspace([
      make({ id: 'n', workspaceId: 'wN', workspaceName: 'Neverland', lastStatus: 'Never' }),
      make({ id: 'r', workspaceId: 'wR', workspaceName: 'Running', lastStatus: 'InProgress' }),
      make({ id: 'o', workspaceId: 'wO', workspaceName: 'Overdue', lastStatus: 'Completed', scheduleOverdue: true }),
    ]);
    expect(tiles.map((t) => t.workspaceName)).toEqual(['Overdue', 'Neverland', 'Running']);
  });

  it('counts each item exactly once, status before overdue', () => {
    const tile = groupFleetByWorkspace([
      make({ id: '1', lastStatus: 'Failed', scheduleOverdue: true }),
      make({ id: '2', lastStatus: 'Cancelled' }),
      make({ id: '3', lastStatus: 'Never', kind: 'dataflow' }),
      make({ id: '4', lastStatus: 'Completed', scheduleOverdue: true }),
      make({ id: '5', lastStatus: 'Completed' }),
    ])[0]!;
    expect(tile.counts).toEqual({ failed: 1, cancelled: 1, neverRun: 1, overdue: 1, datasets: 4, dataflows: 1 });
  });

  it('empty fleet → no tiles', () => {
    expect(groupFleetByWorkspace([])).toEqual([]);
  });
});

describe('tileCountsLine', () => {
  it('trouble first, then inventory, zero segments silent', () => {
    const tile = groupFleetByWorkspace([
      make({ id: '1', lastStatus: 'Failed' }),
      make({ id: '2', lastStatus: 'Completed', scheduleOverdue: true }),
      make({ id: '3', kind: 'dataflow' }),
    ])[0]!;
    expect(tileCountsLine(tile)).toBe('1 failed · 1 overdue · 2 datasets · 1 dataflow');
  });

  it('a quiet workspace reads as just its inventory, pluralized', () => {
    const tile = groupFleetByWorkspace([
      make({ id: '1' }),
      make({ id: '2' }),
      make({ id: '3', kind: 'dataflow' }),
      make({ id: '4', kind: 'dataflow' }),
    ])[0]!;
    expect(tileCountsLine(tile)).toBe('2 datasets · 2 dataflows');
  });
});

describe('sheetSections (type-organized: upstream movers lead)', () => {
  it('dataflows first, datasets second, worst-first within each', () => {
    const sections = sheetSections([
      make({ id: 'ds-ok', name: 'OK set' }),
      make({ id: 'ds-bad', name: 'Bad set', lastStatus: 'Failed' }),
      make({ id: 'df-ok', name: 'OK flow', kind: 'dataflow' }),
      make({ id: 'df-bad', name: 'Bad flow', kind: 'dataflow', lastStatus: 'Failed' }),
    ]);
    expect(sections.map((s) => s.key)).toEqual(['dataflows', 'datasets']);
    expect(sections[0]!.title).toBe('DATAFLOWS — UPSTREAM');
    expect(sections[0]!.items.map((i) => i.id)).toEqual(['df-bad', 'df-ok']);
    expect(sections[1]!.title).toBe('DATASETS');
    expect(sections[1]!.items.map((i) => i.id)).toEqual(['ds-bad', 'ds-ok']);
  });

  it('empty sections are omitted entirely', () => {
    expect(sheetSections([make({ id: 'only', kind: 'dataflow' })]).map((s) => s.key)).toEqual(['dataflows']);
    expect(sheetSections([make({ id: 'only' })]).map((s) => s.key)).toEqual(['datasets']);
    expect(sheetSections([])).toEqual([]);
  });
});
