// ---------------------------------------------------------------------------
// Data-freshness: dataset refresh time + upstream dataflow last-success time.
// Powers the viewers' "Data refreshed: ... / Dataflow: ..." stamps. A dataset
// can report a successful refresh while serving stale data (the upstream query
// broke), so the dataflow's last SUCCESSFUL completion is an independent signal.
// Also home to the App view's per-report freshness-target resolution.
// ---------------------------------------------------------------------------

import { HttpError, type PowerBIApiResponse } from './http';
import { buildErrorEnvelope } from './envelope';
import type {
  App,
  DatasetRefreshInfo,
  DatasetWorkspaceRef,
  DataFreshness,
  IPCResponse,
} from '../../../shared/types';

const LINEAGE_TTL_MS = 30 * 60 * 1000;

/** What the freshness tier needs from the facade: the authenticated request
 *  function plus the catalog's app lookup (for the resolution ladder). */
export interface FreshnessPort {
  request<T>(endpoint: string): Promise<T>;
  getApp(appId: string): Promise<IPCResponse<App>>;
}

export class PowerBIFreshnessApi {
  private readonly port: FreshnessPort;

  // Dataset -> dataflow lineage is static, so cache resolved links: the 5-min
  // freshness poll then re-fetches refresh TIMES only, not lineage every cycle.
  // (Formerly a module-level Map in powerbi-api.ts; instance-level so each
  // constructed service — and each test — owns its account-scoped cache.
  // Production builds exactly ONE instance via the lazy singleton, so the
  // caching behavior there is unchanged.)
  private readonly lineageCache = new Map<
    string,
    { value: Array<{ dataflowId: string; workspaceId: string }>; expires: number }
  >();

  // Per-(app, report) freshness-target resolutions for the App view (see
  // resolveAppReportDataset). A resolution costs up to three API calls and the
  // freshness poll re-runs every 5 minutes, so outcomes — including "this id is
  // not a report" nulls — are cached. Report→dataset bindings are as static as
  // lineage, so the lineage TTL is reused.
  private appReportTargetCache = new Map<string, { value: DatasetWorkspaceRef | null; expires: number }>();

  constructor(port: FreshnessPort) {
    this.port = port;
  }

  /** Drop the lineage + app-report-target caches. Account-scoped — see the
   *  facade's clearCaches() for the logout/account-switch ruling. */
  clearCaches(): void {
    this.appReportTargetCache.clear();
    this.lineageCache.clear();
  }

  /**
   * Resolve the dataset behind ONE report inside an app — the App view's
   * per-report freshness target. The renderer first matches the webview URL
   * against its pre-fetched app report list; this is the SECOND CHANCE when
   * that match fails (the URL named a GUID the list doesn't carry, or the
   * matched report had no datasetId even after getAppReports' backfill).
   * Asking the API about the URL's own id directly removes every list-matching
   * assumption that has historically broken per-report stamps.
   *
   * Resolution ladder (each rung one request, later rungs best-effort):
   *   1. GET /apps/{appId}/reports/{reportId} — does the app know this id?
   *      A 404 is a CONFIDENT "not a report of this app" (dashboard id, app
   *      home token, …) → null, cached, caller keeps the aggregate stamp.
   *   2. Its datasetId, when the apps API populated it.
   *   3. The originalReportObjectId hop: GET /groups/{sourceWs}/reports/{id}
   *      — the SAME report in the app's source workspace, where datasetId IS
   *      populated (tenant-verified quirk; see getAppReports).
   *   4. The dataset's REAL home workspace via the groupless dataset lookup —
   *      a shared dataset can live outside the app's source workspace, and
   *      both the refreshes call and the upstream-dataflow lineage only answer
   *      accurately in the dataset's own group.
   */
  async resolveAppReportDataset(
    appId: string,
    reportId: string,
  ): Promise<IPCResponse<DatasetWorkspaceRef | null>> {
    const cacheKey = `${appId}|${reportId}`.toLowerCase();
    const cached = this.appReportTargetCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return { success: true, data: cached.value };
    }
    try {
      const appResponse = await this.port.getApp(appId);
      const sourceWorkspaceId = appResponse.success ? appResponse.data.workspaceId : undefined;

      let report: { datasetId?: string; originalReportObjectId?: string } | null = null;
      try {
        report = await this.port.request<{ datasetId?: string; originalReportObjectId?: string }>(
          `/apps/${appId}/reports/${reportId}`,
        );
      } catch (error) {
        const status = error instanceof HttpError ? error.status : undefined;
        if (status !== 404) throw error;
      }

      let datasetId = report?.datasetId || undefined;
      // The apps API doesn't know the id at all? The URL may be carrying the
      // SOURCE-WORKSPACE form of the report id (the inverse of the
      // originalReportObjectId hop below) — ask the source workspace directly.
      if (!report && sourceWorkspaceId) {
        try {
          const direct = await this.port.request<{ datasetId?: string }>(
            `/groups/${sourceWorkspaceId}/reports/${reportId}`,
          );
          datasetId = direct.datasetId || undefined;
        } catch (error) {
          const status = error instanceof HttpError ? error.status : undefined;
          if (status !== 404 && status !== 401 && status !== 403) {
            console.warn('[PowerBI] App report source-workspace probe failed (degrading):', error);
          }
        }
      }
      if (!datasetId && report?.originalReportObjectId && sourceWorkspaceId) {
        try {
          const original = await this.port.request<{ datasetId?: string }>(
            `/groups/${sourceWorkspaceId}/reports/${report.originalReportObjectId}`,
          );
          datasetId = original.datasetId || undefined;
        } catch (error) {
          console.warn('[PowerBI] App report original-report hop failed (degrading):', error);
        }
      }

      const value: DatasetWorkspaceRef | null =
        datasetId && sourceWorkspaceId
          ? {
              datasetId,
              workspaceId: await this.resolveDatasetHomeWorkspace(datasetId, sourceWorkspaceId),
            }
          : null;

      this.appReportTargetCache.set(cacheKey, { value, expires: Date.now() + LINEAGE_TTL_MS });
      return { success: true, data: value };
    } catch (error) {
      // NOT cached: a transient failure (network blip, throttle) must not pin
      // this report to the aggregate stamp until the cache expires.
      console.warn('[PowerBI] App report freshness target unresolved:', error);
      return { success: false, error: buildErrorEnvelope('APP_REPORT_TARGET_FAILED', error) };
    }
  }

  /**
   * Best-effort home-workspace lookup for a dataset. The groupless dataset
   * read works for any dataset the caller can access, and its webUrl names the
   * dataset's REAL group (https://app.powerbi.com/groups/{ws}/datasets/{id}).
   * Falls back to the provided workspace when the lookup or the parse fails
   * (e.g. a My-Workspace dataset, whose webUrl has no group GUID).
   */
  private async resolveDatasetHomeWorkspace(
    datasetId: string,
    fallbackWorkspaceId: string,
  ): Promise<string> {
    try {
      const dataset = await this.port.request<{ webUrl?: string }>(`/datasets/${datasetId}`);
      const homeWorkspaceId =
        /\/groups\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\//.exec(
          dataset.webUrl ?? '',
        )?.[1];
      if (homeWorkspaceId) return homeWorkspaceId;
    } catch (error) {
      console.warn('[PowerBI] Dataset home-workspace lookup failed (using app workspace):', error);
    }
    return fallbackWorkspaceId;
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
        response = await this.port.request<RefreshesResponse>(endpoint);
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
        response = await this.port.request<RefreshesResponse>(
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
      // Distinct datasetIds across all tiles; skip tiles with no datasetId.
      const datasetIds = await this.getDashboardTileDatasetIds(dashboardId, workspaceId);

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

  /** Distinct datasetIds referenced by a dashboard's tiles. */
  private async getDashboardTileDatasetIds(dashboardId: string, workspaceId: string): Promise<string[]> {
    interface RawTile {
      id: string;
      datasetId?: string;
    }
    const tilesResponse = await this.port.request<PowerBIApiResponse<RawTile>>(
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
    const cached = this.lineageCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return cached.value;
    const { links, confident } = await this.resolveUpstreamDataflowsUncached(workspaceId, datasetIds);
    // Cache only a CONFIDENT result — a real upstreamDataflows link. An empty
    // result may be a transient failure, and the single-dataflow FALLBACK is a
    // heuristic guess that could attribute an unrelated dataflow's time; neither
    // should be locked in for the full TTL (a wrong "Dataflow: ..." time is more
    // misleading than none). Both are re-resolved next poll and self-heal.
    if (confident && links.length > 0) {
      this.lineageCache.set(cacheKey, { value: links, expires: Date.now() + LINEAGE_TTL_MS });
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
      const resp = await this.port.request<PowerBIApiResponse<{
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
      const dfResp = await this.port.request<PowerBIApiResponse<{ objectId: string }>>(
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
      const resp = await this.port.request<PowerBIApiResponse<{
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
