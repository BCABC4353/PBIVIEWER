import React, { useEffect, useRef, useState, useCallback } from 'react';
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
import type { IPCResponse, EmbedToken, AppSettings, Report, DatasetRefreshInfo } from '../../../shared/types';

interface PageInfo {
  name: string;
  displayName: string;
}

// Create a single instance of the Power BI service
const powerbiService = new pbi.service.Service(
  pbi.factories.hpmFactory,
  pbi.factories.wpmpFactory,
  pbi.factories.routerFactory
);

export const ReportViewer: React.FC = () => {
  const { workspaceId, reportId } = useParams<{ workspaceId: string; reportId: string }>();
  const navigate = useNavigate();

  const embedContainerRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<pbi.Report | null>(null);
  const isLoadingRef = useRef(false); // Prevent double-loading in Strict Mode

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [autoRefreshIntervalMinutes, setAutoRefreshIntervalMinutes] = useState(1);
  const [lastDataRefresh, setLastDataRefresh] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const datasetIdRef = useRef<string | null>(null);
  const tokenExpirationRef = useRef<string | null>(null);
  const tokenRefreshInProgressRef = useRef(false);
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
        const response = await window.electronAPI.settings.get() as IPCResponse<AppSettings>;
        if (response.success && response.data) {
          setAutoRefreshEnabled(response.data.autoRefreshEnabled);
          setAutoRefreshIntervalMinutes(response.data.autoRefreshInterval);
        }
      } catch {
        // Settings load failure is non-critical, use defaults
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    if (!workspaceId || !reportId) {
      setError('Invalid report parameters');
      setIsLoading(false);
      return;
    }

    // Prevent double-loading in React Strict Mode
    if (isLoadingRef.current) {
      return;
    }

    loadReport();

    return () => {
      // Cleanup: reset the container to allow fresh embed
      if (embedContainerRef.current) {
        powerbiService.reset(embedContainerRef.current);
      }
      reportRef.current = null;
      isLoadingRef.current = false;
    };
  }, [workspaceId, reportId]);

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

  const getErrorMessage = (detail: unknown): string => {
    if (!detail) return '';
    if (typeof detail === 'string') return detail;
    if (detail instanceof Error) return detail.message;
    if (typeof detail === 'object') {
      const anyDetail = detail as Record<string, unknown>;
      const nestedError = anyDetail.error as Record<string, unknown> | undefined;
      return String(
        anyDetail.message ??
          anyDetail.detailedMessage ??
          nestedError?.message ??
          nestedError?.code ??
          anyDetail.errorCode ??
          ''
      );
    }
    return '';
  };

  const isTokenExpiredError = (detail: unknown): boolean => {
    const message = getErrorMessage(detail).toLowerCase();
    return (
      message.includes('tokenexpired') ||
      message.includes('token expired') ||
      message.includes('accesstokenexpired') ||
      message.includes('invalidauthenticationtoken')
    );
  };

  const isTokenExpiringSoon = () => {
    if (!tokenExpirationRef.current) return false;
    const expiration = new Date(tokenExpirationRef.current).getTime();
    return Number.isFinite(expiration) && Date.now() >= expiration - 2 * 60 * 1000;
  };

  const refreshEmbedToken = async () => {
    if (!workspaceId || !reportId || tokenRefreshInProgressRef.current) return;
    tokenRefreshInProgressRef.current = true;
    try {
      const tokenResponse = await window.electronAPI.content.getEmbedToken(
        reportId,
        workspaceId
      ) as IPCResponse<EmbedToken>;

      if (!tokenResponse.success || !tokenResponse.data) {
        throw new Error(tokenResponse.error?.message || 'Failed to refresh access token');
      }

      tokenExpirationRef.current = tokenResponse.data.expiration;
      const token = tokenResponse.data.token;

      if (reportRef.current) {
        await reportRef.current.setAccessToken(token);
        await reportRef.current.refresh();
      } else {
        isLoadingRef.current = false;
        loadReport();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Session expired. Please log in again.');
      setIsLoading(false);
    } finally {
      tokenRefreshInProgressRef.current = false;
    }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isTokenExpiringSoon()) {
        refreshEmbedToken();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [workspaceId, reportId]);

  // Auto-refresh based on settings - only when visible
  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const refreshIntervalId = setInterval(() => {
      // Only refresh if document is visible (not in background tab)
      if (reportRef.current && !isLoading && !error && document.visibilityState === 'visible') {
        reportRef.current.refresh().catch(() => {
          // Auto-refresh errors are non-fatal (some visuals may throw authorization errors)
        });
      }
    }, autoRefreshIntervalMinutes * 60 * 1000); // Convert minutes to milliseconds

    return () => {
      clearInterval(refreshIntervalId);
    };
  }, [isLoading, error, autoRefreshEnabled, autoRefreshIntervalMinutes]);

  // Navigate to a specific page by index
  const navigateToPage = useCallback(async (pageIndex: number) => {
    if (!reportRef.current || pagesRef.current.length === 0) return;

    const targetIndex = Math.max(0, Math.min(pageIndex, pagesRef.current.length - 1));
    const targetPage = pagesRef.current[targetIndex];

    if (targetPage) {
      try {
        await reportRef.current.setPage(targetPage.name);
        setCurrentPageIndex(targetIndex);
      } catch {
        // Page navigation errors are non-fatal
      }
    }
  }, []);

  // Fullscreen change detection
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNowFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isNowFullscreen);

      if (isNowFullscreen) {
        // Focus the container when entering fullscreen to receive keyboard events
        if (embedContainerRef.current) {
          embedContainerRef.current.focus();
        }

        // Show hint for 5 seconds when entering fullscreen
        if (pages.length > 1) {
          setShowFullscreenHint(true);
          setTimeout(() => setShowFullscreenHint(false), 5000);
        }
      } else {
        setShowFullscreenHint(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [pages.length]);

  // Keyboard navigation for fullscreen mode
  // Use capture phase to intercept events before the iframe consumes them
  useEffect(() => {
    let focusCheckInterval: NodeJS.Timeout | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle navigation when in fullscreen
      if (!document.fullscreenElement) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        // CRITICAL: Stop event propagation BEFORE anything else
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const currentPages = pagesRef.current;
        const currentIdx = currentPageIndexRef.current;

        if (currentPages.length === 0) return;

        if (e.key === 'ArrowRight') {
          // Next page (wrap around)
          const nextIndex = (currentIdx + 1) % currentPages.length;
          navigateToPage(nextIndex);
        } else if (e.key === 'ArrowLeft') {
          // Previous page (wrap around)
          const prevIndex = (currentIdx - 1 + currentPages.length) % currentPages.length;
          navigateToPage(prevIndex);
        }

        // Re-focus the container to prevent iframe from receiving future events
        if (embedContainerRef.current) {
          embedContainerRef.current.focus();
        }
      }
    };

    // Prevent iframe from stealing focus on mouse clicks in fullscreen
    const handleMouseDown = (e: MouseEvent) => {
      if (!document.fullscreenElement) return;

      // If clicking inside the embed container, allow the click but refocus after
      if (embedContainerRef.current?.contains(e.target as Node)) {
        // Use multiple timeouts to ensure we regain focus
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

    // When in fullscreen, periodically check and reclaim focus if needed
    // This prevents the iframe from permanently stealing keyboard control
    const maintainFocus = () => {
      if (document.fullscreenElement && embedContainerRef.current) {
        const activeElement = document.activeElement;
        // If focus is not on our container, reclaim it
        if (activeElement !== embedContainerRef.current) {
          embedContainerRef.current.focus();
        }
      }
    };

    // Start focus monitoring when in fullscreen
    if (isFullscreen) {
      focusCheckInterval = setInterval(maintainFocus, 200);
    }

    // Use capture phase to intercept events before they reach the iframe
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

  const loadReport = async () => {
    if (!embedContainerRef.current || !workspaceId || !reportId) return;

    // Prevent double-loading
    if (isLoadingRef.current) {
      return;
    }
    isLoadingRef.current = true;

    setIsLoading(true);
    setError(null);

    try {
      // Reset any existing embed first
      powerbiService.reset(embedContainerRef.current);

      // Fetch report details to get datasetId
      const reportsResponse = await window.electronAPI.content.getReports(workspaceId) as IPCResponse<Report[]>;
      if (reportsResponse.success && reportsResponse.data) {
        const reportData = reportsResponse.data.find(r => r.id === reportId);
        if (reportData?.datasetId) {
          datasetIdRef.current = reportData.datasetId;
        }
      }

      // Get embed token
      const tokenResponse = await window.electronAPI.content.getEmbedToken(
        reportId,
        workspaceId
      ) as IPCResponse<EmbedToken>;

      if (!tokenResponse.success || !tokenResponse.data) {
        throw new Error(tokenResponse.error?.message || 'Failed to get embed token');
      }

      const token = tokenResponse.data.token;
      tokenExpirationRef.current = tokenResponse.data.expiration;

      // Configure embed settings
      const embedConfig: pbi.IReportEmbedConfiguration = {
        type: 'report',
        id: reportId,
        embedUrl: `https://app.powerbi.com/reportEmbed?reportId=${reportId}&groupId=${workspaceId}`,
        accessToken: token,
        tokenType: pbi.models.TokenType.Aad, // Using AAD token for user-owns-data
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
      };

      // Embed the report
      const report = powerbiService.embed(
        embedContainerRef.current,
        embedConfig
      ) as pbi.Report;

      reportRef.current = report;

      // Handle loaded event
      report.on('loaded', async () => {
        setIsLoading(false);

        // Fetch pages for keyboard navigation in fullscreen
        try {
          const reportPages = await report.getPages();
          const visiblePages = reportPages.filter((p: pbi.Page) => p.visibility !== 1); // Filter hidden pages
          const pageInfos: PageInfo[] = visiblePages.map((p: pbi.Page) => ({
            name: p.name,
            displayName: p.displayName,
          }));
          setPages(pageInfos);

          // Get current active page index
          const activePage = reportPages.find((p: pbi.Page) => p.isActive);
          if (activePage) {
            const activeIndex = pageInfos.findIndex((p) => p.name === activePage.name);
            if (activeIndex >= 0) {
              setCurrentPageIndex(activeIndex);
            }
          }
        } catch {
          // Page fetch failure is non-critical
        }

        // Fetch dataset refresh info after report loads
        if (datasetIdRef.current && workspaceId) {
          try {
            const refreshResponse = await window.electronAPI.content.getDatasetRefreshInfo(
              datasetIdRef.current,
              workspaceId
            ) as IPCResponse<DatasetRefreshInfo>;
            if (refreshResponse.success && refreshResponse.data?.lastRefreshTime) {
              setLastDataRefresh(refreshResponse.data.lastRefreshTime);
            }
          } catch {
            // Dataset refresh info fetch failure is non-critical
          }
        }
      });

      // Handle error event - log details but don't show error UI for non-fatal errors
      report.on('error', (event) => {
        const errorDetail = event?.detail;
        console.error('[ReportViewer] Power BI Error:', errorDetail);

        if (isTokenExpiredError(errorDetail)) {
          refreshEmbedToken();
          return;
        }

        // Don't show error UI - let Power BI handle errors internally
        // Most errors during navigation/drillthrough are recoverable
      });

      // Track page changes to keep keyboard navigation in sync
      report.on('pageChanged', async (event) => {
        console.log('[ReportViewer] DEBUG - Page Changed:', event?.detail);

        // Update current page index when user navigates via tabs or other means
        try {
          const currentPages = await report.getPages();
          const activePage = currentPages.find((p: pbi.Page) => p.isActive);
          if (activePage && pagesRef.current.length > 0) {
            const activeIndex = pagesRef.current.findIndex((p) => p.name === activePage.name);
            if (activeIndex >= 0) {
              setCurrentPageIndex(activeIndex);
            }
          }
        } catch {
          // Page tracking failure is non-critical
        }
      });

      report.on('dataSelected', (event) => {
        console.log('[ReportViewer] DEBUG - Data Selected:', event?.detail);
      });

      report.on('rendered', () => {
        console.log('[ReportViewer] DEBUG - Report Rendered');
      });

      report.on('commandTriggered', (event) => {
        console.log('[ReportViewer] DEBUG - Command Triggered:', event?.detail);
      });

      report.on('swipeStart', (event) => {
        console.log('[ReportViewer] DEBUG - Swipe Start:', event?.detail);
      });

      report.on('swipeEnd', (event) => {
        console.log('[ReportViewer] DEBUG - Swipe End:', event?.detail);
      });

      report.on('buttonClicked', (event) => {
        console.log('[ReportViewer] DEBUG - Button Clicked:', event?.detail);
      });

      report.on('filtersApplied', (event) => {
        console.log('[ReportViewer] DEBUG - Filters Applied:', event?.detail);
      });

      report.on('visualClicked', (event) => {
        console.log('[ReportViewer] DEBUG - Visual Clicked:', event?.detail);
      });

      report.on('visualRendered', (event) => {
        console.log('[ReportViewer] DEBUG - Visual Rendered:', event?.detail);
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  };

  const handleRefresh = () => {
    if (reportRef.current) {
      reportRef.current.refresh().catch(() => {
        // Refresh errors are non-fatal
      });
    } else {
      isLoadingRef.current = false; // Allow reload
      loadReport();
    }
  };

  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
      if (!reportRef.current || !workspaceId || !reportId) {
        showExportStatus('Report not ready');
        return;
      }

      const pathResponse = await window.electronAPI.export.choosePdfPath() as IPCResponse<{ path: string }>;
      if (!pathResponse.success || !pathResponse.data?.path) {
        if (pathResponse.error?.code === 'CANCELLED') {
          showExportStatus('Export cancelled');
          return;
        }
        showExportStatus(pathResponse.error?.message || 'Export cancelled');
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
        const reportPages = await reportRef.current.getPages();
        pageName = reportPages.find((p: pbi.Page) => p.isActive)?.name;
      } catch {
        // Page name is optional for export
      }

      let bookmarkState: string | undefined;
      try {
        const captured = await reportRef.current.bookmarksManager.capture({ personalizeVisuals: true });
        bookmarkState = captured?.state;
      } catch {
        // Bookmark capture is optional for export
      }

      const apiResponse = await window.electronAPI.content.exportReportToPdf(
        reportId,
        workspaceId,
        pageName,
        bookmarkState,
        filePath
      ) as IPCResponse<{ path: string }>;

      if (apiResponse.success) {
        showExportStatus('Exported to PDF');
        return;
      }

      if (apiResponse.error?.code === 'CANCELLED') {
        showExportStatus('Export cancelled');
        return;
      }

      const apiErrorMessage = apiResponse.error?.message || 'Export failed';
      if (!isExportFeatureUnavailable(apiErrorMessage)) {
        showExportStatus(apiErrorMessage);
        return;
      }

      // Fallback: capture the embed area and crop off panes/tabs
      let previousSettings: pbi.ISettings | null = null;
      try {
        previousSettings = await reportRef.current.getSettings();
        await reportRef.current.updateSettings({
          panes: {
            filters: { visible: false, expanded: false },
            pageNavigation: { visible: false },
          },
          navContentPaneEnabled: false,
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch {
        // Proceed with fallback capture even if settings update fails
      }

      const rect = embedContainerRef.current?.getBoundingClientRect();
      const bounds = rect && rect.width > 0 && rect.height > 0
        ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
        : undefined;

      const fallbackResponse = await window.electronAPI.export.currentViewToPdf({
        bounds,
        insets: { right: 40, bottom: 40 },
        filePath,
      }) as IPCResponse<{ path: string }>;

      if (fallbackResponse.success) {
        showExportStatus('Exported to PDF');
      } else if (fallbackResponse.error?.code === 'CANCELLED') {
        showExportStatus('Export cancelled');
      } else {
        showExportStatus(fallbackResponse.error?.message || 'Export failed');
      }

      if (previousSettings) {
        try {
          await reportRef.current.updateSettings(previousSettings);
        } catch {
          // Ignore restore errors
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
              <Button appearance="primary" onClick={handleRefresh}>
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
