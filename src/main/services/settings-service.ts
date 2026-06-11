import Store from 'electron-store';
import type { AppSettings, IPCResponse } from '../../shared/types';
import { DEFAULT_SETTINGS, SLIDESHOW_INTERVAL, AUTH } from '../../shared/constants';
import { UUID_REGEX } from '../../shared/validation';

interface SettingsStore {
  settings: AppSettings;
}

interface SettingsStoreLike {
  get(key: 'settings', defaultValue: AppSettings): AppSettings;
  set(key: 'settings', value: AppSettings): void;
}

function createMemorySettingsStore(): SettingsStoreLike {
  let current: AppSettings = DEFAULT_SETTINGS;
  return {
    get: () => current,
    set: (_key, value) => {
      current = value;
    },
  };
}

function createSettingsStore(): SettingsStoreLike {
  try {
    const s = new Store<SettingsStore>({
      name: 'settings',
      defaults: {
        settings: DEFAULT_SETTINGS,
      },
      clearInvalidConfig: true,
    });
    return {
      get: (key, defaultValue) => s.get(key, defaultValue),
      set: (key, value) => s.set(key, value),
    };
  } catch (error) {
    console.warn('[SettingsService] Failed to open settings store; using in-memory defaults this session:', error);
    return createMemorySettingsStore();
  }
}

const store: SettingsStoreLike = createSettingsStore();

function readSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, ...store.get('settings', DEFAULT_SETTINGS) };
}

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
  }
  if (typeof src.autoRefreshEnabled === 'boolean') {
    out.autoRefreshEnabled = src.autoRefreshEnabled;
  }
  if (typeof src.autoRefreshInterval === 'number' && Number.isFinite(src.autoRefreshInterval)) {
    out.autoRefreshInterval = Math.min(
      AUTH.AUTO_REFRESH_MAX_MINUTES,
      Math.max(AUTH.AUTO_REFRESH_MIN_MINUTES, src.autoRefreshInterval),
    );
  }
  if ('autoStartMode' in src) {
    const v = src.autoStartMode;
    if (v === 'off' || v === 'report' || v === 'app') out.autoStartMode = v;
  }
  if ('autoStartAppId' in src) {
    const v = src.autoStartAppId;
    if (v === undefined) {
      out.autoStartAppId = undefined;
    } else if (typeof v === 'string' && UUID_REGEX.test(v)) {
      out.autoStartAppId = v;
    }
  }
  if ('autoStartWorkspaceId' in src) {
    const v = src.autoStartWorkspaceId;
    if (v === undefined) {
      out.autoStartWorkspaceId = undefined;
    } else if (typeof v === 'string' && UUID_REGEX.test(v)) {
      out.autoStartWorkspaceId = v;
    }
  }
  if ('usageClearOnLogout' in src) {
    const v = src.usageClearOnLogout;
    if (v === 'always' || v === 'never' || v === 'on-shared-machine') out.usageClearOnLogout = v;
  }

  return out;
}

export const settingsService = {
  getSettings(): IPCResponse<AppSettings> {
    try {
      const settings = readSettings();
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
      const currentSettings = readSettings();
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
