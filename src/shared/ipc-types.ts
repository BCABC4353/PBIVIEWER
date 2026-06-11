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
  DatasetWorkspaceRef,
  DataFreshness,
  AppSettings,
  InsightsSnapshot,
  AdminInsights,
} from './types';


export type IPCResponse<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: {
        code: string;
        message: string;
        userMessage?: string;
      };
    };

export interface TokenResult {
  accessToken: string;
  expiresOn: string | null;
}

export interface AppWebviewConfig {
  partition: string | null;
  userAgent: string;
}

export interface ElectronAPI {
  auth: {
    login: () => Promise<IPCResponse<AuthResult>>;
    logout: () => Promise<IPCResponse<void>>;
    getUser: () => Promise<IPCResponse<UserInfo | null>>;
    getAccessToken: () => Promise<IPCResponse<TokenResult>>;
    isAuthenticated: () => Promise<IPCResponse<boolean>>;
    validateToken: () => Promise<IPCResponse<boolean>>;
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
    resolveAppReportDataset: (
      appId: string,
      reportId: string,
    ) => Promise<IPCResponse<DatasetWorkspaceRef | null>>;
    getEmbedToken: (reportId: string, workspaceId: string) => Promise<IPCResponse<EmbedToken>>;
    exportReportToPdf: (
      reportId: string,
      workspaceId: string,
      pageName?: string,
      bookmarkState?: string,
      filePath?: string,
    ) => Promise<IPCResponse<{ path: string }>>;
    getDatasetRefreshInfo: (datasetId: string, workspaceId?: string) => Promise<IPCResponse<DatasetRefreshInfo>>;
    getDashboardDataFreshness: (dashboardId: string, workspaceId: string) => Promise<IPCResponse<DatasetRefreshInfo>>;
    getDataFreshness: (
      workspaceId: string,
      datasetIds: Array<string | DatasetWorkspaceRef>,
      dashboardId?: string,
    ) => Promise<IPCResponse<DataFreshness>>;
    getAllItems: () => Promise<IPCResponse<{
      workspaces: Workspace[];
      reports: Report[];
      dashboards: Dashboard[];
      partialFailure: boolean;
      failedWorkspaces: Array<{ id: string; name: string; error: string }>;
    }>>;
    getInsights: (force?: boolean) => Promise<IPCResponse<InsightsSnapshot>>;
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
      accountId?: string;
    }) => Promise<IPCResponse<void>>;
    getRecent: (accountId?: string) => Promise<IPCResponse<ContentItem[]>>;
    getFrequent: (accountId?: string) => Promise<IPCResponse<ContentItem[]>>;
    clear: () => Promise<IPCResponse<void>>;
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
    openUserGuide: () => Promise<IPCResponse<void>>;
  };

  log: {
    openFolder: () => Promise<IPCResponse<void>>;
  };

  beacon: {
    report: (event: { code: string; httpStatus?: number; itemName?: string; context?: string }) => Promise<IPCResponse<void>>;
  };

  kiosk: {
    preventDisplaySleep: () => Promise<IPCResponse<boolean>>;
    allowDisplaySleep: () => Promise<IPCResponse<boolean>>;
  };
}
