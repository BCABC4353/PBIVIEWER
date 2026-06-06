import { create } from 'zustand';
import type { AppSettings } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/constants';

interface SettingsState {
  settings: AppSettings;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadSettings: () => Promise<void>;
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
  resetSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, _get) => ({
  settings: DEFAULT_SETTINGS,
  isLoading: false,
  error: null,

  loadSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await window.electronAPI.settings.get();
      if (response.success) {
        set({ settings: response.data, isLoading: false });
      } else {
        set({ isLoading: false, error: response.error.message || 'Failed to load settings' });
      }
    } catch (error) {
      set({ isLoading: false, error: String(error) });
    }
  },

  updateSettings: async (updates: Partial<AppSettings>) => {
    try {
      const response = await window.electronAPI.settings.update(updates);
      if (response.success) {
        set({ settings: response.data });
      }
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
  },

  resetSettings: async () => {
    try {
      const response = await window.electronAPI.settings.reset();
      if (response.success) {
        set({ settings: response.data });
      }
    } catch (error) {
      console.error('Failed to reset settings:', error);
    }
  },
}));
