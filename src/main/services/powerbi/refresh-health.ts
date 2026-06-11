// ---------------------------------------------------------------------------
// PURE refresh-health derivation: refresh/transaction history in, health
// fields out. This module must have NO electron or node imports — it is
// intended to be shared verbatim with the mobile app (mobile/) later, so it
// must stay loadable in any JS runtime. Type-only imports from src/shared are
// fine (erased at compile time). The fetching wrappers that feed these
// functions live in powerbi/insights.ts.
// ---------------------------------------------------------------------------

import type { InsightsRefreshable } from '../../../shared/types';

/**
 * Parse a dataset refresh entry's serviceExceptionJson into the error code
 * plus the richest human detail the payload carries: errorDescription when
 * present, and any pbi.error detail values. Returns {} for missing or
 * malformed payloads. (Dataflow transactions carry no such field.)
 */
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
    return {}; // malformed exception payload — omit error info
  }
}

/**
 * Map a refresh/transaction history (newest first, as the API returns it)
 * to the `recentRuns` strip: OLDEST → NEWEST, terminal attempts only
 * (in-flight entries with no terminal status are skipped). `successLike`
 * decides which statuses count as ok for the given endpoint. Failed dataset
 * runs carry errorCode/errorDetail parsed from serviceExceptionJson so the
 * UI can explain each red dot; dataflows have no such payload.
 */
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

/** Derive refresh health from a dataset's recent refresh history. */
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

  // Newest first. 'Unknown' with no endTime is an in-flight refresh;
  // 'Unknown' WITH an endTime is how the v1 endpoint reports a completed
  // on-demand refresh (same convention as getDatasetRefreshInfo).
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

/**
 * Pure overdue math for the schedule-vs-reality check (the fetching wrapper —
 * getDatasetScheduleInfo in powerbi/insights.ts — explains the policy): flag
 * an enabled schedule overdue when the last success is older than twice the
 * schedule's expected cadence (minimum 24h so a multi-daily schedule with
 * one missed slot doesn't immediately alarm). Datasets without a schedule
 * (live connections, push datasets) simply return no fields.
 */
export function deriveScheduleInfo(
  sched: { days?: string[]; times?: string[]; enabled?: boolean; localTimeZoneId?: string } | null | undefined,
  lastSuccessTime?: string,
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
    scheduleOverdue = Date.now() - Date.parse(lastSuccessTime) > overdueAfterMs;
  } else {
    // Enabled schedule but no success ever recorded — that IS overdue.
    scheduleOverdue = true;
  }
  return { scheduleSummary, scheduleOverdue };
}

/** Derive refresh health from a dataflow's recent transactions. */
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
