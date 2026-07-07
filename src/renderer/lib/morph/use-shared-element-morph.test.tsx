import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { makeScheduler } from './spring-test-clock';
import { interpolateRect, rectToCss } from './flip-geometry';
import type { MomentumSpring } from './spring-physics';
import { TILE, SHEET, makeRefs } from './morph-test-harness';

let capturedSpring: MomentumSpring | undefined;
let clockRef: ReturnType<typeof makeScheduler> | undefined;

vi.mock('./spring-physics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./spring-physics')>();
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
vi.mock('./reduced-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./reduced-motion')>();
  return {
    ...actual,
    prefersReducedMotion: () => reducedMotionValue,
  };
});

import { useSharedElementMorph } from './use-shared-element-morph';

beforeEach(() => {
  reducedMotionValue = false;
  capturedSpring = undefined;
  clockRef = makeScheduler();
});

afterEach(() => {
  clockRef = undefined;
});

describe('useSharedElementMorph — open drives progress 0→1', () => {
  it('at p=0 (initial open frame) left/top/width/height equal tileRect placement', () => {
    const { morphRef, sourceRef } = makeRefs();
    const { result } = renderHook(() => useSharedElementMorph({ morphRef, sourceRef }));

    act(() => { result.current.open(); });

    const expectedCss = rectToCss(interpolateRect(TILE, SHEET, 0));
    expect(morphRef.current!.style.left).toBe(expectedCss.left);
    expect(morphRef.current!.style.top).toBe(expectedCss.top);
    expect(morphRef.current!.style.width).toBe(expectedCss.width);
    expect(morphRef.current!.style.height).toBe(expectedCss.height);
    expect(morphRef.current!.style.transform).toBe('');
  });

  it('progress reaches 1 after spring settles', () => {
    const { morphRef, sourceRef } = makeRefs();
    const { result } = renderHook(() => useSharedElementMorph({ morphRef, sourceRef }));

    act(() => { result.current.open(); });
    act(() => {
      for (let i = 0; i < 200 && clockRef!.hasPending(); i++) clockRef!.tick(16);
    });

    expect(result.current.progress()).toBeCloseTo(1, 3);
    expect(result.current.phase()).toBe('open');
  });

  it('at p=1 (settled open) geometry is pinned to the natural sheet rect, transform cleared', () => {
    const { morphRef, sourceRef } = makeRefs();
    const { result } = renderHook(() => useSharedElementMorph({ morphRef, sourceRef }));

    act(() => { result.current.open(); });
    act(() => {
      for (let i = 0; i < 200 && clockRef!.hasPending(); i++) clockRef!.tick(16);
    });

    expect(morphRef.current!.style.position).toBe('fixed');
    expect(morphRef.current!.style.left).toBe(`${SHEET.x}px`);
    expect(morphRef.current!.style.top).toBe(`${SHEET.y}px`);
    expect(morphRef.current!.style.width).toBe(`${SHEET.width}px`);
    expect(morphRef.current!.style.height).toBe(`${SHEET.height}px`);
    expect(morphRef.current!.style.transform).toBe('');
  });

  it('mid-flight width is strictly between tileRect and naturalSheetRect (not degenerate — regression for stamped-rect bug)', () => {
    const { morphRef, sourceRef } = makeRefs();
    const naturalSheetRectRef = { current: SHEET };
    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef, naturalSheetRectRef }),
    );

    act(() => { result.current.open(); });
    act(() => {
      for (let i = 0; i < 5; i++) clockRef!.tick(16);
    });

    const p = result.current.progress();
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);

    const w = parseFloat(morphRef.current!.style.width);
    expect(w).toBeGreaterThan(TILE.width);
    expect(w).toBeLessThan(SHEET.width);
  });

  it('naturalSheetRectRef drives animation target, not the stamped morphEl rect (natural≠settle regression)', () => {
    const STAMPED: import('./flip-geometry').Rect = { x: 148, y: 252, width: 357, height: 124 };
    const NATURAL: import('./flip-geometry').Rect = { x: 20, y: 50, width: 880, height: 600 };
    const morphEl = document.createElement('div');
    morphEl.getBoundingClientRect = () => ({
      x: STAMPED.x, y: STAMPED.y,
      width: STAMPED.width, height: STAMPED.height,
      top: STAMPED.y, left: STAMPED.x,
      right: STAMPED.x + STAMPED.width, bottom: STAMPED.y + STAMPED.height,
      toJSON: () => ({}),
    });
    const sourceEl = document.createElement('div');
    sourceEl.getBoundingClientRect = () => ({
      x: TILE.x, y: TILE.y,
      width: TILE.width, height: TILE.height,
      top: TILE.y, left: TILE.x,
      right: TILE.x + TILE.width, bottom: TILE.y + TILE.height,
      toJSON: () => ({}),
    });
    const morphRef = { current: morphEl } as React.RefObject<HTMLElement | null>;
    const sourceRef = { current: sourceEl } as React.RefObject<Element | null>;
    const naturalSheetRectRef = { current: NATURAL };

    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef, naturalSheetRectRef }),
    );

    act(() => { result.current.open(); });
    act(() => {
      for (let i = 0; i < 5; i++) clockRef!.tick(16);
    });

    const p = result.current.progress();
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);

    const w = parseFloat(morphEl.style.width);
    const h = parseFloat(morphEl.style.height);
    expect(w).toBeGreaterThan(STAMPED.width);
    expect(w).toBeLessThanOrEqual(NATURAL.width + 1);
    expect(h).toBeGreaterThan(STAMPED.height);
    expect(h).toBeLessThanOrEqual(NATURAL.height + 1);
  });
});

describe('useSharedElementMorph — interrupt carries momentum (A-3/A-4)', () => {
  it('close during open uses the SAME spring instance (retarget, not new spring)', () => {
    const { morphRef, sourceRef } = makeRefs();
    const { result } = renderHook(() => useSharedElementMorph({ morphRef, sourceRef }));

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
    const { result } = renderHook(() => useSharedElementMorph({ morphRef, sourceRef }));

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
    const { result } = renderHook(() => useSharedElementMorph({ morphRef, sourceRef }));

    act(() => { result.current.open(); });
    act(() => {
      for (let i = 0; i < 5; i++) clockRef!.tick(16);
    });

    act(() => { result.current.close(); });

    expect(capturedSpring!.velocity()).not.toBe(0);
  });

  it('open during close also reuses same spring (round-trip interrupt)', () => {
    const { morphRef, sourceRef } = makeRefs();
    const { result } = renderHook(() => useSharedElementMorph({ morphRef, sourceRef }));

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
    const { result } = renderHook(() => useSharedElementMorph({ morphRef, sourceRef }));

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
    const { result } = renderHook(() => useSharedElementMorph({ morphRef, sourceRef, onOpened }));

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
    const { result } = renderHook(() => useSharedElementMorph({ morphRef, sourceRef, onClosed }));

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
    const { result } = renderHook(() => useSharedElementMorph({ morphRef, sourceRef }));

    act(() => { result.current.open(); });
    act(() => { result.current.close(); });

    expect(clockRef!.hasPending()).toBe(false);
  });
});

describe('useSharedElementMorph — jsdom safety (zero rects)', () => {
  it('zero-dimension rects do not throw or produce NaN geometry', () => {
    const zeroRect = { x: 0, y: 0, width: 0, height: 0 };
    const { morphRef, sourceRef } = makeRefs(zeroRect, zeroRect);
    const { result } = renderHook(() => useSharedElementMorph({ morphRef, sourceRef }));

    expect(() => {
      act(() => { result.current.open(); });
      act(() => { clockRef!.tick(16); });
    }).not.toThrow();

    expect(morphRef.current!.style.left).not.toContain('NaN');
    expect(morphRef.current!.style.left).not.toContain('Infinity');
    expect(morphRef.current!.style.transform).toBe('');
  });

  it('missing source element (null ref) does not throw', () => {
    const { morphRef } = makeRefs();
    const sourceRef = { current: null } as React.RefObject<Element | null>;

    const { result } = renderHook(() => useSharedElementMorph({ morphRef, sourceRef }));

    expect(() => {
      act(() => { result.current.open(); });
    }).not.toThrow();
  });

  it('missing morph element (null ref) does not throw', () => {
    const { sourceRef } = makeRefs();
    const morphRef = { current: null } as React.RefObject<HTMLElement | null>;

    const { result } = renderHook(() => useSharedElementMorph({ morphRef, sourceRef }));

    expect(() => {
      act(() => { result.current.open(); });
    }).not.toThrow();
  });
});

describe('useSharedElementMorph — backdrop fade tracks progress', () => {
  function makeBackdropSetup() {
    const { morphRef, sourceRef } = makeRefs();
    const backdropRef = { current: document.createElement('div') } as React.RefObject<HTMLElement | null>;
    const targetContentRef = { current: document.createElement('div') } as React.RefObject<HTMLElement | null>;
    return { morphRef, sourceRef, backdropRef, targetContentRef };
  }

  it('backdrop opacity is 0 on the first open frame', () => {
    const { morphRef, sourceRef, backdropRef, targetContentRef } = makeBackdropSetup();
    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef, backdropRef, targetContentRef }),
    );

    act(() => { result.current.open(); });

    expect(parseFloat(backdropRef.current!.style.opacity)).toBe(0);
  });

  it('backdrop opacity mid-flight equals progress (strictly between 0 and 1)', () => {
    const { morphRef, sourceRef, backdropRef, targetContentRef } = makeBackdropSetup();
    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef, backdropRef, targetContentRef }),
    );

    act(() => { result.current.open(); });
    act(() => {
      for (let i = 0; i < 5; i++) clockRef!.tick(16);
    });

    const p = result.current.progress();
    const opacity = parseFloat(backdropRef.current!.style.opacity);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThanOrEqual(1);
    expect(opacity).toBeCloseTo(Math.min(1, p), 3);
  });

  it('backdrop settles at 1 when open and 0 after close', () => {
    const { morphRef, sourceRef, backdropRef, targetContentRef } = makeBackdropSetup();
    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef, backdropRef, targetContentRef }),
    );

    act(() => { result.current.open(); });
    act(() => {
      for (let i = 0; i < 200 && clockRef!.hasPending(); i++) clockRef!.tick(16);
    });
    expect(backdropRef.current!.style.opacity).toBe('1');

    act(() => { result.current.close(); });
    act(() => {
      for (let i = 0; i < 200 && clockRef!.hasPending(); i++) clockRef!.tick(16);
    });
    expect(backdropRef.current!.style.opacity).toBe('0');
  });

  it('detail content ignores pointer events early in flight and accepts them once settled', () => {
    const { morphRef, sourceRef, backdropRef, targetContentRef } = makeBackdropSetup();
    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef, backdropRef, targetContentRef }),
    );

    act(() => { result.current.open(); });
    expect(targetContentRef.current!.style.pointerEvents).toBe('none');

    act(() => {
      for (let i = 0; i < 200 && clockRef!.hasPending(); i++) clockRef!.tick(16);
    });
    expect(targetContentRef.current!.style.pointerEvents).toBe('auto');

    act(() => { result.current.close(); });
    act(() => {
      for (let i = 0; i < 200 && clockRef!.hasPending(); i++) clockRef!.tick(16);
    });
    expect(targetContentRef.current!.style.pointerEvents).toBe('none');
  });

  it('in-flight box shadow is applied and cleared back to CSS at settle', () => {
    const { morphRef, sourceRef, backdropRef, targetContentRef } = makeBackdropSetup();
    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef, backdropRef, targetContentRef }),
    );

    act(() => { result.current.open(); });
    act(() => {
      for (let i = 0; i < 5; i++) clockRef!.tick(16);
    });
    expect(morphRef.current!.style.boxShadow).not.toBe('');

    act(() => {
      for (let i = 0; i < 200 && clockRef!.hasPending(); i++) clockRef!.tick(16);
    });
    expect(morphRef.current!.style.boxShadow).toBe('');
  });

  it('reduced motion pins backdrop to 1 on open and 0 on close', () => {
    reducedMotionValue = true;
    const { morphRef, sourceRef, backdropRef, targetContentRef } = makeBackdropSetup();
    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef, backdropRef, targetContentRef }),
    );

    act(() => { result.current.open(); });
    expect(backdropRef.current!.style.opacity).toBe('1');
    expect(targetContentRef.current!.style.pointerEvents).toBe('auto');

    act(() => { result.current.close(); });
    expect(backdropRef.current!.style.opacity).toBe('0');
    expect(targetContentRef.current!.style.pointerEvents).toBe('none');
  });
});
