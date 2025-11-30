import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
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
import type { IPCResponse, EmbedToken } from '../../../shared/types';

const powerbiService = new pbi.service.Service(
  pbi.factories.hpmFactory,
  pbi.factories.wpmpFactory,
  pbi.factories.routerFactory
);

interface ReportPage {
  name: string;
  displayName: string;
}

export const PresentationMode: React.FC = () => {
  const { workspaceId, reportId } = useParams<{ workspaceId: string; reportId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const embedContainerRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<pbi.Report | null>(null);
  const isLoadingRef = useRef(false);
  const slideshowIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<ReportPage[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [interval, setIntervalValue] = useState(10); // seconds
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

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

    // Enter fullscreen
    document.documentElement.requestFullscreen?.();

    return () => {
      if (embedContainerRef.current) {
        powerbiService.reset(embedContainerRef.current);
      }
      reportRef.current = null;
      isLoadingRef.current = false;
      if (slideshowIntervalRef.current) {
        clearInterval(slideshowIntervalRef.current);
      }
      // Exit fullscreen
      document.exitFullscreen?.();
    };
  }, [workspaceId, reportId]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
        case ' ':
          nextPage();
          break;
        case 'ArrowLeft':
          prevPage();
          break;
        case 'Escape':
          handleExit();
          break;
        case 'p':
        case 'P':
          togglePlayPause();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pages, currentPageIndex, isPlaying]);

  // Handle slideshow auto-advance
  useEffect(() => {
    if (isPlaying && pages.length > 0) {
      slideshowIntervalRef.current = setInterval(() => {
        setCurrentPageIndex((prev) => (prev + 1) % pages.length);
      }, interval * 1000);
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
  }, [isPlaying, interval, pages.length]);

  // Navigate to page when index changes
  useEffect(() => {
    if (reportRef.current && pages.length > 0) {
      const page = pages[currentPageIndex];
      if (page) {
        reportRef.current.setPage(page.name);
      }
    }
  }, [currentPageIndex, pages]);

  // Hide controls after inactivity
  useEffect(() => {
    let timeout: NodeJS.Timeout;

    const handleMouseMove = () => {
      setShowControls(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (isPlaying) {
          setShowControls(false);
        }
      }, 3000);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(timeout);
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
        embedUrl: `https://app.powerbi.com/reportEmbed?reportId=${reportId}&groupId=${workspaceId}`,
        accessToken: token,
        tokenType: pbi.models.TokenType.Aad,
        settings: {
          panes: {
            filters: { visible: false },
            pageNavigation: { visible: false },
          },
          background: pbi.models.BackgroundType.Transparent,
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

  const nextPage = useCallback(() => {
    if (pages.length > 0) {
      setCurrentPageIndex((prev) => (prev + 1) % pages.length);
    }
  }, [pages.length]);

  const prevPage = useCallback(() => {
    if (pages.length > 0) {
      setCurrentPageIndex((prev) => (prev - 1 + pages.length) % pages.length);
    }
  }, [pages.length]);

  const togglePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const handleExit = () => {
    document.exitFullscreen?.();
    navigate(-1);
  };

  return (
    <div className="fixed inset-0 bg-black z-50">
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-20">
          <div className="text-center">
            <Spinner size="large" />
            <Text className="mt-4 text-white block">
              Loading presentation...
            </Text>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-20">
          <div className="text-center max-w-md">
            <Text className="text-red-500 block mb-4">{error}</Text>
            <Button appearance="primary" onClick={handleExit}>
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

      {/* Controls overlay */}
      {showControls && !isLoading && !error && (
        <>
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent">
            <div className="flex items-center justify-between">
              <Text className="text-white">
                {pages[currentPageIndex]?.displayName || 'Page'} ({currentPageIndex + 1} / {pages.length})
              </Text>
              <div className="flex items-center gap-2">
                <Button
                  appearance="subtle"
                  icon={<SettingsRegular />}
                  onClick={() => setShowSettings(!showSettings)}
                  className="text-white hover:bg-white/20"
                />
                <Button
                  appearance="subtle"
                  icon={<DismissRegular />}
                  onClick={handleExit}
                  className="text-white hover:bg-white/20"
                />
              </div>
            </div>
          </div>

          {/* Settings panel */}
          {showSettings && (
            <div className="absolute top-16 right-4 bg-neutral-background-1 rounded-lg p-4 shadow-lg z-30">
              <Text weight="semibold" className="block mb-3">Slideshow Settings</Text>
              <div className="flex items-center gap-3">
                <Text size={200}>Interval:</Text>
                <Slider
                  min={3}
                  max={60}
                  value={interval}
                  onChange={(_, data) => setIntervalValue(data.value)}
                  className="w-32"
                />
                <Text size={200}>{interval}s</Text>
              </div>
            </div>
          )}

          {/* Bottom controls */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
            <div className="flex items-center justify-center gap-4">
              <Button
                appearance="subtle"
                icon={<ChevronLeftRegular />}
                onClick={prevPage}
                className="text-white hover:bg-white/20"
                size="large"
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
                onClick={nextPage}
                className="text-white hover:bg-white/20"
                size="large"
              />
            </div>

            {/* Page indicators */}
            <div className="flex items-center justify-center gap-2 mt-4">
              {pages.map((_, index) => (
                <button
                  key={index}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    index === currentPageIndex ? 'bg-white' : 'bg-white/40'
                  }`}
                  onClick={() => setCurrentPageIndex(index)}
                />
              ))}
            </div>
          </div>

          {/* Keyboard hints */}
          <div className="absolute bottom-4 left-4 text-white/60 text-xs">
            <div>Arrow keys: Navigate</div>
            <div>Space: Next page</div>
            <div>P: Play/Pause</div>
            <div>Esc: Exit</div>
          </div>
        </>
      )}
    </div>
  );
};

export default PresentationMode;
