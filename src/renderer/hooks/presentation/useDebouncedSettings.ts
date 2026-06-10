/**
 * useDebouncedSettings
 *
 * Encapsulates the slideshow-interval slider's optimistic-update +
 * debounced-persist logic for PresentationMode.
 *
 * onIntervalChange(value):
 *   - Optimistic local update: push the new value into the settings store
 *     immediately so the slider thumb and the slideshow's interval effect
 *     track the drag without waiting on the IPC.
 *   - Debounced (300ms) updateSettings call persists to disk and (re-)sets
 *     store state with the canonical response.
 *
 * The pending debounce timer is flushed/cleared on unmount.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useSettingsStore } from '../../stores/settings-store';

export interface UseDebouncedSettingsResult {
  onIntervalChange: (value: number) => void;
}

export function useDebouncedSettings(): UseDebouncedSettingsResult {
  const persistIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Flush any pending debounced interval-persist timer on unmount
  useEffect(() => {
    return () => {
      if (persistIntervalRef.current) {
        clearTimeout(persistIntervalRef.current);
        persistIntervalRef.current = null;
      }
    };
  }, []);

  const onIntervalChange = useCallback((value: number) => {
    // Optimistic local update: push the new value into the
    // store immediately so the slider thumb and the
    // slideshow's interval effect track the drag without
    // waiting on the IPC. The debounced updateSettings call
    // below persists to disk and (re-)sets store state with
    // the canonical response.
    useSettingsStore.setState((prev) => ({
      settings: { ...prev.settings, slideshowInterval: value },
    }));
    if (persistIntervalRef.current) clearTimeout(persistIntervalRef.current);
    persistIntervalRef.current = setTimeout(() => {
      void useSettingsStore
        .getState()
        .updateSettings({ slideshowInterval: value });
    }, 300);
  }, []);

  return { onIntervalChange };
}

export default useDebouncedSettings;
