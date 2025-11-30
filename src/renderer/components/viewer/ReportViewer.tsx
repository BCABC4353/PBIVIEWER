import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spinner, Button, Text } from '@fluentui/react-components';
import {
  ArrowLeftRegular,
  ArrowSyncRegular,
  FullScreenMaximizeRegular,
  PlayRegular,
} from '@fluentui/react-icons';
import * as pbi from 'powerbi-client';
import type { IPCResponse, EmbedToken, AppSettings, Report, DatasetRefreshInfo } from '../../../shared/types';

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
  const datasetIdRef = useRef<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await window.electronAPI.settings.get() as IPCResponse<AppSettings>;
        if (response.success && response.data) {
          setAutoRefreshEnabled(response.data.autoRefreshEnabled);
          setAutoRefreshIntervalMinutes(response.data.autoRefreshInterval);
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
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

  // Auto-refresh based on settings - only when visible
  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const refreshIntervalId = setInterval(() => {
      // Only refresh if document is visible (not in background tab)
      if (reportRef.current && !isLoading && !error && document.visibilityState === 'visible') {
        reportRef.current.refresh().catch((err) => {
          // Some visuals (like FlowVisual) may throw authorization errors
          // during refresh - these are non-fatal and the report still works
          console.warn('[ReportViewer] Auto-refresh warning (non-fatal):', err?.message || err);
        });
      }
    }, autoRefreshIntervalMinutes * 60 * 1000); // Convert minutes to milliseconds

    return () => {
      clearInterval(refreshIntervalId);
    };
  }, [isLoading, error, autoRefreshEnabled, autoRefreshIntervalMinutes]);

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
        // Fetch dataset refresh info after report loads
        if (datasetIdRef.current) {
          try {
            const refreshResponse = await window.electronAPI.content.getDatasetRefreshInfo(
              datasetIdRef.current
            ) as IPCResponse<DatasetRefreshInfo>;
            if (refreshResponse.success && refreshResponse.data?.lastRefreshTime) {
              setLastDataRefresh(refreshResponse.data.lastRefreshTime);
            }
          } catch {
            // Silently ignore - some datasets may not have refresh info
          }
        }
      });

      // Handle error event
      report.on('error', (event) => {
        console.error('[ReportViewer] Report error:', event);
        setError('Failed to load report. Please try again.');
        setIsLoading(false);
      });

    } catch (err) {
      console.error('[ReportViewer] Failed to load report:', err);
      setError(String(err));
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  };

  const handleRefresh = () => {
    if (reportRef.current) {
      reportRef.current.refresh().catch((err) => {
        // Some visuals (like FlowVisual) may throw authorization errors
        // during refresh - these are non-fatal and the report still works
        console.warn('[ReportViewer] Refresh warning (non-fatal):', err?.message || err);
      });
    } else {
      isLoadingRef.current = false; // Allow reload
      loadReport();
    }
  };

  const handleFullScreen = () => {
    if (reportRef.current) {
      reportRef.current.fullscreen();
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

  // Format last refresh time as relative time
  const formatRelativeTime = (isoString: string): string => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
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

        {lastDataRefresh && (
          <Text className="text-neutral-foreground-3 text-sm">
            Data refreshed: {formatRelativeTime(lastDataRefresh)}
          </Text>
        )}

        <div className="flex items-center gap-2">
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

        <div
          ref={embedContainerRef}
          className="w-full h-full"
          style={{ visibility: isLoading || error ? 'hidden' : 'visible' }}
        />
      </div>
    </div>
  );
};

export default ReportViewer;
