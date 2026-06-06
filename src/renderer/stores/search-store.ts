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

// Cache for search data - reduces API calls
interface SearchCache {
  workspaces: Workspace[] | null;
  apps: App[] | null;
  reports: Report[] | null;
  dashboards: Dashboard[] | null;
  lastFetched: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minute cache for full content

let searchCache: SearchCache = {
  workspaces: null,
  apps: null,
  reports: null,
  dashboards: null,
  lastFetched: 0,
};

// Track the current search request to cancel stale ones
let currentSearchId = 0;

interface SearchState {
  isOpen: boolean;
  query: string;
  results: SearchResult[];
  isSearching: boolean;
  error: string | null;
  // Non-blocking notice surfaced when getAllItems reports partial failure.
  // Null means no warning; UI may render it inline without blocking results.
  partialFailureWarning: string | null;

  // Actions
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
    // Bump the generation so any in-flight search() whose results would
    // otherwise stream back into a now-closed dialog discards itself.
    currentSearchId++;
    set({ isOpen: false, query: '', results: [], isSearching: false });
  },

  setQuery: (query: string) => {
    // When the user clears the query (e.g. clicks the X button), any
    // in-flight search must be discarded — otherwise its late-returning
    // results would repopulate the now-empty list.
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
    // Drop the module-level cache so the next search re-fetches.
    searchCache = {
      workspaces: null,
      apps: null,
      reports: null,
      dashboards: null,
      lastFetched: 0,
    };
    // Discard any in-flight search by bumping the id.
    currentSearchId++;
    // Clear surfaced state.
    set({ results: [], query: '', error: null, partialFailureWarning: null });
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
      let reports = searchCache.reports;
      let dashboards = searchCache.dashboards;

      if (!cacheValid || !workspaces || !apps || !reports || !dashboards) {
        // Fetch all data in parallel:
        // - workspaces (for workspace search and name lookup)
        // - apps
        // - all reports and dashboards from all workspaces
        const [workspacesResponse, appsResponse, allItemsResponse] = await Promise.all([
          window.electronAPI.content.getWorkspaces(),
          window.electronAPI.content.getApps(),
          window.electronAPI.content.getAllItems(),
        ]);

        // Check if this search is still current
        if (thisSearchId !== currentSearchId) {
          return; // Stale search, abort
        }

        workspaces = workspacesResponse.success ? workspacesResponse.data : [];
        apps = appsResponse.success ? appsResponse.data : [];
        reports = allItemsResponse.success ? allItemsResponse.data.reports : [];
        dashboards = allItemsResponse.success ? allItemsResponse.data.dashboards : [];

        // Surface partial-failure warning if the bulk fetch couldn't reach
        // every workspace. DEV-D extended getAllItems' payload with
        // partialFailure + failedWorkspaces; tolerate older shapes by
        // reading via an unknown cast.
        if (allItemsResponse.success) {
          const bulk = allItemsResponse.data as unknown as {
            reports: Report[];
            dashboards: Dashboard[];
            partialFailure?: boolean;
            failedWorkspaces?: { id: string; name: string; error: string }[];
          };
          if (bulk.partialFailure && bulk.failedWorkspaces && bulk.failedWorkspaces.length > 0) {
            const names = bulk.failedWorkspaces.map((w) => w.name).join(', ');
            set({
              partialFailureWarning: `Some workspaces could not be loaded: ${names}`,
            });
          } else {
            set({ partialFailureWarning: null });
          }
        }

        // Update cache
        searchCache = {
          workspaces,
          apps,
          reports,
          dashboards,
          lastFetched: now,
        };
      }

      // Check again if this search is still current
      if (thisSearchId !== currentSearchId) {
        return; // Stale search, abort
      }

      // Create workspace name lookup map
      const workspaceNameMap = new Map<string, string>();
      for (const ws of workspaces) {
        workspaceNameMap.set(ws.id, ws.name);
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

      // Search all reports from Power BI
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

      // Search all dashboards from Power BI
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
      set({ results: results.slice(0, 30), isSearching: false });
    } catch (error) {
      console.error('Search error:', error);
      if (thisSearchId === currentSearchId) {
        set({ results: [], isSearching: false });
      }
    }
  },

  clearResults: () => {
    // Bump generation so a search() still in flight cannot repopulate the
    // list after we've intentionally cleared it.
    currentSearchId++;
    set({ results: [], query: '', isSearching: false });
  },
}));
