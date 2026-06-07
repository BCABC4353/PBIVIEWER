import { ipcMain } from 'electron';
import { SLIDESHOW_INTERVAL } from '../../shared/constants';
import { settingsService } from '../services/settings-service';
import { UUID_REGEX } from '../validation';
import type { AppSettings } from '../../shared/types';

// Validate + sanitize a Partial<AppSettings> payload from the renderer before
// it reaches settingsService. Returns null if any *provided* field is invalid;
// unknown keys are silently dropped (never forwarded, never rejected). Numbers
// are clamped to their allowed ranges.
function validateSettingsUpdate(input: unknown): Partial<AppSettings> | null {
  if (typeof input !== 'object' || input === null) return null;
  const src = input as Record<string, unknown>;
  const out: Partial<AppSettings> = {};

  if ('theme' in src) {
    const v = src.theme;
    if (v !== 'light' && v !== 'dark' && v !== 'system') return null;
    out.theme = v;
  }
  if ('sidebarCollapsed' in src) {
    const v = src.sidebarCollapsed;
    if (typeof v !== 'boolean') return null;
    out.sidebarCollapsed = v;
  }
  if ('slideshowInterval' in src) {
    const v = src.slideshowInterval;
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    out.slideshowInterval = Math.min(SLIDESHOW_INTERVAL.MAX, Math.max(SLIDESHOW_INTERVAL.MIN, v));
  }
  if ('slideshowMode' in src) {
    const v = src.slideshowMode;
    if (v !== 'pages' && v !== 'bookmarks' && v !== 'both') return null;
    out.slideshowMode = v;
  }
  if ('autoStartSlideshow' in src) {
    const v = src.autoStartSlideshow;
    if (typeof v !== 'boolean') return null;
    out.autoStartSlideshow = v;
  }
  if ('autoStartReportId' in src) {
    const v = src.autoStartReportId;
    if (v === undefined) {
      out.autoStartReportId = undefined;
    } else if (typeof v === 'string' && UUID_REGEX.test(v)) {
      out.autoStartReportId = v;
    } else {
      return null;
    }
  }
  if ('autoRefreshEnabled' in src) {
    const v = src.autoRefreshEnabled;
    if (typeof v !== 'boolean') return null;
    out.autoRefreshEnabled = v;
  }
  if ('autoRefreshInterval' in src) {
    const v = src.autoRefreshInterval;
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    // PERF-B1: upper bound raised to 120 min to accommodate the 10-min default
    // and give operators room to pick longer intervals without being silently clamped.
    out.autoRefreshInterval = Math.min(120, Math.max(1, v));
  }

  return out;
}

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', async () => {
    return settingsService.getSettings();
  });

  ipcMain.handle('settings:update', async (_event, updates: Partial<AppSettings>) => {
    // Validate every known field before persisting; drop unknown keys silently.
    // Reject the whole payload if any provided field has an invalid type/value,
    // so the renderer can't poison the settings store.
    const sanitized = validateSettingsUpdate(updates);
    if (!sanitized) {
      return { success: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid settings payload' } };
    }
    return settingsService.updateSettings(sanitized);
  });

  ipcMain.handle('settings:reset', async () => {
    return settingsService.resetSettings();
  });
}
