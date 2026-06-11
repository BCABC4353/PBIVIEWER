
import type { InsightsRefreshable } from './types';

export function parseServiceException(json?: string): { errorCode?: string; errorDetail?: string } {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as {
      errorCode?: string;
      errorDescription?: string;
      'pbi.error'?: {
        code?: string;
        details?: Array<{ code?: string; detail?: { value?: string } | string }>;
      };
    };
    const pbiError = parsed['pbi.error'];
    const detailParts: string[] = [];
    if (parsed.errorDescription) detailParts.push(parsed.errorDescription);
    for (const d of pbiError?.details ?? []) {
      const value = typeof d.detail === 'string' ? d.detail : d.detail?.value;
      if (value) detailParts.push(d.code ? `${d.code}: ${value}` : value);
    }
    return {
      errorCode: parsed.errorCode || pbiError?.code,
      errorDetail: detailParts.length > 0 ? detailParts.join(' · ') : undefined,
    };
  } catch {
    return {};
  }
}

export function deriveRecentRuns(
  entries: Array<{ status?: string; endTime?: string; serviceExceptionJson?: string }>,
  successLike: (s?: string) => boolean,
  inFlight: (e: { status?: string; endTime?: string }) => boolean,
): InsightsRefreshable['recentRuns'] {
  return entries
    .filter((e) => !inFlight(e))
    .map((e) => {
      const ok = successLike(e.status);
      const run: NonNullable<InsightsRefreshable['recentRuns']>[number] = { ok, endTime: e.endTime };
      if (!ok && e.serviceExceptionJson) {
        const { errorCode, errorDetail } = parseServiceException(e.serviceExceptionJson);
        if (errorCode) run.errorCode = errorCode;
        if (errorDetail) run.errorDetail = errorDetail;
      }
      return run;
    })
    .reverse();
}

export function deriveDatasetRefreshHealth(
  entries: Array<{
    status?: string;
    startTime?: string;
    endTime?: string;
    refreshType?: string;
    serviceExceptionJson?: string;
  }>,
): Pick<
  InsightsRefreshable,
  'lastStatus' | 'lastAttemptTime' | 'lastSuccessTime' | 'errorCode' | 'lastRefreshType' | 'recentRuns'
> {
  if (entries.length === 0) return { lastStatus: 'Never' };

  const newest = entries[0]!;
  const successLike = (s?: string) => s === 'Completed' || s === 'Unknown';
  const lastSuccess = entries.find((e) => successLike(e.status) && e.endTime);

  let lastStatus: InsightsRefreshable['lastStatus'];
  if (newest.status === 'Unknown' && !newest.endTime) lastStatus = 'InProgress';
  else if (successLike(newest.status)) lastStatus = 'Completed';
  else if (newest.status === 'Cancelled') lastStatus = 'Cancelled';
  else if (newest.status === 'Disabled') lastStatus = 'Disabled';
  else lastStatus = 'Failed';

  let errorCode: string | undefined;
  if (lastStatus === 'Failed' && newest.serviceExceptionJson) {
    errorCode = parseServiceException(newest.serviceExceptionJson).errorCode;
  }

  return {
    lastStatus,
    lastAttemptTime: newest.endTime || newest.startTime,
    lastSuccessTime: lastSuccess?.endTime,
    errorCode,
    lastRefreshType: newest.refreshType,
    recentRuns: deriveRecentRuns(
      entries,
      successLike,
      (e) => e.status === 'Unknown' && !e.endTime,
    ),
  };
}

export function deriveScheduleInfo(
  sched: { days?: string[]; times?: string[]; enabled?: boolean; localTimeZoneId?: string } | null | undefined,
  lastSuccessTime?: string,
  now: number = Date.now(),
): Pick<InsightsRefreshable, 'scheduleSummary' | 'scheduleOverdue'> {
  if (!sched || sched.enabled !== true) return {};

  const days = sched.days ?? [];
  const times = sched.times ?? [];
  const daysLabel = days.length === 0 || days.length === 7 ? 'Daily' : days.join(', ');
  const timesLabel = times.length > 0 ? ` at ${times.join(', ')}` : '';
  const scheduleSummary = `${daysLabel}${timesLabel}`;

  let scheduleOverdue = false;
  if (lastSuccessTime) {
    const slotsPerWeek = Math.max(1, (days.length || 7) * (times.length || 1));
    const expectedGapMs = (7 * 24 * 60 * 60 * 1000) / slotsPerWeek;
    const overdueAfterMs = Math.max(24 * 60 * 60 * 1000, 2 * expectedGapMs);
    scheduleOverdue = now - Date.parse(lastSuccessTime) > overdueAfterMs;
  } else {
    scheduleOverdue = true;
  }
  return { scheduleSummary, scheduleOverdue };
}

export function deriveDataflowRefreshHealth(
  entries: Array<{ status?: string; startTime?: string; endTime?: string }>,
): Pick<InsightsRefreshable, 'lastStatus' | 'lastAttemptTime' | 'lastSuccessTime' | 'recentRuns'> {
  if (entries.length === 0) return { lastStatus: 'Never' };

  const newest = entries[0]!;
  const lastSuccess = entries.find((e) => e.status === 'Success' && e.endTime);

  let lastStatus: InsightsRefreshable['lastStatus'];
  if (newest.status === 'Success') lastStatus = 'Completed';
  else if (newest.status === 'InProgress' || (!newest.endTime && !newest.status)) lastStatus = 'InProgress';
  else if (newest.status === 'Cancelled') lastStatus = 'Cancelled';
  else lastStatus = 'Failed';

  return {
    lastStatus,
    lastAttemptTime: newest.endTime || newest.startTime,
    lastSuccessTime: lastSuccess?.endTime,
    recentRuns: deriveRecentRuns(
      entries,
      (s) => s === 'Success',
      (e) => e.status === 'InProgress' || (!e.endTime && !e.status),
    ),
  };
}
