/**
 * Mock data source — realistic fleet so the app renders end-to-end in Expo Go
 * with no sign-in. Swap for LiveFleetClient once the Entra redirect URI for
 * mobile is registered (see mobile/README.md).
 */
import type { DataSource, FleetSnapshot } from './types';

const h = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();

export class MockDataSource implements DataSource {
  async getFleetSnapshot(): Promise<FleetSnapshot> {
    await new Promise((r) => setTimeout(r, 600)); // visible skeleton beat
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
}
