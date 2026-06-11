
export type RefreshStatus =
  | 'Completed'
  | 'Failed'
  | 'InProgress'
  | 'Cancelled'
  | 'Disabled'
  | 'Never';

export interface Refreshable {
  kind: 'dataset' | 'dataflow';
  id: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
  configuredBy?: string;
  lastStatus: RefreshStatus;
  lastAttemptTime?: string;
  lastSuccessTime?: string;
  errorCode?: string;
  lastRefreshType?: string;
  scheduleSummary?: string;
  scheduleOverdue?: boolean;
  recentDurationsMin?: number[];
}

export interface FleetSnapshot {
  generatedAt: string;
  workspaceCount: number;
  refreshables: Refreshable[];
  partialFailure: boolean;
  failedWorkspaces: Array<{ id: string; name: string; error: string }>;
}

export interface TokenProvider {
  getAccessToken(): Promise<string>;
}

export type FleetProgressFn = (progress: number, itemsChecked: number) => void;

export interface DataSource {
  getFleetSnapshot(force?: boolean, onProgress?: FleetProgressFn): Promise<FleetSnapshot>;
}
