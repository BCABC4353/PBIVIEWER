import { create } from 'zustand';
import type { ContentItem, App, Workspace, IPCResponse } from '../../shared/types';

interface SearchResult {
  id: string;
  name: string;
  type: 'report' | 'dashboard' | 'app' | 'workspace';
  workspaceId?: string;
  workspaceName?: string;
  description?: string;
}

// Cache for search data - reduces API calls
interface SearchCache {
  workspaces: Workspace[] | null;
  apps: App[] | null;
  allItems: ContentItem[] | null;
  lastFetched: number;
}

const CACHE_TTL = 60000; // 1 minute cache

let searchCache: SearchCache = {
  workspaces: null,
  apps: null,
  allItems: null,
  lastFetched: 0,
};

// Track the current search request to cancel stale ones
let currentSearchId = 0;

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
  invalidateCache: () => void;
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

  invalidateCache: () => {
    searchCache = {
      workspaces: null,
      apps: null,
      allItems: null,
      lastFetched: 0,
    };
  },

  search: async (query: string) => {
    if (!query.trim()) {
      set({ results: [], isSearching: false });
      return;
    }

    // Increment search ID to track this request
    const thisSearchId = ++currentSearchId;

    set({ isSearching: true });

    try {
      const searchLower = query.toLowerCase();
      const results: SearchResult[] = [];
      const now = Date.now();
      const cacheValid = now - searchCache.lastFetched < CACHE_TTL;

      // Fetch data (use cache if valid)
      let workspaces = searchCache.workspaces;
      let apps = searchCache.apps;
      let allItems = searchCache.allItems;

      if (!cacheValid || !workspaces || !apps || !allItems) {
        // Fetch all data in parallel
        const [workspacesResponse, appsResponse, recentResponse] = await Promise.all([
          window.electronAPI.content.getWorkspaces() as Promise<IPCResponse<Workspace[]>>,
          window.electronAPI.content.getApps() as Promise<IPCResponse<App[]>>,
          window.electronAPI.content.getRecent() as Promise<IPCResponse<ContentItem[]>>,
        ]);

        // Check if this search is still current
        if (thisSearchId !== currentSearchId) {
          return; // Stale search, abort
        }

        workspaces = workspacesResponse.success ? workspacesResponse.data || [] : [];
        apps = appsResponse.success ? appsResponse.data || [] : [];
        allItems = recentResponse.success ? recentResponse.data || [] : [];

        // Update cache
        searchCache = {
          workspaces,
          apps,
          allItems,
          lastFetched: now,
        };
      }

      // Check again if this search is still current
      if (thisSearchId !== currentSearchId) {
        return; // Stale search, abort
      }

      // Search workspaces
      const matchingWorkspaces = workspaces.filter(ws =>
        ws.name.toLowerCase().includes(searchLower)
      );
      results.push(...matchingWorkspaces.map(ws => ({
        id: ws.id,
        name: ws.name,
        type: 'workspace' as const,
      })));

      // Search apps
      const matchingApps = apps.filter(app =>
        app.name.toLowerCase().includes(searchLower) ||
        app.description?.toLowerCase().includes(searchLower)
      );
      results.push(...matchingApps.map(app => ({
        id: app.id,
        name: app.name,
        type: 'app' as const,
        description: app.description,
      })));

      // Search all items (reports/dashboards)
      const matchingItems = allItems.filter(item =>
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

      // Final check before updating state
      if (thisSearchId !== currentSearchId) {
        return; // Stale search, abort
      }

      // Limit results
      set({ results: results.slice(0, 20), isSearching: false });
    } catch (error) {
      console.error('Search error:', error);
      if (thisSearchId === currentSearchId) {
        set({ results: [], isSearching: false });
      }
    }
  },

  clearResults: () => {
    set({ results: [], query: '' });
  },
}));
