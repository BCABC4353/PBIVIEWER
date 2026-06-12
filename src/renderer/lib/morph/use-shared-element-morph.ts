import { useRef, useCallback, useEffect } from 'react';
import { createMomentumSpring } from '../../components/insights/spring-physics';
import type { MomentumSpring } from '../../components/insights/spring-physics';
import {
  morphTransformAt,
  transformToCss,
  crossfadeOpacities,
  normalizeRect,
} from './flip-geometry';
import type { Rect } from './flip-geometry';
import { prefersReducedMotion } from '../../components/insights/luce-motion';

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
): void {
  const t = morphTransformAt(tileRect, sheetRect, p);
  morphEl.style.transform = transformToCss(t);
  morphEl.style.transformOrigin = '0 0';
  const opacities = crossfadeOpacities(p);
  if (sourceEl) sourceEl.style.opacity = String(opacities.source);
  if (targetEl) targetEl.style.opacity = String(opacities.target);
}

function settleMorphStyles(
  morphEl: HTMLElement,
  sourceEl: HTMLElement | null,
  targetEl: HTMLElement | null,
  atOpen: boolean,
): void {
  morphEl.style.transform = '';
  morphEl.style.transformOrigin = '';
  if (atOpen) {
    if (sourceEl) sourceEl.style.opacity = '0';
    if (targetEl) targetEl.style.opacity = '1';
  } else {
    if (sourceEl) sourceEl.style.opacity = '1';
    if (targetEl) targetEl.style.opacity = '0';
  }
}

export function useSharedElementMorph(opts: UseSharedElementMorphOptions): SharedElementMorphHandle {
  const springRef = useRef<MomentumSpring | null>(null);
  const phaseRef = useRef<MorphPhase>('idle');
  const progressRef = useRef(0);
  const tileRectRef = useRef<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  const sheetRectRef = useRef<Rect>({ x: 0, y: 0, width: 0, height: 0 });

  const { morphRef, sourceRef, sourceContentRef, targetContentRef, onOpened, onClosed } = opts;

  const getOrCreateSpring = useCallback((): MomentumSpring => {
    if (springRef.current) return springRef.current;

    const spring = createMomentumSpring({
      initial: progressRef.current,
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
        );

        if (done) {
          if (phaseRef.current === 'opening') {
            phaseRef.current = 'open';
            settleMorphStyles(
              morphEl,
              sourceContentRef?.current ?? null,
              targetContentRef?.current ?? null,
              true,
            );
            onOpened?.();
          } else if (phaseRef.current === 'closing') {
            phaseRef.current = 'idle';
            settleMorphStyles(
              morphEl,
              sourceContentRef?.current ?? null,
              targetContentRef?.current ?? null,
              false,
            );
            onClosed?.();
          }
        }
      },
    });

    springRef.current = spring;
    return spring;
  }, [morphRef, sourceContentRef, targetContentRef, onOpened, onClosed]);

  const open = useCallback((): void => {
    const morphEl = morphRef.current;
    if (!morphEl) return;

    if (prefersReducedMotion()) {
      progressRef.current = 1;
      phaseRef.current = 'open';
      settleMorphStyles(
        morphEl,
        sourceContentRef?.current ?? null,
        targetContentRef?.current ?? null,
        true,
      );
      onOpened?.();
      return;
    }

    tileRectRef.current = safeRect(sourceRef.current);
    sheetRectRef.current = safeRect(morphEl);

    const prevPhase = phaseRef.current;
    phaseRef.current = 'opening';

    if (prevPhase === 'closing' || prevPhase === 'opening') {
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
      );
      const spring = getOrCreateSpring();
      spring.retarget(1);
    }
  }, [morphRef, sourceRef, sourceContentRef, targetContentRef, onOpened, getOrCreateSpring]);

  const close = useCallback((): void => {
    const morphEl = morphRef.current;
    if (!morphEl) return;

    if (prefersReducedMotion()) {
      progressRef.current = 0;
      phaseRef.current = 'idle';
      settleMorphStyles(
        morphEl,
        sourceContentRef?.current ?? null,
        targetContentRef?.current ?? null,
        false,
      );
      onClosed?.();
      return;
    }

    const prevPhase = phaseRef.current;
    phaseRef.current = 'closing';

    if (prevPhase === 'opening' || prevPhase === 'closing') {
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
  }, [morphRef, sourceRef, sourceContentRef, targetContentRef, onClosed, getOrCreateSpring]);

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
