import { ipcMain, shell } from 'electron';
import * as path from 'path';
import log from 'electron-log/main';

// PERF-S3: rate-limit constants for the onError handler.
// At most one raw error is forwarded per ERROR_FLOOR_MS; any suppressed errors
// within that window are counted and emitted as a summary line.
const ERROR_FLOOR_MS = 1_000;

let _lastErrorAt = 0;
let _suppressedCount = 0;

// File log to userData (per-OS standard location). Console + DevTools also.
// `preload: false` so electron-log's renderer preload is NOT injected into the
// AAD auth-window's session, where it would expose `window.__electronLog` to a
// remote origin we don't control. The renderer doesn't use electron-log anyway.
export function setupLogging(): void {
  log.initialize({ preload: false });
  log.transports.file.level = 'info';
  log.transports.console.level = 'info';

  // PERF-S3: cap file size at 5 MB. electron-log's default archiveLogFn already
  // rotates to a single "<name>.old.log" sibling file, so no custom archiveLog
  // override is needed — just setting maxSize is sufficient for single-archive
  // retention.
  log.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB

  // Note: electron-log's errorHandler installs its own process.on('unhandledRejection'|'uncaughtException')
  // listeners — we do NOT install duplicates below, or each crash would be logged twice.
  log.errorHandler.startCatching({
    showDialog: false,
    onError: ({ error }: { error: Error }) => {
      // PERF-S3: rate-limit — emit the real error at most once per ERROR_FLOOR_MS.
      // Count suppressed errors and flush the count as a summary on the next
      // error that makes it through the floor.
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
