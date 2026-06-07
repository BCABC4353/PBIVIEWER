import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spinner, Button, Text } from '@fluentui/react-components';
import * as pbi from 'powerbi-client';
import { usePowerBIEmbed } from '../../hooks/usePowerBIEmbed';
import { useSettingsStore } from '../../stores/settings-store';
import { useContentStore } from '../../stores/content-store';
import { isNotFoundError } from '../../../shared/powerbi-errors';
import { ViewerToolbar } from './ViewerToolbar';
import { useViewerExport } from './useViewerExport';

interface PageInfo {
  name: string;
  displayName: string;
}

export const ReportViewer: React.FC = () => {
  const { workspaceId, reportId } = useParams<{ workspaceId: string; reportId: string }>();
  const navigate = useNavigate();

  const embedContainerRef = useRef<HTMLDivElement>(null);

  // Subscribe to the settings store so changes made in SettingsPage while
  // this viewer is open take effect without a remount. Selectors return
  // primitives so we re-render only when the relevant fields change.
  const autoRefreshEnabled = useSettingsStore((s) => s.settings.autoRefreshEnabled);
  const autoRefreshIntervalMinutes = useSettingsStore((s) => s.settings.autoRefreshInterval);

  const [lastDataRefresh, setLastDataRefresh] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const datasetIdRef = useRef<string | null>(null);

  // UX-S14: report name visible while loading (breadcrumb)
  const [reportName, setReportName] = useState<string>('');

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

  // Defensive bootstrap: ensure the settings store has fetched once.
  useEffect(() => {
    void useSettingsStore.getState().loadSettings();
  }, []);

  // Fetch report metadata (datasetId + name) — used by the loaded handler.
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
          // UX-S14: capture name so breadcrumb is visible while loading
          if (reportData?.name) {
            setReportName(reportData.name);
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

  // Event handlers passed to the hook.
  const events = useMemo(
    () => ({
      // NEW-PROD-5: detect not-found/404 errors and evict the dead item from
      // in-memory recent/frequent lists so the home page stops showing the tile.
      error: (event: pbi.service.ICustomEvent<unknown>) => {
        if (reportId && isNotFoundError(event?.detail)) {
          useContentStore.getState().evictDeadItem(reportId);
        }
      },
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
    // embedRef is a stable MutableRefObject — omitting it from deps is intentional.
    // workspaceId is read inside loaded; include it for correctness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    surfacePostLoadErrors: false,
  });

  // NEW-ARCH-1: export hook
  const { isExporting, exportStatus, handleExportPdf } = useViewerExport({
    containerRef: embedContainerRef,
    reportExportIds:
      workspaceId && reportId ? { reportId, workspaceId } : undefined,
    getReportMeta: async (eRef) => {
      const report = eRef.current as pbi.Report | null;
      if (!report || !workspaceId || !reportId) return undefined;

      let pageName: string | undefined;
      try {
        const reportPages = await report.getPages();
        pageName = reportPages.find((p: pbi.Page) => p.isActive)?.name;
      } catch (err) {
        console.warn('[ReportViewer] Page name fetch for export failed:', err);
      }

      let bookmarkState: string | undefined;
      try {
        const captured = await report.bookmarksManager.capture({ personalizeVisuals: true });
        bookmarkState = captured?.state;
      } catch (err) {
        console.warn('[ReportViewer] Bookmark capture for export failed:', err);
      }

      return { pageName, bookmarkState };
    },
  });

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
    let hintTimer: ReturnType<typeof setTimeout> | null = null;
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
  useEffect(() => {
    let focusCheckInterval: ReturnType<typeof setInterval> | null = null;

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

    // Reclaim focus ONLY when it was genuinely lost to the body
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

  // NEW-UX-3: Refresh with in-progress state
  const handleRefresh = useCallback(async () => {
    const report = embedRef.current as pbi.Report | null;
    setIsRefreshing(true);
    try {
      if (report) {
        await report.refresh().catch(() => {
          // Refresh errors are non-fatal
        });
      } else {
        reload();
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [embedRef, reload]);

  const handleFullScreen = () => {
    if (embedContainerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        embedContainerRef.current.requestFullscreen();
      }
    }
  };

  // PROD-S8: back uses navigate(-1) with a history-length fallback
  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  const handleSlideshow = () => {
    if (workspaceId && reportId) {
      navigate(`/presentation/${workspaceId}/${reportId}`);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* A11Y-S7: sr-only heading for screen readers */}
      <h1 className="sr-only">
        {reportName ? `Report: ${reportName}` : 'Report Viewer'}
      </h1>

      {/* UX-B4: shared toolbar */}
      <ViewerToolbar
        onBack={handleBack}
        itemName={reportName || undefined}
        lastDataRefresh={lastDataRefresh}
        exportStatus={exportStatus}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        onExportPdf={() => void handleExportPdf(embedRef)}
        isExporting={isExporting}
        onSlideshow={handleSlideshow}
        onFullScreen={handleFullScreen}
      />

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
          <div
            role="alert"
            aria-live="assertive"
            className="absolute inset-0 flex items-center justify-center bg-neutral-background-1 z-10"
          >
            <div className="text-center max-w-md">
              <Text className="text-status-error block mb-4">{error}</Text>
              <Button appearance="primary" onClick={reload}>
                Try again
              </Button>
            </div>
          </div>
        )}

        {/* Fullscreen keyboard hint */}
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
