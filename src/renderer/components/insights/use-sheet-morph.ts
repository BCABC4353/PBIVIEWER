import { useCallback, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useSharedElementMorph } from '../../lib/morph/use-shared-element-morph';
import { prefersReducedMotion } from './luce-motion';

export interface SheetState {
  workspaceId: string;
  el: HTMLElement | null;
}

export interface UseSheetMorphOptions {
  setSheet: React.Dispatch<React.SetStateAction<SheetState | null>>;
  timeScale?: number;
}

export interface SheetMorphResult {
  morphRef: React.RefObject<HTMLDivElement | null>;
  sourceRef: React.RefObject<Element | null>;
  openSheet: (workspaceId: string, el: HTMLElement) => void;
  closeSheet: (current: SheetState | null) => void;
}

function isLaidOut(el: Element | null): boolean {
  if (!el || typeof el.getBoundingClientRect !== 'function') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 || r.height > 0;
}

export function useSheetMorph({ setSheet, timeScale }: UseSheetMorphOptions): SheetMorphResult {
  const morphRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<Element | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const onClosed = useCallback(() => {
    setSheet(null);
    openerRef.current?.focus?.();
    openerRef.current = null;
  }, [setSheet]);

  const morph = useSharedElementMorph({
    morphRef,
    sourceRef,
    onClosed,
    timeScale,
  });

  const openSheet = useCallback(
    (workspaceId: string, el: HTMLElement) => {
      openerRef.current = el;
      sourceRef.current = el;
      setSheet({ workspaceId, el });

      if (prefersReducedMotion()) return;

      requestAnimationFrame(() => {
        if (!isLaidOut(morphRef.current)) return;
        morph.open();
      });
    },
    [morph, setSheet],
  );

  const closeSheet = useCallback(
    (current: SheetState | null) => {
      if (!current) return;
      if (!openerRef.current) {
        openerRef.current = current.el;
      }

      if (prefersReducedMotion() || !isLaidOut(morphRef.current)) {
        const opener = openerRef.current;
        openerRef.current = null;
        flushSync(() => setSheet(null));
        opener?.focus?.();
        return;
      }

      morph.close();
    },
    [morph, setSheet],
  );

  useEffect(() => {
    if (!(window as Window & { __HARNESS?: boolean }).__HARNESS) return;
    (window as Window & { __morphHandle?: { phase: () => string; progress: () => number } }).__morphHandle = {
      phase: () => morph.phase(),
      progress: () => morph.progress(),
    };
  });

  return { morphRef, sourceRef, openSheet, closeSheet };
}
