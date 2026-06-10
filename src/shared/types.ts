// IPCResponse and TokenResult live in ipc-types.ts (next to the ElectronAPI
// surface they shape). Re-exported here as type-only so `from '../shared/types'`
// import sites keep working; the re-export is erased at compile time, so it
// introduces no runtime import cycle.
export type { IPCResponse, TokenResult } from './ipc-types';

// ============================================
// USER & AUTH TYPES
// ============================================

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
      /**
       * True when this login resolved to the SAME account that was
       * already signed in (no account switch). Lets the renderer / main decide
       * whether to preserve or clear per-account state (e.g. usage history).
       */
      reusedPreviousAccount: boolean;
    }
  | { success: false; error: string };

// ============================================
// POWER BI TYPES
// ============================================

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
  lastOpened?: string; // ISO date string
  openCount?: number;
  /**
   * Home-account id the record belongs to. Optional for backward
   * compatibility with records persisted before per-account scoping.
   */
  accountId?: string;
}

export interface EmbedToken {
  token: string;
  tokenId: string;
  expiration: string;
}

export interface DatasetRefreshInfo {
  lastRefreshTime?: string; // ISO date string
  lastRefreshStatus?: 'Unknown' | 'Completed' | 'Failed' | 'Disabled';
}

/**
 * Aggregate data-freshness for a piece of content (report / app / dashboard).
 * Both times are the STALEST (oldest) across the content's datasets/dataflows —
 * a conservative "is anything behind?" signal that never overstates freshness.
 */
export interface DataFreshness {
  /** Stalest dataset last-refresh time across the content's dataset(s), ISO or null. */
  datasetRefreshTime: string | null;
  /** Stalest upstream-dataflow last-SUCCESS completion time, ISO or null. */
  dataflowRefreshTime: string | null;
  /** How many datasets were considered (>1 → caller shows an "Oldest data" label). */
  datasetCount: number;
}

// ============================================
// APP SETTINGS TYPES
// ============================================

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  sidebarCollapsed: boolean;
  slideshowInterval: number;
  slideshowMode: 'pages' | 'bookmarks' | 'both';
  autoStartSlideshow: boolean;
  autoStartReportId?: string;
  autoRefreshEnabled: boolean;
  autoRefreshInterval: number; // in minutes (1-120)
  /**
   * Launch-time auto-start behavior.
   * - 'off'    — normal startup, show the home screen.
   * - 'report' — open the report identified by autoStartReportId on launch.
   * - 'app'    — open the Power BI app identified by autoStartAppId on launch.
   */
  autoStartMode: 'off' | 'report' | 'app';
  /** Workspace GUID of the auto-start report (paired with autoStartReportId). */
  autoStartWorkspaceId?: string;
  /** Launch-time auto-start of a specific Power BI app (paired with autoStartMode 'app'). */
  autoStartAppId?: string;
  /**
   * Usage-history retention policy on logout.
   * - 'always'           — clear usage data every logout.
   * - 'never'            — keep usage data across logouts (default).
   * - 'on-shared-machine'— clear only when the machine is flagged as shared.
   */
  usageClearOnLogout: 'always' | 'never' | 'on-shared-machine';
}

// ============================================
// Insights ("one-pager" data health & access view)
// ============================================

/** Refresh health of a single dataset or dataflow, scoped to what the
 *  signed-in user's token can see. */
export interface InsightsRefreshable {
  kind: 'dataset' | 'dataflow';
  id: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
  /** Dataset owner (configuredBy), when the API exposes it. */
  configuredBy?: string;
  /**
   * - 'Completed'  — last attempt published data.
   * - 'Failed'     — last attempt failed (lastSuccessTime may still be set
   *                  from an earlier attempt).
   * - 'InProgress' — a refresh is running now.
   * - 'Cancelled'  — last attempt was cancelled.
   * - 'Disabled'   — the dataset is not refreshable (e.g. DirectQuery/Live).
   * - 'Never'      — refreshable but no refresh history exists.
   */
  lastStatus: 'Completed' | 'Failed' | 'InProgress' | 'Cancelled' | 'Disabled' | 'Never';
  /** Most recent attempt end (or start, while in progress). ISO-8601. */
  lastAttemptTime?: string;
  /** Most recent SUCCESSFUL completion. ISO-8601. */
  lastSuccessTime?: string;
  /** Power BI error code from the last failed attempt, when present. */
  errorCode?: string;
}

/** Who can see a workspace. users is null when the caller may not list them
 *  (e.g. viewer-only access) — render as "not visible", not as empty. */
export interface InsightsWorkspaceAccess {
  workspaceId: string;
  workspaceName: string;
  users: Array<{
    name: string;
    email?: string;
    role: string;
    /** 'User' | 'Group' | 'App' principal. */
    type: string;
  }> | null;
}

export interface InsightsSnapshot {
  /** When this snapshot was assembled (ISO-8601). */
  generatedAt: string;
  /** True when served from the in-memory cache rather than fetched fresh. */
  fromCache: boolean;
  workspaceCount: number;
  reportCount: number;
  dashboardCount: number;
  refreshables: InsightsRefreshable[];
  access: InsightsWorkspaceAccess[];
  partialFailure: boolean;
  failedWorkspaces: Array<{ id: string; name: string; error: string }>;
}
