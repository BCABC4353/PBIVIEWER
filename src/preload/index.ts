import { contextBridge, ipcRenderer } from 'electron';

// Type-safe API exposed to renderer
const electronAPI = {
  // Authentication
  auth: {
    login: () => ipcRenderer.invoke('auth:login'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getUser: () => ipcRenderer.invoke('auth:get-user'),
    getAccessToken: () => ipcRenderer.invoke('auth:get-token'),
    isAuthenticated: () => ipcRenderer.invoke('auth:is-authenticated'),
    validateToken: () => ipcRenderer.invoke('auth:validate-token'),
  },

  // Power BI Content
  content: {
    getWorkspaces: () => ipcRenderer.invoke('content:get-workspaces'),
    getReports: (workspaceId: string) =>
      ipcRenderer.invoke('content:get-reports', workspaceId),
    getDashboards: (workspaceId: string) =>
      ipcRenderer.invoke('content:get-dashboards', workspaceId),
    getDashboard: (workspaceId: string, dashboardId: string) =>
      ipcRenderer.invoke('content:get-dashboard', workspaceId, dashboardId),
    getApps: () => ipcRenderer.invoke('content:get-apps'),
    getApp: (appId: string) => ipcRenderer.invoke('content:get-app', appId),
    getAppReports: (appId: string) =>
      ipcRenderer.invoke('content:get-app-reports', appId),
    getAppDashboards: (appId: string) =>
      ipcRenderer.invoke('content:get-app-dashboards', appId),
    getEmbedToken: (reportId: string, workspaceId: string) =>
      ipcRenderer.invoke('content:get-embed-token', reportId, workspaceId),
    exportReportToPdf: (
      reportId: string,
      workspaceId: string,
      pageName?: string,
      bookmarkState?: string,
      filePath?: string
    ) => ipcRenderer.invoke('content:export-report-pdf', reportId, workspaceId, pageName, bookmarkState, filePath),
    getDatasetRefreshInfo: (datasetId: string, workspaceId?: string) =>
      ipcRenderer.invoke('content:get-dataset-refresh-info', datasetId, workspaceId),
    getAllItems: () => ipcRenderer.invoke('content:get-all-items'),
    getRecent: () => ipcRenderer.invoke('content:get-recent'),
  },

  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    setTitleBarOverlay: (options: { color: string; symbolColor: string }) =>
      ipcRenderer.invoke('window:set-title-bar-overlay', options),
  },

  // Settings
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (updates: Record<string, unknown>) =>
      ipcRenderer.invoke('settings:update', updates),
    reset: () => ipcRenderer.invoke('settings:reset'),
  },

  // Usage Tracking
  usage: {
    recordOpen: (item: {
      id: string;
      name: string;
      type: 'report' | 'dashboard';
      workspaceId: string;
      workspaceName: string;
    }) => ipcRenderer.invoke('usage:record-open', item),
    getRecent: () => ipcRenderer.invoke('usage:get-recent'),
    getFrequent: () => ipcRenderer.invoke('usage:get-frequent'),
    clear: () => ipcRenderer.invoke('usage:clear'),
  },

  // Export
  export: {
    choosePdfPath: () => ipcRenderer.invoke('export:choose-pdf-path'),
    currentViewToPdf: (options?: {
      bounds?: { x: number; y: number; width: number; height: number };
      insets?: { top?: number; right?: number; bottom?: number; left?: number };
      filePath?: string;
    }) => ipcRenderer.invoke('export:current-view-pdf', options),
  },

  // App info
  app: {
    getPartitionName: () => ipcRenderer.invoke('app:get-partition-name'),
    getVersion: () => ipcRenderer.invoke('app:get-version'),
  },
};

// Expose to renderer
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type declaration for renderer
export type ElectronAPI = typeof electronAPI;
