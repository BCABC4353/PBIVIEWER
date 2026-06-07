import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '../shared/ipc-types';
import type { AppSettings } from '../shared/types';

// Type-safe API exposed to renderer.
// The return type annotations reference ElectronAPI so that `ipcRenderer.invoke`
// (which returns Promise<any>) is narrowed to the correct typed response.
const electronAPI: ElectronAPI = {
  auth: {
    login: () => ipcRenderer.invoke('auth:login'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getUser: () => ipcRenderer.invoke('auth:get-user'),
    getAccessToken: () => ipcRenderer.invoke('auth:get-token'),
    isAuthenticated: () => ipcRenderer.invoke('auth:is-authenticated'),
    validateToken: () => ipcRenderer.invoke('auth:validate-token'),
  },

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
      filePath?: string,
    ) => ipcRenderer.invoke('content:export-report-pdf', reportId, workspaceId, pageName, bookmarkState, filePath),
    getDatasetRefreshInfo: (datasetId: string, workspaceId?: string) =>
      ipcRenderer.invoke('content:get-dataset-refresh-info', datasetId, workspaceId),
    getAllItems: () => ipcRenderer.invoke('content:get-all-items'),
  },

  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    // UX-B1: fire-and-forget — send (no reply channel) matches ipcMain.on.
    // Returns a resolved Promise<void> to satisfy the ElectronAPI interface
    // without awaiting a response from the main process.
    setTitleBarOverlay: (options: { color: string; symbolColor: string }) => {
      ipcRenderer.send('window:set-title-bar-overlay', options);
      return Promise.resolve();
    },
  },

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (updates: Partial<AppSettings>) =>
      ipcRenderer.invoke('settings:update', updates),
    reset: () => ipcRenderer.invoke('settings:reset'),
  },

  usage: {
    recordOpen: (item: {
      id: string;
      name: string;
      type: 'report' | 'dashboard';
      workspaceId: string;
      workspaceName: string;
      accountId?: string;
    }) => ipcRenderer.invoke('usage:record-open', item),
    // BEH-B3: forward optional accountId so the main-process handler can scope
    // results to the signed-in user; undefined omits the arg (backward-compat).
    getRecent: (accountId?: string) => ipcRenderer.invoke('usage:get-recent', accountId),
    getFrequent: (accountId?: string) => ipcRenderer.invoke('usage:get-frequent', accountId),
    clear: () => ipcRenderer.invoke('usage:clear'),
  },

  export: {
    choosePdfPath: () => ipcRenderer.invoke('export:choose-pdf-path'),
    currentViewToPdf: (options?: {
      bounds?: { x: number; y: number; width: number; height: number };
      insets?: { top?: number; right?: number; bottom?: number; left?: number };
      filePath?: string;
    }) => ipcRenderer.invoke('export:current-view-pdf', options),
  },

  log: {
    openFolder: () => ipcRenderer.invoke('log:open-folder'),
  },

  app: {
    getPartitionName: () => ipcRenderer.invoke('app:get-partition-name'),
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    // PROD-S2: opens the releases page in the default browser; returns
    // { currentVersion, releasesUrl } on success.
    checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
