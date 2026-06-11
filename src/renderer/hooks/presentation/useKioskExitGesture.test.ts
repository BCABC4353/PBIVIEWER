
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import {
  isEscape,
  isChordExit,
  useKioskExitGesture,
} from './useKioskExitGesture';
import { KIOSK } from '../../../shared/constants';

describe('PROD-S1 gesture predicates', () => {
  it('isEscape matches both Escape spellings', () => {
    expect(isEscape({ key: 'Escape', ctrlKey: false, shiftKey: false })).toBe(true);
    expect(isEscape({ key: 'Esc', ctrlKey: false, shiftKey: false })).toBe(true);
    expect(isEscape({ key: 'a', ctrlKey: false, shiftKey: false })).toBe(false);
  });

  it('isChordExit requires Ctrl+Shift+Q (case-insensitive), not the OS-reserved Ctrl+Shift+Esc', () => {
    expect(isChordExit({ key: 'Q', ctrlKey: true, shiftKey: true })).toBe(true);
    expect(isChordExit({ key: 'q', ctrlKey: true, shiftKey: true })).toBe(true);
    expect(isChordExit({ key: 'Q', ctrlKey: true, shiftKey: false })).toBe(false);
    expect(isChordExit({ key: 'Q', ctrlKey: false, shiftKey: true })).toBe(false);
    expect(isChordExit({ key: 'a', ctrlKey: true, shiftKey: true })).toBe(false);
    expect(isChordExit({ key: 'Escape', ctrlKey: true, shiftKey: true })).toBe(false);
  });
});

function dispatchKeyDown(init: KeyboardEventInit) {
  window.dispatchEvent(new KeyboardEvent('keydown', init));
}
function dispatchKeyUp(init: KeyboardEventInit) {
  window.dispatchEvent(new KeyboardEvent('keyup', init));
}

describe('PROD-S1 useKioskExitGesture hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('exits after holding Escape for the hold duration', () => {
    const onExit = vi.fn();
    renderHook(() => useKioskExitGesture({ onExit }));

    act(() => dispatchKeyDown({ key: 'Escape' }));
    act(() => {
      vi.advanceTimersByTime(KIOSK.ESCAPE_HOLD_MS - 1);
    });
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('does not exit if Escape is released before the hold completes', () => {
    const onExit = vi.fn();
    renderHook(() => useKioskExitGesture({ onExit }));

    act(() => dispatchKeyDown({ key: 'Escape' }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => dispatchKeyUp({ key: 'Escape' }));
    act(() => {
      vi.advanceTimersByTime(KIOSK.ESCAPE_HOLD_MS);
    });
    expect(onExit).not.toHaveBeenCalled();
  });

  it('Ctrl+Shift+Q exits immediately', () => {
    const onExit = vi.fn();
    renderHook(() => useKioskExitGesture({ onExit }));

    act(() => dispatchKeyDown({ key: 'Q', ctrlKey: true, shiftKey: true }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('the OS-reserved Ctrl+Shift+Esc no longer triggers exit', () => {
    const onExit = vi.fn();
    renderHook(() => useKioskExitGesture({ onExit }));

    act(() => dispatchKeyDown({ key: 'Escape', ctrlKey: true, shiftKey: true }));
    expect(onExit).not.toHaveBeenCalled();
  });

  it('another key cancels an in-progress Escape hold', () => {
    const onExit = vi.fn();
    renderHook(() => useKioskExitGesture({ onExit }));

    act(() => dispatchKeyDown({ key: 'Escape' }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => dispatchKeyDown({ key: 'a' }));
    act(() => {
      vi.advanceTimersByTime(KIOSK.ESCAPE_HOLD_MS);
    });
    expect(onExit).not.toHaveBeenCalled();
  });

  it('ignores key-repeat keydown while a hold is armed (single exit)', () => {
    const onExit = vi.fn();
    renderHook(() => useKioskExitGesture({ onExit }));

    act(() => dispatchKeyDown({ key: 'Escape' }));
    act(() => dispatchKeyDown({ key: 'Escape', repeat: true }));
    act(() => {
      vi.advanceTimersByTime(KIOSK.ESCAPE_HOLD_MS);
    });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('removes listeners and clears timer on unmount (no leak)', () => {
    const onExit = vi.fn();
    const { unmount } = renderHook(() => useKioskExitGesture({ onExit }));

    act(() => dispatchKeyDown({ key: 'Escape' }));
    unmount();
    act(() => {
      vi.advanceTimersByTime(KIOSK.ESCAPE_HOLD_MS * 2);
    });
    act(() => dispatchKeyDown({ key: 'Q', ctrlKey: true, shiftKey: true }));
    expect(onExit).not.toHaveBeenCalled();
  });

  it('does not attach listeners when disabled', () => {
    const onExit = vi.fn();
    renderHook(() => useKioskExitGesture({ onExit, enabled: false }));
    act(() => dispatchKeyDown({ key: 'Q', ctrlKey: true, shiftKey: true }));
    expect(onExit).not.toHaveBeenCalled();
  });
});
