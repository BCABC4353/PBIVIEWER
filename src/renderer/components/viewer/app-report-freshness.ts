
export interface DatasetWorkspacePair {
  datasetId: string;
  workspaceId: string;
}

export interface AppReportFreshnessInfo {
  id: string;
  name: string;
  datasetId?: string;
  workspaceId?: string;
  originalReportObjectId?: string;
}

export interface FreshnessTarget {
  mode: 'report' | 'aggregate';
  datasets: DatasetWorkspacePair[];
  unresolvedReportId?: string;
}

const GUID_SOURCE = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const REPORT_ID_RES = [
  new RegExp(`/reports/(${GUID_SOURCE})(?![0-9a-fA-F-])`),
  new RegExp(`/rdlreports/(${GUID_SOURCE})(?![0-9a-fA-F-])`),
  new RegExp(`[?&]reportId=(${GUID_SOURCE})(?![0-9a-fA-F-])`),
];

export function parseReportIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  for (const re of REPORT_ID_RES) {
    const id = re.exec(url)?.[1];
    if (id) return id.toLowerCase();
  }
  return null;
}

export function selectFreshnessTarget(
  currentReportId: string | null,
  reports: ReadonlyArray<AppReportFreshnessInfo>,
  aggregateDatasets: ReadonlyArray<DatasetWorkspacePair>,
): FreshnessTarget {
  if (currentReportId) {
    const wanted = currentReportId.toLowerCase();
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
    return { mode: 'aggregate', datasets: [...aggregateDatasets], unresolvedReportId: wanted };
  }
  return { mode: 'aggregate', datasets: [...aggregateDatasets] };
}
