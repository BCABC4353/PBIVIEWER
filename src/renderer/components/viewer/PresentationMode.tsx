import React, { useEffect, useRef, useState } from 'react';
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
import type { IPCResponse, EmbedToken, AppSettings } from '../../../shared/types';

const powerbiService = new pbi.service.Service(
  pbi.factories.hpmFactory,
  pbi.factories.wpmpFactory,
  pbi.factories.routerFactory
);

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
  pageName?: string; // For bookmarks, which page they belong to
}

export const PresentationMode: React.FC = () => {
  const { workspaceId, reportId } = useParams<{
    workspaceId: string;
    reportId: string;
  }>();
  const navigate = useNavigate();

  const embedContainerRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<pbi.Report | null>(null);
  const isLoadingRef = useRef(false);
  const slideshowIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isExitingRef = useRef(false);
  const hasEnteredFullscreen = useRef(false);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<ReportPage[]>([]);
  const [bookmarks, setBookmarks] = useState<ReportBookmark[]>([]);
  const [slides, setSlides] = useState<SlideItem[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [intervalSeconds, setIntervalSeconds] = useState(30);
  const [slideshowMode, setSlideshowMode] = useState<'pages' | 'bookmarks' | 'both'>('pages');
  const [autoStartSlideshow, setAutoStartSlideshow] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [autoRefreshIntervalMinutes, setAutoRefreshIntervalMinutes] = useState(1);
  const [slidesReady, setSlidesReady] = useState(false);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await window.electronAPI.settings.get() as IPCResponse<AppSettings>;
        if (response.success && response.data) {
          setIntervalSeconds(response.data.slideshowInterval);
          setSlideshowMode(response.data.slideshowMode);
          setAutoStartSlideshow(response.data.autoStartSlideshow);
          setAutoRefreshEnabled(response.data.autoRefreshEnabled);
          setAutoRefreshIntervalMinutes(response.data.autoRefreshInterval);
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };
    loadSettings();
  }, []);

  // Build slides list based on slideshowMode when pages/bookmarks change
  useEffect(() => {
    const newSlides: SlideItem[] = [];

    if (slideshowMode === 'pages' || slideshowMode === 'both') {
      // Add all pages
      for (const page of pages) {
        newSlides.push({
          type: 'page',
          name: page.name,
          displayName: page.displayName,
        });
      }
    }

    if (slideshowMode === 'bookmarks' || slideshowMode === 'both') {
      // Add all bookmarks
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
  }, [slidesReady, autoStartSlideshow, isLoading, error]);

  // Exit function - navigates back to report viewer
  const doExit = () => {
    if (isExitingRef.current) return;
    isExitingRef.current = true;

    // Stop slideshow
    setIsPlaying(false);
    if (slideshowIntervalRef.current) {
      clearInterval(slideshowIntervalRef.current);
      slideshowIntervalRef.current = null;
    }

    // Clean up Power BI
    if (embedContainerRef.current) {
      try {
        powerbiService.reset(embedContainerRef.current);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    reportRef.current = null;

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
  };

  // Load report on mount
  useEffect(() => {
    if (!workspaceId || !reportId) {
      setError('Invalid report parameters');
      setIsLoading(false);
      return;
    }

    if (isLoadingRef.current) {
      return;
    }

    loadReport();

    // Try to enter fullscreen (don't block if it fails)
    document.documentElement.requestFullscreen?.().then(() => {
      hasEnteredFullscreen.current = true;
    }).catch(() => {});

    return () => {
      if (slideshowIntervalRef.current) {
        clearInterval(slideshowIntervalRef.current);
        slideshowIntervalRef.current = null;
      }
      if (embedContainerRef.current) {
        try {
          powerbiService.reset(embedContainerRef.current);
        } catch (e) {
          // Ignore
        }
      }
      reportRef.current = null;
      isLoadingRef.current = false;
    };
  }, [workspaceId, reportId]);

  // Listen for fullscreen exit - when user presses Escape, browser exits fullscreen
  // and we need to navigate back to the report
  useEffect(() => {
    const handleFullscreenChange = () => {
      // If fullscreen was exited (and we didn't trigger it ourselves via doExit)
      // and we had successfully entered fullscreen before
      if (!document.fullscreenElement && !isExitingRef.current && hasEnteredFullscreen.current) {
        isExitingRef.current = true;

        // Stop slideshow
        if (slideshowIntervalRef.current) {
          clearInterval(slideshowIntervalRef.current);
          slideshowIntervalRef.current = null;
        }

        // Clean up Power BI
        if (embedContainerRef.current) {
          try {
            powerbiService.reset(embedContainerRef.current);
          } catch (e) {
            // Ignore
          }
        }
        reportRef.current = null;

        // Navigate back to the report viewer
        if (workspaceId && reportId) {
          navigate(`/report/${workspaceId}/${reportId}`, { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [workspaceId, reportId, navigate]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent default for our handled keys
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
  }, [slides.length, workspaceId, reportId]);

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
    if (reportRef.current && slides.length > 0) {
      const slide = slides[currentSlideIndex];
      if (slide) {
        if (slide.type === 'page') {
          reportRef.current.setPage(slide.name).catch((err) => {
            console.error('Failed to set page:', err);
          });
        } else if (slide.type === 'bookmark') {
          reportRef.current.bookmarksManager.apply(slide.name).catch((err) => {
            console.error('Failed to apply bookmark:', err);
          });
        }
      }
    }
  }, [currentSlideIndex, slides]);

  // Auto-refresh data based on settings - only when visible
  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const refreshIntervalId = setInterval(() => {
      // Only refresh if document is visible (not in background tab)
      if (reportRef.current && !isLoading && !error && document.visibilityState === 'visible') {
        reportRef.current.refresh().catch((err) => {
          // Some visuals (like FlowVisual) may throw authorization errors
          // during refresh - these are non-fatal and the report still works
          console.warn('[PresentationMode] Auto-refresh warning (non-fatal):', err?.message || err);
        });
      }
    }, autoRefreshIntervalMinutes * 60 * 1000); // Convert minutes to milliseconds

    return () => {
      clearInterval(refreshIntervalId);
    };
  }, [isLoading, error, autoRefreshEnabled, autoRefreshIntervalMinutes]);

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

    // Initial call to set up the timeout
    handleMouseMove();

    // Attach to both window and document to catch all mouse movements
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

  const loadReport = async () => {
    if (!embedContainerRef.current || !workspaceId || !reportId) return;

    if (isLoadingRef.current) {
      return;
    }
    isLoadingRef.current = true;

    setIsLoading(true);
    setError(null);

    try {
      powerbiService.reset(embedContainerRef.current);

      const embedUrl = `https://app.powerbi.com/reportEmbed?reportId=${reportId}&groupId=${workspaceId}`;

      const tokenResponse = await window.electronAPI.content.getEmbedToken(
        reportId,
        workspaceId
      ) as IPCResponse<EmbedToken>;

      if (!tokenResponse.success || !tokenResponse.data) {
        throw new Error(tokenResponse.error?.message || 'Failed to get embed token');
      }

      const token = tokenResponse.data.token;

      const embedConfig: pbi.IReportEmbedConfiguration = {
        type: 'report',
        id: reportId,
        embedUrl: embedUrl,
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
      };

      const report = powerbiService.embed(
        embedContainerRef.current,
        embedConfig
      ) as pbi.Report;

      reportRef.current = report;

      report.on('loaded', async () => {
        setIsLoading(false);

        // Get all pages
        try {
          const reportPages = await report.getPages();
          const visiblePages = reportPages
            .filter((p) => p.visibility !== 1) // Filter hidden pages
            .map((p) => ({
              name: p.name,
              displayName: p.displayName,
            }));
          setPages(visiblePages);
        } catch (err) {
          console.error('Failed to get pages:', err);
        }

        // Get all bookmarks
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
      });

      report.on('error', (event) => {
        console.error('[PresentationMode] Report error:', event);
        setError('Failed to load report. Please try again.');
        setIsLoading(false);
      });

    } catch (err) {
      console.error('[PresentationMode] Failed to load report:', err);
      setError(String(err));
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  };

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

  return (
    <div className="fixed inset-0 z-50 bg-neutral-background-1">
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
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-background-1 z-20">
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
        className="w-full h-full"
        style={{ visibility: isLoading || error ? 'hidden' : 'visible' }}
      />

      {/* Transparent overlay to detect mouse movement over iframe */}
      {!isLoading && !error && !showControls && (
        <div
          className="absolute inset-0"
          onMouseMove={() => {
            setShowControls(true);
          }}
          style={{
            zIndex: 5,
            background: 'transparent',
            cursor: 'default'
          }}
        />
      )}

      {/* Controls overlay */}
      {showControls && !isLoading && !error && (
        <>
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/60 to-transparent" style={{ zIndex: 10 }}>
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
                  style={{ color: 'white' }}
                  title="Settings"
                />
                <Button
                  appearance="subtle"
                  icon={<DismissRegular />}
                  onClick={doExit}
                  style={{ color: 'white' }}
                  title="Exit (Esc)"
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
                  min={3}
                  max={60}
                  value={intervalSeconds}
                  onChange={(_, data) => setIntervalSeconds(data.value)}
                  style={{ width: '120px' }}
                />
                <Text size={200}>{intervalSeconds}s</Text>
              </div>
            </div>
          )}

          {/* Bottom controls */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent" style={{ zIndex: 10 }}>
            <div className="flex items-center justify-center gap-4">
              <Button
                appearance="subtle"
                icon={<ChevronLeftRegular />}
                onClick={prevSlide}
                style={{ color: 'white' }}
                size="large"
                title="Previous slide"
              />
              <Button
                appearance="primary"
                icon={isPlaying ? <PauseRegular /> : <PlayRegular />}
                onClick={togglePlayPause}
                size="large"
              >
                {isPlaying ? 'Pause' : 'Play'}
              </Button>
              <Button
                appearance="subtle"
                icon={<ChevronRightRegular />}
                onClick={nextSlide}
                style={{ color: 'white' }}
                size="large"
                title="Next slide"
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
                    title={`Go to ${slide.type === 'bookmark' ? 'bookmark' : 'page'} ${index + 1}`}
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
