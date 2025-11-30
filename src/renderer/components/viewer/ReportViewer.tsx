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

      // Handle error event
      report.on('error', () => {
        setError('Failed to load report. Please try again.');
        setIsLoading(false);
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
