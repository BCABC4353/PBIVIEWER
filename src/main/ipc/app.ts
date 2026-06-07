import { app, ipcMain } from 'electron';
import { PARTITION_NAME } from '../../shared/constants';
import { isDev } from '../window';

// PROD-S2: TODO — replace with this app's actual releases URL once a release
// channel is established (add a `homepage` or `repository.url` field to
// package.json and derive from it). Until then the handler returns the running
// version so the renderer can display it, but does NOT open an external page to
// avoid directing users to an unrelated repository.

export function registerAppIpc(): void {
  ipcMain.handle('app:get-partition-name', () => {
    // Return the partition name used by the main window
    // In dev mode, we use no partition (undefined/null), in production we use PARTITION_NAME
    return isDev ? null : PARTITION_NAME;
  });

  ipcMain.handle('app:get-version', () => {
    // Returns the version from package.json - single source of truth
    return app.getVersion();
  });

  // PROD-S2: anonymous current-vs-latest version check.
  // Returns the running version string so the renderer can display it.
  // External navigation is intentionally omitted until this app has a real
  // release channel — previously this opened an unrelated Microsoft sample
  // repository which would have confused users looking for app updates.
  ipcMain.handle('app:check-for-updates', () => {
    try {
      const currentVersion = app.getVersion();
      // releasesUrl is intentionally absent until a release channel exists.
      return { success: true, data: { currentVersion, releasesUrl: null } };
    } catch (err) {
      return {
        success: false,
        error: { code: 'CHECK_FOR_UPDATES_FAILED', message: String(err) },
      };
    }
  });
}
