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
  CONTENT_GET_FAVORITES: 'content:get-favorites',
  CONTENT_ADD_FAVORITE: 'content:add-favorite',
  CONTENT_REMOVE_FAVORITE: 'content:remove-favorite',

  // Cache
  CACHE_GET_THUMBNAIL: 'cache:get-thumbnail',
  CACHE_GET_OFFLINE: 'cache:get-offline',
  CACHE_CLEAR: 'cache:clear',

  // Window
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',
} as const;

// App Constants
export const APP_NAME = 'Power BI Viewer';
export const APP_VERSION = '1.0.0';
export const PARTITION_NAME = 'persist:powerbi-viewer';

// Power BI API
export const POWERBI_API_BASE = 'https://api.powerbi.com/v1.0/myorg';
export const POWERBI_EMBED_BASE = 'https://app.powerbi.com';

// Cache Settings
export const CACHE_TTL_METADATA = 24 * 60 * 60 * 1000; // 24 hours
export const CACHE_TTL_THUMBNAILS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const SYNC_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours

// Slideshow Defaults
export const DEFAULT_SLIDESHOW_INTERVAL = 30; // seconds
export const SLIDESHOW_INTERVALS = [15, 30, 60, 120, 300]; // seconds

// Inking
export const INK_COLORS = [
  { name: 'Red', value: '#d13438' },
  { name: 'Blue', value: '#0078d4' },
  { name: 'Green', value: '#107c10' },
  { name: 'Yellow', value: '#ffb900' },
  { name: 'Black', value: '#000000' },
  { name: 'White', value: '#ffffff' },
];

export const INK_SIZES = [
  { name: 'Thin', value: 2 },
  { name: 'Medium', value: 4 },
  { name: 'Thick', value: 8 },
  { name: 'Highlighter', value: 16 },
];
