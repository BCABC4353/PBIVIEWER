// ---------------------------------------------------------------------------
// Catalog tier: workspace / report / dashboard / app listings plus the
// @odata.nextLink pagination helper they share. Requests flow through the
// injected port so the token plumbing stays in powerbi-api.ts (the facade).
// ---------------------------------------------------------------------------

import { POWERBI_API_BASE, type PowerBIApiResponse } from './http';
import { buildErrorEnvelope, withErrorEnvelope } from './envelope';
import type { Workspace, Report, Dashboard, App, IPCResponse } from '../../../shared/types';

/** Authenticated request functions supplied by the facade (auth plumbing). */
export interface CatalogRequestPort {
  request<T>(endpoint: string): Promise<T>;
  /** Request against a full URL (used for pagination with @odata.nextLink). */
  requestWithUrl<T>(fullUrl: string): Promise<T>;
}

export class PowerBICatalogApi {
  private readonly port: CatalogRequestPort;

  constructor(port: CatalogRequestPort) {
    this.port = port;
  }

  /**
   * Fetches all pages of a paginated API response using @odata.nextLink
   */
  private async fetchAllPages<TRaw, TTransformed>(
    endpoint: string,
    transform: (item: TRaw) => TTransformed
  ): Promise<TTransformed[]> {
    const allItems: TTransformed[] = [];
    let nextUrl: string | undefined = `${POWERBI_API_BASE}${endpoint}`;

    // A buggy or malicious @odata.nextLink chain (circular, or unbounded) would
    // otherwise loop forever at up to ~20s/request. 100 pages is far beyond any
    // real tenant; truncate with a warning instead of hanging the app.
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
      // First, get the app to retrieve its actual workspaceId
      // Power BI embedding requires the real workspace GUID, not the app ID
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
        /** The SAME report's id in the app's source workspace. */
        originalReportObjectId?: string;
      }

      // Use fetchAllPages so apps with >100 reports paginate via @odata.nextLink
      // instead of silently truncating to the first page.
      const raw = await this.fetchAllPages<RawAppReport, RawAppReport>(
        `/apps/${appId}/reports`,
        (report) => report,
      );

      // Tenant-verified quirk (diagnose-pbi 2026-06-10): /apps/{id}/reports can
      // return datasetId:"" while carrying originalReportObjectId — a pointer to
      // the SAME report in the app's source workspace, where datasetId IS
      // populated. Without this hop the App view has no datasets to ask about
      // and the freshness strip reads "Data refreshed: —" forever. Backfill
      // with ONE workspace listing (id match first, then name match); the hop
      // is best-effort so a denied workspace degrades to the old behavior.
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
        workspaceId: actualWorkspaceId, // Use actual workspace GUID for embedding
        embedUrl: report.embedUrl,
        datasetId: report.datasetId,
        reportType: report.reportType === 'PaginatedReport' ? 'PaginatedReport' : 'PowerBIReport',
        // The app webview's URL can name this report by EITHER guid (the
        // app-scoped id or the source-workspace original) depending on how
        // Power BI routed the navigation — freshness matching accepts both.
        originalReportObjectId: report.originalReportObjectId,
      }));

      return { success: true, data: reports };
    });
  }

  async getAppDashboards(appId: string): Promise<IPCResponse<Dashboard[]>> {
    return withErrorEnvelope('APP_DASHBOARDS_FETCH_FAILED', async () => {
      // First, get the app to retrieve its actual workspaceId
      // Power BI embedding requires the real workspace GUID, not the app ID
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

      // Use fetchAllPages so apps with >100 dashboards paginate via
      // @odata.nextLink instead of silently truncating to the first page.
      const dashboards = await this.fetchAllPages<RawAppDashboard, Dashboard>(
        `/apps/${appId}/dashboards`,
        (dashboard) => ({
          id: dashboard.id,
          name: dashboard.displayName,
          workspaceId: actualWorkspaceId, // Use actual workspace GUID for embedding
          embedUrl: dashboard.embedUrl,
          isReadOnly: dashboard.isReadOnly,
        })
      );

      return { success: true, data: dashboards };
    });
  }

  /**
   * Fetches all available reports and dashboards from all workspaces.
   * For actual "recent" items based on user activity, use usage-tracking-service.
   *
   * Per-workspace failures do NOT abort the whole call: successful workspaces
   * still contribute to the result, and the failures are surfaced via
   * `failedWorkspaces` / `partialFailure` so the renderer can warn the user.
   * If every workspace fails, the call returns success:false.
   */
  async getAllItems(): Promise<IPCResponse<{
    workspaces: Workspace[];
    reports: Report[];
    dashboards: Dashboard[];
    partialFailure: boolean;
    failedWorkspaces: Array<{ id: string; name: string; error: string }>;
  }>> {
    return withErrorEnvelope('ALL_ITEMS_FETCH_FAILED', async () => {
      // Get all workspaces first
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

      // Fetch reports and dashboards from all workspaces in parallel batches
      const workspaces = workspacesResponse.data;
      const BATCH_SIZE = 5; // Process 5 workspaces at a time to avoid rate limits

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

      // If every workspace failed, surface a hard failure rather than an
      // empty success — the renderer should not silently render "no content".
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
