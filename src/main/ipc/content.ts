import { ipcMain } from 'electron';
import { promises as fs } from 'fs';
import { powerbiApiService } from '../services/powerbi-api';
import { validateUUID } from '../../shared/validation';
import { isValidExportPath } from '../security';

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

      if (!filePath) {
        return { success: false, error: { code: 'NO_PATH', message: 'No export path provided' } };
      }

      if (!isValidExportPath(filePath)) {
        return { success: false, error: { code: 'INVALID_PATH', message: 'Export path must be a .pdf under user directory' } };
      }

      const exportResponse = await powerbiApiService.exportReportToPdf(rId, wId, pageName, bookmarkState);

      if (!exportResponse.success) {
        return exportResponse;
      }

      await fs.writeFile(filePath, exportResponse.data);
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

  ipcMain.handle('content:get-all-items', async () => {
    return await powerbiApiService.getAllItems();
  });

  // ARCH-S5: the dead 'content:get-recent' channel was removed — the renderer
  // reads recents via 'usage:get-recent' (usageTrackingService), so this handler
  // (which duplicated that logic) had no consumer.
}
