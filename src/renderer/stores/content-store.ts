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
  isLoading: boolean;
  error: string | null;

  // Actions
  loadWorkspaces: () => Promise<void>;
  loadReports: (workspaceId: string) => Promise<void>;
  loadDashboards: (workspaceId: string) => Promise<void>;
  loadApps: () => Promise<void>;
  loadRecentItems: () => Promise<void>;
  loadFrequentItems: () => Promise<void>;
  recordItemOpened: (item: ContentItem) => Promise<void>;
  clearError: () => void;
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

  clearError: () => {
    set({ error: null });
  },
}));
