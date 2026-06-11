import { create } from 'zustand';
import type { App, Workspace, Report, Dashboard } from '../../shared/types';

interface SearchResult {
  id: string;
  name: string;
  type: 'report' | 'dashboard' | 'app' | 'workspace';
  workspaceId?: string;
  workspaceName?: string;
  description?: string;
}

interface SearchCache {
  workspaces: Workspace[] | null;
  apps: App[] | null;
  reports: Report[] | null;
  dashboards: Dashboard[] | null;
  lastFetched: number;
}

const CACHE_TTL = 5 * 60 * 1000;

let searchCache: SearchCache = {
  workspaces: null,
  apps: null,
  reports: null,
  dashboards: null,
  lastFetched: 0,
};

let currentSearchId = 0;

interface SearchState {
  isOpen: boolean;
  query: string;
  results: SearchResult[];
  isSearching: boolean;
  error: string | null;
  partialFailureWarning: string | null;

  openSearch: () => void;
  closeSearch: () => void;
  setQuery: (query: string) => void;
  search: (query: string) => Promise<void>;
  clearResults: () => void;
  invalidateCache: () => void;
  invalidateAll: () => void;
}

export const useSearchStore = create<SearchState>((set, _get) => ({
  isOpen: false,
  query: '',
  results: [],
  isSearching: false,
  error: null,
  partialFailureWarning: null,

  openSearch: () => {
    set({ isOpen: true });
  },

  closeSearch: () => {
    currentSearchId++;
    set({ isOpen: false, query: '', results: [], isSearching: false });
  },

  setQuery: (query: string) => {
    if (!query) {
      currentSearchId++;
      set({ query, results: [], isSearching: false });
      return;
    }
    set({ query });
  },

  invalidateCache: () => {
    searchCache = {
      workspaces: null,
      apps: null,
      reports: null,
      dashboards: null,
      lastFetched: 0,
    };
  },

  invalidateAll: () => {
    searchCache = {
      workspaces: null,
      apps: null,
      reports: null,
      dashboards: null,
      lastFetched: 0,
    };
    currentSearchId++;
    set({ results: [], query: '', error: null, partialFailureWarning: null });
  },

  search: async (query: string) => {
    if (!query.trim()) {
      set({ results: [], isSearching: false });
      return;
    }

    const thisSearchId = ++currentSearchId;

    set({ isSearching: true });

    try {
      const searchLower = query.toLowerCase();
      const results: SearchResult[] = [];
      const now = Date.now();
      const cacheValid = now - searchCache.lastFetched < CACHE_TTL;

      let workspaces = searchCache.workspaces;
      let apps = searchCache.apps;
      let reports = searchCache.reports;
      let dashboards = searchCache.dashboards;

      if (!cacheValid || !workspaces || !apps || !reports || !dashboards) {
        const [workspacesResponse, appsResponse, allItemsResponse] = await Promise.all([
          window.electronAPI.content.getWorkspaces(),
          window.electronAPI.content.getApps(),
          window.electronAPI.content.getAllItems(),
        ]);

        if (thisSearchId !== currentSearchId) {
          return;
        }

        workspaces = workspacesResponse.success ? workspacesResponse.data : [];
        apps = appsResponse.success ? appsResponse.data : [];
        reports = allItemsResponse.success ? allItemsResponse.data.reports : [];
        dashboards = allItemsResponse.success ? allItemsResponse.data.dashboards : [];

        let partialFailure = false;
        if (allItemsResponse.success) {
          const bulk = allItemsResponse.data as unknown as {
            reports: Report[];
            dashboards: Dashboard[];
            partialFailure?: boolean;
            failedWorkspaces?: { id: string; name: string; error: string }[];
          };
          if (bulk.partialFailure && bulk.failedWorkspaces && bulk.failedWorkspaces.length > 0) {
            partialFailure = true;
            const names = bulk.failedWorkspaces.map((w) => w.name).join(', ');
            set({
              partialFailureWarning: `Some workspaces could not be loaded: ${names}`,
            });
          } else {
            set({ partialFailureWarning: null });
          }
        }

        if (!partialFailure && workspacesResponse.success && appsResponse.success && allItemsResponse.success) {
          searchCache = {
            workspaces,
            apps,
            reports,
            dashboards,
            lastFetched: now,
          };
        }
      }

      if (thisSearchId !== currentSearchId) {
        return;
      }

      const workspaceNameMap = new Map<string, string>();
      for (const ws of workspaces) {
        workspaceNameMap.set(ws.id, ws.name);
      }

      const matchingWorkspaces = workspaces.filter(ws =>
        ws.name.toLowerCase().includes(searchLower)
      );
      results.push(...matchingWorkspaces.map(ws => ({
        id: ws.id,
        name: ws.name,
        type: 'workspace' as const,
      })));

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

      const matchingReports = reports.filter(report =>
        report.name.toLowerCase().includes(searchLower)
      );
      results.push(...matchingReports.map(report => ({
        id: report.id,
        name: report.name,
        type: 'report' as const,
        workspaceId: report.workspaceId,
        workspaceName: workspaceNameMap.get(report.workspaceId) || 'Unknown Workspace',
      })));

      const matchingDashboards = dashboards.filter(dashboard =>
        dashboard.name.toLowerCase().includes(searchLower)
      );
      results.push(...matchingDashboards.map(dashboard => ({
        id: dashboard.id,
        name: dashboard.name,
        type: 'dashboard' as const,
        workspaceId: dashboard.workspaceId,
        workspaceName: workspaceNameMap.get(dashboard.workspaceId) || 'Unknown Workspace',
      })));

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

      if (thisSearchId !== currentSearchId) {
        return;
      }

      set({ results: results.slice(0, 30), isSearching: false });
    } catch (error) {
      console.error('Search error:', error);
      if (thisSearchId === currentSearchId) {
        set({ results: [], isSearching: false });
      }
    }
  },

  clearResults: () => {
    currentSearchId++;
    set({ results: [], query: '', isSearching: false });
  },
}));
