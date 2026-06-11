
import { POWERBI_API_BASE, fetchWithTimeout, throwForStatus, withRetry } from './powerbi/http';
import { PowerBICatalogApi } from './powerbi/catalog';
import { PowerBIFreshnessApi } from './powerbi/freshness';
import { PowerBIInsightsApi } from './powerbi/insights';
import { PowerBIAdminApi } from './powerbi/admin';
import { PowerBIExportApi } from './powerbi/export';
import type {
  Workspace,
  Report,
  Dashboard,
  App,
  EmbedToken,
  DatasetRefreshInfo,
  DatasetWorkspaceRef,
  DataFreshness,
  IPCResponse,
  TokenResult,
  InsightsSnapshot,
  AdminInsights,
} from '../../shared/types';


export interface ApiAuthPort {
  getAccessToken(): Promise<IPCResponse<TokenResult>>;
  getAdminAccessToken?(): Promise<IPCResponse<TokenResult>>;
}

export interface PowerBIApiDeps {
  auth: ApiAuthPort;
}

class PowerBIApiService {
  private readonly deps: PowerBIApiDeps;

  private readonly catalog: PowerBICatalogApi;
  private readonly freshness: PowerBIFreshnessApi;
  private readonly insights: PowerBIInsightsApi;
  private readonly admin: PowerBIAdminApi;
  private readonly exporter: PowerBIExportApi;

  constructor(deps: PowerBIApiDeps) {
    this.deps = deps;
    const request = <T>(endpoint: string): Promise<T> => this.makeRequest<T>(endpoint);
    this.catalog = new PowerBICatalogApi({
      request,
      requestWithUrl: <T>(fullUrl: string): Promise<T> => this.makeRequestWithUrl<T>(fullUrl),
    });
    this.freshness = new PowerBIFreshnessApi({
      request,
      getApp: (appId) => this.getApp(appId),
    });
    this.insights = new PowerBIInsightsApi({
      request,
      getWorkspaces: () => this.getWorkspaces(),
      getReports: (workspaceId) => this.getReports(workspaceId),
      getDashboards: (workspaceId) => this.getDashboards(workspaceId),
    });
    this.admin = new PowerBIAdminApi({
      auth: deps.auth,
      getApps: () => this.getApps(),
    });
    this.exporter = new PowerBIExportApi(deps.auth);
  }

  clearCaches(): void {
    this.insights.clearCache();
    this.admin.clearCache();
    this.freshness.clearCaches();
  }

  private async makeRequest<T>(endpoint: string): Promise<T> {
    return this.makeRequestWithUrl<T>(`${POWERBI_API_BASE}${endpoint}`);
  }

  private async makeRequestWithUrl<T>(fullUrl: string): Promise<T> {
    return withRetry(async () => {
      const tokenResponse = await this.deps.auth.getAccessToken();

      if (!tokenResponse.success) {
        throw new Error(tokenResponse.error.message || 'Failed to get access token');
      }

      const response = await fetchWithTimeout(fullUrl, {
        headers: {
          Authorization: `Bearer ${tokenResponse.data.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        await throwForStatus(response, 'Power BI API error');
      }

      return response.json() as Promise<T>;
    });
  }


  getWorkspaces(): Promise<IPCResponse<Workspace[]>> {
    return this.catalog.getWorkspaces();
  }

  getReports(workspaceId: string): Promise<IPCResponse<Report[]>> {
    return this.catalog.getReports(workspaceId);
  }

  getDashboards(workspaceId: string): Promise<IPCResponse<Dashboard[]>> {
    return this.catalog.getDashboards(workspaceId);
  }

  getDashboard(workspaceId: string, dashboardId: string): Promise<IPCResponse<Dashboard>> {
    return this.catalog.getDashboard(workspaceId, dashboardId);
  }

  getApps(): Promise<IPCResponse<App[]>> {
    return this.catalog.getApps();
  }

  getApp(appId: string): Promise<IPCResponse<App>> {
    return this.catalog.getApp(appId);
  }

  getAppReports(appId: string): Promise<IPCResponse<Report[]>> {
    return this.catalog.getAppReports(appId);
  }

  getAppDashboards(appId: string): Promise<IPCResponse<Dashboard[]>> {
    return this.catalog.getAppDashboards(appId);
  }

  getAllItems(): Promise<IPCResponse<{
    workspaces: Workspace[];
    reports: Report[];
    dashboards: Dashboard[];
    partialFailure: boolean;
    failedWorkspaces: Array<{ id: string; name: string; error: string }>;
  }>> {
    return this.catalog.getAllItems();
  }


  resolveAppReportDataset(
    appId: string,
    reportId: string,
  ): Promise<IPCResponse<DatasetWorkspaceRef | null>> {
    return this.freshness.resolveAppReportDataset(appId, reportId);
  }

  getDatasetRefreshInfo(datasetId: string, workspaceId?: string): Promise<IPCResponse<DatasetRefreshInfo>> {
    return this.freshness.getDatasetRefreshInfo(datasetId, workspaceId);
  }

  getDashboardDataFreshness(
    dashboardId: string,
    workspaceId: string
  ): Promise<IPCResponse<DatasetRefreshInfo>> {
    return this.freshness.getDashboardDataFreshness(dashboardId, workspaceId);
  }

  getDataFreshness(
    workspaceId: string,
    datasetIds: Array<string | DatasetWorkspaceRef>,
    dashboardId?: string,
  ): Promise<IPCResponse<DataFreshness>> {
    return this.freshness.getDataFreshness(workspaceId, datasetIds, dashboardId);
  }


  getInsightsSnapshot(force = false): Promise<IPCResponse<InsightsSnapshot>> {
    return this.insights.getInsightsSnapshot(force);
  }

  getAdminInsights(days = 2, force = false): Promise<IPCResponse<AdminInsights>> {
    return this.admin.getAdminInsights(days, force);
  }


  getEmbedToken(
    _reportId: string,
    _workspaceId: string
  ): Promise<IPCResponse<EmbedToken>> {
    return this.exporter.getEmbedToken(_reportId, _workspaceId);
  }

  exportReportToPdf(
    reportId: string,
    workspaceId: string,
    pageName?: string,
    bookmarkState?: string
  ): Promise<IPCResponse<Buffer>> {
    return this.exporter.exportReportToPdf(reportId, workspaceId, pageName, bookmarkState);
  }
}


export type { PowerBIApiService };

export function createPowerBIApiService(deps: PowerBIApiDeps): PowerBIApiService {
  return new PowerBIApiService(deps);
}

export function buildProductionApiDeps(): PowerBIApiDeps {
  return {
    auth: {
      getAccessToken: () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { authService } = require('../auth/auth-service') as typeof import('../auth/auth-service');
        return authService.getAccessToken();
      },
      getAdminAccessToken: () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { authService } = require('../auth/auth-service') as typeof import('../auth/auth-service');
        return authService.getAdminAccessToken();
      },
    },
  };
}

import { getPowerBIApiService } from '../auth/singleton';

export const powerbiApiService: PowerBIApiService = new Proxy({} as PowerBIApiService, {
  get(_target, prop, receiver) {
    const svc = getPowerBIApiService();
    const value = Reflect.get(svc as object, prop, receiver);
    return typeof value === 'function' ? value.bind(svc) : value;
  },
});
