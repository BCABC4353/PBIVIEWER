
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { act } from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { isInteractiveTarget } from './PresentationMode';
import { useSettingsStore } from '../../stores/settings-store';
import { DEFAULT_SETTINGS, KIOSK } from '../../../shared/constants';
import type { SlideItem } from '../../hooks/presentation/useSlideList';

const makeSlides = (n: number): SlideItem[] =>
  Array.from({ length: n }, (_, i) => ({
    type: 'page' as const,
    name: `page-${i}`,
    displayName: `Page ${i + 1}`,
  }));

const MANY = 25;
let slidesMock = makeSlides(MANY);

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

vi.mock('../../hooks/presentation/useFocusTrap', () => ({ useFocusTrap: vi.fn() }));
vi.mock('../../hooks/presentation/useExitOnFullscreenChange', () => ({
  useExitOnFullscreenChange: vi.fn(),
}));
vi.mock('../../hooks/presentation/useKioskRecovery', () => ({ useKioskRecovery: vi.fn() }));
vi.mock('../../hooks/presentation/useKioskExitGesture', () => ({
  useKioskExitGesture: vi.fn(() => ({ isHolding: false, holdMs: 3000 })),
}));
vi.mock('../../hooks/presentation/useCursorHide', () => ({ useCursorHide: () => false }));
vi.mock('../../hooks/presentation/useDebouncedSettings', () => ({
  useDebouncedSettings: () => ({ onIntervalChange: vi.fn() }),
}));

import { PresentationMode } from './PresentationMode';
import { useKioskExitGesture } from '../../hooks/presentation/useKioskExitGesture';

beforeEach(() => {
  slidesMock = makeSlides(MANY);
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
  vi.mocked(useKioskExitGesture).mockImplementation(() => ({
    isHolding: false,
    holdMs: KIOSK.ESCAPE_HOLD_MS,
  }));
});

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

    expect(dispatchKeyFrom(scrubber, ' ')).toBe(false);
    expect(valueNow(scrubber)).toBe(before);
  });

  it('ArrowRight on the scrubber advances by exactly 1 (own handler only, no global double-advance)', () => {
    renderPresentation();
    const scrubber = screen.getByRole('slider', { name: 'Slide scrubber' });
    const before = valueNow(scrubber);

    dispatchKeyFrom(scrubber, 'ArrowRight');
    expect(valueNow(scrubber)).toBe(before + 1);
  });

  it('Space/Arrows on a toolbar button are NOT hijacked', () => {
    renderPresentation();
    const exitBtn = screen.getByRole('button', { name: 'Exit' });
    const scrubber = screen.getByRole('slider', { name: 'Slide scrubber' });
    const before = valueNow(scrubber);

    expect(dispatchKeyFrom(exitBtn, ' ')).toBe(false);
    expect(dispatchKeyFrom(exitBtn, 'ArrowRight')).toBe(false);
    expect(valueNow(scrubber)).toBe(before);
  });

  it('Space/Arrows on the overlay background ARE handled (preventDefault + navigation)', () => {
    renderPresentation();
    const dialog = screen.getByRole('dialog', { name: 'Slideshow' });
    const scrubber = screen.getByRole('slider', { name: 'Slide scrubber' });

    expect(valueNow(scrubber)).toBe(1);

    expect(dispatchKeyFrom(dialog, 'ArrowRight')).toBe(true);
    expect(valueNow(scrubber)).toBe(2);

    expect(dispatchKeyFrom(dialog, ' ')).toBe(true);
    expect(valueNow(scrubber)).toBe(3);

    expect(dispatchKeyFrom(dialog, 'ArrowLeft')).toBe(true);
    expect(valueNow(scrubber)).toBe(2);
  });
});

describe('#6 persistent kiosk exit hint', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders a manual-mode exit hint ("Press Esc to exit") matching the single-Esc exit', () => {
    renderPresentation();
    expect(screen.getByText('Press Esc to exit')).not.toBeNull();
    expect(screen.queryByText('Hold Esc 3s to exit')).toBeNull();
  });

  it('marks the hint aria-hidden so it is not noise for screen readers', () => {
    renderPresentation();
    const hint = screen.getByText('Press Esc to exit');
    expect(hint.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('keeps the hint mounted independently of the auto-hide controls (kiosk persistence)', () => {
    renderPresentation();
    const hint = screen.getByText('Press Esc to exit');
    expect(hint.closest('[data-viewer-toolbar]')).toBeNull();
    expect(screen.queryByText('Press Esc to exit')).not.toBeNull();
  });
});

describe('PROD-S1 / antagonist P0: Escape is a global exit handled regardless of focus', () => {
  beforeEach(() => {
    cleanup();
  });

  it('Escape on a toolbar button is still processed (preventDefault) — not swallowed by the interactive bail', () => {
    renderPresentation();
    const exitBtn = screen.getByRole('button', { name: 'Exit' });

    expect(dispatchKeyFrom(exitBtn, 'Escape')).toBe(true);
  });

  it('Escape closes the open settings panel instead of exiting the slideshow', () => {
    renderPresentation();
    const settingsBtn = screen.getByRole('button', { name: 'Settings' });

    act(() => {
      settingsBtn.click();
    });
    expect(screen.queryByText('Slideshow Settings')).not.toBeNull();

    expect(dispatchKeyFrom(settingsBtn, 'Escape')).toBe(true);
    expect(screen.queryByText('Slideshow Settings')).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Slideshow' })).not.toBeNull();
  });
});

const presentationTree = (
  <MemoryRouter initialEntries={['/presentation/ws-1/report-1']}>
    <Routes>
      <Route path="/presentation/:workspaceId/:reportId" element={<PresentationMode />} />
    </Routes>
  </MemoryRouter>
);

describe('UX-14 slide index clamp when the slide list shrinks', () => {
  beforeEach(() => {
    cleanup();
  });

  it('clamps the current slide so "Slide 26 / 5" is impossible', () => {
    const view = renderPresentation();
    const scrubber = screen.getByRole('slider', { name: 'Slide scrubber' });

    dispatchKeyFrom(scrubber, 'End');
    expect(valueNow(scrubber)).toBe(MANY);
    expect(screen.getByText(`Slide ${MANY} of ${MANY}: Page ${MANY}`)).not.toBeNull();

    slidesMock = makeSlides(5);
    act(() => {
      view.rerender(presentationTree);
    });

    expect(screen.getByText('Slide 5 of 5: Page 5')).not.toBeNull();
    expect(screen.queryByText(/Slide 2[0-9] of 5/)).toBeNull();
    const dots = screen.getAllByRole('button', { name: /Go to slide/ });
    expect(dots).toHaveLength(5);
    expect(dots[4]!.getAttribute('aria-current')).toBe('true');
  });
});

describe('UX-10/11 kiosk exit hints and Esc-hold progress overlay', () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(window.electronAPI.settings.get).mockResolvedValue({
      success: true,
      data: { ...DEFAULT_SETTINGS, autoStartSlideshow: true },
    });
  });

  async function renderKiosk() {
    await act(async () => {
      render(presentationTree);
    });
  }

  it('kiosk mode shows the hold-to-exit hint and drops the contradictory "Esc: Exit" row', async () => {
    await renderKiosk();
    expect(screen.getByText('Hold Esc 3s to exit')).not.toBeNull();
    expect(screen.queryByText('Press Esc to exit')).toBeNull();
    expect(screen.queryByText('Esc: Exit')).toBeNull();
  });

  it('renders the hold progress overlay while Esc is held', async () => {
    vi.mocked(useKioskExitGesture).mockImplementation(() => ({
      isHolding: true,
      holdMs: KIOSK.ESCAPE_HOLD_MS,
    }));
    await renderKiosk();
    expect(screen.getByText('Keep holding to exit…')).not.toBeNull();
  });

  it('does not render the hold overlay when no hold is in progress', async () => {
    await renderKiosk();
    expect(screen.queryByText('Keep holding to exit…')).toBeNull();
  });
});
