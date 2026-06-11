import type { Refreshable } from './types';
import { itemRank, sortWorstFirst } from './refresh-health';

export type TileSeverity = 'broken' | 'attention' | 'quiet';

export function itemSeverity(r: Refreshable): TileSeverity {
  if (r.lastStatus === 'Failed') return 'broken';
  if (r.lastStatus === 'Cancelled' || r.lastStatus === 'Never' || r.scheduleOverdue === true) {
    return 'attention';
  }
  return 'quiet';
}

export interface TileCounts {
  failed: number;
  cancelled: number;
  neverRun: number;
  overdue: number;
  datasets: number;
  dataflows: number;
}

export interface WorkspaceTile {
  workspaceId: string;
  workspaceName: string;
  severity: TileSeverity;
  items: Refreshable[];
  worst: Refreshable;
  counts: TileCounts;
}

export function groupFleetByWorkspace(refreshables: Refreshable[]): WorkspaceTile[] {
  const byWorkspace = new Map<string, Refreshable[]>();
  for (const r of refreshables) {
    const bucket = byWorkspace.get(r.workspaceId);
    if (bucket) bucket.push(r);
    else byWorkspace.set(r.workspaceId, [r]);
  }

  const tiles: WorkspaceTile[] = [];
  for (const group of byWorkspace.values()) {
    const items = sortWorstFirst(group);
    const worst = items[0]!;

    const counts: TileCounts = { failed: 0, cancelled: 0, neverRun: 0, overdue: 0, datasets: 0, dataflows: 0 };
    let severity: TileSeverity = 'quiet';
    for (const item of items) {
      if (item.kind === 'dataset') counts.datasets += 1;
      else counts.dataflows += 1;
      const sev = itemSeverity(item);
      if (sev === 'broken') {
        counts.failed += 1;
        severity = 'broken';
      } else if (sev === 'attention') {
        if (item.lastStatus === 'Cancelled') counts.cancelled += 1;
        else if (item.lastStatus === 'Never') counts.neverRun += 1;
        else counts.overdue += 1;
        if (severity === 'quiet') severity = 'attention';
      }
    }

    tiles.push({
      workspaceId: worst.workspaceId,
      workspaceName: worst.workspaceName,
      severity,
      items,
      worst,
      counts,
    });
  }

  tiles.sort(
    (a, b) =>
      itemRank(a.worst) - itemRank(b.worst) ||
      a.workspaceName.localeCompare(b.workspaceName),
  );
  return tiles;
}

export function tileCountsLine(tile: WorkspaceTile): string {
  const { failed, cancelled, neverRun, overdue, datasets, dataflows } = tile.counts;
  const parts: string[] = [];
  if (failed > 0) parts.push(`${failed} failed`);
  if (cancelled > 0) parts.push(`${cancelled} cancelled`);
  if (neverRun > 0) parts.push(`${neverRun} never run`);
  if (overdue > 0) parts.push(`${overdue} overdue`);
  if (datasets > 0) parts.push(`${datasets} dataset${datasets === 1 ? '' : 's'}`);
  if (dataflows > 0) parts.push(`${dataflows} dataflow${dataflows === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

export interface SheetSection {
  key: 'dataflows' | 'datasets';
  title: string;
  items: Refreshable[];
}

export function sheetSections(items: Refreshable[]): SheetSection[] {
  const dataflows = sortWorstFirst(items.filter((r) => r.kind === 'dataflow'));
  const datasets = sortWorstFirst(items.filter((r) => r.kind === 'dataset'));
  const sections: SheetSection[] = [];
  if (dataflows.length > 0) sections.push({ key: 'dataflows', title: 'DATAFLOWS — UPSTREAM', items: dataflows });
  if (datasets.length > 0) sections.push({ key: 'datasets', title: 'DATASETS', items: datasets });
  return sections;
}
