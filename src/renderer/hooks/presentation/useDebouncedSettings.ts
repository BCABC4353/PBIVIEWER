/**
 * useDebouncedSettings
 *
 * Encapsulates optimistic-update + debounced-persist for slider-driven
 * settings: PresentationMode's interval slider (onIntervalChange) and the
 * SettingsPage sliders (onDebouncedUpdate). Fluent's Slider fires onChange on
 * EVERY drag step, so persisting each step would flood the settings IPC and
 * disk-write path.
 *
 * onDebouncedUpdate(updates) / onIntervalChange(value):
 *   - Optimistic local update: push the new value into the settings store
 *     immediately so the slider thumb and anything reading the store
 *     track the drag without waiting on the IPC.
 *   - Debounced (300ms) updateSettings call persists to disk — one IPC per
 *     drag, not one per step.
 *
 * The pending debounce timer is FLUSHED on unmount: the still-unpersisted
 * delta is sent immediately. Clearing alone would silently drop the final
 * value of a drag that ends just before navigation — the store would show it
 * (optimistic) while disk does not, so the next launch quietly reverts it.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useSettingsStore } from '../../stores/settings-store';
import type { AppSettings } from '../../../shared/types';

export interface UseDebouncedSettingsResult {
  /** Slideshow-interval convenience wrapper (PresentationMode's slider). */
  onIntervalChange: (value: number) => void;
  /** Debounced optimistic write for arbitrary settings keys (sliders). */
  onDebouncedUpdate: (updates: Partial<AppSettings>) => void;
}

const PERSIST_DEBOUNCE_MS = 300;

export function useDebouncedSettings(): UseDebouncedSettingsResult {
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The not-yet-persisted delta. A ref (not state) so the unmount cleanup can
  // flush the LATEST value without re-running the effect on every change.
  const pendingRef = useRef<Partial<AppSettings> | null>(null);

  // Flush any pending debounced persist on unmount — cancel the timer, then
  // send the pending delta NOW so the last value of a drag is never dropped.
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
    // Optimistic local update: push the new value into the
    // store immediately so the slider thumb and anything
    // subscribed to the store track the drag without
    // waiting on the IPC. The debounced updateSettings call
    // below persists to disk.
    useSettingsStore.setState((prev) => ({
      settings: { ...prev.settings, ...updates },
    }));
    // Merge into the pending delta so interleaved keys within one debounce
    // window persist together rather than the later key dropping the earlier.
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
