import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { AnnotationLayer } from './AnnotationLayer';

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

function surfaceOf(container: HTMLElement): Element {
  const surface = container.querySelector('[data-annotation-surface]');
  expect(surface).not.toBeNull();
  return surface!;
}

function strokesOf(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('polyline'));
}

function drawStroke(
  surface: Element,
  points: Array<[number, number]>,
  pointerId = 1,
): void {
  const [first, ...rest] = points;
  if (!first) throw new Error('drawStroke needs at least one point');
  fireEvent.pointerDown(surface, {
    pointerId,
    button: 0,
    clientX: first[0],
    clientY: first[1],
  });
  for (const [x, y] of rest) {
    fireEvent.pointerMove(surface, { pointerId, clientX: x, clientY: y });
  }
  const last = points[points.length - 1] ?? first;
  fireEvent.pointerUp(surface, { pointerId, clientX: last[0], clientY: last[1] });
}

describe('AnnotationLayer', () => {
  it('adds a pen stroke after a pointer drag', () => {
    const { container } = render(<AnnotationLayer onExit={vi.fn()} />);
    drawStroke(surfaceOf(container), [
      [10, 10],
      [40, 40],
      [80, 20],
    ]);
    const strokes = strokesOf(container);
    expect(strokes).toHaveLength(1);
    expect(strokes[0]!.getAttribute('data-tool')).toBe('pen');
    expect(strokes[0]!.getAttribute('points')!.split(' ').length).toBeGreaterThan(1);
  });

  it('renders a visible dot for a tap without movement', () => {
    const { container } = render(<AnnotationLayer onExit={vi.fn()} />);
    drawStroke(surfaceOf(container), [[25, 25]]);
    const strokes = strokesOf(container);
    expect(strokes).toHaveLength(1);
    expect(strokes[0]!.getAttribute('points')!.split(' ')).toHaveLength(2);
  });

  it('draws with the highlighter after switching tools', () => {
    const { container, getByRole } = render(<AnnotationLayer onExit={vi.fn()} />);
    fireEvent.click(getByRole('button', { name: 'Highlighter' }));
    drawStroke(surfaceOf(container), [
      [10, 50],
      [90, 50],
    ]);
    const strokes = strokesOf(container);
    expect(strokes).toHaveLength(1);
    expect(strokes[0]!.getAttribute('data-tool')).toBe('highlighter');
    expect(strokes[0]!.getAttribute('stroke-opacity')).toBe('0.35');
  });

  it('undo removes the most recent stroke only', () => {
    const { container, getByRole } = render(<AnnotationLayer onExit={vi.fn()} />);
    const surface = surfaceOf(container);
    drawStroke(surface, [
      [10, 10],
      [30, 30],
    ]);
    drawStroke(surface, [
      [50, 50],
      [70, 70],
    ]);
    expect(strokesOf(container)).toHaveLength(2);
    fireEvent.click(getByRole('button', { name: 'Undo' }));
    expect(strokesOf(container)).toHaveLength(1);
  });

  it('clear removes all strokes and disables undo', () => {
    const { container, getByRole } = render(<AnnotationLayer onExit={vi.fn()} />);
    const surface = surfaceOf(container);
    drawStroke(surface, [
      [10, 10],
      [30, 30],
    ]);
    drawStroke(surface, [
      [50, 50],
      [70, 70],
    ]);
    fireEvent.click(getByRole('button', { name: 'Clear drawing' }));
    expect(strokesOf(container)).toHaveLength(0);
    expect(getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('ignores pointer moves from a different pointer than the one drawing', () => {
    const { container } = render(<AnnotationLayer onExit={vi.fn()} />);
    const surface = surfaceOf(container);
    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(surface, { pointerId: 2, clientX: 90, clientY: 90 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 10, clientY: 10 });
    const strokes = strokesOf(container);
    expect(strokes).toHaveLength(1);
    expect(strokes[0]!.getAttribute('points')!.split(' ')).toHaveLength(2);
  });

  it('calls onExit from the palette button', () => {
    const onExit = vi.fn();
    const { getByRole } = render(<AnnotationLayer onExit={onExit} />);
    fireEvent.click(getByRole('button', { name: 'Stop drawing' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('calls onExit on Escape and stops the event from propagating', () => {
    const onExit = vi.fn();
    const outerHandler = vi.fn();
    window.addEventListener('keydown', outerHandler);
    render(<AnnotationLayer onExit={onExit} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    window.removeEventListener('keydown', outerHandler);
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(outerHandler).not.toHaveBeenCalled();
  });

  it('exposes a labelled drawing toolbar', () => {
    const { getByRole } = render(<AnnotationLayer onExit={vi.fn()} />);
    expect(getByRole('toolbar', { name: 'Drawing tools' })).toBeInTheDocument();
  });
});
