import { useRef, useCallback, useEffect } from 'react';
import { createMomentumSpring } from './spring-physics';
import type { MomentumSpring } from './spring-physics';
import {
  interpolateRect,
  rectToCss,
  crossfadeOpacities,
  normalizeRect,
} from './flip-geometry';
import type { Rect } from './flip-geometry';
import { prefersReducedMotion } from './reduced-motion';

export type MorphPhase = 'idle' | 'opening' | 'open' | 'closing';

export interface MorphCallbacks {
  onOpened?: () => void;
  onClosed?: () => void;
}

export interface SharedElementMorphHandle {
  open: () => void;
  close: () => void;
  phase: () => MorphPhase;
  progress: () => number;
}

export interface UseSharedElementMorphOptions extends MorphCallbacks {
  morphRef: React.RefObject<HTMLElement | null>;
  sourceRef: React.RefObject<Element | null>;
  sourceContentRef?: React.RefObject<HTMLElement | null>;
  targetContentRef?: React.RefObject<HTMLElement | null>;
  backdropRef?: React.RefObject<HTMLElement | null>;
  naturalSheetRectRef?: React.RefObject<Rect | null>;
  timeScale?: number;
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

function morphBoxShadow(p: number): string {
  const t = clamp01(p);
  return [
    '0 0 0 1px rgba(0, 0, 0, 0.65)',
    'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
    `0 ${1 + 3 * t}px ${2 + 6 * t}px rgba(0, 0, 0, ${0.5 + 0.1 * t})`,
    `0 ${8 + 16 * t}px ${24 + 40 * t}px ${-8 - 8 * t}px rgba(0, 0, 0, ${0.5 + 0.2 * t})`,
  ].join(', ');
}

function safeRect(el: Element | null): Rect {
  if (!el || typeof el.getBoundingClientRect !== 'function') {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const r = el.getBoundingClientRect();
  return normalizeRect({ x: r.x, y: r.y, width: r.width, height: r.height });
}

function applyMorphStyles(
  morphEl: HTMLElement,
  tileRect: Rect,
  sheetRect: Rect,
  p: number,
  sourceEl: HTMLElement | null,
  targetEl: HTMLElement | null,
  backdropEl: HTMLElement | null,
): void {
  const r = interpolateRect(tileRect, sheetRect, p);
  const css = rectToCss(r);
  morphEl.style.position = 'fixed';
  morphEl.style.transform = '';
  morphEl.style.left = css.left;
  morphEl.style.top = css.top;
  morphEl.style.width = css.width;
  morphEl.style.height = css.height;
  morphEl.style.boxShadow = morphBoxShadow(p);
  const opacities = crossfadeOpacities(p);
  if (sourceEl) sourceEl.style.opacity = String(opacities.source);
  if (targetEl) {
    targetEl.style.opacity = String(opacities.target);
    targetEl.style.pointerEvents = opacities.target > 0.6 ? 'auto' : 'none';
  }
  if (backdropEl) backdropEl.style.opacity = String(clamp01(p));
}

function settleMorphStyles(
  morphEl: HTMLElement,
  sheetRect: Rect,
  tileRect: Rect,
  sourceEl: HTMLElement | null,
  targetEl: HTMLElement | null,
  backdropEl: HTMLElement | null,
  atOpen: boolean,
): void {
  morphEl.style.transform = '';
  morphEl.style.boxShadow = '';
  if (atOpen) {
    const css = rectToCss(sheetRect);
    morphEl.style.position = 'fixed';
    morphEl.style.left = css.left;
    morphEl.style.top = css.top;
    morphEl.style.width = css.width;
    morphEl.style.height = css.height;
    if (sourceEl) sourceEl.style.opacity = '0';
    if (targetEl) {
      targetEl.style.opacity = '1';
      targetEl.style.pointerEvents = 'auto';
    }
    if (backdropEl) backdropEl.style.opacity = '1';
  } else {
    const css = rectToCss(tileRect);
    morphEl.style.position = 'fixed';
    morphEl.style.left = css.left;
    morphEl.style.top = css.top;
    morphEl.style.width = css.width;
    morphEl.style.height = css.height;
    if (sourceEl) sourceEl.style.opacity = '1';
    if (targetEl) {
      targetEl.style.opacity = '0';
      targetEl.style.pointerEvents = 'none';
    }
    if (backdropEl) backdropEl.style.opacity = '0';
  }
}

export function useSharedElementMorph(opts: UseSharedElementMorphOptions): SharedElementMorphHandle {
  const springRef = useRef<MomentumSpring | null>(null);
  const phaseRef = useRef<MorphPhase>('idle');
  const progressRef = useRef(0);
  const tileRectRef = useRef<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  const sheetRectRef = useRef<Rect>({ x: 0, y: 0, width: 0, height: 0 });

  const { morphRef, sourceRef, sourceContentRef, targetContentRef, backdropRef, naturalSheetRectRef, onOpened, onClosed, timeScale } = opts;

  const getOrCreateSpring = useCallback((): MomentumSpring => {
    if (springRef.current) return springRef.current;

    const spring = createMomentumSpring({
      initial: progressRef.current,
      timeScale,
      onUpdate: (pos, _vel, done) => {
        progressRef.current = pos;
        const morphEl = morphRef.current;
        if (!morphEl) return;

        applyMorphStyles(
          morphEl,
          tileRectRef.current,
          sheetRectRef.current,
          pos,
          sourceContentRef?.current ?? null,
          targetContentRef?.current ?? null,
          backdropRef?.current ?? null,
        );

        if (done) {
          if (phaseRef.current === 'opening') {
            phaseRef.current = 'open';
            settleMorphStyles(
              morphEl,
              sheetRectRef.current,
              tileRectRef.current,
              sourceContentRef?.current ?? null,
              targetContentRef?.current ?? null,
              backdropRef?.current ?? null,
              true,
            );
            onOpened?.();
          } else if (phaseRef.current === 'closing') {
            phaseRef.current = 'idle';
            settleMorphStyles(
              morphEl,
              sheetRectRef.current,
              tileRectRef.current,
              sourceContentRef?.current ?? null,
              targetContentRef?.current ?? null,
              backdropRef?.current ?? null,
              false,
            );
            onClosed?.();
          }
        }
      },
    });

    springRef.current = spring;
    return spring;
  }, [morphRef, sourceContentRef, targetContentRef, backdropRef, onOpened, onClosed, timeScale]);

  const open = useCallback((): void => {
    const morphEl = morphRef.current;
    if (!morphEl) return;

    if (prefersReducedMotion()) {
      progressRef.current = 1;
      phaseRef.current = 'open';
      morphEl.style.position = '';
      morphEl.style.transform = '';
      morphEl.style.left = '';
      morphEl.style.top = '';
      morphEl.style.width = '';
      morphEl.style.height = '';
      morphEl.style.boxShadow = '';
      if (sourceContentRef?.current) sourceContentRef.current.style.opacity = '0';
      if (targetContentRef?.current) {
        targetContentRef.current.style.opacity = '1';
        targetContentRef.current.style.pointerEvents = 'auto';
      }
      if (backdropRef?.current) backdropRef.current.style.opacity = '1';
      onOpened?.();
      return;
    }

    tileRectRef.current = safeRect(sourceRef.current);
    sheetRectRef.current = naturalSheetRectRef?.current ?? safeRect(morphEl);

    const prevPhase = phaseRef.current;
    phaseRef.current = 'opening';

    if (prevPhase === 'closing' || prevPhase === 'opening') {
      tileRectRef.current = safeRect(sourceRef.current);
      const spring = getOrCreateSpring();
      spring.retarget(1);
    } else {
      if (springRef.current) {
        springRef.current.stop();
        springRef.current = null;
      }
      progressRef.current = 0;
      applyMorphStyles(
        morphEl,
        tileRectRef.current,
        sheetRectRef.current,
        0,
        sourceContentRef?.current ?? null,
        targetContentRef?.current ?? null,
        backdropRef?.current ?? null,
      );
      const spring = getOrCreateSpring();
      spring.retarget(1);
    }
  }, [morphRef, sourceRef, sourceContentRef, targetContentRef, backdropRef, naturalSheetRectRef, onOpened, getOrCreateSpring]);

  const close = useCallback((): void => {
    const morphEl = morphRef.current;
    if (!morphEl) return;

    if (prefersReducedMotion()) {
      progressRef.current = 0;
      phaseRef.current = 'idle';
      morphEl.style.position = '';
      morphEl.style.transform = '';
      morphEl.style.left = '';
      morphEl.style.top = '';
      morphEl.style.width = '';
      morphEl.style.height = '';
      morphEl.style.boxShadow = '';
      if (sourceContentRef?.current) sourceContentRef.current.style.opacity = '1';
      if (targetContentRef?.current) {
        targetContentRef.current.style.opacity = '0';
        targetContentRef.current.style.pointerEvents = 'none';
      }
      if (backdropRef?.current) backdropRef.current.style.opacity = '0';
      onClosed?.();
      return;
    }

    const prevPhase = phaseRef.current;
    phaseRef.current = 'closing';

    if (prevPhase === 'opening' || prevPhase === 'closing') {
      tileRectRef.current = safeRect(sourceRef.current);
      const spring = getOrCreateSpring();
      spring.retarget(0);
    } else {
      if (springRef.current) {
        springRef.current.stop();
        springRef.current = null;
      }
      tileRectRef.current = safeRect(sourceRef.current);
      sheetRectRef.current = safeRect(morphEl);
      progressRef.current = 1;
      const spring = getOrCreateSpring();
      spring.retarget(0);
    }
  }, [morphRef, sourceRef, sourceContentRef, targetContentRef, backdropRef, onClosed, getOrCreateSpring]);

  useEffect(() => {
    return () => {
      springRef.current?.stop();
    };
  }, []);

  return {
    open,
    close,
    phase: () => phaseRef.current,
    progress: () => progressRef.current,
  };
}
