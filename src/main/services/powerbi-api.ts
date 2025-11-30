import { authService } from '../auth/auth-service';
import { POWERBI_API_BASE } from '../../shared/constants';
import type {
  Workspace,
  Report,
  Dashboard,
  App,
  EmbedToken,
  IPCResponse,
} from '../../shared/types';

interface PowerBIApiResponse<T> {
  value: T[];
  '@odata.context'?: string;
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

  async getWorkspaces(): Promise<IPCResponse<Workspace[]>> {
    try {
      const response = await this.makeRequest<PowerBIApiResponse<{
        id: string;
        name: string;
        isReadOnly: boolean;
        type: string;
      }>>('/groups');

      const workspaces: Workspace[] = response.value.map((ws) => ({
        id: ws.id,
        name: ws.name,
        isReadOnly: ws.isReadOnly,
        type: ws.type === 'PersonalGroup' ? 'PersonalGroup' : 'Workspace',
      }));

      return { success: true, data: workspaces };
    } catch (error) {
      console.error('[PowerBIAPI] getWorkspaces error:', error);
      return {
        success: false,
        error: { code: 'WORKSPACES_FETCH_FAILED', message: String(error) },
      };
    }
  }

  async getReports(workspaceId: string): Promise<IPCResponse<Report[]>> {
    try {
      const response = await this.makeRequest<PowerBIApiResponse<{
        id: string;
        name: string;
        embedUrl: string;
        datasetId: string;
        reportType: string;
      }>>(`/groups/${workspaceId}/reports`);

      const reports: Report[] = response.value.map((report) => ({
        id: report.id,
        name: report.name,
        workspaceId,
        embedUrl: report.embedUrl,
        datasetId: report.datasetId,
        reportType: report.reportType === 'PaginatedReport' ? 'PaginatedReport' : 'PowerBIReport',
      }));

      return { success: true, data: reports };
    } catch (error) {
      console.error('[PowerBIAPI] getReports error:', error);
      return {
        success: false,
        error: { code: 'REPORTS_FETCH_FAILED', message: String(error) },
      };
    }
  }

  async getDashboards(workspaceId: string): Promise<IPCResponse<Dashboard[]>> {
    try {
      const response = await this.makeRequest<PowerBIApiResponse<{
        id: string;
        displayName: string;
        embedUrl: string;
        isReadOnly: boolean;
      }>>(`/groups/${workspaceId}/dashboards`);

      const dashboards: Dashboard[] = response.value.map((dashboard) => ({
        id: dashboard.id,
        name: dashboard.displayName,
        workspaceId,
        embedUrl: dashboard.embedUrl,
        isReadOnly: dashboard.isReadOnly,
      }));

      return { success: true, data: dashboards };
    } catch (error) {
      console.error('[PowerBIAPI] getDashboards error:', error);
      return {
        success: false,
        error: { code: 'DASHBOARDS_FETCH_FAILED', message: String(error) },
      };
    }
  }

  async getApps(): Promise<IPCResponse<App[]>> {
    try {
      const response = await this.makeRequest<PowerBIApiResponse<{
        id: string;
        name: string;
        description: string;
        publishedBy: string;
        lastUpdate: string;
        workspaceId?: string;
      }>>('/apps');

      const apps: App[] = response.value.map((app) => ({
        id: app.id,
        name: app.name,
        description: app.description,
        publishedBy: app.publishedBy,
        lastUpdate: app.lastUpdate,
        workspaceId: app.workspaceId,
      }));

      return { success: true, data: apps };
    } catch (error) {
      console.error('[PowerBIAPI] getApps error:', error);
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
      console.error('[PowerBIAPI] getApp error:', error);
      return {
        success: false,
        error: { code: 'APP_FETCH_FAILED', message: String(error) },
      };
    }
  }

  async getAppReports(appId: string): Promise<IPCResponse<Report[]>> {
    try {
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
        workspaceId: appId, // Use appId as the workspace identifier for app reports
        embedUrl: report.embedUrl,
        datasetId: report.datasetId,
        reportType: report.reportType === 'PaginatedReport' ? 'PaginatedReport' : 'PowerBIReport',
      }));

      return { success: true, data: reports };
    } catch (error) {
      console.error('[PowerBIAPI] getAppReports error:', error);
      return {
        success: false,
        error: { code: 'APP_REPORTS_FETCH_FAILED', message: String(error) },
      };
    }
  }

  async getAppDashboards(appId: string): Promise<IPCResponse<Dashboard[]>> {
    try {
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
        workspaceId: appId, // Use appId as the workspace identifier for app dashboards
        embedUrl: dashboard.embedUrl,
        isReadOnly: dashboard.isReadOnly,
      }));

      return { success: true, data: dashboards };
    } catch (error) {
      console.error('[PowerBIAPI] getAppDashboards error:', error);
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
      console.error('[PowerBIAPI] getEmbedToken error:', error);
      return {
        success: false,
        error: { code: 'EMBED_TOKEN_FAILED', message: String(error) },
      };
    }
  }

  async getRecentItems(): Promise<IPCResponse<{
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

      // Fetch reports and dashboards from each workspace (limit to first 5 for performance)
      const workspacesToFetch = workspacesResponse.data.slice(0, 5);

      for (const workspace of workspacesToFetch) {
        const [reportsResponse, dashboardsResponse] = await Promise.all([
          this.getReports(workspace.id),
          this.getDashboards(workspace.id),
        ]);

        if (reportsResponse.success && reportsResponse.data) {
          allReports.push(...reportsResponse.data);
        }
        if (dashboardsResponse.success && dashboardsResponse.data) {
          allDashboards.push(...dashboardsResponse.data);
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
      console.error('[PowerBIAPI] getRecentItems error:', error);
      return {
        success: false,
        error: { code: 'RECENT_ITEMS_FETCH_FAILED', message: String(error) },
      };
    }
  }
}

export const powerbiApiService = new PowerBIApiService();
