import React, { useCallback, useEffect, useState } from 'react';
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
import type { Workspace, Report, Dashboard, IPCResponse } from '../../../shared/types';

interface WorkspaceWithContent extends Workspace {
  reports: Report[];
  dashboards: Dashboard[];
  isExpanded: boolean;
  isLoading: boolean;
}

export const WorkspacesPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { recordItemOpened } = useContentStore();
  const [workspaces, setWorkspaces] = useState<WorkspaceWithContent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastExpandedId, setLastExpandedId] = useState<string | null>(null);

  const loadWorkspaces = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await window.electronAPI.content.getWorkspaces() as IPCResponse<Workspace[]>;

      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to load workspaces');
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
    setWorkspaces((prevWorkspaces) => {
      const workspace = prevWorkspaces.find((ws) => ws.id === workspaceId);
      if (!workspace) return prevWorkspaces;

      if (workspace.isExpanded) {
        // Collapse
        return prevWorkspaces.map((ws) =>
          ws.id === workspaceId ? { ...ws, isExpanded: false } : ws
        );
      } else {
        // Expand - if content not loaded, mark as loading
        if (workspace.reports.length === 0 && workspace.dashboards.length === 0) {
          return prevWorkspaces.map((ws) =>
            ws.id === workspaceId ? { ...ws, isLoading: true, isExpanded: true } : ws
          );
        } else {
          return prevWorkspaces.map((ws) =>
            ws.id === workspaceId ? { ...ws, isExpanded: true } : ws
          );
        }
      }
    });

    // Load content if needed (check current state)
    setWorkspaces((prevWorkspaces) => {
      const workspace = prevWorkspaces.find((ws) => ws.id === workspaceId);
      if (workspace && workspace.isLoading) {
        // Trigger content loading asynchronously
        Promise.all([
          window.electronAPI.content.getReports(workspaceId) as Promise<IPCResponse<Report[]>>,
          window.electronAPI.content.getDashboards(workspaceId) as Promise<IPCResponse<Dashboard[]>>,
        ]).then(([reportsRes, dashboardsRes]) => {
          setWorkspaces((prev) =>
            prev.map((ws) =>
              ws.id === workspaceId
                ? {
                    ...ws,
                    reports: reportsRes.data || [],
                    dashboards: dashboardsRes.data || [],
                    isLoading: false,
                  }
                : ws
            )
          );
        }).catch(() => {
          setWorkspaces((prev) =>
            prev.map((ws) =>
              ws.id === workspaceId ? { ...ws, isLoading: false } : ws
            )
          );
        });
      }
      return prevWorkspaces;
    });
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

  const openReport = async (workspace: WorkspaceWithContent, report: Report) => {
    // Record usage before navigating
    await recordItemOpened({
      id: report.id,
      name: report.name,
      type: 'report',
      workspaceId: workspace.id,
      workspaceName: workspace.name,
    });
    navigate(`/report/${workspace.id}/${report.id}`);
  };

  const openDashboard = async (workspace: WorkspaceWithContent, dashboard: Dashboard) => {
    // Record usage before navigating
    await recordItemOpened({
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
