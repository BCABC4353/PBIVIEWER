import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { render } from '@testing-library/react';
import { makeScheduler } from './spring-test-clock';
import {
  transformToCss,
  morphTransformAt,
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
    expect(srcOp).toBeGreaterThan(0);
    expect(srcOp).toBeLessThan(1);
    expect(tgtOp).toBeGreaterThan(0);
    expect(tgtOp).toBeLessThan(1);
    expect(srcOp + tgtOp).toBeCloseTo(1, 3);
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

describe('useSharedElementMorph — transform on morphRef (F4 same-node contract)', () => {
  it('CSS transform is applied to the morphRef element itself, not a wrapper', () => {
    const { morphRef, sourceRef } = makeRefs();
    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef }),
    );

    act(() => { result.current.open(); });

    expect(morphRef.current!.style.transform).not.toBe('');
    expect(morphRef.current!.style.transformOrigin).toBe('0 0');
  });

  it('transform at progress=0 matches exact tileRect placement', () => {
    const { morphRef, sourceRef } = makeRefs();
    const { result } = renderHook(() =>
      useSharedElementMorph({ morphRef, sourceRef }),
    );

    act(() => { result.current.open(); });

    const expected = transformToCss(morphTransformAt(TILE, SHEET, 0));
    expect(morphRef.current!.style.transform).toBe(expected);
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
