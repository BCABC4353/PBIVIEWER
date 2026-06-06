import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spinner, Button, Text } from '@fluentui/react-components';
import {
  ArrowLeftRegular,
  ArrowSyncRegular,
  ArrowDownloadRegular,
  FullScreenMaximizeRegular,
  PlayRegular,
} from '@fluentui/react-icons';
import * as pbi from 'powerbi-client';
import { usePowerBIEmbed } from '../../hooks/usePowerBIEmbed';

interface PageInfo {
  name: string;
  displayName: string;
}

export const ReportViewer: React.FC = () => {
  const { workspaceId, reportId } = useParams<{ workspaceId: string; reportId: string }>();
  const navigate = useNavigate();

  const embedContainerRef = useRef<HTMLDivElement>(null);

  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [autoRefreshIntervalMinutes, setAutoRefreshIntervalMinutes] = useState(1);
  const [lastDataRefresh, setLastDataRefresh] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const datasetIdRef = useRef<string | null>(null);
  const exportTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fullscreen keyboard navigation state
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFullscreenHint, setShowFullscreenHint] = useState(false);
  const pagesRef = useRef<PageInfo[]>([]);
  const currentPageIndexRef = useRef(0);

  // Keep refs in sync with state for use in event handlers
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    currentPageIndexRef.current = currentPageIndex;
  }, [currentPageIndex]);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await window.electronAPI.settings.get();
        if (response.success) {
          setAutoRefreshEnabled(response.data.autoRefreshEnabled);
          setAutoRefreshIntervalMinutes(response.data.autoRefreshInterval);
        }
      } catch (error) {
        console.warn('[ReportViewer] Settings load failed, using defaults:', error);
      }
    };
    loadSettings();
  }, []);

  // Fetch report metadata (datasetId) — used by the loaded handler to pull
  // dataset refresh info. Fires once per workspace/report change.
  useEffect(() => {
    if (!workspaceId || !reportId) return;
    let cancelled = false;
    (async () => {
      try {
        const reportsResponse = await window.electronAPI.content.getReports(workspaceId);
        if (cancelled) return;
        if (reportsResponse.success && reportsResponse.data) {
          const reportData = reportsResponse.data.find((r) => r.id === reportId);
          if (reportData?.datasetId) {
            datasetIdRef.current = reportData.datasetId;
          }
        }
      } catch (error) {
        console.warn('[ReportViewer] Report metadata fetch failed:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, reportId]);

  // Build embed configuration. Stable per (workspaceId, reportId).
  const buildConfig = useCallback(
    (token: string): pbi.IReportEmbedConfiguration => ({
      type: 'report',
      id: reportId,
      embedUrl: `https://app.powerbi.com/reportEmbed?reportId=${reportId}&groupId=${workspaceId}`,
      accessToken: token,
      tokenType: pbi.models.TokenType.Aad,
      settings: {
        panes: {
          filters: {
            visible: true,
            expanded: false,
          },
          pageNavigation: {
            visible: true,
          },
        },
        background: pbi.models.BackgroundType.Default,
        navContentPaneEnabled: true,
      },
    }),
    [workspaceId, reportId]
  );

  // Event handlers passed to the hook. The hook handles lifecycle bookkeeping
  // for 'loaded' and 'error'; these run after that housekeeping.
  const events = useMemo(
    () => ({
      loaded: async () => {
        const report = embedRef.current as pbi.Report | null;
        if (!report) return;

        // Fetch pages for keyboard navigation in fullscreen
        try {
          const reportPages = await report.getPages();
          const visiblePages = reportPages.filter((p: pbi.Page) => p.visibility !== 1);
          const pageInfos: PageInfo[] = visiblePages.map((p: pbi.Page) => ({
            name: p.name,
            displayName: p.displayName,
          }));
          setPages(pageInfos);

          const activePage = reportPages.find((p: pbi.Page) => p.isActive);
          if (activePage) {
            const activeIndex = pageInfos.findIndex((p) => p.name === activePage.name);
            if (activeIndex >= 0) {
              setCurrentPageIndex(activeIndex);
            }
          }
        } catch (error) {
          console.warn('[ReportViewer] Page fetch failed:', error);
        }

        // Fetch dataset refresh info after report loads
        if (datasetIdRef.current && workspaceId) {
          try {
            const refreshResponse = await window.electronAPI.content.getDatasetRefreshInfo(
              datasetIdRef.current,
              workspaceId
            );
            if (refreshResponse.success && refreshResponse.data?.lastRefreshTime) {
              setLastDataRefresh(refreshResponse.data.lastRefreshTime);
            }
          } catch (error) {
            console.warn('[ReportViewer] Dataset refresh info unavailable:', error);
          }
        }
      },
      // Track page changes to keep keyboard navigation in sync
      pageChanged: async () => {
        const report = embedRef.current as pbi.Report | null;
        if (!report) return;
        try {
          const currentPages = await report.getPages();
          const activePage = currentPages.find((p: pbi.Page) => p.isActive);
          if (activePage && pagesRef.current.length > 0) {
            const activeIndex = pagesRef.current.findIndex((p) => p.name === activePage.name);
            if (activeIndex >= 0) {
              setCurrentPageIndex(activeIndex);
            }
          }
        } catch (error) {
          console.warn('[ReportViewer] Page tracking failed:', error);
        }
      },
    }),
    // embedRef is mutable — referenced lazily inside handlers.
    // workspaceId is read inside loaded; include it for correctness.
    [workspaceId]
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
    errorFallback:
      'This report could not be loaded. You may not have access, or it may have been removed.',
    // Match legacy ReportViewer behavior: post-load errors stay silent.
    surfacePostLoadErrors: false,
  });

  useEffect(() => {
    return () => {
      if (exportTimeoutRef.current) {
        clearTimeout(exportTimeoutRef.current);
      }
    };
  }, []);

  const showExportStatus = (message: string) => {
    setExportStatus(message);
    if (exportTimeoutRef.current) {
      clearTimeout(exportTimeoutRef.current);
    }
    exportTimeoutRef.current = setTimeout(() => {
      setExportStatus(null);
    }, 4000);
  };

  // Navigate to a specific page by index
  const navigateToPage = useCallback(async (pageIndex: number) => {
    const report = embedRef.current as pbi.Report | null;
    if (!report || pagesRef.current.length === 0) return;

    const targetIndex = Math.max(0, Math.min(pageIndex, pagesRef.current.length - 1));
    const targetPage = pagesRef.current[targetIndex];

    if (targetPage) {
      try {
        await report.setPage(targetPage.name);
        setCurrentPageIndex(targetIndex);
      } catch (error) {
        console.warn('[ReportViewer] Page navigation failed:', error);
      }
    }
  }, [embedRef]);

  // Fullscreen change detection
  useEffect(() => {
    let hintTimer: NodeJS.Timeout | null = null;
    const handleFullscreenChange = () => {
      const isNowFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isNowFullscreen);

      if (isNowFullscreen) {
        if (embedContainerRef.current) {
          embedContainerRef.current.focus();
        }
        if (pages.length > 1) {
          setShowFullscreenHint(true);
          if (hintTimer) clearTimeout(hintTimer);
          hintTimer = setTimeout(() => setShowFullscreenHint(false), 5000);
        }
      } else {
        setShowFullscreenHint(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (hintTimer) clearTimeout(hintTimer);
    };
  }, [pages.length]);

  // Keyboard navigation for fullscreen mode
  // Use capture phase to intercept events before the iframe consumes them
  useEffect(() => {
    let focusCheckInterval: NodeJS.Timeout | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!document.fullscreenElement) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const currentPages = pagesRef.current;
        const currentIdx = currentPageIndexRef.current;

        if (currentPages.length === 0) return;

        if (e.key === 'ArrowRight') {
          const nextIndex = (currentIdx + 1) % currentPages.length;
          navigateToPage(nextIndex);
        } else if (e.key === 'ArrowLeft') {
          const prevIndex = (currentIdx - 1 + currentPages.length) % currentPages.length;
          navigateToPage(prevIndex);
        }

        if (embedContainerRef.current) {
          embedContainerRef.current.focus();
        }
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (!document.fullscreenElement) return;
      if (embedContainerRef.current?.contains(e.target as Node)) {
        setTimeout(() => {
          if (embedContainerRef.current && document.fullscreenElement) {
            embedContainerRef.current.focus();
          }
        }, 10);
        setTimeout(() => {
          if (embedContainerRef.current && document.fullscreenElement) {
            embedContainerRef.current.focus();
          }
        }, 100);
      }
    };

    // Reclaim focus ONLY when it was genuinely lost to the body — NEVER when the user
    // is interacting with the Power BI iframe (active === the iframe element), or we
    // fight the iframe and slicer/dropdown clicks won't stick.
    const maintainFocus = () => {
      if (!document.fullscreenElement || !embedContainerRef.current) return;
      const active = document.activeElement;
      if (active === document.body || active === null) {
        embedContainerRef.current.focus();
      }
    };

    if (isFullscreen) {
      focusCheckInterval = setInterval(maintainFocus, 500);
    }

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('mousedown', handleMouseDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('mousedown', handleMouseDown, true);
      if (focusCheckInterval) {
        clearInterval(focusCheckInterval);
      }
    };
  }, [navigateToPage, isFullscreen]);

  const handleRefresh = () => {
    const report = embedRef.current as pbi.Report | null;
    if (report) {
      report.refresh().catch(() => {
        // Refresh errors are non-fatal
      });
    } else {
      reload();
    }
  };

  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
      const report = embedRef.current as pbi.Report | null;
      if (!report || !workspaceId || !reportId) {
        showExportStatus('Report not ready');
        return;
      }

      const pathResponse = await window.electronAPI.export.choosePdfPath();
      if (!pathResponse.success) {
        if (pathResponse.error.code === 'CANCELLED') {
          showExportStatus('Export cancelled');
          return;
        }
        showExportStatus(pathResponse.error.message || 'Export cancelled');
        return;
      }

      const filePath = pathResponse.data.path;

      const isExportFeatureUnavailable = (message?: string) => {
        if (!message) return false;
        const lower = message.toLowerCase();
        return lower.includes('featurenotavailable') || lower.includes('feature not available') || lower.includes('404');
      };

      let pageName: string | undefined;
      try {
        const reportPages = await report.getPages();
        pageName = reportPages.find((p: pbi.Page) => p.isActive)?.name;
      } catch (error) {
        console.warn('[ReportViewer] Page name fetch for export failed:', error);
      }

      let bookmarkState: string | undefined;
      try {
        const captured = await report.bookmarksManager.capture({ personalizeVisuals: true });
        bookmarkState = captured?.state;
      } catch (error) {
        console.warn('[ReportViewer] Bookmark capture for export failed:', error);
      }

      const apiResponse = await window.electronAPI.content.exportReportToPdf(
        reportId,
        workspaceId,
        pageName,
        bookmarkState,
        filePath
      );

      if (apiResponse.success) {
        showExportStatus('Exported to PDF');
        return;
      }

      if (apiResponse.error.code === 'CANCELLED') {
        showExportStatus('Export cancelled');
        return;
      }

      const apiErrorMessage = apiResponse.error.message || 'Export failed';
      if (!isExportFeatureUnavailable(apiErrorMessage)) {
        showExportStatus(apiErrorMessage);
        return;
      }

      // Fallback: capture the embed area and crop off panes/tabs
      let hidPanes = false;
      try {
        await report.updateSettings({
          panes: {
            filters: { visible: false, expanded: false },
            pageNavigation: { visible: false },
          },
          navContentPaneEnabled: false,
        });
        hidPanes = true;
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.warn('[ReportViewer] Settings update for export failed:', error);
      }

      const rect = embedContainerRef.current?.getBoundingClientRect();
      const bounds = rect && rect.width > 0 && rect.height > 0
        ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
        : undefined;

      const fallbackResponse = await window.electronAPI.export.currentViewToPdf({
        bounds,
        insets: { right: 40, bottom: 40 },
        filePath,
      });

      if (fallbackResponse.success) {
        showExportStatus('Exported to PDF');
      } else if (fallbackResponse.error.code === 'CANCELLED') {
        showExportStatus('Export cancelled');
      } else {
        showExportStatus(fallbackResponse.error.message || 'Export failed');
      }

      if (hidPanes) {
        try {
          await report.updateSettings({
            panes: {
              filters: { visible: true, expanded: false },
              pageNavigation: { visible: true },
            },
            navContentPaneEnabled: true,
          });
        } catch (error) {
          console.warn('[ReportViewer] Settings restore after export failed:', error);
        }
      }
    } catch (err) {
      showExportStatus(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFullScreen = () => {
    // Use our own fullscreen implementation instead of Power BI's SDK fullscreen()
    // This keeps our app in control and allows keyboard event handling
    if (embedContainerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        embedContainerRef.current.requestFullscreen();
      }
    }
  };

  const handleBack = () => {
    navigate('/');
  };

  const handleSlideshow = () => {
    if (workspaceId && reportId) {
      navigate(`/presentation/${workspaceId}/${reportId}`);
    }
  };

  // Format last refresh time as date and time (MM/DD/YY HH:mm)
  const formatDateTime = (isoString: string): string => {
    const date = new Date(isoString);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day}/${year} ${hours}:${minutes}`;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="h-12 bg-neutral-background-2 border-b border-neutral-stroke-2 flex items-center px-4 gap-4">
        <Button
          appearance="subtle"
          icon={<ArrowLeftRegular />}
          onClick={handleBack}
        >
          Back
        </Button>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {lastDataRefresh && (
            <Text className="text-neutral-foreground-3 text-sm mr-2">
              Data refreshed: {formatDateTime(lastDataRefresh)}
            </Text>
          )}
          {exportStatus && (
            <Text className="text-neutral-foreground-3 text-sm mr-2">
              {exportStatus}
            </Text>
          )}
          <Button
            appearance="subtle"
            icon={<ArrowSyncRegular />}
            onClick={handleRefresh}
            title="Refresh report data"
          >
            Refresh
          </Button>
          <Button
            appearance="subtle"
            icon={<ArrowDownloadRegular />}
            onClick={handleExportPdf}
            title="Export current view to PDF"
            disabled={isExporting}
          >
            {isExporting ? 'Exporting...' : 'Export PDF'}
          </Button>
          <Button
            appearance="subtle"
            icon={<PlayRegular />}
            onClick={handleSlideshow}
            title="Start slideshow presentation"
          >
            Slideshow
          </Button>
          <Button
            appearance="subtle"
            icon={<FullScreenMaximizeRegular />}
            onClick={handleFullScreen}
            title="Enter full screen mode"
          >
            Full Screen
          </Button>
        </div>
      </div>

      {/* Embed container */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-background-1 z-10">
            <div className="text-center">
              <Spinner size="large" />
              <Text className="mt-4 text-neutral-foreground-2 block">
                Loading report...
              </Text>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-background-1 z-10">
            <div className="text-center max-w-md">
              <Text className="text-status-error block mb-4">{error}</Text>
              <Button appearance="primary" onClick={reload}>
                Try again
              </Button>
            </div>
          </div>
        )}

        {/* Fullscreen keyboard hint - shows for 5 seconds when entering fullscreen */}
        {isFullscreen && pages.length > 1 && showFullscreenHint && (
          <div className="absolute bottom-4 left-4 bg-black/70 text-white px-3 py-2 rounded-md text-sm z-20 pointer-events-none animate-fade-in">
            <div className="flex items-center gap-2">
              <span>← → Arrow keys to navigate pages</span>
              <span className="text-white/60">({currentPageIndex + 1}/{pages.length})</span>
            </div>
          </div>
        )}

        <div
          ref={embedContainerRef}
          className={`w-full h-full outline-none ${isLoading || error ? 'invisible' : 'visible'}`}
          tabIndex={0}
        />
      </div>
    </div>
  );
};

export default ReportViewer;
