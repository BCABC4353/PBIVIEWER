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
        // BEH-S7: prefer the friendly userMessage over the raw upstream message.
        set({
          isLoading: false,
          error:
            response.error.userMessage ??
            response.error.message ??
            'Failed to load settings',
        });
      }
    } catch (error) {
      set({ isLoading: false, error: String(error) });
    }
  },

  updateSettings: async (updates: Partial<AppSettings>) => {
    // BEH-S2: Optimistic-authoritative write with rollback.
    // Apply the delta immediately so slider / toggle feedback is instant and
    // never reverts mid-drag. Capture a snapshot so we can restore on failure.
    // The IPC call persists the new state to disk; we do NOT write
    // response.data back to the store because that would create a revert on
    // every keystroke if the main-process round-trip is slow.
    const previousSettings = _get().settings;
    set((state) => ({ settings: { ...state.settings, ...updates } }));
    try {
      const response = await window.electronAPI.settings.update(updates);
      if (!response.success) {
        // BEH-S7: prefer the friendly userMessage over the raw message.
        console.error(
          'Failed to update settings:',
          response.error.userMessage ?? response.error.message,
        );
        // BEH-S2 rollback: restore the pre-optimistic snapshot so the store
        // does not diverge from what was actually persisted to disk.
        set({ settings: previousSettings });
      }
    } catch (error) {
      console.error('Failed to update settings:', error);
      // BEH-S2 rollback: restore the pre-optimistic snapshot on IPC throw.
      set({ settings: previousSettings });
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
