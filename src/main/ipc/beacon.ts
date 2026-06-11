import { ipcMain } from 'electron';
import { getIssueBeacon } from '../services/issue-beacon-service';
import { IPC_CHANNELS } from '../../shared/ipc-channels';

export function registerBeaconIpc(): void {
  ipcMain.handle(
    IPC_CHANNELS.beacon.report,
    (_event, payload: { code?: unknown; httpStatus?: unknown; itemName?: unknown; context?: unknown }) => {
      const code = typeof payload?.code === 'string' ? payload.code : 'UNKNOWN';
      const httpStatus = typeof payload?.httpStatus === 'number' ? payload.httpStatus : undefined;
      const itemName = typeof payload?.itemName === 'string' ? payload.itemName : undefined;
      const context = typeof payload?.context === 'string' ? payload.context : undefined;
      getIssueBeacon().record({ code, httpStatus, itemName, context });
      return { success: true, data: undefined };
    },
  );
}
