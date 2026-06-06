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

// Narrow interface — only the two methods this module actually calls, fully
// typed. Both the real electron-store and the in-memory fallback satisfy it,
// so no `as never` / `as unknown` casts are needed at the call sites.
interface UsageStoreLike {
  get(key: 'usageRecords', defaultValue: UsageRecord[]): UsageRecord[];
  set(key: 'usageRecords', value: UsageRecord[]): void;
}

// In-memory fallback used only if the on-disk store cannot be opened.
// Initialized empty (matching the default), so the defaultValue argument is
// effectively a contract reminder rather than a fallback path — the records
// field always holds a valid array.
function createMemoryStore(): UsageStoreLike {
  let records: UsageRecord[] = [];
  return {
    get(_key, _defaultValue) {
      return records;
    },
    set(_key, value) {
      records = value;
    },
  };
}

function createUsageStore(): UsageStoreLike {
  try {
    const store = new Store<UsageStore>({
      name: 'usage-tracking',
      defaults: {
        usageRecords: [],
      },
      // If the on-disk JSON is corrupt, drop it instead of throwing at module load.
      clearInvalidConfig: true,
    });
    // Adapter narrows electron-store's broader overload set to the two typed
    // calls this module actually makes — eliminates type casts at call sites.
    return {
      get: (key, defaultValue) => store.get(key, defaultValue),
      set: (key, value) => store.set(key, value),
    };
  } catch (error) {
    // Construction can still throw (e.g. unreadable file). Degrade gracefully by
    // falling back to an in-memory store rather than crashing startup.
    console.warn('[UsageTracking] Failed to load usage store, using in-memory fallback:', error);
    return createMemoryStore();
  }
}

const store = createUsageStore();

const MAX_RECORDS = 50; // Keep track of last 50 items
const NAME_MAX_LENGTH = 256; // Cap stored name/workspaceName to prevent store/log bloat

// Defensively coerce + cap a name field. Tolerates non-string callers (legacy
// or in-process) by stringifying, then trims and slices to NAME_MAX_LENGTH.
function capName(value: unknown): string {
  const s = typeof value === 'string' ? value : String(value ?? '');
  return s.trim().slice(0, NAME_MAX_LENGTH);
}

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
