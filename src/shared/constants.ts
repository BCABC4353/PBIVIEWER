import type { AppSettings } from './types';

export const APP_NAME = 'Power BI Viewer';

export const TITLE_BAR_COLORS = {
  light: { background: '#FAF9F8', symbol: '#201F1E' },
  dark: { background: '#1F1F1F', symbol: '#FFFFFF' },
} as const;

export const PARTITION_NAME = 'persist:powerbi-viewer';

export const POWERBI_API_BASE = 'https://api.powerbi.com/v1.0/myorg';

export const SLIDESHOW_INTERVAL = { MIN: 5, MAX: 300, STEP: 5, DEFAULT: 60 } as const;


export const TOKEN = {
  FALLBACK_LIFETIME_MS: 3_600_000,
  VALIDATE_SHORT_CIRCUIT_MS: 5 * 60 * 1000,
  REFRESH_LEAD_MS: 2 * 60 * 1000,
} as const;

export const EMBED = {
  WATCHDOG_MS: 45_000,
} as const;

export const KIOSK = {
  RECOVERY_BACKOFF_MS: [5_000, 30_000, 60_000] as readonly number[],
  CURSOR_HIDE_MS: 4_000,
  ESCAPE_HOLD_MS: 3_000,
} as const;

export const KIOSK_RECOVERY_BACKOFF_MS = KIOSK.RECOVERY_BACKOFF_MS;

export function kioskRecoveryDelayMs(attemptIndex: number): number {
  const schedule = KIOSK_RECOVERY_BACKOFF_MS;
  if (schedule.length === 0) return 0;
  const clamped = Math.max(0, Math.min(attemptIndex, schedule.length - 1));
  return schedule[clamped] as number;
}

export const USAGE = {
  MAX_RECORDS: 50,
  NAME_MAX_LENGTH: 256,
  ACCOUNT_ID_MAX_LENGTH: 512,
} as const;

export const AUTH = {
  AUTO_REFRESH_MIN_MINUTES: 1,
  AUTO_REFRESH_MAX_MINUTES: 120,
  AUTO_REFRESH_DEFAULT_MINUTES: 10,
} as const;

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  sidebarCollapsed: true,
  slideshowInterval: 60,
  slideshowMode: 'pages',
  autoStartSlideshow: false,
  autoStartReportId: undefined,
  autoRefreshEnabled: true,
  autoRefreshInterval: 10,
  autoStartMode: 'off',
  autoStartWorkspaceId: undefined,
  autoStartAppId: undefined,
  usageClearOnLogout: 'never',
};
