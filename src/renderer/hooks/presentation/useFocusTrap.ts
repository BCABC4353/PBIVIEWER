/**
 * useFocusTrap
 *
 * Keyboard focus management for the presentation overlay. Two responsibilities:
 * 1. Save the previously-focused element on mount and restore it on unmount so
 *    screen-reader / keyboard users aren't stranded after exit.
 * 2. A simple focus trap that cycles Tab / Shift+Tab among the focusable
 *    elements inside the overlay (a capture-phase document keydown listener).
 *
 * Pass the ref of the overlay root element.
 */

import { useEffect, useRef } from 'react';

export function useFocusTrap(overlayRef: React.RefObject<HTMLElement>): void {
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Focus management: save previously-focused element on mount, restore on unmount.
  // Keeps screen-reader / keyboard users from being stranded after exit.
  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    return () => {
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
        try { prev.focus(); } catch { /* ignore */ }
      }
    };
  }, []);

  // Simple focus trap: cycle Tab / Shift+Tab among focusable elements inside
  // the overlay. Avoids dragging in a focus-trap library for this single use.
  useEffect(() => {
    const handleTrap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const root = overlayRef.current;
      if (!root) return;

      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('aria-hidden') && el.offsetParent !== null);

      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      // noUncheckedIndexedAccess narrows these to T | undefined, but the
      // length>0 guard above means both are defined here.
      if (!first || !last) return;
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !root.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleTrap, true);
    return () => document.removeEventListener('keydown', handleTrap, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export default useFocusTrap;
