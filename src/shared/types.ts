export type { IPCResponse, TokenResult } from './ipc-types';


export interface UserInfo {
  id: string;
  displayName: string;
  email: string;
  profilePicture?: string;
}

export type AuthResult =
  | {
      success: true;
      user: UserInfo;
      reusedPreviousAccount: boolean;
    }
  | { success: false; error: string };


export interface Workspace {
  id: string;
  name: string;
  isReadOnly: boolean;
  type: 'Workspace' | 'PersonalGroup';
}

export interface Report {
  id: string;
  name: string;
  workspaceId: string;
  embedUrl: string;
  datasetId: string;
  reportType: 'PowerBIReport' | 'PaginatedReport';
  originalReportObjectId?: string;
}

export interface Dashboard {
  id: string;
  name: string;
  workspaceId: string;
  embedUrl: string;
  isReadOnly: boolean;
}

export interface App {
  id: string;
  name: string;
  description?: string;
  publishedBy: string;
  lastUpdate: string;
  workspaceId?: string;
}

export interface ContentItem {
  id: string;
  name: string;
  type: 'report' | 'dashboard';
  workspaceId: string;
  workspaceName: string;
  lastOpened?: string;
  openCount?: number;
  accountId?: string;
}

export interface EmbedToken {
  token: string;
  tokenId: string;
  expiration: string;
}

export interface DatasetRefreshInfo {
  lastRefreshTime?: string;
  lastRefreshStatus?: 'Unknown' | 'Completed' | 'Failed' | 'Disabled';
}

export interface DatasetWorkspaceRef {
  datasetId: string;
  workspaceId: string;
}

export interface DataFreshness {
  datasetRefreshTime: string | null;
  dataflowRefreshTime: string | null;
  datasetCount: number;
}


export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  sidebarCollapsed: boolean;
  slideshowInterval: number;
  slideshowMode: 'pages' | 'bookmarks' | 'both';
  autoStartSlideshow: boolean;
  autoStartReportId?: string;
  autoRefreshEnabled: boolean;
  autoRefreshInterval: number;
  autoStartMode: 'off' | 'report' | 'app';
  autoStartWorkspaceId?: string;
  autoStartAppId?: string;
  usageClearOnLogout: 'always' | 'never' | 'on-shared-machine';
}


export interface InsightsRefreshable {
  kind: 'dataset' | 'dataflow';
  id: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
  configuredBy?: string;
  lastStatus: 'Completed' | 'Failed' | 'InProgress' | 'Cancelled' | 'Disabled' | 'Never';
  lastAttemptTime?: string;
  lastSuccessTime?: string;
  errorCode?: string;
  lastRefreshType?: string;
  scheduleSummary?: string;
  scheduleOverdue?: boolean;
  recentRuns?: Array<{ ok: boolean; endTime?: string; errorCode?: string; errorDetail?: string }>;
  upstreamDataflowIds?: string[];
}

export interface InsightsWorkspaceAccess {
  workspaceId: string;
  workspaceName: string;
  users: Array<{
    name: string;
    email?: string;
    role: string;
    type: string;
  }> | null;
}

export interface InsightsSnapshot {
  generatedAt: string;
  fromCache: boolean;
  workspaceCount: number;
  reportCount: number;
  dashboardCount: number;
  refreshables: InsightsRefreshable[];
  reports: Array<{ id: string; name: string; workspaceId: string; datasetId?: string }>;
  access: InsightsWorkspaceAccess[];
  partialFailure: boolean;
  failedWorkspaces: Array<{ id: string; name: string; error: string }>;
}


export interface AdminAppAudience {
  appId: string;
  appName: string;
  users: Array<{ name: string; email?: string; accessRight: string; type: string }> | null;
}

export interface AdminActivityUser {
  user: string;
  views: number;
  lastActive: string;
}

export interface AdminActivityItem {
  name: string;
  views: number;
  uniqueUsers: number;
  lastViewed: string;
}

export interface AdminInsights {
  generatedAt: string;
  fromCache: boolean;
  days: number;
  activityByUser: AdminActivityUser[];
  activityByItem: AdminActivityItem[];
  appAudiences: AdminAppAudience[];
  failedDays: number;
  truncated?: boolean;
}
