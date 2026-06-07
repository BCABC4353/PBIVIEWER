import { ipcMain, shell } from 'electron';
import * as path from 'path';
import log from 'electron-log/main';

// File log to userData (per-OS standard location). Console + DevTools also.
// `preload: false` so electron-log's renderer preload is NOT injected into the
// AAD auth-window's session, where it would expose `window.__electronLog` to a
// remote origin we don't control. The renderer doesn't use electron-log anyway.
export function setupLogging(): void {
  log.initialize({ preload: false });
  log.transports.file.level = 'info';
  log.transports.console.level = 'info';
  // Note: electron-log's errorHandler installs its own process.on('unhandledRejection'|'uncaughtException')
  // listeners — we do NOT install duplicates below, or each crash would be logged twice.
  log.errorHandler.startCatching({
    showDialog: false,
    onError: ({ error }: { error: Error }) => log.error('[main:unhandled]', error?.stack ?? String(error)),
  });
}

export function registerLogIpc(): void {
  ipcMain.handle('log:open-folder', async () => {
    try {
      const dir = path.dirname(log.transports.file.getFile().path);
      await shell.openPath(dir);
      return { success: true, data: undefined };
    } catch (err) {
      return { success: false, error: { code: 'LOG_OPEN_FAILED', message: String(err) } };
    }
  });
}
