import * as safeStore from './safe-store';
import type { DataSource } from './types';
import { MockDataSource } from './mock-data';
import { LiveFleetClient } from './fleet-client';
import { authTokenProvider } from '../auth/token-provider';
import {
  LiveReportCatalog,
  fetchLatestRefresh,
  type LatestRefresh,
  type ReportCatalog,
  type ReportRef,
 resolveReportDatasetId } from './report-catalog';
import {
  clearCanvasSpecCache,
  deriveCanvasForDataset,
  type DeriveOptions,
} from './canvas-crosswalk';
import { executeDax, type CanvasSpec, type QueryResult } from './dax';

export type DataMode = 'mock' | 'live';

const MODE_KEY = 'pbiviewer.data.mode';

export function createDataSource(mode: DataMode): DataSource {
  return mode === 'live'
    ? new LiveFleetClient(authTokenProvider)
    : new MockDataSource();
}

export interface ReportsModel {
  catalog: ReportCatalog;
  deriveCanvas(report: ReportRef, opts?: DeriveOptions): Promise<CanvasSpec>;
  resolveDatasetId(report: ReportRef): Promise<string | null>;
  makeRunner(datasetId: string): (dax: string) => Promise<QueryResult>;
  fetchRefresh(report: ReportRef): Promise<LatestRefresh | null>;
}

export function createReportsModel(mode: DataMode): ReportsModel | null {
  if (mode !== 'live') {
    clearCanvasSpecCache();
    return null;
  }
  const tokens = authTokenProvider;
  return {
    catalog: new LiveReportCatalog(tokens),
    deriveCanvas: (report, opts) =>
      report.datasetId
        ? deriveCanvasForDataset(tokens, report.datasetId, report.name, opts)
        : Promise.reject(new Error('Report has no dataset')),
    resolveDatasetId: (report) => resolveReportDatasetId(tokens, report),
    makeRunner: (datasetId) => (dax) => executeDax(tokens, datasetId, dax),
    fetchRefresh: (report) =>
      report.datasetId
        ? fetchLatestRefresh(tokens, report.datasetId, report.workspaceId)
        : Promise.resolve(null),
  };
}

export async function getSavedMode(): Promise<DataMode> {
  try {
    const v = await safeStore.getItem(MODE_KEY);
    return v === 'live' ? 'live' : 'mock';
  } catch {
    return 'mock';
  }
}

export async function setSavedMode(mode: DataMode): Promise<void> {
  await safeStore.setItem(MODE_KEY, mode);
}
