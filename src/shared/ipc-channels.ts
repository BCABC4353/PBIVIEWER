// Typed IPC channel-name map — single source of truth for every IPC channel
// string. The preload bridge and the main-process handlers should reference
// IPC_CHANNELS.* instead of hard-coding string literals, so a rename is caught
// at compile time and the two sides can never silently drift.
//
// There is deliberately no 'content:get-recent' channel — the renderer reads
// recents via 'usage:get-recent'. Do not add it without a consumer.

export const IPC_CHANNELS = {
  auth: {
    login: 'auth:login',
    logout: 'auth:logout',
    getUser: 'auth:get-user',
    getToken: 'auth:get-token',
    isAuthenticated: 'auth:is-authenticated',
    validateToken: 'auth:validate-token',
    // Logout-then-login(select_account) account switch.
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
    getEmbedToken: 'content:get-embed-token',
    exportReportPdf: 'content:export-report-pdf',
    getDatasetRefreshInfo: 'content:get-dataset-refresh-info',
    // Dashboard freshness derived from the stalest tile dataset.
    getDashboardDataFreshness: 'content:get-dashboard-data-freshness',
    // Data-freshness: dataset refresh time + upstream dataflow last-success time.
    getDataFreshness: 'content:get-data-freshness',
    getAllItems: 'content:get-all-items',
    // Insights one-pager: refresh health + access, scoped to the user's token.
    getInsights: 'content:get-insights',
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
    // Remove a single dead item from the persistent store.
    remove: 'usage:remove',
  },
  export: {
    choosePdfPath: 'export:choose-pdf-path',
    currentViewPdf: 'export:current-view-pdf',
  },
  app: {
    getAppWebviewConfig: 'app:get-app-webview-config',
    getVersion: 'app:get-version',
    // Opens the bundled offline user guide (HTML) in the default browser.
    openUserGuide: 'app:open-user-guide',
  },
  log: {
    openFolder: 'log:open-folder',
  },
  // Kiosk / wall-display power management.
  kiosk: {
    preventDisplaySleep: 'kiosk:prevent-display-sleep',
    allowDisplaySleep: 'kiosk:allow-display-sleep',
  },
} as const;

/** Union of every concrete channel string declared in IPC_CHANNELS. */
type ChannelValues<T> = T extends string ? T : T extends object ? ChannelValues<T[keyof T]> : never;
export type IpcChannel = ChannelValues<typeof IPC_CHANNELS>;
