/**
 * Data-source factory + persisted mode switch.
 *
 * 'mock' = sample fleet (no sign-in, default — the app must render
 *          end-to-end in Expo Go out of the box).
 * 'live' = real Power BI REST via LiveFleetClient + the MSAL-style auth
 *          module (sign in once, silent refresh thereafter).
 *
 * The saved mode lives in SecureStore alongside the tokens — tiny value,
 * and it keeps all persistence behind one well-understood API.
 */
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
} from './report-catalog';
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

/**
 * Everything the Reports tab needs in live mode, behind one seam: list the
 * real reports, derive a canvas from a report's dataset, run its visuals'
 * DAX, and read refresh status for the honest "can't query" card.
 * There is NO mock counterpart — signed out, the Reports tab shows only a
 * sign-in card. Real data or an honest explanation, nothing fake.
 */
export interface ReportsModel {
  catalog: ReportCatalog;
  deriveCanvas(report: ReportRef, opts?: DeriveOptions): Promise<CanvasSpec>;
  makeRunner(datasetId: string): (dax: string) => Promise<QueryResult>;
  fetchRefresh(report: ReportRef): Promise<LatestRefresh | null>;
}

export function createReportsModel(mode: DataMode): ReportsModel | null {
  if (mode !== 'live') {
    // Leaving live (sign-out / mode switch) — derived canvases die with it.
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
    makeRunner: (datasetId) => (dax) => executeDax(tokens, datasetId, dax),
    fetchRefresh: (report) =>
      report.datasetId
        ? fetchLatestRefresh(tokens, report.datasetId, report.workspaceId)
        : Promise.resolve(null),
  };
}

/** Persisted mode; defaults to 'mock' (first run, unknown value, or an
 *  unreadable store must never strand the app on a sign-in wall). */
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
