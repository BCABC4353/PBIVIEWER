import Store from 'electron-store';
import type { AppSettings, IPCResponse } from '../../shared/types';
import { DEFAULT_SETTINGS, SLIDESHOW_INTERVAL, AUTH } from '../../shared/constants';
import { UUID_REGEX } from '../../shared/validation';

interface SettingsStore {
  settings: AppSettings;
}

// Narrow store interface — only the get/set this module uses. Both the real
// electron-store and the in-memory fallback satisfy it.
interface SettingsStoreLike {
  get(key: 'settings', defaultValue: AppSettings): AppSettings;
  set(key: 'settings', value: AppSettings): void;
}

// In-memory fallback if the on-disk store cannot even be constructed (locked /
// EPERM file on a roaming or VDI profile). Settings won't persist this session,
// but the app launches and works rather than dying at module load with no window.
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
      // A power-loss / AV-truncated settings.json must self-heal rather than throw
      // a SyntaxError at main-process load. conf resets to defaults when it can't
      // parse. (clearInvalidConfig only covers parse failures — a locked/EPERM
      // file still throws from the constructor, which the catch below handles.)
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
    // PERF-B1: upper bound raised to AUTH.AUTO_REFRESH_MAX_MINUTES (120).
    // Previously hard-coded as Math.min(60, ...) which re-clamped values the
    // shared validator already accepted, silently discarding operator intent.
    out.autoRefreshInterval = Math.min(
      AUTH.AUTO_REFRESH_MAX_MINUTES,
      Math.max(AUTH.AUTO_REFRESH_MIN_MINUTES, src.autoRefreshInterval),
    );
  }
  // PROD-B2: launch-time auto-start behavior.
  if ('autoStartMode' in src) {
    const v = src.autoStartMode;
    if (v === 'off' || v === 'report' || v === 'app') out.autoStartMode = v;
    // Invalid value: silently drop.
  }
  // Launch-time auto-start of a specific app (paired with autoStartMode 'app').
  // Must be accepted here or the renderer's "open a specific app" choice is
  // silently dropped at the persistence boundary and never sticks.
  if ('autoStartAppId' in src) {
    const v = src.autoStartAppId;
    if (v === undefined) {
      out.autoStartAppId = undefined;
    } else if (typeof v === 'string' && UUID_REGEX.test(v)) {
      out.autoStartAppId = v;
    }
    // Invalid value: silently drop.
  }
  if ('autoStartWorkspaceId' in src) {
    const v = src.autoStartWorkspaceId;
    if (v === undefined) {
      out.autoStartWorkspaceId = undefined;
    } else if (typeof v === 'string' && UUID_REGEX.test(v)) {
      out.autoStartWorkspaceId = v;
    }
    // Invalid value: silently drop.
  }
  // BEH-B3: usage-history retention policy on logout.
  if ('usageClearOnLogout' in src) {
    const v = src.usageClearOnLogout;
    if (v === 'always' || v === 'never' || v === 'on-shared-machine') out.usageClearOnLogout = v;
    // Invalid value: silently drop.
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
