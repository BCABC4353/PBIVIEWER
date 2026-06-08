import type { AppSettings } from './types';

// App Constants
export const APP_NAME = 'Power BI Viewer';

// Title bar overlay colors — must visually match Fluent neutral chrome in each theme.
// Consumed by main.tsx (UX-B1 caller) and Group 2 TitleBar component.
export const TITLE_BAR_COLORS = {
  light: { background: '#FAF9F8', symbol: '#201F1E' },
  dark: { background: '#1F1F1F', symbol: '#FFFFFF' },
} as const;

// Note: Version is managed in package.json and accessed via app.getVersion() at runtime
export const PARTITION_NAME = 'persist:powerbi-viewer';

// Power BI API
export const POWERBI_API_BASE = 'https://api.powerbi.com/v1.0/myorg';
export const POWERBI_EMBED_BASE = 'https://app.powerbi.com';

// Slideshow auto-advance interval bounds — single source of truth for BOTH the
// Settings slider and the in-presentation slider (they previously disagreed).
export const SLIDESHOW_INTERVAL = { MIN: 5, MAX: 300, STEP: 5, DEFAULT: 60 } as const;

// ============================================
// ARCH-S10: grouped magic numbers (named consts)
//
// Single source of truth for the tuning values that were previously scattered
// as bare literals across main + renderer. Downstream lanes import these instead
// of re-declaring locals. Each group is `as const` so the literal types are
// preserved and the values can't be mutated.
// ============================================

// HTTP / fetch behavior for the Power BI REST client (powerbi-api.ts).
export const NETWORK = {
  /** Default per-request fetch timeout. */
  FETCH_TIMEOUT_MS: 20_000,
  /** Shorter per-poll timeout for the export status loop. */
  POLL_TIMEOUT_MS: 10_000,
  /** Default retry attempts for retriable (429/5xx/timeout) failures. */
  RETRY_MAX_ATTEMPTS: 3,
  /** Base delay for exponential backoff. */
  RETRY_BASE_DELAY_MS: 500,
  /** Ceiling on a single computed backoff delay. */
  RETRY_MAX_DELAY_MS: 8_000,
  /** Cap on any Retry-After we'll honor (defends against hostile upstream). */
  MAX_RETRY_AFTER_MS: 60_000,
} as const;

// Access-token lifecycle (auth + embed refresh).
export const TOKEN = {
  /** Fallback token lifetime when MSAL does not supply expiresOn (+1h). */
  FALLBACK_LIFETIME_MS: 3_600_000,
  /** validateToken() short-circuit buffer — treat token as valid this far ahead. */
  VALIDATE_SHORT_CIRCUIT_MS: 5 * 60 * 1000,
  /** Proactive embed-token refresh lead time before expiry. */
  REFRESH_LEAD_MS: 2 * 60 * 1000,
} as const;

// Power BI embed lifecycle (usePowerBIEmbed hook).
export const EMBED = {
  /** Watchdog timeout — fires if neither loaded nor pre-load error arrives. */
  WATCHDOG_MS: 45_000,
} as const;

// PROD-S1: Kiosk / unattended wall-display tuning.
export const KIOSK = {
  /**
   * Slideshow auto-recovery backoff schedule (ms). When the embedded report
   * errors/crashes while a slideshow is running, recovery is retried after
   * each successive delay; once the last entry is reached it keeps retrying at
   * that final interval. The backoff index resets on a successful recovery.
   */
  RECOVERY_BACKOFF_MS: [5_000, 30_000, 60_000] as readonly number[],
  /** Inactivity delay before the mouse cursor is hidden in presentation/fullscreen. */
  CURSOR_HIDE_MS: 4_000,
  /** Duration the Escape key must be held to trigger the kiosk-safe exit. */
  ESCAPE_HOLD_MS: 3_000,
} as const;

/**
 * PROD-S1: convenience export of the recovery backoff schedule.
 * Equivalent to KIOSK.RECOVERY_BACKOFF_MS — exposed at top level because the
 * ticket names this constant directly.
 */
export const KIOSK_RECOVERY_BACKOFF_MS = KIOSK.RECOVERY_BACKOFF_MS;

/**
 * PROD-S1: resolve the backoff delay (ms) for a given zero-based retry attempt.
 * Clamps to the final entry so that after the last step it keeps retrying at the
 * longest interval. Negative indices clamp to the first entry.
 */
export function kioskRecoveryDelayMs(attemptIndex: number): number {
  const schedule = KIOSK_RECOVERY_BACKOFF_MS;
  if (schedule.length === 0) return 0;
  const clamped = Math.max(0, Math.min(attemptIndex, schedule.length - 1));
  return schedule[clamped] as number;
}

// Usage-tracking cache bounds (usage-tracking-service.ts).
export const USAGE = {
  /** Keep at most this many recent records. */
  MAX_RECORDS: 50,
  /** Cap stored name / workspaceName length to prevent store/log bloat. */
  NAME_MAX_LENGTH: 256,
  /**
   * Cap stored accountId length. MSAL homeAccountId is "<oid>.<tenantId>" —
   * well under this, but guard against a hostile renderer sending huge values.
   */
  ACCOUNT_ID_MAX_LENGTH: 512,
} as const;

// PDF export polling loop (powerbi-api.ts exportReportToPdf).
export const POWERBI_API = {
  /** Max status-poll iterations before declaring the export timed out. */
  EXPORT_MAX_POLL_ATTEMPTS: 30,
  /** Delay between export status polls. */
  EXPORT_POLL_INTERVAL_MS: 2_000,
  /** Workspaces fetched concurrently per batch in getAllItems(). */
  ALL_ITEMS_BATCH_SIZE: 5,
} as const;

// Auto-refresh / settings bounds (settings validation + embed auto-refresh).
export const AUTH = {
  /** Lower bound for autoRefreshInterval (minutes). */
  AUTO_REFRESH_MIN_MINUTES: 1,
  /** Upper bound for autoRefreshInterval (minutes) — PERF-B1 raised to 120. */
  AUTO_REFRESH_MAX_MINUTES: 120,
  /** Default autoRefreshInterval (minutes). */
  AUTO_REFRESH_DEFAULT_MINUTES: 10,
} as const;

// Error-body redaction / truncation (powerbi-api.ts sanitizeErrorBody).
export const CACHE = {
  /** Truncate sanitized upstream error bodies to this length in logs. */
  ERROR_BODY_MAX_LENGTH: 256,
} as const;

// Default app settings — single source of truth for settings-service and settings-store
export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  sidebarCollapsed: true,
  slideshowInterval: 60,
  slideshowMode: 'pages',
  autoStartSlideshow: false,
  autoStartReportId: undefined,
  autoRefreshEnabled: true,
  autoRefreshInterval: 10,
  // PROD-B2: launch-time auto-start of a specific report or app.
  autoStartMode: 'off',
  autoStartWorkspaceId: undefined,
  autoStartAppId: undefined,
  // BEH-B3: whether to wipe usage history on logout.
  usageClearOnLogout: 'never',
};
