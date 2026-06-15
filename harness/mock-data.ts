import type { InsightsSnapshot, InsightsRefreshable } from '../src/shared/types';

const now = Date.now();
const ago = (h: number) => new Date(now - h * 3600e3).toISOString();

const runs = (pattern: boolean[]) =>
  pattern.map((ok, j) => ({
    ok,
    endTime: ago((pattern.length - j) * 2),
    ...(ok ? {} : { errorCode: 'ModelRefreshFailed', errorDetail: 'Credentials expired.' }),
  }));

export const MOCK_REFRESHABLES: InsightsRefreshable[] = [
  {
    kind: 'dataset', id: 'ds-alpha-1', name: 'ALPHA - Billing Model',
    workspaceId: 'alpha', workspaceName: 'ALPHA',
    lastStatus: 'Completed', lastAttemptTime: ago(2), lastSuccessTime: ago(2),
    scheduleSummary: 'Daily 04:00', recentRuns: runs([1,1,1,1,1,1,1,1,1,1,1,1].map(Boolean)),
  },
  {
    kind: 'dataset', id: 'ds-alpha-2', name: 'ALPHA - KPI Model',
    workspaceId: 'alpha', workspaceName: 'ALPHA',
    lastStatus: 'Completed', lastAttemptTime: ago(5), lastSuccessTime: ago(5),
    scheduleSummary: 'Daily 12:00', recentRuns: runs([1,1,0,1,1,1,1,0,1,1,1,1].map(Boolean)),
  },
  {
    kind: 'dataflow', id: 'df-alpha-1', name: 'ALPHA - Staging Flow',
    workspaceId: 'alpha', workspaceName: 'ALPHA',
    lastStatus: 'Completed', lastAttemptTime: ago(3), lastSuccessTime: ago(3),
    recentRuns: runs([1,1,1,1,1,1,1,1].map(Boolean)),
  },
  {
    kind: 'dataset', id: 'ds-beta-1', name: 'BETA - Payor Admin',
    workspaceId: 'beta', workspaceName: 'BETA',
    lastStatus: 'Failed', lastAttemptTime: ago(9 * 24), lastSuccessTime: ago(35 * 24),
    errorCode: 'ModelRefreshFailed', scheduleOverdue: true,
    recentRuns: runs([1,1,1,0,0,0,0,0].map(Boolean)),
  },
  {
    kind: 'dataset', id: 'ds-gamma-1', name: 'GAMMA - Archive',
    workspaceId: 'gamma', workspaceName: 'GAMMA',
    lastStatus: 'Completed', lastAttemptTime: ago(31 * 24), lastSuccessTime: ago(31 * 24),
    recentRuns: runs([1,1,1].map(Boolean)),
  },
  {
    kind: 'dataflow', id: 'df-gamma-1', name: 'GAMMA - CRM Extract',
    workspaceId: 'gamma', workspaceName: 'GAMMA',
    lastStatus: 'InProgress', lastAttemptTime: ago(0.5),
    recentRuns: runs([1,1,1,1,1,1].map(Boolean)),
  },
];

export const MOCK_SNAPSHOT: InsightsSnapshot = {
  generatedAt: new Date().toISOString(),
  fromCache: false,
  workspaceCount: 3,
  reportCount: 6,
  dashboardCount: 2,
  partialFailure: false,
  failedWorkspaces: [],
  refreshables: MOCK_REFRESHABLES,
  reports: [
    { id: 'rep-1', name: 'ALPHA - Executive Daily', workspaceId: 'alpha', datasetId: 'ds-alpha-1' },
    { id: 'rep-2', name: 'ALPHA - Claims Aging', workspaceId: 'alpha', datasetId: 'ds-alpha-2' },
    { id: 'rep-3', name: 'BETA - AR Summary', workspaceId: 'beta', datasetId: 'ds-beta-1' },
  ],
  access: [
    {
      workspaceId: 'alpha', workspaceName: 'ALPHA',
      users: [
        { name: 'Alice Smith', email: 'alice@example.com', role: 'Member', type: 'User' },
        { name: 'Bob Jones', email: 'bob@example.com', role: 'Viewer', type: 'User' },
      ],
    },
    { workspaceId: 'beta', workspaceName: 'BETA', users: null },
    { workspaceId: 'gamma', workspaceName: 'GAMMA', users: [] },
  ],
};
