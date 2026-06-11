import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spinner, Button, Text } from '@fluentui/react-components';
import * as pbi from 'powerbi-client';
import { usePowerBIEmbed } from '../../hooks/usePowerBIEmbed';
import { useContentStore } from '../../stores/content-store';
import { isNotFoundError } from '../../../shared/powerbi-errors';
import { ViewerToolbar } from './ViewerToolbar';
import { useViewerExport } from './useViewerExport';
import { useLiveFreshness } from '../../hooks/useLiveFreshness';
import { reportIssue } from '../../lib/report-issue';

export const DashboardViewer: React.FC = () => {
  const { workspaceId, dashboardId } = useParams<{ workspaceId: string; dashboardId: string }>();
  const navigate = useNavigate();

  const embedContainerRef = useRef<HTMLDivElement>(null);

  const [dashboardName, setDashboardName] = useState<string>('Dashboard');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [lastLoadAt, setLastLoadAt] = useState<number | null>(null);

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

  const { datasetRefreshTime, dataflowRefreshTime, newDataAvailable } = useLiveFreshness(
    useCallback(async () => {
      if (!dashboardId || !workspaceId) return null;
      const r = await window.electronAPI.content.getDataFreshness(workspaceId, [], dashboardId);
      if (!r.success) return null;
      return {
        datasetRefreshTime: r.data.datasetRefreshTime,
        dataflowRefreshTime: r.data.dataflowRefreshTime,
      };
    }, [dashboardId, workspaceId]),
    lastLoadAt,
  );

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

  const events = useMemo(
    () => ({
      tileClicked: (event: pbi.service.ICustomEvent<unknown>) => {
        const tileEvent = event.detail as { reportEmbedUrl?: string; reportId?: string };
        if (tileEvent.reportId) {
          navigate(`/report/${workspaceId}/${tileEvent.reportId}`);
        }
      },
      error: (event: pbi.service.ICustomEvent<unknown>) => {
        if (dashboardId && isNotFoundError(event?.detail)) {
          useContentStore.getState().evictDeadItem(dashboardId);
        }
      },
      loaded: () => {
        setLastLoadAt(Date.now());
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

  const { isExporting, exportStatus, handleExportPdf } = useViewerExport({
    containerRef: embedContainerRef,
  });

  const refreshingRef = useRef(false);
  const [justRefreshedAt, setJustRefreshedAt] = useState<number | null>(null);
  useEffect(() => {
    if (!refreshingRef.current) return;
    if (isLoading) return;
    refreshingRef.current = false;
    setIsRefreshing(false);
    setJustRefreshedAt(Date.now());
  }, [isLoading]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    refreshingRef.current = true;
    reload();
  }, [reload]);

  const handleFullScreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
    } else if (embedContainerRef.current?.requestFullscreen) {
      void embedContainerRef.current.requestFullscreen();
    }
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  void embedRef;

  useEffect(() => {
    if (error) reportIssue({ code: 'DASHBOARD_EMBED_ERROR', itemName: dashboardName, context: error });
  }, [error, dashboardName]);

  return (
    <div className="h-full flex flex-col">
      {}
      <h1 className="sr-only">Dashboard: {dashboardName}</h1>

      {}
      <ViewerToolbar
        onBack={handleBack}
        itemName={dashboardName}
        lastDataRefresh={datasetRefreshTime}
        dataflowRefresh={dataflowRefreshTime}
        freshnessLabel="Oldest data"
        showRelativeAge
        showFreshness
        justRefreshedAt={justRefreshedAt}
        newDataAvailable={newDataAvailable}
        exportStatus={exportStatus}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        onExportPdf={() => void handleExportPdf(embedRef)}
        isExporting={isExporting}
        onFullScreen={handleFullScreen}
      />

      {}
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
