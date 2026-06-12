import { create } from 'zustand';
import type {
  Workspace,
  Report,
  Dashboard,
  App,
  ContentItem,
} from '../../shared/types';
import { useAuthStore } from './auth-store';

const WORKSPACES_LOAD_FALLBACK =
  'Could not load your workspaces. Check your network connection, then select Refresh to try again.';

interface ContentState {
  workspaces: Workspace[];
  reports: Map<string, Report[]>;
  dashboards: Map<string, Dashboard[]>;
  apps: App[];
  recentItems: ContentItem[];
  frequentItems: ContentItem[];
  isLoading: boolean;
  error: string | null;

  loadWorkspaces: () => Promise<void>;
  loadReports: (workspaceId: string) => Promise<void>;
  loadDashboards: (workspaceId: string) => Promise<void>;
  loadApps: () => Promise<void>;
  loadRecentItems: () => Promise<void>;
  loadFrequentItems: () => Promise<void>;
  recordItemOpened: (item: ContentItem) => void;
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
        console.error('Failed to load workspaces:', response.error.message);
        set({
          isLoading: false,
          error: response.error.userMessage || WORKSPACES_LOAD_FALLBACK,
        });
      }
    } catch (error) {
      console.error('Failed to load workspaces:', error);
      set({ isLoading: false, error: WORKSPACES_LOAD_FALLBACK });
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
      const accountId = useAuthStore.getState().user?.id;
      const response = await window.electronAPI.usage.getRecent(accountId);
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
      const accountId = useAuthStore.getState().user?.id;
      const response = await window.electronAPI.usage.getFrequent(accountId);
      if (useAuthStore.getState().user?.id !== accountId) return;
      if (response.success) {
        set({ frequentItems: response.data });
      }
    } catch (error) {
      console.error('Failed to load frequent items:', error);
    }
  },

  recordItemOpened: (item: ContentItem) => {
    if (!useAuthStore.getState().isAuthenticated) return;

    void (async () => {
      try {
        const accountId = useAuthStore.getState().user?.id;
        await window.electronAPI.usage.recordOpen({
          id: item.id,
          name: item.name,
          type: item.type,
          workspaceId: item.workspaceId,
          workspaceName: item.workspaceName || 'Unknown',
          accountId,
        });
        await Promise.all([
          get().loadRecentItems(),
          get().loadFrequentItems(),
        ]);
      } catch (error) {
        console.error('Failed to record item opened:', error);
      }
    })();
  },

  evictDeadItem: (itemId: string) => {
    set((state) => ({
      recentItems: state.recentItems.filter((i) => i.id !== itemId),
      frequentItems: state.frequentItems.filter((i) => i.id !== itemId),
    }));
    void window.electronAPI.usage.remove(itemId).catch(() => {});
  },

  clearError: () => {
    set({ error: null });
  },

  reset: () => {
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
