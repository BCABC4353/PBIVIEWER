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

const FETCH_TIMEOUT_MS = 20000;
async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface WithRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
}
async function withRetry<T>(fn: () => Promise<T>, opts: WithRetryOptions = {}): Promise<T> {
  const max = opts.maxAttempts ?? 3;
  const base = opts.baseDelayMs ?? 500;
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt++;
    try {
      return await fn();
    } catch (err: any) {
      const isRetriable = err && (err.name === 'RetriableHttpError' || err.name === 'AbortError');
      if (!isRetriable || attempt >= max) throw err;
      const retryAfter = (err.retryAfterMs as number | undefined);
      const delay = retryAfter !== undefined ? retryAfter : Math.min(base * Math.pow(2, attempt - 1), 8000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

class RetriableHttpError extends Error {
  constructor(public status: number, message: string, public retryAfterMs?: number) {
    super(message);
    this.name = 'RetriableHttpError';
  }
}

/**
 * Parse a Retry-After header value. Returns milliseconds, or undefined if unparseable.
 * Supports both numeric seconds and HTTP-date forms per RFC 7231.
 */
function parseRetryAfter(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined;
  const trimmed = headerValue.trim();
  if (!trimmed) return undefined;
  const asInt = Number(trimmed);
  if (Number.isFinite(asInt) && asInt >= 0) {
    return Math.round(asInt * 1000);
  }
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return undefined;
}

/**
 * Classify a non-OK response and throw an appropriate error. 429 and 5xx
 * variants are thrown as RetriableHttpError so withRetry can back off; other
 * 4xx responses throw a plain Error and short-circuit the retry loop.
 */
async function throwForStatus(response: Response, contextLabel: string): Promise<never> {
  const errorText = await response.text();
  const message = `${contextLabel}: ${response.status} - ${errorText}`;
  if (response.status === 429) {
    const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'));
    throw new RetriableHttpError(429, message, retryAfterMs);
  }
  if (response.status === 500 || response.status === 503 || response.status === 504) {
    throw new RetriableHttpError(response.status, message);
  }
  throw new Error(message);
}

class PowerBIApiService {
  private async makeRequest<T>(endpoint: string): Promise<T> {
    return withRetry(async () => {
      const tokenResponse = await authService.getAccessToken();

      if (!tokenResponse.success) {
        throw new Error(tokenResponse.error.message || 'Failed to get access token');
      }

      const response = await fetchWithTimeout(`${POWERBI_API_BASE}${endpoint}`, {
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

  /**
   * Makes a request to a full URL (used for pagination with @odata.nextLink)
   */
  private async makeRequestWithUrl<T>(fullUrl: string): Promise<T> {
    return withRetry(async () => {
      const tokenResponse = await authService.getAccessToken();

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

      if (!tokenResponse.success) {
        throw new Error(tokenResponse.error.message || 'Failed to get access token');
      }

      // Prefer MSAL's authoritative expiry; fall back to +1h only when null.
      const expiration =
        tokenResponse.data.expiresOn ?? new Date(Date.now() + 3600000).toISOString();

      // Return the access token as the embed token for user-owns-data scenario
      return {
        success: true,
        data: {
          token: tokenResponse.data.accessToken,
          tokenId: '', // Not used in user-owns-data
          expiration,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: { code: 'EMBED_TOKEN_FAILED', message: String(error) },
      };
    }
  }

  async exportReportToPdf(
    reportId: string,
    workspaceId: string,
    pageName?: string,
    bookmarkState?: string
  ): Promise<IPCResponse<Buffer>> {
    try {
      const tokenResponse = await authService.getAccessToken();

      if (!tokenResponse.success) {
        throw new Error(tokenResponse.error.message || 'Failed to get access token');
      }

      const accessToken = tokenResponse.data.accessToken;
      const baseUrl = `${POWERBI_API_BASE}/groups/${workspaceId}/reports/${reportId}`;

      const reportConfig: Record<string, unknown> = {
        settings: { includeHiddenPages: false },
      };

      if (bookmarkState) {
        reportConfig.defaultBookmark = { state: bookmarkState };
      }

      if (pageName) {
        const page: Record<string, unknown> = { pageName };
        if (bookmarkState) {
          page.bookmark = { state: bookmarkState };
        }
        reportConfig.pages = [page];
      }

      const exportResponse = await fetchWithTimeout(`${baseUrl}/ExportTo`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          format: 'PDF',
          powerBIReportConfiguration: reportConfig,
        }),
      });

      if (!exportResponse.ok) {
        const errorText = await exportResponse.text();
        throw new Error(`Export request failed: ${exportResponse.status} - ${errorText}`);
      }

      const exportJson = await exportResponse.json() as { id?: string };
      const exportId = exportJson.id;
      if (!exportId) {
        throw new Error('Export request did not return an export id');
      }

      let attempts = 0;
      const maxAttempts = 30;
      let status: string | undefined;

      while (attempts < maxAttempts) {
        // Shorter per-call timeout for the polling loop — the 30-iteration cap
        // bounds total wait time; we don't want each poll holding the default 20s.
        const statusResponse = await fetchWithTimeout(
          `${baseUrl}/exports/${exportId}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
          10000
        );

        if (!statusResponse.ok) {
          const errorText = await statusResponse.text();
          throw new Error(`Export status failed: ${statusResponse.status} - ${errorText}`);
        }

        const statusJson = await statusResponse.json() as { status?: string; error?: { message?: string } };
        status = statusJson.status;

        if (status === 'Succeeded') {
          break;
        }

        if (status === 'Failed') {
          throw new Error(statusJson.error?.message || 'Export failed');
        }

        attempts += 1;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      if (status !== 'Succeeded') {
        throw new Error('Export timed out');
      }

      const fileResponse = await fetchWithTimeout(`${baseUrl}/exports/${exportId}/file`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!fileResponse.ok) {
        const errorText = await fileResponse.text();
        throw new Error(`Export file failed: ${fileResponse.status} - ${errorText}`);
      }

      const arrayBuffer = await fileResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      return { success: true, data: buffer };
    } catch (error) {
      return {
        success: false,
        error: { code: 'EXPORT_REPORT_FAILED', message: String(error) },
      };
    }
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
    try {
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
          error: { code: 'BULK_FETCH_FAILED', message: 'All workspaces failed to load.' },
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

      const lastRefresh = response.value?.[0];
      if (lastRefresh) {
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
    } catch (error) {
      // Surface real failures honestly so callers can distinguish "no refresh
      // history yet" (success with empty data) from "the API call failed".
      // Viewers already render gracefully when lastRefreshTime is missing.
      console.warn('[PowerBI] Dataset refresh info unavailable:', error);
      return {
        success: false,
        error: { code: 'REFRESH_INFO_FAILED', message: String(error) },
      };
    }
  }
}

export const powerbiApiService = new PowerBIApiService();
