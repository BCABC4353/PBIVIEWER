/** Core domain types — pure TS, no React Native imports (fully unit-testable). */

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
  /** 'Scheduled' | 'OnDemand' | 'ViaApi' (Power Automate / API). Datasets only. */
  lastRefreshType?: string;
  scheduleSummary?: string;
  scheduleOverdue?: boolean;
  /** Durations (minutes) of recent successful refreshes, oldest→newest —
   *  fuel for the native duration sparkline (no Microsoft visuals). */
  recentDurationsMin?: number[];
}

export interface FleetSnapshot {
  generatedAt: string;
  workspaceCount: number;
  refreshables: Refreshable[];
  partialFailure: boolean;
  failedWorkspaces: Array<{ id: string; name: string; error: string }>;
}

/** Token source — injected so the client is testable and auth is swappable. */
export interface TokenProvider {
  getAccessToken(): Promise<string>;
}

export interface DataSource {
  getFleetSnapshot(force?: boolean): Promise<FleetSnapshot>;
}
