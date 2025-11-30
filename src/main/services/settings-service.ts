import Store from 'electron-store';
import type { AppSettings, IPCResponse } from '../../shared/types';

interface SettingsStore {
  settings: AppSettings;
}

const defaultSettings: AppSettings = {
  theme: 'dark',
  sidebarCollapsed: false,
  slideshowInterval: 60, // 60 seconds (1 minute) default
  slideshowMode: 'pages',
  autoStartSlideshow: false,
  autoStartReportId: undefined,
  autoRefreshEnabled: true,
  autoRefreshInterval: 1, // 1 minute default
};

const store = new Store<SettingsStore>({
  name: 'settings',
  defaults: {
    settings: defaultSettings,
  },
});

export const settingsService = {
  getSettings(): IPCResponse<AppSettings> {
    try {
      const settings = store.get('settings', defaultSettings);
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
      const currentSettings = store.get('settings', defaultSettings);
      const newSettings = { ...currentSettings, ...updates };
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
      store.set('settings', defaultSettings);
      return { success: true, data: defaultSettings };
    } catch (error) {
      console.error('[SettingsService] resetSettings error:', error);
      return {
        success: false,
        error: { code: 'SETTINGS_RESET_FAILED', message: String(error) },
      };
    }
  },
};
