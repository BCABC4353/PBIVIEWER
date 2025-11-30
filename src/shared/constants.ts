// IPC Channel Names
export const IPC_CHANNELS = {
  // Auth
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_GET_USER: 'auth:get-user',
  AUTH_GET_TOKEN: 'auth:get-token',
  AUTH_IS_AUTHENTICATED: 'auth:is-authenticated',

  // Content
  CONTENT_GET_WORKSPACES: 'content:get-workspaces',
  CONTENT_GET_REPORTS: 'content:get-reports',
  CONTENT_GET_DASHBOARDS: 'content:get-dashboards',
  CONTENT_GET_APPS: 'content:get-apps',
  CONTENT_GET_EMBED_TOKEN: 'content:get-embed-token',
  CONTENT_GET_RECENT: 'content:get-recent',

  // Window
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',
} as const;

// App Constants
export const APP_NAME = 'Power BI Viewer';
// Note: Version is managed in package.json and accessed via app.getVersion() at runtime
export const PARTITION_NAME = 'persist:powerbi-viewer';

// Power BI API
export const POWERBI_API_BASE = 'https://api.powerbi.com/v1.0/myorg';
export const POWERBI_EMBED_BASE = 'https://app.powerbi.com';

// Slideshow Defaults
export const DEFAULT_SLIDESHOW_INTERVAL = 30; // seconds
export const SLIDESHOW_INTERVALS = [15, 30, 60, 120, 300]; // seconds
