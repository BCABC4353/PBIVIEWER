import { create } from 'zustand';
import type { AppSettings, IPCResponse } from '../../shared/types';

interface SettingsState {
  settings: AppSettings;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadSettings: () => Promise<void>;
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
  resetSettings: () => Promise<void>;
}

const defaultSettings: AppSettings = {
  theme: 'system',
  sidebarCollapsed: false,
  slideshowInterval: 10,
  slideshowMode: 'pages',
  autoStartSlideshow: false,
  autoStartReportId: undefined,
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: defaultSettings,
  isLoading: false,
  error: null,

  loadSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await window.electronAPI.settings.get() as IPCResponse<AppSettings>;
      if (response.success && response.data) {
        set({ settings: response.data, isLoading: false });
      } else {
        set({ isLoading: false, error: response.error?.message || 'Failed to load settings' });
      }
    } catch (error) {
      set({ isLoading: false, error: String(error) });
    }
  },

  updateSettings: async (updates: Partial<AppSettings>) => {
    try {
      const response = await window.electronAPI.settings.update(updates) as IPCResponse<AppSettings>;
      if (response.success && response.data) {
        set({ settings: response.data });
      }
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
  },

  resetSettings: async () => {
    try {
      const response = await window.electronAPI.settings.reset() as IPCResponse<AppSettings>;
      if (response.success && response.data) {
        set({ settings: response.data });
      }
    } catch (error) {
      console.error('Failed to reset settings:', error);
    }
  },
}));
