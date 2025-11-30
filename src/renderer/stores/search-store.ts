import { create } from 'zustand';
import type { ContentItem, App, Workspace, Report, Dashboard, IPCResponse } from '../../shared/types';

interface SearchResult {
  id: string;
  name: string;
  type: 'report' | 'dashboard' | 'app' | 'workspace';
  workspaceId?: string;
  workspaceName?: string;
  description?: string;
}

interface SearchState {
  isOpen: boolean;
  query: string;
  results: SearchResult[];
  isSearching: boolean;

  // Actions
  openSearch: () => void;
  closeSearch: () => void;
  setQuery: (query: string) => void;
  search: (query: string) => Promise<void>;
  clearResults: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  isOpen: false,
  query: '',
  results: [],
  isSearching: false,

  openSearch: () => {
    set({ isOpen: true });
  },

  closeSearch: () => {
    set({ isOpen: false, query: '', results: [] });
  },

  setQuery: (query: string) => {
    set({ query });
  },

  search: async (query: string) => {
    if (!query.trim()) {
      set({ results: [], isSearching: false });
      return;
    }

    set({ isSearching: true });

    try {
      const searchLower = query.toLowerCase();
      const results: SearchResult[] = [];

      // Search workspaces
      const workspacesResponse = await window.electronAPI.content.getWorkspaces() as IPCResponse<Workspace[]>;
      if (workspacesResponse.success && workspacesResponse.data) {
        const matchingWorkspaces = workspacesResponse.data.filter(ws =>
          ws.name.toLowerCase().includes(searchLower)
        );
        results.push(...matchingWorkspaces.map(ws => ({
          id: ws.id,
          name: ws.name,
          type: 'workspace' as const,
        })));
      }

      // Search apps
      const appsResponse = await window.electronAPI.content.getApps() as IPCResponse<App[]>;
      if (appsResponse.success && appsResponse.data) {
        const matchingApps = appsResponse.data.filter(app =>
          app.name.toLowerCase().includes(searchLower) ||
          app.description?.toLowerCase().includes(searchLower)
        );
        results.push(...matchingApps.map(app => ({
          id: app.id,
          name: app.name,
          type: 'app' as const,
          description: app.description,
        })));
      }

      // Search recent items (reports/dashboards)
      const recentResponse = await window.electronAPI.content.getRecent() as IPCResponse<ContentItem[]>;
      if (recentResponse.success && recentResponse.data) {
        const matchingItems = recentResponse.data.filter(item =>
          item.name.toLowerCase().includes(searchLower) ||
          item.workspaceName.toLowerCase().includes(searchLower)
        );
        results.push(...matchingItems.map(item => ({
          id: item.id,
          name: item.name,
          type: item.type,
          workspaceId: item.workspaceId,
          workspaceName: item.workspaceName,
        })));
      }

      // Sort results - exact matches first, then partial matches
      results.sort((a, b) => {
        const aExact = a.name.toLowerCase() === searchLower;
        const bExact = b.name.toLowerCase() === searchLower;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;

        const aStarts = a.name.toLowerCase().startsWith(searchLower);
        const bStarts = b.name.toLowerCase().startsWith(searchLower);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        return a.name.localeCompare(b.name);
      });

      // Limit results
      set({ results: results.slice(0, 20), isSearching: false });
    } catch (error) {
      console.error('Search error:', error);
      set({ results: [], isSearching: false });
    }
  },

  clearResults: () => {
    set({ results: [], query: '' });
  },
}));
