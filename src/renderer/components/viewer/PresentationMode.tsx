import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spinner, Button, Text, Slider } from '@fluentui/react-components';
import {
  DismissRegular,
  PlayRegular,
  PauseRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
  SettingsRegular,
} from '@fluentui/react-icons';
import * as pbi from 'powerbi-client';
import { SLIDESHOW_INTERVAL } from '../../../shared/constants';
import { usePowerBIEmbed } from '../../hooks/usePowerBIEmbed';
import { usePowerBIService } from '../../hooks/usePowerBIService';
import { useSettingsStore } from '../../stores/settings-store';

interface ReportPage {
  name: string;
  displayName: string;
}

interface ReportBookmark {
  name: string;
  displayName: string;
  state?: string;
}

// Unified slide item that can be either a page or bookmark
interface SlideItem {
  type: 'page' | 'bookmark';
  name: string;
  displayName: string;
  pageName?: string;
}

export const PresentationMode: React.FC = () => {
  const { workspaceId, reportId } = useParams<{
    workspaceId: string;
    reportId: string;
  }>();
  const navigate = useNavigate();
  // Kept for the doExit teardown path — we still need to force-reset the
  // container synchronously when the user pulls the ripcord on the slideshow,
  // because navigation away handles unmount asynchronously.
  const powerbiService = usePowerBIService();

  const embedContainerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const slideshowIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isExitingRef = useRef(false);
  const hasEnteredFullscreen = useRef(false);
  const persistIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [pages, setPages] = useState<ReportPage[]>([]);
  const [bookmarks, setBookmarks] = useState<ReportBookmark[]>([]);
  const [slides, setSlides] = useState<SlideItem[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [slidesReady, setSlidesReady] = useState(false);
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

  // Defensive bootstrap: ensure the store has fetched once. Idempotent if
  // App bootstrap already ran it. We can't edit App.tsx in this sprint
  // (DEV-D scope), so each viewer self-bootstraps. Real values come from
  // the store subscriptions above.
  useEffect(() => {
    void useSettingsStore.getState().loadSettings();
  }, []);

  // Flush any pending debounced interval-persist timer on unmount
  useEffect(() => {
    return () => {
      if (persistIntervalRef.current) {
        clearTimeout(persistIntervalRef.current);
        persistIntervalRef.current = null;
      }
    };
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

  // Loaded handler — pull pages and (optionally) bookmarks. Slides list is
  // rebuilt by a separate effect that watches pages/bookmarks/slideshowMode.
  const events = useMemo(
    () => ({
      loaded: async () => {
        const report = embedRef.current as pbi.Report | null;
        if (!report) return;

        try {
          const reportPages = await report.getPages();
          const visiblePages = reportPages
            .filter((p) => p.visibility !== 1)
            .map((p) => ({
              name: p.name,
              displayName: p.displayName,
            }));
          setPages(visiblePages);
        } catch (err) {
          console.error('Failed to get pages:', err);
        }

        try {
          const bookmarksManager = report.bookmarksManager;
          const reportBookmarks = await bookmarksManager.getBookmarks();
          const bookmarksList = reportBookmarks.map((b) => ({
            name: b.name,
            displayName: b.displayName || b.name,
            state: b.state,
          }));
          setBookmarks(bookmarksList);
        } catch (err) {
          // Bookmarks may not be available for all reports
          console.warn('Failed to get bookmarks (may not be supported):', err);
          setBookmarks([]);
        }
      },
    }),
    // embedRef is a stable MutableRefObject — its identity never changes between renders,
    // so omitting it from deps is intentional and correct per React ref semantics.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const {
    isLoading,
    error,
    embedRef,
    reload,
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

  // Build slides list based on slideshowMode when pages/bookmarks change
  useEffect(() => {
    const newSlides: SlideItem[] = [];

    if (slideshowMode === 'pages' || slideshowMode === 'both') {
      for (const page of pages) {
        newSlides.push({
          type: 'page',
          name: page.name,
          displayName: page.displayName,
        });
      }
    }

    if (slideshowMode === 'bookmarks' || slideshowMode === 'both') {
      for (const bookmark of bookmarks) {
        newSlides.push({
          type: 'bookmark',
          name: bookmark.name,
          displayName: bookmark.displayName,
        });
      }
    }

    // Fallback: if no slides available in bookmark mode, use pages
    if (newSlides.length === 0 && pages.length > 0) {
      for (const page of pages) {
        newSlides.push({
          type: 'page',
          name: page.name,
          displayName: page.displayName,
        });
      }
    }

    setSlides(newSlides);
    setSlidesReady(newSlides.length > 0);
  }, [pages, bookmarks, slideshowMode]);

  // Auto-start slideshow when slides are ready (if setting enabled)
  useEffect(() => {
    if (slidesReady && autoStartSlideshow && !isPlaying && !isLoading && !error) {
      setIsPlaying(true);
    }
  }, [slidesReady, autoStartSlideshow, isLoading, error, isPlaying]);

  // Exit function - navigates back to report viewer
  const doExit = useCallback(() => {
    if (isExitingRef.current) return;
    isExitingRef.current = true;

    // Stop slideshow
    setIsPlaying(false);
    if (slideshowIntervalRef.current) {
      clearInterval(slideshowIntervalRef.current);
      slideshowIntervalRef.current = null;
    }

    // Hard-reset the container so the iframe stops rendering immediately.
    // The hook's cleanup will also reset on unmount, but we want the visual
    // gone before navigate() runs. CRITICAL: detach handlers FIRST so a
    // late-firing 'error' event from the reset itself can't run on a ghost
    // embed and call setError/setIsLoading on this about-to-unmount component.
    if (embedContainerRef.current) {
      try {
        const embed = embedRef.current;
        if (embed) {
          try { embed.off('loaded'); embed.off('error'); } catch { /* ignore */ }
        }
        powerbiService.reset(embedContainerRef.current);
      } catch {
        // Ignore cleanup errors
      }
    }

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
    // embedRef is a stable MutableRefObject — omitting it from deps is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, reportId, navigate, powerbiService]);

  // Try to enter fullscreen on mount (don't block if it fails)
  useEffect(() => {
    document.documentElement.requestFullscreen?.().then(() => {
      hasEnteredFullscreen.current = true;
    }).catch(() => {});
  }, []);

  // Listen for fullscreen exit — Escape pulls us out of fullscreen, which
  // is our cue to navigate back to the standard report view.
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && !isExitingRef.current && hasEnteredFullscreen.current) {
        isExitingRef.current = true;

        // Stop slideshow
        if (slideshowIntervalRef.current) {
          clearInterval(slideshowIntervalRef.current);
          slideshowIntervalRef.current = null;
        }

        // Hook cleanup will detach embed handlers and reset the container
        // on unmount — but force a reset now so the iframe stops painting
        // before we navigate. Detach handlers FIRST so a synthetic error
        // emitted by the reset can't paint a ghost-embed setError onto an
        // about-to-unmount component.
        if (embedContainerRef.current) {
          try {
            const embed = embedRef.current;
            if (embed) {
              try { embed.off('loaded'); embed.off('error'); } catch { /* ignore */ }
            }
            powerbiService.reset(embedContainerRef.current);
          } catch {
            // Ignore
          }
        }

        if (workspaceId && reportId) {
          navigate(`/report/${workspaceId}/${reportId}`, { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    // embedRef is a stable MutableRefObject — omitting it from deps is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, reportId, navigate, powerbiService]);

  // Focus management: save previously-focused element on mount, restore on unmount.
  // Keeps screen-reader / keyboard users from being stranded after exit.
  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    return () => {
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
        try { prev.focus(); } catch { /* ignore */ }
      }
    };
  }, []);

  // Simple focus trap: cycle Tab / Shift+Tab among focusable elements inside
  // the overlay. Avoids dragging in a focus-trap library for this single use.
  useEffect(() => {
    const handleTrap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const root = overlayRef.current;
      if (!root) return;

      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('aria-hidden') && el.offsetParent !== null);

      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      // noUncheckedIndexedAccess narrows these to T | undefined, but the
      // length>0 guard above means both are defined here.
      if (!first || !last) return;
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !root.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleTrap, true);
    return () => document.removeEventListener('keydown', handleTrap, true);
  }, []);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['Escape', 'ArrowRight', 'ArrowLeft', ' ', 'p', 'P'].includes(e.key)) {
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
        case 'Escape':
          doExit();
          break;
        case 'p':
        case 'P':
          setIsPlaying((prev) => !prev);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [slides.length, doExit]);

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

  // Hide controls after inactivity
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

    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
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

  // reload is wired to the error overlay's retry path (via doExit fallback);
  // currently the error UI exits rather than retrying in place. Keep the
  // reference around in case we want a Try Again button later.
  void reload;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Presentation mode"
      className="fixed inset-0 z-50 bg-neutral-background-1"
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

      {/* Controls overlay */}
      {showControls && !isLoading && !error && (
        <>
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/60 to-transparent z-10">
            <div className="flex items-center justify-between">
              <Text className="text-white text-shadow">
                {slides[currentSlideIndex]?.displayName || 'Slide'}
                {slides[currentSlideIndex]?.type === 'bookmark' ? ' (Bookmark)' : ''}
                ({currentSlideIndex + 1} / {slides.length})
              </Text>
              <div className="flex items-center gap-2">
                <Button
                  appearance="subtle"
                  icon={<SettingsRegular />}
                  onClick={() => setShowSettings(!showSettings)}
                  className="text-white"
                  title="Settings"
                  aria-label="Settings"
                  aria-expanded={showSettings}
                />
                <Button
                  appearance="subtle"
                  icon={<DismissRegular />}
                  onClick={doExit}
                  className="text-white"
                  title="Exit (Esc)"
                  aria-label="Exit presentation"
                />
              </div>
            </div>
          </div>

          {/* Settings panel */}
          {showSettings && (
            <div className="absolute top-16 right-4 bg-neutral-background-1 rounded-lg p-4 shadow-lg z-30 border border-neutral-stroke-1">
              <Text weight="semibold" className="block mb-3">Slideshow Settings</Text>
              <div className="flex items-center gap-3">
                <Text size={200}>Interval:</Text>
                <Slider
                  min={SLIDESHOW_INTERVAL.MIN}
                  max={SLIDESHOW_INTERVAL.MAX}
                  step={SLIDESHOW_INTERVAL.STEP}
                  value={intervalSeconds}
                  onChange={(_, data) => {
                    // Optimistic local update: push the new value into the
                    // store immediately so the slider thumb and the
                    // slideshow's interval effect track the drag without
                    // waiting on the IPC. The debounced updateSettings call
                    // below persists to disk and (re-)sets store state with
                    // the canonical response.
                    useSettingsStore.setState((prev) => ({
                      settings: { ...prev.settings, slideshowInterval: data.value },
                    }));
                    if (persistIntervalRef.current) clearTimeout(persistIntervalRef.current);
                    persistIntervalRef.current = setTimeout(() => {
                      void useSettingsStore
                        .getState()
                        .updateSettings({ slideshowInterval: data.value });
                    }, 300);
                  }}
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
