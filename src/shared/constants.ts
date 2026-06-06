import type { AppSettings } from './types';

// App Constants
export const APP_NAME = 'Power BI Viewer';
// Note: Version is managed in package.json and accessed via app.getVersion() at runtime
export const PARTITION_NAME = 'persist:powerbi-viewer';

// Power BI API
export const POWERBI_API_BASE = 'https://api.powerbi.com/v1.0/myorg';
export const POWERBI_EMBED_BASE = 'https://app.powerbi.com';

// Slideshow auto-advance interval bounds — single source of truth for BOTH the
// Settings slider and the in-presentation slider (they previously disagreed).
export const SLIDESHOW_INTERVAL = { MIN: 5, MAX: 300, STEP: 5, DEFAULT: 60 } as const;

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
