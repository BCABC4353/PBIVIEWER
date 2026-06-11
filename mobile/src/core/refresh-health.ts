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

const successLike = (s?: string) => s === 'Completed' || s === 'Unknown';

export function deriveDatasetHealth(
  entries: RawRefreshEntry[],
): Pick<Refreshable, 'lastStatus' | 'lastAttemptTime' | 'lastSuccessTime' | 'errorCode' | 'lastRefreshType' | 'recentDurationsMin'> {
  const core = deriveDatasetRefreshHealth(entries);

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

export function deriveScheduleInfo(
  sched: RawSchedule | null,
  lastSuccessTime: string | undefined,
  now: number,
): Pick<Refreshable, 'scheduleSummary' | 'scheduleOverdue'> {
  return deriveScheduleInfoCore(sched, lastSuccessTime, now);
}

export const statusOrder: Record<RefreshStatus, number> = {
  Failed: 0,
  Cancelled: 1,
  Never: 2,
  InProgress: 3,
  Completed: 4,
  Disabled: 5,
};

export function itemRank(r: Pick<Refreshable, 'lastStatus' | 'scheduleOverdue'>): number {
  if (r.lastStatus === 'Failed') return 0;
  if (r.lastStatus === 'Cancelled') return 1;
  if (r.scheduleOverdue) return 2;
  if (r.lastStatus === 'Never') return 3;
  if (r.lastStatus === 'InProgress') return 4;
  if (r.lastStatus === 'Completed') return 5;
  return 6;
}

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
