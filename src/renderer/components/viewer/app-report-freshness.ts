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
  /** The SAME report's id in the app's source workspace — app URLs can name
   *  a report by either GUID, so matching accepts both. */
  originalReportObjectId?: string;
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
  /**
   * Set when the URL DID name a report but the known-list match could not
   * produce a dataset (an id the list doesn't carry, or a listed report
   * without a datasetId). The caller can hand this id to the main-process
   * resolver (content.resolveAppReportDataset) for a direct API lookup
   * instead of settling for the aggregate stamp. Lowercased.
   */
  unresolvedReportId?: string;
}

// A reportId is a GUID path segment right after /reports/ (interactive) or
// /rdlreports/ (paginated); some Power BI routes carry it as a ?reportId=
// query param instead. The pattern is a REAL 8-4-4-4-12 GUID (not any 36-char
// hex/dash run, which also matched runs of dashes or ungrouped hex); the
// negative lookahead stops a GUID-shaped prefix of a longer token.
const GUID_SOURCE = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const REPORT_ID_RES = [
  new RegExp(`/reports/(${GUID_SOURCE})(?![0-9a-fA-F-])`),
  new RegExp(`/rdlreports/(${GUID_SOURCE})(?![0-9a-fA-F-])`),
  new RegExp(`[?&]reportId=(${GUID_SOURCE})(?![0-9a-fA-F-])`),
];

/**
 * Extract the viewed report's id from a Power BI app URL.
 * Returns the lowercased GUID, or null when the URL doesn't name a report
 * (app home, a dashboard, about:blank, …).
 */
export function parseReportIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  for (const re of REPORT_ID_RES) {
    const id = re.exec(url)?.[1];
    if (id) return id.toLowerCase();
  }
  return null;
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
    // The URL can name the report by its app-scoped id OR by its source-
    // workspace original (Power BI routes both forms) — accept either.
    const report = reports.find(
      (r) =>
        r.id.toLowerCase() === wanted ||
        (r.originalReportObjectId && r.originalReportObjectId.toLowerCase() === wanted),
    );
    if (report?.datasetId && report.workspaceId) {
      return {
        mode: 'report',
        datasets: [{ datasetId: report.datasetId, workspaceId: report.workspaceId }],
      };
    }
    // A report IS on screen but the list couldn't target it — tell the caller
    // which id to escalate to the direct API resolver.
    return { mode: 'aggregate', datasets: [...aggregateDatasets], unresolvedReportId: wanted };
  }
  return { mode: 'aggregate', datasets: [...aggregateDatasets] };
}
