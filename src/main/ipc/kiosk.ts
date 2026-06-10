/**
 * Kiosk power-management IPC handlers.
 *
 * Exposes start/stop control over an Electron powerSaveBlocker so the display
 * stays awake while a presentation/slideshow runs on an unattended wall display.
 *
 * The blocker id is tracked module-locally. Both handlers are idempotent and
 * guard against double-start and stale-id leaks:
 *   - prevent-display-sleep: if a blocker is already active, it is reused (no
 *     second blocker is started). If a tracked id is no longer active (e.g. the
 *     OS released it), it is cleared and a fresh blocker is started.
 *   - allow-display-sleep: stops the active blocker if any; safe to call when
 *     none is active.
 */

import { ipcMain, powerSaveBlocker } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { IPCResponse } from '../../shared/ipc-types';

// Active powerSaveBlocker id, or null when no blocker is running. Module-local
// so the start/stop pair can coordinate and we never leak a second blocker.
let blockerId: number | null = null;

/**
 * Returns true if a blocker is currently tracked AND still reported active by
 * Electron. Reconciles our tracked id against Electron's view so a stale id
 * (released out-of-band) doesn't wedge us.
 */
function isBlockerActive(): boolean {
  if (blockerId === null) return false;
  if (powerSaveBlocker.isStarted(blockerId)) return true;
  // Tracked id is no longer active — drop it so the next start is clean.
  blockerId = null;
  return false;
}

/**
 * Release any active prevent-display-sleep blocker. Call on app quit so a
 * slideshow running on an unattended wall display (or a renderer that crashed
 * past its reload budget without firing the PresentationMode unmount cleanup)
 * doesn't leave the blocker dangling. The OS reclaims it on process exit anyway;
 * this is defense-in-depth for the kiosk path.
 */
export function releaseDisplaySleepBlocker(): void {
  try {
    if (blockerId !== null && powerSaveBlocker.isStarted(blockerId)) {
      powerSaveBlocker.stop(blockerId);
    }
  } catch {
    /* best-effort on quit */
  }
  blockerId = null;
}

function ok<T>(data: T): IPCResponse<T> {
  return { success: true, data };
}

function fail(code: string, message: string): IPCResponse<never> {
  return { success: false, error: { code, message } };
}

export function registerKioskIpc(): void {
  // Start (or reuse) a prevent-display-sleep blocker. Idempotent.
  ipcMain.handle(IPC_CHANNELS.kiosk.preventDisplaySleep, () => {
    try {
      if (isBlockerActive()) {
        return ok(true);
      }
      blockerId = powerSaveBlocker.start('prevent-display-sleep');
      return ok(powerSaveBlocker.isStarted(blockerId));
    } catch (err) {
      return fail(
        'KIOSK_PREVENT_SLEEP_FAILED',
        err instanceof Error ? err.message : String(err)
      );
    }
  });

  // Stop the active blocker, if any. Idempotent.
  ipcMain.handle(IPC_CHANNELS.kiosk.allowDisplaySleep, () => {
    try {
      if (blockerId !== null && powerSaveBlocker.isStarted(blockerId)) {
        powerSaveBlocker.stop(blockerId);
      }
      blockerId = null;
      return ok(false);
    } catch (err) {
      // Even on failure, clear our tracked id so we don't leak a reference.
      blockerId = null;
      return fail(
        'KIOSK_ALLOW_SLEEP_FAILED',
        err instanceof Error ? err.message : String(err)
      );
    }
  });
}

export default registerKioskIpc;
