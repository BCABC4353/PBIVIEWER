import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { MagnifierLayer } from './MagnifierLayer';

beforeAll(() => {
  if (typeof window.PointerEvent !== 'undefined') return;
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  (window as unknown as { PointerEvent: typeof PointerEventPolyfill }).PointerEvent =
    PointerEventPolyfill;
});

function setup() {
  const target = document.createElement('div');
  const targetRef = { current: target } as React.RefObject<HTMLElement | null>;
  const onExit = vi.fn();
  const utils = render(<MagnifierLayer targetRef={targetRef} onExit={onExit} />);
  const surface = utils.container.querySelector('[data-magnifier-surface]') as HTMLElement;
  expect(surface).not.toBeNull();
  surface.getBoundingClientRect = () => ({
    x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800,
    width: 1000, height: 800,
    toJSON: () => ({}),
  });
  return { ...utils, target, onExit, surface };
}

function scaleOf(target: HTMLElement): number {
  const m = /scale\(([\d.]+)\)/.exec(target.style.transform);
  return m ? parseFloat(m[1]!) : 1;
}

function translateOf(target: HTMLElement): [number, number] {
  const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(target.style.transform);
  return m ? [parseFloat(m[1]!), parseFloat(m[2]!)] : [0, 0];
}

describe('MagnifierLayer', () => {
  it('scroll up zooms the target in and updates the readout', () => {
    const { target, surface, getByText } = setup();
    fireEvent.wheel(surface, { deltaY: -400, clientX: 500, clientY: 400 });
    expect(scaleOf(target)).toBeGreaterThan(1);
    expect(target.style.transformOrigin).toBe('0 0');
    expect(getByText(/^\d+%$/).textContent).not.toBe('100%');
  });

  it('zoom never exceeds the maximum', () => {
    const { target, surface } = setup();
    for (let i = 0; i < 30; i++) {
      fireEvent.wheel(surface, { deltaY: -800, clientX: 500, clientY: 400 });
    }
    expect(scaleOf(target)).toBeLessThanOrEqual(4);
  });

  it('toolbar buttons zoom in and reset restores the untouched target', () => {
    const { target, getByRole } = setup();
    fireEvent.click(getByRole('button', { name: 'Zoom in' }));
    expect(scaleOf(target)).toBeGreaterThan(1);

    fireEvent.click(getByRole('button', { name: 'Reset zoom' }));
    expect(target.style.transform).toBe('');
    expect(target.style.willChange).toBe('');
  });

  it('keeps the zoomed content covering the viewport (translate clamped to non-positive)', () => {
    const { target, surface } = setup();
    fireEvent.wheel(surface, { deltaY: -400, clientX: 0, clientY: 0 });
    fireEvent.wheel(surface, { deltaY: -400, clientX: 1000, clientY: 800 });
    const [tx, ty] = translateOf(target);
    expect(tx).toBeLessThanOrEqual(0);
    expect(ty).toBeLessThanOrEqual(0);
    const s = scaleOf(target);
    expect(tx).toBeGreaterThanOrEqual(1000 * (1 - s) - 0.001);
    expect(ty).toBeGreaterThanOrEqual(800 * (1 - s) - 0.001);
  });

  it('dragging pans the zoomed content', () => {
    const { target, surface } = setup();
    fireEvent.wheel(surface, { deltaY: -600, clientX: 500, clientY: 400 });
    const [txBefore] = translateOf(target);

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 500, clientY: 400 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 560, clientY: 400 });
    fireEvent.pointerUp(surface, { pointerId: 1 });

    const [txAfter] = translateOf(target);
    expect(txAfter).toBeGreaterThan(txBefore);
    expect(txAfter).toBeLessThanOrEqual(0);
  });

  it('does not pan while at 100%', () => {
    const { target, surface } = setup();
    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 500, clientY: 400 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 560, clientY: 440 });
    fireEvent.pointerUp(surface, { pointerId: 1 });
    expect(target.style.transform).toBe('');
  });

  it('double-click zooms in, double-click again resets', () => {
    const { target, surface } = setup();
    fireEvent.doubleClick(surface, { clientX: 250, clientY: 200 });
    expect(scaleOf(target)).toBeCloseTo(2.5, 2);
    fireEvent.doubleClick(surface, { clientX: 250, clientY: 200 });
    expect(target.style.transform).toBe('');
  });

  it('Escape exits without leaking the event, and unmount clears the transform', () => {
    const { target, surface, onExit, unmount } = setup();
    fireEvent.wheel(surface, { deltaY: -400, clientX: 500, clientY: 400 });

    const outerHandler = vi.fn();
    window.addEventListener('keydown', outerHandler);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    window.removeEventListener('keydown', outerHandler);
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(outerHandler).not.toHaveBeenCalled();

    unmount();
    expect(target.style.transform).toBe('');
    expect(target.style.willChange).toBe('');
  });

  it('exit button calls onExit', () => {
    const { onExit, getByRole } = setup();
    fireEvent.click(getByRole('button', { name: 'Stop zooming' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
