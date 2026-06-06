import Store from 'electron-store';
import type { AppSettings, IPCResponse } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/constants';

interface SettingsStore {
  settings: AppSettings;
}

const store = new Store<SettingsStore>({
  name: 'settings',
  defaults: {
    settings: DEFAULT_SETTINGS,
  },
});

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
