import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useSharedElementMorph } from '../../lib/morph/use-shared-element-morph';
import { normalizeRect } from '../../lib/morph/flip-geometry';
import type { Rect } from '../../lib/morph/flip-geometry';
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
  sourceContentRef: React.RefObject<HTMLElement | null>;
  targetContentRef: React.RefObject<HTMLElement | null>;
  backdropRef: React.RefObject<HTMLElement | null>;
  detailMounted: boolean;
  openSheet: (workspaceId: string, el: HTMLElement) => void;
  closeSheet: (current: SheetState | null) => void;
  toggleSheet: (current: SheetState | null) => void;
}

function isLaidOut(el: Element | null): boolean {
  if (!el || typeof el.getBoundingClientRect !== 'function') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 || r.height > 0;
}

function applyTileGeometry(morphEl: HTMLElement, tileEl: Element): void {
  const r = tileEl.getBoundingClientRect();
  morphEl.style.position = 'fixed';
  morphEl.style.left = `${r.left}px`;
  morphEl.style.top = `${r.top}px`;
  morphEl.style.width = `${r.width}px`;
  morphEl.style.height = `${r.height}px`;
}

export function useSheetMorph({ setSheet, timeScale }: UseSheetMorphOptions): SheetMorphResult {
  const morphRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<Element | null>(null);
  const sourceContentRef = useRef<HTMLElement | null>(null);
  const targetContentRef = useRef<HTMLElement | null>(null);
  const backdropRef = useRef<HTMLElement | null>(null);
  const naturalSheetRectRef = useRef<Rect | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [detailMounted, setDetailMounted] = useState(false);

  const onClosed = useCallback(() => {
    const opener = openerRef.current;
    openerRef.current = null;
    flushSync(() => { setSheet(null); setDetailMounted(false); });
    opener?.focus?.();
  }, [setSheet]);

  const morph = useSharedElementMorph({
    morphRef,
    sourceRef,
    sourceContentRef,
    targetContentRef,
    backdropRef,
    naturalSheetRectRef,
    onClosed,
    timeScale,
  });

  const openSheet = useCallback(
    (workspaceId: string, el: HTMLElement) => {
      openerRef.current = el;
      sourceRef.current = el;

      if (prefersReducedMotion()) {
        flushSync(() => { setSheet({ workspaceId, el }); setDetailMounted(true); });
        if (sourceContentRef.current) sourceContentRef.current.style.opacity = '0';
        if (targetContentRef.current) {
          targetContentRef.current.style.opacity = '1';
          targetContentRef.current.style.pointerEvents = 'auto';
        }
        if (backdropRef.current) backdropRef.current.style.opacity = '1';
        return;
      }

      const tileEl = el;

      flushSync(() => {
        setSheet({ workspaceId, el });
        setDetailMounted(true);
      });

      if (backdropRef.current) backdropRef.current.style.opacity = '0';

      const morphEl = morphRef.current;
      if (morphEl && isLaidOut(tileEl)) {
        const r = morphEl.getBoundingClientRect();
        naturalSheetRectRef.current = normalizeRect({ x: r.x, y: r.y, width: r.width, height: r.height });
        applyTileGeometry(morphEl, tileEl);
      }

      const attemptOpen = (): void => {
        const mel = morphRef.current;
        if (!mel) return;
        if (isLaidOut(mel)) {
          morph.open();
          return;
        }
        if (typeof ResizeObserver === 'undefined') {
          requestAnimationFrame(() => {
            if (isLaidOut(morphRef.current)) morph.open();
          });
          return;
        }
        const ro = new ResizeObserver(() => {
          ro.disconnect();
          if (isLaidOut(morphRef.current)) {
            morph.open();
          }
        });
        ro.observe(mel);
        requestAnimationFrame(() => {
          if (isLaidOut(morphRef.current)) {
            ro.disconnect();
            morph.open();
          }
        });
      };

      requestAnimationFrame(attemptOpen);
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
        flushSync(() => { setSheet(null); setDetailMounted(false); });
        opener?.focus?.();
        return;
      }

      morph.close();
    },
    [morph, setSheet],
  );

  const toggleSheet = useCallback(
    (current: SheetState | null) => {
      if (!current) return;
      const phase = morph.phase();
      if (phase === 'opening') {
        morph.close();
        return;
      }
      if (phase === 'closing') {
        morph.open();
        return;
      }
      closeSheet(current);
    },
    [morph, closeSheet],
  );

  useEffect(() => {
    if (!(window as Window & { __HARNESS?: boolean }).__HARNESS) return;
    (window as Window & { __morphHandle?: { phase: () => string; progress: () => number } }).__morphHandle = {
      phase: () => morph.phase(),
      progress: () => morph.progress(),
    };
  });

  return { morphRef, sourceRef, sourceContentRef, targetContentRef, backdropRef, detailMounted, openSheet, closeSheet, toggleSheet };
}
