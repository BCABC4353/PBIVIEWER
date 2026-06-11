import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '../shared/ipc-types';
import type { AppSettings } from '../shared/types';

const electronAPI: ElectronAPI = {
  auth: {
    login: () => ipcRenderer.invoke('auth:login'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getUser: () => ipcRenderer.invoke('auth:get-user'),
    getAccessToken: () => ipcRenderer.invoke('auth:get-token'),
    isAuthenticated: () => ipcRenderer.invoke('auth:is-authenticated'),
    validateToken: () => ipcRenderer.invoke('auth:validate-token'),
    switchAccount: () => ipcRenderer.invoke('auth:switch-account'),
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
    resolveAppReportDataset: (appId: string, reportId: string) =>
      ipcRenderer.invoke('content:resolve-app-report-dataset', appId, reportId),
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
    getDashboardDataFreshness: (dashboardId: string, workspaceId: string) =>
      ipcRenderer.invoke('content:get-dashboard-data-freshness', dashboardId, workspaceId),
    getDataFreshness: (
      workspaceId: string,
      datasetIds: Array<string | { datasetId: string; workspaceId: string }>,
      dashboardId?: string,
    ) => ipcRenderer.invoke('content:get-data-freshness', workspaceId, datasetIds, dashboardId),
    getAllItems: () => ipcRenderer.invoke('content:get-all-items'),
    getInsights: (force?: boolean) => ipcRenderer.invoke('content:get-insights', force),
    getAdminInsights: (days?: number, force?: boolean) =>
      ipcRenderer.invoke('content:get-admin-insights', days, force),
  },

  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
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
    getRecent: (accountId?: string) => ipcRenderer.invoke('usage:get-recent', accountId),
    getFrequent: (accountId?: string) => ipcRenderer.invoke('usage:get-frequent', accountId),
    clear: () => ipcRenderer.invoke('usage:clear'),
    remove: (itemId: string) => ipcRenderer.invoke('usage:remove', itemId),
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

  beacon: {
    report: (event: { code: string; httpStatus?: number; itemName?: string; context?: string }) =>
      ipcRenderer.invoke('beacon:report', event),
  },

  app: {
    getAppWebviewConfig: () => ipcRenderer.invoke('app:get-app-webview-config'),
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    openUserGuide: () => ipcRenderer.invoke('app:open-user-guide'),
  },

  kiosk: {
    preventDisplaySleep: () => ipcRenderer.invoke('kiosk:prevent-display-sleep'),
    allowDisplaySleep: () => ipcRenderer.invoke('kiosk:allow-display-sleep'),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
