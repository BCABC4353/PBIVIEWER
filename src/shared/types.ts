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
  | { success: true; user: UserInfo }
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
  lastAccessed?: string;
  lastOpened?: string; // ISO date string
  openCount?: number;
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
// IPC TYPES
// ============================================

export type IPCResponse<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: {
        code: string;
        /** Raw message — fine for logs, may contain upstream API details */
        message: string;
        /**
         * Friendly, user-safe message derived from the HTTP status code.
         * Renderer should prefer this when surfacing errors to the user;
         * fall back to `message` only if `userMessage` is absent.
         */
        userMessage?: string;
      };
    };

/**
 * Result of acquiring an access token. The expiresOn field carries MSAL's
 * authoritative expiry so callers (powerbi-client, embed refresh) can schedule
 * proactive refresh instead of guessing +1h from now.
 */
export interface TokenResult {
  accessToken: string;
  /** ISO 8601 timestamp; null if MSAL did not provide one (callers fall back to +1h). */
  expiresOn: string | null;
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
}
