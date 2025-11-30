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
  },

  // Power BI Content
  content: {
    getWorkspaces: () => ipcRenderer.invoke('content:get-workspaces'),
    getReports: (workspaceId: string) =>
      ipcRenderer.invoke('content:get-reports', workspaceId),
    getDashboards: (workspaceId: string) =>
      ipcRenderer.invoke('content:get-dashboards', workspaceId),
    getApps: () => ipcRenderer.invoke('content:get-apps'),
    getApp: (appId: string) => ipcRenderer.invoke('content:get-app', appId),
    getAppReports: (appId: string) =>
      ipcRenderer.invoke('content:get-app-reports', appId),
    getAppDashboards: (appId: string) =>
      ipcRenderer.invoke('content:get-app-dashboards', appId),
    getEmbedToken: (reportId: string, workspaceId: string) =>
      ipcRenderer.invoke('content:get-embed-token', reportId, workspaceId),
    getRecent: () => ipcRenderer.invoke('content:get-recent'),
    getFavorites: () => ipcRenderer.invoke('content:get-favorites'),
    addFavorite: (itemId: string, itemType: string) =>
      ipcRenderer.invoke('content:add-favorite', itemId, itemType),
    removeFavorite: (itemId: string) =>
      ipcRenderer.invoke('content:remove-favorite', itemId),
    isFavorite: (itemId: string) =>
      ipcRenderer.invoke('content:is-favorite', itemId),
  },

  // Cache
  cache: {
    getThumbnail: (itemId: string, itemType: string, workspaceId: string) =>
      ipcRenderer.invoke('cache:get-thumbnail', itemId, itemType, workspaceId),
    getOfflineContent: () => ipcRenderer.invoke('cache:get-offline'),
    saveOfflineContent: (items: unknown[]) =>
      ipcRenderer.invoke('cache:save-offline', items),
    getLastSync: () => ipcRenderer.invoke('cache:get-last-sync'),
    getStats: () => ipcRenderer.invoke('cache:get-stats'),
    clearCache: () => ipcRenderer.invoke('cache:clear'),
  },

  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
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
};

// Expose to renderer
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type declaration for renderer
export type ElectronAPI = typeof electronAPI;
