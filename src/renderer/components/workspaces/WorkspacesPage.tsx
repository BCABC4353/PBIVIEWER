import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Spinner, Text, Button, Card, Badge } from '@fluentui/react-components';
import {
  FolderRegular,
  DocumentRegular,
  BoardRegular,
  ChevronRightRegular,
  ArrowSyncRegular,
} from '@fluentui/react-icons';
import { useContentStore } from '../../stores/content-store';
import { useSearchStore } from '../../stores/search-store';
import type { Workspace, Report, Dashboard } from '../../../shared/types';

interface WorkspaceWithContent extends Workspace {
  reports: Report[];
  dashboards: Dashboard[];
  isExpanded: boolean;
  isLoading: boolean;
  // Per-workspace error surfacing for partial failures during expand.
  // null when both halves loaded (or neither has been attempted yet);
  // 'reports' or 'dashboards' when only that half failed; 'both' when
  // the whole expand failed (existing error UI handles 'both' via the
  // empty-state path).
  loadWarning?: 'reports' | 'dashboards' | null;
}

export const WorkspacesPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { recordItemOpened } = useContentStore();
  const [workspaces, setWorkspaces] = useState<WorkspaceWithContent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastExpandedId, setLastExpandedId] = useState<string | null>(null);
  // Track which workspaces have already had their content fetched (success
  // OR failure). Prevents re-fetching every time the user collapses and
  // re-expands a workspace — especially important for empty workspaces
  // that would otherwise round-trip on each toggle.
  const contentLoadedRef = useRef<Set<string>>(new Set());

  const loadWorkspaces = async () => {
    setIsLoading(true);
    setError(null);
    // Refreshing the workspace list invalidates per-workspace content
    // bookkeeping — a previously-loaded workspace may now have new items.
    contentLoadedRef.current = new Set();

    // Drop only the search-store's module-level cache so the next search
    // re-fetches; do NOT clear the search dialog's current query/results,
    // because the user may have it open. Full invalidateAll is reserved
    // for logout.
    useSearchStore.getState().invalidateCache();

    try {
      const response = await window.electronAPI.content.getWorkspaces();

      if (!response.success) {
        throw new Error(response.error.message || 'Failed to load workspaces');
      }

      setWorkspaces(
        response.data.map((ws) => ({
          ...ws,
          reports: [],
          dashboards: [],
          isExpanded: false,
          isLoading: false,
        }))
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const toggleWorkspace = useCallback(async (workspaceId: string) => {
    // Decide whether this toggle needs a content fetch. We gate on a
    // per-workspace contentLoaded set rather than checking reports.length /
    // dashboards.length, because a truly-empty workspace would otherwise
    // re-fetch on every expand.
    const needsFetch = !contentLoadedRef.current.has(workspaceId);

    setWorkspaces((prevWorkspaces) => {
      const workspace = prevWorkspaces.find((ws) => ws.id === workspaceId);
      if (!workspace) return prevWorkspaces;

      if (workspace.isExpanded) {
        // Collapse
        return prevWorkspaces.map((ws) =>
          ws.id === workspaceId ? { ...ws, isExpanded: false } : ws
        );
      }

      // Expand — show the spinner only if we actually need to fetch.
      if (needsFetch) {
        return prevWorkspaces.map((ws) =>
          ws.id === workspaceId
            ? { ...ws, isLoading: true, isExpanded: true, loadWarning: null }
            : ws
        );
      }
      return prevWorkspaces.map((ws) =>
        ws.id === workspaceId ? { ...ws, isExpanded: true } : ws
      );
    });

    if (!needsFetch) return;

    // Mark as in-flight up front so re-entrant toggles don't fire a second
    // request. We add to the set BEFORE the await — even on failure we
    // don't want a re-expand to keep retrying; the user can hit the
    // top-level Refresh button to retry.
    contentLoadedRef.current.add(workspaceId);

    // Promise.allSettled instead of Promise.all: a failure on one half
    // must not erase what the other half successfully returned.
    const [reportsSettled, dashboardsSettled] = await Promise.allSettled([
      window.electronAPI.content.getReports(workspaceId),
      window.electronAPI.content.getDashboards(workspaceId),
    ]);

    const reportsOk =
      reportsSettled.status === 'fulfilled' && reportsSettled.value.success;
    const dashboardsOk =
      dashboardsSettled.status === 'fulfilled' && dashboardsSettled.value.success;

    const reports =
      reportsSettled.status === 'fulfilled' && reportsSettled.value.success
        ? reportsSettled.value.data
        : [];
    const dashboards =
      dashboardsSettled.status === 'fulfilled' && dashboardsSettled.value.success
        ? dashboardsSettled.value.data
        : [];

    // Log rejected reasons so they aren't silently swallowed.
    if (reportsSettled.status === 'rejected') {
      console.warn('[WorkspacesPage] getReports failed:', reportsSettled.reason);
    } else if (!reportsSettled.value.success) {
      console.warn(
        '[WorkspacesPage] getReports returned error:',
        reportsSettled.value.error
      );
    }
    if (dashboardsSettled.status === 'rejected') {
      console.warn('[WorkspacesPage] getDashboards failed:', dashboardsSettled.reason);
    } else if (!dashboardsSettled.value.success) {
      console.warn(
        '[WorkspacesPage] getDashboards returned error:',
        dashboardsSettled.value.error
      );
    }

    // loadWarning: 'reports' when reports failed but dashboards succeeded,
    // 'dashboards' when only dashboards failed. When both failed we leave
    // warning null and let the existing empty-state UI handle it (the user
    // sees an empty workspace, which matches the legacy behavior).
    let loadWarning: 'reports' | 'dashboards' | null = null;
    if (!reportsOk && dashboardsOk) loadWarning = 'reports';
    else if (reportsOk && !dashboardsOk) loadWarning = 'dashboards';

    setWorkspaces((prev) =>
      prev.map((ws) =>
        ws.id === workspaceId
          ? {
              ...ws,
              reports,
              dashboards,
              isLoading: false,
              loadWarning,
            }
          : ws
      )
    );
  }, []);

  useEffect(() => {
    loadWorkspaces();
  }, []);

  // Handle expand query param from search navigation
  useEffect(() => {
    const expandId = searchParams.get('expand');
    // Only expand if we have a new expandId that differs from the last one we handled
    if (expandId && workspaces.length > 0 && expandId !== lastExpandedId) {
      const workspace = workspaces.find((ws) => ws.id === expandId);
      if (workspace && !workspace.isExpanded) {
        toggleWorkspace(expandId);
      }
      setLastExpandedId(expandId);
    }
  }, [workspaces, searchParams, lastExpandedId, toggleWorkspace]);

  const openReport = (workspace: WorkspaceWithContent, report: Report) => {
    // recordItemOpened is fire-and-forget; navigate must fire on the same
    // tick so the user doesn't perceive lag while usage bookkeeping awaits.
    recordItemOpened({
      id: report.id,
      name: report.name,
      type: 'report',
      workspaceId: workspace.id,
      workspaceName: workspace.name,
    });
    navigate(`/report/${workspace.id}/${report.id}`);
  };

  const openDashboard = (workspace: WorkspaceWithContent, dashboard: Dashboard) => {
    recordItemOpened({
      id: dashboard.id,
      name: dashboard.name,
      type: 'dashboard',
      workspaceId: workspace.id,
      workspaceName: workspace.name,
    });
    navigate(`/dashboard/${workspace.id}/${dashboard.id}`);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Spinner size="large" />
          <Text className="mt-4 text-neutral-foreground-2 block">
            Loading workspaces...
          </Text>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-status-error/10 border border-status-error rounded-lg p-4">
          <Text className="text-status-error">{error}</Text>
          <Button appearance="subtle" size="small" onClick={loadWorkspaces} className="mt-2">
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-neutral-foreground-1">
            Workspaces
          </h1>
          <Button
            appearance="subtle"
            icon={<ArrowSyncRegular />}
            onClick={loadWorkspaces}
          >
            Refresh
          </Button>
        </div>

        {workspaces.length === 0 ? (
          <div className="bg-neutral-background-2 rounded-lg p-8 text-center">
            <Text className="text-neutral-foreground-3">
              No workspaces found. Make sure you have access to Power BI workspaces.
            </Text>
          </div>
        ) : (
          <div className="space-y-2">
            {workspaces.map((workspace) => (
              <div key={workspace.id} className="border border-neutral-stroke-2 rounded-lg overflow-hidden">
                {/* Workspace header */}
                <button
                  className="w-full flex items-center gap-3 p-4 hover:bg-neutral-background-3 transition-colors text-left"
                  onClick={() => toggleWorkspace(workspace.id)}
                >
                  <ChevronRightRegular
                    className={`text-neutral-foreground-2 transition-transform ${
                      workspace.isExpanded ? 'rotate-90' : ''
                    }`}
                  />
                  <FolderRegular className="text-brand-primary text-xl" />
                  <div className="flex-1 min-w-0">
                    <Text weight="semibold" className="text-neutral-foreground-1 block truncate">
                      {workspace.name}
                    </Text>
                  </div>
                  {workspace.isExpanded && !workspace.isLoading && (
                    <Badge appearance="outline" size="small">
                      {workspace.reports.length + workspace.dashboards.length} items
                    </Badge>
                  )}
                </button>

                {/* Workspace content */}
                {workspace.isExpanded && (
                  <div className="border-t border-neutral-stroke-2 bg-neutral-background-2">
                    {workspace.isLoading ? (
                      <div className="p-4 flex items-center justify-center">
                        <Spinner size="small" />
                        <Text className="ml-2 text-neutral-foreground-2">Loading content...</Text>
                      </div>
                    ) : workspace.reports.length === 0 && workspace.dashboards.length === 0 ? (
                      <div className="p-4 text-center">
                        <Text className="text-neutral-foreground-3">
                          No reports or dashboards in this workspace.
                        </Text>
                      </div>
                    ) : (
                      <div className="divide-y divide-neutral-stroke-2">
                        {/* Partial-failure warning: render what succeeded
                            with an inline note about the half that didn't. */}
                        {workspace.loadWarning && (
                          <div
                            role="status"
                            className="px-4 py-2 bg-status-warning/10"
                          >
                            <Text size={200} className="text-status-warning">
                              Could not load {workspace.loadWarning} for this workspace.
                            </Text>
                          </div>
                        )}
                        {/* Reports */}
                        {workspace.reports.map((report) => (
                          <button
                            key={report.id}
                            className="w-full flex items-center gap-3 p-3 pl-12 hover:bg-neutral-background-3 transition-colors text-left"
                            onClick={() => openReport(workspace, report)}
                          >
                            <DocumentRegular className="text-accent-primary" />
                            <div className="flex-1 min-w-0">
                              <Text className="text-neutral-foreground-1 block truncate">
                                {report.name}
                              </Text>
                            </div>
                            <Badge appearance="outline" size="small" color="informative">
                              Report
                            </Badge>
                          </button>
                        ))}

                        {/* Dashboards */}
                        {workspace.dashboards.map((dashboard) => (
                          <button
                            key={dashboard.id}
                            className="w-full flex items-center gap-3 p-3 pl-12 hover:bg-neutral-background-3 transition-colors text-left"
                            onClick={() => openDashboard(workspace, dashboard)}
                          >
                            <BoardRegular className="text-status-success" />
                            <div className="flex-1 min-w-0">
                              <Text className="text-neutral-foreground-1 block truncate">
                                {dashboard.name}
                              </Text>
                            </div>
                            <Badge appearance="outline" size="small" color="success">
                              Dashboard
                            </Badge>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkspacesPage;
