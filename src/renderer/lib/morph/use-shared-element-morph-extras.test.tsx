import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { render } from '@testing-library/react';
import { makeScheduler } from './spring-test-clock';
import {
  interpolateRect,
  rectToCss,
  crossfadeOpacities,
} from './flip-geometry';
import type { Rect } from './flip-geometry';
import type { MomentumSpring } from './spring-physics';

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
import { MorphSurface } from './morph-surface';

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

describe('useSharedElementMorph — cross-fade opacities (A-6)', () => {
  it('source content fades from 1 to 0 and target content fades from 0 to 1', () => {
    const { morphRef, sourceRef } = makeRefs();
    const sourceContentEl = document.createElement('div');
    const targetContentEl = document.createElement('div');
    const sourceContentRef = { current: sourceContentEl } as React.RefObject<HTMLElement | null>;
    const targetContentRef = { current: targetContentEl } as React.RefObject<HTMLElement | null>;

    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef, sourceContentRef, targetContentRef }),
    );

    act(() => { result.current.open(); });

    const opacitiesAtStart = crossfadeOpacities(0);
    expect(sourceContentEl.style.opacity).toBe(String(opacitiesAtStart.source));
    expect(targetContentEl.style.opacity).toBe(String(opacitiesAtStart.target));

    act(() => {
      for (let i = 0; i < 200 && clockRef!.hasPending(); i++) clockRef!.tick(16);
    });

    expect(Number(sourceContentEl.style.opacity)).toBeCloseTo(0, 1);
    expect(Number(targetContentEl.style.opacity)).toBeCloseTo(1, 1);
  });

  it('opacities move with progress during animation', () => {
    const { morphRef, sourceRef } = makeRefs();
    const sourceContentEl = document.createElement('div');
    const targetContentEl = document.createElement('div');
    const sourceContentRef = { current: sourceContentEl } as React.RefObject<HTMLElement | null>;
    const targetContentRef = { current: targetContentEl } as React.RefObject<HTMLElement | null>;

    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef, sourceContentRef, targetContentRef }),
    );

    act(() => { result.current.open(); });
    act(() => {
      for (let i = 0; i < 5; i++) clockRef!.tick(16);
    });

    const midProgress = result.current.progress();
    expect(midProgress).toBeGreaterThan(0);
    expect(midProgress).toBeLessThan(1);

    const srcOp = Number(sourceContentEl.style.opacity);
    const tgtOp = Number(targetContentEl.style.opacity);
    expect(srcOp).toBeGreaterThanOrEqual(0);
    expect(srcOp).toBeLessThanOrEqual(1);
    expect(tgtOp).toBeGreaterThanOrEqual(0);
    expect(tgtOp).toBeLessThanOrEqual(1);
  });
});

describe('MorphSurface — pointer-events:none (A-5)', () => {
  it('morph surface has pointer-events:none style', () => {
    const sourceRef = { current: null } as React.RefObject<Element | null>;
    const { container } = render(
      <MorphSurface sourceRef={sourceRef}>
        <div>content</div>
      </MorphSurface>,
    );
    const surfaceEl = container.firstChild as HTMLElement;
    expect(surfaceEl.style.pointerEvents).toBe('none');
  });

  it('morph surface exposes data-morph-node attribute for harness selection', () => {
    const sourceRef = { current: null } as React.RefObject<Element | null>;
    const { container } = render(
      <MorphSurface sourceRef={sourceRef}>
        <div>content</div>
      </MorphSurface>,
    );
    const surfaceEl = container.firstChild as HTMLElement;
    expect(surfaceEl.getAttribute('data-morph-node')).toBe('true');
  });
});

describe('useSharedElementMorph — lifecycle callbacks (A-8)', () => {
  it('calls onOpened when spring settles at 1', () => {
    const onOpened = vi.fn();
    const { morphRef, sourceRef } = makeRefs();
    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef, onOpened }),
    );

    act(() => { result.current.open(); });
    act(() => {
      for (let i = 0; i < 200 && clockRef!.hasPending(); i++) clockRef!.tick(16);
    });

    expect(onOpened).toHaveBeenCalledOnce();
  });

  it('calls onClosed when spring settles at 0', () => {
    const onClosed = vi.fn();
    const { morphRef, sourceRef } = makeRefs();
    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef, onClosed }),
    );

    act(() => { result.current.open(); });
    act(() => {
      for (let i = 0; i < 200 && clockRef!.hasPending(); i++) clockRef!.tick(16);
    });

    act(() => { result.current.close(); });
    act(() => {
      for (let i = 0; i < 200 && clockRef!.hasPending(); i++) clockRef!.tick(16);
    });

    expect(onClosed).toHaveBeenCalledOnce();
  });

  it('interrupted close-then-open calls onOpened only, not onClosed', () => {
    const onOpened = vi.fn();
    const onClosed = vi.fn();
    const { morphRef, sourceRef } = makeRefs();
    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef, onOpened, onClosed }),
    );

    act(() => { result.current.open(); });
    act(() => {
      for (let i = 0; i < 200 && clockRef!.hasPending(); i++) clockRef!.tick(16);
    });
    onOpened.mockClear();

    act(() => { result.current.close(); });
    act(() => {
      for (let i = 0; i < 5; i++) clockRef!.tick(16);
    });

    act(() => { result.current.open(); });
    act(() => {
      for (let i = 0; i < 200 && clockRef!.hasPending(); i++) clockRef!.tick(16);
    });

    expect(onOpened).toHaveBeenCalledOnce();
    expect(onClosed).not.toHaveBeenCalled();
  });
});

describe('useSharedElementMorph — reversal re-measure (§REVERSAL-REMEASURE)', () => {
  it('animates toward the NEW tile position when close reversal interrupts opening after a resize', () => {
    const TILE2: Rect = { x: 200, y: 300, width: 220, height: 110 };
    const SHEET2: Rect = { x: 10, y: 10, width: 900, height: 700 };

    let currentTileRect: Rect = TILE;
    let currentSheetRect: Rect = SHEET;

    const morphEl = document.createElement('div');
    morphEl.getBoundingClientRect = () => ({
      x: currentSheetRect.x, y: currentSheetRect.y,
      width: currentSheetRect.width, height: currentSheetRect.height,
      top: currentSheetRect.y, left: currentSheetRect.x,
      right: currentSheetRect.x + currentSheetRect.width,
      bottom: currentSheetRect.y + currentSheetRect.height,
      toJSON: () => ({}),
    });

    const sourceEl = document.createElement('div');
    sourceEl.getBoundingClientRect = () => ({
      x: currentTileRect.x, y: currentTileRect.y,
      width: currentTileRect.width, height: currentTileRect.height,
      top: currentTileRect.y, left: currentTileRect.x,
      right: currentTileRect.x + currentTileRect.width,
      bottom: currentTileRect.y + currentTileRect.height,
      toJSON: () => ({}),
    });

    const morphRef = { current: morphEl } as React.RefObject<HTMLElement | null>;
    const sourceRef = { current: sourceEl } as React.RefObject<Element | null>;

    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef }),
    );

    act(() => { result.current.open(); });
    act(() => {
      for (let i = 0; i < 5; i++) clockRef!.tick(16);
    });

    currentTileRect = TILE2;
    currentSheetRect = SHEET2;

    act(() => { result.current.close(); });
    act(() => { clockRef!.tick(16); });

    const midLeft = parseFloat(morphEl.style.left || '0');
    expect(midLeft).toBeGreaterThan(50);
    expect(midLeft).toBeLessThan(TILE2.x + 1);
  });

  it('animates to the NEW tile position when open reversal interrupts closing after a scroll', () => {
    const TILE2: Rect = { x: 100, y: 200, width: 180, height: 80 };

    let currentTileRect: Rect = TILE;
    let currentSheetRect: Rect = SHEET;

    const morphEl = document.createElement('div');
    morphEl.getBoundingClientRect = () => ({
      x: currentSheetRect.x, y: currentSheetRect.y,
      width: currentSheetRect.width, height: currentSheetRect.height,
      top: currentSheetRect.y, left: currentSheetRect.x,
      right: currentSheetRect.x + currentSheetRect.width,
      bottom: currentSheetRect.y + currentSheetRect.height,
      toJSON: () => ({}),
    });

    const sourceEl = document.createElement('div');
    sourceEl.getBoundingClientRect = () => ({
      x: currentTileRect.x, y: currentTileRect.y,
      width: currentTileRect.width, height: currentTileRect.height,
      top: currentTileRect.y, left: currentTileRect.x,
      right: currentTileRect.x + currentTileRect.width,
      bottom: currentTileRect.y + currentTileRect.height,
      toJSON: () => ({}),
    });

    const morphRef = { current: morphEl } as React.RefObject<HTMLElement | null>;
    const sourceRef = { current: sourceEl } as React.RefObject<Element | null>;

    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef }),
    );

    act(() => { result.current.open(); });
    act(() => {
      for (let i = 0; i < 200 && clockRef!.hasPending(); i++) clockRef!.tick(16);
    });

    act(() => { result.current.close(); });
    act(() => {
      for (let i = 0; i < 5; i++) clockRef!.tick(16);
    });

    currentTileRect = TILE2;

    act(() => { result.current.open(); });
    act(() => {
      for (let i = 0; i < 200 && clockRef!.hasPending(); i++) clockRef!.tick(16);
    });

    expect(morphEl.style.position).toBe('fixed');
    expect(morphEl.style.left).not.toBe('');
    expect(morphEl.style.transform).toBe('');
  });
});

describe('useSharedElementMorph — real-rect on morphRef (F4 same-node contract)', () => {
  it('left/top/width/height are set on the morphRef element itself, no scale( on transform', () => {
    const { morphRef, sourceRef } = makeRefs();
    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef }),
    );

    act(() => { result.current.open(); });

    expect(morphRef.current!.style.left).not.toBe('');
    expect(morphRef.current!.style.top).not.toBe('');
    expect(morphRef.current!.style.transform).toBe('');
    expect(morphRef.current!.style.transform).not.toContain('scale(');
  });

  it('left/top/width/height at progress=0 match tileRect', () => {
    const { morphRef, sourceRef } = makeRefs();
    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef }),
    );

    act(() => { result.current.open(); });

    const expected = rectToCss(interpolateRect(TILE, SHEET, 0));
    expect(morphRef.current!.style.left).toBe(expected.left);
    expect(morphRef.current!.style.top).toBe(expected.top);
    expect(morphRef.current!.style.width).toBe(expected.width);
    expect(morphRef.current!.style.height).toBe(expected.height);
  });

  it('capturedSpring confirms same instance used on interrupt', () => {
    const { morphRef, sourceRef } = makeRefs();
    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef }),
    );

    act(() => { result.current.open(); });
    const spring1 = capturedSpring;

    act(() => {
      for (let i = 0; i < 5; i++) clockRef!.tick(16);
    });

    act(() => { result.current.close(); });

    expect(capturedSpring).toBe(spring1);
    expect(capturedSpring).toBeDefined();
  });
});
