import Store from 'electron-store';

interface UsageRecord {
  id: string;
  name: string;
  type: 'report' | 'dashboard';
  workspaceId: string;
  workspaceName: string;
  lastOpened: string; // ISO date string
  openCount: number;
}

interface UsageStore {
  usageRecords: UsageRecord[];
}

// Minimal in-memory fallback used only if the on-disk store cannot be opened.
// Implements just the get/set surface this module relies on, so a corrupt or
// unreadable config never crashes app startup.
function createMemoryStore(): Pick<Store<UsageStore>, 'get' | 'set'> {
  const data: UsageStore = { usageRecords: [] };
  return {
    get(key: string, defaultValue?: unknown) {
      const value = (data as unknown as Record<string, unknown>)[key];
      return (value === undefined ? defaultValue : value) as never;
    },
    set(key: string, value?: unknown) {
      if (typeof key === 'string') {
        (data as unknown as Record<string, unknown>)[key] = value;
      }
    },
  } as Pick<Store<UsageStore>, 'get' | 'set'>;
}

function createUsageStore(): Pick<Store<UsageStore>, 'get' | 'set'> {
  try {
    return new Store<UsageStore>({
      name: 'usage-tracking',
      defaults: {
        usageRecords: [],
      },
      // If the on-disk JSON is corrupt, drop it instead of throwing at module load.
      clearInvalidConfig: true,
    });
  } catch (error) {
    // Construction can still throw (e.g. unreadable file). Degrade gracefully by
    // falling back to an in-memory store rather than crashing startup.
    console.warn('[UsageTracking] Failed to load usage store, using in-memory fallback:', error);
    return createMemoryStore();
  }
}

const store = createUsageStore();

const MAX_RECORDS = 50; // Keep track of last 50 items

export const usageTrackingService = {
  /**
   * Record that an item was opened
   */
  recordItemOpened(item: {
    id: string;
    name: string;
    type: 'report' | 'dashboard';
    workspaceId: string;
    workspaceName: string;
  }): void {
    const records = store.get('usageRecords', []);

    // Find existing record
    const existingIndex = records.findIndex((r) => r.id === item.id);

    if (existingIndex >= 0) {
      // Update existing record - remove from current position and add to front
      const existingRecord = records[existingIndex]!;
      records.splice(existingIndex, 1);
      records.unshift({
        ...existingRecord,
        name: item.name, // Update name in case it changed
        workspaceName: item.workspaceName,
        lastOpened: new Date().toISOString(),
        openCount: existingRecord.openCount + 1,
      });
    } else {
      // Add new record at front
      records.unshift({
        id: item.id,
        name: item.name,
        type: item.type,
        workspaceId: item.workspaceId,
        workspaceName: item.workspaceName,
        lastOpened: new Date().toISOString(),
        openCount: 1,
      });
    }

    // Keep only the most recent MAX_RECORDS
    const trimmedRecords = records.slice(0, MAX_RECORDS);
    store.set('usageRecords', trimmedRecords);
  },

  /**
   * Get recent items sorted by last opened time
   */
  getRecentItems(): UsageRecord[] {
    const records = store.get('usageRecords', []);
    // Sort by lastOpened descending (most recent first)
    return [...records].sort((a, b) =>
      new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime()
    );
  },

  /**
   * Get frequent items sorted by open count
   */
  getFrequentItems(): UsageRecord[] {
    const records = store.get('usageRecords', []);
    // Sort by openCount descending (most opened first)
    return [...records].sort((a, b) => b.openCount - a.openCount);
  },

  /**
   * Clear all usage data
   */
  clearUsageData(): void {
    store.set('usageRecords', []);
  },

  /**
   * Get usage stats for an item
   */
  getItemStats(itemId: string): UsageRecord | null {
    const records = store.get('usageRecords', []);
    return records.find((r) => r.id === itemId) || null;
  },
};
