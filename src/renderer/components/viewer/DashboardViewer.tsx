import React, { useEffect, useRef, useState } from 'react';
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
import type { IPCResponse, EmbedToken, Dashboard } from '../../../shared/types';

// Create a single instance of the Power BI service
const powerbiService = new pbi.service.Service(
  pbi.factories.hpmFactory,
  pbi.factories.wpmpFactory,
  pbi.factories.routerFactory
);

export const DashboardViewer: React.FC = () => {
  const { workspaceId, dashboardId } = useParams<{ workspaceId: string; dashboardId: string }>();
  const navigate = useNavigate();

  const embedContainerRef = useRef<HTMLDivElement>(null);
  const dashboardRef = useRef<pbi.Dashboard | null>(null);
  const isLoadingRef = useRef(false);
  const tokenExpirationRef = useRef<string | null>(null);
  const tokenRefreshInProgressRef = useRef(false);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardName, setDashboardName] = useState<string>('Dashboard');
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const exportTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    if (!workspaceId || !dashboardId || tokenRefreshInProgressRef.current) return;
    tokenRefreshInProgressRef.current = true;
    try {
      const tokenResponse = await window.electronAPI.content.getEmbedToken(
        dashboardId,
        workspaceId
      ) as IPCResponse<EmbedToken>;

      if (!tokenResponse.success || !tokenResponse.data) {
        throw new Error(tokenResponse.error?.message || 'Failed to refresh access token');
      }

      tokenExpirationRef.current = tokenResponse.data.expiration;
      isLoadingRef.current = false;
      loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Session expired. Please log in again.');
      setIsLoading(false);
    } finally {
      tokenRefreshInProgressRef.current = false;
    }
  };

  // Fetch dashboard details to get the name
  useEffect(() => {
    if (!workspaceId || !dashboardId) return;

    const loadDashboardDetails = async () => {
      const response = await window.electronAPI.content.getDashboard(
        workspaceId,
        dashboardId
      ) as IPCResponse<Dashboard>;
      if (response.success && response.data) {
        setDashboardName(response.data.name);
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

  useEffect(() => {
    if (!workspaceId || !dashboardId) {
      setError('Invalid dashboard parameters');
      setIsLoading(false);
      return;
    }

    if (isLoadingRef.current) {
      return;
    }

    loadDashboard();

    return () => {
      if (embedContainerRef.current) {
        powerbiService.reset(embedContainerRef.current);
      }
      dashboardRef.current = null;
      isLoadingRef.current = false;
    };
  }, [workspaceId, dashboardId]);

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
  }, [workspaceId, dashboardId]);

  const loadDashboard = async () => {
    if (!embedContainerRef.current || !workspaceId || !dashboardId) return;

    if (isLoadingRef.current) {
      return;
    }
    isLoadingRef.current = true;

    setIsLoading(true);
    setError(null);

    try {
      powerbiService.reset(embedContainerRef.current);

      const tokenResponse = await window.electronAPI.content.getEmbedToken(
        dashboardId,
        workspaceId
      ) as IPCResponse<EmbedToken>;

      if (!tokenResponse.success || !tokenResponse.data) {
        throw new Error(tokenResponse.error?.message || 'Failed to get embed token');
      }

      const token = tokenResponse.data.token;
      tokenExpirationRef.current = tokenResponse.data.expiration;

      const embedConfig: pbi.IDashboardEmbedConfiguration = {
        type: 'dashboard',
        id: dashboardId,
        embedUrl: `https://app.powerbi.com/dashboardEmbed?dashboardId=${dashboardId}&groupId=${workspaceId}`,
        accessToken: token,
        tokenType: pbi.models.TokenType.Aad,
        pageView: 'fitToWidth',
      };

      const dashboard = powerbiService.embed(
        embedContainerRef.current,
        embedConfig
      ) as pbi.Dashboard;

      dashboardRef.current = dashboard;

      dashboard.on('loaded', () => {
        setIsLoading(false);
      });

      dashboard.on('error', (event) => {
        const errorDetail = event?.detail;
        console.error('[DashboardViewer] Dashboard error:', errorDetail);
        if (isTokenExpiredError(errorDetail)) {
          refreshEmbedToken();
          return;
        }
        setError('Failed to load dashboard. Please try again.');
        setIsLoading(false);
      });

      dashboard.on('tileClicked', (event) => {
        const tileEvent = event.detail as { reportEmbedUrl?: string; reportId?: string };
        if (tileEvent.reportId) {
          navigate(`/report/${workspaceId}/${tileEvent.reportId}`);
        }
      });

    } catch (err) {
      console.error('[DashboardViewer] Failed to load dashboard:', err);
      setError(String(err));
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  };

  const handleRefresh = () => {
    isLoadingRef.current = false;
    loadDashboard();
  };

  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
      const pathResponse = await window.electronAPI.export.choosePdfPath() as IPCResponse<{ path: string }>;
      if (!pathResponse.success || !pathResponse.data?.path) {
        if (pathResponse.error?.code === 'CANCELLED') {
          showExportStatus('Export cancelled');
          return;
        }
        showExportStatus(pathResponse.error?.message || 'Export cancelled');
        return;
      }

      const rect = embedContainerRef.current?.getBoundingClientRect();
      const bounds = rect && rect.width > 0 && rect.height > 0
        ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
        : undefined;
      const response = await window.electronAPI.export.currentViewToPdf({
        bounds,
        filePath: pathResponse.data.path,
      }) as IPCResponse<{ path: string }>;
      if (response.success) {
        showExportStatus('Exported to PDF');
      } else if (response.error?.code === 'CANCELLED') {
        showExportStatus('Export cancelled');
      } else {
        showExportStatus(response.error?.message || 'Export failed');
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
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-background-1 z-10">
            <div className="text-center max-w-md">
              <Text className="text-status-error block mb-4">{error}</Text>
              <Button appearance="primary" onClick={handleRefresh}>
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
