import { ipcMain } from 'electron';
import { promises as fs } from 'fs';
import { powerbiApiService } from '../services/powerbi-api';
import { validateUUID } from '../../shared/validation';
import { isValidExportPath } from '../security';
import { consumeExportPath } from './export-paths';

const MAX_PAGE_NAME_LEN = 256;
const MAX_BOOKMARK_STATE_LEN = 64 * 1024;

export function registerContentIpc(): void {
  ipcMain.handle('content:get-workspaces', async () => {
    return await powerbiApiService.getWorkspaces();
  });

  ipcMain.handle('content:get-reports', async (_event, workspaceId: string) => {
    const id = validateUUID(workspaceId);
    if (!id) return { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid workspace ID' } };
    return await powerbiApiService.getReports(id);
  });

  ipcMain.handle('content:get-dashboards', async (_event, workspaceId: string) => {
    const id = validateUUID(workspaceId);
    if (!id) return { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid workspace ID' } };
    return await powerbiApiService.getDashboards(id);
  });

  ipcMain.handle('content:get-dashboard', async (_event, workspaceId: string, dashboardId: string) => {
    const wsId = validateUUID(workspaceId);
    const dbId = validateUUID(dashboardId);
    if (!wsId || !dbId) return { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid ID' } };
    return await powerbiApiService.getDashboard(wsId, dbId);
  });

  ipcMain.handle('content:get-apps', async () => {
    return await powerbiApiService.getApps();
  });

  ipcMain.handle('content:get-app', async (_event, appId: string) => {
    const id = validateUUID(appId);
    if (!id) return { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid app ID' } };
    return await powerbiApiService.getApp(id);
  });

  ipcMain.handle('content:get-app-reports', async (_event, appId: string) => {
    const id = validateUUID(appId);
    if (!id) return { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid app ID' } };
    return await powerbiApiService.getAppReports(id);
  });

  ipcMain.handle('content:get-app-dashboards', async (_event, appId: string) => {
    const id = validateUUID(appId);
    if (!id) return { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid app ID' } };
    return await powerbiApiService.getAppDashboards(id);
  });

  ipcMain.handle('content:resolve-app-report-dataset', async (_event, appId: string, reportId: string) => {
    const aId = validateUUID(appId);
    const rId = validateUUID(reportId);
    if (!aId || !rId) return { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid ID' } };
    return await powerbiApiService.resolveAppReportDataset(aId, rId);
  });

  ipcMain.handle('content:get-embed-token', async (_event, reportId: string, workspaceId: string) => {
    const rId = validateUUID(reportId);
    const wId = validateUUID(workspaceId);
    if (!rId || !wId) return { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid ID' } };
    return await powerbiApiService.getEmbedToken(rId, wId);
  });

  ipcMain.handle(
    'content:export-report-pdf',
    async (
      _event,
      reportId: string,
      workspaceId: string,
      pageName?: string,
      bookmarkState?: string,
      filePath?: string
    ) => {
      const rId = validateUUID(reportId);
      const wId = validateUUID(workspaceId);
      if (!rId || !wId) return { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid ID' } };

      if (typeof pageName === 'string' && pageName.length > MAX_PAGE_NAME_LEN) {
        return { success: false, error: { code: 'INVALID_INPUT', message: 'pageName exceeds maximum length' } };
      }
      if (typeof bookmarkState === 'string' && bookmarkState.length > MAX_BOOKMARK_STATE_LEN) {
        return { success: false, error: { code: 'INVALID_INPUT', message: 'bookmarkState exceeds maximum length' } };
      }

      if (!filePath) {
        return { success: false, error: { code: 'NO_PATH', message: 'No export path provided' } };
      }

      if (!isValidExportPath(filePath)) {
        return { success: false, error: { code: 'INVALID_PATH', message: 'Export path must be a .pdf under user directory' } };
      }

      if (!consumeExportPath(filePath)) {
        return { success: false, error: { code: 'INVALID_PATH', message: 'Export path was not chosen via the save dialog' } };
      }

      const exportResponse = await powerbiApiService.exportReportToPdf(rId, wId, pageName, bookmarkState);

      if (!exportResponse.success) {
        return exportResponse;
      }

      const tmpPath = `${filePath}.${process.pid}.tmp`;
      try {
        await fs.writeFile(tmpPath, exportResponse.data);
        await fs.rm(filePath, { force: true });
        await fs.rename(tmpPath, filePath);
      } catch (err) {
        await fs.rm(tmpPath, { force: true }).catch(() => {});
        return { success: false, error: { code: 'EXPORT_WRITE_FAILED', message: String(err) } };
      }
      return { success: true, data: { path: filePath } };
    }
  );

  ipcMain.handle('content:get-dataset-refresh-info', async (_event, datasetId: string, workspaceId?: string) => {
    const dId = validateUUID(datasetId);
    if (!dId) return { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid dataset ID' } };
    const wId = workspaceId ? validateUUID(workspaceId) : undefined;
    if (workspaceId && !wId) return { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid workspace ID' } };
    return await powerbiApiService.getDatasetRefreshInfo(dId, wId ?? undefined);
  });

  ipcMain.handle('content:get-dashboard-data-freshness', async (_event, dashboardId: string, workspaceId: string) => {
    const dbId = validateUUID(dashboardId);
    const wsId = validateUUID(workspaceId);
    if (!dbId || !wsId) return { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid ID' } };
    return await powerbiApiService.getDashboardDataFreshness(dbId, wsId);
  });

  ipcMain.handle(
    'content:get-data-freshness',
    async (
      _event,
      workspaceId: string,
      datasetIds: Array<string | { datasetId: string; workspaceId: string }>,
      dashboardId?: string,
    ) => {
      const wsId = validateUUID(workspaceId);
      if (!wsId) return { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid workspace ID' } };
      const ids: Array<string | { datasetId: string; workspaceId: string }> = [];
      if (Array.isArray(datasetIds)) {
        for (const entry of datasetIds) {
          if (typeof entry === 'string') {
            const id = validateUUID(entry);
            if (id) ids.push(id);
          } else if (entry && typeof entry === 'object') {
            const dId = validateUUID(entry.datasetId);
            const dWsId = validateUUID(entry.workspaceId);
            if (dId && dWsId) ids.push({ datasetId: dId, workspaceId: dWsId });
          }
        }
      }
      const dbId = dashboardId ? validateUUID(dashboardId) : undefined;
      if (dashboardId && !dbId) {
        return { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid dashboard ID' } };
      }
      return await powerbiApiService.getDataFreshness(wsId, ids, dbId ?? undefined);
    },
  );

  ipcMain.handle('content:get-all-items', async () => {
    return await powerbiApiService.getAllItems();
  });

  ipcMain.handle('content:get-insights', async (_event, force?: boolean) => {
    return await powerbiApiService.getInsightsSnapshot(force === true);
  });

  ipcMain.handle('content:get-admin-insights', async (_event, days?: number, force?: boolean) => {
    const d = typeof days === 'number' && Number.isFinite(days) ? days : 2;
    return await powerbiApiService.getAdminInsights(d, force === true);
  });

}
