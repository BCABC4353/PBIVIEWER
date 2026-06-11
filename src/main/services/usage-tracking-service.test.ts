import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory electron-store stub (mirrors token-cache.test.ts). The service
// only calls get/set; the stub honors the constructor's `defaults` just enough
// to seed the backing map, and ignores name/clearInvalidConfig.
// ---------------------------------------------------------------------------
vi.mock('electron-store', () => {
  return {
    default: class {
      private data: Map<string, unknown>;
      constructor(opts?: { defaults?: Record<string, unknown> }) {
        this.data = new Map(Object.entries(opts?.defaults ?? {}));
      }
      get(key: string, defaultValue?: unknown): unknown {
        return this.data.has(key) ? this.data.get(key) : defaultValue;
      }
      set(key: string, value: unknown): void {
        this.data.set(key, value);
      }
    },
  };
});

// The module-load migration touches app.getPath/electron-log; stub both so
// importing the service under jsdom never reaches real electron internals.
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
}));
vi.mock('electron-log/main', () => ({
  default: { info: vi.fn(), warn: vi.fn() },
}));

import { usageTrackingService } from './usage-tracking-service';

const base = {
  name: 'Sales Daily',
  type: 'report' as const,
  workspaceId: 'ws-1',
  workspaceName: 'WS',
};

beforeEach(() => {
  // The store is module-level; wipe it so tests don't leak records.
  usageTrackingService.clearUsageData();
});

describe('usageTrackingService.recordItemOpened (per-account record matching)', () => {
  it('keeps separate per-account records for the same item id (no cross-account steal)', () => {
    usageTrackingService.recordItemOpened({ ...base, id: 'item-1', accountId: 'acct-a' });
    usageTrackingService.recordItemOpened({ ...base, id: 'item-1', accountId: 'acct-b' });

    const aItems = usageTrackingService.getRecentItems('acct-a');
    const bItems = usageTrackingService.getRecentItems('acct-b');
    expect(aItems).toHaveLength(1);
    expect(bItems).toHaveLength(1);
    // B's open must NOT have re-scoped or incremented A's record.
    expect(aItems[0]!.accountId).toBe('acct-a');
    expect(aItems[0]!.openCount).toBe(1);
    expect(bItems[0]!.accountId).toBe('acct-b');
    expect(bItems[0]!.openCount).toBe(1);
  });

  it('increments the same account record on repeat opens', () => {
    usageTrackingService.recordItemOpened({ ...base, id: 'item-1', accountId: 'acct-a' });
    usageTrackingService.recordItemOpened({ ...base, id: 'item-1', accountId: 'acct-a' });

    const aItems = usageTrackingService.getRecentItems('acct-a');
    expect(aItems).toHaveLength(1);
    expect(aItems[0]!.openCount).toBe(2);
  });

  it('lets the first account that touches a legacy (accountId-less) record claim it', () => {
    // Legacy record: written without an accountId (pre-v1.7.0 caller).
    usageTrackingService.recordItemOpened({ ...base, id: 'item-1' });
    expect(usageTrackingService.getItemStats('item-1')!.accountId).toBeUndefined();

    usageTrackingService.recordItemOpened({ ...base, id: 'item-1', accountId: 'acct-a' });

    // Claimed (count carried over, accountId stamped), not duplicated.
    const aItems = usageTrackingService.getRecentItems('acct-a');
    expect(aItems).toHaveLength(1);
    expect(aItems[0]!.openCount).toBe(2);
    expect(aItems[0]!.accountId).toBe('acct-a');
    expect(usageTrackingService.getRecentItems()).toHaveLength(1);
  });

  it('prefers the exact same-account match over claiming a legacy record', () => {
    usageTrackingService.recordItemOpened({ ...base, id: 'item-1', accountId: 'acct-a' });
    // An unscoped open does not touch A's record — it writes a legacy row.
    usageTrackingService.recordItemOpened({ ...base, id: 'item-1' });
    // A's next open must update A's row, not claim the legacy one.
    usageTrackingService.recordItemOpened({ ...base, id: 'item-1', accountId: 'acct-a' });

    const aItems = usageTrackingService.getRecentItems('acct-a');
    expect(aItems).toHaveLength(1);
    expect(aItems[0]!.openCount).toBe(2);
    // The legacy row survives untouched (visible only on the unscoped read).
    const all = usageTrackingService.getRecentItems();
    expect(all).toHaveLength(2);
    expect(all.filter((r) => r.accountId === undefined)).toHaveLength(1);
  });
});
