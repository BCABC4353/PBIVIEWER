
import { mapWithConcurrency, type PowerBIApiResponse } from './http';
import { buildErrorEnvelope, withErrorEnvelope } from './envelope';
import {
  deriveDataflowRefreshHealth,
  deriveDatasetRefreshHealth,
  deriveScheduleInfo,
} from '../../../shared/refresh-health-core';
import type {
  Workspace,
  Report,
  Dashboard,
  IPCResponse,
  InsightsSnapshot,
  InsightsRefreshable,
  InsightsWorkspaceAccess,
} from '../../../shared/types';

export interface InsightsPort {
  request<T>(endpoint: string): Promise<T>;
  getWorkspaces(): Promise<IPCResponse<Workspace[]>>;
  getReports(workspaceId: string): Promise<IPCResponse<Report[]>>;
  getDashboards(workspaceId: string): Promise<IPCResponse<Dashboard[]>>;
}

export class PowerBIInsightsApi {
  private readonly port: InsightsPort;

  private insightsCache: { value: InsightsSnapshot; expires: number } | null = null;
  private static readonly INSIGHTS_TTL_MS = 5 * 60 * 1000;

  constructor(port: InsightsPort) {
    this.port = port;
  }

  clearCache(): void {
    this.insightsCache = null;
  }

  async getInsightsSnapshot(force = false): Promise<IPCResponse<InsightsSnapshot>> {
    return withErrorEnvelope('INSIGHTS_FETCH_FAILED', async () => {
      if (!force && this.insightsCache && this.insightsCache.expires > Date.now()) {
        return { success: true, data: { ...this.insightsCache.value, fromCache: true } };
      }

      const workspacesResponse = await this.port.getWorkspaces();
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
                this.port.getReports(ws.id),
                this.port.getDashboards(ws.id),
                this.getWorkspaceUpstreamDataflowLinks(ws.id),
              ]);

            if (reports.success) {
              reportCount += reports.data.length;
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
        expires: Date.now() + PowerBIInsightsApi.INSIGHTS_TTL_MS,
      };
      return { success: true, data: snapshot };
    });
  }

  private async getWorkspaceDatasets(
    workspaceId: string,
  ): Promise<Array<{ id: string; name: string; configuredBy?: string; isRefreshable?: boolean }> | null> {
    try {
      const resp = await this.port.request<PowerBIApiResponse<{
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

  private async getWorkspaceDataflows(
    workspaceId: string,
  ): Promise<Array<{ objectId: string; name: string }> | null> {
    try {
      const resp = await this.port.request<PowerBIApiResponse<{
        objectId: string;
        name: string;
      }>>(`/groups/${workspaceId}/dataflows`);
      return (resp.value ?? []).filter((d) => d.objectId);
    } catch (error) {
      console.warn('[PowerBI] dataflows list failed for insights:', error);
      return null;
    }
  }

  private async getWorkspaceUpstreamDataflowLinks(
    workspaceId: string,
  ): Promise<Map<string, string[]> | null> {
    try {
      const resp = await this.port.request<PowerBIApiResponse<{
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

  private async getWorkspaceUsers(
    workspaceId: string,
  ): Promise<InsightsWorkspaceAccess['users']> {
    try {
      const resp = await this.port.request<PowerBIApiResponse<{
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
      const resp = await this.port.request<PowerBIApiResponse<{
        status?: string;
        startTime?: string;
        endTime?: string;
        refreshType?: string;
        serviceExceptionJson?: string;
      }>>(`/groups/${workspaceId}/datasets/${datasetId}/refreshes?$top=12`);
      return deriveDatasetRefreshHealth(resp.value ?? []);
    } catch (error) {
      console.warn('[PowerBI] dataset refresh history failed for insights:', error);
      return { lastStatus: 'Never' };
    }
  }

  private async getDatasetScheduleInfo(
    workspaceId: string,
    datasetId: string,
    lastSuccessTime?: string,
  ): Promise<Pick<InsightsRefreshable, 'scheduleSummary' | 'scheduleOverdue'>> {
    try {
      const sched = await this.port.request<{
        days?: string[];
        times?: string[];
        enabled?: boolean;
        localTimeZoneId?: string;
      }>(`/groups/${workspaceId}/datasets/${datasetId}/refreshSchedule`);
      return deriveScheduleInfo(sched, lastSuccessTime);
    } catch {
      return {};
    }
  }

  private async getDataflowRefreshHealth(
    workspaceId: string,
    dataflowId: string,
  ): Promise<Pick<InsightsRefreshable, 'lastStatus' | 'lastAttemptTime' | 'lastSuccessTime' | 'recentRuns'>> {
    try {
      const resp = await this.port.request<PowerBIApiResponse<{
        status?: string;
        startTime?: string;
        endTime?: string;
      }>>(`/groups/${workspaceId}/dataflows/${dataflowId}/transactions?$top=12`);
      return deriveDataflowRefreshHealth(resp.value ?? []);
    } catch (error) {
      console.warn('[PowerBI] dataflow transactions failed for insights:', error);
      return { lastStatus: 'Never' };
    }
  }
}
