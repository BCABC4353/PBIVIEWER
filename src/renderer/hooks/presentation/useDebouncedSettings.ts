
import { useEffect, useRef, useCallback } from 'react';
import { useSettingsStore } from '../../stores/settings-store';
import type { AppSettings } from '../../../shared/types';

export interface UseDebouncedSettingsResult {
  onIntervalChange: (value: number) => void;
  onDebouncedUpdate: (updates: Partial<AppSettings>) => void;
}

const PERSIST_DEBOUNCE_MS = 300;

export function useDebouncedSettings(): UseDebouncedSettingsResult {
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Partial<AppSettings> | null>(null);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      if (pendingRef.current) {
        void useSettingsStore.getState().updateSettings(pendingRef.current);
        pendingRef.current = null;
      }
    };
  }, []);

  const onDebouncedUpdate = useCallback((updates: Partial<AppSettings>) => {
    useSettingsStore.setState((prev) => ({
      settings: { ...prev.settings, ...updates },
    }));
    pendingRef.current = { ...pendingRef.current, ...updates };
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) {
        void useSettingsStore.getState().updateSettings(pending);
      }
    }, PERSIST_DEBOUNCE_MS);
  }, []);

  const onIntervalChange = useCallback(
    (value: number) => onDebouncedUpdate({ slideshowInterval: value }),
    [onDebouncedUpdate],
  );

  return { onIntervalChange, onDebouncedUpdate };
}

export default useDebouncedSettings;
