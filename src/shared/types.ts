// ARCH-S3: IPCResponse and TokenResult now live in ipc-types.ts (next to the
// ElectronAPI surface they shape). Re-exported here as type-only so the many
// existing `from '../shared/types'` import sites keep working. The re-export is
// erased at compile time, so it introduces no runtime import cycle.
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
       * BEH-B1: true when this login resolved to the SAME account that was
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
   * BEH-B3: home-account id the record belongs to. Optional for backward
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
  autoRefreshInterval: number; // in minutes (1-60)
  /**
   * PROD-B2: launch-time auto-start behavior.
   * - 'off'    — normal startup, show the home screen.
   * - 'report' — open the report identified by autoStartReportId on launch.
   * - 'app'    — open the Power BI app identified by autoStartAppId on launch.
   */
  autoStartMode: 'off' | 'report' | 'app';
  /** PROD-B2: workspace GUID of the auto-start report (paired with autoStartReportId). */
  autoStartWorkspaceId?: string;
  /** Launch-time auto-start of a specific Power BI app (paired with autoStartMode 'app'). */
  autoStartAppId?: string;
  /**
   * BEH-B3: usage-history retention policy on logout.
   * - 'always'           — clear usage data every logout.
   * - 'never'            — keep usage data across logouts (default).
   * - 'on-shared-machine'— clear only when the machine is flagged as shared.
   */
  usageClearOnLogout: 'always' | 'never' | 'on-shared-machine';
}
