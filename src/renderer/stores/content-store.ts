import { create } from 'zustand';
import type {
  Workspace,
  Report,
  Dashboard,
  App,
  ContentItem,
  IPCResponse,
} from '../../shared/types';

interface ContentState {
  workspaces: Workspace[];
  reports: Map<string, Report[]>; // keyed by workspaceId
  dashboards: Map<string, Dashboard[]>; // keyed by workspaceId
  apps: App[];
  recentItems: ContentItem[];
  frequentItems: ContentItem[];
  allItems: ContentItem[]; // All available items from API
  favoriteItems: ContentItem[];
  isLoading: boolean;
  error: string | null;

  // Actions
  loadWorkspaces: () => Promise<void>;
  loadReports: (workspaceId: string) => Promise<void>;
  loadDashboards: (workspaceId: string) => Promise<void>;
  loadApps: () => Promise<void>;
  loadAllItems: () => Promise<void>;
  loadRecentItems: () => Promise<void>;
  loadFrequentItems: () => Promise<void>;
  loadFavorites: () => Promise<void>;
  recordItemOpened: (item: ContentItem) => Promise<void>;
  toggleFavorite: (itemId: string, itemType: string) => Promise<void>;
  refreshAll: () => Promise<void>;
  clearError: () => void;
}

export const useContentStore = create<ContentState>((set, get) => ({
  workspaces: [],
  reports: new Map(),
  dashboards: new Map(),
  apps: [],
  recentItems: [],
  frequentItems: [],
  allItems: [],
  favoriteItems: [],
  isLoading: false,
  error: null,

  loadWorkspaces: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await window.electronAPI.content.getWorkspaces() as IPCResponse<Workspace[]>;

      if (response.success && response.data) {
        set({ workspaces: response.data, isLoading: false });
      } else {
        set({
          isLoading: false,
          error: response.error?.message || 'Failed to load workspaces',
        });
      }
    } catch (error) {
      set({ isLoading: false, error: String(error) });
    }
  },

  loadReports: async (workspaceId: string) => {
    try {
      const response = await window.electronAPI.content.getReports(workspaceId) as IPCResponse<Report[]>;

      if (response.success && response.data) {
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
      const response = await window.electronAPI.content.getDashboards(workspaceId) as IPCResponse<Dashboard[]>;

      if (response.success && response.data) {
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
      const response = await window.electronAPI.content.getApps() as IPCResponse<App[]>;

      if (response.success && response.data) {
        set({ apps: response.data });
      }
    } catch (error) {
      console.error('Failed to load apps:', error);
    }
  },

  loadAllItems: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await window.electronAPI.content.getRecent() as IPCResponse<ContentItem[]>;

      if (response.success && response.data) {
        set({ allItems: response.data, isLoading: false });
        // Cache for offline use
        window.electronAPI.cache.saveOfflineContent(response.data);
      } else {
        // Try to load from offline cache
        const offlineResponse = await window.electronAPI.cache.getOfflineContent() as IPCResponse<ContentItem[]>;
        if (offlineResponse.success && offlineResponse.data && offlineResponse.data.length > 0) {
          set({ allItems: offlineResponse.data, isLoading: false });
        } else {
          set({ isLoading: false });
        }
      }
    } catch (error) {
      // Try to load from offline cache on error
      try {
        const offlineResponse = await window.electronAPI.cache.getOfflineContent() as IPCResponse<ContentItem[]>;
        if (offlineResponse.success && offlineResponse.data && offlineResponse.data.length > 0) {
          set({ allItems: offlineResponse.data, isLoading: false, error: 'Using cached data (offline)' });
          return;
        }
      } catch {
        // Ignore cache error
      }
      set({ isLoading: false, error: String(error) });
    }
  },

  loadRecentItems: async () => {
    try {
      const response = await window.electronAPI.usage.getRecent() as IPCResponse<ContentItem[]>;
      if (response.success && response.data) {
        set({ recentItems: response.data });
      }
    } catch (error) {
      console.error('Failed to load recent items:', error);
    }
  },

  loadFrequentItems: async () => {
    try {
      const response = await window.electronAPI.usage.getFrequent() as IPCResponse<ContentItem[]>;
      if (response.success && response.data) {
        set({ frequentItems: response.data });
      }
    } catch (error) {
      console.error('Failed to load frequent items:', error);
    }
  },

  recordItemOpened: async (item: ContentItem) => {
    try {
      await window.electronAPI.usage.recordOpen({
        id: item.id,
        name: item.name,
        type: item.type,
        workspaceId: item.workspaceId,
        workspaceName: item.workspaceName || 'Unknown',
      });
      // Refresh recent and frequent lists
      await get().loadRecentItems();
      await get().loadFrequentItems();
    } catch (error) {
      console.error('Failed to record item opened:', error);
    }
  },

  loadFavorites: async () => {
    try {
      const response = await window.electronAPI.content.getFavorites() as IPCResponse<ContentItem[]>;

      if (response.success && response.data) {
        set({ favoriteItems: response.data });
      }
    } catch (error) {
      console.error('Failed to load favorites:', error);
    }
  },

  toggleFavorite: async (itemId: string, itemType: string) => {
    const { favoriteItems } = get();
    const isFavorite = favoriteItems.some((item) => item.id === itemId);

    try {
      if (isFavorite) {
        await window.electronAPI.content.removeFavorite(itemId);
        set({
          favoriteItems: favoriteItems.filter((item) => item.id !== itemId),
        });
      } else {
        await window.electronAPI.content.addFavorite(itemId, itemType);
        // Refresh favorites to get the updated list
        await get().loadFavorites();
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  },

  refreshAll: async () => {
    set({ isLoading: true, error: null });
    try {
      await Promise.all([
        get().loadWorkspaces(),
        get().loadApps(),
        get().loadAllItems(),
        get().loadRecentItems(),
        get().loadFrequentItems(),
        get().loadFavorites(),
      ]);
      set({ isLoading: false });
    } catch (error) {
      set({ isLoading: false, error: String(error) });
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));
