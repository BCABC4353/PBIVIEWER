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
        // Prefer the friendly userMessage over the raw upstream message.
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
    // Optimistic-authoritative write with PER-KEY rollback.
    // Apply the delta immediately so slider / toggle feedback is instant and
    // never reverts mid-drag. Capture a snapshot so we can restore on failure.
    // The IPC call persists the new state to disk; we do NOT write
    // response.data back to the store because that would create a revert on
    // every keystroke if the main-process round-trip is slow.
    const previousSettings = _get().settings;
    set((state) => ({ settings: { ...state.settings, ...updates } }));
    // Rollback restores ONLY the keys THIS call touched, re-merged into the
    // CURRENT state. Restoring the whole snapshot would also revert unrelated
    // updates that landed while this IPC round-trip was in flight (e.g. a
    // failing slider write clobbering a concurrent theme change).
    const rollbackTouchedKeys = () => {
      set((state) => {
        const restored = { ...state.settings };
        for (const key of Object.keys(updates) as Array<keyof AppSettings>) {
          // Write through a keyed-record view: TS cannot prove the value type
          // when the key is a union, but it comes from the same-keyed snapshot.
          (restored as Record<keyof AppSettings, unknown>)[key] = previousSettings[key];
        }
        return { settings: restored };
      });
    };
    try {
      const response = await window.electronAPI.settings.update(updates);
      if (!response.success) {
        // Prefer the friendly userMessage over the raw message.
        console.error(
          'Failed to update settings:',
          response.error.userMessage ?? response.error.message,
        );
        // Rollback: restore the pre-optimistic values of the touched keys so
        // the store does not diverge from what was actually persisted to disk.
        rollbackTouchedKeys();
      }
    } catch (error) {
      console.error('Failed to update settings:', error);
      // Rollback: restore the touched keys' pre-optimistic values on IPC throw.
      rollbackTouchedKeys();
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
