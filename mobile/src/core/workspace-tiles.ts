/**
 * Workspace-tile grouping — pure logic for the fleet board's workspace TILES
 * and their expanded type-organized sheets (the "blast radius" interaction,
 * docs/design/BLAST-RADIUS.md). Formerly named blast-radius.ts; renamed
 * because the DESKTOP tree has an unrelated src/shared/blast-radius.ts
 * (failed-dataflow cascade math) and the name collision kept sending
 * grep-driven edits into the wrong file.
 * No React Native imports: everything here unit-tests on plain node.
 *
 * The tile carries the workspace's summary (worst status, counts, the worst
 * item's recent-runs pulse); the sheet organizes the same items BY TYPE —
 * dataflows (upstream) first, then datasets. Works on whatever the current
 * FleetSnapshot carries, mock or live — no data-layer contract changes.
 */
import type { Refreshable } from './types';
import { itemRank, sortWorstFirst } from './refresh-health';

/**
 * Tile edge severity. Red is sacred — `broken` means Failed, nothing else.
 * `attention` is the amber band: cancelled, never-run, or schedule-overdue.
 * Everything healthy stays `quiet` (grayscale).
 */
export type TileSeverity = 'broken' | 'attention' | 'quiet';

export function itemSeverity(r: Refreshable): TileSeverity {
  if (r.lastStatus === 'Failed') return 'broken';
  if (r.lastStatus === 'Cancelled' || r.lastStatus === 'Never' || r.scheduleOverdue === true) {
    return 'attention';
  }
  return 'quiet';
}

export interface TileCounts {
  /** Failed items (the red number). */
  failed: number;
  /** Amber band, split honestly by why. An item counts ONCE, status first. */
  cancelled: number;
  neverRun: number;
  overdue: number;
  datasets: number;
  dataflows: number;
}

export interface WorkspaceTile {
  workspaceId: string;
  workspaceName: string;
  /** Worst severity across the workspace — drives the tile edge color. */
  severity: TileSeverity;
  /** Every item in the workspace, worst-first (same ranking as the board). */
  items: Refreshable[];
  /** The single worst item — its pulse row fronts the tile. */
  worst: Refreshable;
  counts: TileCounts;
}

/**
 * Group a snapshot's refreshables into workspace tiles, worst workspace
 * first (ranked by each tile's worst item, exactly the board's ordering).
 */
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

  // Worst workspace first — rank tiles by their worst item with the board's
  // own key (the desktop's Matt #4 itemRank, where overdue is its own band
  // above Never/Running), then name.
  tiles.sort(
    (a, b) =>
      itemRank(a.worst) - itemRank(b.worst) ||
      a.workspaceName.localeCompare(b.workspaceName),
  );
  return tiles;
}

/**
 * The tile's one-line summary. Trouble first, honestly worded, then the
 * inventory. Zero-count segments stay silent; a fully quiet tile reads as
 * just its inventory ("3 datasets · 1 dataflow").
 */
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
  /** Section caption, exactly as rendered. Upstream movers lead. */
  title: string;
  items: Refreshable[];
}

/**
 * Organize a tile's items BY TYPE for the expanded sheet: dataflows (the
 * upstream movers) first, then datasets — worst-first within each, empty
 * sections omitted.
 */
export function sheetSections(items: Refreshable[]): SheetSection[] {
  const dataflows = sortWorstFirst(items.filter((r) => r.kind === 'dataflow'));
  const datasets = sortWorstFirst(items.filter((r) => r.kind === 'dataset'));
  const sections: SheetSection[] = [];
  if (dataflows.length > 0) sections.push({ key: 'dataflows', title: 'DATAFLOWS — UPSTREAM', items: dataflows });
  if (datasets.length > 0) sections.push({ key: 'datasets', title: 'DATASETS', items: datasets });
  return sections;
}
