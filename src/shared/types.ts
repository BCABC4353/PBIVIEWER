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
   */
  autoStartMode: 'off' | 'report';
  /** PROD-B2: workspace GUID of the auto-start report (paired with autoStartReportId). */
  autoStartWorkspaceId?: string;
  /**
   * BEH-B3: usage-history retention policy on logout.
   * - 'always'           — clear usage data every logout.
   * - 'never'            — keep usage data across logouts (default).
   * - 'on-shared-machine'— clear only when the machine is flagged as shared.
   */
  usageClearOnLogout: 'always' | 'never' | 'on-shared-machine';
}
