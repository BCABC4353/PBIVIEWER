import { app, ipcMain, shell } from 'electron';
import path from 'node:path';
import { PARTITION_NAME } from '../../shared/constants';
import { isDev } from '../window';

// PROD-S2: "Check for updates" opens the GitHub Releases page where the latest
// installer lives (manual, unsigned distribution — there is no in-app auto-update).

export function registerAppIpc(): void {
  ipcMain.handle('app:get-app-webview-config', () => {
    // Return the config the App webview needs to mount with the correct session.
    // partition: the partition name used by the main window. In dev mode we use
    // no partition (undefined/null), in production we use PARTITION_NAME.
    // userAgent: clean Chrome UA (Electron/app tokens stripped in index.ts) so
    // Microsoft allows silent SSO in the App <webview> (no "out of date browser").
    return { partition: isDev ? null : PARTITION_NAME, userAgent: app.userAgentFallback };
  });

  ipcMain.handle('app:get-version', () => {
    // Returns the version from package.json - single source of truth
    return app.getVersion();
  });

  // Open the bundled offline user guide (HTML) in the user's default browser.
  // Packaged: copied to <app>/resources/manual/ via electron-builder extraResources.
  // Dev: served from the source tree under docs/manual/.
  ipcMain.handle('app:open-user-guide', async () => {
    try {
      const guidePath = app.isPackaged
        ? path.join(process.resourcesPath, 'manual', 'PowerBI-Viewer-User-Guide.html')
        : path.join(app.getAppPath(), 'docs', 'manual', 'PowerBI-Viewer-User-Guide.html');
      // shell.openPath opens the file with the OS default handler (the browser for .html).
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

  // PROD-S2: open the GitHub Releases page (latest installer) in the browser.
  ipcMain.handle('app:check-for-updates', async () => {
    try {
      const currentVersion = app.getVersion();
      const releasesUrl = 'https://github.com/BCABC4353/PBIVIEWER/releases/latest';
      await shell.openExternal(releasesUrl);
      return { success: true, data: { currentVersion, releasesUrl } };
    } catch (err) {
      return {
        success: false,
        error: { code: 'CHECK_FOR_UPDATES_FAILED', message: String(err) },
      };
    }
  });
}
