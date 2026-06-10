/**
 * Refresh-health derivation — direct port of the desktop app's verified logic
 * (src/main/services/powerbi-api.ts). Pure functions; no I/O.
 */
import type { Refreshable, RefreshStatus } from './types';

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

const successLike = (s?: string) => s === 'Completed' || s === 'Unknown';

/** Dataset health from its recent refresh history (newest first). */
export function deriveDatasetHealth(
  entries: RawRefreshEntry[],
): Pick<Refreshable, 'lastStatus' | 'lastAttemptTime' | 'lastSuccessTime' | 'errorCode' | 'lastRefreshType' | 'recentDurationsMin'> {
  if (entries.length === 0) return { lastStatus: 'Never' };
  const newest = entries[0]!;
  const lastSuccess = entries.find((e) => successLike(e.status) && e.endTime);

  let lastStatus: RefreshStatus;
  // 'Unknown' with no endTime is an in-flight refresh; 'Unknown' WITH an
  // endTime is how the v1 endpoint reports a completed on-demand refresh.
  if (newest.status === 'Unknown' && !newest.endTime) lastStatus = 'InProgress';
  else if (successLike(newest.status)) lastStatus = 'Completed';
  else if (newest.status === 'Cancelled') lastStatus = 'Cancelled';
  else if (newest.status === 'Disabled') lastStatus = 'Disabled';
  else lastStatus = 'Failed';

  let errorCode: string | undefined;
  if (lastStatus === 'Failed' && newest.serviceExceptionJson) {
    try {
      errorCode = (JSON.parse(newest.serviceExceptionJson) as { errorCode?: string }).errorCode;
    } catch {
      /* malformed exception payload — omit */
    }
  }

  // Durations of successful runs (oldest→newest) — drawn natively as a
  // sparkline; a creeping duration is the early warning of a degrading model.
  const recentDurationsMin = entries
    .filter((e) => successLike(e.status) && e.startTime && e.endTime)
    .map((e) => Math.max(0, Math.round((Date.parse(e.endTime!) - Date.parse(e.startTime!)) / 60000)))
    .reverse();

  return {
    lastStatus,
    lastAttemptTime: newest.endTime || newest.startTime,
    lastSuccessTime: lastSuccess?.endTime,
    errorCode,
    lastRefreshType: newest.refreshType,
    recentDurationsMin: recentDurationsMin.length > 0 ? recentDurationsMin : undefined,
  };
}

/** Dataflow health from its recent transactions (newest first). */
export function deriveDataflowHealth(
  entries: RawTransaction[],
): Pick<Refreshable, 'lastStatus' | 'lastAttemptTime' | 'lastSuccessTime'> {
  if (entries.length === 0) return { lastStatus: 'Never' };
  const newest = entries[0]!;
  const lastSuccess = entries.find((e) => e.status === 'Success' && e.endTime);

  let lastStatus: RefreshStatus;
  if (newest.status === 'Success') lastStatus = 'Completed';
  else if (newest.status === 'InProgress' || (!newest.endTime && !newest.status)) lastStatus = 'InProgress';
  else if (newest.status === 'Cancelled') lastStatus = 'Cancelled';
  else lastStatus = 'Failed';

  return {
    lastStatus,
    lastAttemptTime: newest.endTime || newest.startTime,
    lastSuccessTime: lastSuccess?.endTime,
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
 */
export function deriveScheduleInfo(
  sched: RawSchedule | null,
  lastSuccessTime: string | undefined,
  now: number,
): Pick<Refreshable, 'scheduleSummary' | 'scheduleOverdue'> {
  if (!sched || sched.enabled !== true) return {};
  const days = sched.days ?? [];
  const times = sched.times ?? [];
  const daysLabel = days.length === 0 || days.length === 7 ? 'Daily' : days.join(', ');
  const scheduleSummary = `${daysLabel}${times.length > 0 ? ` at ${times.join(', ')}` : ''}`;

  let scheduleOverdue: boolean;
  if (lastSuccessTime) {
    const slotsPerWeek = Math.max(1, (days.length || 7) * (times.length || 1));
    const expectedGapMs = (7 * 24 * 60 * 60 * 1000) / slotsPerWeek;
    const overdueAfterMs = Math.max(24 * 60 * 60 * 1000, 2 * expectedGapMs);
    scheduleOverdue = now - Date.parse(lastSuccessTime) > overdueAfterMs;
  } else {
    scheduleOverdue = true; // enabled schedule, no success ever
  }
  return { scheduleSummary, scheduleOverdue };
}

/** Worst-first ordering for the fleet board (same ranking as desktop). */
export const statusOrder: Record<RefreshStatus, number> = {
  Failed: 0,
  Cancelled: 1,
  Never: 2,
  InProgress: 3,
  Completed: 4,
  Disabled: 5,
};

export function sortWorstFirst(items: Refreshable[]): Refreshable[] {
  return [...items].sort((a, b) => {
    const s = statusOrder[a.lastStatus] - statusOrder[b.lastStatus];
    if (s !== 0) return s;
    // Overdue floats above healthy within the same status band.
    const o = Number(b.scheduleOverdue ?? false) - Number(a.scheduleOverdue ?? false);
    if (o !== 0) return o;
    return a.workspaceName.localeCompare(b.workspaceName) || a.name.localeCompare(b.name);
  });
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
