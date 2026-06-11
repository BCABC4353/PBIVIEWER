// ---------------------------------------------------------------------------
// Power BI API facade. The seven concerns that used to be inlined here live
// in focused modules under ./powerbi/ (http transport, error envelopes, pure
// refresh-health derivation, catalog listings, freshness stamps, insights
// snapshot, admin tier, export/embed). This file keeps the FROZEN public
// surface: the PowerBIApiService class (now a thin orchestrator that owns the
// auth/request plumbing and delegates to the modules), the DI factory, the
// production deps builder, and the lazy proxy singleton.
// ---------------------------------------------------------------------------

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

// Dependency-injection seam: the token source is an injectable port (not a
// direct import of the auth-service singleton, whose electron/MSAL module graph
// cannot load under jsdom), so tests can drive the client with a fake token
// provider and no electron at all.

/** Minimal slice of the auth service the API client needs. */
export interface ApiAuthPort {
  getAccessToken(): Promise<IPCResponse<TokenResult>>;
  /** Admin-tier token (Tenant.Read.All) via incremental consent. Optional so
   *  test fakes that never touch admin endpoints don't have to provide it. */
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

  /**
   * Drop all cached data tied to the signed-in account. MUST be called on
   * logout AND account-switch: these caches (instance-owned by the insights,
   * admin, and freshness modules — including the lineage cache that used to
   * be module-level here) are account-scoped data living on a process-wide
   * singleton, so without this a second account on a shared machine could be
   * served the first account's cached snapshot/lineage within the TTL window.
   */
  clearCaches(): void {
    this.insights.clearCache();
    this.admin.clearCache();
    this.freshness.clearCaches();
  }

  private async makeRequest<T>(endpoint: string): Promise<T> {
    // Same token + retry plumbing as makeRequestWithUrl, in the
    // endpoint-relative form every non-pagination caller uses.
    return this.makeRequestWithUrl<T>(`${POWERBI_API_BASE}${endpoint}`);
  }

  /**
   * Makes a request to a full URL (used for pagination with @odata.nextLink)
   */
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

  // --- Catalog tier (powerbi/catalog.ts) ------------------------------------

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

  // --- Freshness tier (powerbi/freshness.ts) --------------------------------

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

  // --- Insights + admin tiers (powerbi/insights.ts, powerbi/admin.ts) -------

  getInsightsSnapshot(force = false): Promise<IPCResponse<InsightsSnapshot>> {
    return this.insights.getInsightsSnapshot(force);
  }

  getAdminInsights(days = 2, force = false): Promise<IPCResponse<AdminInsights>> {
    return this.admin.getAdminInsights(days, force);
  }

  // --- Export tier (powerbi/export.ts) ---------------------------------------

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

// ---------------------------------------------------------------------------
// Factory + production wiring
// ---------------------------------------------------------------------------

export type { PowerBIApiService };

/**
 * Construct a PowerBIApiService from explicit dependencies. Tests inject a fake
 * ApiAuthPort; production injects the real auth service (built lazily).
 */
export function createPowerBIApiService(deps: PowerBIApiDeps): PowerBIApiService {
  return new PowerBIApiService(deps);
}

/** Build the production dependency set (real auth service backed). */
export function buildProductionApiDeps(): PowerBIApiDeps {
  return {
    // Lazy require so importing this module does not eagerly pull in the
    // electron/MSAL-backed auth singleton (keeps the module loadable in tests).
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

// Lazy production singleton (see auth/singleton.ts). Exported as a proxy so the
// existing `import { powerbiApiService }` call sites (ipc/content.ts) keep
// working while construction stays deferred until first use.
import { getPowerBIApiService } from '../auth/singleton';

export const powerbiApiService: PowerBIApiService = new Proxy({} as PowerBIApiService, {
  get(_target, prop, receiver) {
    const svc = getPowerBIApiService();
    const value = Reflect.get(svc as object, prop, receiver);
    return typeof value === 'function' ? value.bind(svc) : value;
  },
});
