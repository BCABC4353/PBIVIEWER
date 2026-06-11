
import { POWERBI_API_BASE, type PowerBIApiResponse } from './http';
import { buildErrorEnvelope, withErrorEnvelope } from './envelope';
import type { Workspace, Report, Dashboard, App, IPCResponse } from '../../../shared/types';

export interface CatalogRequestPort {
  request<T>(endpoint: string): Promise<T>;
  requestWithUrl<T>(fullUrl: string): Promise<T>;
}

export class PowerBICatalogApi {
  private readonly port: CatalogRequestPort;

  constructor(port: CatalogRequestPort) {
    this.port = port;
  }

  private async fetchAllPages<TRaw, TTransformed>(
    endpoint: string,
    transform: (item: TRaw) => TTransformed
  ): Promise<TTransformed[]> {
    const allItems: TTransformed[] = [];
    let nextUrl: string | undefined = `${POWERBI_API_BASE}${endpoint}`;

    const seenUrls = new Set<string>();
    const MAX_PAGES = 100;

    while (nextUrl) {
      if (seenUrls.has(nextUrl)) {
        console.warn('[PowerBI API] Circular @odata.nextLink detected — stopping pagination');
        break;
      }
      if (seenUrls.size >= MAX_PAGES) {
        console.warn(`[PowerBI API] Pagination exceeded ${MAX_PAGES} pages — truncating results`);
        break;
      }
      seenUrls.add(nextUrl);
      const response: PowerBIApiResponse<TRaw> = await this.port.requestWithUrl(nextUrl);
      allItems.push(...response.value.map(transform));
      nextUrl = response['@odata.nextLink'];
    }

    return allItems;
  }

  async getWorkspaces(): Promise<IPCResponse<Workspace[]>> {
    return withErrorEnvelope('WORKSPACES_FETCH_FAILED', async () => {
      interface RawWorkspace {
        id: string;
        name: string;
        isReadOnly: boolean;
        type: string;
      }

      const workspaces = await this.fetchAllPages<RawWorkspace, Workspace>(
        '/groups',
        (ws) => ({
          id: ws.id,
          name: ws.name,
          isReadOnly: ws.isReadOnly,
          type: ws.type === 'PersonalGroup' ? 'PersonalGroup' : 'Workspace',
        })
      );

      return { success: true, data: workspaces };
    });
  }

  async getReports(workspaceId: string): Promise<IPCResponse<Report[]>> {
    return withErrorEnvelope('REPORTS_FETCH_FAILED', async () => {
      interface RawReport {
        id: string;
        name: string;
        embedUrl: string;
        datasetId: string;
        reportType: string;
      }

      const reports = await this.fetchAllPages<RawReport, Report>(
        `/groups/${workspaceId}/reports`,
        (report) => ({
          id: report.id,
          name: report.name,
          workspaceId,
          embedUrl: report.embedUrl,
          datasetId: report.datasetId,
          reportType: report.reportType === 'PaginatedReport' ? 'PaginatedReport' : 'PowerBIReport',
        })
      );

      return { success: true, data: reports };
    });
  }

  async getDashboards(workspaceId: string): Promise<IPCResponse<Dashboard[]>> {
    return withErrorEnvelope('DASHBOARDS_FETCH_FAILED', async () => {
      interface RawDashboard {
        id: string;
        displayName: string;
        embedUrl: string;
        isReadOnly: boolean;
      }

      const dashboards = await this.fetchAllPages<RawDashboard, Dashboard>(
        `/groups/${workspaceId}/dashboards`,
        (dashboard) => ({
          id: dashboard.id,
          name: dashboard.displayName,
          workspaceId,
          embedUrl: dashboard.embedUrl,
          isReadOnly: dashboard.isReadOnly,
        })
      );

      return { success: true, data: dashboards };
    });
  }

  async getDashboard(workspaceId: string, dashboardId: string): Promise<IPCResponse<Dashboard>> {
    return withErrorEnvelope('DASHBOARD_FETCH_FAILED', async () => {
      const response = await this.port.request<{
        id: string;
        displayName: string;
        embedUrl: string;
        isReadOnly: boolean;
      }>(`/groups/${workspaceId}/dashboards/${dashboardId}`);

      return {
        success: true,
        data: {
          id: response.id,
          name: response.displayName,
          workspaceId,
          embedUrl: response.embedUrl,
          isReadOnly: response.isReadOnly,
        },
      };
    });
  }

  async getApps(): Promise<IPCResponse<App[]>> {
    return withErrorEnvelope('APPS_FETCH_FAILED', async () => {
      interface RawApp {
        id: string;
        name: string;
        description: string;
        publishedBy: string;
        lastUpdate: string;
        workspaceId?: string;
      }

      const apps = await this.fetchAllPages<RawApp, App>(
        '/apps',
        (app) => ({
          id: app.id,
          name: app.name,
          description: app.description,
          publishedBy: app.publishedBy,
          lastUpdate: app.lastUpdate,
          workspaceId: app.workspaceId,
        })
      );

      return { success: true, data: apps };
    });
  }

  async getApp(appId: string): Promise<IPCResponse<App>> {
    return withErrorEnvelope('APP_FETCH_FAILED', async () => {
      const response = await this.port.request<{
        id: string;
        name: string;
        description: string;
        publishedBy: string;
        lastUpdate: string;
        workspaceId?: string;
      }>(`/apps/${appId}`);

      const app: App = {
        id: response.id,
        name: response.name,
        description: response.description,
        publishedBy: response.publishedBy,
        lastUpdate: response.lastUpdate,
        workspaceId: response.workspaceId,
      };

      return { success: true, data: app };
    });
  }

  async getAppReports(appId: string): Promise<IPCResponse<Report[]>> {
    return withErrorEnvelope('APP_REPORTS_FETCH_FAILED', async () => {
      const appResponse = await this.getApp(appId);
      if (!appResponse.success) {
        return {
          success: false,
          error: appResponse.error,
        };
      }

      const actualWorkspaceId = appResponse.data.workspaceId;
      if (!actualWorkspaceId) {
        return {
          success: false,
          error: { code: 'NO_WORKSPACE_ID', message: 'App does not have a workspaceId - cannot embed reports' },
        };
      }

      interface RawAppReport {
        id: string;
        name: string;
        embedUrl: string;
        datasetId: string;
        reportType: string;
        appId: string;
        originalReportObjectId?: string;
      }

      const raw = await this.fetchAllPages<RawAppReport, RawAppReport>(
        `/apps/${appId}/reports`,
        (report) => report,
      );

      if (raw.some((r) => !r.datasetId)) {
        try {
          const wsReports = await this.fetchAllPages<
            { id: string; name: string; datasetId?: string },
            { id: string; name: string; datasetId?: string }
          >(`/groups/${actualWorkspaceId}/reports`, (r) => r);
          const byId = new Map<string, string>();
          const byName = new Map<string, string>();
          for (const w of wsReports) {
            if (w.datasetId) {
              byId.set(w.id, w.datasetId);
              byName.set(w.name.toLowerCase(), w.datasetId);
            }
          }
          for (const r of raw) {
            if (!r.datasetId) {
              r.datasetId =
                (r.originalReportObjectId ? byId.get(r.originalReportObjectId) : undefined) ??
                byName.get(r.name.toLowerCase()) ??
                r.datasetId;
            }
          }
        } catch (err) {
          console.warn('[PowerBI] App dataset backfill failed (degrading):', err);
        }
      }

      const reports: Report[] = raw.map((report) => ({
        id: report.id,
        name: report.name,
        workspaceId: actualWorkspaceId,
        embedUrl: report.embedUrl,
        datasetId: report.datasetId,
        reportType: report.reportType === 'PaginatedReport' ? 'PaginatedReport' : 'PowerBIReport',
        originalReportObjectId: report.originalReportObjectId,
      }));

      return { success: true, data: reports };
    });
  }

  async getAppDashboards(appId: string): Promise<IPCResponse<Dashboard[]>> {
    return withErrorEnvelope('APP_DASHBOARDS_FETCH_FAILED', async () => {
      const appResponse = await this.getApp(appId);
      if (!appResponse.success) {
        return {
          success: false,
          error: appResponse.error,
        };
      }

      const actualWorkspaceId = appResponse.data.workspaceId;
      if (!actualWorkspaceId) {
        return {
          success: false,
          error: { code: 'NO_WORKSPACE_ID', message: 'App does not have a workspaceId - cannot embed dashboards' },
        };
      }

      interface RawAppDashboard {
        id: string;
        displayName: string;
        embedUrl: string;
        isReadOnly: boolean;
        appId: string;
      }

      const dashboards = await this.fetchAllPages<RawAppDashboard, Dashboard>(
        `/apps/${appId}/dashboards`,
        (dashboard) => ({
          id: dashboard.id,
          name: dashboard.displayName,
          workspaceId: actualWorkspaceId,
          embedUrl: dashboard.embedUrl,
          isReadOnly: dashboard.isReadOnly,
        })
      );

      return { success: true, data: dashboards };
    });
  }

  async getAllItems(): Promise<IPCResponse<{
    workspaces: Workspace[];
    reports: Report[];
    dashboards: Dashboard[];
    partialFailure: boolean;
    failedWorkspaces: Array<{ id: string; name: string; error: string }>;
  }>> {
    return withErrorEnvelope('ALL_ITEMS_FETCH_FAILED', async () => {
      const workspacesResponse = await this.getWorkspaces();
      if (!workspacesResponse.success) {
        return {
          success: false,
          error: workspacesResponse.error,
        };
      }

      const allReports: Report[] = [];
      const allDashboards: Dashboard[] = [];
      const failedWorkspaces: Array<{ id: string; name: string; error: string }> = [];

      const workspaces = workspacesResponse.data;
      const BATCH_SIZE = 5;

      for (let i = 0; i < workspaces.length; i += BATCH_SIZE) {
        const batch = workspaces.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (workspace) => {
            const [reportsResponse, dashboardsResponse] = await Promise.all([
              this.getReports(workspace.id),
              this.getDashboards(workspace.id),
            ]);
            return { workspace, reportsResponse, dashboardsResponse };
          })
        );

        for (const { workspace, reportsResponse, dashboardsResponse } of batchResults) {
          if (reportsResponse.success && reportsResponse.data) {
            allReports.push(...reportsResponse.data);
          }
          if (dashboardsResponse.success && dashboardsResponse.data) {
            allDashboards.push(...dashboardsResponse.data);
          }
          if (!reportsResponse.success || !dashboardsResponse.success) {
            const parts: string[] = [];
            if (!reportsResponse.success) {
              parts.push(`reports: ${reportsResponse.error.message}`);
            }
            if (!dashboardsResponse.success) {
              parts.push(`dashboards: ${dashboardsResponse.error.message}`);
            }
            failedWorkspaces.push({
              id: workspace.id,
              name: workspace.name,
              error: parts.join('; '),
            });
          }
        }
      }

      if (workspaces.length > 0 && failedWorkspaces.length === workspaces.length) {
        return {
          success: false,
          error: buildErrorEnvelope('BULK_FETCH_FAILED', 'All workspaces failed to load.'),
        };
      }

      return {
        success: true,
        data: {
          workspaces,
          reports: allReports,
          dashboards: allDashboards,
          partialFailure: failedWorkspaces.length > 0,
          failedWorkspaces,
        },
      };
    });
  }
}
