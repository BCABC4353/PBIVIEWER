import Store from 'electron-store';
import type { AppSettings, IPCResponse } from '../../shared/types';
import { DEFAULT_SETTINGS, SLIDESHOW_INTERVAL } from '../../shared/constants';

interface SettingsStore {
  settings: AppSettings;
}

const store = new Store<SettingsStore>({
  name: 'settings',
  defaults: {
    settings: DEFAULT_SETTINGS,
  },
});

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Belt-and-braces sanitizer: even if the IPC handler is bypassed (module-internal
// callers, future code paths), make sure persisted values are within bounds and
// of the right shape. Unknown/invalid fields are dropped from the partial update
// rather than rejected, so legacy callers keep working.
function sanitizePartialSettings(updates: Partial<AppSettings>): Partial<AppSettings> {
  const src = updates as Record<string, unknown>;
  const out: Partial<AppSettings> = {};

  if (src.theme === 'light' || src.theme === 'dark' || src.theme === 'system') {
    out.theme = src.theme;
  }
  if (typeof src.sidebarCollapsed === 'boolean') {
    out.sidebarCollapsed = src.sidebarCollapsed;
  }
  if (typeof src.slideshowInterval === 'number' && Number.isFinite(src.slideshowInterval)) {
    out.slideshowInterval = Math.min(
      SLIDESHOW_INTERVAL.MAX,
      Math.max(SLIDESHOW_INTERVAL.MIN, src.slideshowInterval)
    );
  }
  if (src.slideshowMode === 'pages' || src.slideshowMode === 'bookmarks' || src.slideshowMode === 'both') {
    out.slideshowMode = src.slideshowMode;
  }
  if (typeof src.autoStartSlideshow === 'boolean') {
    out.autoStartSlideshow = src.autoStartSlideshow;
  }
  if ('autoStartReportId' in src) {
    const v = src.autoStartReportId;
    if (v === undefined) {
      out.autoStartReportId = undefined;
    } else if (typeof v === 'string' && UUID_REGEX.test(v)) {
      out.autoStartReportId = v;
    }
    // Invalid value: silently drop (don't poison the store).
  }
  if (typeof src.autoRefreshEnabled === 'boolean') {
    out.autoRefreshEnabled = src.autoRefreshEnabled;
  }
  if (typeof src.autoRefreshInterval === 'number' && Number.isFinite(src.autoRefreshInterval)) {
    out.autoRefreshInterval = Math.min(60, Math.max(1, src.autoRefreshInterval));
  }

  return out;
}

export const settingsService = {
  getSettings(): IPCResponse<AppSettings> {
    try {
      const settings = store.get('settings', DEFAULT_SETTINGS);
      return { success: true, data: settings };
    } catch (error) {
      console.error('[SettingsService] getSettings error:', error);
      return {
        success: false,
        error: { code: 'SETTINGS_GET_FAILED', message: String(error) },
      };
    }
  },

  updateSettings(updates: Partial<AppSettings>): IPCResponse<AppSettings> {
    try {
      const currentSettings = store.get('settings', DEFAULT_SETTINGS);
      // Belt-and-braces: re-sanitize at the persistence boundary too. The IPC
      // handler already validates, but other in-process callers might not.
      const sanitized = sanitizePartialSettings(updates);
      const newSettings = { ...currentSettings, ...sanitized };
      store.set('settings', newSettings);
      return { success: true, data: newSettings };
    } catch (error) {
      console.error('[SettingsService] updateSettings error:', error);
      return {
        success: false,
        error: { code: 'SETTINGS_UPDATE_FAILED', message: String(error) },
      };
    }
  },

  resetSettings(): IPCResponse<AppSettings> {
    try {
      store.set('settings', DEFAULT_SETTINGS);
      return { success: true, data: DEFAULT_SETTINGS };
    } catch (error) {
      console.error('[SettingsService] resetSettings error:', error);
      return {
        success: false,
        error: { code: 'SETTINGS_RESET_FAILED', message: String(error) },
      };
    }
  },
};
