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
import { AnnotationLayer } from './AnnotationLayer';

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

  if (
    target.isContentEditable ||
    target.closest('[contenteditable=""], [contenteditable="true"]')
  ) {
    return true;
  }

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
  const hasAutoStartedRef = useRef(false);

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [slideAnnouncement, setSlideAnnouncement] = useState<string>('');

  const intervalSeconds = useSettingsStore((s) => s.settings.slideshowInterval);
  const slideshowMode = useSettingsStore((s) => s.settings.slideshowMode);
  const autoStartSlideshow = useSettingsStore((s) => s.settings.autoStartSlideshow);
  const autoRefreshEnabled = useSettingsStore((s) => s.settings.autoRefreshEnabled);
  const autoRefreshIntervalMinutes = useSettingsStore((s) => s.settings.autoRefreshInterval);

  const { onIntervalChange } = useDebouncedSettings();

  useEffect(() => {
    void useSettingsStore.getState().loadSettings();
  }, []);

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
        background: pbi.models.BackgroundType.Default,
        navContentPaneEnabled: false,
      },
    }),
    [workspaceId, reportId]
  );

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
    surfacePostLoadErrors: true,
  });

  setEmbedRef(embedRef);

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

  const doExit = useCallback(() => {
    if (isExitingRef.current) return;
    isExitingRef.current = true;

    void window.electronAPI.kiosk.allowDisplaySleep().catch(() => {});

    setIsPlaying(false);
    if (slideshowIntervalRef.current) {
      clearInterval(slideshowIntervalRef.current);
      slideshowIntervalRef.current = null;
    }

    teardownNow();

    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }

    if (workspaceId && reportId) {
      navigate(`/report/${workspaceId}/${reportId}`, { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  }, [workspaceId, reportId, navigate, teardownNow]);

  useExitOnFullscreenChange({
    workspaceId,
    reportId,
    navigate,
    teardownNow,
    isExitingRef,
    slideshowIntervalRef,
  });

  useFocusTrap(overlayRef);

  useEffect(() => {
    void window.electronAPI.kiosk.preventDisplaySleep().catch(() => {});
    return () => {
      void window.electronAPI.kiosk.allowDisplaySleep().catch(() => {});
    };
  }, []);

  useKioskRecovery({ error, loaded: !error && !isLoading, active: isPlaying, recover: reload });

  const { isHolding: isExitHoldActive, holdMs: exitHoldMs } = useKioskExitGesture({
    onExit: doExit,
  });

  const cursorHidden = useCursorHide({ enabled: isPlaying });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;

      if (e.key === 'Escape') {
        e.preventDefault();
        if (showSettings) {
          setShowSettings(false);
        } else if (!autoStartSlideshow) {
          doExit();
        }
        return;
      }

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

  useEffect(() => {
    if (isPlaying && !isAnnotating && slides.length > 0 && !error) {
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
  }, [isPlaying, isAnnotating, intervalSeconds, slides.length, error]);

  const clampedSlideIndex =
    slides.length === 0 ? 0 : Math.min(currentSlideIndex, slides.length - 1);

  useEffect(() => {
    setCurrentSlideIndex((prev) =>
      slides.length === 0 ? 0 : Math.min(prev, slides.length - 1)
    );
  }, [slides.length]);

  useEffect(() => {
    const report = embedRef.current as pbi.Report | null;
    if (report && slides.length > 0) {
      const slide = slides[clampedSlideIndex];
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
  }, [clampedSlideIndex, slides, embedRef]);

  useEffect(() => {
    if (slides.length === 0) return;
    const slide = slides[clampedSlideIndex];
    if (!slide) return;
    setSlideAnnouncement(
      `Slide ${clampedSlideIndex + 1} of ${slides.length}: ${slide.displayName}`
    );
  }, [clampedSlideIndex, slides]);

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

  const toolbarItemName =
    slides[clampedSlideIndex]?.displayName ?? 'Slideshow';

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Slideshow"
      className={`fixed inset-0 z-50 bg-neutral-background-1 ${cursorHidden ? 'cursor-none' : ''}`}
    >
      {}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-background-1 z-20">
          <div className="text-center">
            <Spinner size="large" />
            <Text className="mt-4 text-neutral-foreground-2 block">
              Loading slideshow...
            </Text>
          </div>
        </div>
      )}

      {}
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

      {}
      <div
        ref={embedContainerRef}
        className={`w-full h-full ${isLoading || error ? 'invisible' : 'visible'}`}
      />

      {isAnnotating && !isLoading && !error && (
        <AnnotationLayer
          key={clampedSlideIndex}
          className="z-[8]"
          paletteClassName="bottom-32"
          onExit={() => setIsAnnotating(false)}
        />
      )}

      {}
      {!isLoading && !error && !showControls && (
        <div
          className="absolute inset-0 z-[5] bg-transparent cursor-default"
          onMouseMove={() => {
            setShowControls(true);
          }}
        />
      )}

      {}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {slideAnnouncement}
      </div>

      {}
      {!isLoading && !error && (
        <div
          aria-hidden="true"
          className="absolute bottom-2 right-3 z-[15] pointer-events-none select-none"
        >
          <div className="bg-ink/80 text-white text-[11px] leading-tight rounded-lg px-3 py-1.5 text-right">
            {autoStartSlideshow ? (
              <>
                <div>Hold Esc 3s to exit</div>
                <div>or Ctrl+Shift+Q</div>
              </>
            ) : (
              <div>Press Esc to exit</div>
            )}
          </div>
        </div>
      )}

      {}
      {isExitHoldActive && autoStartSlideshow && !isLoading && !error && (
        <div
          role="status"
          aria-live="assertive"
          className="absolute inset-x-0 top-16 z-40 flex justify-center pointer-events-none"
        >
          <div className="bg-ink/80 rounded-lg px-4 py-3 flex flex-col items-center gap-2">
            <Text className="text-white">Keep holding to exit…</Text>
            <div className="w-48 h-1.5 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-primary rounded-full"
                style={{ animation: `kiosk-hold-progress ${exitHoldMs}ms linear forwards` }}
              />
            </div>
          </div>
        </div>
      )}

      {}
      {showControls && !isLoading && !error && (
        <>
          {}
          <div className="absolute top-0 left-0 right-0 z-10">
            <ViewerToolbar
              onBack={doExit}
              backLabel="Exit"
              itemName={toolbarItemName}
              onAnnotate={() => setIsAnnotating((v) => !v)}
              isAnnotating={isAnnotating}
            />
            {}
            <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-b from-black/60 to-transparent">
              <Text className="text-white text-shadow">
                {slides[clampedSlideIndex]?.displayName || 'Slide'}
                {slides[clampedSlideIndex]?.type === 'bookmark' ? ' (Bookmark)' : ''}
                ({clampedSlideIndex + 1} / {slides.length})
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

          {}
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

          {}
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

            {}
            {slides.length > 1 && slides.length <= 20 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                {slides.map((slide, index) => (
                  <button
                    key={index}
                    className={`focus-ring w-2 h-2 rounded-full transition-colors ${
                      index === clampedSlideIndex ? 'bg-white' : 'bg-white/40'
                    } ${slide.type === 'bookmark' ? 'ring-1 ring-white/60' : ''}`}
                    onClick={() => setCurrentSlideIndex(index)}
                    aria-label={`Go to slide ${index + 1}: ${slide.displayName}`}
                    aria-current={index === clampedSlideIndex ? 'true' : undefined}
                    title={`Go to ${slide.type === 'bookmark' ? 'bookmark' : 'page'} ${index + 1}: ${slide.displayName}`}
                  />
                ))}
              </div>
            )}
            {}
            {slides.length > 20 && (
              <div className="mt-4 px-4">
                <div
                  className="relative w-full h-1.5 bg-white/30 rounded-full cursor-pointer"
                  role="slider"
                  tabIndex={0}
                  aria-valuenow={clampedSlideIndex + 1}
                  aria-valuemin={1}
                  aria-valuemax={slides.length}
                  aria-valuetext={`Slide ${clampedSlideIndex + 1} of ${slides.length}`}
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
                    style={{ width: `${((clampedSlideIndex + 1) / slides.length) * 100}%` }}
                  />
                </div>
                <div className="text-white/60 text-xs text-center mt-1">
                  {clampedSlideIndex + 1} / {slides.length}
                </div>
              </div>
            )}
          </div>

          {}
          <div className="absolute bottom-4 left-4 text-white/60 text-xs">
            <div>← → Arrow keys: Navigate</div>
            <div>Space: Next slide</div>
            <div>P: Play/Pause</div>
            {!autoStartSlideshow && <div>Esc: Exit</div>}
          </div>
        </>
      )}
    </div>
  );
};

export default PresentationMode;
