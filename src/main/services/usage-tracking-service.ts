import Store from 'electron-store';
import { app } from 'electron';
import { promises as fs } from 'fs';
import * as path from 'path';
import log from 'electron-log/main';
import { USAGE } from '../../shared/constants';
import { capName } from '../../shared/validation';

interface UsageRecord {
  id: string;
  name: string;
  type: 'report' | 'dashboard';
  workspaceId: string;
  workspaceName: string;
  lastOpened: string;
  openCount: number;
  accountId?: string;
}

interface UsageStore {
  usageRecords: UsageRecord[];
  migrationV170Done?: boolean;
}

interface UsageStoreLike {
  get(key: 'usageRecords', defaultValue: UsageRecord[]): UsageRecord[];
  get(key: 'migrationV170Done', defaultValue: boolean): boolean;
  set(key: 'usageRecords', value: UsageRecord[]): void;
  set(key: 'migrationV170Done', value: boolean): void;
}

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
      clearInvalidConfig: true,
    });
    return {
      get: (key, defaultValue) => store.get(key, defaultValue) as never,
      set: (key, value) => store.set(key, value as never),
    } as UsageStoreLike;
  } catch (error) {
    log.warn('[UsageTracking] Failed to load usage store, using in-memory fallback:', error);
    return createMemoryStore();
  }
}

const store = createUsageStore();

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
      log.warn('[UsageTracking] Could not write migration backup:', err);
    }
  }

  store.set('migrationV170Done', true);
}

runMigrationIfNeeded().catch((err) => {
  log.warn('[UsageTracking] Migration failed unexpectedly:', err);
});

export const usageTrackingService = {
  recordItemOpened(item: {
    id: string;
    name: string;
    type: 'report' | 'dashboard';
    workspaceId: string;
    workspaceName: string;
    accountId?: string;
  }): void {
    const records = store.get('usageRecords', []);

    const cappedName = capName(item.name);
    const cappedWorkspaceName = capName(item.workspaceName);

    let existingIndex = records.findIndex(
      (r) => r.id === item.id && r.accountId === item.accountId,
    );
    if (existingIndex < 0) {
      existingIndex = records.findIndex(
        (r) => r.id === item.id && r.accountId === undefined,
      );
    }

    if (existingIndex >= 0) {
      const existingRecord = records[existingIndex]!;
      records.splice(existingIndex, 1);
      records.unshift({
        ...existingRecord,
        name: cappedName,
        workspaceName: cappedWorkspaceName,
        lastOpened: new Date().toISOString(),
        openCount: existingRecord.openCount + 1,
        accountId: item.accountId ?? existingRecord.accountId,
      });
    } else {
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

    const trimmedRecords = records.slice(0, USAGE.MAX_RECORDS);
    store.set('usageRecords', trimmedRecords);
  },

  getRecentItems(accountId?: string): UsageRecord[] {
    const records = store.get('usageRecords', []);
    const filtered = accountId
      ? records.filter((r) => r.accountId === accountId)
      : records;
    return [...filtered].sort(
      (a, b) => new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime(),
    );
  },

  getFrequentItems(accountId?: string): UsageRecord[] {
    const records = store.get('usageRecords', []);
    const filtered = accountId
      ? records.filter((r) => r.accountId === accountId)
      : records;
    return [...filtered].sort((a, b) => b.openCount - a.openCount);
  },

  clearUsageData(): void {
    store.set('usageRecords', []);
  },

  clearUsageDataForAccount(accountId: string): void {
    const records = store.get('usageRecords', []);
    const kept = records.filter((r) => r.accountId !== accountId);
    store.set('usageRecords', kept);
    log.info(
      `[UsageTracking] Cleared ${records.length - kept.length} usage record(s) for account`,
    );
  },

  removeItem(itemId: string): void {
    const records = store.get('usageRecords', []);
    const kept = records.filter((r) => r.id !== itemId);
    if (kept.length !== records.length) {
      store.set('usageRecords', kept);
    }
  },

  getItemStats(itemId: string): UsageRecord | null {
    const records = store.get('usageRecords', []);
    return records.find((r) => r.id === itemId) ?? null;
  },
};
