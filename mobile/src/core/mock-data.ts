import type { DataSource, FleetProgressFn, FleetSnapshot } from './types';

const h = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();

export const MOCK_STAGE_DELAYS_MS = [500, 340, 340, 340, 340, 340] as const;

type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise<void>((r) => setTimeout(r, ms));

export class MockDataSource implements DataSource {
  private readonly sleep: Sleep;

  constructor(deps: { sleep?: Sleep } = {}) {
    this.sleep = deps.sleep ?? realSleep;
  }

  async getFleetSnapshot(_force?: boolean, onProgress?: FleetProgressFn): Promise<FleetSnapshot> {
    const snapshot = buildSnapshot();
    if (!onProgress) {
      await this.sleep(600);
      return snapshot;
    }
    const total = snapshot.refreshables.length;
    for (let i = 0; i < total; i++) {
      await this.sleep(MOCK_STAGE_DELAYS_MS[i] ?? 340);
      onProgress((i + 1) / total, i + 1);
    }
    return snapshot;
  }
}

function buildSnapshot(): FleetSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    workspaceCount: 4,
    partialFailure: false,
    failedWorkspaces: [],
    refreshables: [
      {
        kind: 'dataset', id: 'ds-1', name: 'Sales Performance', workspaceId: 'w1',
        workspaceName: 'BC Suite', configuredBy: 'brendan@bc-abc.com',
        lastStatus: 'Failed', lastAttemptTime: h(2), lastSuccessTime: h(26),
        errorCode: 'ModelRefreshFailed_CredentialsNotSpecified',
        lastRefreshType: 'Scheduled', scheduleSummary: 'Daily at 06:00', scheduleOverdue: true,
        recentDurationsMin: [12, 13, 12, 15, 14],
      },
      {
        kind: 'dataset', id: 'ds-2', name: 'Ops Daily', workspaceId: 'w1',
        workspaceName: 'BC Suite', configuredBy: 'brendan@bc-abc.com',
        lastStatus: 'Completed', lastAttemptTime: h(1), lastSuccessTime: h(1),
        lastRefreshType: 'ViaApi', scheduleSummary: 'Daily at 05:30, 12:30',
        recentDurationsMin: [4, 4, 5, 4, 6, 5, 7, 8, 8, 11],
      },
      {
        kind: 'dataflow', id: 'df-1', name: 'Staging Flow', workspaceId: 'w2',
        workspaceName: 'Data Engineering', lastStatus: 'InProgress', lastAttemptTime: h(0.1),
        lastSuccessTime: h(13),
      },
      {
        kind: 'dataset', id: 'ds-3', name: 'Finance Live', workspaceId: 'w3',
        workspaceName: 'Finance', lastStatus: 'Disabled',
      },
      {
        kind: 'dataset', id: 'ds-4', name: 'Inventory Snapshot', workspaceId: 'w2',
        workspaceName: 'Data Engineering', configuredBy: 'brendan@bc-abc.com',
        lastStatus: 'Completed', lastAttemptTime: h(3), lastSuccessTime: h(3),
        lastRefreshType: 'OnDemand',
      },
      {
        kind: 'dataflow', id: 'df-2', name: 'CRM Extract', workspaceId: 'w4',
        workspaceName: 'Client Delivery', lastStatus: 'Never',
      },
    ],
  };
}
