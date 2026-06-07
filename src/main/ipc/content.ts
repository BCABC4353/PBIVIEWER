import { ipcMain } from 'electron';
import { promises as fs } from 'fs';
import { powerbiApiService } from '../services/powerbi-api';
import { usageTrackingService } from '../services/usage-tracking-service';
import { validateUUID } from '../validation';
import { isValidExportPath } from '../security';
import type { ContentItem } from '../../shared/types';

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

  ipcMain.handle('content:get-all-items', async () => {
    return await powerbiApiService.getAllItems();
  });

  ipcMain.handle('content:get-recent', async () => {
    // Return usage-based recent items instead of enumerating the entire tenant
    // This is much faster and doesn't cause timeouts on large tenants
    try {
      const items = usageTrackingService.getRecentItems();

      const contentItems: ContentItem[] = items.map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        workspaceId: item.workspaceId,
        workspaceName: item.workspaceName,
        lastOpened: item.lastOpened,
        openCount: item.openCount,
      }));

      return { success: true, data: contentItems };
    } catch (error) {
      return {
        success: false,
        error: { code: 'RECENT_FETCH_FAILED', message: String(error) },
      };
    }
  });
}
