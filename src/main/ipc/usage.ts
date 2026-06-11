import { ipcMain } from 'electron';
import { usageTrackingService } from '../services/usage-tracking-service';
import { validateUUID, capName } from '../../shared/validation';
import { USAGE } from '../../shared/constants';
import type { ContentItem } from '../../shared/types';

export function registerUsageIpc(): void {
  ipcMain.handle('usage:record-open', async (_event, item: {
    id: string;
    name: string;
    type: 'report' | 'dashboard';
    workspaceId: string;
    workspaceName: string;
    accountId?: string;
  }) => {
    if (typeof item !== 'object' || item === null) {
      return { success: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid item payload' } };
    }
    const id = validateUUID((item as { id?: unknown }).id);
    const workspaceId = validateUUID((item as { workspaceId?: unknown }).workspaceId);
    const type = (item as { type?: unknown }).type;
    const rawName = (item as { name?: unknown }).name;
    const rawWorkspaceName = (item as { workspaceName?: unknown }).workspaceName;
    const rawAccountId = (item as { accountId?: unknown }).accountId;
    let accountId: string | undefined;
    if (rawAccountId !== undefined && rawAccountId !== null) {
      if (typeof rawAccountId === 'string' && rawAccountId.trim().length > 0) {
        accountId = rawAccountId.trim().slice(0, USAGE.ACCOUNT_ID_MAX_LENGTH);
      } else {
        return { success: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid accountId' } };
      }
    }
    if (!id || !workspaceId) {
      return { success: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid id or workspaceId' } };
    }
    if (type !== 'report' && type !== 'dashboard') {
      return { success: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid type' } };
    }
    if (typeof rawName !== 'string' || typeof rawWorkspaceName !== 'string') {
      return { success: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid name or workspaceName' } };
    }
    const itemType: 'report' | 'dashboard' = type;
    const sanitized = {
      id,
      name: capName(rawName),
      type: itemType,
      workspaceId,
      workspaceName: capName(rawWorkspaceName),
      accountId,
    };
    try {
      usageTrackingService.recordItemOpened(sanitized);
      return { success: true, data: undefined };
    } catch (error) {
      return { success: false, error: { code: 'USAGE_RECORD_FAILED', message: String(error) } };
    }
  });

  ipcMain.handle('usage:get-recent', async (_event, accountId?: string) => {
    try {
      const scopedId = typeof accountId === 'string' && accountId.trim().length > 0
        ? accountId.trim()
        : undefined;
      const items = usageTrackingService.getRecentItems(scopedId);

      const contentItems: ContentItem[] = items.map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        workspaceId: item.workspaceId,
        workspaceName: item.workspaceName,
        lastOpened: item.lastOpened,
        openCount: item.openCount,
        accountId: item.accountId,
      }));

      return { success: true, data: contentItems };
    } catch (error) {
      return { success: false, error: { code: 'USAGE_GET_RECENT_FAILED', message: String(error) } };
    }
  });

  ipcMain.handle('usage:get-frequent', async (_event, accountId?: string) => {
    try {
      const scopedId = typeof accountId === 'string' && accountId.trim().length > 0
        ? accountId.trim()
        : undefined;
      const items = usageTrackingService.getFrequentItems(scopedId);

      const contentItems: ContentItem[] = items.map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        workspaceId: item.workspaceId,
        workspaceName: item.workspaceName,
        lastOpened: item.lastOpened,
        openCount: item.openCount,
        accountId: item.accountId,
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

  ipcMain.handle('usage:remove', async (_event, itemId: unknown) => {
    const id = validateUUID(itemId);
    if (!id) {
      return { success: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid item id' } };
    }
    try {
      usageTrackingService.removeItem(id);
      return { success: true, data: undefined };
    } catch (error) {
      return { success: false, error: { code: 'USAGE_REMOVE_FAILED', message: String(error) } };
    }
  });
}
