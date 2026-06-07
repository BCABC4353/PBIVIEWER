import { ipcMain } from 'electron';
import { usageTrackingService } from '../services/usage-tracking-service';
import { validateUUID } from '../validation';
import type { ContentItem } from '../../shared/types';

export function registerUsageIpc(): void {
  ipcMain.handle('usage:record-open', async (_event, item: {
    id: string;
    name: string;
    type: 'report' | 'dashboard';
    workspaceId: string;
    workspaceName: string;
  }) => {
    // Validate every field; reject the whole payload on any invalid input so the
    // usage-tracking-service can assume sanitized data. Strings are trimmed and
    // length-capped at 256 chars to prevent log/store bloat from a hostile renderer.
    const NAME_MAX = 256;
    if (typeof item !== 'object' || item === null) {
      return { success: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid item payload' } };
    }
    const id = validateUUID((item as { id?: unknown }).id);
    const workspaceId = validateUUID((item as { workspaceId?: unknown }).workspaceId);
    const type = (item as { type?: unknown }).type;
    const rawName = (item as { name?: unknown }).name;
    const rawWorkspaceName = (item as { workspaceName?: unknown }).workspaceName;
    if (!id || !workspaceId) {
      return { success: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid id or workspaceId' } };
    }
    if (type !== 'report' && type !== 'dashboard') {
      return { success: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid type' } };
    }
    if (typeof rawName !== 'string' || typeof rawWorkspaceName !== 'string') {
      return { success: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid name or workspaceName' } };
    }
    // Narrow `type` to the union explicitly — TS doesn't carry the narrowed
    // literal through the object-shorthand destructure above.
    const itemType: 'report' | 'dashboard' = type;
    const sanitized = {
      id,
      name: rawName.trim().slice(0, NAME_MAX),
      type: itemType,
      workspaceId,
      workspaceName: rawWorkspaceName.trim().slice(0, NAME_MAX),
    };
    try {
      usageTrackingService.recordItemOpened(sanitized);
      return { success: true, data: undefined };
    } catch (error) {
      return { success: false, error: { code: 'USAGE_RECORD_FAILED', message: String(error) } };
    }
  });

  ipcMain.handle('usage:get-recent', async () => {
    try {
      const items = usageTrackingService.getRecentItems();

      const contentItems: ContentItem[] = items.map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        workspaceId: item.workspaceId,
        workspaceName: item.workspaceName,
        lastOpened: item.lastOpened,
        openCount: item.openCount,
      }));

      return { success: true, data: contentItems };
    } catch (error) {
      return { success: false, error: { code: 'USAGE_GET_RECENT_FAILED', message: String(error) } };
    }
  });

  ipcMain.handle('usage:get-frequent', async () => {
    try {
      const items = usageTrackingService.getFrequentItems();

      const contentItems: ContentItem[] = items.map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        workspaceId: item.workspaceId,
        workspaceName: item.workspaceName,
        lastOpened: item.lastOpened,
        openCount: item.openCount,
      }));

      return { success: true, data: contentItems };
    } catch (error) {
      return { success: false, error: { code: 'USAGE_GET_FREQUENT_FAILED', message: String(error) } };
    }
  });

  ipcMain.handle('usage:clear', async () => {
    try {
      usageTrackingService.clearUsageData();
      return { success: true, data: undefined };
    } catch (error) {
      return { success: false, error: { code: 'USAGE_CLEAR_FAILED', message: String(error) } };
    }
  });
}
