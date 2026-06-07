import { app, ipcMain } from 'electron';
import { PARTITION_NAME } from '../../shared/constants';
import { isDev } from '../window';

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
}
