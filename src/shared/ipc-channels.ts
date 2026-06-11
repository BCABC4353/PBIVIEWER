
export const IPC_CHANNELS = {
  auth: {
    login: 'auth:login',
    logout: 'auth:logout',
    getUser: 'auth:get-user',
    getToken: 'auth:get-token',
    isAuthenticated: 'auth:is-authenticated',
    validateToken: 'auth:validate-token',
    switchAccount: 'auth:switch-account',
  },
  content: {
    getWorkspaces: 'content:get-workspaces',
    getReports: 'content:get-reports',
    getDashboards: 'content:get-dashboards',
    getDashboard: 'content:get-dashboard',
    getApps: 'content:get-apps',
    getApp: 'content:get-app',
    getAppReports: 'content:get-app-reports',
    getAppDashboards: 'content:get-app-dashboards',
    resolveAppReportDataset: 'content:resolve-app-report-dataset',
    getEmbedToken: 'content:get-embed-token',
    exportReportPdf: 'content:export-report-pdf',
    getDatasetRefreshInfo: 'content:get-dataset-refresh-info',
    getDashboardDataFreshness: 'content:get-dashboard-data-freshness',
    getDataFreshness: 'content:get-data-freshness',
    getAllItems: 'content:get-all-items',
    getInsights: 'content:get-insights',
    getAdminInsights: 'content:get-admin-insights',
  },
  window: {
    minimize: 'window:minimize',
    maximize: 'window:maximize',
    close: 'window:close',
    isMaximized: 'window:is-maximized',
    setTitleBarOverlay: 'window:set-title-bar-overlay',
  },
  settings: {
    get: 'settings:get',
    update: 'settings:update',
    reset: 'settings:reset',
  },
  usage: {
    recordOpen: 'usage:record-open',
    getRecent: 'usage:get-recent',
    getFrequent: 'usage:get-frequent',
    clear: 'usage:clear',
    remove: 'usage:remove',
  },
  export: {
    choosePdfPath: 'export:choose-pdf-path',
    currentViewPdf: 'export:current-view-pdf',
  },
  app: {
    getAppWebviewConfig: 'app:get-app-webview-config',
    getVersion: 'app:get-version',
    openUserGuide: 'app:open-user-guide',
  },
  log: {
    openFolder: 'log:open-folder',
  },
  beacon: {
    report: 'beacon:report',
  },
  kiosk: {
    preventDisplaySleep: 'kiosk:prevent-display-sleep',
    allowDisplaySleep: 'kiosk:allow-display-sleep',
  },
} as const;

type ChannelValues<T> = T extends string ? T : T extends object ? ChannelValues<T[keyof T]> : never;
export type IpcChannel = ChannelValues<typeof IPC_CHANNELS>;
