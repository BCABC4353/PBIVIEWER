import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spinner, Button, Text } from '@fluentui/react-components';
import * as pbi from 'powerbi-client';
import { usePowerBIEmbed } from '../../hooks/usePowerBIEmbed';
import { useContentStore } from '../../stores/content-store';
import { isNotFoundError } from '../../../shared/powerbi-errors';
import { ViewerToolbar } from './ViewerToolbar';
import { useViewerExport } from './useViewerExport';

export const DashboardViewer: React.FC = () => {
  const { workspaceId, dashboardId } = useParams<{ workspaceId: string; dashboardId: string }>();
  const navigate = useNavigate();

  const embedContainerRef = useRef<HTMLDivElement>(null);

  const [dashboardName, setDashboardName] = useState<string>('Dashboard');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // PROD-S9: data-freshness indicator.
  // ReportViewer drives this off the report's single backing datasetId. A Power
  // BI dashboard, however, aggregates tiles from potentially MANY datasets, so
  // there is no single authoritative "last refreshed" timestamp — and the
  // dashboard metadata endpoint (getDashboard) does not expose any datasetId at
  // all. Rather than show a wrong/misleading timestamp from an arbitrarily
  // chosen tile, we degrade gracefully: the freshness query only runs when a
  // representative datasetId becomes available (datasetIdRef stays null for
  // dashboards today, so the indicator simply stays hidden). The plumbing is
  // kept identical to ReportViewer so a future tiles->dataset linkage can light
  // it up by populating datasetIdRef without touching the loaded handler.
  const [lastDataRefresh, setLastDataRefresh] = useState<string | null>(null);
  const datasetIdRef = useRef<string | null>(null);

  // Fetch dashboard details to get the name (also drives UX-S14 breadcrumb)
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

  // Build embed configuration.
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
      // NEW-PROD-5: detect not-found/404 errors and evict the dead item from
      // in-memory recent/frequent lists so the home page stops showing the tile.
      error: (event: pbi.service.ICustomEvent<unknown>) => {
        if (dashboardId && isNotFoundError(event?.detail)) {
          useContentStore.getState().evictDeadItem(dashboardId);
        }
      },
      // PROD-S9: after the dashboard loads, populate the data-freshness
      // indicator IF (and only if) a representative datasetId is available.
      // Dashboards aggregate many datasets, so datasetIdRef is null today and
      // this is effectively a no-op — the indicator stays hidden rather than
      // showing a misleading timestamp. Treat an empty/absent lastRefreshTime
      // (getDatasetRefreshInfo returns {} when there's no refresh history) as
      // "no indicator", not a blank value.
      loaded: async () => {
        if (!datasetIdRef.current || !workspaceId) return;
        try {
          const refreshResponse = await window.electronAPI.content.getDatasetRefreshInfo(
            datasetIdRef.current,
            workspaceId
          );
          if (refreshResponse.success && refreshResponse.data?.lastRefreshTime) {
            setLastDataRefresh(refreshResponse.data.lastRefreshTime);
          }
        } catch (error) {
          console.warn('[DashboardViewer] Dataset refresh info unavailable:', error);
        }
      },
    }),
    [navigate, workspaceId, dashboardId]
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
    autoRefreshEnabled: false,
    errorFallback: 'Failed to load dashboard. Please try again.',
    surfacePostLoadErrors: true,
  });

  // NEW-ARCH-1: export hook (screenshot-only; no API export for dashboards)
  const { isExporting, exportStatus, handleExportPdf } = useViewerExport({
    containerRef: embedContainerRef,
  });

  // NEW-UX-3: refresh with in-progress state.
  // reload() is synchronous (it just bumps a nonce), so we cannot clear
  // isRefreshing in a finally block — React would batch both state updates
  // in the same tick, making isRefreshing never visibly true. Instead we
  // keep isRefreshing=true until usePowerBIEmbed's isLoading drops back to
  // false, which happens after the embed fires its 'loaded' event.
  // refreshingRef gates the effect so a background initial load doesn't
  // clear the flag before the user has clicked Refresh.
  const refreshingRef = useRef(false);
  useEffect(() => {
    if (!refreshingRef.current) return;
    if (isLoading) return; // still loading — wait for it to finish
    // isLoading has settled to false — the reload cycle completed.
    refreshingRef.current = false;
    setIsRefreshing(false);
  }, [isLoading]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    refreshingRef.current = true;
    reload();
  }, [reload]);

  const handleFullScreen = () => {
    if (embedContainerRef.current) {
      if (embedContainerRef.current.requestFullscreen) {
        embedContainerRef.current.requestFullscreen();
      }
    }
  };

  // PROD-S8 style: back navigates to home for dashboard (no history drill-through UX)
  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  // Silence unused-var noise from embedRef while still exposing it for future
  // dashboard-specific calls (e.g. dashboard.fullscreen()).
  void embedRef;

  return (
    <div className="h-full flex flex-col">
      {/* A11Y-S7: sr-only heading for screen readers */}
      <h1 className="sr-only">Dashboard: {dashboardName}</h1>

      {/* UX-B4: shared toolbar */}
      <ViewerToolbar
        onBack={handleBack}
        itemName={dashboardName}
        lastDataRefresh={lastDataRefresh}
        exportStatus={exportStatus}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        onExportPdf={() => void handleExportPdf(embedRef)}
        isExporting={isExporting}
        onFullScreen={handleFullScreen}
      />

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
