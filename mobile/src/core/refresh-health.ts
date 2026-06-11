/**
 * Refresh-health adapter — the health DERIVATIONS live in the canonical
 * shared module (src/shared/refresh-health-core.ts at the repo root), the
 * single source for desktop AND mobile; this file no longer carries its own
 * copy (the hand-port drifted: it dropped pbi.error codes and ranked overdue
 * below quiet Never/Running). Metro reaches the out-of-tree import through
 * the watchFolders entry in mobile/metro.config.js.
 *
 * Kept here, and ONLY here, are the mobile-specific pieces:
 *   - recentDurationsMin (sparkline fuel — desktop renders recentRuns dots
 *     instead),
 *   - itemRank / statusOrder / sortWorstFirst (fleet-board ordering),
 *   - relativeAge / triggerLabel (label helpers).
 * Pure functions; no I/O, no React Native imports.
 */
import type { Refreshable, RefreshStatus } from './types';
import {
  deriveDatasetRefreshHealth,
  deriveDataflowRefreshHealth,
  deriveScheduleInfo as deriveScheduleInfoCore,
} from '../../../src/shared/refresh-health-core';

export interface RawRefreshEntry {
  status?: string;
  startTime?: string;
  endTime?: string;
  refreshType?: string;
  serviceExceptionJson?: string;
}

export interface RawTransaction {
  status?: string;
  startTime?: string;
  endTime?: string;
}

/** Same success semantics the canonical module uses for datasets: 'Unknown'
 *  WITH an endTime is how the v1 endpoint reports a completed on-demand
 *  refresh. Local copy only feeds the mobile-only durations derivation. */
const successLike = (s?: string) => s === 'Completed' || s === 'Unknown';

/**
 * Dataset health from its recent refresh history (newest first). Status,
 * times, and errorCode come from the canonical derivation — including the
 * full serviceExceptionJson parse (top-level errorCode OR the nested
 * pbi.error code), so failures name the same cause the desktop shows.
 * recentDurationsMin is the mobile-only addition; the canonical recentRuns
 * strip is dropped at this boundary because the mobile Refreshable does not
 * carry it (the phone draws a duration sparkline instead of the dot strip).
 */
export function deriveDatasetHealth(
  entries: RawRefreshEntry[],
): Pick<Refreshable, 'lastStatus' | 'lastAttemptTime' | 'lastSuccessTime' | 'errorCode' | 'lastRefreshType' | 'recentDurationsMin'> {
  const core = deriveDatasetRefreshHealth(entries);

  // Durations of successful runs (oldest→newest) — drawn natively as a
  // sparkline; a creeping duration is the early warning of a degrading model.
  const recentDurationsMin = entries
    .filter((e) => successLike(e.status) && e.startTime && e.endTime)
    .map((e) => Math.max(0, Math.round((Date.parse(e.endTime!) - Date.parse(e.startTime!)) / 60000)))
    .reverse();

  return {
    lastStatus: core.lastStatus,
    lastAttemptTime: core.lastAttemptTime,
    lastSuccessTime: core.lastSuccessTime,
    errorCode: core.errorCode,
    lastRefreshType: core.lastRefreshType,
    recentDurationsMin: recentDurationsMin.length > 0 ? recentDurationsMin : undefined,
  };
}

/** Dataflow health from its recent transactions (newest first) — canonical
 *  derivation, minus the recentRuns strip the mobile type does not carry. */
export function deriveDataflowHealth(
  entries: RawTransaction[],
): Pick<Refreshable, 'lastStatus' | 'lastAttemptTime' | 'lastSuccessTime'> {
  const core = deriveDataflowRefreshHealth(entries);
  return {
    lastStatus: core.lastStatus,
    lastAttemptTime: core.lastAttemptTime,
    lastSuccessTime: core.lastSuccessTime,
  };
}

export interface RawSchedule {
  days?: string[];
  times?: string[];
  enabled?: boolean;
}

/**
 * Schedule-vs-reality: overdue when an enabled schedule's last success is older
 * than twice its expected cadence (min 24h), or has never succeeded at all.
 * Canonical math; mobile passes an explicit clock for deterministic tests.
 */
export function deriveScheduleInfo(
  sched: RawSchedule | null,
  lastSuccessTime: string | undefined,
  now: number,
): Pick<Refreshable, 'scheduleSummary' | 'scheduleOverdue'> {
  return deriveScheduleInfoCore(sched, lastSuccessTime, now);
}

/** Status severity bands (mirrors the desktop board's `severity` record in
 *  insights-luce.ts). NOTE: list ordering uses itemRank below, which
 *  additionally bands schedule-overdue items above Never/Running. */
export const statusOrder: Record<RefreshStatus, number> = {
  Failed: 0,
  Cancelled: 1,
  Never: 2,
  InProgress: 3,
  Completed: 4,
  Disabled: 5,
};

/**
 * Item sort rank — the desktop board's documented "Matt #4" order
 * (src/renderer/components/insights/insights-luce.ts itemRank):
 * Failed, Cancelled, Overdue, Never, Running, OK, Live. A schedule-overdue
 * item OUTRANKS quiet Never/Running items — converged on the desktop ruling
 * 2026-06-11; the old mobile order ranked overdue below them. (The desktop
 * also has a Dormant band between Overdue and Never; mobile derives no
 * dormancy yet, so that band is skipped.)
 */
export function itemRank(r: Pick<Refreshable, 'lastStatus' | 'scheduleOverdue'>): number {
  if (r.lastStatus === 'Failed') return 0;
  if (r.lastStatus === 'Cancelled') return 1;
  if (r.scheduleOverdue) return 2;
  if (r.lastStatus === 'Never') return 3;
  if (r.lastStatus === 'InProgress') return 4;
  if (r.lastStatus === 'Completed') return 5;
  return 6; // Disabled ("Live")
}

/** Worst-first ordering for the fleet board (Matt #4 rank, then names). */
export function sortWorstFirst(items: Refreshable[]): Refreshable[] {
  return [...items].sort(
    (a, b) =>
      itemRank(a) - itemRank(b) ||
      a.workspaceName.localeCompare(b.workspaceName) ||
      a.name.localeCompare(b.name),
  );
}

export function triggerLabel(refreshType?: string): string {
  if (!refreshType) return '—';
  if (refreshType === 'ViaApi') return 'Power Automate / API';
  if (refreshType === 'OnDemand') return 'Manual';
  return refreshType;
}

export function relativeAge(iso: string | undefined, now: number): string {
  if (!iso) return '';
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
