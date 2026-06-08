import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spinner, Button, Text, Slider } from '@fluentui/react-components';
import {
  PlayRegular,
  PauseRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
  SettingsRegular,
} from '@fluentui/react-icons';
import * as pbi from 'powerbi-client';
import { SLIDESHOW_INTERVAL } from '../../../shared/constants';
import { usePowerBIEmbed } from '../../hooks/usePowerBIEmbed';
import { useSettingsStore } from '../../stores/settings-store';
import { useSlideList } from '../../hooks/presentation/useSlideList';
import { useFocusTrap } from '../../hooks/presentation/useFocusTrap';
import { useExitOnFullscreenChange } from '../../hooks/presentation/useExitOnFullscreenChange';
import { useDebouncedSettings } from '../../hooks/presentation/useDebouncedSettings';
import { useKioskRecovery } from '../../hooks/presentation/useKioskRecovery';
import { useCursorHide } from '../../hooks/presentation/useCursorHide';
import { useKioskExitGesture } from '../../hooks/presentation/useKioskExitGesture';
import { ViewerToolbar } from './ViewerToolbar';

/**
 * NEW-A11Y-5: returns true when a keydown target is an interactive control that
 * should own its own keyboard handling, so the global slideshow keydown handler
 * must NOT preventDefault or navigate. Covers native form/button elements, ARIA
 * widget roles (slider/button/menuitem), contenteditable, and anything inside
 * the ViewerToolbar.
 */
export function isInteractiveTarget(target: HTMLElement | null): boolean {
  if (!target) return false;

  const tag = target.tagName;
  if (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    tag === 'BUTTON'
  ) {
    return true;
  }

  const role = target.getAttribute('role');
  if (role === 'slider' || role === 'button' || role === 'menuitem') {
    return true;
  }

  // Both checks are needed: isContentEditable reflects the live, computed
  // editability (covers inherited/connected cases) but is unreliable for
  // detached nodes and in jsdom; the attribute closest() covers the explicit
  // contenteditable markup robustly across environments.
  if (
    target.isContentEditable ||
    target.closest('[contenteditable=""], [contenteditable="true"]')
  ) {
    return true;
  }

  // Anything inside the shared toolbar (its buttons, breadcrumb controls, etc.).
  if (target.closest('[data-viewer-toolbar]')) {
    return true;
  }

  return false;
}

export const PresentationMode: React.FC = () => {
  const { workspaceId, reportId } = useParams<{
    workspaceId: string;
    reportId: string;
  }>();
  const navigate = useNavigate();

  const embedContainerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const slideshowIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isExitingRef = useRef(false);
  // NEW-BEH-1: gates the auto-start effect to a single trigger so that
  // pressing Pause after auto-start doesn't immediately re-start the slideshow
  // on the next render cycle (slidesReady / isLoading / error can re-fire).
  const hasAutoStartedRef = useRef(false);

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [slideAnnouncement, setSlideAnnouncement] = useState<string>('');

  // Subscribe to the settings store so changes made in SettingsPage while
  // the slideshow is open take effect immediately — no remount needed.
  // Selectors return primitives so a single field change only re-renders
  // the slice that cares about it.
  const intervalSeconds = useSettingsStore((s) => s.settings.slideshowInterval);
  const slideshowMode = useSettingsStore((s) => s.settings.slideshowMode);
  const autoStartSlideshow = useSettingsStore((s) => s.settings.autoStartSlideshow);
  const autoRefreshEnabled = useSettingsStore((s) => s.settings.autoRefreshEnabled);
  const autoRefreshIntervalMinutes = useSettingsStore((s) => s.settings.autoRefreshInterval);

  // ARCH-S7: debounced interval-persist (slider onChange) lives in a hook that
  // owns its own pending-timer ref and unmount flush.
  const { onIntervalChange } = useDebouncedSettings();

  // Defensive bootstrap: ensure the store has fetched once. Idempotent if
  // App bootstrap already ran it. We can't edit App.tsx in this sprint
  // (DEV-D scope), so each viewer self-bootstraps. Real values come from
  // the store subscriptions above.
  useEffect(() => {
    void useSettingsStore.getState().loadSettings();
  }, []);

  // Build embed configuration — presentation hides all panes and nav.
  const buildConfig = useCallback(
    (token: string): pbi.IReportEmbedConfiguration => ({
      type: 'report',
      id: reportId,
      embedUrl: `https://app.powerbi.com/reportEmbed?reportId=${reportId}&groupId=${workspaceId}`,
      accessToken: token,
      tokenType: pbi.models.TokenType.Aad,
      settings: {
        panes: {
          filters: { visible: false },
          pageNavigation: { visible: false },
        },
        // Use default background, not transparent
        background: pbi.models.BackgroundType.Default,
        navContentPaneEnabled: false,
      },
    }),
    [workspaceId, reportId]
  );

  // ARCH-S7: slide-source data (pages, bookmarks, unified slide list) and the
  // Power BI `loaded` handler live in useSlideList. The handler reads the live
  // embed lazily via setEmbedRef (wired below, after usePowerBIEmbed returns).
  const { slides, slidesReady, events, setEmbedRef } = useSlideList(slideshowMode);

  const {
    isLoading,
    error,
    embedRef,
    reload,
    teardownNow,
  } = usePowerBIEmbed({
    workspaceId,
    itemId: reportId,
    containerRef: embedContainerRef,
    buildConfig,
    events,
    autoRefreshEnabled,
    autoRefreshIntervalMinutes,
    errorFallback: 'Failed to load report. Please try again.',
    // Presentation mode wants visibility into post-load problems too —
    // a slideshow stuck on a broken page should surface, not silently fail.
    surfacePostLoadErrors: true,
  });

  // useSlideList needs the embedRef from usePowerBIEmbed, but usePowerBIEmbed
  // needs the `events` object from useSlideList — a forward reference. Thread the
  // (stable-identity) embedRef back into the hook so the `loaded` handler reads
  // the live embed. The original code relied on the same hoisted-ref pattern
  // (the memo closed over an embedRef declared below it).
  setEmbedRef(embedRef);

  // Auto-start slideshow when slides are ready (if setting enabled).
  // NEW-BEH-1: the hasAutoStartedRef gate ensures we fire exactly once per
  // mount, so pressing Pause after auto-start stays paused — subsequent
  // re-renders of slidesReady / isLoading / error don't re-trigger play.
  useEffect(() => {
    if (
      slidesReady &&
      autoStartSlideshow &&
      !isLoading &&
      !error &&
      !hasAutoStartedRef.current
    ) {
      hasAutoStartedRef.current = true;
      setIsPlaying(true);
    }
  }, [slidesReady, autoStartSlideshow, isLoading, error]);

  // Exit function - navigates back to report viewer
  const doExit = useCallback(() => {
    if (isExitingRef.current) return;
    isExitingRef.current = true;

    // PROD-S1: release the display-sleep blocker on exit (kiosk). Fire-and-forget;
    // the main handler is idempotent so the unmount cleanup re-calling is safe.
    void window.electronAPI.kiosk.allowDisplaySleep().catch(() => {});

    // Stop slideshow
    setIsPlaying(false);
    if (slideshowIntervalRef.current) {
      clearInterval(slideshowIntervalRef.current);
      slideshowIntervalRef.current = null;
    }

    // PERF-S2 / ARCH-S1: use teardownNow() so the hook owns the SDK event
    // detachment and container reset — no direct embed.off or powerbiService
    // calls here. Stops the iframe from rendering before navigate() runs.
    teardownNow();

    // Exit fullscreen if active
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }

    // Navigate back to the report viewer (explicit route, not -1)
    if (workspaceId && reportId) {
      navigate(`/report/${workspaceId}/${reportId}`, { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  }, [workspaceId, reportId, navigate, teardownNow]);

  // ARCH-S7: fullscreen enter-on-mount + exit-on-fullscreenchange teardown.
  // Shares isExitingRef / slideshowIntervalRef with doExit so both exit paths
  // coordinate.
  useExitOnFullscreenChange({
    workspaceId,
    reportId,
    navigate,
    teardownNow,
    isExitingRef,
    slideshowIntervalRef,
  });

  // ARCH-S7: focus management (save/restore previously-focused element + Tab
  // focus trap scoped to the overlay).
  useFocusTrap(overlayRef);

  // PROD-S1: keep the display awake for unattended wall-display use. Start the
  // powerSaveBlocker on enter; release it on unmount. doExit() also releases it
  // explicitly — the main handler is idempotent so the double-call is safe.
  useEffect(() => {
    void window.electronAPI.kiosk.preventDisplaySleep().catch(() => {});
    return () => {
      void window.electronAPI.kiosk.allowDisplaySleep().catch(() => {});
    };
  }, []);

  // PROD-S1: slideshow auto-recovery with 5s → 30s → 60s backoff (then 60s).
  // Wired to usePowerBIEmbed's `error` signal and `reload` (re-embed). Only
  // attempts while the slideshow is playing; resets backoff once the error
  // clears (successful recovery). Timer is cleaned up on exit/unmount.
  useKioskRecovery({ error, active: isPlaying, recover: reload });

  // PROD-S1: kiosk-safe exit gesture — 3s Escape-hold OR Ctrl+Shift+Q → exit.
  useKioskExitGesture({ onExit: doExit });

  // PROD-S1: hide the cursor after inactivity in presentation/fullscreen; reveal
  // on mousemove. Drives a `cursor-none` class on the overlay.
  const cursorHidden = useCursorHide();

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;

      // Escape is the GLOBAL slideshow exit and must be handled regardless of
      // focus — interactive controls (toolbar buttons, the scrubber) don't own
      // Escape, so it must be processed BEFORE the interactive-target bail
      // below (antagonist P0: previously Escape over a toolbar button never
      // exited). Order of precedence:
      //   1. If the settings panel is open, Escape closes it (not exit).
      //   2. In a manually-started slideshow, Escape exits.
      //   3. In unattended/kiosk mode (auto-started), a single Escape is inert —
      //      exit is gated behind the deliberate gesture (3s Escape-hold or
      //      Ctrl+Shift+Q) in useKioskExitGesture. preventDefault still
      //      suppresses the browser's native fullscreen-exit-on-Escape.
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showSettings) {
          setShowSettings(false);
        } else if (!autoStartSlideshow) {
          doExit();
        }
        return;
      }

      // NEW-A11Y-5: do not hijack NAVIGATION keys (Arrows/Space/p) from
      // interactive overlay controls — the scrubber (role="slider"), the
      // ViewerToolbar buttons, the settings slider, and the dot-indicator
      // buttons must handle their own keys. Bail (no preventDefault, no nav)
      // when focus is on an interactive control. Slideshow nav still works when
      // focus is on the slide surface / overlay background.
      if (isInteractiveTarget(target)) {
        return;
      }

      if (['ArrowRight', 'ArrowLeft', ' ', 'p', 'P'].includes(e.key)) {
        e.preventDefault();
      }

      switch (e.key) {
        case 'ArrowRight':
        case ' ':
          if (slides.length > 0) {
            setCurrentSlideIndex((prev) => (prev + 1) % slides.length);
          }
          break;
        case 'ArrowLeft':
          if (slides.length > 0) {
            setCurrentSlideIndex((prev) => (prev - 1 + slides.length) % slides.length);
          }
          break;
        case 'p':
        case 'P':
          setIsPlaying((prev) => !prev);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [slides.length, doExit, autoStartSlideshow, showSettings]);

  // Handle slideshow auto-advance
  useEffect(() => {
    if (isPlaying && slides.length > 0) {
      slideshowIntervalRef.current = setInterval(() => {
        setCurrentSlideIndex((prev) => (prev + 1) % slides.length);
      }, intervalSeconds * 1000);
    } else {
      if (slideshowIntervalRef.current) {
        clearInterval(slideshowIntervalRef.current);
        slideshowIntervalRef.current = null;
      }
    }

    return () => {
      if (slideshowIntervalRef.current) {
        clearInterval(slideshowIntervalRef.current);
      }
    };
  }, [isPlaying, intervalSeconds, slides.length]);

  // Navigate to slide (page or bookmark) when index changes
  useEffect(() => {
    const report = embedRef.current as pbi.Report | null;
    if (report && slides.length > 0) {
      const slide = slides[currentSlideIndex];
      if (slide) {
        if (slide.type === 'page') {
          report.setPage(slide.name).catch((err) => {
            console.error('Failed to set page:', err);
          });
        } else if (slide.type === 'bookmark') {
          report.bookmarksManager.apply(slide.name).catch((err) => {
            console.error('Failed to apply bookmark:', err);
          });
        }
      }
    }
  }, [currentSlideIndex, slides, embedRef]);

  // Announce current slide to screen readers via the persistent live region.
  // Fires whenever the index or the slides list changes so that auto-advance,
  // keyboard navigation, and dot-indicator clicks all produce an announcement.
  useEffect(() => {
    if (slides.length === 0) return;
    const slide = slides[currentSlideIndex];
    if (!slide) return;
    setSlideAnnouncement(
      `Slide ${currentSlideIndex + 1} of ${slides.length}: ${slide.displayName}`
    );
  }, [currentSlideIndex, slides]);

  // Hide controls after inactivity.
  // PERF-S4: bind to `document` only — `window` re-dispatches the same
  // bubbled mousemove events, so attaching to both fires the handler twice
  // per move. A single `document` listener is sufficient for the entire page.
  useEffect(() => {
    let timeout: NodeJS.Timeout | undefined;

    const handleMouseMove = () => {
      setShowControls(true);
      if (timeout) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(() => {
        if (isPlaying) {
          setShowControls(false);
        }
      }, 3000);
    };

    handleMouseMove();

    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [isPlaying]);

  const nextSlide = () => {
    if (slides.length > 0) {
      setCurrentSlideIndex((prev) => (prev + 1) % slides.length);
    }
  };

  const prevSlide = () => {
    if (slides.length > 0) {
      setCurrentSlideIndex((prev) => (prev - 1 + slides.length) % slides.length);
    }
  };

  const togglePlayPause = () => {
    setIsPlaying((prev) => !prev);
  };

  // Label for the shared toolbar breadcrumb. The report name isn't fetched in
  // presentation mode, so use the current slide's name for context, falling
  // back to a generic slideshow label.
  const toolbarItemName =
    slides[currentSlideIndex]?.displayName ?? 'Slideshow';

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Presentation mode"
      className={`fixed inset-0 z-50 bg-neutral-background-1 ${cursorHidden ? 'cursor-none' : ''}`}
    >
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-background-1 z-20">
          <div className="text-center">
            <Spinner size="large" />
            <Text className="mt-4 text-neutral-foreground-2 block">
              Loading presentation...
            </Text>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div
          role="alert"
          className="absolute inset-0 flex items-center justify-center bg-neutral-background-1 z-20"
        >
          <div className="text-center max-w-md">
            <Text className="text-status-error block mb-4">{error}</Text>
            <Button appearance="primary" onClick={doExit}>
              Exit
            </Button>
          </div>
        </div>
      )}

      {/* Report embed container */}
      <div
        ref={embedContainerRef}
        className={`w-full h-full ${isLoading || error ? 'invisible' : 'visible'}`}
      />

      {/* Transparent overlay to detect mouse movement over iframe */}
      {!isLoading && !error && !showControls && (
        <div
          className="absolute inset-0 z-[5] bg-transparent cursor-default"
          onMouseMove={() => {
            setShowControls(true);
          }}
        />
      )}

      {/* Persistent slide announcer — always mounted so screen readers reliably
          receive updates even when the visible controls fade out. The sr-only
          class hides it visually without removing it from the accessibility tree. */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {slideAnnouncement}
      </div>

      {/* #6: PERSISTENT kiosk exit hint. Rendered OUTSIDE the auto-hide
          `showControls` block so it never fades — an unattended-wall-display
          operator (esp. the autoStartSlideshow/kiosk scenario where a single
          Escape is intentionally inert) always sees how to get out. Kept small,
          low-opacity, and corner-anchored so it stays unobtrusive over the
          slide. aria-hidden because it duplicates content already exposed to
          screen readers via the live region / controls — it's visual-only
          guidance and would otherwise be noise for SR users. */}
      {!isLoading && !error && (
        <div
          aria-hidden="true"
          className="absolute bottom-2 right-3 z-[15] text-white/40 text-[11px] leading-tight pointer-events-none select-none text-right"
        >
          <div>Hold Esc 3s to exit</div>
          <div>or Ctrl+Shift+Q</div>
        </div>
      )}

      {/* Controls overlay */}
      {showControls && !isLoading && !error && (
        <>
          {/* UX-B4b: shared ViewerToolbar for visual consistency with the other
              viewers. Only the props that make sense in slideshow context are
              wired: Back/Exit (doExit, backLabel "Exit") and the item name.
              Export/Refresh/Full-Screen/Slideshow actions don't apply here and
              are intentionally omitted. Slideshow-specific controls (Settings,
              play/pause, prev/next, slide counter) live in the complementary
              control bars below — ViewerToolbar can't host them. */}
          <div className="absolute top-0 left-0 right-0 z-10">
            <ViewerToolbar
              onBack={doExit}
              backLabel="Exit"
              itemName={toolbarItemName}
            />
            {/* Complementary slideshow controls: counter + settings toggle. */}
            <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-b from-black/60 to-transparent">
              <Text className="text-white text-shadow">
                {slides[currentSlideIndex]?.displayName || 'Slide'}
                {slides[currentSlideIndex]?.type === 'bookmark' ? ' (Bookmark)' : ''}
                ({currentSlideIndex + 1} / {slides.length})
              </Text>
              <Button
                appearance="subtle"
                icon={<SettingsRegular />}
                onClick={() => setShowSettings(!showSettings)}
                className="text-white"
                title="Settings"
                aria-label="Settings"
                aria-expanded={showSettings}
              />
            </div>
          </div>

          {/* Settings panel */}
          {showSettings && (
            <div className="absolute top-24 right-4 bg-neutral-background-1 rounded-lg p-4 shadow-lg z-30 border border-neutral-stroke-1">
              <Text weight="semibold" className="block mb-3">Slideshow Settings</Text>
              <div className="flex items-center gap-3">
                <Text size={200}>Interval:</Text>
                <Slider
                  min={SLIDESHOW_INTERVAL.MIN}
                  max={SLIDESHOW_INTERVAL.MAX}
                  step={SLIDESHOW_INTERVAL.STEP}
                  value={intervalSeconds}
                  onChange={(_, data) => onIntervalChange(data.value)}
                  className="w-[120px]"
                />
                <Text size={200}>{intervalSeconds}s</Text>
              </div>
            </div>
          )}

          {/* Bottom controls */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent z-10">
            <div className="flex items-center justify-center gap-4">
              <Button
                appearance="subtle"
                icon={<ChevronLeftRegular />}
                onClick={prevSlide}
                className="text-white"
                size="large"
                title="Previous slide"
                aria-label="Previous slide"
              />
              <Button
                appearance="primary"
                icon={isPlaying ? <PauseRegular /> : <PlayRegular />}
                onClick={togglePlayPause}
                size="large"
                aria-label={isPlaying ? 'Pause slideshow' : 'Play slideshow'}
                aria-pressed={isPlaying}
              >
                {isPlaying ? 'Pause' : 'Play'}
              </Button>
              <Button
                appearance="subtle"
                icon={<ChevronRightRegular />}
                onClick={nextSlide}
                className="text-white"
                size="large"
                title="Next slide"
                aria-label="Next slide"
              />
            </div>

            {/* Slide indicators */}
            {slides.length > 1 && slides.length <= 20 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                {slides.map((slide, index) => (
                  <button
                    key={index}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      index === currentSlideIndex ? 'bg-white' : 'bg-white/40'
                    } ${slide.type === 'bookmark' ? 'ring-1 ring-white/60' : ''}`}
                    onClick={() => setCurrentSlideIndex(index)}
                    aria-label={`Go to slide ${index + 1}: ${slide.displayName}`}
                    aria-current={index === currentSlideIndex ? 'true' : undefined}
                    title={`Go to ${slide.type === 'bookmark' ? 'bookmark' : 'page'} ${index + 1}: ${slide.displayName}`}
                  />
                ))}
              </div>
            )}
            {/* PROD-S10: scrubber fallback for decks with more than 20
                slides where dot indicators become impractical.
                A11Y: role="slider" correctly describes an interactive control
                that changes value; keyboard support (Left/Right/Home/End)
                makes it operable without a mouse. */}
            {slides.length > 20 && (
              <div className="mt-4 px-4">
                <div
                  className="relative w-full h-1.5 bg-white/30 rounded-full cursor-pointer"
                  role="slider"
                  tabIndex={0}
                  aria-valuenow={currentSlideIndex + 1}
                  aria-valuemin={1}
                  aria-valuemax={slides.length}
                  aria-valuetext={`Slide ${currentSlideIndex + 1} of ${slides.length}`}
                  aria-label="Slide scrubber"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = (e.clientX - rect.left) / rect.width;
                    const target = Math.max(0, Math.min(slides.length - 1, Math.round(ratio * (slides.length - 1))));
                    setCurrentSlideIndex(target);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                      e.preventDefault();
                      e.stopPropagation();
                      setCurrentSlideIndex((prev) => Math.min(prev + 1, slides.length - 1));
                    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                      e.preventDefault();
                      e.stopPropagation();
                      setCurrentSlideIndex((prev) => Math.max(prev - 1, 0));
                    } else if (e.key === 'Home') {
                      e.preventDefault();
                      e.stopPropagation();
                      setCurrentSlideIndex(0);
                    } else if (e.key === 'End') {
                      e.preventDefault();
                      e.stopPropagation();
                      setCurrentSlideIndex(slides.length - 1);
                    }
                  }}
                >
                  <div
                    className="h-full bg-white rounded-full transition-[width] duration-300"
                    style={{ width: `${((currentSlideIndex + 1) / slides.length) * 100}%` }}
                  />
                </div>
                <div className="text-white/60 text-xs text-center mt-1">
                  {currentSlideIndex + 1} / {slides.length}
                </div>
              </div>
            )}
          </div>

          {/* Keyboard hints */}
          <div className="absolute bottom-4 left-4 text-white/60 text-xs">
            <div>← → Arrow keys: Navigate</div>
            <div>Space: Next slide</div>
            <div>P: Play/Pause</div>
            <div>Esc: Exit</div>
          </div>
        </>
      )}
    </div>
  );
};

export default PresentationMode;
