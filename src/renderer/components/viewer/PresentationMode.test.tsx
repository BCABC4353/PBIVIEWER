/**
 * NEW-A11Y-5: the global slideshow keydown handler must NOT hijack
 * Space/Arrows/Escape/p from interactive overlay controls (the scrubber
 * role="slider", ViewerToolbar buttons, the Settings slider, dot-indicator
 * buttons, inputs, contenteditable). It must still drive slideshow navigation
 * when focus is on the slide surface / overlay background.
 *
 * Two layers of coverage:
 *   1. Pure predicate `isInteractiveTarget` (every branch).
 *   2. Component-level: dispatch real KeyboardEvents from real DOM nodes and
 *      assert defaultPrevented + whether the slide actually advanced.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { act } from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { isInteractiveTarget } from './PresentationMode';
import type { SlideItem } from '../../hooks/presentation/useSlideList';

// ---------------------------------------------------------------------------
// Mock the heavy embed hooks so PresentationMode renders deterministically with
// a controlled slide list and no real powerbi-client / IPC embed.
// ---------------------------------------------------------------------------
const makeSlides = (n: number): SlideItem[] =>
  Array.from({ length: n }, (_, i) => ({
    type: 'page' as const,
    name: `page-${i}`,
    displayName: `Page ${i + 1}`,
  }));

const MANY = 25; // > 20 → renders the scrubber (role="slider")
const slidesMock = makeSlides(MANY);

vi.mock('../../hooks/usePowerBIEmbed', () => ({
  usePowerBIEmbed: () => ({
    isLoading: false,
    error: null,
    embedRef: { current: null },
    reload: vi.fn(),
    teardownNow: vi.fn(),
  }),
}));

vi.mock('../../hooks/presentation/useSlideList', () => ({
  useSlideList: () => ({
    slides: slidesMock,
    slidesReady: true,
    events: {},
    setEmbedRef: vi.fn(),
  }),
}));

// Neutralize the side-effecty presentation hooks (fullscreen, cursor hide,
// kiosk power/gestures) so they don't touch jsdom-unsupported APIs.
vi.mock('../../hooks/presentation/useFocusTrap', () => ({ useFocusTrap: vi.fn() }));
vi.mock('../../hooks/presentation/useExitOnFullscreenChange', () => ({
  useExitOnFullscreenChange: vi.fn(),
}));
vi.mock('../../hooks/presentation/useKioskRecovery', () => ({ useKioskRecovery: vi.fn() }));
vi.mock('../../hooks/presentation/useKioskExitGesture', () => ({
  useKioskExitGesture: vi.fn(),
}));
vi.mock('../../hooks/presentation/useCursorHide', () => ({ useCursorHide: () => false }));
vi.mock('../../hooks/presentation/useDebouncedSettings', () => ({
  useDebouncedSettings: () => ({ onIntervalChange: vi.fn() }),
}));

// Import after mocks are registered.
import { PresentationMode } from './PresentationMode';

function renderPresentation() {
  let result: ReturnType<typeof render>;
  act(() => {
    result = render(
      <MemoryRouter initialEntries={['/presentation/ws-1/report-1']}>
        <Routes>
          <Route path="/presentation/:workspaceId/:reportId" element={<PresentationMode />} />
        </Routes>
      </MemoryRouter>
    );
  });
  return result!;
}

/**
 * Dispatch a real keydown from a specific element and report whether the global
 * window handler called preventDefault on it. The event bubbles to window where
 * PresentationMode's listener lives.
 */
function dispatchKeyFrom(el: Element, key: string): boolean {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    el.dispatchEvent(event);
  });
  return event.defaultPrevented;
}

const valueNow = (scrubber: Element) =>
  Number(scrubber.getAttribute('aria-valuenow'));

describe('NEW-A11Y-5 isInteractiveTarget predicate', () => {
  it('returns true for native form/button elements', () => {
    for (const tag of ['input', 'textarea', 'select', 'button'] as const) {
      const el = document.createElement(tag);
      expect(isInteractiveTarget(el)).toBe(true);
    }
  });

  it('returns true for ARIA widget roles slider/button/menuitem', () => {
    for (const role of ['slider', 'button', 'menuitem']) {
      const el = document.createElement('div');
      el.setAttribute('role', role);
      expect(isInteractiveTarget(el)).toBe(true);
    }
  });

  it('returns true for contenteditable', () => {
    const el = document.createElement('div');
    el.setAttribute('contenteditable', 'true');
    expect(isInteractiveTarget(el)).toBe(true);
  });

  it('returns true for an element inside the viewer toolbar', () => {
    const toolbar = document.createElement('div');
    toolbar.setAttribute('data-viewer-toolbar', '');
    const inner = document.createElement('span');
    toolbar.appendChild(inner);
    expect(isInteractiveTarget(inner)).toBe(true);
  });

  it('returns false for a plain non-interactive element (overlay background)', () => {
    const el = document.createElement('div');
    expect(isInteractiveTarget(el)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isInteractiveTarget(null)).toBe(false);
  });
});

describe('NEW-A11Y-5 PresentationMode keydown does not hijack interactive controls', () => {
  beforeEach(() => {
    cleanup();
  });

  it('Space on the scrubber (role="slider") is NOT hijacked by the global handler', () => {
    renderPresentation();
    const scrubber = screen.getByRole('slider', { name: 'Slide scrubber' });
    const before = valueNow(scrubber);

    // The scrubber's own onKeyDown does not handle Space, and the GLOBAL handler
    // must bail on an interactive target — so nothing prevents default and the
    // slide does not advance. (If the global handler ran it would preventDefault
    // and advance.)
    expect(dispatchKeyFrom(scrubber, ' ')).toBe(false);
    expect(valueNow(scrubber)).toBe(before);
  });

  it('ArrowRight on the scrubber advances by exactly 1 (own handler only, no global double-advance)', () => {
    renderPresentation();
    const scrubber = screen.getByRole('slider', { name: 'Slide scrubber' });
    const before = valueNow(scrubber);

    // The scrubber's own onKeyDown handles ArrowRight (advance + preventDefault).
    // The global handler must NOT also fire, otherwise the slide would jump by 2.
    dispatchKeyFrom(scrubber, 'ArrowRight');
    expect(valueNow(scrubber)).toBe(before + 1);
  });

  it('Space/Arrows on a toolbar button are NOT hijacked', () => {
    renderPresentation();
    const exitBtn = screen.getByRole('button', { name: 'Exit' });
    const scrubber = screen.getByRole('slider', { name: 'Slide scrubber' });
    const before = valueNow(scrubber);

    // Global handler must bail (toolbar is data-viewer-toolbar). No preventDefault,
    // no navigation.
    expect(dispatchKeyFrom(exitBtn, ' ')).toBe(false);
    expect(dispatchKeyFrom(exitBtn, 'ArrowRight')).toBe(false);
    expect(valueNow(scrubber)).toBe(before);
  });

  it('Space/Arrows on the overlay background ARE handled (preventDefault + navigation)', () => {
    renderPresentation();
    const dialog = screen.getByRole('dialog', { name: 'Presentation mode' });
    const scrubber = screen.getByRole('slider', { name: 'Slide scrubber' });

    // Slide 1 of MANY initially.
    expect(valueNow(scrubber)).toBe(1);

    // ArrowRight from the overlay background (a plain div, not interactive):
    // global handler preventDefaults AND advances the slide.
    expect(dispatchKeyFrom(dialog, 'ArrowRight')).toBe(true);
    expect(valueNow(scrubber)).toBe(2);

    // Space also advances.
    expect(dispatchKeyFrom(dialog, ' ')).toBe(true);
    expect(valueNow(scrubber)).toBe(3);

    // ArrowLeft goes back.
    expect(dispatchKeyFrom(dialog, 'ArrowLeft')).toBe(true);
    expect(valueNow(scrubber)).toBe(2);
  });
});
