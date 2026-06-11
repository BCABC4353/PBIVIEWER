import { app, ipcMain, shell } from 'electron';
import path from 'node:path';
import { PARTITION_NAME } from '../../shared/constants';
import { isDev } from '../window';

export function registerAppIpc(): void {
  ipcMain.handle('app:get-app-webview-config', () => {
    return { partition: isDev ? null : PARTITION_NAME, userAgent: app.userAgentFallback };
  });

  ipcMain.handle('app:get-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('app:open-user-guide', async () => {
    try {
      const guidePath = app.isPackaged
        ? path.join(process.resourcesPath, 'manual', 'PowerBI-Viewer-User-Guide.html')
        : path.join(app.getAppPath(), 'docs', 'manual', 'PowerBI-Viewer-User-Guide.html');
      const err = await shell.openPath(guidePath);
      if (err) {
        return { success: false, error: { code: 'OPEN_USER_GUIDE_FAILED', message: err } };
      }
      return { success: true, data: undefined };
    } catch (err) {
      return {
        success: false,
        error: { code: 'OPEN_USER_GUIDE_FAILED', message: String(err) },
      };
    }
  });
}
