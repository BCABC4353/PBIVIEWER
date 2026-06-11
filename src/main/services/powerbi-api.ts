import { POWERBI_API_BASE } from '../../shared/constants';
import { friendlyApiErrorFromMessage } from '../../shared/error-mapping';
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
  InsightsRefreshable,
  InsightsWorkspaceAccess,
  AdminInsights,
  AdminAppAudience,
} from '../../shared/types';

// Dataset -> dataflow lineage is static, so cache resolved links: the 5-min
// freshness poll then re-fetches refresh TIMES only, not lineage every cycle.
const lineageCache = new Map<
  string,
  { value: Array<{ dataflowId: string; workspaceId: string }>; expires: number }
>();
const LINEAGE_TTL_MS = 30 * 60 * 1000;

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

/**
 * Build an IPCResponse error envelope with a friendly `userMessage` derived
 * from the raw error string. The renderer-facing IPCResponse shape lives in
 * shared/types.ts; `userMessage` is attached via a type assertion and the
 * renderer reads it as an optional field.
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
 * Non-retriable HTTP failure (plain 4xx). Carries the status code so callers
 * can branch on it — e.g. getDatasetRefreshInfo falls back to the groupless
 * refreshes endpoint when the grouped call comes back 401/403/404.
 */
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Run an async mapper over items with at most `limit` in flight at once.
 * Preserves input order in the result. Used to speed up the Insights fan-out
 * (per-dataset refresh-health lookups) without bursting past API throttling.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i] as T, i);
    }
  });
  await Promise.all(workers);
  return results;
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
  throw new HttpError(response.status, message);
}

class PowerBIApiService {
  private readonly deps: PowerBIApiDeps;

  // Insights snapshot cache. Building a snapshot fans out to every workspace,
  // dataset, and dataflow the user can see; serving repeat page visits from a
  // short-lived cache keeps us far away from the API throttling limits.
  private insightsCache: { value: InsightsSnapshot; expires: number } | null = null;
  private static readonly INSIGHTS_TTL_MS = 5 * 60 * 1000;

  constructor(deps: PowerBIApiDeps) {
    this.deps = deps;
  }

  /**
   * Drop all cached data tied to the signed-in account. MUST be called on
   * logout AND account-switch: these caches (and the module-level lineage
   * cache) are account-scoped data living on a process-wide singleton, so
   * without this a second account on a shared machine could be served the
   * first account's cached snapshot/lineage within the TTL window.
   */
  clearCaches(): void {
    this.insightsCache = null;
    this.adminInsightsCache = null;
    lineageCache.clear();
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
      }));

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

  /**
   * Insights one-pager: refresh health of every dataset + dataflow the
   * signed-in user can see, plus per-workspace access lists and catalog
   * counts. Access scoping is inherent — the API only returns what this
   * user's token can reach, so a client sees exactly their slice.
   *
   * Built entirely from the scopes the app already requests (Workspace/
   * Dataset/Dataflow/Report/Dashboard Read.All) — no new consent required.
   * Results are cached for 5 minutes; pass force=true to rebuild.
   */
  async getInsightsSnapshot(force = false): Promise<IPCResponse<InsightsSnapshot>> {
    try {
      if (!force && this.insightsCache && this.insightsCache.expires > Date.now()) {
        return { success: true, data: { ...this.insightsCache.value, fromCache: true } };
      }

      const workspacesResponse = await this.getWorkspaces();
      if (!workspacesResponse.success) {
        return { success: false, error: workspacesResponse.error };
      }
      const workspaces = workspacesResponse.data;

      const refreshables: InsightsRefreshable[] = [];
      const access: InsightsWorkspaceAccess[] = [];
      const failedWorkspaces: Array<{ id: string; name: string; error: string }> = [];
      const snapshotReports: InsightsSnapshot['reports'] = [];
      let reportCount = 0;
      let dashboardCount = 0;

      // Bound concurrency on two axes: process workspaces in batches of 3, and
      // within each workspace resolve per-dataset/dataflow refresh health at most
      // DATASET_CONCURRENCY at a time. Worst-case in-flight requests stay ~12,
      // far under the per-user throttling ceiling, while a workspace with many
      // datasets no longer resolves them one-at-a-time (the slow path).
      const BATCH_SIZE = 3;
      const DATASET_CONCURRENCY = 4;
      for (let i = 0; i < workspaces.length; i += BATCH_SIZE) {
        const batch = workspaces.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async (ws) => {
            const [datasets, dataflows, users, reports, dashboards, upstreamByDataset] =
              await Promise.all([
                this.getWorkspaceDatasets(ws.id),
                this.getWorkspaceDataflows(ws.id),
                this.getWorkspaceUsers(ws.id),
                this.getReports(ws.id),
                this.getDashboards(ws.id),
                this.getWorkspaceUpstreamDataflowLinks(ws.id),
              ]);

            if (reports.success) {
              reportCount += reports.data.length;
              // Blast radius: keep the dataset→report edge from the listing we
              // already fetched for the count — no extra request.
              for (const r of reports.data) {
                snapshotReports.push({
                  id: r.id,
                  name: r.name,
                  workspaceId: ws.id,
                  ...(r.datasetId ? { datasetId: r.datasetId } : {}),
                });
              }
            }
            if (dashboards.success) dashboardCount += dashboards.data.length;
            access.push({ workspaceId: ws.id, workspaceName: ws.name, users });

            if (datasets === null && dataflows === null) {
              failedWorkspaces.push({
                id: ws.id,
                name: ws.name,
                error: 'Could not list datasets or dataflows',
              });
              return;
            }

            const datasetRows = await mapWithConcurrency(
              datasets ?? [],
              DATASET_CONCURRENCY,
              async (ds): Promise<InsightsRefreshable> => {
                // Lineage edge for the blast-radius cascade. null map = the
                // workspace lineage call failed → OMIT the field (unknown),
                // never fail the snapshot.
                const lineage = upstreamByDataset
                  ? { upstreamDataflowIds: upstreamByDataset.get(ds.id.toLowerCase()) ?? [] }
                  : {};
                if (ds.isRefreshable === false) {
                  return {
                    kind: 'dataset',
                    id: ds.id,
                    name: ds.name,
                    workspaceId: ws.id,
                    workspaceName: ws.name,
                    configuredBy: ds.configuredBy,
                    lastStatus: 'Disabled',
                    ...lineage,
                  };
                }
                const health = await this.getDatasetRefreshHealth(ws.id, ds.id);
                const schedule = await this.getDatasetScheduleInfo(ws.id, ds.id, health.lastSuccessTime);
                return {
                  kind: 'dataset',
                  id: ds.id,
                  name: ds.name,
                  workspaceId: ws.id,
                  workspaceName: ws.name,
                  configuredBy: ds.configuredBy,
                  ...health,
                  ...schedule,
                  ...lineage,
                };
              },
            );
            refreshables.push(...datasetRows);

            const dataflowRows = await mapWithConcurrency(
              dataflows ?? [],
              DATASET_CONCURRENCY,
              async (df): Promise<InsightsRefreshable> => {
                const health = await this.getDataflowRefreshHealth(ws.id, df.objectId);
                return {
                  kind: 'dataflow',
                  id: df.objectId,
                  name: df.name,
                  workspaceId: ws.id,
                  workspaceName: ws.name,
                  ...health,
                };
              },
            );
            refreshables.push(...dataflowRows);
          }),
        );
      }

      // If EVERY workspace failed to read, this is a hard failure (auth/network),
      // not an empty catalog — surface it so the page shows a retry instead of a
      // misleading "0 datasets" board (mirrors getAllItems).
      if (workspaces.length > 0 && failedWorkspaces.length === workspaces.length) {
        return {
          success: false,
          error: buildErrorEnvelope('INSIGHTS_FETCH_FAILED', 'Every workspace failed to load.'),
        };
      }

      const snapshot: InsightsSnapshot = {
        generatedAt: new Date().toISOString(),
        fromCache: false,
        workspaceCount: workspaces.length,
        reportCount,
        dashboardCount,
        refreshables,
        reports: snapshotReports,
        access,
        partialFailure: failedWorkspaces.length > 0,
        failedWorkspaces,
      };
      this.insightsCache = {
        value: snapshot,
        expires: Date.now() + PowerBIApiService.INSIGHTS_TTL_MS,
      };
      return { success: true, data: snapshot };
    } catch (error) {
      return {
        success: false,
        error: buildErrorEnvelope('INSIGHTS_FETCH_FAILED', error),
      };
    }
  }

  /** Datasets in a workspace, or null when the list call fails. */
  private async getWorkspaceDatasets(
    workspaceId: string,
  ): Promise<Array<{ id: string; name: string; configuredBy?: string; isRefreshable?: boolean }> | null> {
    try {
      const resp = await this.makeRequest<PowerBIApiResponse<{
        id: string;
        name: string;
        configuredBy?: string;
        isRefreshable?: boolean;
      }>>(`/groups/${workspaceId}/datasets`);
      return resp.value ?? [];
    } catch (error) {
      console.warn('[PowerBI] datasets list failed for insights:', error);
      return null;
    }
  }

  /** Dataflows in a workspace, or null when the list call fails. */
  private async getWorkspaceDataflows(
    workspaceId: string,
  ): Promise<Array<{ objectId: string; name: string }> | null> {
    try {
      const resp = await this.makeRequest<PowerBIApiResponse<{
        objectId: string;
        name: string;
      }>>(`/groups/${workspaceId}/dataflows`);
      return (resp.value ?? []).filter((d) => d.objectId);
    } catch (error) {
      console.warn('[PowerBI] dataflows list failed for insights:', error);
      return null;
    }
  }

  /**
   * Full upstream-dataflow lineage for a workspace, keyed by LOWERCASED
   * dataset id → dataflow ids feeding it. ONE call per workspace
   * (GET /groups/{ws}/datasets/upstreamDataflows — the same endpoint
   * resolveUpstreamDataflowsUncached uses for freshness, but unfiltered: the
   * snapshot needs every dataset's edges, not a specific id set). Returns
   * null when the call fails so callers can OMIT the field (unknown lineage)
   * instead of failing the snapshot.
   */
  private async getWorkspaceUpstreamDataflowLinks(
    workspaceId: string,
  ): Promise<Map<string, string[]> | null> {
    try {
      const resp = await this.makeRequest<PowerBIApiResponse<{
        datasetObjectId: string;
        dataflowObjectId: string;
        workspaceObjectId: string;
      }>>(`/groups/${workspaceId}/datasets/upstreamDataflows`);
      const byDataset = new Map<string, string[]>();
      for (const link of resp.value ?? []) {
        if (!link.datasetObjectId || !link.dataflowObjectId) continue;
        const key = link.datasetObjectId.toLowerCase();
        const flows = byDataset.get(key) ?? [];
        if (!flows.includes(link.dataflowObjectId)) flows.push(link.dataflowObjectId);
        byDataset.set(key, flows);
      }
      return byDataset;
    } catch (error) {
      console.warn('[PowerBI] upstreamDataflows lineage failed for insights:', error);
      return null;
    }
  }

  /**
   * Users with access to a workspace, or null when the caller is not allowed
   * to list them (e.g. viewer-only role). Null means "not visible to you",
   * which the UI must distinguish from an empty workspace.
   */
  private async getWorkspaceUsers(
    workspaceId: string,
  ): Promise<InsightsWorkspaceAccess['users']> {
    try {
      const resp = await this.makeRequest<PowerBIApiResponse<{
        displayName?: string;
        emailAddress?: string;
        identifier?: string;
        groupUserAccessRight?: string;
        principalType?: string;
      }>>(`/groups/${workspaceId}/users`);
      return (resp.value ?? []).map((u) => ({
        name: u.displayName || u.emailAddress || u.identifier || 'Unknown',
        email: u.emailAddress,
        role: u.groupUserAccessRight || 'Unknown',
        type: u.principalType || 'User',
      }));
    } catch {
      return null;
    }
  }

  /**
   * Parse a dataset refresh entry's serviceExceptionJson into the error code
   * plus the richest human detail the payload carries: errorDescription when
   * present, and any pbi.error detail values. Returns {} for missing or
   * malformed payloads. (Dataflow transactions carry no such field.)
   */
  private static parseServiceException(json?: string): { errorCode?: string; errorDetail?: string } {
    if (!json) return {};
    try {
      const parsed = JSON.parse(json) as {
        errorCode?: string;
        errorDescription?: string;
        'pbi.error'?: {
          code?: string;
          details?: Array<{ code?: string; detail?: { value?: string } | string }>;
        };
      };
      const pbiError = parsed['pbi.error'];
      const detailParts: string[] = [];
      if (parsed.errorDescription) detailParts.push(parsed.errorDescription);
      for (const d of pbiError?.details ?? []) {
        const value = typeof d.detail === 'string' ? d.detail : d.detail?.value;
        if (value) detailParts.push(d.code ? `${d.code}: ${value}` : value);
      }
      return {
        errorCode: parsed.errorCode || pbiError?.code,
        errorDetail: detailParts.length > 0 ? detailParts.join(' · ') : undefined,
      };
    } catch {
      return {}; // malformed exception payload — omit error info
    }
  }

  /**
   * Map a refresh/transaction history (newest first, as the API returns it)
   * to the `recentRuns` strip: OLDEST → NEWEST, terminal attempts only
   * (in-flight entries with no terminal status are skipped). `successLike`
   * decides which statuses count as ok for the given endpoint. Failed dataset
   * runs carry errorCode/errorDetail parsed from serviceExceptionJson so the
   * UI can explain each red dot; dataflows have no such payload.
   */
  private static deriveRecentRuns(
    entries: Array<{ status?: string; endTime?: string; serviceExceptionJson?: string }>,
    successLike: (s?: string) => boolean,
    inFlight: (e: { status?: string; endTime?: string }) => boolean,
  ): InsightsRefreshable['recentRuns'] {
    return entries
      .filter((e) => !inFlight(e))
      .map((e) => {
        const ok = successLike(e.status);
        const run: NonNullable<InsightsRefreshable['recentRuns']>[number] = { ok, endTime: e.endTime };
        if (!ok && e.serviceExceptionJson) {
          const { errorCode, errorDetail } = PowerBIApiService.parseServiceException(e.serviceExceptionJson);
          if (errorCode) run.errorCode = errorCode;
          if (errorDetail) run.errorDetail = errorDetail;
        }
        return run;
      })
      .reverse();
  }

  /** Derive refresh health from a dataset's recent refresh history. */
  private async getDatasetRefreshHealth(
    workspaceId: string,
    datasetId: string,
  ): Promise<
    Pick<
      InsightsRefreshable,
      'lastStatus' | 'lastAttemptTime' | 'lastSuccessTime' | 'errorCode' | 'lastRefreshType' | 'recentRuns'
    >
  > {
    try {
      const resp = await this.makeRequest<PowerBIApiResponse<{
        status?: string;
        startTime?: string;
        endTime?: string;
        refreshType?: string;
        serviceExceptionJson?: string;
      }>>(`/groups/${workspaceId}/datasets/${datasetId}/refreshes?$top=12`);
      const entries = resp.value ?? [];
      if (entries.length === 0) return { lastStatus: 'Never' };

      // Newest first. 'Unknown' with no endTime is an in-flight refresh;
      // 'Unknown' WITH an endTime is how the v1 endpoint reports a completed
      // on-demand refresh (same convention as getDatasetRefreshInfo).
      const newest = entries[0]!;
      const successLike = (s?: string) => s === 'Completed' || s === 'Unknown';
      const lastSuccess = entries.find((e) => successLike(e.status) && e.endTime);

      let lastStatus: InsightsRefreshable['lastStatus'];
      if (newest.status === 'Unknown' && !newest.endTime) lastStatus = 'InProgress';
      else if (successLike(newest.status)) lastStatus = 'Completed';
      else if (newest.status === 'Cancelled') lastStatus = 'Cancelled';
      else if (newest.status === 'Disabled') lastStatus = 'Disabled';
      else lastStatus = 'Failed';

      let errorCode: string | undefined;
      if (lastStatus === 'Failed' && newest.serviceExceptionJson) {
        errorCode = PowerBIApiService.parseServiceException(newest.serviceExceptionJson).errorCode;
      }

      return {
        lastStatus,
        lastAttemptTime: newest.endTime || newest.startTime,
        lastSuccessTime: lastSuccess?.endTime,
        errorCode,
        lastRefreshType: newest.refreshType,
        recentRuns: PowerBIApiService.deriveRecentRuns(
          entries,
          successLike,
          (e) => e.status === 'Unknown' && !e.endTime,
        ),
      };
    } catch (error) {
      console.warn('[PowerBI] dataset refresh history failed for insights:', error);
      return { lastStatus: 'Never' };
    }
  }

  /**
   * Schedule-vs-reality: read the dataset's configured refresh schedule and
   * flag it overdue when enabled but the last success is older than twice the
   * schedule's expected cadence (minimum 24h so a multi-daily schedule with
   * one missed slot doesn't immediately alarm). Datasets without a schedule
   * (live connections, push datasets) simply return no fields.
   */
  private async getDatasetScheduleInfo(
    workspaceId: string,
    datasetId: string,
    lastSuccessTime?: string,
  ): Promise<Pick<InsightsRefreshable, 'scheduleSummary' | 'scheduleOverdue'>> {
    try {
      const sched = await this.makeRequest<{
        days?: string[];
        times?: string[];
        enabled?: boolean;
        localTimeZoneId?: string;
      }>(`/groups/${workspaceId}/datasets/${datasetId}/refreshSchedule`);
      if (!sched || sched.enabled !== true) return {};

      const days = sched.days ?? [];
      const times = sched.times ?? [];
      const daysLabel = days.length === 0 || days.length === 7 ? 'Daily' : days.join(', ');
      const timesLabel = times.length > 0 ? ` at ${times.join(', ')}` : '';
      const scheduleSummary = `${daysLabel}${timesLabel}`;

      let scheduleOverdue = false;
      if (lastSuccessTime) {
        const slotsPerWeek = Math.max(1, (days.length || 7) * (times.length || 1));
        const expectedGapMs = (7 * 24 * 60 * 60 * 1000) / slotsPerWeek;
        const overdueAfterMs = Math.max(24 * 60 * 60 * 1000, 2 * expectedGapMs);
        scheduleOverdue = Date.now() - Date.parse(lastSuccessTime) > overdueAfterMs;
      } else {
        // Enabled schedule but no success ever recorded — that IS overdue.
        scheduleOverdue = true;
      }
      return { scheduleSummary, scheduleOverdue };
    } catch {
      // No schedule endpoint for this dataset (live/push) or no permission.
      return {};
    }
  }

  /** Derive refresh health from a dataflow's recent transactions. */
  private async getDataflowRefreshHealth(
    workspaceId: string,
    dataflowId: string,
  ): Promise<Pick<InsightsRefreshable, 'lastStatus' | 'lastAttemptTime' | 'lastSuccessTime' | 'recentRuns'>> {
    try {
      const resp = await this.makeRequest<PowerBIApiResponse<{
        status?: string;
        startTime?: string;
        endTime?: string;
      }>>(`/groups/${workspaceId}/dataflows/${dataflowId}/transactions?$top=12`);
      const entries = resp.value ?? [];
      if (entries.length === 0) return { lastStatus: 'Never' };

      const newest = entries[0]!;
      const lastSuccess = entries.find((e) => e.status === 'Success' && e.endTime);

      let lastStatus: InsightsRefreshable['lastStatus'];
      if (newest.status === 'Success') lastStatus = 'Completed';
      else if (newest.status === 'InProgress' || (!newest.endTime && !newest.status)) lastStatus = 'InProgress';
      else if (newest.status === 'Cancelled') lastStatus = 'Cancelled';
      else lastStatus = 'Failed';

      return {
        lastStatus,
        lastAttemptTime: newest.endTime || newest.startTime,
        lastSuccessTime: lastSuccess?.endTime,
        recentRuns: PowerBIApiService.deriveRecentRuns(
          entries,
          (s) => s === 'Success',
          (e) => e.status === 'InProgress' || (!e.endTime && !e.status),
        ),
      };
    } catch (error) {
      console.warn('[PowerBI] dataflow transactions failed for insights:', error);
      return { lastStatus: 'Never' };
    }
  }

  // ---------------------------------------------------------------------------
  // Admin tier (Fabric admin + Tenant.Read.All via incremental consent)
  // ---------------------------------------------------------------------------

  private adminInsightsCache: { value: AdminInsights; expires: number } | null = null;
  private static readonly ADMIN_INSIGHTS_TTL_MS = 10 * 60 * 1000;

  /** Request against an admin endpoint using the admin-tier token. */
  private async makeAdminRequest<T>(endpoint: string): Promise<T> {
    const getAdminToken = this.deps.auth.getAdminAccessToken?.bind(this.deps.auth);
    if (!getAdminToken) {
      throw new Error('ADMIN_NOT_WIRED: admin token source not configured');
    }
    // maxAttempts 2 (not the default 3): the admin tier fires MANY requests
    // per unlock (per-app audiences + per-day activity pages). On a throttled
    // tenant, 3 attempts × up-to-60s Retry-After per call stacks into the
    // multi-minute "Checking with Microsoft…" hang the owner hit. One retry
    // still absorbs a transient 429/5xx without compounding the wait.
    return withRetry(async () => {
      const tokenResponse = await getAdminToken();
      if (!tokenResponse.success) {
        // Carry the auth error code through so callers can distinguish a
        // declined consent from a network failure.
        throw new Error(`ADMIN_TOKEN:${tokenResponse.error.code}: ${tokenResponse.error.message}`);
      }
      const url = endpoint.startsWith('https://') ? endpoint : `${POWERBI_API_BASE}${endpoint}`;
      const response = await fetchWithTimeout(url, {
        headers: {
          Authorization: `Bearer ${tokenResponse.data.accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      if (response.status === 401 || response.status === 403) {
        // Token was issued but the API refused it: the account is not a
        // Fabric admin (or admin API access is disabled in the tenant).
        throw new Error('ADMIN_REQUIRED: this account is not a Fabric administrator');
      }
      if (!response.ok) {
        await throwForStatus(response, 'Power BI admin API error');
      }
      return response.json() as Promise<T>;
    }, { maxAttempts: 2 });
  }

  /**
   * Admin insights: App audiences (who can open each published App) and the
   * tenant activity log aggregated into who-uses-what (last `days` days, max
   * 14; the activity API serves one UTC day per request with continuation).
   * Requires the signed-in user to be a Fabric admin; the admin token is
   * acquired via incremental consent and never touches regular sign-ins.
   */
  // Default days = 2 (was 7): the first unlock must come back fast on a real
  // tenant — each extra day is another full activity-log walk. The UI can
  // explicitly request a wider window later.
  async getAdminInsights(days = 2, force = false): Promise<IPCResponse<AdminInsights>> {
    try {
      const boundedDays = Math.max(1, Math.min(14, Math.floor(days)));
      if (
        !force &&
        this.adminInsightsCache &&
        this.adminInsightsCache.expires > Date.now() &&
        this.adminInsightsCache.value.days === boundedDays
      ) {
        return { success: true, data: { ...this.adminInsightsCache.value, fromCache: true } };
      }

      // App audiences — list the user's apps, then the admin users endpoint
      // per app. A single app failing degrades to users:null, not a page error.
      // Capped at 2 in flight: parallel enough that dozens of apps don't load
      // one-at-a-time, serial enough not to trip tenant throttling (which would
      // stack Retry-After waits and recreate the unlock hang).
      const appsResponse = await this.getApps();
      const appAudiences: AdminAppAudience[] = await mapWithConcurrency(
        appsResponse.success ? appsResponse.data : [],
        2,
        async (app): Promise<AdminAppAudience> => {
          try {
            const resp = await this.makeAdminRequest<PowerBIApiResponse<{
              displayName?: string;
              emailAddress?: string;
              identifier?: string;
              appUserAccessRight?: string;
              principalType?: string;
            }>>(`/admin/apps/${app.id}/users`);
            return {
              appId: app.id,
              appName: app.name,
              users: (resp.value ?? []).map((u) => ({
                name: u.displayName || u.emailAddress || u.identifier || 'Unknown',
                email: u.emailAddress,
                accessRight: u.appUserAccessRight || 'Unknown',
                type: u.principalType || 'User',
              })),
            };
          } catch (err) {
            // ADMIN_REQUIRED / consent errors must fail the whole call (the
            // entire admin tier is unavailable) — re-throw those; anything else
            // degrades just this app's audience list.
            const msg = String(err);
            if (msg.includes('ADMIN_REQUIRED') || msg.includes('ADMIN_TOKEN:') || msg.includes('ADMIN_NOT_WIRED')) {
              throw err;
            }
            return { appId: app.id, appName: app.name, users: null };
          }
        },
      );

      // Activity log — one UTC day per request, newest day first, following
      // continuationUri until lastResultSet. Aggregate report views.
      const byUser = new Map<string, { views: number; lastActive: string }>();
      const byItem = new Map<string, { views: number; users: Set<string>; lastViewed: string }>();
      let failedDays = 0;
      // Hard memory bound: a large tenant could return millions of events. We
      // only need aggregates, but the distinct-key Maps still grow with unique
      // users/items. Cap total processed events; hitting it marks the run
      // partial rather than risking an out-of-memory on a client machine.
      const MAX_TOTAL_EVENTS = 250_000;
      let totalEvents = 0;
      let truncatedForVolume = false;

      for (let d = 0; d < boundedDays; d++) {
        const day = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
        const y = day.getUTCFullYear();
        const m = String(day.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(day.getUTCDate()).padStart(2, '0');
        // The activity API requires quoted ISO datetimes within ONE UTC day.
        let url: string | undefined =
          `/admin/activityevents?startDateTime='${y}-${m}-${dd}T00:00:00.000Z'` +
          `&endDateTime='${y}-${m}-${dd}T23:59:59.999Z'` +
          `&$filter=Activity eq 'ViewReport'`;
        // Bound the per-day continuation walk: a repeated/circular
        // continuationUri (or a pathologically large day) must not loop
        // forever or grow memory without limit. 200 pages is far beyond any
        // real day; treat hitting the cap as a partial day.
        const seenUris = new Set<string>();
        const MAX_PAGES_PER_DAY = 200;
        try {
          let pages = 0;
          while (url) {
            if (seenUris.has(url) || pages >= MAX_PAGES_PER_DAY) {
              console.warn('[PowerBI admin] activity pagination capped/looping — treating day as partial');
              failedDays++;
              break;
            }
            seenUris.add(url);
            pages++;
            const resp: {
              activityEventEntities?: unknown;
              continuationUri?: string;
              lastResultSet?: boolean;
            } = await this.makeAdminRequest(url);
            // Defend against a shape we don't expect: the field may be absent,
            // null, or (in some tenants/regions) not an array. Anything other
            // than an array contributes no events instead of throwing.
            const entities = Array.isArray(resp.activityEventEntities)
              ? (resp.activityEventEntities as Array<Record<string, unknown>>)
              : [];
            for (const e of entities) {
              if (totalEvents >= MAX_TOTAL_EVENTS) {
                truncatedForVolume = true;
                break;
              }
              totalEvents++;
              const user = String(e.UserId ?? e.UserKey ?? e.UserAgent ?? '').trim() || 'Unknown';
              const item =
                String(e.ReportName ?? e.ItemName ?? e.ArtifactName ?? '').trim() || 'Unknown item';
              const rawTime = String(e.CreationTime ?? '').trim();
              // Only treat a value as "more recent" when it is a parseable time;
              // a blank/garbage CreationTime must never win the max() comparison.
              const time = Number.isNaN(Date.parse(rawTime)) ? '' : rawTime;
              const u = byUser.get(user) ?? { views: 0, lastActive: '' };
              u.views++;
              if (time && time > u.lastActive) u.lastActive = time;
              byUser.set(user, u);
              const it = byItem.get(item) ?? { views: 0, users: new Set<string>(), lastViewed: '' };
              it.views++;
              it.users.add(user);
              if (time && time > it.lastViewed) it.lastViewed = time;
              byItem.set(item, it);
            }
            if (truncatedForVolume) break;
            url = resp.lastResultSet === false && resp.continuationUri ? resp.continuationUri : undefined;
          }
        } catch (err) {
          const msg = String(err);
          if (msg.includes('ADMIN_REQUIRED') || msg.includes('ADMIN_TOKEN:') || msg.includes('ADMIN_NOT_WIRED')) {
            throw err;
          }
          failedDays++;
        }
        if (truncatedForVolume) break;
      }

      const result: AdminInsights = {
        generatedAt: new Date().toISOString(),
        fromCache: false,
        days: boundedDays,
        activityByUser: Array.from(byUser.entries())
          .map(([user, v]) => ({ user, views: v.views, lastActive: v.lastActive }))
          .sort((a, b) => b.views - a.views),
        activityByItem: Array.from(byItem.entries())
          .map(([name, v]) => ({
            name,
            views: v.views,
            uniqueUsers: v.users.size,
            lastViewed: v.lastViewed,
          }))
          .sort((a, b) => b.views - a.views),
        appAudiences,
        failedDays,
        truncated: truncatedForVolume,
      };
      this.adminInsightsCache = {
        value: result,
        expires: Date.now() + PowerBIApiService.ADMIN_INSIGHTS_TTL_MS,
      };
      return { success: true, data: result };
    } catch (error) {
      const msg = String(error);
      if (msg.includes('ADMIN_REQUIRED')) {
        return {
          success: false,
          error: {
            code: 'ADMIN_REQUIRED',
            message:
              'This view needs a Fabric administrator account. Your sign-in works, but Power BI refused admin access for it.',
          },
        };
      }
      const tokenCode = msg.match(/ADMIN_TOKEN:([A-Z_]+):/)?.[1];
      if (tokenCode) {
        return {
          success: false,
          error: {
            code: tokenCode,
            message:
              tokenCode === 'ADMIN_CONSENT_CANCELLED'
                ? 'The permission window was closed before consent was granted.'
                : msg,
          },
        };
      }
      return { success: false, error: buildErrorEnvelope('ADMIN_INSIGHTS_FAILED', error) };
    }
  }

  async getDatasetRefreshInfo(datasetId: string, workspaceId?: string): Promise<IPCResponse<DatasetRefreshInfo>> {
    try {
      // Fetch the recent refresh history (not just the latest one). A single
      // Failed/Cancelled or in-flight latest attempt must NOT blank the "Data
      // refreshed" stamp when an earlier refresh actually published data (a
      // recent failed scheduled refresh would hide the dataset timestamp
      // entirely). Use workspace context if provided, otherwise try direct
      // access (for My Workspace).
      const endpoint = workspaceId
        ? `/groups/${workspaceId}/datasets/${datasetId}/refreshes?$top=10`
        : `/datasets/${datasetId}/refreshes?$top=10`;

      type RefreshesResponse = PowerBIApiResponse<{
        requestId: string;
        id: string;
        refreshType: string;
        startTime: string;
        endTime: string;
        status: string;
      }>;

      let response: RefreshesResponse;
      try {
        response = await this.makeRequest<RefreshesResponse>(endpoint);
      } catch (error) {
        // The grouped form requires WORKSPACE access. A user who reaches a
        // dataset only through an app audience (no workspace membership), or a
        // caller holding the wrong workspace GUID for a SHARED dataset that
        // lives in another workspace, gets 401/403/404 here — yet the groupless
        // `/datasets/{id}/refreshes` form works for any dataset the user can
        // read. Fall back so the freshness stamp still populates.
        const status = error instanceof HttpError ? error.status : undefined;
        const isGroupAccessFailure = status === 401 || status === 403 || status === 404;
        if (!workspaceId || !isGroupAccessFailure) throw error;
        console.warn(
          `[PowerBI] Grouped refreshes call failed (${status}); retrying without workspace context`,
        );
        response = await this.makeRequest<RefreshesResponse>(
          `/datasets/${datasetId}/refreshes?$top=10`,
        );
      }

      const refreshes = response.value ?? [];
      // 'Completed' (or 'Unknown', which the v1 /refreshes endpoint reports for a
      // completed on-demand refresh) means data was actually published. Prefer the
      // most recent such refresh (the list is newest-first) so we report when the
      // on-screen data was really last refreshed — not a failed attempt's time.
      const isSuccessLike = (s: string | undefined): boolean => s === 'Completed' || s === 'Unknown';
      // Fall back to the latest entry so a timestamp still appears even if no
      // recent refresh succeeded (better an honest "last attempt" stamp than none).
      const chosen = refreshes.find((r) => isSuccessLike(r.status)) ?? refreshes[0];
      if (chosen) {
        return {
          success: true,
          data: {
            lastRefreshTime: chosen.endTime || chosen.startTime,
            lastRefreshStatus: chosen.status as DatasetRefreshInfo['lastRefreshStatus'],
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
   * Derive a data-freshness signal for a whole DASHBOARD.
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
   * Resolve the upstream dataflow(s) feeding the given datasets. Lineage is
   * static, so the result is cached for LINEAGE_TTL_MS — the freshness poll
   * re-fetches refresh TIMES, not lineage, on every cycle.
   */
  private async resolveUpstreamDataflows(
    workspaceId: string,
    datasetIds: string[],
  ): Promise<Array<{ dataflowId: string; workspaceId: string }>> {
    const cacheKey = `${workspaceId}|${[...datasetIds].sort().join(',')}`;
    const cached = lineageCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return cached.value;
    const { links, confident } = await this.resolveUpstreamDataflowsUncached(workspaceId, datasetIds);
    // Cache only a CONFIDENT result — a real upstreamDataflows link. An empty
    // result may be a transient failure, and the single-dataflow FALLBACK is a
    // heuristic guess that could attribute an unrelated dataflow's time; neither
    // should be locked in for the full TTL (a wrong "Dataflow: ..." time is more
    // misleading than none). Both are re-resolved next poll and self-heal.
    if (confident && links.length > 0) {
      lineageCache.set(cacheKey, { value: links, expires: Date.now() + LINEAGE_TTL_MS });
    }
    return links;
  }

  /**
   * Primary: GET /groups/{ws}/datasets/upstreamDataflows (Dataset.Read.All) →
   * filter to our datasetIds. Fallback (no recognized link): if the workspace has
   * exactly one dataflow, assume it. The dataflow can live in a different
   * workspace than the dataset (workspaceObjectId on the link).
   */
  private async resolveUpstreamDataflowsUncached(
    workspaceId: string,
    datasetIds: string[],
  ): Promise<{ links: Array<{ dataflowId: string; workspaceId: string }>; confident: boolean }> {
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
      // A real lineage link is authoritative → confident (cacheable for the full TTL).
      if (out.length > 0) return { links: out, confident: true };
    } catch (error) {
      console.warn('[PowerBI] upstreamDataflows lookup failed:', error);
    }
    // Fallback: exactly one dataflow in the workspace → assume it is upstream.
    // This is a GUESS (the lone dataflow may not actually feed this dataset), so
    // it is returned but marked not-confident → not cached for the full TTL.
    try {
      const dfResp = await this.makeRequest<PowerBIApiResponse<{ objectId: string }>>(
        `/groups/${workspaceId}/dataflows`,
      );
      const dfs = (dfResp.value ?? []).filter((d) => d.objectId);
      const onlyDf = dfs.length === 1 ? dfs[0] : undefined;
      if (onlyDf) return { links: [{ dataflowId: onlyDf.objectId, workspaceId }], confident: false };
    } catch (error) {
      console.warn('[PowerBI] dataflows list (fallback) failed:', error);
    }
    return { links: [], confident: false };
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
   * the content's datasets. Pass datasetIds for a report (plain strings, all in
   * `workspaceId`), {datasetId, workspaceId} pairs for an app (a shared dataset
   * can live in a DIFFERENT workspace than the app's source workspace, so each
   * dataset must be queried in its own group), or a dashboardId to derive the
   * datasets from the dashboard's tiles.
   */
  async getDataFreshness(
    workspaceId: string,
    datasetIds: Array<string | DatasetWorkspaceRef>,
    dashboardId?: string,
  ): Promise<IPCResponse<DataFreshness>> {
    try {
      // Normalize every input form to {datasetId, workspaceId} pairs. Plain
      // string ids (report/dashboard callers) inherit the content's workspace;
      // pair entries (App caller) keep each dataset's OWN home workspace.
      let refs: DatasetWorkspaceRef[];
      if (dashboardId) {
        refs = (await this.getDashboardTileDatasetIds(dashboardId, workspaceId)).map(
          (id) => ({ datasetId: id, workspaceId }),
        );
      } else {
        refs = datasetIds
          .map((entry) =>
            typeof entry === 'string' ? { datasetId: entry, workspaceId } : entry,
          )
          .filter(
            (r): r is DatasetWorkspaceRef =>
              !!r &&
              typeof r.datasetId === 'string' && r.datasetId.length > 0 &&
              typeof r.workspaceId === 'string' && r.workspaceId.length > 0,
          );
      }
      const seenDatasets = new Set<string>();
      refs = refs.filter((r) => {
        if (seenDatasets.has(r.datasetId)) return false;
        seenDatasets.add(r.datasetId);
        return true;
      });

      // Dataset: stalest last-refresh across the datasets, each queried in its
      // own workspace (getDatasetRefreshInfo additionally falls back to the
      // groupless endpoint when workspace access is denied — app audiences).
      let datasetRefreshTime: string | null = null;
      const datasetResults = await Promise.all(
        refs.map((r) => this.getDatasetRefreshInfo(r.datasetId, r.workspaceId)),
      );
      // Owner ruling: ABANDONED datasets don't define an app's freshness. A
      // dataset with no refresh in 90+ days is dead weight, not lag — exclude
      // it from the "Oldest data" aggregate so one corpse from years ago
      // can't mask that the living datasets refreshed this morning. Only if
      // EVERYTHING is abandoned do we fall back to the true oldest.
      const ABANDONED_MS = 90 * 24 * 60 * 60 * 1000;
      const times = datasetResults
        .filter((r) => r.success && r.data.lastRefreshTime)
        .map((r) => (r.success ? r.data.lastRefreshTime! : ''))
        .filter(Boolean);
      const living = times.filter((t) => Date.now() - Date.parse(t) < ABANDONED_MS);
      for (const t of living.length > 0 ? living : times) {
        if (!datasetRefreshTime || Date.parse(t) < Date.parse(datasetRefreshTime)) {
          datasetRefreshTime = t;
        }
      }

      // Dataflow: stalest last-SUCCESS across all upstream dataflows. Lineage
      // is resolved per distinct workspace so multi-workspace datasets each
      // look up dataflows in their own group; results are deduped by dataflow.
      let dataflowRefreshTime: string | null = null;
      if (refs.length > 0) {
        const idsByWorkspace = new Map<string, string[]>();
        for (const r of refs) {
          const list = idsByWorkspace.get(r.workspaceId) ?? [];
          list.push(r.datasetId);
          idsByWorkspace.set(r.workspaceId, list);
        }
        const dataflowLists = await Promise.all(
          [...idsByWorkspace.entries()].map(([ws, ids]) => this.resolveUpstreamDataflows(ws, ids)),
        );
        const seenDataflows = new Set<string>();
        const dataflows = dataflowLists.flat().filter((df) => {
          if (seenDataflows.has(df.dataflowId)) return false;
          seenDataflows.add(df.dataflowId);
          return true;
        });
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
        data: { datasetRefreshTime, dataflowRefreshTime, datasetCount: refs.length },
      };
    } catch (error) {
      console.warn('[PowerBI] Data freshness unavailable:', error);
      return { success: false, error: buildErrorEnvelope('DATA_FRESHNESS_FAILED', error) };
    }
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
