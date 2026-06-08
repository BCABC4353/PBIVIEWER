import type {
  AuthResult,
  UserInfo,
  Workspace,
  Report,
  Dashboard,
  App,
  ContentItem,
  EmbedToken,
  DatasetRefreshInfo,
  AppSettings,
} from './types';

// ============================================
// IPC ENVELOPE TYPES (ARCH-S3)
// Moved here from types.ts so the IPC contract lives next to the API surface
// it shapes. Re-exported from types.ts for backward compatibility.
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

/**
 * ARCH-S6: config the App webview needs to mount with the correct session.
 * `partition` is the Electron <webview> partition the App viewer mounts with
 * (null in dev so the default session is used, PARTITION_NAME in production).
 */
export interface AppWebviewConfig {
  partition: string | null;
  /**
   * Clean Chrome user-agent for the App <webview>. The Electron/app-name tokens
   * are stripped so Microsoft 365 / Power BI treat the embedded browser as
   * supported and allow silent SSO (no password re-prompt / "out of date browser").
   */
  userAgent: string;
}

// Typed IPC API surface — the single source of truth for the preload bridge and renderer.
// Every method is explicitly typed so that no `as` casts are needed in consumers.
export interface ElectronAPI {
  auth: {
    login: () => Promise<IPCResponse<AuthResult>>;
    logout: () => Promise<IPCResponse<void>>;
    getUser: () => Promise<IPCResponse<UserInfo | null>>;
    getAccessToken: () => Promise<IPCResponse<TokenResult>>;
    isAuthenticated: () => Promise<IPCResponse<boolean>>;
    validateToken: () => Promise<IPCResponse<boolean>>;
    // PROD-B1: account switch — same return shape as login().
    switchAccount: () => Promise<IPCResponse<AuthResult>>;
  };

  content: {
    getWorkspaces: () => Promise<IPCResponse<Workspace[]>>;
    getReports: (workspaceId: string) => Promise<IPCResponse<Report[]>>;
    getDashboards: (workspaceId: string) => Promise<IPCResponse<Dashboard[]>>;
    getDashboard: (workspaceId: string, dashboardId: string) => Promise<IPCResponse<Dashboard>>;
    getApps: () => Promise<IPCResponse<App[]>>;
    getApp: (appId: string) => Promise<IPCResponse<App>>;
    getAppReports: (appId: string) => Promise<IPCResponse<Report[]>>;
    getAppDashboards: (appId: string) => Promise<IPCResponse<Dashboard[]>>;
    getEmbedToken: (reportId: string, workspaceId: string) => Promise<IPCResponse<EmbedToken>>;
    exportReportToPdf: (
      reportId: string,
      workspaceId: string,
      pageName?: string,
      bookmarkState?: string,
      filePath?: string,
    ) => Promise<IPCResponse<{ path: string }>>;
    getDatasetRefreshInfo: (datasetId: string, workspaceId?: string) => Promise<IPCResponse<DatasetRefreshInfo>>;
    // PROD-S9: dashboard freshness — stalest lastRefreshTime across tile datasets.
    getDashboardDataFreshness: (dashboardId: string, workspaceId: string) => Promise<IPCResponse<DatasetRefreshInfo>>;
    getAllItems: () => Promise<IPCResponse<{
      workspaces: Workspace[];
      reports: Report[];
      dashboards: Dashboard[];
      partialFailure: boolean;
      failedWorkspaces: Array<{ id: string; name: string; error: string }>;
    }>>;
  };

  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    setTitleBarOverlay: (options: { color: string; symbolColor: string }) => Promise<void>;
  };

  settings: {
    get: () => Promise<IPCResponse<AppSettings>>;
    update: (updates: Partial<AppSettings>) => Promise<IPCResponse<AppSettings>>;
    reset: () => Promise<IPCResponse<AppSettings>>;
  };

  usage: {
    recordOpen: (item: {
      id: string;
      name: string;
      type: 'report' | 'dashboard';
      workspaceId: string;
      workspaceName: string;
      /** BEH-B3: homeAccountId from MSAL — scopes the record to the signed-in user. */
      accountId?: string;
    }) => Promise<IPCResponse<void>>;
    /** BEH-B3: pass the signed-in homeAccountId to scope results to that user. */
    getRecent: (accountId?: string) => Promise<IPCResponse<ContentItem[]>>;
    /** BEH-B3: pass the signed-in homeAccountId to scope results to that user. */
    getFrequent: (accountId?: string) => Promise<IPCResponse<ContentItem[]>>;
    clear: () => Promise<IPCResponse<void>>;
    /** NEW-PROD-5: permanently remove a single dead item from the usage store. */
    remove: (itemId: string) => Promise<IPCResponse<void>>;
  };

  export: {
    choosePdfPath: () => Promise<IPCResponse<{ path: string }>>;
    currentViewToPdf: (options?: {
      bounds?: { x: number; y: number; width: number; height: number };
      insets?: { top?: number; right?: number; bottom?: number; left?: number };
      filePath?: string;
    }) => Promise<IPCResponse<{ path: string }>>;
  };

  app: {
    getAppWebviewConfig: () => Promise<AppWebviewConfig>;
    getVersion: () => Promise<string>;
    /** Opens the bundled offline user guide (HTML) in the default browser. */
    openUserGuide: () => Promise<IPCResponse<void>>;
  };

  log: {
    openFolder: () => Promise<IPCResponse<void>>;
  };

  // PROD-S1: kiosk power management for unattended wall displays.
  kiosk: {
    /**
     * Start an Electron powerSaveBlocker('prevent-display-sleep'). Idempotent —
     * a second call while a blocker is already active is a no-op (no leak).
     * Resolves true once a blocker is active.
     */
    preventDisplaySleep: () => Promise<IPCResponse<boolean>>;
    /**
     * Stop the active powerSaveBlocker, if any. Idempotent — safe to call when
     * no blocker is active. Resolves false once no blocker is active.
     */
    allowDisplaySleep: () => Promise<IPCResponse<boolean>>;
  };
}
