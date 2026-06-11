
import { ipcMain, powerSaveBlocker } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { IPCResponse } from '../../shared/ipc-types';

let blockerId: number | null = null;

function isBlockerActive(): boolean {
  if (blockerId === null) return false;
  if (powerSaveBlocker.isStarted(blockerId)) return true;
  blockerId = null;
  return false;
}

export function releaseDisplaySleepBlocker(): void {
  try {
    if (blockerId !== null && powerSaveBlocker.isStarted(blockerId)) {
      powerSaveBlocker.stop(blockerId);
    }
  } catch {
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

  ipcMain.handle(IPC_CHANNELS.kiosk.allowDisplaySleep, () => {
    try {
      if (blockerId !== null && powerSaveBlocker.isStarted(blockerId)) {
        powerSaveBlocker.stop(blockerId);
      }
      blockerId = null;
      return ok(false);
    } catch (err) {
      blockerId = null;
      return fail(
        'KIOSK_ALLOW_SLEEP_FAILED',
        err instanceof Error ? err.message : String(err)
      );
    }
  });
}

export default registerKioskIpc;
