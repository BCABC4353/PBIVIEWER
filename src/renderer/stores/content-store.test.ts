import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useContentStore } from './content-store';
import { useAuthStore } from './auth-store';
import type { ContentItem } from '../../shared/types';


function item(id: string): ContentItem {
  return {
    id,
    name: id,
    type: 'report',
    workspaceId: 'ws-1',
    workspaceName: 'WS',
  } as ContentItem;
}

const INITIAL_CONTENT = {
  workspaces: [],
  reports: new Map(),
  dashboards: new Map(),
  apps: [],
  recentItems: [],
  frequentItems: [],
  isLoading: false,
  error: null,
};

let getRecent: ReturnType<typeof vi.fn>;
let getFrequent: ReturnType<typeof vi.fn>;

beforeEach(() => {
  useContentStore.setState(INITIAL_CONTENT);
  useAuthStore.setState({ user: { id: 'acct-1', displayName: 'A', email: 'a@x.com' }, isAuthenticated: true });

  getRecent = vi.fn();
  getFrequent = vi.fn();
  (globalThis as unknown as { window: { electronAPI: unknown } }).window = {
    electronAPI: {
      usage: { getRecent, getFrequent },
    },
  };
});

describe('content-store loadRecentItems (FIX-3: stale cross-account write)', () => {
  it('writes the response when the account is unchanged', async () => {
    getRecent.mockResolvedValue({ success: true, data: [item('r1')] });
    await useContentStore.getState().loadRecentItems();
    expect(useContentStore.getState().recentItems.map((i) => i.id)).toEqual(['r1']);
    expect(getRecent).toHaveBeenCalledWith('acct-1');
  });

  it('DISCARDS the response when an account switch lands mid-flight', async () => {
    getRecent.mockImplementation(async () => {
      useAuthStore.setState({ user: { id: 'acct-2', displayName: 'B', email: 'b@x.com' } });
      return { success: true, data: [item('acct-1-recent')] };
    });

    await useContentStore.getState().loadRecentItems();

    expect(useContentStore.getState().recentItems).toEqual([]);
  });
});

describe('content-store loadFrequentItems (FIX-3: stale cross-account write)', () => {
  it('writes the response when the account is unchanged', async () => {
    getFrequent.mockResolvedValue({ success: true, data: [item('f1')] });
    await useContentStore.getState().loadFrequentItems();
    expect(useContentStore.getState().frequentItems.map((i) => i.id)).toEqual(['f1']);
  });

  it('DISCARDS the response when an account switch lands mid-flight', async () => {
    getFrequent.mockImplementation(async () => {
      useAuthStore.setState({ user: { id: 'acct-2', displayName: 'B', email: 'b@x.com' } });
      return { success: true, data: [item('acct-1-frequent')] };
    });

    await useContentStore.getState().loadFrequentItems();

    expect(useContentStore.getState().frequentItems).toEqual([]);
  });
});
