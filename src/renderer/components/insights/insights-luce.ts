/**
 * Luce helpers for the Insights board — pure functions + design tokens only
 * (no React) so they are unit-testable and the page component stays lean.
 *
 * Palette/semantics come from docs/design/IOS-CRAFT-SPEC.md and
 * APP-DESIGN-LANGUAGE.md: near-black canvas, surfaces lifted by light,
 * ONE amber accent, red strictly for broken, status = shape + color + label.
 * Scoped to the Insights page only — the rest of the desktop app keeps its
 * Fluent look.
 */
import type { InsightsRefreshable } from '../../../shared/types';

// ---------------------------------------------------------------------------
// Tokens (mirrors mobile/src/design/tokens.ts)
// ---------------------------------------------------------------------------

export const luce = {
  canvas: '#0B0B0D',
  surface1: '#141417',
  surface2: '#1C1C21',
  hairline: 'rgba(255,255,255,0.08)',

  textPrimary: 'rgba(255,255,255,0.92)',
  textSecondary: 'rgba(255,255,255,0.64)',
  textTertiary: 'rgba(255,255,255,0.40)',

  accent: '#E8A33D', // the ONLY chrome accent
  ok: '#3FB68B',
  warn: '#E8A33D',
  broken: '#E5484D', // sacred: failures only, never decoration
} as const;

/** Status → shape glyph (color-blind safe; never color alone). */
export const statusGlyph: Record<InsightsRefreshable['lastStatus'], string> = {
  Completed: '●',
  Failed: '⬣',
  Cancelled: '▲',
  Never: '◌',
  InProgress: '◐',
  Disabled: '◇',
};

export const statusColor: Record<InsightsRefreshable['lastStatus'], string> = {
  Completed: luce.ok,
  Failed: luce.broken,
  Cancelled: luce.warn,
  Never: luce.warn,
  InProgress: luce.accent,
  Disabled: luce.textTertiary,
};

export const statusLabel: Record<InsightsRefreshable['lastStatus'], string> = {
  Completed: 'OK',
  Failed: 'Failed',
  Cancelled: 'Cancelled',
  Never: 'Never run',
  InProgress: 'Running',
  Disabled: 'Live',
};

// ---------------------------------------------------------------------------
// "Down for X" + failure-rate derivations
// ---------------------------------------------------------------------------

/** True when the item is in a state the owner reads as "this client is down". */
export function isDown(item: Pick<InsightsRefreshable, 'lastStatus' | 'scheduleOverdue'>): boolean {
  return (
    item.lastStatus === 'Failed' ||
    item.lastStatus === 'Cancelled' ||
    item.scheduleOverdue === true
  );
}

/** Compact elapsed-time label: 45m / 26h / 3d. */
export function formatElapsed(ms: number): string {
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * "down 26h" when the item is Failed/Cancelled/Overdue and has a prior
 * success; "down — never succeeded" when it never has. Null when healthy.
 */
export function downForLabel(
  item: Pick<InsightsRefreshable, 'lastStatus' | 'scheduleOverdue' | 'lastSuccessTime'>,
  now: number = Date.now(),
): string | null {
  if (!isDown(item)) return null;
  if (!item.lastSuccessTime) return 'down — never succeeded';
  const ms = now - Date.parse(item.lastSuccessTime);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return `down ${formatElapsed(ms)}`;
}

/** "3 of last 12 runs failed" when any run failed; null when quiet. */
export function failureRateCaption(recentRuns?: InsightsRefreshable['recentRuns']): string | null {
  if (!recentRuns || recentRuns.length === 0) return null;
  const fails = recentRuns.filter((r) => !r.ok).length;
  if (fails === 0) return null;
  return `${fails} of last ${recentRuns.length} runs failed`;
}

/**
 * Normalize a recentRuns history to exactly `size` cells for the dot strip,
 * oldest → newest, padding missing history on the OLD side with 'none'
 * (hollow) so the newest run is always the rightmost dot.
 */
export function dotStripCells(
  recentRuns: InsightsRefreshable['recentRuns'],
  size = 12,
): Array<{ state: 'ok' | 'fail' | 'none'; endTime?: string }> {
  const runs = (recentRuns ?? []).slice(-size);
  const pad = Array.from({ length: size - runs.length }, () => ({ state: 'none' as const }));
  return [
    ...pad,
    ...runs.map((r) => ({ state: r.ok ? ('ok' as const) : ('fail' as const), endTime: r.endTime })),
  ];
}

// ---------------------------------------------------------------------------
// Workspace grouping
// ---------------------------------------------------------------------------

export interface WorkspaceGroup {
  workspaceId: string;
  workspaceName: string;
  items: InsightsRefreshable[];
  /** Counts feeding the mini health summary in the section header. */
  counts: { broken: number; overdue: number; never: number; running: number; ok: number; live: number };
  /** Worst status across the group (drives the header glyph). */
  worst: InsightsRefreshable['lastStatus'];
  /** Broken/overdue groups start expanded; all-quiet groups start collapsed. */
  defaultExpanded: boolean;
}

const severity: Record<InsightsRefreshable['lastStatus'], number> = {
  Failed: 0,
  Cancelled: 1,
  Never: 2,
  InProgress: 3,
  Completed: 4,
  Disabled: 5,
};

/** Item sort rank inside a group: broken first, overdue boosts urgency. */
function itemRank(item: InsightsRefreshable): number {
  const base = severity[item.lastStatus];
  // An overdue-but-"Completed" item is a problem; rank it just behind broken.
  if (item.scheduleOverdue && base > 1) return 1.5;
  return base;
}

/** Group rank: broken workspaces first, then overdue/never, then quiet. */
function groupRank(g: WorkspaceGroup): number {
  if (g.counts.broken > 0) return 0;
  if (g.counts.overdue > 0) return 1;
  if (g.counts.never > 0) return 2;
  if (g.counts.running > 0) return 3;
  return 4;
}

/**
 * Group refreshables by workspace (client), worst-first inside each group,
 * troubled groups first overall.
 */
export function groupByWorkspace(refreshables: InsightsRefreshable[]): WorkspaceGroup[] {
  const byId = new Map<string, WorkspaceGroup>();
  for (const item of refreshables) {
    let g = byId.get(item.workspaceId);
    if (!g) {
      g = {
        workspaceId: item.workspaceId,
        workspaceName: item.workspaceName,
        items: [],
        counts: { broken: 0, overdue: 0, never: 0, running: 0, ok: 0, live: 0 },
        worst: 'Disabled',
        defaultExpanded: false,
      };
      byId.set(item.workspaceId, g);
    }
    g.items.push(item);
    if (item.lastStatus === 'Failed' || item.lastStatus === 'Cancelled') g.counts.broken++;
    else if (item.lastStatus === 'Never') g.counts.never++;
    else if (item.lastStatus === 'InProgress') g.counts.running++;
    else if (item.lastStatus === 'Disabled') g.counts.live++;
    else g.counts.ok++;
    if (item.scheduleOverdue) g.counts.overdue++;
  }

  const groups = Array.from(byId.values());
  for (const g of groups) {
    g.items.sort(
      (a, b) => itemRank(a) - itemRank(b) || a.name.localeCompare(b.name),
    );
    g.worst = g.items.reduce<InsightsRefreshable['lastStatus']>(
      (worst, item) => (severity[item.lastStatus] < severity[worst] ? item.lastStatus : worst),
      'Disabled',
    );
    g.defaultExpanded = g.counts.broken > 0 || g.counts.overdue > 0;
  }
  groups.sort(
    (a, b) => groupRank(a) - groupRank(b) || a.workspaceName.localeCompare(b.workspaceName),
  );
  return groups;
}

/** Mini health summary for a section header, e.g. "2 broken · 1 overdue · 14 OK". */
export function groupSummaryLabel(g: WorkspaceGroup): string {
  const parts: string[] = [];
  if (g.counts.broken > 0) parts.push(`${g.counts.broken} broken`);
  if (g.counts.overdue > 0) parts.push(`${g.counts.overdue} overdue`);
  if (g.counts.never > 0) parts.push(`${g.counts.never} never run`);
  if (g.counts.running > 0) parts.push(`${g.counts.running} running`);
  const quiet = g.counts.ok + g.counts.live;
  if (quiet > 0 || parts.length === 0) parts.push(`${quiet} OK`);
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Admin unlock — staged honest loading text
// ---------------------------------------------------------------------------

/** Honest, time-staged loading copy for the admin unlock wait. */
export function unlockStageText(elapsedMs: number): string {
  if (elapsedMs < 10_000) return 'Opening Microsoft consent…';
  if (elapsedMs < 30_000) return 'Reading App audiences…';
  return 'Crunching activity log — large tenants can take a couple minutes…';
}
