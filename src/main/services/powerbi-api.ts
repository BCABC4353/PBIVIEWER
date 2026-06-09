import { POWERBI_API_BASE } from '../../shared/constants';
import { friendlyApiErrorFromMessage } from '../../shared/error-mapping';
import type {
  Workspace,
  Report,
  Dashboard,
  App,
  EmbedToken,
  DatasetRefreshInfo,
  DataFreshness,
  IPCResponse,
  TokenResult,
} from '../../shared/types';

// ---------------------------------------------------------------------------
// ARCH-B4: dependency-injection seam
// ---------------------------------------------------------------------------
// The API client used to import the auth-service singleton directly. That hard
// dependency on the electron/MSAL module graph made the client impossible to
// unit-test under jsdom. It now takes its token source as an injectable port,
// so tests can drive it with a fake token provider and no electron at all.

/** Minimal slice of the auth service the API client needs. */
export interface ApiAuthPort {
  getAccessToken(): Promise<IPCResponse<TokenResult>>;
}

export interface PowerBIApiDeps {
  auth: ApiAuthPort;
}

/**
 * Build an IPCResponse error envelope with a friendly `userMessage` derived
 * from the raw error string. The renderer-facing IPCResponse shape lives in
 * shared/types.ts; we attach `userMessage` via a type assertion so this main-
 * side change doesn't touch the shared contract. The renderer can read it as
 * an optional field — a stricter contract is planned for a later sprint.
 */
function buildErrorEnvelope(code: string, error: unknown): { code: string; message: string } {
  const message = String(error);
  return {
    code,
    message,
    userMessage: friendlyApiErrorFromMessage(message),
  } as { code: string; message: string; userMessage: string };
}

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
  for (;;) {
    attempt++;
    try {
      return await fn();
    } catch (err: unknown) {
      // AbortError happens BOTH when our own fetchWithTimeout fires (a true
      // timeout — worth retrying) AND when an external AbortSignal is passed
      // in (an intentional cancel — must NOT be retried). When `init.signal`
      // is supported in the future, this check needs to distinguish them.
      // For now no caller passes an external signal, so AbortError === timeout.
      const errObj = err as { name?: string; retryAfterMs?: number } | null;
      const isRetriable = errObj && (errObj.name === 'RetriableHttpError' || errObj.name === 'AbortError');
      if (!isRetriable || attempt >= max) throw err;
      const retryAfter = (errObj?.retryAfterMs as number | undefined);
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
// Cap on any Retry-After we'll honor. A misbehaving (or hostile) upstream
// could send `Retry-After: 99999999` (~27 hours) and freeze the request for
// effectively forever. 60s is well above normal Power BI throttling but small
// enough to bound user-visible delay.
const MAX_RETRY_AFTER_MS = 60_000;

function parseRetryAfter(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined;
  const trimmed = headerValue.trim();
  if (!trimmed) return undefined;
  const asInt = Number(trimmed);
  if (Number.isFinite(asInt) && asInt >= 0) {
    return Math.min(Math.round(asInt * 1000), MAX_RETRY_AFTER_MS);
  }
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    return Math.min(Math.max(0, dateMs - Date.now()), MAX_RETRY_AFTER_MS);
  }
  return undefined;
}

// Patterns we strip out of upstream HTTP error bodies before composing the
// thrown message — these end up in logs and (sometimes) user-visible toasts,
// and we never want a Bearer fragment, a JWT, an email, or a tenant GUID to
// land in either place. Order-insensitive; redaction is applied before the
// 256-char truncation cap.
const REDACT_PATTERNS: Array<[RegExp, string]> = [
  [/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]'],
  [/eyJ[A-Za-z0-9._-]{20,}/g, '[JWT REDACTED]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL REDACTED]'],
  [/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, '[GUID REDACTED]'],
];

function sanitizeErrorBody(body: string): string {
  let cleaned = body;
  for (const [pattern, replacement] of REDACT_PATTERNS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  // Truncate so a giant upstream body can't bloat the log line.
  return cleaned.length > 256 ? cleaned.slice(0, 256) + '…' : cleaned;
}

/**
 * Classify a non-OK response and throw an appropriate error. 429 and 5xx
 * variants are thrown as RetriableHttpError so withRetry can back off; other
 * 4xx responses throw a plain Error and short-circuit the retry loop.
 */
async function throwForStatus(response: Response, contextLabel: string): Promise<never> {
  const errorText = await response.text();
  const message = `${contextLabel}: ${response.status} - ${sanitizeErrorBody(errorText)}`;
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
  private readonly deps: PowerBIApiDeps;

  constructor(deps: PowerBIApiDeps) {
    this.deps = deps;
  }

  private async makeRequest<T>(endpoint: string): Promise<T> {
    return withRetry(async () => {
      const tokenResponse = await this.deps.auth.getAccessToken();

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
        error: buildErrorEnvelope('WORKSPACES_FETCH_FAILED', error),
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
        error: buildErrorEnvelope('REPORTS_FETCH_FAILED', error),
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
        error: buildErrorEnvelope('DASHBOARDS_FETCH_FAILED', error),
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
        error: buildErrorEnvelope('DASHBOARD_FETCH_FAILED', error),
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
        error: buildErrorEnvelope('APPS_FETCH_FAILED', error),
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
        error: buildErrorEnvelope('APP_FETCH_FAILED', error),
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

      interface RawAppReport {
        id: string;
        name: string;
        embedUrl: string;
        datasetId: string;
        reportType: string;
        appId: string;
      }

      // Use fetchAllPages so apps with >100 reports paginate via @odata.nextLink
      // instead of silently truncating to the first page.
      const reports = await this.fetchAllPages<RawAppReport, Report>(
        `/apps/${appId}/reports`,
        (report) => ({
          id: report.id,
          name: report.name,
          workspaceId: actualWorkspaceId, // Use actual workspace GUID for embedding
          embedUrl: report.embedUrl,
          datasetId: report.datasetId,
          reportType: report.reportType === 'PaginatedReport' ? 'PaginatedReport' : 'PowerBIReport',
        })
      );

      return { success: true, data: reports };
    } catch (error) {
      return {
        success: false,
        error: buildErrorEnvelope('APP_REPORTS_FETCH_FAILED', error),
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
    } catch (error) {
      return {
        success: false,
        error: buildErrorEnvelope('APP_DASHBOARDS_FETCH_FAILED', error),
      };
    }
  }

  async getEmbedToken(
    _reportId: string,
    _workspaceId: string
  ): Promise<IPCResponse<EmbedToken>> {
    try {
      // For user-owns-data scenario, we use the access token directly
      // For app-owns-data, we would generate an embed token
      const tokenResponse = await this.deps.auth.getAccessToken();

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
        error: buildErrorEnvelope('EMBED_TOKEN_FAILED', error),
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
      const tokenResponse = await this.deps.auth.getAccessToken();

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

      // Wrap the kickoff ExportTo POST in withRetry so a transient 429/5xx on
      // start-up backs off and retries (throwForStatus throws RetriableHttpError
      // for those; other 4xx short-circuit). The poll loop below already handles
      // transient errors — this brings the initial POST to parity.
      const exportResponse = await withRetry(async () => {
        const resp = await fetchWithTimeout(`${baseUrl}/ExportTo`, {
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
        if (!resp.ok) {
          await throwForStatus(resp, 'Export request');
        }
        return resp;
      });

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
        // A transient timeout, 429, or 5xx on a poll is non-fatal: count the
        // attempt and continue (honoring Retry-After if present). Only a non-
        // retriable 4xx, a "Failed" status payload, or running out the cap
        // aborts the export.
        let statusResponse: Response;
        try {
          statusResponse = await fetchWithTimeout(
            `${baseUrl}/exports/${exportId}`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
            10000
          );
        } catch (pollErr: unknown) {
          if ((pollErr as { name?: string } | null)?.name === 'AbortError') {
            // Per-poll timeout — keep trying.
            attempts += 1;
            await new Promise((resolve) => setTimeout(resolve, 2000));
            continue;
          }
          throw pollErr;
        }

        if (!statusResponse.ok) {
          if (statusResponse.status === 429) {
            const retryAfterMs =
              parseRetryAfter(statusResponse.headers.get('Retry-After')) ?? 2000;
            attempts += 1;
            await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
            continue;
          }
          if (statusResponse.status >= 500 && statusResponse.status < 600) {
            attempts += 1;
            await new Promise((resolve) => setTimeout(resolve, 2000));
            continue;
          }
          const errorText = await statusResponse.text();
          throw new Error(
            `Export status failed: ${statusResponse.status} - ${sanitizeErrorBody(errorText)}`
          );
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
        throw new Error(`Export file failed: ${fileResponse.status} - ${sanitizeErrorBody(errorText)}`);
      }

      const arrayBuffer = await fileResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      return { success: true, data: buffer };
    } catch (error) {
      return {
        success: false,
        error: buildErrorEnvelope('EXPORT_REPORT_FAILED', error),
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
    } catch (error) {
      return {
        success: false,
        error: buildErrorEnvelope('ALL_ITEMS_FETCH_FAILED', error),
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
        error: buildErrorEnvelope('REFRESH_INFO_FAILED', error),
      };
    }
  }

  /**
   * PROD-S9: derive a data-freshness signal for a whole DASHBOARD.
   *
   * A dashboard has no single backing dataset — it aggregates TILES, each of
   * which may (or may not) reference a datasetId. We enumerate the tiles via
   * "Get Tiles in Group", collect the DISTINCT datasetIds, query refresh info
   * for each (reusing getDatasetRefreshInfo), and surface the OLDEST (stalest)
   * lastRefreshTime as the dashboard's "Data refreshed" timestamp. The stalest
   * time is the meaningful signal — "is any data on this dashboard old?".
   *
   * Graceful degradation (matches the viewer's "no indicator when absent"
   * behavior): if there are no tiles, no tile exposes a datasetId, or none of
   * the referenced datasets have refresh history, we return success with empty
   * data ({}). An individual dataset query failing is skipped (does not fail the
   * whole call) so one inaccessible dataset doesn't blank the indicator.
   *
   * Scope requirement: the "Get Tiles in Group" endpoint needs Dashboard.Read.All
   * on the calling token. This app uses a user-context (delegated AAD) token that
   * requests that scope in msal-config, so the indicator works here. An app-owns-
   * data / service-principal token without that scope would 403/404 on tiles —
   * that surfaces as success:false and the viewer simply hides the indicator
   * (no crash, no misleading value).
   */
  async getDashboardDataFreshness(
    dashboardId: string,
    workspaceId: string
  ): Promise<IPCResponse<DatasetRefreshInfo>> {
    try {
      interface RawTile {
        id: string;
        datasetId?: string;
      }

      const tilesResponse = await this.makeRequest<PowerBIApiResponse<RawTile>>(
        `/groups/${workspaceId}/dashboards/${dashboardId}/tiles`
      );

      // Distinct datasetIds across all tiles; skip tiles with no datasetId.
      const datasetIds = Array.from(
        new Set(
          (tilesResponse.value ?? [])
            .map((tile) => tile.datasetId)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
        )
      );

      // Empty tile list, or no tile referenced a dataset → no indicator.
      if (datasetIds.length === 0) {
        return { success: true, data: {} };
      }

      // Query refresh info for each distinct dataset in parallel. A failed
      // query (or one with no history) contributes nothing; it does not abort
      // the others.
      const refreshResults = await Promise.all(
        datasetIds.map((datasetId) => this.getDatasetRefreshInfo(datasetId, workspaceId))
      );

      let oldest: DatasetRefreshInfo | undefined;
      let oldestMs = Infinity;
      for (const result of refreshResults) {
        if (!result.success) continue;
        const time = result.data.lastRefreshTime;
        if (!time) continue;
        const ms = Date.parse(time);
        if (Number.isNaN(ms)) continue;
        if (ms < oldestMs) {
          oldestMs = ms;
          oldest = result.data;
        }
      }

      // None of the datasets had usable refresh history → no indicator.
      if (!oldest) {
        return { success: true, data: {} };
      }

      return { success: true, data: oldest };
    } catch (error) {
      console.warn('[PowerBI] Dashboard data freshness unavailable:', error);
      return {
        success: false,
        error: buildErrorEnvelope('DASHBOARD_FRESHNESS_FAILED', error),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Data-freshness: dataset refresh time + upstream dataflow last-success time.
  // Powers the viewers' "Data refreshed: ... / Dataflow: ..." stamps. A dataset
  // can report a successful refresh while serving stale data (the upstream query
  // broke), so the dataflow's last SUCCESSFUL completion is an independent signal.
  // ---------------------------------------------------------------------------

  /** Distinct datasetIds referenced by a dashboard's tiles. */
  private async getDashboardTileDatasetIds(dashboardId: string, workspaceId: string): Promise<string[]> {
    interface RawTile {
      id: string;
      datasetId?: string;
    }
    const tilesResponse = await this.makeRequest<PowerBIApiResponse<RawTile>>(
      `/groups/${workspaceId}/dashboards/${dashboardId}/tiles`,
    );
    return Array.from(
      new Set(
        (tilesResponse.value ?? [])
          .map((tile) => tile.datasetId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    );
  }

  /**
   * Resolve the upstream dataflow(s) feeding the given datasets in a workspace.
   * Primary: GET /groups/{ws}/datasets/upstreamDataflows (Dataset.Read.All) →
   * filter to our datasetIds. Fallback (no recognized link): if the workspace has
   * exactly one dataflow, assume it. The dataflow can live in a different
   * workspace than the dataset (workspaceObjectId on the link).
   */
  private async resolveUpstreamDataflows(
    workspaceId: string,
    datasetIds: string[],
  ): Promise<Array<{ dataflowId: string; workspaceId: string }>> {
    const wanted = new Set(datasetIds.map((id) => id.toLowerCase()));
    try {
      const resp = await this.makeRequest<PowerBIApiResponse<{
        datasetObjectId: string;
        dataflowObjectId: string;
        workspaceObjectId: string;
      }>>(`/groups/${workspaceId}/datasets/upstreamDataflows`);
      const seen = new Set<string>();
      const out: Array<{ dataflowId: string; workspaceId: string }> = [];
      for (const link of resp.value ?? []) {
        if (
          link.datasetObjectId &&
          wanted.has(link.datasetObjectId.toLowerCase()) &&
          link.dataflowObjectId &&
          !seen.has(link.dataflowObjectId)
        ) {
          seen.add(link.dataflowObjectId);
          out.push({ dataflowId: link.dataflowObjectId, workspaceId: link.workspaceObjectId || workspaceId });
        }
      }
      if (out.length > 0) return out;
    } catch (error) {
      console.warn('[PowerBI] upstreamDataflows lookup failed:', error);
    }
    // Fallback: exactly one dataflow in the workspace → assume it is upstream.
    try {
      const dfResp = await this.makeRequest<PowerBIApiResponse<{ objectId: string }>>(
        `/groups/${workspaceId}/dataflows`,
      );
      const dfs = (dfResp.value ?? []).filter((d) => d.objectId);
      const onlyDf = dfs.length === 1 ? dfs[0] : undefined;
      if (onlyDf) return [{ dataflowId: onlyDf.objectId, workspaceId }];
    } catch (error) {
      console.warn('[PowerBI] dataflows list (fallback) failed:', error);
    }
    return [];
  }

  /** Most recent SUCCESSFUL refresh completion (endTime) for one dataflow, or null. */
  private async getDataflowLastSuccess(workspaceId: string, dataflowId: string): Promise<string | null> {
    try {
      const resp = await this.makeRequest<PowerBIApiResponse<{
        status?: string;
        startTime?: string;
        endTime?: string;
      }>>(`/groups/${workspaceId}/dataflows/${dataflowId}/transactions`);
      let latest: string | null = null;
      for (const t of resp.value ?? []) {
        // A transaction can be InProgress/Failed/Cancelled or omit fields; only a
        // Success with an endTime tells us when data was actually published.
        if (t.status === 'Success' && t.endTime) {
          if (!latest || Date.parse(t.endTime) > Date.parse(latest)) latest = t.endTime;
        }
      }
      return latest;
    } catch (error) {
      console.warn('[PowerBI] dataflow transactions failed:', error);
      return null;
    }
  }

  /**
   * Aggregate data-freshness for a piece of content: the STALEST dataset
   * last-refresh time and the STALEST upstream-dataflow last-success time across
   * the content's datasets. Pass datasetIds for a report/app, or dashboardId to
   * derive them from the dashboard's tiles.
   */
  async getDataFreshness(
    workspaceId: string,
    datasetIds: string[],
    dashboardId?: string,
  ): Promise<IPCResponse<DataFreshness>> {
    try {
      let ids = datasetIds;
      if (dashboardId) {
        ids = await this.getDashboardTileDatasetIds(dashboardId, workspaceId);
      }
      ids = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.length > 0)));

      // Dataset: stalest last-refresh across the datasets.
      let datasetRefreshTime: string | null = null;
      const datasetResults = await Promise.all(
        ids.map((id) => this.getDatasetRefreshInfo(id, workspaceId)),
      );
      for (const r of datasetResults) {
        if (r.success && r.data.lastRefreshTime) {
          if (!datasetRefreshTime || Date.parse(r.data.lastRefreshTime) < Date.parse(datasetRefreshTime)) {
            datasetRefreshTime = r.data.lastRefreshTime;
          }
        }
      }

      // Dataflow: stalest last-SUCCESS across all upstream dataflows.
      let dataflowRefreshTime: string | null = null;
      if (ids.length > 0) {
        const dataflows = await this.resolveUpstreamDataflows(workspaceId, ids);
        const dfTimes = await Promise.all(
          dataflows.map((df) => this.getDataflowLastSuccess(df.workspaceId, df.dataflowId)),
        );
        for (const t of dfTimes) {
          if (t && (!dataflowRefreshTime || Date.parse(t) < Date.parse(dataflowRefreshTime))) {
            dataflowRefreshTime = t;
          }
        }
      }

      return {
        success: true,
        data: { datasetRefreshTime, dataflowRefreshTime, datasetCount: ids.length },
      };
    } catch (error) {
      console.warn('[PowerBI] Data freshness unavailable:', error);
      return { success: false, error: buildErrorEnvelope('DATA_FRESHNESS_FAILED', error) };
    }
  }
}

// ---------------------------------------------------------------------------
// ARCH-B4: factory + production wiring
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
