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

// The white ladder — single source for every text/identity tier (D12).
const TEXT_PRIMARY = 'rgba(255,255,255,0.92)';
const TEXT_SECONDARY = 'rgba(255,255,255,0.64)';
const TEXT_TERTIARY = 'rgba(255,255,255,0.40)';

export const luce = {
  canvas: '#0B0B0D',
  surface1: '#141417',
  surface2: '#1C1C21',

  textPrimary: TEXT_PRIMARY,
  textSecondary: TEXT_SECONDARY,
  textTertiary: TEXT_TERTIARY,

  accent: '#E8A33D', // the ONLY chrome accent
  // D12: healthy is the resting state — it reads by glyph + label in the
  // grayscale ladder. A green hue restating "fine" was decoration (Pierre).
  ok: TEXT_SECONDARY,
  warn: '#E8A33D',
  broken: '#E5484D', // sacred: failures only, never decoration

  // D12: identity is carried by the chip's own WORD (DATASET / DATAFLOW) and
  // glyph — a hue restating a label is decoration. Grayscale ladder only.
  kindDataset: TEXT_TERTIARY,
  kindDataflow: TEXT_TERTIARY,
  dormant: TEXT_TERTIARY, // "abandoned, not on fire"
} as const;

/** Kind → identity tint, used for every DATASET/DATAFLOW chip on the page. */
export const kindColor: Record<InsightsRefreshable['kind'], string> = {
  dataset: luce.kindDataset,
  dataflow: luce.kindDataflow,
};

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
  Cancelled: luce.broken, // counted in Broken — the color must agree with the count
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

// ---------------------------------------------------------------------------
// Dormant (Matt #4) — abandoned items, independent of lastStatus
// ---------------------------------------------------------------------------

/** An item is dormant when nothing has happened to it for over a year. */
export const DORMANT_AFTER_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * True when the item's last refresh attempt (or last success, if no attempt
 * time is known) is more than 365 days old. Deliberately lastStatus-independent:
 * a dataset that "Completed" 700 days ago is abandoned, not healthy.
 */
export function isDormant(
  item: Pick<InsightsRefreshable, 'lastAttemptTime' | 'lastSuccessTime'>,
  now: number = Date.now(),
): boolean {
  const anchor = item.lastAttemptTime || item.lastSuccessTime;
  if (!anchor) return false;
  const ms = now - Date.parse(anchor);
  return Number.isFinite(ms) && ms > DORMANT_AFTER_MS;
}

/**
 * Down-for label for a dormant item, in the existing "down 657d" voice —
 * measured from the last success (the owner reads dormancy as downtime).
 * Null when the item is not dormant.
 */
export function dormantDownLabel(
  item: Pick<InsightsRefreshable, 'lastAttemptTime' | 'lastSuccessTime'>,
  now: number = Date.now(),
): string | null {
  if (!isDormant(item, now)) return null;
  if (!item.lastSuccessTime) return 'down — never succeeded';
  const ms = now - Date.parse(item.lastSuccessTime);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return `down ${formatElapsed(ms)}`;
}

// ---------------------------------------------------------------------------
// Summary-tile filters (Matt #2)
// ---------------------------------------------------------------------------

export type TileFilter = 'broken' | 'overdue' | 'running' | 'healthy' | 'dormant';

/** Predicate behind each clickable summary tile. */
export function matchesTileFilter(
  item: InsightsRefreshable,
  filter: TileFilter,
  now: number = Date.now(),
): boolean {
  switch (filter) {
    case 'broken':
      return item.lastStatus === 'Failed' || item.lastStatus === 'Cancelled';
    case 'overdue':
      return item.scheduleOverdue === true;
    case 'running':
      return item.lastStatus === 'InProgress';
    case 'healthy':
      return item.lastStatus === 'Completed';
    case 'dormant':
      return isDormant(item, now);
  }
}

/** "3 of last 12 runs failed" when any run failed; null when quiet. */
export function failureRateCaption(recentRuns?: InsightsRefreshable['recentRuns']): string | null {
  if (!recentRuns || recentRuns.length === 0) return null;
  const fails = recentRuns.filter((r) => !r.ok).length;
  if (fails === 0) return null;
  return `${fails} of last ${recentRuns.length} runs failed`;
}

export interface DotStripCell {
  state: 'ok' | 'fail' | 'none';
  endTime?: string;
  errorCode?: string;
  errorDetail?: string;
}

/**
 * Normalize a recentRuns history to exactly `size` cells for the dot strip.
 * Chronology is ALWAYS oldest → newest, left → right, and filled dots ALWAYS
 * start at the far LEFT: a partial history pads hollow placeholders on the
 * RIGHT (Matt #6 — left-padding made short strips read right→left).
 */
export function dotStripCells(
  recentRuns: InsightsRefreshable['recentRuns'],
  size = 12,
): DotStripCell[] {
  const runs = (recentRuns ?? []).slice(-size);
  const pad = Array.from({ length: size - runs.length }, () => ({ state: 'none' as const }));
  return [
    ...runs.map((r) => ({
      state: r.ok ? ('ok' as const) : ('fail' as const),
      endTime: r.endTime,
      errorCode: r.errorCode,
      errorDetail: r.errorDetail,
    })),
    ...pad,
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
  counts: { broken: number; overdue: number; dormant: number; never: number; running: number; ok: number; live: number };
  /** Worst status across the group (drives the header glyph). */
  worst: InsightsRefreshable['lastStatus'];
}

const severity: Record<InsightsRefreshable['lastStatus'], number> = {
  Failed: 0,
  Cancelled: 1,
  Never: 2,
  InProgress: 3,
  Completed: 4,
  Disabled: 5,
};

/**
 * Item sort rank inside a group (Matt #4 order):
 * Failed, Cancelled, Overdue, Dormant, Never, Running, OK, Live.
 */
function itemRank(item: InsightsRefreshable, now: number): number {
  if (item.lastStatus === 'Failed') return 0;
  if (item.lastStatus === 'Cancelled') return 1;
  if (item.scheduleOverdue) return 2;
  if (isDormant(item, now)) return 3;
  if (item.lastStatus === 'Never') return 4;
  if (item.lastStatus === 'InProgress') return 5;
  if (item.lastStatus === 'Completed') return 6;
  return 7; // Disabled ("Live")
}

/** Group rank: broken first, then overdue, dormant, never, running, quiet. */
function groupRank(g: WorkspaceGroup): number {
  if (g.counts.broken > 0) return 0;
  if (g.counts.overdue > 0) return 1;
  if (g.counts.dormant > 0) return 2;
  if (g.counts.never > 0) return 3;
  if (g.counts.running > 0) return 4;
  return 5;
}

/**
 * Group refreshables by workspace (client), worst-first inside each group,
 * troubled groups first overall. All groups start COLLAPSED (Matt #7) — the
 * worst-first sort and red header summaries surface trouble instead.
 */
export function groupByWorkspace(
  refreshables: InsightsRefreshable[],
  now: number = Date.now(),
): WorkspaceGroup[] {
  const byId = new Map<string, WorkspaceGroup>();
  for (const item of refreshables) {
    let g = byId.get(item.workspaceId);
    if (!g) {
      g = {
        workspaceId: item.workspaceId,
        workspaceName: item.workspaceName,
        items: [],
        counts: { broken: 0, overdue: 0, dormant: 0, never: 0, running: 0, ok: 0, live: 0 },
        worst: 'Disabled',
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
    if (isDormant(item, now)) g.counts.dormant++;
  }

  const groups = Array.from(byId.values());
  for (const g of groups) {
    g.items.sort(
      (a, b) => itemRank(a, now) - itemRank(b, now) || a.name.localeCompare(b.name),
    );
    g.worst = g.items.reduce<InsightsRefreshable['lastStatus']>(
      (worst, item) => (severity[item.lastStatus] < severity[worst] ? item.lastStatus : worst),
      'Disabled',
    );
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
  if (g.counts.dormant > 0) parts.push(`${g.counts.dormant} dormant`);
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
