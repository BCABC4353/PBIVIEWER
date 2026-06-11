/**
 * Pure helpers for the App view's per-report freshness header.
 *
 * Power BI stamps each report inside an app individually (e.g. WORKFLOWS
 * 6/11 8:43 AM vs BILLING REPORTS 6/10 12:34 PM). The app embed is an SPA, so
 * the only reliable signal for WHICH report is on screen is the webview URL:
 * `https://app.powerbi.com/groups/me/apps/{appId}/reports/{reportId}/ReportSection…`.
 * These helpers are extracted from AppViewer so URL→reportId parsing and the
 * report→dataset targeting decision are testable without a webview.
 */

export interface DatasetWorkspacePair {
  datasetId: string;
  workspaceId: string;
}

/** The slice of an app report the freshness header needs. */
export interface AppReportFreshnessInfo {
  id: string;
  name: string;
  /** Empty string when the apps API (and the workspace backfill) had no dataset. */
  datasetId?: string;
  workspaceId?: string;
}

export interface FreshnessTarget {
  /**
   * 'report': the URL names a known report WITH a dataset — query that ONE
   * dataset so the header matches Power BI's own per-report stamp.
   * 'aggregate': app home / dashboard / unknown report — fall back to the
   * app-wide living-dataset aggregate (v2.2.10 behavior).
   */
  mode: 'report' | 'aggregate';
  datasets: DatasetWorkspacePair[];
}

// A reportId is a GUID path segment right after /reports/. The negative
// lookahead stops a 36-char prefix of a longer hex-ish token from matching.
const REPORT_ID_RE = /\/reports\/([0-9a-fA-F-]{36})(?![0-9a-fA-F-])/;

/**
 * Extract the viewed report's id from a Power BI app URL.
 * Returns the lowercased GUID, or null when the URL doesn't name a report
 * (app home, a dashboard, about:blank, …).
 */
export function parseReportIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const id = REPORT_ID_RE.exec(url)?.[1];
  return id ? id.toLowerCase() : null;
}

/**
 * Decide which dataset(s) the freshness poll should ask about.
 *
 * When `currentReportId` maps (case-insensitively) to a known app report that
 * carries a datasetId + workspaceId, target that single dataset. Otherwise —
 * no report in the URL, an id we don't know, or a report whose dataset the
 * API never disclosed — fall back to the app-wide aggregate list.
 */
export function selectFreshnessTarget(
  currentReportId: string | null,
  reports: ReadonlyArray<AppReportFreshnessInfo>,
  aggregateDatasets: ReadonlyArray<DatasetWorkspacePair>,
): FreshnessTarget {
  if (currentReportId) {
    const wanted = currentReportId.toLowerCase();
    const report = reports.find((r) => r.id.toLowerCase() === wanted);
    if (report?.datasetId && report.workspaceId) {
      return {
        mode: 'report',
        datasets: [{ datasetId: report.datasetId, workspaceId: report.workspaceId }],
      };
    }
  }
  return { mode: 'aggregate', datasets: [...aggregateDatasets] };
}
