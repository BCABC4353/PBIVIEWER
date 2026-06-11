
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

export interface FreshnessPort {
  request<T>(endpoint: string): Promise<T>;
  getApp(appId: string): Promise<IPCResponse<App>>;
  getCacheEpoch(): number;
}

export class PowerBIFreshnessApi {
  private readonly port: FreshnessPort;

  private readonly lineageCache = new Map<
    string,
    { value: Array<{ dataflowId: string; workspaceId: string }>; expires: number }
  >();

  private appReportTargetCache = new Map<string, { value: DatasetWorkspaceRef | null; expires: number }>();

  constructor(port: FreshnessPort) {
    this.port = port;
  }

  clearCaches(): void {
    this.appReportTargetCache.clear();
    this.lineageCache.clear();
  }

  async resolveAppReportDataset(
    appId: string,
    reportId: string,
  ): Promise<IPCResponse<DatasetWorkspaceRef | null>> {
    const cacheKey = `${appId}|${reportId}`.toLowerCase();
    const cached = this.appReportTargetCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return { success: true, data: cached.value };
    }
    const epochAtStart = this.port.getCacheEpoch();
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

      if (this.port.getCacheEpoch() === epochAtStart) {
        this.appReportTargetCache.set(cacheKey, { value, expires: Date.now() + LINEAGE_TTL_MS });
      }
      return { success: true, data: value };
    } catch (error) {
      console.warn('[PowerBI] App report freshness target unresolved:', error);
      return { success: false, error: buildErrorEnvelope('APP_REPORT_TARGET_FAILED', error) };
    }
  }

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
      const isSuccessLike = (s: string | undefined): boolean => s === 'Completed' || s === 'Unknown';
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
      console.warn('[PowerBI] Dataset refresh info unavailable:', error);
      return {
        success: false,
        error: buildErrorEnvelope('REFRESH_INFO_FAILED', error),
      };
    }
  }

  async getDashboardDataFreshness(
    dashboardId: string,
    workspaceId: string
  ): Promise<IPCResponse<DatasetRefreshInfo>> {
    try {
      const datasetIds = await this.getDashboardTileDatasetIds(dashboardId, workspaceId);

      if (datasetIds.length === 0) {
        return { success: true, data: {} };
      }

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

  private async resolveUpstreamDataflows(
    workspaceId: string,
    datasetIds: string[],
  ): Promise<Array<{ dataflowId: string; workspaceId: string }>> {
    const cacheKey = `${workspaceId}|${[...datasetIds].sort().join(',')}`;
    const cached = this.lineageCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return cached.value;
    const epochAtStart = this.port.getCacheEpoch();
    const { links, confident } = await this.resolveUpstreamDataflowsUncached(workspaceId, datasetIds);
    if (confident && links.length > 0 && this.port.getCacheEpoch() === epochAtStart) {
      this.lineageCache.set(cacheKey, { value: links, expires: Date.now() + LINEAGE_TTL_MS });
    }
    return links;
  }

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
      if (out.length > 0) return { links: out, confident: true };
    } catch (error) {
      console.warn('[PowerBI] upstreamDataflows lookup failed:', error);
    }
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

  private async getDataflowLastSuccess(workspaceId: string, dataflowId: string): Promise<string | null> {
    try {
      const resp = await this.port.request<PowerBIApiResponse<{
        status?: string;
        startTime?: string;
        endTime?: string;
      }>>(`/groups/${workspaceId}/dataflows/${dataflowId}/transactions`);
      let latest: string | null = null;
      for (const t of resp.value ?? []) {
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

  async getDataFreshness(
    workspaceId: string,
    datasetIds: Array<string | DatasetWorkspaceRef>,
    dashboardId?: string,
  ): Promise<IPCResponse<DataFreshness>> {
    try {
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

      let datasetRefreshTime: string | null = null;
      const datasetResults = await Promise.all(
        refs.map((r) => this.getDatasetRefreshInfo(r.datasetId, r.workspaceId)),
      );
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
