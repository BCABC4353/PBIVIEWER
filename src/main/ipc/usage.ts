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
    // Validate every field; reject the whole payload on any invalid input so the
    // usage-tracking-service can assume sanitized data. Strings are trimmed and
    // length-capped (NAME_MAX) to prevent log/store bloat from a hostile renderer.
    if (typeof item !== 'object' || item === null) {
      return { success: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid item payload' } };
    }
    const id = validateUUID((item as { id?: unknown }).id);
    const workspaceId = validateUUID((item as { workspaceId?: unknown }).workspaceId);
    const type = (item as { type?: unknown }).type;
    const rawName = (item as { name?: unknown }).name;
    const rawWorkspaceName = (item as { workspaceName?: unknown }).workspaceName;
    // BEH-B3: accountId is optional; validate it as a UUID when present, or allow
    // undefined/null (renderer may not have it yet for legacy code paths).
    const rawAccountId = (item as { accountId?: unknown }).accountId;
    let accountId: string | undefined;
    if (rawAccountId !== undefined && rawAccountId !== null) {
      // MSAL homeAccountId format is "<oid>.<tenantId>" — not a plain UUID.
      // Accept any non-empty string; just guard against wrong type.
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
    // Narrow `type` to the union explicitly — TS doesn't carry the narrowed
    // literal through the object-shorthand destructure above.
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

  // BEH-B3: accept optional accountId to scope results to the logged-in user.
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

  // BEH-B3: accept optional accountId to scope results to the logged-in user.
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
}
