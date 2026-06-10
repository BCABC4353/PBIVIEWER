import type { AppSettings } from './types';
import { SLIDESHOW_INTERVAL, AUTH, USAGE } from './constants';

// Consolidated validation — single source of truth for input validation shared
// by the main IPC handlers and the persistence-layer services.

/** RFC-4122 UUID, case-insensitive. */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns the value unchanged if it is a syntactically valid UUID string,
 * otherwise null. Callers treat null as "reject this id".
 */
export function validateUUID(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return UUID_REGEX.test(value) ? value : null;
}

/**
 * Defensively coerce + cap a free-text name field. Tolerates non-string callers
 * (legacy / in-process) by stringifying, then trims and slices to
 * USAGE.NAME_MAX_LENGTH (single source of truth in constants.ts).
 */
export function capName(value: unknown): string {
  const s = typeof value === 'string' ? value : String(value ?? '');
  return s.trim().slice(0, USAGE.NAME_MAX_LENGTH);
}

/**
 * Validate + sanitize a Partial<AppSettings> patch from an untrusted source
 * (the renderer over IPC, or a module-internal caller).
 *
 * - Only known keys are considered; unknown keys are silently dropped (never
 *   forwarded, never rejected).
 * - Numeric fields are clamped to their allowed ranges rather than rejected.
 * - Any *provided* known field whose value has an invalid type/literal is
 *   added to `rejected` (its name) and omitted from `sanitized`.
 *
 * The IPC handler treats a non-empty `rejected` as "reject the whole payload"
 * (so a hostile renderer can't poison the store); persistence-layer callers can
 * instead apply `sanitized` and ignore `rejected` (drop-invalid behavior).
 */
export function validateAppSettingsPatch(
  patch: unknown,
): { sanitized: Partial<AppSettings>; rejected: string[] } {
  const rejected: string[] = [];
  const sanitized: Partial<AppSettings> = {};

  if (typeof patch !== 'object' || patch === null) {
    return { sanitized, rejected: ['<root>'] };
  }
  const src = patch as Record<string, unknown>;

  if ('theme' in src) {
    const v = src.theme;
    if (v === 'light' || v === 'dark' || v === 'system') sanitized.theme = v;
    else rejected.push('theme');
  }
  if ('sidebarCollapsed' in src) {
    const v = src.sidebarCollapsed;
    if (typeof v === 'boolean') sanitized.sidebarCollapsed = v;
    else rejected.push('sidebarCollapsed');
  }
  if ('slideshowInterval' in src) {
    const v = src.slideshowInterval;
    if (typeof v === 'number' && Number.isFinite(v)) {
      sanitized.slideshowInterval = Math.min(SLIDESHOW_INTERVAL.MAX, Math.max(SLIDESHOW_INTERVAL.MIN, v));
    } else {
      rejected.push('slideshowInterval');
    }
  }
  if ('slideshowMode' in src) {
    const v = src.slideshowMode;
    if (v === 'pages' || v === 'bookmarks' || v === 'both') sanitized.slideshowMode = v;
    else rejected.push('slideshowMode');
  }
  if ('autoStartSlideshow' in src) {
    const v = src.autoStartSlideshow;
    if (typeof v === 'boolean') sanitized.autoStartSlideshow = v;
    else rejected.push('autoStartSlideshow');
  }
  if ('autoStartReportId' in src) {
    const v = src.autoStartReportId;
    if (v === undefined) sanitized.autoStartReportId = undefined;
    else if (typeof v === 'string' && UUID_REGEX.test(v)) sanitized.autoStartReportId = v;
    else rejected.push('autoStartReportId');
  }
  if ('autoStartAppId' in src) {
    const v = src.autoStartAppId;
    if (v === undefined) sanitized.autoStartAppId = undefined;
    else if (typeof v === 'string' && UUID_REGEX.test(v)) sanitized.autoStartAppId = v;
    else rejected.push('autoStartAppId');
  }
  if ('autoRefreshEnabled' in src) {
    const v = src.autoRefreshEnabled;
    if (typeof v === 'boolean') sanitized.autoRefreshEnabled = v;
    else rejected.push('autoRefreshEnabled');
  }
  if ('autoRefreshInterval' in src) {
    const v = src.autoRefreshInterval;
    if (typeof v === 'number' && Number.isFinite(v)) {
      sanitized.autoRefreshInterval = Math.min(
        AUTH.AUTO_REFRESH_MAX_MINUTES,
        Math.max(AUTH.AUTO_REFRESH_MIN_MINUTES, v),
      );
    } else {
      rejected.push('autoRefreshInterval');
    }
  }
  // Launch-time auto-start.
  if ('autoStartMode' in src) {
    const v = src.autoStartMode;
    if (v === 'off' || v === 'report' || v === 'app') sanitized.autoStartMode = v;
    else rejected.push('autoStartMode');
  }
  if ('autoStartWorkspaceId' in src) {
    const v = src.autoStartWorkspaceId;
    if (v === undefined) sanitized.autoStartWorkspaceId = undefined;
    else if (typeof v === 'string' && UUID_REGEX.test(v)) sanitized.autoStartWorkspaceId = v;
    else rejected.push('autoStartWorkspaceId');
  }
  // Usage-history retention on logout.
  if ('usageClearOnLogout' in src) {
    const v = src.usageClearOnLogout;
    if (v === 'always' || v === 'never' || v === 'on-shared-machine') sanitized.usageClearOnLogout = v;
    else rejected.push('usageClearOnLogout');
  }

  return { sanitized, rejected };
}
