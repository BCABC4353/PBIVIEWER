// ---------------------------------------------------------------------------
// Insights tier: the one-pager snapshot of refresh health, workspace access,
// and catalog counts. The fetching wrappers here feed the PURE derivation
// functions in src/shared/refresh-health-core.ts (the single source shared
// with the mobile app).
// ---------------------------------------------------------------------------

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

/** What the insights tier needs from the facade: the authenticated request
 *  function plus the catalog listings the snapshot fans out over. */
export interface InsightsPort {
  request<T>(endpoint: string): Promise<T>;
  getWorkspaces(): Promise<IPCResponse<Workspace[]>>;
  getReports(workspaceId: string): Promise<IPCResponse<Report[]>>;
  getDashboards(workspaceId: string): Promise<IPCResponse<Dashboard[]>>;
}

export class PowerBIInsightsApi {
  private readonly port: InsightsPort;

  // Insights snapshot cache. Building a snapshot fans out to every workspace,
  // dataset, and dataflow the user can see; serving repeat page visits from a
  // short-lived cache keeps us far away from the API throttling limits.
  private insightsCache: { value: InsightsSnapshot; expires: number } | null = null;
  private static readonly INSIGHTS_TTL_MS = 5 * 60 * 1000;

  constructor(port: InsightsPort) {
    this.port = port;
  }

  /** Drop the cached snapshot. Account-scoped — see the facade's clearCaches(). */
  clearCache(): void {
    this.insightsCache = null;
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
                this.port.getReports(ws.id),
                this.port.getDashboards(ws.id),
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
        expires: Date.now() + PowerBIInsightsApi.INSIGHTS_TTL_MS,
      };
      return { success: true, data: snapshot };
    });
  }

  /** Datasets in a workspace, or null when the list call fails. */
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

  /** Dataflows in a workspace, or null when the list call fails. */
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

  /**
   * Full upstream-dataflow lineage for a workspace, keyed by LOWERCASED
   * dataset id → dataflow ids feeding it. ONE call per workspace
   * (GET /groups/{ws}/datasets/upstreamDataflows — the same endpoint
   * resolveUpstreamDataflowsUncached in powerbi/freshness.ts uses for
   * freshness, but unfiltered: the snapshot needs every dataset's edges, not
   * a specific id set). Returns null when the call fails so callers can OMIT
   * the field (unknown lineage) instead of failing the snapshot.
   */
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

  /**
   * Users with access to a workspace, or null when the caller is not allowed
   * to list them (e.g. viewer-only role). Null means "not visible to you",
   * which the UI must distinguish from an empty workspace.
   */
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

  /** Fetch a dataset's recent refresh history and derive health from it
   *  (the pure derivation lives in src/shared/refresh-health-core.ts). */
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
      const sched = await this.port.request<{
        days?: string[];
        times?: string[];
        enabled?: boolean;
        localTimeZoneId?: string;
      }>(`/groups/${workspaceId}/datasets/${datasetId}/refreshSchedule`);
      return deriveScheduleInfo(sched, lastSuccessTime);
    } catch {
      // No schedule endpoint for this dataset (live/push) or no permission.
      return {};
    }
  }

  /** Fetch a dataflow's recent transactions and derive health from them
   *  (the pure derivation lives in src/shared/refresh-health-core.ts). */
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
