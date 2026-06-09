import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spinner, Button, Text } from '@fluentui/react-components';
import * as pbi from 'powerbi-client';
import { usePowerBIEmbed } from '../../hooks/usePowerBIEmbed';
import { useFullscreenPageNav } from '../../hooks/embed/useFullscreenPageNav';
import type { PageInfo } from '../../hooks/embed/useFullscreenPageNav';
import { useSettingsStore } from '../../stores/settings-store';
import { useContentStore } from '../../stores/content-store';
import { isNotFoundError } from '../../../shared/powerbi-errors';
import { ViewerToolbar } from './ViewerToolbar';
import { useViewerExport } from './useViewerExport';
import { useLiveFreshness } from '../../hooks/useLiveFreshness';

export const ReportViewer: React.FC = () => {
  const { workspaceId, reportId } = useParams<{ workspaceId: string; reportId: string }>();
  const navigate = useNavigate();

  const embedContainerRef = useRef<HTMLDivElement>(null);

  // Subscribe to the settings store so changes made in SettingsPage while
  // this viewer is open take effect without a remount. Selectors return
  // primitives so we re-render only when the relevant fields change.
  // "Auto-refresh reports" is now DATA-DRIVEN: a report re-refreshes the moment
  // the freshness poll detects a new dataset refresh (no blind interval, no lag,
  // no redundant pulls). The interval setting no longer applies to reports — only
  // the on/off toggle does.
  const autoRefreshEnabled = useSettingsStore((s) => s.settings.autoRefreshEnabled);

  const [lastLoadAt, setLastLoadAt] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const datasetIdRef = useRef<string | null>(null);

  // UX-S14: report name visible while loading (breadcrumb)
  const [reportName, setReportName] = useState<string>('');

  // ARCH-S8: fullscreen page navigation (pages, current index, fullscreen flag,
  // arrow-key nav + slicer-click focus reclamation) lives in useFullscreenPageNav.
  // The embed handle is wired in lazily via setEmbedRef after usePowerBIEmbed.
  const {
    pages,
    setPages,
    currentPageIndex,
    setCurrentPageIndex,
    isFullscreen,
    showFullscreenHint,
    pagesRef,
    setEmbedRef,
  } = useFullscreenPageNav({ containerRef: embedContainerRef });

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

  // Live dataset + upstream-dataflow freshness for this report's single dataset.
  const { datasetRefreshTime, dataflowRefreshTime, newDataAvailable } = useLiveFreshness(
    useCallback(async () => {
      if (!datasetIdRef.current || !workspaceId) return null;
      const r = await window.electronAPI.content.getDataFreshness(workspaceId, [datasetIdRef.current]);
      if (!r.success) return null;
      return {
        datasetRefreshTime: r.data.datasetRefreshTime,
        dataflowRefreshTime: r.data.dataflowRefreshTime,
      };
    }, [workspaceId]),
    lastLoadAt,
  );

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

        // Mark when the on-screen content (re)loaded so the freshness hook can
        // tell whether a later dataset refresh has left the visuals behind.
        setLastLoadAt(Date.now());
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
    // Blind interval auto-refresh is OFF; we refresh data-driven instead (below).
    autoRefreshEnabled: false,
    errorFallback:
      'This report could not be loaded. You may not have access, or it may have been removed.',
    surfacePostLoadErrors: false,
  });

  // ARCH-S8: thread the live embed handle into the fullscreen-nav hook. The
  // `events` object above is built before embedRef exists (forward reference);
  // embedRef has stable identity, so wiring it in here is safe.
  setEmbedRef(embedRef);

  // Data-driven auto-refresh: when the freshness poll sees a dataset refresh
  // newer than what's on screen, re-pull the report IN PLACE. report.refresh()
  // preserves the current page/filters/slicers (a data refresh, not a reload), so
  // this is invisible-and-current — replacing the old blind interval timer. Gated
  // on the "Auto-refresh reports" toggle; when off, the toolbar's "New data" nudge
  // lets the user refresh manually instead.
  useEffect(() => {
    if (!autoRefreshEnabled || !newDataAvailable) return;
    const report = embedRef.current as pbi.Report | null;
    if (!report) return;
    void report.refresh().catch(() => {
      /* non-fatal; the manual Refresh button remains */
    });
    setLastLoadAt(Date.now()); // screen now reflects the latest refresh
  }, [autoRefreshEnabled, newDataAvailable, embedRef]);

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
        lastDataRefresh={datasetRefreshTime}
        dataflowRefresh={dataflowRefreshTime}
        showRelativeAge
        newDataAvailable={autoRefreshEnabled ? false : newDataAvailable}
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
