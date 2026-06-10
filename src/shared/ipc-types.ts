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
  DataFreshness,
  AppSettings,
  InsightsSnapshot,
  AdminInsights,
} from './types';

// IPC envelope types — re-exported from types.ts for backward compatibility.

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
 * Config the App webview needs to mount with the correct session.
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
    // Account switch — same return shape as login().
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
    // Dashboard freshness — stalest lastRefreshTime across tile datasets.
    getDashboardDataFreshness: (dashboardId: string, workspaceId: string) => Promise<IPCResponse<DatasetRefreshInfo>>;
    /** Dataset refresh + upstream dataflow last-success times. Pass datasetIds for
     *  a report/app, or a dashboardId to derive them from the dashboard's tiles. */
    getDataFreshness: (
      workspaceId: string,
      datasetIds: string[],
      dashboardId?: string,
    ) => Promise<IPCResponse<DataFreshness>>;
    getAllItems: () => Promise<IPCResponse<{
      workspaces: Workspace[];
      reports: Report[];
      dashboards: Dashboard[];
      partialFailure: boolean;
      failedWorkspaces: Array<{ id: string; name: string; error: string }>;
    }>>;
    /** Insights one-pager snapshot; force=true bypasses the 5-minute cache. */
    getInsights: (force?: boolean) => Promise<IPCResponse<InsightsSnapshot>>;
    /** Admin tier (Fabric admin only): App audiences + who-uses-what activity. */
    getAdminInsights: (days?: number, force?: boolean) => Promise<IPCResponse<AdminInsights>>;
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
      /** HomeAccountId from MSAL — scopes the record to the signed-in user. */
      accountId?: string;
    }) => Promise<IPCResponse<void>>;
    /** Pass the signed-in homeAccountId to scope results to that user. */
    getRecent: (accountId?: string) => Promise<IPCResponse<ContentItem[]>>;
    /** Pass the signed-in homeAccountId to scope results to that user. */
    getFrequent: (accountId?: string) => Promise<IPCResponse<ContentItem[]>>;
    clear: () => Promise<IPCResponse<void>>;
    /** Permanently remove a single dead item from the usage store. */
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

  beacon: {
    report: (event: { code: string; httpStatus?: number; itemName?: string; context?: string }) => Promise<IPCResponse<void>>;
  };

  // Kiosk power management for unattended wall displays.
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
