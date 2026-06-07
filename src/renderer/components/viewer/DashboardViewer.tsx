import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spinner, Button, Text, Breadcrumb, BreadcrumbItem } from '@fluentui/react-components';
import {
  ArrowLeftRegular,
  ArrowSyncRegular,
  ArrowDownloadRegular,
  FullScreenMaximizeRegular,
  HomeRegular,
} from '@fluentui/react-icons';
import * as pbi from 'powerbi-client';
import { usePowerBIEmbed } from '../../hooks/usePowerBIEmbed';

export const DashboardViewer: React.FC = () => {
  const { workspaceId, dashboardId } = useParams<{ workspaceId: string; dashboardId: string }>();
  const navigate = useNavigate();

  const embedContainerRef = useRef<HTMLDivElement>(null);

  const [dashboardName, setDashboardName] = useState<string>('Dashboard');
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const exportTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch dashboard details to get the name
  useEffect(() => {
    if (!workspaceId || !dashboardId) return;

    const loadDashboardDetails = async () => {
      try {
        const response = await window.electronAPI.content.getDashboard(
          workspaceId,
          dashboardId
        );
        if (response.success) {
          setDashboardName(response.data.name);
        }
      } catch (error) {
        console.warn('[DashboardViewer] Failed to load dashboard details:', error);
      }
    };
    loadDashboardDetails();
  }, [workspaceId, dashboardId]);

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

  // Build embed configuration. Dashboards use fitToWidth and no extra panes.
  const buildConfig = useCallback(
    (token: string): pbi.IDashboardEmbedConfiguration => ({
      type: 'dashboard',
      id: dashboardId,
      embedUrl: `https://app.powerbi.com/dashboardEmbed?dashboardId=${dashboardId}&groupId=${workspaceId}`,
      accessToken: token,
      tokenType: pbi.models.TokenType.Aad,
      pageView: 'fitToWidth',
    }),
    [workspaceId, dashboardId]
  );

  // Event handlers — tile-click drill-through into the underlying report.
  const events = useMemo(
    () => ({
      tileClicked: (event: pbi.service.ICustomEvent<unknown>) => {
        const tileEvent = event.detail as { reportEmbedUrl?: string; reportId?: string };
        if (tileEvent.reportId) {
          navigate(`/report/${workspaceId}/${tileEvent.reportId}`);
        }
      },
    }),
    [navigate, workspaceId]
  );

  const {
    isLoading,
    error,
    embedRef,
    reload,
  } = usePowerBIEmbed({
    workspaceId,
    itemId: dashboardId,
    containerRef: embedContainerRef,
    buildConfig,
    events,
    // Dashboards have no auto-refresh in the legacy code path.
    autoRefreshEnabled: false,
    errorFallback: 'Failed to load dashboard. Please try again.',
    // Legacy DashboardViewer surfaced post-load errors too.
    surfacePostLoadErrors: true,
  });

  const handleRefresh = () => {
    reload();
  };

  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
      const pathResponse = await window.electronAPI.export.choosePdfPath();
      if (!pathResponse.success) {
        if (pathResponse.error.code === 'CANCELLED') {
          showExportStatus('Export cancelled');
          return;
        }
        showExportStatus(pathResponse.error.message || 'Export cancelled');
        return;
      }

      const rect = embedContainerRef.current?.getBoundingClientRect();
      // HiDPI: multiply width/height (NOT x/y) by devicePixelRatio so the main
      // process captures at native pixel resolution instead of 96-DPI CSS pixels.
      // Offsets stay in CSS pixels because capturePage's rect origin is CSS-px;
      // only the size needs to scale up to land a sharper PDF on Retina/4K.
      const dpr = window.devicePixelRatio || 1;
      const bounds = rect && rect.width > 0 && rect.height > 0
        ? { x: rect.left, y: rect.top, width: rect.width * dpr, height: rect.height * dpr }
        : undefined;
      const response = await window.electronAPI.export.currentViewToPdf({
        bounds,
        filePath: pathResponse.data.path,
      });
      if (response.success) {
        showExportStatus('Exported to PDF');
      } else if (response.error.code === 'CANCELLED') {
        showExportStatus('Export cancelled');
      } else {
        showExportStatus(response.error.message || 'Export failed');
      }
    } catch (err) {
      showExportStatus(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFullScreen = () => {
    if (embedContainerRef.current) {
      if (embedContainerRef.current.requestFullscreen) {
        embedContainerRef.current.requestFullscreen();
      }
    }
  };

  const handleBack = () => {
    navigate('/');
  };

  // Silence unused-var noise from embedRef while still exposing it for future
  // dashboard-specific calls (e.g. dashboard.fullscreen()).
  void embedRef;

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

        <div className="h-6 w-px bg-neutral-stroke-2" />

        <Breadcrumb aria-label="Breadcrumb">
          <BreadcrumbItem>
            <Button appearance="subtle" icon={<HomeRegular />} onClick={handleBack}>
              Home
            </Button>
          </BreadcrumbItem>
          <BreadcrumbItem>
            <Text>{dashboardName}</Text>
          </BreadcrumbItem>
        </Breadcrumb>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {exportStatus && (
            <Text className="text-neutral-foreground-3 text-sm mr-2">
              {exportStatus}
            </Text>
          )}
          <Button
            appearance="subtle"
            icon={<ArrowSyncRegular />}
            onClick={handleRefresh}
            title="Refresh"
            aria-label="Refresh dashboard"
          />
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
            icon={<FullScreenMaximizeRegular />}
            onClick={handleFullScreen}
            title="Full screen"
            aria-label="Full screen"
          />
        </div>
      </div>

      {/* Embed container */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-background-1 z-10">
            <div className="text-center">
              <Spinner size="large" />
              <Text className="mt-4 text-neutral-foreground-2 block">
                Loading dashboard...
              </Text>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
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

        <div
          ref={embedContainerRef}
          className={`w-full h-full ${isLoading || error ? 'invisible' : 'visible'}`}
        />
      </div>
    </div>
  );
};

export default DashboardViewer;
