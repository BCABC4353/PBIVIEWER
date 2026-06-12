import type { RefObject } from 'react';
import type { Rect } from './flip-geometry';

export const TILE: Rect = { x: 40, y: 80, width: 160, height: 90 };
export const SHEET: Rect = { x: 0, y: 0, width: 800, height: 600 };

function withRect(el: Element, rect: Rect): void {
  el.getBoundingClientRect = () => ({
    x: rect.x, y: rect.y,
    width: rect.width, height: rect.height,
    top: rect.y, left: rect.x,
    right: rect.x + rect.width, bottom: rect.y + rect.height,
    toJSON: () => ({}),
  });
}

export function makeMorphEl(rect: Rect = SHEET): HTMLElement {
  const el = document.createElement('div');
  withRect(el, rect);
  return el;
}

export function makeSourceEl(rect: Rect = TILE): Element {
  const el = document.createElement('div');
  withRect(el, rect);
  return el;
}

export function makeRefs(sourceRect: Rect = TILE, morphRect: Rect = SHEET): {
  morphRef: RefObject<HTMLElement | null>;
  sourceRef: RefObject<Element | null>;
} {
  const morphRef = { current: makeMorphEl(morphRect) } as RefObject<HTMLElement | null>;
  const sourceRef = { current: makeSourceEl(sourceRect) } as RefObject<Element | null>;
  return { morphRef, sourceRef };
}
