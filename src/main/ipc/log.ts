import { ipcMain, shell } from 'electron';
import * as path from 'path';
import log from 'electron-log/main';

const ERROR_FLOOR_MS = 1_000;

let _lastErrorAt = 0;
let _suppressedCount = 0;

export function setupLogging(): void {
  log.initialize({ preload: false });
  log.transports.file.level = 'info';
  log.transports.console.level = 'info';

  log.transports.file.maxSize = 5 * 1024 * 1024;

  log.errorHandler.startCatching({
    showDialog: false,
    onError: ({ error }: { error: Error }) => {
      const now = Date.now();
      if (now - _lastErrorAt < ERROR_FLOOR_MS) {
        _suppressedCount++;
        return;
      }
      if (_suppressedCount > 0) {
        log.warn(`[main:unhandled] ${_suppressedCount} error(s) suppressed by rate-limiter`);
        _suppressedCount = 0;
      }
      _lastErrorAt = now;
      log.error('[main:unhandled]', error?.stack ?? String(error));
    },
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
