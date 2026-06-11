
import type { Report, Dashboard } from '../../shared/types';

export type WorkspaceLoadWarning = 'reports' | 'dashboards' | 'both' | null;

export interface WorkspaceContentResult {
  reports: Report[];
  dashboards: Dashboard[];
  loadWarning: WorkspaceLoadWarning;
}

export async function fetchWorkspaceContent(
  workspaceId: string,
): Promise<WorkspaceContentResult> {
  const [reportsSettled, dashboardsSettled] = await Promise.allSettled([
    window.electronAPI.content.getReports(workspaceId),
    window.electronAPI.content.getDashboards(workspaceId),
  ]);

  const reportsOk =
    reportsSettled.status === 'fulfilled' && reportsSettled.value.success;
  const dashboardsOk =
    dashboardsSettled.status === 'fulfilled' && dashboardsSettled.value.success;

  const reports: Report[] =
    reportsSettled.status === 'fulfilled' && reportsSettled.value.success
      ? reportsSettled.value.data
      : [];
  const dashboards: Dashboard[] =
    dashboardsSettled.status === 'fulfilled' && dashboardsSettled.value.success
      ? dashboardsSettled.value.data
      : [];

  if (reportsSettled.status === 'rejected') {
    console.warn('[fetchWorkspaceContent] getReports failed:', reportsSettled.reason);
  } else if (!reportsSettled.value.success) {
    console.warn(
      '[fetchWorkspaceContent] getReports returned error:',
      reportsSettled.value.error,
    );
  }
  if (dashboardsSettled.status === 'rejected') {
    console.warn('[fetchWorkspaceContent] getDashboards failed:', dashboardsSettled.reason);
  } else if (!dashboardsSettled.value.success) {
    console.warn(
      '[fetchWorkspaceContent] getDashboards returned error:',
      dashboardsSettled.value.error,
    );
  }

  let loadWarning: WorkspaceLoadWarning = null;
  if (!reportsOk && !dashboardsOk) loadWarning = 'both';
  else if (!reportsOk && dashboardsOk) loadWarning = 'reports';
  else if (reportsOk && !dashboardsOk) loadWarning = 'dashboards';

  return { reports, dashboards, loadWarning };
}
