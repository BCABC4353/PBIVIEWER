import type { AppSettings } from './types';

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

// Default app settings — single source of truth for settings-service and settings-store
export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  sidebarCollapsed: true,
  slideshowInterval: 60,
  slideshowMode: 'pages',
  autoStartSlideshow: false,
  autoStartReportId: undefined,
  autoRefreshEnabled: true,
  autoRefreshInterval: 1,
};
