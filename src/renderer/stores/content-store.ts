import { create } from 'zustand';
import type {
  Workspace,
  Report,
  Dashboard,
  App,
  ContentItem,
} from '../../shared/types';
import { useAuthStore } from './auth-store';

interface ContentState {
  workspaces: Workspace[];
  reports: Map<string, Report[]>; // keyed by workspaceId
  dashboards: Map<string, Dashboard[]>; // keyed by workspaceId
  apps: App[];
  recentItems: ContentItem[];
  frequentItems: ContentItem[];
  isLoading: boolean;
  error: string | null;

  // Actions
  loadWorkspaces: () => Promise<void>;
  loadReports: (workspaceId: string) => Promise<void>;
  loadDashboards: (workspaceId: string) => Promise<void>;
  loadApps: () => Promise<void>;
  loadRecentItems: () => Promise<void>;
  loadFrequentItems: () => Promise<void>;
  recordItemOpened: (item: ContentItem) => void;
  /**
   * NEW-PROD-5: targeted eviction of a single dead item from the in-memory
   * recent/frequent lists (called when a viewer receives a 404 for an item).
   * Does NOT touch the persistent store — that is handled by the main-process
   * usage handler when the IPC record is next refreshed with the evicted id.
   */
  evictDeadItem: (itemId: string) => void;
  clearError: () => void;
  reset: () => void;
}

export const useContentStore = create<ContentState>((set, get) => ({
  workspaces: [],
  reports: new Map(),
  dashboards: new Map(),
  apps: [],
  recentItems: [],
  frequentItems: [],
  isLoading: false,
  error: null,

  loadWorkspaces: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await window.electronAPI.content.getWorkspaces();

      if (response.success) {
        set({ workspaces: response.data, isLoading: false });
      } else {
        set({
          isLoading: false,
          error: response.error.message || 'Failed to load workspaces',
        });
      }
    } catch (error) {
      set({ isLoading: false, error: String(error) });
    }
  },

  loadReports: async (workspaceId: string) => {
    try {
      const response = await window.electronAPI.content.getReports(workspaceId);

      if (response.success) {
        const currentReports = get().reports;
        const newReports = new Map(currentReports);
        newReports.set(workspaceId, response.data);
        set({ reports: newReports });
      }
    } catch (error) {
      console.error('Failed to load reports:', error);
    }
  },

  loadDashboards: async (workspaceId: string) => {
    try {
      const response = await window.electronAPI.content.getDashboards(workspaceId);

      if (response.success) {
        const currentDashboards = get().dashboards;
        const newDashboards = new Map(currentDashboards);
        newDashboards.set(workspaceId, response.data);
        set({ dashboards: newDashboards });
      }
    } catch (error) {
      console.error('Failed to load dashboards:', error);
    }
  },

  loadApps: async () => {
    try {
      const response = await window.electronAPI.content.getApps();

      if (response.success) {
        set({ apps: response.data });
      }
    } catch (error) {
      console.error('Failed to load apps:', error);
    }
  },

  loadRecentItems: async () => {
    try {
      // BEH-B3: scope the read to the signed-in user so accounts on a shared
      // machine do not see each other's recent history.
      const accountId = useAuthStore.getState().user?.id;
      const response = await window.electronAPI.usage.getRecent(accountId);
      // FIX-3 (isolation): an account switch can land DURING this in-flight IPC.
      // Re-check the active account after the await and discard the response if
      // it changed, so the prior account's data is never written into the new
      // account's store.
      if (useAuthStore.getState().user?.id !== accountId) return;
      if (response.success) {
        set({ recentItems: response.data });
      }
    } catch (error) {
      console.error('Failed to load recent items:', error);
    }
  },

  loadFrequentItems: async () => {
    try {
      // BEH-B3: scope the read to the signed-in user (same rationale as above).
      const accountId = useAuthStore.getState().user?.id;
      const response = await window.electronAPI.usage.getFrequent(accountId);
      // FIX-3 (isolation): discard a response that resolved after an account
      // switch (same rationale as loadRecentItems above).
      if (useAuthStore.getState().user?.id !== accountId) return;
      if (response.success) {
        set({ frequentItems: response.data });
      }
    } catch (error) {
      console.error('Failed to load frequent items:', error);
    }
  },

  recordItemOpened: (item: ContentItem) => {
    // BEH-S4: guard — do not emit usage IPC after the user has logged out.
    // useAuthStore.getState() is synchronous so there is no race between the
    // guard and the navigation that immediately follows this call.
    if (!useAuthStore.getState().isAuthenticated) return;

    // Fire-and-forget: usage bookkeeping must NOT block the navigation
    // hot path. Callers should call this and immediately navigate; the
    // recent/frequent lists will reflect the open on the next paint cycle
    // (or shortly after) once these awaits resolve.
    void (async () => {
      try {
        // CROSS-LANE: pass the signed-in user's homeAccountId so the record
        // is scoped to this account (BEH-B3 per-user scoping).
        // UserInfo.id holds the homeAccountId as set by the auth service.
        // If for any reason it is absent, the main-process usage handler
        // should stamp it from authService instead (see notes in lane output).
        const accountId = useAuthStore.getState().user?.id;
        await window.electronAPI.usage.recordOpen({
          id: item.id,
          name: item.name,
          type: item.type,
          workspaceId: item.workspaceId,
          workspaceName: item.workspaceName || 'Unknown',
          accountId,
        });
        // Refresh recent and frequent lists in parallel — neither depends
        // on the other and they can race the user's next click freely.
        await Promise.all([
          get().loadRecentItems(),
          get().loadFrequentItems(),
        ]);
      } catch (error) {
        console.error('Failed to record item opened:', error);
      }
    })();
  },

  // NEW-PROD-5: targeted eviction — removes a single item from in-memory
  // recent/frequent lists without discarding all usage history.  Callers
  // (viewers) invoke this when the Power BI API returns a 404 for an item.
  evictDeadItem: (itemId: string) => {
    set((state) => ({
      recentItems: state.recentItems.filter((i) => i.id !== itemId),
      frequentItems: state.frequentItems.filter((i) => i.id !== itemId),
    }));
  },

  clearError: () => {
    set({ error: null });
  },

  reset: () => {
    // Wipe all cached content so a different signed-in user does not see
    // the previous account's data. Mirrors the initial store state.
    set({
      workspaces: [],
      reports: new Map(),
      dashboards: new Map(),
      apps: [],
      recentItems: [],
      frequentItems: [],
      isLoading: false,
      error: null,
    });
  },
}));
