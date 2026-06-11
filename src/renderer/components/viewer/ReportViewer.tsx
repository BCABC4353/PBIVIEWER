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
import { reportIssue } from '../../lib/report-issue';

export const ReportViewer: React.FC = () => {
  const { workspaceId, reportId } = useParams<{ workspaceId: string; reportId: string }>();
  const navigate = useNavigate();

  const embedContainerRef = useRef<HTMLDivElement>(null);

  const autoRefreshEnabled = useSettingsStore((s) => s.settings.autoRefreshEnabled);

  const [lastLoadAt, setLastLoadAt] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [justRefreshedAt, setJustRefreshedAt] = useState<number | null>(null);
  const datasetIdRef = useRef<string | null>(null);

  const [reportName, setReportName] = useState<string>('');

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

  useEffect(() => {
    void useSettingsStore.getState().loadSettings();
  }, []);

  useEffect(() => {
    if (!workspaceId || !reportId) return;
    datasetIdRef.current = null;
    let cancelled = false;
    (async () => {
      try {
        const reportsResponse = await window.electronAPI.content.getReports(workspaceId);
        if (cancelled) return;
        if (reportsResponse.success && reportsResponse.data) {
          const reportData = reportsResponse.data.find((r) => r.id === reportId);
          if (reportData?.datasetId) {
            datasetIdRef.current = reportData.datasetId;
            setLastLoadAt(Date.now());
          }
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

  const events = useMemo(
    () => ({
      error: (event: pbi.service.ICustomEvent<unknown>) => {
        if (reportId && isNotFoundError(event?.detail)) {
          useContentStore.getState().evictDeadItem(reportId);
        }
      },
      loaded: async () => {
        const report = embedRef.current as pbi.Report | null;
        if (!report) return;

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

        setLastLoadAt(Date.now());
      },
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspaceId, reportId]
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
    autoRefreshEnabled: false,
    errorFallback:
      'This report could not be loaded. You may not have access, or it may have been removed.',
    surfacePostLoadErrors: false,
  });

  setEmbedRef(embedRef);

  useEffect(() => {
    if (error) reportIssue({ code: 'REPORT_EMBED_ERROR', itemName: reportName || undefined, context: error });
  }, [error, reportName]);

  useEffect(() => {
    if (!autoRefreshEnabled || !newDataAvailable) return;
    if (isLoading) return;
    const report = embedRef.current as pbi.Report | null;
    if (!report) return;
    void report
      .refresh()
      .then(() => {
        const now = Date.now();
        setLastLoadAt(now);
        setJustRefreshedAt(now);
      })
      .catch(() => {
      });
  }, [autoRefreshEnabled, newDataAvailable, isLoading, embedRef]);

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

  const handleRefresh = useCallback(async () => {
    const report = embedRef.current as pbi.Report | null;
    setIsRefreshing(true);
    try {
      if (report) {
        await report.refresh();
        const now = Date.now();
        setLastLoadAt(now);
        setJustRefreshedAt(now);
      } else {
        reload();
      }
    } catch {
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
      {}
      <h1 className="sr-only">
        {reportName ? `Report: ${reportName}` : 'Report Viewer'}
      </h1>

      {}
      <ViewerToolbar
        onBack={handleBack}
        itemName={reportName || undefined}
        lastDataRefresh={datasetRefreshTime}
        dataflowRefresh={dataflowRefreshTime}
        showRelativeAge
        showFreshness
        justRefreshedAt={justRefreshedAt}
        newDataAvailable={autoRefreshEnabled ? false : newDataAvailable}
        exportStatus={exportStatus}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        onExportPdf={() => void handleExportPdf(embedRef)}
        isExporting={isExporting}
        onSlideshow={handleSlideshow}
        onFullScreen={handleFullScreen}
      />

      {}
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

        {}
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
