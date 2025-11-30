import { authService } from '../auth/auth-service';
import { POWERBI_API_BASE } from '../../shared/constants';
import type {
  Workspace,
  Report,
  Dashboard,
  App,
  EmbedToken,
  DatasetRefreshInfo,
  IPCResponse,
} from '../../shared/types';

interface PowerBIApiResponse<T> {
  value: T[];
  '@odata.context'?: string;
  '@odata.nextLink'?: string;
}

class PowerBIApiService {
  private async makeRequest<T>(endpoint: string): Promise<T> {
    const tokenResponse = await authService.getAccessToken();

    if (!tokenResponse.success || !tokenResponse.data) {
      throw new Error(tokenResponse.error?.message || 'Failed to get access token');
    }

    const response = await fetch(`${POWERBI_API_BASE}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${tokenResponse.data}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Power BI API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Makes a request to a full URL (used for pagination with @odata.nextLink)
   */
  private async makeRequestWithUrl<T>(fullUrl: string): Promise<T> {
    const tokenResponse = await authService.getAccessToken();

    if (!tokenResponse.success || !tokenResponse.data) {
      throw new Error(tokenResponse.error?.message || 'Failed to get access token');
    }

    const response = await fetch(fullUrl, {
      headers: {
        Authorization: `Bearer ${tokenResponse.data}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Power BI API error: ${response.status} - ${errorText}`);
    }

    return response.json();
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

    while (nextUrl) {
      const response: PowerBIApiResponse<TRaw> = await this.makeRequestWithUrl(nextUrl);
      allItems.push(...response.value.map(transform));
      nextUrl = response['@odata.nextLink'];
    }

    return allItems;
  }

  async getWorkspaces(): Promise<IPCResponse<Workspace[]>> {
    try {
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
    } catch (error) {
      return {
        success: false,
        error: { code: 'WORKSPACES_FETCH_FAILED', message: String(error) },
      };
    }
  }

  async getReports(workspaceId: string): Promise<IPCResponse<Report[]>> {
    try {
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
    } catch (error) {
      return {
        success: false,
        error: { code: 'REPORTS_FETCH_FAILED', message: String(error) },
      };
    }
  }

  async getDashboards(workspaceId: string): Promise<IPCResponse<Dashboard[]>> {
    try {
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
    } catch (error) {
      return {
        success: false,
        error: { code: 'DASHBOARDS_FETCH_FAILED', message: String(error) },
      };
    }
  }

  async getDashboard(workspaceId: string, dashboardId: string): Promise<IPCResponse<Dashboard>> {
    try {
      const response = await this.makeRequest<{
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
    } catch (error) {
      return {
        success: false,
        error: { code: 'DASHBOARD_FETCH_FAILED', message: String(error) },
      };
    }
  }

  async getApps(): Promise<IPCResponse<App[]>> {
    try {
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
    } catch (error) {
      return {
        success: false,
        error: { code: 'APPS_FETCH_FAILED', message: String(error) },
      };
    }
  }

  async getApp(appId: string): Promise<IPCResponse<App>> {
    try {
      const response = await this.makeRequest<{
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
    } catch (error) {
      return {
        success: false,
        error: { code: 'APP_FETCH_FAILED', message: String(error) },
      };
    }
  }

  async getAppReports(appId: string): Promise<IPCResponse<Report[]>> {
    try {
      // First, get the app to retrieve its actual workspaceId
      // Power BI embedding requires the real workspace GUID, not the app ID
      const appResponse = await this.getApp(appId);
      if (!appResponse.success || !appResponse.data) {
        return {
          success: false,
          error: appResponse.error || { code: 'APP_FETCH_FAILED', message: 'Failed to fetch app details' },
        };
      }

      const actualWorkspaceId = appResponse.data.workspaceId;
      if (!actualWorkspaceId) {
        return {
          success: false,
          error: { code: 'NO_WORKSPACE_ID', message: 'App does not have a workspaceId - cannot embed reports' },
        };
      }

      const response = await this.makeRequest<PowerBIApiResponse<{
        id: string;
        name: string;
        embedUrl: string;
        datasetId: string;
        reportType: string;
        appId: string;
      }>>(`/apps/${appId}/reports`);

      const reports: Report[] = response.value.map((report) => ({
        id: report.id,
        name: report.name,
        workspaceId: actualWorkspaceId, // Use actual workspace GUID for embedding
        embedUrl: report.embedUrl,
        datasetId: report.datasetId,
        reportType: report.reportType === 'PaginatedReport' ? 'PaginatedReport' : 'PowerBIReport',
      }));

      return { success: true, data: reports };
    } catch (error) {
      return {
        success: false,
        error: { code: 'APP_REPORTS_FETCH_FAILED', message: String(error) },
      };
    }
  }

  async getAppDashboards(appId: string): Promise<IPCResponse<Dashboard[]>> {
    try {
      // First, get the app to retrieve its actual workspaceId
      // Power BI embedding requires the real workspace GUID, not the app ID
      const appResponse = await this.getApp(appId);
      if (!appResponse.success || !appResponse.data) {
        return {
          success: false,
          error: appResponse.error || { code: 'APP_FETCH_FAILED', message: 'Failed to fetch app details' },
        };
      }

      const actualWorkspaceId = appResponse.data.workspaceId;
      if (!actualWorkspaceId) {
        return {
          success: false,
          error: { code: 'NO_WORKSPACE_ID', message: 'App does not have a workspaceId - cannot embed dashboards' },
        };
      }

      const response = await this.makeRequest<PowerBIApiResponse<{
        id: string;
        displayName: string;
        embedUrl: string;
        isReadOnly: boolean;
        appId: string;
      }>>(`/apps/${appId}/dashboards`);

      const dashboards: Dashboard[] = response.value.map((dashboard) => ({
        id: dashboard.id,
        name: dashboard.displayName,
        workspaceId: actualWorkspaceId, // Use actual workspace GUID for embedding
        embedUrl: dashboard.embedUrl,
        isReadOnly: dashboard.isReadOnly,
      }));

      return { success: true, data: dashboards };
    } catch (error) {
      return {
        success: false,
        error: { code: 'APP_DASHBOARDS_FETCH_FAILED', message: String(error) },
      };
    }
  }

  async getEmbedToken(
    reportId: string,
    workspaceId: string
  ): Promise<IPCResponse<EmbedToken>> {
    try {
      // For user-owns-data scenario, we use the access token directly
      // For app-owns-data, we would generate an embed token
      const tokenResponse = await authService.getAccessToken();

      if (!tokenResponse.success || !tokenResponse.data) {
        throw new Error(tokenResponse.error?.message || 'Failed to get access token');
      }

      // Return the access token as the embed token for user-owns-data scenario
      return {
        success: true,
        data: {
          token: tokenResponse.data,
          tokenId: '', // Not used in user-owns-data
          expiration: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
        },
      };
    } catch (error) {
      return {
        success: false,
        error: { code: 'EMBED_TOKEN_FAILED', message: String(error) },
      };
    }
  }

  /**
   * Fetches all available reports and dashboards from all workspaces.
   * For actual "recent" items based on user activity, use usage-tracking-service.
   */
  async getAllItems(): Promise<IPCResponse<{
    reports: Report[];
    dashboards: Dashboard[];
  }>> {
    try {
      // Get all workspaces first
      const workspacesResponse = await this.getWorkspaces();
      if (!workspacesResponse.success || !workspacesResponse.data) {
        return {
          success: false,
          error: workspacesResponse.error,
        };
      }

      const allReports: Report[] = [];
      const allDashboards: Dashboard[] = [];

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
            return { reportsResponse, dashboardsResponse };
          })
        );

        for (const { reportsResponse, dashboardsResponse } of batchResults) {
          if (reportsResponse.success && reportsResponse.data) {
            allReports.push(...reportsResponse.data);
          }
          if (dashboardsResponse.success && dashboardsResponse.data) {
            allDashboards.push(...dashboardsResponse.data);
          }
        }
      }

      return {
        success: true,
        data: {
          reports: allReports,
          dashboards: allDashboards,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: { code: 'ALL_ITEMS_FETCH_FAILED', message: String(error) },
      };
    }
  }

  async getDatasetRefreshInfo(datasetId: string, workspaceId?: string): Promise<IPCResponse<DatasetRefreshInfo>> {
    try {
      // Get the most recent refresh history (top 1)
      // Use workspace context if provided, otherwise try direct access (for My Workspace)
      const endpoint = workspaceId
        ? `/groups/${workspaceId}/datasets/${datasetId}/refreshes?$top=1`
        : `/datasets/${datasetId}/refreshes?$top=1`;

      const response = await this.makeRequest<PowerBIApiResponse<{
        requestId: string;
        id: string;
        refreshType: string;
        startTime: string;
        endTime: string;
        status: string;
      }>>(endpoint);

      if (response.value && response.value.length > 0) {
        const lastRefresh = response.value[0];
        return {
          success: true,
          data: {
            lastRefreshTime: lastRefresh.endTime || lastRefresh.startTime,
            lastRefreshStatus: lastRefresh.status as DatasetRefreshInfo['lastRefreshStatus'],
          },
        };
      }

      return {
        success: true,
        data: {},
      };
    } catch {
      // Return success with empty data - don't break the app for this non-critical feature
      // Common reasons: 401 (user lacks write permissions), 403 (access forbidden), DirectQuery/Live datasets
      return {
        success: true,
        data: {},
      };
    }
  }
}

export const powerbiApiService = new PowerBIApiService();
