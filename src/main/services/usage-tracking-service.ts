import Store from 'electron-store';
import { app } from 'electron';
import { promises as fs } from 'fs';
import * as path from 'path';
import log from 'electron-log/main';
import { USAGE } from '../../shared/constants';
import { capName } from '../../shared/validation';

// BEH-B3: accountId added so records can be scoped per user.
// Optional for back-compat with records written before v1.7.0.
interface UsageRecord {
  id: string;
  name: string;
  type: 'report' | 'dashboard';
  workspaceId: string;
  workspaceName: string;
  lastOpened: string; // ISO date string
  openCount: number;
  /** BEH-B3: homeAccountId from MSAL. Absent on legacy records. */
  accountId?: string;
}

interface UsageStore {
  usageRecords: UsageRecord[];
  /** BEH-B3: set to true after the one-time account-scoping migration runs. */
  migrationV170Done?: boolean;
}

// Narrow interface — only the two methods this module actually calls, fully
// typed. Both the real electron-store and the in-memory fallback satisfy it,
// so no `as never` / `as unknown` casts are needed at the call sites.
interface UsageStoreLike {
  get(key: 'usageRecords', defaultValue: UsageRecord[]): UsageRecord[];
  get(key: 'migrationV170Done', defaultValue: boolean): boolean;
  set(key: 'usageRecords', value: UsageRecord[]): void;
  set(key: 'migrationV170Done', value: boolean): void;
}

// In-memory fallback used only if the on-disk store cannot be opened.
// Initialized empty (matching the default), so the defaultValue argument is
// effectively a contract reminder rather than a fallback path — the records
// field always holds a valid array.
function createMemoryStore(): UsageStoreLike {
  let records: UsageRecord[] = [];
  let migDone = false;
  return {
    get(key: string, defaultValue: unknown) {
      if (key === 'usageRecords') return records as never;
      if (key === 'migrationV170Done') return migDone as never;
      return defaultValue as never;
    },
    set(key: string, value: unknown) {
      if (key === 'usageRecords') records = value as UsageRecord[];
      if (key === 'migrationV170Done') migDone = value as boolean;
    },
  } as UsageStoreLike;
}

function createUsageStore(): UsageStoreLike {
  try {
    const store = new Store<UsageStore>({
      name: 'usage-tracking',
      defaults: {
        usageRecords: [],
        migrationV170Done: false,
      },
      // If the on-disk JSON is corrupt, drop it instead of throwing at module load.
      clearInvalidConfig: true,
    });
    // Adapter narrows electron-store's broader overload set to the two typed
    // calls this module actually makes — eliminates type casts at call sites.
    return {
      get: (key, defaultValue) => store.get(key, defaultValue) as never,
      set: (key, value) => store.set(key, value as never),
    } as UsageStoreLike;
  } catch (error) {
    // Construction can still throw (e.g. unreadable file). Degrade gracefully by
    // falling back to an in-memory store rather than crashing startup.
    log.warn('[UsageTracking] Failed to load usage store, using in-memory fallback:', error);
    return createMemoryStore();
  }
}

const store = createUsageStore();

/**
 * BEH-B3: One-time migration — run once at startup.
 *
 * If the store contains records that predate per-account scoping (no accountId),
 * write a backup file to userData alongside usage-tracking.json, log the count,
 * then leave records in place (we cannot retrospectively assign an accountId).
 * The flag migrationV170Done prevents the backup being written on every launch.
 */
async function runMigrationIfNeeded(): Promise<void> {
  if (store.get('migrationV170Done', false)) return;

  const records = store.get('usageRecords', []);
  const legacyCount = records.filter((r) => !r.accountId).length;

  if (legacyCount > 0) {
    try {
      const userData = app.getPath('userData');
      const backupPath = path.join(userData, 'usage.pre-v1.7.0.bak.json');
      await fs.writeFile(backupPath, JSON.stringify(records, null, 2), 'utf-8');
      log.info(
        `[UsageTracking] Migrated ${legacyCount} legacy usage record(s) to per-account scoping. Backup: ${backupPath}`,
      );
    } catch (err) {
      // Backup failure is non-fatal — log and proceed.
      log.warn('[UsageTracking] Could not write migration backup:', err);
    }
  }

  store.set('migrationV170Done', true);
}

// Kick off migration asynchronously on module load. The public methods are
// synchronous by design; migration completes in the background and won't block
// app startup. The backup file is best-effort.
runMigrationIfNeeded().catch((err) => {
  log.warn('[UsageTracking] Migration failed unexpectedly:', err);
});

export const usageTrackingService = {
  /**
   * Record that an item was opened. Pass accountId (homeAccountId from MSAL)
   * so the record is scoped to the current user (BEH-B3).
   */
  recordItemOpened(item: {
    id: string;
    name: string;
    type: 'report' | 'dashboard';
    workspaceId: string;
    workspaceName: string;
    accountId?: string;
  }): void {
    const records = store.get('usageRecords', []);

    // Belt-and-braces: even though the IPC handler validates and caps these
    // fields, re-cap here to protect against legacy callers and any future
    // module-internal call site that bypasses the IPC boundary.
    const cappedName = capName(item.name);
    const cappedWorkspaceName = capName(item.workspaceName);

    // Find existing record
    const existingIndex = records.findIndex((r) => r.id === item.id);

    if (existingIndex >= 0) {
      // Update existing record - remove from current position and add to front
      const existingRecord = records[existingIndex]!;
      records.splice(existingIndex, 1);
      records.unshift({
        ...existingRecord,
        name: cappedName, // Update name in case it changed
        workspaceName: cappedWorkspaceName,
        lastOpened: new Date().toISOString(),
        openCount: existingRecord.openCount + 1,
        accountId: item.accountId ?? existingRecord.accountId,
      });
    } else {
      // Add new record at front
      records.unshift({
        id: item.id,
        name: cappedName,
        type: item.type,
        workspaceId: item.workspaceId,
        workspaceName: cappedWorkspaceName,
        lastOpened: new Date().toISOString(),
        openCount: 1,
        accountId: item.accountId,
      });
    }

    // Keep only the most recent MAX_RECORDS
    const trimmedRecords = records.slice(0, USAGE.MAX_RECORDS);
    store.set('usageRecords', trimmedRecords);
  },

  /**
   * Get recent items for a specific account, sorted by last opened time.
   * If accountId is omitted, returns all records (backward compat / admin views).
   *
   * Legacy records (no accountId, written before v1.7.0) are NOT included in
   * per-account reads: the `|| !r.accountId` clause was deliberately removed to
   * prevent cross-account visibility on shared machines. They remain visible only
   * when no accountId is passed (unscoped / admin path). To purge legacy rows,
   * call clearUsageData() (full wipe).
   */
  getRecentItems(accountId?: string): UsageRecord[] {
    const records = store.get('usageRecords', []);
    const filtered = accountId
      ? records.filter((r) => r.accountId === accountId)
      : records;
    // Sort by lastOpened descending (most recent first)
    return [...filtered].sort(
      (a, b) => new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime(),
    );
  },

  /**
   * Get frequent items for a specific account, sorted by open count.
   * If accountId is omitted, returns all records (backward compat / admin views).
   *
   * Legacy records (no accountId, written before v1.7.0) are NOT included in
   * per-account reads — see getRecentItems for the full rationale.
   */
  getFrequentItems(accountId?: string): UsageRecord[] {
    const records = store.get('usageRecords', []);
    const filtered = accountId
      ? records.filter((r) => r.accountId === accountId)
      : records;
    // Sort by openCount descending (most opened first)
    return [...filtered].sort((a, b) => b.openCount - a.openCount);
  },

  /**
   * Clear all usage data (unscoped — wipes the full store).
   */
  clearUsageData(): void {
    store.set('usageRecords', []);
  },

  /**
   * BEH-B3: Clear usage records belonging to a specific account.
   * Called by the auth logout path (LANE-AUTH) when usageClearOnLogout
   * dictates a wipe. Legacy records without an accountId are left intact
   * to avoid stranding old history that can't be re-attributed.
   */
  clearUsageDataForAccount(accountId: string): void {
    const records = store.get('usageRecords', []);
    const kept = records.filter((r) => r.accountId !== accountId);
    store.set('usageRecords', kept);
    // Log the count only — the full homeAccountId is PII-adjacent (stable per-
    // user/per-tenant identifier) and must not appear in on-disk log files.
    log.info(
      `[UsageTracking] Cleared ${records.length - kept.length} usage record(s) for account`,
    );
  },

  /**
   * NEW-PROD-5: permanently remove a single item from the usage store. Called
   * when a viewer gets a 404 for an item (the report/dashboard was deleted), so
   * the dead tile does not reappear on the next launch.
   */
  removeItem(itemId: string): void {
    const records = store.get('usageRecords', []);
    const kept = records.filter((r) => r.id !== itemId);
    if (kept.length !== records.length) {
      store.set('usageRecords', kept);
    }
  },

  /**
   * Get usage stats for an item
   */
  getItemStats(itemId: string): UsageRecord | null {
    const records = store.get('usageRecords', []);
    return records.find((r) => r.id === itemId) ?? null;
  },
};
