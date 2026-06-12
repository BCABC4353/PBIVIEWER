import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { makeScheduler } from '../../components/insights/spring-test-clock';
import {
  morphTransformAt,
  transformToCss,
} from './flip-geometry';
import type { Rect } from './flip-geometry';
import type { MomentumSpring } from '../../components/insights/spring-physics';

let capturedSpring: MomentumSpring | undefined;
let clockRef: ReturnType<typeof makeScheduler> | undefined;

vi.mock('../../components/insights/spring-physics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../components/insights/spring-physics')>();
  return {
    ...actual,
    createMomentumSpring: (opts: Parameters<typeof actual.createMomentumSpring>[0]) => {
      if (clockRef) {
        opts = { ...opts, now: clockRef.now, schedule: clockRef.schedule, cancel: clockRef.cancel };
      }
      const spring = actual.createMomentumSpring(opts);
      capturedSpring = spring;
      return spring;
    },
  };
});

let reducedMotionValue = false;
vi.mock('../../components/insights/luce-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../components/insights/luce-motion')>();
  return {
    ...actual,
    prefersReducedMotion: () => reducedMotionValue,
  };
});

import { useSharedElementMorph } from './use-shared-element-morph';

const TILE: Rect = { x: 40, y: 80, width: 160, height: 90 };
const SHEET: Rect = { x: 0, y: 0, width: 800, height: 600 };

function makeMorphEl(rect: Rect = SHEET): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({
    x: rect.x, y: rect.y,
    width: rect.width, height: rect.height,
    top: rect.y, left: rect.x,
    right: rect.x + rect.width, bottom: rect.y + rect.height,
    toJSON: () => ({}),
  });
  return el;
}

function makeSourceEl(rect: Rect = TILE): Element {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({
    x: rect.x, y: rect.y,
    width: rect.width, height: rect.height,
    top: rect.y, left: rect.x,
    right: rect.x + rect.width, bottom: rect.y + rect.height,
    toJSON: () => ({}),
  });
  return el;
}

function makeRefs(sourceRect = TILE, morphRect = SHEET): {
  morphRef: React.RefObject<HTMLElement | null>;
  sourceRef: React.RefObject<Element | null>;
} {
  const morphRef = { current: makeMorphEl(morphRect) } as React.RefObject<HTMLElement | null>;
  const sourceRef = { current: makeSourceEl(sourceRect) } as React.RefObject<Element | null>;
  return { morphRef, sourceRef };
}

beforeEach(() => {
  reducedMotionValue = false;
  capturedSpring = undefined;
  clockRef = makeScheduler();
});

afterEach(() => {
  clockRef = undefined;
});

describe('useSharedElementMorph — open drives progress 0→1', () => {
  it('at p=0 (initial open frame) transform equals tileRect placement', () => {
    const { morphRef, sourceRef } = makeRefs();
    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef }),
    );

    act(() => { result.current.open(); });

    const expectedTransform = transformToCss(morphTransformAt(TILE, SHEET, 0));
    expect(morphRef.current!.style.transform).toBe(expectedTransform);
  });

  it('progress reaches 1 after spring settles', () => {
    const { morphRef, sourceRef } = makeRefs();
    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef }),
    );

    act(() => { result.current.open(); });
    act(() => {
      for (let i = 0; i < 200 && clockRef!.hasPending(); i++) clockRef!.tick(16);
    });

    expect(result.current.progress()).toBeCloseTo(1, 3);
    expect(result.current.phase()).toBe('open');
  });

  it('at p=1 (settled) transform is the identity (sheetRect)', () => {
    const { morphRef, sourceRef } = makeRefs();
    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef }),
    );

    act(() => { result.current.open(); });
    act(() => {
      for (let i = 0; i < 200 && clockRef!.hasPending(); i++) clockRef!.tick(16);
    });

    const expectedTransform = transformToCss(morphTransformAt(TILE, SHEET, 1));
    const identityTransform = transformToCss({ translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 });
    expect(expectedTransform).toBe(identityTransform);
  });
});

describe('useSharedElementMorph — interrupt carries momentum (A-3/A-4)', () => {
  it('close during open uses the SAME spring instance (retarget, not new spring)', () => {
    const { morphRef, sourceRef } = makeRefs();
    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef }),
    );

    act(() => { result.current.open(); });
    const springAfterOpen = capturedSpring;

    act(() => {
      for (let i = 0; i < 5; i++) clockRef!.tick(16);
    });

    const progressMidOpen = result.current.progress();
    expect(progressMidOpen).toBeGreaterThan(0);
    expect(progressMidOpen).toBeLessThan(1);

    act(() => { result.current.close(); });

    expect(capturedSpring).toBe(springAfterOpen);
  });

  it('progress does NOT snap to 0 on mid-open close (continuity)', () => {
    const { morphRef, sourceRef } = makeRefs();
    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef }),
    );

    act(() => { result.current.open(); });
    act(() => {
      for (let i = 0; i < 5; i++) clockRef!.tick(16);
    });

    const progressBeforeClose = result.current.progress();
    act(() => { result.current.close(); });

    expect(result.current.progress()).toBeCloseTo(progressBeforeClose, 2);
  });

  it('velocity is non-zero immediately after interrupt (momentum carries)', () => {
    const { morphRef, sourceRef } = makeRefs();
    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef }),
    );

    act(() => { result.current.open(); });
    act(() => {
      for (let i = 0; i < 5; i++) clockRef!.tick(16);
    });

    act(() => { result.current.close(); });

    expect(capturedSpring!.velocity()).not.toBe(0);
  });

  it('open during close also reuses same spring (round-trip interrupt)', () => {
    const { morphRef, sourceRef } = makeRefs();
    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef }),
    );

    act(() => { result.current.open(); });
    act(() => {
      for (let i = 0; i < 5; i++) clockRef!.tick(16);
    });

    act(() => { result.current.close(); });
    const springAfterClose = capturedSpring;

    act(() => {
      for (let i = 0; i < 3; i++) clockRef!.tick(16);
    });

    act(() => { result.current.open(); });

    expect(capturedSpring).toBe(springAfterClose);
  });

  it('after interrupt spring eventually settles at new target', () => {
    const { morphRef, sourceRef } = makeRefs();
    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef }),
    );

    act(() => { result.current.open(); });
    act(() => {
      for (let i = 0; i < 5; i++) clockRef!.tick(16);
    });

    act(() => { result.current.close(); });
    act(() => {
      for (let i = 0; i < 200 && clockRef!.hasPending(); i++) clockRef!.tick(16);
    });

    expect(result.current.progress()).toBeCloseTo(0, 3);
    expect(result.current.phase()).toBe('idle');
  });
});

describe('useSharedElementMorph — reduced motion (A-7)', () => {
  it('open is instant under prefersReducedMotion', () => {
    reducedMotionValue = true;
    const { morphRef, sourceRef } = makeRefs();
    const onOpened = vi.fn();
    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef, onOpened }),
    );

    act(() => { result.current.open(); });

    expect(result.current.progress()).toBe(1);
    expect(result.current.phase()).toBe('open');
    expect(onOpened).toHaveBeenCalledOnce();
    expect(clockRef!.hasPending()).toBe(false);
  });

  it('close is instant under prefersReducedMotion', () => {
    reducedMotionValue = true;
    const { morphRef, sourceRef } = makeRefs();
    const onClosed = vi.fn();
    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef, onClosed }),
    );

    act(() => { result.current.open(); });
    act(() => { result.current.close(); });

    expect(result.current.progress()).toBe(0);
    expect(result.current.phase()).toBe('idle');
    expect(onClosed).toHaveBeenCalledOnce();
    expect(clockRef!.hasPending()).toBe(false);
  });

  it('no frames scheduled under prefersReducedMotion', () => {
    reducedMotionValue = true;
    const { morphRef, sourceRef } = makeRefs();
    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef }),
    );

    act(() => { result.current.open(); });
    act(() => { result.current.close(); });

    expect(clockRef!.hasPending()).toBe(false);
  });
});

describe('useSharedElementMorph — jsdom safety (zero rects)', () => {
  it('zero-dimension rects do not throw or produce NaN transforms', () => {
    const zeroRect: Rect = { x: 0, y: 0, width: 0, height: 0 };
    const { morphRef, sourceRef } = makeRefs(zeroRect, zeroRect);
    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef }),
    );

    expect(() => {
      act(() => { result.current.open(); });
      act(() => { clockRef!.tick(16); });
    }).not.toThrow();

    expect(morphRef.current!.style.transform).not.toContain('NaN');
    expect(morphRef.current!.style.transform).not.toContain('Infinity');
  });

  it('missing source element (null ref) does not throw', () => {
    const morphEl = makeMorphEl(SHEET);
    const morphRef = { current: morphEl } as React.RefObject<HTMLElement | null>;
    const sourceRef = { current: null } as React.RefObject<Element | null>;

    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef }),
    );

    expect(() => {
      act(() => { result.current.open(); });
    }).not.toThrow();
  });

  it('missing morph element (null ref) does not throw', () => {
    const morphRef = { current: null } as React.RefObject<HTMLElement | null>;
    const sourceRef = { current: makeSourceEl() } as React.RefObject<Element | null>;

    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef }),
    );

    expect(() => {
      act(() => { result.current.open(); });
    }).not.toThrow();
  });
});
