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
  IPCResponse,
} from './types';

// Typed IPC API surface — the single source of truth for the preload bridge and renderer.
// Every method is explicitly typed so that no `as` casts are needed in consumers.
export interface ElectronAPI {
  auth: {
    login: () => Promise<IPCResponse<AuthResult>>;
    logout: () => Promise<IPCResponse<void>>;
    getUser: () => Promise<IPCResponse<UserInfo | null>>;
    getAccessToken: () => Promise<IPCResponse<string>>;
    isAuthenticated: () => Promise<IPCResponse<boolean>>;
    validateToken: () => Promise<IPCResponse<boolean>>;
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
    getAllItems: () => Promise<IPCResponse<{ reports: Report[]; dashboards: Dashboard[] }>>;
    getRecent: () => Promise<IPCResponse<ContentItem[]>>;
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
    }) => Promise<IPCResponse<void>>;
    getRecent: () => Promise<IPCResponse<ContentItem[]>>;
    getFrequent: () => Promise<IPCResponse<ContentItem[]>>;
    clear: () => Promise<IPCResponse<void>>;
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
    getPartitionName: () => Promise<string | null>;
    getVersion: () => Promise<string>;
  };
}
